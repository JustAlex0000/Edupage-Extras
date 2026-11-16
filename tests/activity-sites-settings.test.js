const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../menu/activity-sites-settings.js'), 'utf8');

function setup({ granted = true, saved = [], saveFails = false, syncFails = false } = {}) {
  const events = {};
  const makeElement = () => ({
    textContent: '', value: '', disabled: false, children: [],
    addEventListener(name, fn) { this[name] = fn; },
    setAttribute() {}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  });
  const form = makeElement(), input = makeElement(), list = makeElement(), status = makeElement(), button = makeElement();
  form.querySelector = () => button;
  const elements = { 'ee-activity-sites-form': form, 'ee-activity-sites-input': input, 'ee-activity-sites-list': list, 'ee-activity-sites-status': status };
  const requests = [], removes = [], writes = [];
  const chrome = {
    runtime: { lastError: null, sendMessage(message, cb) { cb({ ok: !syncFails }); } },
    storage: {
      local: {
        get(_, cb) { cb({ eeActivityShieldSites: saved }); },
        set(value, cb) {
          writes.push(value.eeActivityShieldSites);
          if (saveFails) chrome.runtime.lastError = { message: 'failed' };
          else events.change?.({ eeActivityShieldSites: { newValue: value.eeActivityShieldSites } }, 'local');
          cb(); chrome.runtime.lastError = null;
        },
      },
      onChanged: { addListener(fn) { events.change = fn; } },
    },
    permissions: {
      request(value, cb) { requests.push(value.origins[0]); cb(granted); },
      remove(value, cb) { removes.push(value.origins[0]); cb(true); },
    },
  };
  vm.runInNewContext(source, { chrome, URL, document: { getElementById: (id) => elements[id], createElement: makeElement }, window: { eeI18n: { msg: (key) => key } } });
  async function submit(value) { input.value = value; form.submit({ preventDefault() {} }); await new Promise(setImmediate); }
  async function remove(index = 0) { list.children[index].children[1].click(); await new Promise(setImmediate); }
  return { submit, remove, requests, removes, writes, status, list };
}

test('grant stores one exact host pattern and regrant does not duplicate it', async () => {
  const ui = setup();
  await ui.submit('Example.com/path');
  assert.deepEqual(ui.requests, ['https://example.com/*']);
  assert.equal(JSON.stringify(ui.writes[0]), '["https://example.com/*"]');
  assert.equal(ui.status.textContent, 'samSitesAdded');
  await ui.submit('https://example.com');
  assert.equal(JSON.stringify(ui.writes[1]), '["https://example.com/*"]');
});

test('rejects invalid, port-specific, and built-in hosts before requesting permission', async () => {
  const ui = setup();
  for (const value of ['example..com', '-foo.example', 'https://user:pass@example.com', 'https://example.com:443', 'file:///tmp/a', 'https://a.edupage.org', 'https://test.nop.wtf']) await ui.submit(value);
  assert.deepEqual(ui.requests, []);
  assert.deepEqual(ui.writes, []);
});

test('permission denial and save or sync failures are visible', async () => {
  const denied = setup({ granted: false }); await denied.submit('example.org');
  assert.equal(denied.status.textContent, 'samSitesDenied'); assert.equal(denied.writes.length, 0);
  const failed = setup({ saveFails: true }); await failed.submit('example.org');
  assert.equal(failed.status.textContent, 'samSitesSaveFailed');
  const sync = setup({ syncFails: true }); await sync.submit('example.org');
  assert.equal(sync.status.textContent, 'samSitesSyncFailed');
});

test('removal updates list and releases only unshared permissions', async () => {
  const ui = setup({ saved: ['https://example.org/*', 'https://api.openai.com/*'] });
  await ui.remove();
  assert.deepEqual(ui.removes, ['https://example.org/*']);
  await ui.remove();
  assert.deepEqual(ui.removes, ['https://example.org/*']);
  assert.equal(ui.status.textContent, 'samSitesRemoved');
});
