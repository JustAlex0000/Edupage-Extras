/**
 * etest-plugin-bridge-main.js
 *
 * Page-world jQuery plugin interceptor for the eTest player. EduPage's own
 * plugins follow the standard jQuery-boilerplate shape:
 *   (function ($) {
 *     $.fn.plugin = function (options) {
 *       var opts = $.extend({}, $.fn.plugin.defaults, options);
 *       ...
 *     };
 *   })(jQuery);
 * `opts` only exists inside that closure, so the only way to read it is to
 * intercept the registration itself: wrap every function assigned onto
 * $.fn, re-derive the same $.extend(defaults, options) merge the plugin
 * does internally, and publish it before calling through to the original.
 * This script cannot use chrome.* APIs (page world), so it hands the
 * captured data to etest-plugin-bridge.js (isolated world) via
 * #ee-etest-plugin-port instead — same bridge pattern as the Activity
 * Shield feature (see activity-shield-main.js/-bridge.js).
 */
(function () {
  "use strict";

  if (!/^\/elearning\//i.test(location.pathname)) return;

  const PORT_ID = "ee-etest-plugin-port";
  const EVENT_NAME = "ee-etest-plugin-opts";

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

  const port = ensurePort();
  // Page-world debug handle — DevTools' console runs in this same MAIN
  // world by default (unlike the extension's isolated-world globals, which
  // never show up there), so this is what makes `window.eePlugins.<name>.opts`
  // typeable directly in the console while poking around a live test.
  const debugStore = (window.eePlugins = window.eePlugins || {});

  function mergeOptions($, defaults, options) {
    if ($ && typeof $.extend === "function") return $.extend({}, defaults, options);
    return Object.assign({}, defaults, options || {});
  }

  function publish(name, opts, options, defaults) {
    debugStore[name] = { opts, options, defaults };

    let serialized;
    try {
      serialized = JSON.stringify(opts);
    } catch (error) {
      return; // opts holds something non-serializable (DOM node, function) — nothing we can hand across worlds.
    }
    port.dataset[`opts_${name}`] = serialized;
    port.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { name } }));
  }

  function wrapPlugin(name, fn) {
    if (typeof fn !== "function" || fn.__eeWrapped) return fn;
    const wrapped = function (options) {
      const defaults = fn.defaults || {};
      publish(name, mergeOptions(window.jQuery, defaults, options), options, defaults);
      return fn.apply(this, arguments);
    };
    wrapped.__eeWrapped = true;
    Object.assign(wrapped, fn); // keep e.g. fn.defaults reachable on the wrapper too
    return wrapped;
  }

  function patchFn($) {
    if (!$ || !$.fn || $.fn.__eePatched) return;
    let proxied;
    try {
      proxied = new Proxy($.fn, {
        set(target, prop, value) {
          target[prop] = typeof prop === "string" ? wrapPlugin(prop, value) : value;
          return true;
        },
      });
      $.fn = proxied;
      proxied.__eePatched = true;
    } catch (error) {
      // $.fn non-configurable or frozen in this jQuery build — nothing to fall back to.
    }
  }

  // jQuery (and EduPage) may reach the library through either `window.jQuery`
  // or `window.$` — hook both, since whichever one loads first is the one
  // plugin scripts will actually reference when they register.
  function hookGlobal(name) {
    let current = window[name];
    if (current) patchFn(current);
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { return current; },
        set(value) {
          current = value;
          patchFn(value);
        },
      });
    } catch (error) {
      // Already non-configurable — the immediate patchFn() above still
      // covers the case where it was assigned before this script ran.
    }
  }

  hookGlobal("jQuery");
  hookGlobal("$");
})();
