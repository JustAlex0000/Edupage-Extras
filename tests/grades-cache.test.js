const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const context = {
    console, AbortController, setTimeout, clearTimeout, URLSearchParams,
    document: { documentElement: { dataset: {} } },
    location: { origin: "https://synthetic.edupage.org" },
  };
  context.window = context;
  context.top = context;
  for (const file of ["lib/ee-common.js", "grades-enhancer.js", "grades-debug.js", "grades-attendance.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../scripts", file), "utf8"), context);
  }
  const GE = context.__eeGrades;
  GE.state.gradesView = { selectedYear: 2026, halfKey: "1", signature: "2026:1" };
  GE.storageSet = async () => {};
  GE.storageGet = async () => ({});
  const stats = (ownerId) => ({
    version: 16, ownerId, viewSignature: "2026:1", fetchedAt: Date.now(),
    cacheDate: vm.runInNewContext("EE.formatDate(new Date())", context), subjects: [{ displayName: ownerId, absent: 5, total: 100 }],
  });
  return { context, GE, stats };
}

function attendancePage(owners) {
  const payload = { order: owners, students: Object.fromEntries(owners.map(id => [id, {}])) };
  return `/dashboard/dochadzka.js#initZiak; function fixture(){ return f(null,null,${JSON.stringify(payload)}); }`;
}

test("attendance verifies the current owner before reusing memory or storage", async () => {
  const { context, GE, stats } = setup();
  const first = stats("student-a"), second = stats("student-b");
  let cache = GE.attendance.updateAttendanceCache({}, context.location.origin, first);
  cache = GE.attendance.updateAttendanceCache(cache, context.location.origin, second);
  GE.state.attendanceStatsCache = first;
  GE.storageGet = async () => ({ eeGradesAttendanceStatsCache: cache });
  const requests = [];
  context.fetch = async (url) => {
    requests.push(url);
    assert.equal(url, "/dashboard/eb.php?mode=attendance");
    return { ok: true, text: async () => attendancePage(["student-b"]) };
  };
  const result = await GE.attendance.loadBaseSubjectAttendanceStats();
  assert.equal(result.ownerId, "student-b");
  assert.equal(result.subjects[0].displayName, "student-b");
  assert.equal(requests.length, 1);
});

test("another student's cache never satisfies a cache miss", async () => {
  const { context, GE, stats } = setup();
  const first = stats("student-a");
  const cache = GE.attendance.updateAttendanceCache({}, context.location.origin, first);
  GE.storageGet = async () => ({ eeGradesAttendanceStatsCache: cache });
  GE.state.attendanceStatsCache = first;
  const requests = [];
  context.fetch = async (url) => {
    requests.push(url);
    if (url.includes("mode=ttday")) throw new Error("fresh classbook requested");
    return { ok: true, text: async () => attendancePage(["student-b"]) };
  };
  await assert.rejects(GE.attendance.loadBaseSubjectAttendanceStats(), /fresh classbook requested/);
  assert.equal(requests.length, 2);
  assert.equal(GE.state.attendanceStatsCache, null);
});

test("ambiguous attendance ownership rejects caches instead of guessing", async () => {
  const { context, GE, stats } = setup();
  GE.state.attendanceStatsCache = stats("student-a");
  context.fetch = async () => ({ ok: true, text: async () => attendancePage(["student-a", "student-b"]) });
  await assert.rejects(GE.attendance.loadBaseSubjectAttendanceStats(), /owner could not be verified/);
});

test("legacy ownerless entries are pruned and unknown owners cannot be persisted", () => {
  const { GE, stats } = setup();
  const ownerless = { ...stats("student-a"), version: 15 };
  delete ownerless.ownerId;
  const cache = { school: { "2026:1": ownerless } };
  assert.equal(Object.keys(GE.attendance.pruneAttendanceCache(cache)).length, 0);
  assert.equal(Object.keys(GE.attendance.updateAttendanceCache({}, "school", ownerless)).length, 0);
});

test("changing grade context aborts pending attendance reads and prevents completion", async () => {
  const { context, GE } = setup();
  let signal;
  context.fetch = async (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  };
  const pending = GE.attendance.loadBaseSubjectAttendanceStats();
  GE.attendance.resetForGradesView();
  await assert.rejects(pending, /aborted/);
  assert.equal(signal.aborted, true);
  assert.equal(GE.state.attendanceStatsCache, null);
});

test("attendance fetch times out and removes its timer after success", async () => {
  const { context, GE } = setup();
  const timers = new Map();
  context.setTimeout = (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; };
  context.clearTimeout = id => timers.delete(id);
  context.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
  });
  const pending = GE.attendance.fetchText("/synthetic");
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 20000);
  timer.callback();
  await assert.rejects(pending, /timed out/);
  assert.equal(timers.size, 0);
  context.fetch = async () => ({ ok: true, text: async () => "synthetic" });
  assert.equal(await GE.attendance.fetchText("/synthetic"), "synthetic");
  assert.equal(timers.size, 0);
});


