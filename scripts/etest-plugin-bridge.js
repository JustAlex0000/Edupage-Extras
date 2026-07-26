/**
 * etest-plugin-bridge.js
 *
 * Isolated-world half of the eTest plugin opts bridge — reads the captured
 * jQuery plugin `opts` that etest-plugin-bridge-main.js (page world) writes
 * onto #ee-etest-plugin-port and exposes them as EE.etestPluginOpts, so
 * other isolated-world scripts loaded in this same content-script bundle
 * (e.g. etest-enhancer.js) can read a plugin's real options — including
 * EduPage's own answered/unanswered question tracking — instead of
 * re-deriving it from the DOM.
 */
(function () {
  "use strict";

  const IS_TEST = globalThis.__EE_TEST__ === true;

  const PORT_ID = "ee-etest-plugin-port";
  const EVENT_NAME = "ee-etest-plugin-opts";

  function decodePluginOpts(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  const store = (EE.etestPluginOpts = EE.etestPluginOpts || {});

  function readOptsFromPort(port, name) {
    const opts = decodePluginOpts(port.dataset[`opts_${name}`]);
    if (opts) store[name] = opts;
  }

  function ensurePort() {
    let port = document.getElementById(PORT_ID);
    if (!port) {
      port = document.createElement("span");
      port.id = PORT_ID;
      port.hidden = true;
      (document.documentElement || document.head || document.body)?.append(port);
    }
    return port;
  }

  function init() {
    if (!document.documentElement) {
      document.addEventListener("readystatechange", init, { once: true });
      return;
    }
    const port = ensurePort();
    // Pick up anything captured before this listener attached.
    Object.keys(port.dataset)
      .filter((key) => key.startsWith("opts_"))
      .forEach((key) => readOptsFromPort(port, key.slice("opts_".length)));
    port.addEventListener(EVENT_NAME, (event) => {
      const name = event.detail && event.detail.name;
      if (name) readOptsFromPort(port, name);
    });
  }

  if (IS_TEST) {
    globalThis.__eeTestExports = { decodePluginOpts };
    return;
  }

  init();
})();
