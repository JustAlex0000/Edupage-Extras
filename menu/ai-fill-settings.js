(() => {
  "use strict";
  const $ = suffix => document.getElementById(`ee-ai-${suffix}`);
  if (!$("fill-delay")) return;
  const t = key => window.eeI18n?.msg(key) || chrome.i18n.getMessage(key) || key;
  const delay = $("fill-delay"), sequential = $("sequential-fill"), enabled = $("context-enabled");
  const step = $("fill-step"), auto = $("auto-enabled");
  const notes = $("context-text"), file = $("context-file"), save = $("context-save"), clear = $("context-clear");
  const status = $("fill-status");
  const controls = [delay, step, sequential, auto, enabled, notes, file, save, clear];
  let fileRevision = 0;
  function message(key, error = false) { status.textContent = t(key); status.dataset.error = String(error); }
  function store(values) {
    return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error()); else resolve();
    }));
  }
  controls.forEach(control => { control.disabled = true; });
  chrome.storage.local.get(["eeAiFillDelaySeconds", "eeAiSequentialFillEnabled", "eeAiFillStepSeconds", "eeAiAutoFillEnabled", "eeAiContextEnabled", "eeAiContextText"], values => {
    controls.forEach(control => { control.disabled = false; });
    if (chrome.runtime.lastError) { message("eeAiFillSaveFailed", true); return; }
    delay.value = Number.isFinite(Number(values.eeAiFillDelaySeconds)) ? Math.max(0, Math.min(60, Number(values.eeAiFillDelaySeconds))) : 0;
    sequential.checked = values.eeAiSequentialFillEnabled === true;
    step.value = Number.isFinite(Number(values.eeAiFillStepSeconds)) ? Math.max(0.1, Math.min(10, Number(values.eeAiFillStepSeconds))) : 0.5;
    $("step-options").hidden = !sequential.checked;
    auto.checked = values.eeAiAutoFillEnabled === true;
    window.dispatchEvent(new Event("ee-ai-feature-change"));
    enabled.checked = values.eeAiContextEnabled === true;
    notes.value = typeof values.eeAiContextText === "string" ? values.eeAiContextText : "";
  });
  step.addEventListener("change", async () => {
    if (!step.reportValidity()) return;
    try { await store({ eeAiFillStepSeconds: Number(step.value) }); message("savedStatus"); }
    catch (_) { message("eeAiFillSaveFailed", true); }
  });
  delay.addEventListener("change", async () => {
    if (!delay.reportValidity()) return;
    try { await store({ eeAiFillDelaySeconds: Number(delay.value) }); message("savedStatus"); }
    catch (_) { message("eeAiFillSaveFailed", true); }
  });
  for (const [control, key] of [[sequential, "eeAiSequentialFillEnabled"], [auto, "eeAiAutoFillEnabled"], [enabled, "eeAiContextEnabled"]]) {
    control.addEventListener("change", async () => {
      const next = control.checked;
      control.disabled = true;
      try { await store({ [key]: next }); message("savedStatus"); }
      catch (_) { control.checked = !next; message("eeAiFillSaveFailed", true); }
      finally {
        control.disabled = false;
        $("step-options").hidden = !sequential.checked;
        window.dispatchEvent(new Event("ee-ai-feature-change"));
      }
    });
  }
  save.addEventListener("click", async () => {
    if (notes.value.length > 20000) { message("eeAiContextInvalid", true); return; }
    fileRevision++;
    save.disabled = true;
    try { await store({ eeAiContextText: notes.value.replace(/\r\n?/g, "\n") }); message("eeAiContextSaved"); }
    catch (_) { message("eeAiFillSaveFailed", true); }
    finally { save.disabled = false; }
  });
  clear.addEventListener("click", async () => {
    fileRevision++;
    clear.disabled = true;
    try {
      // Remove the text entirely and disable transmission in the same operation.
      await store({ eeAiContextText: "", eeAiContextEnabled: false });
      notes.value = ""; enabled.checked = false; file.value = "";
      message("eeAiContextCleared");
    } catch (_) { message("eeAiFillSaveFailed", true); }
    finally { clear.disabled = false; }
  });
  file.addEventListener("change", async () => {
    const selected = file.files[0];
    const revision = ++fileRevision;
    if (!selected) return;
    try {
      if (!/\.(txt|md)$/i.test(selected.name) || selected.size > 131072) throw new Error();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await selected.arrayBuffer()).replace(/\r\n?/g, "\n");
      if (text.length > 20000 || text.includes("\u0000")) throw new Error();
      if (revision !== fileRevision) return;
      notes.value = text;
      message("eeAiContextImported");
    } catch (_) { if (revision === fileRevision) message("eeAiContextInvalid", true); }
    finally { if (revision === fileRevision) file.value = ""; }
  });
})();
