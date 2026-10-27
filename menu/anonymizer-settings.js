// Keep alias edits local and save them as the user types.
EE.bindAnonymizerSettings = function ({ toggle, input, options, status, notify }) {
  const keys = EE.THEME_STORAGE_KEYS;
  let timer = null, revision = 0;
  // Do not let an early edit overwrite the alias while preferences are loading.
  toggle.disabled = true;
  function syncVisibility() {
    options.hidden = !toggle.checked;
    input.disabled = !toggle.checked;
    toggle.setAttribute("aria-expanded", String(toggle.checked));
  }
  function save() {
    clearTimeout(timer); timer = null;
    const version = ++revision;
    status.hidden = true;
    chrome.storage.local.set({
      [keys.hidePersonalInfoEnabled]: toggle.checked,
      [keys.anonymizerAlias]: EE.normalizeAnonymizerAlias(input.value),
    }, () => {
      const error = chrome.runtime.lastError;
      if (version !== revision) return;
      if (error) {
        status.textContent = EE.getMessage("anonymizerSaveError");
        status.hidden = false;
        return;
      }
      notify();
    });
  }
  toggle.addEventListener("change", () => { syncVisibility(); save(); });
  input.addEventListener("input", () => {
    clearTimeout(timer); status.hidden = true;
    timer = setTimeout(save, 200);
  });
  input.addEventListener("blur", () => {
    input.value = EE.normalizeAnonymizerAlias(input.value);
    if (timer !== null) save();
  });
  window.addEventListener("pagehide", () => { if (timer !== null) save(); });
  syncVisibility();
  return {
    load(values) {
      input.value = EE.normalizeAnonymizerAlias(values[keys.anonymizerAlias]);
      toggle.disabled = false;
      syncVisibility();
    },
    syncVisibility,
  };
};
