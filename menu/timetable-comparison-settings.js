(function () {
  "use strict";
  const C = globalThis.EEComparison;
  const U = globalThis.EEComparisonUI;
  const root = document.getElementById("ee-comparison-settings");
  const toggle = document.getElementById("ee-comparison-enabled");
  const setup = document.getElementById("ee-comparison-setup");
  const status = document.getElementById("ee-comparison-setting-status");
  if (!root || !toggle || !setup || !status) return;
  let generation = 0;
  let focusSelection = false;

  async function render() {
    const stamp = ++generation;
    U.closeEditor();
    setup.replaceChildren();
    setup.hidden = true;
    try {
      const settings = await U.storage("get", [C.KEY, C.LIBRARY_KEY, C.ENABLED_KEY]);
      if (stamp !== generation) return;
      const enabled = settings[C.ENABLED_KEY] === true;
      const library = C.normalizeLibrary(settings[C.LIBRARY_KEY], settings[C.KEY]);
      const selected = library.schedules.find(entry => entry.id === library.activeId);
      const profile = selected?.profile || null;
      toggle.checked = enabled;
      toggle.setAttribute("aria-expanded", String(enabled));
      setup.hidden = !enabled;
      status.textContent = "";
      if (!enabled) return;
      const row = U.el("div", undefined, "setting-row setting-row-stack");
      const editorHost = U.el("div");
      editorHost.id = "ee-comparison-editor-host";
      function edit(focus = true, add = false) {
        U.openEditor({ container: editorHost, profile: add ? null : profile,
          scheduleId: add ? null : selected?.id || null, focus, onSave: render });
      }
      if (profile) {
        const label = U.el("label", U.t("eeCompareActiveSchedule"));
        const select = U.el("select");
        select.id = "ee-comparison-active-schedule";
        label.htmlFor = select.id;
        for (const entry of library.schedules) {
          const option = U.el("option", entry.profile.name);
          option.value = entry.id;
          select.append(option);
        }
        select.value = selected.id;
        select.setAttribute("aria-describedby", "ee-comparison-saved-hint");
        const hint = U.el("p", U.t("eeCompareSavedHint"), "ee-comparison-note");
        hint.id = "ee-comparison-saved-hint";
        select.addEventListener("change", async () => {
          focusSelection = true;
          select.disabled = true;
          try { await U.selectSchedule(select.value); }
          catch (_) { focusSelection = false; select.value = selected.id; status.textContent = U.t("eeCompareStorageError"); }
          finally { select.disabled = false; if (select.isConnected) select.focus(); }
        });
        row.append(label, select, hint);
        const actions = U.el("div", undefined, "actions-row");
        actions.append(U.button("eeCompareAddSchedule", () => edit(true, true)));
        actions.append(U.button("eeCompareEdit", () => edit()));
        actions.append(U.button("eeCompareRemove", async () => {
          try { await U.removeSchedule(selected.id); }
          catch (_) { status.textContent = U.t("eeCompareStorageError"); }
        }));
        row.append(actions);
      } else row.append(U.el("p", U.t("eeCompareSetupHint")));
      row.append(editorHost);
      setup.append(row);
      if (!profile) edit(false);
      if (focusSelection) {
        (document.getElementById("ee-comparison-active-schedule") || toggle).focus();
        focusSelection = false;
      }
    } catch (_) { status.textContent = U.t("eeCompareStorageError"); }
  }
  toggle.addEventListener("change", async () => {
    const next = toggle.checked;
    toggle.disabled = true;
    try { await U.storage("set", { [C.ENABLED_KEY]: next }); }
    catch (_) {
      toggle.checked = !next;
      status.textContent = U.t("eeCompareStorageError");
    } finally { toggle.disabled = false; }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[C.KEY] || changes[C.LIBRARY_KEY] || changes[C.ENABLED_KEY])) render();
  });
  EE.withLanguageReady(render);
})();
