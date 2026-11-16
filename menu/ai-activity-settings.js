(() => {
  "use strict";
  const toggle = document.getElementById("ee-ai-log-enabled");
  if (!toggle) return;
  const list = document.getElementById("ee-ai-log-entries");
  const status = document.getElementById("ee-ai-log-status");
  const clear = document.getElementById("ee-ai-log-clear");
  const t = key => window.eeI18n?.msg(key) || chrome.i18n.getMessage(key) || key;
  let revision = 0;
  const events = {
    queue_started: "eeAiQueueStarted", queue_finished: "eeAiQueueFinished", queue_stopped: "eeAiQueueStopped", queue_unsupported: "eeAiQueueUnsupported",
    started: "eeAiLogStarted", received: "eeAiLogReceived", failed: "eeAiLogFailed", applied: "eeAiLogApplied",
    not_applied: "eeAiLogNotApplied", cancelled: "eeAiLogCancelled", shortcut_buttons: "eeAiLogButtons",
    shortcut_no_question: "eeAiLogNoQuestion", shortcut_unreachable: "eeAiLogUnreachable",
  };
  const errors = { timeout: "eeAiLogTimeout", network: "eeAiLogNetwork", http: "eeAiLogHttp",
    output_limit: "eeAiLogLimit", empty: "eeAiLogEmptyResponse", invalid: "eeAiLogInvalid", configuration: "eeAiLogConfig", unknown: "eeAiLogUnknown" };
  function send(message) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError || !response?.ok) reject(new Error());
      else resolve(response);
    }));
  }
  async function render() {
    const current = ++revision;
    try {
      const data = await send({ type: "ee-ai-log-read" });
      if (current !== revision) return;
      toggle.checked = data.enabled;
      toggle.disabled = false;
      list.replaceChildren();
      for (const entry of data.entries.slice().reverse()) {
        if (!events[entry.event]) continue;
        const item = document.createElement("li");
        const parts = [new Date(entry.at).toLocaleString(document.documentElement.lang || undefined), t(events[entry.event])];
        if (entry.provider) parts.push(entry.provider);
        if (entry.model) parts.push(entry.model);
        if (entry.reasoning) parts.push(entry.reasoning);
        if (entry.ms !== undefined) parts.push(`${(entry.ms / 1000).toFixed(1)} s`);
        if (entry.error && errors[entry.error]) parts.push(t(errors[entry.error]));
        if (entry.http) parts.push(`HTTP ${entry.http}`);
        item.textContent = parts.join(" · ");
        list.appendChild(item);
      }
      status.textContent = data.entries.length ? "" : t("eeAiLogEmpty");
      clear.disabled = !data.entries.length;
    } catch (_) { status.textContent = t("eeAiLogStorageError"); }
  }
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    let failed = false;
    try { await send({ type: "ee-ai-log-toggle", enabled: toggle.checked }); }
    catch (_) { failed = true; }
    finally { toggle.disabled = false; await render(); }
    if (failed) status.textContent = t("eeAiLogStorageError");
  });
  clear.addEventListener("click", async () => {
    clear.disabled = true;
    try { await send({ type: "ee-ai-log-clear" }); await render(); }
    catch (_) { status.textContent = t("eeAiLogStorageError"); clear.disabled = false; }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.eeAiActivityLog || changes.eeAiActivityLogEnabled)) render();
  });
  globalThis.EE?.i18n?.subscribe(render);
  render();
})();
