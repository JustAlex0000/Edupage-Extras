const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gridFixture, syncFixture } = require("./helpers/timetable-fixture.js");

test("blank weekdays preserve the geometric dates of later lesson rows", () => {
  const { api } = syncFixture({ days: [0, 2, 3, 4] });
  const parsed = api.parseWeeklyTimetable();
  assert.equal(parsed.lessons[3].title, "Day 2 lesson 1");
  assert.equal(parsed.lessons[3].date, "2026-10-21");
  assert.equal(parsed.lessons[3].dayIndex, 2);
  assert.equal(parsed.lessons[6].date, "2026-10-22");
});

test("sparse and completely empty weeks retain their valid headers and reach readiness", async () => {
  for (const options of [{ days: [0], periods: 2 }, { days: [] }]) {
    const { api } = syncFixture(options);
    const parsed = await api.waitForTimetableReady(2000);
    assert.equal(parsed.dayHeaders.length, 5);
    assert.equal(parsed.lessons.length, options.days.length ? 2 : 0);
  }
});

test("readiness waits for lessons that arrive after a temporary empty render", async () => {
  const { state, api } = syncFixture({ days: [] });
  const started = state.now;
  state.onDelay = () => { if (state.now - started >= 250) state.grid = gridFixture({ days: [0] }); };
  const parsed = await api.waitForTimetableReady(2000);
  assert.equal(parsed.lessons.length, 3);
  assert.ok(state.now - started >= 750);
});

test("week navigation can enter and leave a holiday week", async () => {
  const { state, api } = syncFixture();
  state.next = [gridFixture({ start: "2026-10-26", days: [] }), gridFixture({ start: "2026-11-02" })];
  await api.clickWeekNavigator(1);
  assert.equal((await api.waitForTimetableReady()).lessons.length, 0);
  await api.clickWeekNavigator(1);
  assert.equal((await api.waitForTimetableReady()).dayHeaders[0].date, "2026-11-02");
});

test("multiweek extraction includes a holiday week and continues afterward", async () => {
  const { state } = syncFixture();
  state.next = [gridFixture({ start: "2026-10-26", days: [] }), gridFixture({ start: "2026-11-02" })];
  const response = await new Promise(resolve => state.listener({ type: "ee-extract-timetable-week-series", count: 3 }, {}, resolve));
  assert.equal(response.ok, true);
  assert.equal(response.data.weeks.length, 3);
  assert.equal(response.data.weeks[1].lessons.length, 0);
  assert.equal(response.data.weeks[2].dayHeaders[0].date, "2026-11-02");
});

test("My timetable waits for a selection taking longer than one second", async () => {
  const { state, api } = syncFixture({ owner: "Other class" });
  let selectedAt;
  state.onOwnClick = () => { selectedAt = state.now; };
  state.onDelay = () => { if (selectedAt && state.now - selectedAt >= 1500) state.grid = gridFixture(); };
  const parsed = await api.selectOwnTimetable();
  assert.equal(parsed.classLabel, "Student Example");
  assert.equal(state.clicks, 1);
  assert.ok(state.now - selectedAt >= 2000);
});

test("failed own-timetable selection rejects instead of returning the previous class", async () => {
  const { state, api } = syncFixture({ owner: "Other class" });
  await assert.rejects(api.selectOwnTimetable(), /did not finish selecting My timetable/);
  assert.equal(state.clicks, 1);
});

test("changing only the old grid's owner title does not prove completed selection", async () => {
  const { state, api } = syncFixture({ owner: "Other class" });
  const previous = state.grid;
  state.onOwnClick = () => {
    const own = gridFixture();
    previous.querySelector = own.querySelector;
  };
  await assert.rejects(api.selectOwnTimetable(), /did not finish selecting My timetable/);
  assert.equal(state.grid, previous);
});

test("already-own timetable remains usable without triggering another native load", async () => {
  const { state, api } = syncFixture();
  assert.equal((await api.selectOwnTimetable()).classLabel, "Student Example");
  assert.equal(state.clicks, 0);
});

test("missing native own identity fails closed and later owner changes abort extraction", async () => {
  const missing = syncFixture();
  missing.state.ownName = "";
  await assert.rejects(missing.api.selectOwnTimetable(), /verify the native My timetable identity/);
  const { state } = syncFixture();
  state.next = [gridFixture({ start: "2026-10-26", owner: "Other class" })];
  const response = await new Promise(resolve => state.listener({ type: "ee-extract-timetable-week-series", count: 2 }, {}, resolve));
  assert.equal(response.ok, false);
  assert.match(response.error, /did not select My timetable/);
});
