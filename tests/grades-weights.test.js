const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function load(document = {}) {
  const context = { document };
  context.window = context;
  context.top = context;
  vm.createContext(context);
  for (const file of ["scripts/lib/ee-common.js", "scripts/grades-weights.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }
  return context.__eeGrades.weights;
}

test("weight definitions include empty categories and events without joining grades", () => {
  const { buildWeightDefinitions } = load();
  const model = buildWeightDefinitions({
    kategorie: { a: { PredmetID: 1, p_meno: "Category", p_vaha: 30 } },
    vsetkyUdalosti: { edupage: [
      { PredmetID: 1, p_meno: "Oral", p_vaha: "40" },
      { PredmetID: 2, p_meno: "Test", p_vaha: 10 },
      { PredmetID: 2, p_meno: "No contribution", p_vaha: 0 },
      { PredmetID: 2, p_meno: "Test", p_vaha: 10 },
    ] },
    vsetkyZnamky: [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(model.get("1"))), [
    { kind: "category", name: "Category", weight: 1.5 },
    { kind: "event", name: "Oral", weight: 2 },
  ]);
  assert.deepEqual(Array.from(model.get("2"), item => item.weight), [0.5, 0]);
});

test("missing and invalid weights are not invented as zero", () => {
  const { buildWeightDefinitions } = load();
  const entries = [null, "", "invalid", undefined, -20, Infinity, true]
    .map(p_vaha => ({ PredmetID: 1, p_meno: "Invalid", p_vaha }));
  entries.push({ p_meno: "Missing subject", p_vaha: 20 }, { PredmetID: 1, p_vaha: 20 });
  assert.equal(buildWeightDefinitions({ kategorie: entries }).size, 0);
  assert.equal(buildWeightDefinitions(null).size, 0);
});

test("viewer discovery uses its dynamic target and rejects other or malformed viewers", () => {
  const table = {};
  const blob = { kategorie: [{ PredmetID: 1, p_meno: 'Name with } and "', p_vaha: 50 }] };
  const script = target => ({ textContent: `$j('#${target}').znamkyStudentViewer( ${JSON.stringify(blob)});` });
  const scripts = [script("random-current"), script("old-viewer"), { textContent: ".znamkyStudentViewer(" }];
  const { readWeightDefinitions } = load({
    querySelectorAll: () => scripts,
    getElementById: id => ({ contains: candidate => id === "random-current" && candidate === table }),
  });
  assert.equal(readWeightDefinitions(table).get("1")[0].weight, 2.5);
  scripts[0].textContent = "$j('#random-current').znamkyStudentViewer({broken});";
  assert.equal(readWeightDefinitions(table).size, 0);
  scripts.length = 0;
  assert.equal(readWeightDefinitions(table).size, 0);
});

test("settings keep weight disclosure opt-in and in Grades", () => {
  const html = fs.readFileSync(path.join(root, "menu/settings.html"), "utf8");
  const settings = fs.readFileSync(path.join(root, "menu/settings.js"), "utf8");
  const index = html.indexOf('for="ee-grades-weights-checkbox"');
  assert.ok(index > html.indexOf('id="panel-grades"') && index < html.indexOf('id="panel-timetable"'));
  assert.match(settings, /gradesWeightsToggle\.checked = result\[GRADES_WEIGHTS_KEY\] === true/);
});