test("attendance date overrides cannot reuse a different period window", async () => {
  const { context, GE, stats } = setup();
  const cache = GE.attendance.updateAttendanceCache({}, context.location.origin, stats("student-a"));
  GE.storageGet = async () => ({ eeGradesAttendanceStatsCache: cache });
  GE.state.halfyearStartOverride = "2027-03-01";
  GE.attendance.resetForGradesView();
  context.fetch = async url => {
    if (url.includes("mode=ttday")) throw new Error("fresh window requested");
    return { ok: true, text: async () => attendancePage(["student-a"]) };
  };
  await assert.rejects(GE.attendance.loadBaseSubjectAttendanceStats(), /fresh window requested/);
  GE.state.halfyearEndOverride = "2027-06-01";
  assert.equal(GE.attendance.currentGradesViewSignature(), '["2026:1","2027-03-01","2027-06-01"]');
});

test("failed cache reads are misses rather than blocking attendance loading", async () => {
  const { context, GE } = setup();
  GE.storageGet = async () => { throw new Error("storage unavailable"); };
  context.fetch = async url => {
    if (url.includes("mode=ttday")) throw new Error("fresh data requested");
    return { ok: true, text: async () => attendancePage(["student-a"]) };
  };
  await assert.rejects(GE.attendance.loadBaseSubjectAttendanceStats(), /fresh data requested/);
});

function fullAttendanceSetup() {
  const result = setup();
  const { context, GE } = result;
  context.Date = class extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-10-22T12:00:00"])); }
    static now() { return new Date("2026-10-22T12:00:00").getTime(); }
  };
  const dates = {};
  for (let day = 1; day <= 25; day++) {
    dates[`2026-09-${String(day).padStart(2, "0")}`] = { plan: [{ type: "lesson", subjectid: "42", period: "1-5" }] };
  }
  const data = { dates, dbi: { subjects: { 42: { name: "Synthetic subject", short: "SYN" } } } };
  const attendance = '/dashboard/dochadzka.js#initZiak; function fixture(){ return f(null,null,{"order":["student-a"],"students":{"student-a":{}},"info":{"year_turnover":"2026-09-01"}}); }';
  const ttday = 'DashboardClassbook;gpid=1&gsh=synthetic; classbook.fill("student-a",{"dates":{},"dbi":{"subjects":{"42":{"name":"Synthetic subject"}}}}); classbook.render("2026-10-22");';
  context.fetch = async url => ({
    ok: true,
    text: async () => url.includes("mode=attendance") ? attendance : url.includes("mode=ttday")
      ? ttday : `classbook.fill("student-a",${JSON.stringify(data)});`,
  });
  GE.storageGet = async () => ({});
  return result;
}

test("successful fresh attendance remains available when cache persistence fails", async () => {
  const { GE } = fullAttendanceSetup();
  let writes = 0;
  GE.storageSet = async () => { writes++; throw new Error("synthetic quota failure"); };
  const result = await GE.attendance.loadBaseSubjectAttendanceStats();
  assert.equal(result.attendanceSummary.total, 125);
  assert.equal(result.ownerId, "student-a");
  assert.equal(writes, 1);
});

test("reset during the storage snapshot prevents persisting or returning canceled data", async () => {
  const { GE } = fullAttendanceSetup();
  let release;
  let notify;
  let reads = 0;
  let writes = 0;
  const waiting = new Promise(resolve => { notify = resolve; });
  GE.storageGet = async () => {
    if (++reads === 1) return {};
    notify();
    return new Promise(resolve => { release = resolve; });
  };
  GE.storageSet = async () => { writes++; };
  const pending = GE.attendance.loadBaseSubjectAttendanceStats();
  await waiting;
  GE.attendance.resetForGradesView();
  release({});
  await assert.rejects(pending, /canceled/);
  assert.equal(writes, 0);
  assert.equal(GE.state.attendanceStatsCache, null);
});

test("reset during a cache read cannot persist its stale pruning snapshot", async () => {
  const { context, GE, stats } = setup();
  const oldSnapshot = {
    [context.location.origin]: { "2026:1": { ...stats("student-a"), version: 15 } },
  };
  const newerSnapshot = GE.attendance.updateAttendanceCache({}, context.location.origin, stats("student-b"));
  let release;
  let notify;
  let writes = 0;
  let persisted = oldSnapshot;
  const waiting = new Promise(resolve => { notify = resolve; });
  GE.storageGet = async () => {
    notify();
    return new Promise(resolve => { release = resolve; });
  };
  GE.storageSet = async values => { writes++; persisted = values.eeGradesAttendanceStatsCache; };
  context.fetch = async () => ({ ok: true, text: async () => attendancePage(["student-a"]) });
  const pending = GE.attendance.loadBaseSubjectAttendanceStats();
  await waiting;
  GE.attendance.resetForGradesView();
  persisted = newerSnapshot;
  release({ eeGradesAttendanceStatsCache: oldSnapshot });
  await assert.rejects(pending, /canceled/);
  assert.equal(writes, 0);
  assert.equal(persisted, newerSnapshot);
  assert.equal(GE.state.attendanceStatsCache, null);
});

test("an account change during computation rejects the result before caching", async () => {
  const { context, GE } = fullAttendanceSetup();
  const fetch = context.fetch;
  let ownerReads = 0;
  let writes = 0;
  context.fetch = async (url, options) => {
    if (url.includes("mode=attendance") && ++ownerReads === 2) {
      return { ok: true, text: async () => attendancePage(["student-b"]) };
    }
    return fetch(url, options);
  };
  GE.storageSet = async () => { writes++; };
  await assert.rejects(GE.attendance.loadBaseSubjectAttendanceStats(), /account changed/);
  assert.equal(writes, 0);
  assert.equal(GE.state.attendanceStatsCache, null);
});
