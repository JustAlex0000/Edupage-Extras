(function () {
  "use strict";
  const toggle = document.getElementById("ee-test-archive-enabled");
  if (!toggle) return;
  const $ = (suffix) => document.getElementById(`ee-test-archive-${suffix}`);
  const t = (key, values) => window.eeI18n?.msg(key, values) || chrome.i18n.getMessage(key, values) || key;
  const status = $("status"), select = $("select"), dialog = $("confirm");
  let tests = [], selectedId = "", rendered = "", pendingDelete = null, renderRevision = 0;

  function node(tag, value) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    return element;
  }
  function message(key, error = false) {
    status.textContent = key ? t(key) : "";
    status.dataset.error = String(error);
  }
  function send(type, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...extra }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) reject(new Error("eeArchiveStorageError"));
        else resolve(response);
      });
    });
  }
  const date = (value) => new Date(value).toLocaleString(document.documentElement.lang || undefined);

  function review() {
    const entry = tests.find((item) => item.id === selectedId);
    const signature = entry ? JSON.stringify(entry) : "";
    if (signature === rendered) return;
    rendered = signature;
    const questions = $("questions");
    questions.replaceChildren();
    $("meta").textContent = entry ? t("eeArchiveCaptured", [String(entry.questions.length), date(entry.updatedAt)]) : "";
    if (!entry) return;
    for (const [index, question] of entry.questions.entries()) {
      const item = node("li");
      item.append(node("h4", t("eeArchiveQuestion", [question.number || String(index + 1)])));
      item.append(node("p", question.body));
      for (const image of question.images || []) {
        // Never reload a saved page's authenticated or third-party URLs.
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.data || "")) continue;
        const img = node("img"); img.src = image.data; img.alt = image.alt || ""; img.loading = "lazy"; item.append(img);
      }
      if (question.visualsOmitted) item.append(node("p", t("eeArchiveVisualsOmitted")));
      item.append(node("strong", t("eeArchiveYourAnswer")));
      item.append(node("p", question.answers.length ? question.answers.join("\n") : t("eeArchiveNoAnswer")));
      questions.append(item);
    }
  }

  async function render() {
    const revision = ++renderRevision;
    try {
      const response = await send("ee-test-archive-list");
      if (revision !== renderRevision) return;
      tests = response.library.tests;
      if (!tests.some((entry) => entry.id === selectedId)) selectedId = tests[0]?.id || "";
      select.replaceChildren();
      for (const entry of tests) {
        const option = node("option", `${entry.title || t("eeArchiveUntitled")} · ${date(entry.openedAt)} · ${entry.questions.length}`);
        option.value = entry.id; select.append(option);
      }
      select.value = selectedId;
      $("empty").hidden = tests.length > 0;
      $("library").hidden = tests.length === 0;
      $("clear").disabled = tests.length === 0;
      message(["eeArchiveFull", "eeArchiveUnsupported", "eeArchiveStorageError"].includes(response.status) ? response.status : "", Boolean(response.status));
      review();
    } catch (_) { $("clear").disabled = false; message("eeArchiveStorageError", true); }
  }
  toggle.addEventListener("change", () => {
    toggle.disabled = true;
    const next = toggle.checked;
    chrome.storage.local.set({ eeTestArchiveEnabled: next, eeTestArchiveStatus: "" }, () => {
      if (chrome.runtime.lastError) { toggle.checked = !next; message("eeArchiveStorageError", true); }
      else message(next ? "eeArchiveEnabled" : "eeArchiveDisabled");
      toggle.disabled = false;
    });
  });
  chrome.storage.local.get(["eeTestArchiveEnabled"], (values) => {
    if (chrome.runtime.lastError) message("eeArchiveStorageError", true);
    else toggle.checked = values.eeTestArchiveEnabled === true;
  });
  select.addEventListener("change", () => { selectedId = select.value; review(); });
  function confirm(id) {
    pendingDelete = id;
    $("confirm-title").textContent = t(id ? "eeArchiveDelete" : "eeArchiveDeleteAll");
    $("confirm-description").textContent = t(id ? "eeArchiveConfirmDelete" : "eeArchiveConfirmDeleteAll");
    $("confirm-delete").textContent = t(id ? "eeArchiveDelete" : "eeArchiveDeleteAll");
    dialog.showModal();
    $("cancel").focus();
  }
  $("delete").addEventListener("click", () => confirm(selectedId));
  $("clear").addEventListener("click", () => confirm(null));
  $("cancel").addEventListener("click", () => dialog.close());
  $("confirm-delete").addEventListener("click", async () => {
    $("confirm-delete").disabled = true;
    try {
      await send(pendingDelete ? "ee-test-archive-delete" : "ee-test-archive-clear", { id: pendingDelete });
      dialog.close();
      await render();
      (tests.length ? select : toggle).focus();
    } catch (_) { dialog.close(); message("eeArchiveStorageError", true); }
    finally { $("confirm-delete").disabled = false; }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.eeTestArchiveEnabled) toggle.checked = changes.eeTestArchiveEnabled.newValue === true;
    if (changes.eeTestArchive || changes.eeTestArchiveStatus) render();
  });
  globalThis.EE?.i18n?.subscribe(() => { rendered = ""; render(); });
  render();
})();
