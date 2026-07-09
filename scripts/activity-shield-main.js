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
    const hasNavigationApi = typeof navigation !== "undefined";
    const redirect = (event) => {
      if (hasNavigationApi && !redirect.href) return;
      debug("Blocked hidden-page redirect to", redirect.href || "(unknown destination)");
      event.preventDefault();
      event.returnValue = "no";
    };

    if (hasNavigationApi) {
      navigation.addEventListener("navigate", (event) => {
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

  try {
    if (typeof nativeRequestAnimationFrame === "function" && typeof nativeCancelAnimationFrame === "function") {
      let lastFrameTime = 0;
      window.requestAnimationFrame = new Proxy(nativeRequestAnimationFrame, {
        apply(target, self, args) {
          if (active("animationFrame") && readNativeHidden()) {
            const callback = args[0];
            if (typeof callback !== "function") {
              return Reflect.apply(target, self, args);
            }
            const currentTime = Date.now();
            const delay = Math.max(0, 16 - (currentTime - lastFrameTime));
            const id = setTimeout(() => callback(performance.now()), delay);
            lastFrameTime = currentTime + delay;
            return id;
          }
          return Reflect.apply(target, self, args);
        },
      });

      window.cancelAnimationFrame = new Proxy(nativeCancelAnimationFrame, {
        apply(target, self, args) {
          if (active("animationFrame") && readNativeHidden()) {
            clearTimeout(args[0]);
            return undefined;
          }
          return Reflect.apply(target, self, args);
        },
      });
    }
  } catch (error) {
    debug("Could not wrap animation frame APIs", error);
  }
})();
