(() => {
  "use strict";
  const toggle = document.getElementById("ee-ai-log-enabled");
  if (!toggle) return;
  const list = document.getElementById("ee-ai-log-entries");
  const status = document.getElementById("ee-ai-log-status");
  const clear = document.getElementById("ee-ai-log-clear");
  const copy = document.getElementById("ee-ai-log-copy");
  const output = document.getElementById("ee-ai-log-copy-output");
  let entries = [];
  let copying = false;
  const t = key => window.eeI18n?.msg(key) || chrome.i18n.getMessage(key) || key;
  let revision = 0;
  const events = {
    queue_started: "eeAiQueueStarted", queue_finished: "eeAiQueueFinished", queue_stopped: "eeAiQueueStopped", queue_unsupported: "eeAiQueueUnsupported",
    started: "eeAiLogStarted", received: "eeAiLogReceived", failed: "eeAiLogFailed", applied: "eeAiLogApplied",
    not_applied: "eeAiLogNotApplied", cancelled: "eeAiLogCancelled", shortcut_buttons: "eeAiLogButtons",
    shortcut_no_question: "eeAiLogNoQuestion", shortcut_unreachable: "eeAiLogUnreachable", shortcut_received: "eeAiLogShortcutReceived",
  };
  const errors = { timeout: "eeAiLogTimeout", network: "eeAiLogNetwork", http: "eeAiLogHttp",
    output_limit: "eeAiLogLimit", empty: "eeAiLogEmptyResponse", invalid: "eeAiLogInvalid", configuration: "eeAiLogConfig", unknown: "eeAiLogUnknown" };
  function send(message) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError || !response?.ok) reject(new Error());
      else resolve(response);
    }));
  }
  function formatEntry(entry, exporting = false) {
    const parts = [exporting ? new Date(entry.at).toISOString() : new Date(entry.at).toLocaleString(document.documentElement.lang || undefined), t(events[entry.event])];
    if (exporting) parts.push(`[${entry.event}]`);
    if (entry.feature) parts.push(t(entry.feature === "automatic" ? "eeAiAutoTitle" : "aiQuestionHelper"));
    const stages = { configuration: "eeAiLogStageConfiguration", provider: "eeAiLogStageProvider", response: "eeAiLogStageResponse" };
    if (stages[entry.stage]) parts.push(t(stages[entry.stage]));
    if (entry.provider) parts.push(`${t("aiProvider")}: ${entry.provider}`);
    if (entry.model) parts.push(`${t("aiModel")}: ${entry.model}`);
    if (entry.reasoning) parts.push(`${t("eeAiLogReasoning")}: ${entry.reasoning}`);
    if (entry.ms !== undefined) parts.push(`${(entry.ms / 1000).toFixed(1)} s`);
    if (entry.error && errors[entry.error]) parts.push(t(errors[entry.error]));
    if (entry.http) {
      parts.push(`HTTP ${entry.http}`);
      const advice = { 401: "eeAiLogHttpAuth", 403: "eeAiLogHttpForbidden", 404: "eeAiLogHttpNotFound", 429: "eeAiLogHttpRate" };
      if (advice[entry.http]) parts.push(t(advice[entry.http]));
    }
    const reasons = { no_receiver: "eeAiLogNoReceiver", closed_port: "eeAiLogClosedPort", other: "eeAiLogDeliveryOther" };
    if (reasons[entry.reason]) parts.push(t(reasons[entry.reason]));
    return parts.join(" · ");
  }
  async function render() {
    const current = ++revision;
    try {
      const data = await send({ type: "ee-ai-log-read" });
      if (current !== revision) return;
      toggle.checked = data.enabled;
      toggle.disabled = false;
      list.replaceChildren();
      entries = data.entries.filter(entry => events[entry.event]);
      for (const entry of entries.slice().reverse()) {
        const item = document.createElement("li");
        item.textContent = formatEntry(entry);
        list.appendChild(item);
      }
      copy.disabled = copying || !entries.length;
      output.value = "";
      output.hidden = true;
      status.textContent = data.entries.length ? "" : t("eeAiLogEmpty");
      clear.disabled = !data.entries.length;
    } catch (_) { status.textContent = t("eeAiLogStorageError"); }
  }
  copy.addEventListener("click", async () => {
    if (!entries.length || copying) return;
    copying = true;
    copy.disabled = true;
    const text = `Edupage Extras ${chrome.runtime.getManifest().version} — ${t("eeAiLogTitle")}\n` + entries.map(entry => formatEntry(entry, true)).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = t("eeAiLogCopied");
    } catch (_) {
      output.value = text;
      output.hidden = false;
      output.focus();
      output.select();
      status.textContent = t("eeAiLogCopyFallback");
    } finally {
      copying = false;
      copy.disabled = !entries.length;
    }
  });
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
    if (area === "local" && (changes.eeAiActivityLog || changes.eeAiActivityLogEnabled || changes.eeAiQuestionHelperEnabled || changes.eeAiAutoFillEnabled)) render();
  });
  globalThis.EE?.i18n?.subscribe(render);
  render();
})();
