/**
 * activity-shield-main.js
 *
 * Page-world protections adapted from the reference Browser_extension.
 * This script cannot access chrome.* APIs, so activity-shield-bridge.js writes
 * the active preferences onto #ee-activity-shield-port.
 */

(function () {
  "use strict";

  let port = document.getElementById("ee-activity-shield-port");
  if (!port) {
    port = document.createElement("span");
    port.id = "ee-activity-shield-port";
    port.hidden = true;
    (document.documentElement || document.head || document.body)?.append(port);
  }

  const nativeVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  const nativeHasFocus = Document.prototype.hasFocus;
  const nativeRequestAnimationFrame = window.requestAnimationFrame;
  const nativeCancelAnimationFrame = window.cancelAnimationFrame;

  const enabled = () => port.dataset.enabled === "true";
  const active = (name) => enabled() && port.dataset[name] !== "false";
  // blockEsc/jquerySweep/fullscreenSpoof are more invasive than the other
  // toggles above (removing the eTest player's own listeners, spoofing
  // fullscreen state), so — unlike `active()` — they require an explicit
  // "true" rather than defaulting on while the bridge's storage read is
  // still in flight (dataset attribute not yet set).
  const strictActive = (name) => enabled() && port.dataset[name] === "true";

  const readNativeVisibilityState = () => {
    try {
      return nativeVisibilityState?.get?.call(document) || "visible";
    } catch (error) {
      return "visible";
    }
  };

  const readNativeHidden = () => {
    try {
      return Boolean(nativeHidden?.get?.call(document));
    } catch (error) {
      return false;
    }
  };

  const block = (event, preventDefault = true) => {
    if (preventDefault) {
      event.preventDefault();
    }
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const INTERACTIVE_SELECTOR = [
    "input",
    "textarea",
    "select",
    "option",
    "button",
    "label",
    "summary",
    "details",
    "a[href]",
    "[contenteditable]",
    "[contenteditable='true']",
    "[tabindex]",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='combobox']",
    "[role='listbox']",
    "[role='option']",
    "[role='textbox']",
  ].join(", ");

  const isInteractiveNode = (value) => {
    if (!(value instanceof Element)) return false;
    return value.matches(INTERACTIVE_SELECTOR) || Boolean(value.closest(INTERACTIVE_SELECTOR));
  };

  const shouldPreserveInteractiveEvent = (event) => {
    if (isInteractiveNode(event.target)) return true;
    if (isInteractiveNode(event.relatedTarget)) return true;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.some(isInteractiveNode);
  };

  const SHORTCUT_KEYS = new Set([
    "a",
    "c",
    "f",
    "p",
    "s",
    "v",
    "x",
    "y",
    "z",
  ]);

  const shouldBlockShortcutKeyEvent = (event) => {
    if (!(event instanceof KeyboardEvent)) return false;
    if (event.altKey) return false;
    if (!(event.ctrlKey || event.metaKey)) return false;
    if (event.repeat || event.isComposing) return false;

    const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
    return SHORTCUT_KEYS.has(key);
  };

  const debug = (...args) => {
    if (port.dataset.log === "true") {
      console.info("[Edupage Extras Activity Shield]", ...args);
    }
  };

  try {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get() {
        return active("visibilityState") ? "visible" : readNativeVisibilityState();
      },
    });
  } catch (error) {
    debug("Could not override document.visibilityState", error);
  }

  try {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get() {
        return active("hidden") ? false : readNativeHidden();
      },
    });
  } catch (error) {
    debug("Could not override document.hidden", error);
  }

  try {
    Object.defineProperty(document, "webkitVisibilityState", {
      configurable: true,
      get() {
        return document.visibilityState;
      },
    });
    Object.defineProperty(document, "webkitHidden", {
      configurable: true,
      get() {
        return document.hidden;
      },
    });
  } catch (error) {
    debug("Could not override webkit visibility aliases", error);
  }

  try {
    if (typeof nativeHasFocus === "function") {
      Document.prototype.hasFocus = new Proxy(nativeHasFocus, {
        apply(target, self, args) {
          if (active("focus")) return true;
          return Reflect.apply(target, self, args);
        },
      });
    }
  } catch (error) {
    debug("Could not wrap document.hasFocus", error);
  }

  if (window.top === window) {
    // The Navigation API (Chrome) is only used to learn the reload
    // destination for the debug log and to avoid blocking non-reload
    // unloads; the actual blocking is the plain beforeunload handler, which
    // works everywhere. Where the API is missing (Firefox), arm the blocker
    // purely off the hidden state so the toggle isn't a silent no-op.
    const navigationApi = window.navigation;
    const redirect = (event) => {
      if (navigationApi && !redirect.href) return;
      debug("Blocked hidden-page redirect to", redirect.href || "(unknown destination)");
      event.preventDefault();
      event.returnValue = "no";
    };

    if (navigationApi) {
      navigationApi.addEventListener("navigate", (event) => {
        if (event.navigationType === "reload") {
          redirect.href = event.destination.url;
        }
      });
    }

    document.addEventListener("visibilitychange", () => {
      delete redirect.href;
      removeEventListener("beforeunload", redirect);
      if (readNativeVisibilityState() === "hidden" && active("redirect")) {
        addEventListener("beforeunload", redirect);
      }
    }, true);
  }

  const onFocus = (event) => {
    if (shouldPreserveInteractiveEvent(event)) return;
    if (active("focus")) block(event);
  };

  const onBlur = (event) => {
    if (shouldPreserveInteractiveEvent(event)) return;
    if (active("blur")) block(event);
  };

  ["focus", "focusin"].forEach((name) => {
    window.addEventListener(name, onFocus, true);
    document.addEventListener(name, onFocus, true);
  });

  ["blur", "focusout"].forEach((name) => {
    window.addEventListener(name, onBlur, true);
    document.addEventListener(name, onBlur, true);
  });

  const onVisibility = (event) => {
    port.dispatchEvent(new Event("ee-activity-state"));
    if (active("visibilityEvents")) block(event);
  };

  ["visibilitychange", "webkitvisibilitychange", "pagehide"].forEach((name) => {
    window.addEventListener(name, onVisibility, true);
    document.addEventListener(name, onVisibility, true);
  });

  const onMouse = (event) => {
    if (shouldPreserveInteractiveEvent(event)) return;
    const pref = event.type.includes("leave") || event.type.includes("enter") ? "mouseleave" : "mouseout";
    if (active(pref)) block(event);
  };

  ["mouseleave", "mouseenter", "mouseout", "mouseover"].forEach((name) => {
    window.addEventListener(name, onMouse, true);
    document.addEventListener(name, onMouse, true);
  });

  ["lostpointercapture", "gotpointercapture"].forEach((name) => {
    window.addEventListener(name, (event) => {
      if (shouldPreserveInteractiveEvent(event)) return;
      if (active("pointercapture")) block(event);
    }, true);
    document.addEventListener(name, (event) => {
      if (shouldPreserveInteractiveEvent(event)) return;
      if (active("pointercapture")) block(event);
    }, true);
  });

  ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart", "drop"].forEach((name) => {
    window.addEventListener(name, (event) => {
      if (active("clipboard")) block(event, false);
    }, true);
    document.addEventListener(name, (event) => {
      if (active("clipboard")) block(event, false);
    }, true);
  });

  ["keydown", "keyup", "keypress"].forEach((name) => {
    window.addEventListener(name, (event) => {
      if (active("clipboard") && shouldBlockShortcutKeyEvent(event)) {
        block(event, false);
      }
    }, true);
    document.addEventListener(name, (event) => {
      if (active("clipboard") && shouldBlockShortcutKeyEvent(event)) {
        block(event, false);
      }
    }, true);
  });

  const onKeydownBlockEsc = (event) => {
    if (!strictActive("blockEsc")) return;
    if (event.key === "Escape" || event.keyCode === 27) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", onKeydownBlockEsc, true);
  document.addEventListener("keydown", onKeydownBlockEsc, true);

  try {
    if (typeof nativeRequestAnimationFrame === "function" && typeof nativeCancelAnimationFrame === "function") {
      let lastFrameTime = 0;
      let nextSyntheticFrameId = -1;
      const syntheticFrames = new Map();
      window.requestAnimationFrame = new Proxy(nativeRequestAnimationFrame, {
        apply(target, self, args) {
          if (active("animationFrame") && readNativeHidden()) {
            const callback = args[0];
            if (typeof callback !== "function") {
              return Reflect.apply(target, self, args);
            }
            const currentTime = Date.now();
            const delay = Math.max(0, 16 - (currentTime - lastFrameTime));
            const id = nextSyntheticFrameId;
            nextSyntheticFrameId -= 1;
            const timer = setTimeout(() => {
              syntheticFrames.delete(id);
              callback(performance.now());
            }, delay);
            syntheticFrames.set(id, timer);
            lastFrameTime = currentTime + delay;
            return id;
          }
          return Reflect.apply(target, self, args);
        },
      });

      window.cancelAnimationFrame = new Proxy(nativeCancelAnimationFrame, {
        apply(target, self, args) {
          const id = args[0];
          if (syntheticFrames.has(id)) {
            clearTimeout(syntheticFrames.get(id));
            syntheticFrames.delete(id);
            return undefined;
          }
          return Reflect.apply(target, self, args);
        },
      });
    }
  } catch (error) {
    debug("Could not wrap animation frame APIs", error);
  }

  // Gate eTest's namespaced handlers at registration time. The mobile app
  // emits custom enterBackgroundHandler/enterForegroundHandler jQuery events
  // in addition to native visibility/focus events; capture-phase DOM
  // listeners cannot intercept those custom events. Wrapping the exact
  // eTest namespaces keeps the handlers installed and makes them work again
  // immediately when Stay Active is disabled.
  let jqueryGateInstalled = false;
  const installJqueryListenerGate = () => {
    const jq = window.jQuery || window.$;
    if (!jq?.event?.add) return false;
    if (jq.event.add.__eeActivityShieldGate) {
      jqueryGateInstalled = true;
      return true;
    }

    const nativeAdd = jq.event.add;
    const gatedHandlers = new WeakMap();
    const gatedAdd = function (elem, types, handler, data, selector) {
      const isEtestHandler = (elem === window || elem === document)
        && typeof types === "string"
        && types.split(/\s+/).some((type) => (
          type.includes(".etestplayeral") || type.includes(".etestaplayer")
        ));

      if (isEtestHandler && typeof handler === "function") {
        let gatedHandler = gatedHandlers.get(handler);
        if (!gatedHandler) {
          gatedHandler = function (...args) {
            if (strictActive("jquerySweep")) return undefined;
            return handler.apply(this, args);
          };
          gatedHandler.guid = handler.guid || (handler.guid = jq.guid++);
          gatedHandlers.set(handler, gatedHandler);
        }
        handler = gatedHandler;
      }

      return nativeAdd.call(this, elem, types, handler, data, selector);
    };
    gatedAdd.__eeActivityShieldGate = true;
    gatedAdd.__eeNativeAdd = nativeAdd;
    jq.event.add = gatedAdd;
    jqueryGateInstalled = true;
    return true;
  };

  // Poll rapidly only across the initial script-loading window. If jQuery is
  // already present, do not create a timer at all. The slower compatibility
  // sweep below keeps trying after this bounded window, without leaving a
  // permanent 40 Hz task on pages or frames that never load jQuery.
  if (!installJqueryListenerGate()) {
    let jqueryGateAttempts = 0;
    const jqueryGateTimer = setInterval(() => {
      jqueryGateAttempts += 1;
      if (installJqueryListenerGate() || jqueryGateAttempts >= 400) {
        clearInterval(jqueryGateTimer);
      }
    }, 25);
  }

  // Remove once any eTest handlers that raced registration before the gate.
  // If a jQuery build does not expose event.add, retain the periodic sweep as
  // the compatibility fallback.
  let preGateHandlersRemoved = false;
  setInterval(() => {
    if (!jqueryGateInstalled) installJqueryListenerGate();
    if (!strictActive("jquerySweep")) return;
    if (jqueryGateInstalled && preGateHandlersRemoved) return;
    const jq = window.jQuery || window.$;
    if (!jq || !jq.fn) return;
    try {
      jq(document).off(".etestplayeral").off(".etestaplayer");
      jq(window).off(".etestplayeral").off(".etestaplayer");
      if (jqueryGateInstalled) preGateHandlersRemoved = true;
    } catch (error) {
      debug("Could not sweep eTest player jQuery listeners", error);
    }
  }, 500);

  // fullScreenChangeHandle (the eTest player's own handler) only logs and
  // calls into enforcement that's already neutralized elsewhere here, so
  // blocking the event entirely is safe — layout still needs a manual
  // resize nudge since nothing else triggers one.
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"].forEach((name) => {
    document.addEventListener(name, (event) => {
      if (!strictActive("fullscreenSpoof")) return;
      event.stopImmediatePropagation();
      try {
        (window.jQuery || window.$)(window).trigger("resize");
      } catch (error) {
        debug("Could not trigger resize after fullscreen spoof", error);
      }
    }, true);
  });
})();
