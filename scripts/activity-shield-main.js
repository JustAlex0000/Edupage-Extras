/**
 * activity-shield-main.js
 *
 * Page-world protections adapted from the reference Browser_extension.
 * Preferences arrive from the isolated-world bridge over a MessageChannel.
 * Page-world hooks and the initial handshake are not an anti-tampering boundary.
 */

(function () {
  "use strict";

  const CHANNEL_REQUEST = "ee-activity-shield-request";
  const CHANNEL_READY = "ee-activity-shield-ready";
  const CHANNEL_CONNECT = "ee-activity-shield-connect";
  const FLAGS = [
    "enabled", "log", "visibilityState", "hidden", "visibilityEvents", "focus",
    "blur", "redirect", "mouseleave", "mouseout", "pointercapture", "clipboard",
    "animationFrame", "blockEsc", "jquerySweep", "fullscreenSpoof",
  ];
  let preferences = Object.create(null);

  const nativeVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  const nativeHasFocus = Document.prototype.hasFocus;
  const nativeRequestAnimationFrame = window.requestAnimationFrame;
  const nativeCancelAnimationFrame = window.cancelAnimationFrame;

  const active = (name) => preferences.enabled === true && preferences[name] === true;

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
    if (preferences.log === true) {
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

  const navigationApi = window.top === window ? window.navigation : null;
  let reloadDestination = null;
  let redirectArmed = false;
  const redirect = (event) => {
    if (!active("redirect") || !readNativeHidden()) return;
    if (navigationApi && reloadDestination === null) return;
    debug("Requested a hidden-page reload confirmation");
    event.preventDefault();
    event.returnValue = "no";
  };

  function syncRedirect() {
    const shouldArm = window.top === window && active("redirect") && readNativeHidden();
    if (shouldArm && !redirectArmed) window.addEventListener("beforeunload", redirect);
    if (!shouldArm && redirectArmed) window.removeEventListener("beforeunload", redirect);
    redirectArmed = shouldArm;
    if (!shouldArm) reloadDestination = null;
  }

  if (navigationApi) {
    navigationApi.addEventListener("navigate", (event) => {
      reloadDestination = event.navigationType === "reload" ? event.destination?.url || "" : null;
      syncRedirect();
    });
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
    reloadDestination = null;
    syncRedirect();
    syncAnimationFrames();
    discoverJquery();
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
    if (!active("blockEsc")) return;
    if (event.key === "Escape" || event.keyCode === 27) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", onKeydownBlockEsc, true);
  document.addEventListener("keydown", onKeydownBlockEsc, true);

  let syncAnimationFrames = () => {};
  try {
    if (typeof nativeRequestAnimationFrame === "function" && typeof nativeCancelAnimationFrame === "function") {
      let nextSyntheticFrameId = -1;
      let frameTimer = null;
      const frames = new Map();
      const useSyntheticFrames = () => active("animationFrame") && readNativeHidden();
      const invokeFrame = (id, frame, timestamp) => {
        if (frames.get(id) !== frame) return;
        frames.delete(id);
        frame.callback.call(window, timestamp);
      };
      const requestNativeFrame = (id, frame) => {
        frame.nativeId = nativeRequestAnimationFrame.call(window, (timestamp) => invokeFrame(id, frame, timestamp));
      };
      const scheduleFrameTimer = () => {
        if (frameTimer !== null || !frames.size) return;
        frameTimer = setTimeout(() => {
          frameTimer = null;
          if (!useSyntheticFrames()) {
            syncAnimationFrames();
            return;
          }
          const timestamp = performance.now();
          for (const [id, frame] of Array.from(frames)) {
            if (frame.nativeId !== null) continue;
            try {
              invokeFrame(id, frame, timestamp);
            } catch (error) {
              if (typeof window.reportError === "function") window.reportError(error);
              else setTimeout(() => { throw error; }, 0);
            }
          }
        }, 16);
      };

      syncAnimationFrames = () => {
        if (frameTimer !== null) clearTimeout(frameTimer);
        frameTimer = null;
        const synthetic = useSyntheticFrames();
        for (const [id, frame] of frames) {
          if (synthetic && frame.nativeId !== null) {
            nativeCancelAnimationFrame.call(window, frame.nativeId);
            frame.nativeId = null;
          } else if (!synthetic && frame.nativeId === null) {
            requestNativeFrame(id, frame);
          }
        }
        if (synthetic) scheduleFrameTimer();
      };

      window.requestAnimationFrame = new Proxy(nativeRequestAnimationFrame, {
        apply(target, self, args) {
          if (typeof args[0] !== "function") return Reflect.apply(target, self, args);
          const frame = { callback: args[0], nativeId: null };
          if (useSyntheticFrames()) {
            const id = nextSyntheticFrameId--;
            frames.set(id, frame);
            scheduleFrameTimer();
            return id;
          }
          const id = Reflect.apply(target, self, [(timestamp) => invokeFrame(id, frame, timestamp)]);
          frame.nativeId = id;
          frames.set(id, frame);
          return id;
        },
      });

      window.cancelAnimationFrame = new Proxy(nativeCancelAnimationFrame, {
        apply(target, self, args) {
          const id = Number(args[0]);
          const frame = frames.get(id);
          if (frame) {
            if (frame.nativeId !== null) nativeCancelAnimationFrame.call(window, frame.nativeId);
            frames.delete(id);
            if (!frames.size && frameTimer !== null) {
              clearTimeout(frameTimer);
              frameTimer = null;
            }
            return undefined;
          }
          return Reflect.apply(target, self, args);
        },
      });
    }
  } catch (error) {
    debug("Could not wrap animation frame APIs", error);
  }

  // These two player namespaces are intentionally removed. Disabling stops
  // further stripping; a reload is needed to recreate deleted handlers.
  let jqueryTimer = null;

  function discoverJquery() {
    if (!active("jquerySweep")) return;
    const jq = window.jQuery || window.$;
    if (typeof jq !== "function" || typeof jq.fn?.off !== "function") return;
    try {
      jq(document).off(".etestplayeral").off(".etestaplayer");
      jq(window).off(".etestplayeral").off(".etestaplayer");
    } catch (error) {
      debug("Could not remove eTest player jQuery listeners", error);
    }
  }

  function syncJquerySweep() {
    if (!active("jquerySweep")) {
      if (jqueryTimer !== null) clearInterval(jqueryTimer);
      jqueryTimer = null;
    } else {
      discoverJquery();
      if (jqueryTimer === null) jqueryTimer = setInterval(discoverJquery, 500);
    }
  }

  document.addEventListener("DOMContentLoaded", discoverJquery);
  window.addEventListener("pageshow", discoverJquery);
  window.addEventListener("load", (event) => {
    if (event.target === window || event.target === document || event.target?.tagName === "SCRIPT") discoverJquery();
  }, true);

  // Suppress downstream fullscreen handlers and request a layout refresh.
  // Native fullscreen properties and earlier window listeners remain observable.
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"].forEach((name) => {
    document.addEventListener(name, (event) => {
      if (!active("fullscreenSpoof")) return;
      event.stopImmediatePropagation();
      try {
        (window.jQuery || window.$)(window).trigger("resize");
      } catch (error) {
        debug("Could not trigger resize after fullscreen spoof", error);
      }
    }, true);
  });

  const onChannelMessage = (event) => {
    if (event.source !== window) return;
    if (event.data?.type === CHANNEL_REQUEST) {
      window.postMessage({ type: CHANNEL_READY }, "*");
      return;
    }
    if (event.data?.type !== CHANNEL_CONNECT || event.ports?.length !== 1) return;
    const channel = event.ports[0];
    window.removeEventListener("message", onChannelMessage, true);
    let revision = -1;
    channel.onmessage = ({ data }) => {
      if (data?.type !== "preferences" || !Number.isSafeInteger(data.revision) || data.revision <= revision || !data.preferences || typeof data.preferences !== "object") return;
      const next = Object.create(null);
      for (const name of FLAGS) next[name] = data.preferences[name] === true;
      preferences = next;
      revision = data.revision;
      syncRedirect();
      syncAnimationFrames();
      syncJquerySweep();
    };
    channel.postMessage({ type: "connected" });
  };
  window.addEventListener("message", onChannelMessage, true);
  window.postMessage({ type: CHANNEL_READY }, "*");
})();
