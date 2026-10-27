(function () {
  "use strict";
  const C = globalThis.EEComparison;
  const t = (key) => EE.getMessage(key) || key;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (key, action) => {
    const node = el("button", t(key));
    node.type = "button";
    node.className = "secondary-button";
    node.addEventListener("click", action);
    return node;
  };
  function storage(method, value) {
    return new Promise((resolve, reject) => chrome.storage.local[method](value, (result) => {
      if (chrome.runtime.lastError) reject(new Error("eeCompareStorageError")); else resolve(result);
    }));
  }
  function message(value) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(value, (result) => {
      if (chrome.runtime.lastError || !result?.ok) reject(new Error(result?.error || "eeCompareLiveUnavailable"));
      else resolve(result);
    }));
  }
  async function load() {
    const result = await storage("get", [C.KEY]);
    if (!result[C.KEY]) return null;
    return C.normalizeProfile(result[C.KEY]);
  }
  async function loadLibrary() {
    const result = await storage("get", [C.KEY, C.LIBRARY_KEY]);
    return C.normalizeLibrary(result[C.LIBRARY_KEY], result[C.KEY]);
  }
  async function persistLibrary(value) {
    const library = C.normalizeLibrary(value);
    const active = library.schedules.find(entry => entry.id === library.activeId);
    // Keep the existing active-profile key for content scripts and live-cache cleanup.
    // Both values change together only after validation and a successful save.
    await storage("set", { [C.LIBRARY_KEY]: library, [C.KEY]: active?.profile || null });
  }
  async function save(value, id = null) {
    const profile = C.normalizeProfile(value);
    const library = await loadLibrary();
    if (id !== null && !library.schedules.some(entry => entry.id === id)) throw new Error("eeCompareInvalidProfile");
    const entry = { id: id || crypto.randomUUID(), profile };
    library.schedules = id ? library.schedules.map(saved => saved.id === id ? entry : saved) : [...library.schedules, entry];
    library.activeId = entry.id;
    await persistLibrary(library);
  }
  async function selectSchedule(id) {
    const library = await loadLibrary();
    if (!library.schedules.some(entry => entry.id === id)) throw new Error("eeCompareInvalidProfile");
    library.activeId = id;
    await persistLibrary(library);
  }
  async function removeSchedule(id) {
    const library = await loadLibrary();
    library.schedules = library.schedules.filter(entry => entry.id !== id);
    if (library.activeId === id) library.activeId = library.schedules[0]?.id || null;
    await persistLibrary(library);
  }

  function dateLabel(value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(EE.getUILanguage(), { weekday: "short", day: "numeric", month: "short" });
  }

  function durationLabel(minutes) {
    if (!minutes) return t("eeCompareSameFinish");
    const count = Math.abs(minutes);
    const duration = `${Math.floor(count / 60) ? `${Math.floor(count / 60)}h ` : ""}${count % 60 ? `${count % 60}m` : ""}`.trim();
    return `${duration} ${t(minutes > 0 ? "eeCompareLater" : "eeCompareEarlier")}`;
  }

  function appendLessons(target, lessons) {
    const list = el("ul", undefined, "ee-comparison-compact-lessons");
    for (const lesson of lessons.slice().sort((a, b) => C.minutes(a.startTime) - C.minutes(b.startTime))) {
      list.append(el("li", `${lesson.startTime}–${lesson.endTime} · ${lesson.title}${lesson.room ? ` · ${lesson.room}` : ""}${lesson.group ? ` · ${lesson.group}` : ""}`));
    }
    target.append(list);
  }

  function compactDay({ date, own, other, name, ownKnown, otherKnown, allowGaps, daily, notice, onRefresh }) {
    const now = new Date();
    const data = C.daySummary(own, other, { ownKnown, otherKnown, allowGaps,
      currentMinute: date === C.dateKey(now) ? now.getHours() * 60 + now.getMinutes() : null });
    const details = el("details", undefined, "ee-comparison-compact-day");
    const summary = el("summary");
    const owner = daily ? name : new Date(`${date}T12:00:00`).toLocaleDateString(EE.getUILanguage(), { weekday: "short" });
    summary.append(el("strong", owner, "ee-comparison-compact-name"));
    if (daily) {
      const active = data.current.length ? data.current : data.next;
      const key = data.current.length ? "eeCompareNowShort" : "eeCompareNextShort";
      if (active.length) summary.append(el("span", `${t(key)} ${active.map(lesson => `${lesson.title} ${lesson.startTime}–${lesson.endTime}`).join(" / ")}`));
      else summary.append(el("span", t(otherKnown ? (other.length ? "eeCompareDayFinished" : "eeCompareNoLessons") : "eeCompareUnavailableShort")));
    }
    const ownLabel = daily ? t("eeCompareYouShort") : t("eeCompareShownShort");
    const finishes = el("span", daily
      ? `${ownLabel} ${data.ownFinish || "—"} · ${t("eeCompareTheirFinish")} ${data.otherFinish || "—"}`
      : `${data.ownFinish || "—"} / ${data.otherFinish || "—"}`, "ee-comparison-compact-finish");
    finishes.title = `${ownLabel} ${data.ownFinish || "—"} · ${name} ${data.otherFinish || "—"}`;
    finishes.setAttribute("aria-label", finishes.title);
    summary.append(finishes);
    if (data.difference !== null) summary.append(el("span", durationLabel(data.difference), "ee-comparison-compact-difference"));
    details.append(summary);
    const expanded = el("div", undefined, "ee-comparison-compact-detail");
    if (!ownKnown || !otherKnown) expanded.append(el("p", t("eeCompareMissingDay")));
    if (otherKnown) {
      appendLessons(expanded, other);
      if (!other.length) expanded.append(el("p", t("eeCompareNoLessons")));
    }
    if (allowGaps && ownKnown && otherKnown) expanded.append(el("p", `${t("eeCompareGaps")}: ${data.gaps.length ? data.gaps.map(g => `${g.startTime}–${g.endTime}`).join(" · ") : t("eeCompareNoGaps")}`));
    expanded.append(el("small", notice));
    if (onRefresh) expanded.append(button("eeCompareRefresh", onRefresh));
    details.append(expanded);
    return details;
  }

  function renderCompact(target, { dates, own, other, name, ownDates = [], otherDates = [], daily = false, allowGaps = true, notice = "", onRefresh }) {
    target.replaceChildren();
    target.classList.toggle("ee-comparison-week-strip", !daily);
    if (!daily) target.append(el("span", `${t("eeCompareShownShort")} / ${name}`, "ee-comparison-week-owner"));
    for (const date of dates) target.append(compactDay({ date, own: own.filter(l => l.date === date), other: other.filter(l => l.date === date),
      name, ownKnown: ownDates.includes(date), otherKnown: otherDates.includes(date), daily, allowGaps, notice, onRefresh }));
  }

  function renderPreview(target, lessons, dates, name) {
    target.replaceChildren(el("h3", `${t("eeComparePreview")} · ${name}`));
    for (const date of dates) {
      const section = el("section", undefined, "ee-comparison-preview-day");
      section.append(el("h4", dateLabel(date)));
      const day = lessons.filter((lesson) => lesson.date === date).sort((a, b) => C.minutes(a.startTime) - C.minutes(b.startTime));
      if (!day.length) section.append(el("p", t("eeCompareNoLessons")));
      else {
        const list = el("ul");
        for (const lesson of day) list.append(el("li", `${lesson.startTime}–${lesson.endTime} · ${lesson.title}${lesson.room ? ` · ${lesson.room}` : ""}${lesson.group ? ` · ${lesson.group}` : ""}`));
        section.append(list);
      }
      target.append(section);
    }
  }

  let closeCurrentEditor = () => {};

  async function openEditor({ container, profile = null, scheduleId = null, origin = "", onSave = () => {}, focus = true } = {}) {
    if (!container || !container.closest("#ee-comparison-settings")) return;
    closeCurrentEditor();
    const previousFocus = document.activeElement;
    const editor = el("section", undefined, "ee-comparison-editor");
    editor.id = "ee-comparison-editor";
    editor.setAttribute("aria-label", t("eeCompareTitle"));
    const form = el("form");
    form.noValidate = true;
    const fields = el("div", undefined, "ee-comparison-fields");
    const status = el("p", "", "ee-comparison-status");
    status.setAttribute("role", "status");
    const preview = el("div", undefined, "ee-comparison-preview");
    const groups = el("fieldset");
    groups.append(el("legend", t("eeCompareGroups")));
    groups.hidden = true;
    const groupValues = new Set();
    const excluded = new Set(profile?.excludedGroups || []);
    let classes = [];
    let sourceOrigin = origin || profile?.origin || "";
    let candidate = null;
    let classLessons = [];
    let classDates = [];
    let reading = 0;
    let classRequestVersion = 0;
    let closed = false;
    const samples = [[], []];
    const fileVersions = [0, 0];

    function field(key, control, suffix) {
      const label = el("label");
      control.id = `ee-comparison-${suffix}`;
      label.htmlFor = control.id;
      label.append(el("span", t(key)), control);
      fields.append(label);
      return control;
    }
    function option(select, value, label) {
      const item = el("option", label);
      item.value = value;
      select.append(item);
    }
    const name = field("eeCompareName", el("input"), "name");
    name.type = "text";
    name.maxLength = 60;
    name.value = profile?.name || "";
    name.required = true;
    const source = field("eeCompareSource", el("select"), "source");
    option(source, "import", t("eeCompareImport"));
    option(source, "class", t("eeCompareClass"));
    source.value = profile?.source || "import";
    const classSelect = field("eeCompareClass", el("select"), "class");
    const classLoad = button("eeCompareLoadClasses", loadClasses);
    fields.append(classLoad);
    const cycle = field("eeCompareRepeat", el("select"), "cycle");
    option(cycle, "1", t("eeCompareWeekly"));
    option(cycle, "2", t("eeCompareFortnightly"));
    cycle.value = String(profile?.cycleWeeks || 1);
    const fileA = field("eeCompareFileA", el("input"), "file-a");
    const fileB = field("eeCompareFileB", el("input"), "file-b");
    for (const file of [fileA, fileB]) { file.type = "file"; file.accept = ".ics,text/calendar"; }
    const weekA = field("eeCompareSampleA", el("select"), "week-a");
    const weekB = field("eeCompareSampleB", el("select"), "week-b");
    for (const select of [weekA, weekB]) {
      select.disabled = true;
      option(select, "", t(profile?.source === "import" ? "eeCompareSavedTemplate" : "eeCompareSelectFile"));
    }
    const anchor = field("eeCompareAnchor", el("input"), "anchor");
    anchor.type = "date";
    anchor.value = profile?.anchorMonday || C.monday(C.dateKey());
    const notice = el("p", t("eeCompareImportNotice"), "ee-comparison-note");
    const actions = el("div", undefined, "ee-comparison-actions");
    const previewButton = button("eeComparePreview", updatePreview);
    const saveButton = el("button", t("eeCompareSave"));
    saveButton.type = "submit";
    saveButton.className = "secondary-button";
    const closeButton = button("eeCompareCancel", () => closeCurrentEditor());
    actions.append(previewButton, saveButton);
    if (profile) actions.append(closeButton);
    form.append(fields, notice, groups, status, preview, actions);
    editor.append(form);
    container.append(editor);

    function error(reason) {
      const key = typeof reason?.message === "string" && reason.message.startsWith("eeCompare") ? reason.message : "eeCompareInvalidCalendar";
      status.textContent = t(key);
      status.classList.add("ee-comparison-error");
    }
    function showGroups(lessons) {
      for (const lesson of lessons) if (lesson.group) groupValues.add(lesson.group);
      groups.replaceChildren(el("legend", t("eeCompareGroups")));
      for (const group of groupValues) {
        const label = el("label", undefined, "ee-comparison-group");
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = !excluded.has(group);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) excluded.delete(group); else excluded.add(group);
          candidate = null;
          updatePreview();
        });
        label.append(checkbox, document.createTextNode(group));
        groups.append(label);
      }
      groups.hidden = groupValues.size === 0;
    }
    function visibility() {
      classRequestVersion++;
      const isClass = source.value === "class";
      const fortnight = cycle.value === "2";
      for (const input of [cycle, fileA, weekA, anchor]) input.parentElement.hidden = isClass;
      fileB.parentElement.hidden = isClass || !fortnight;
      weekB.parentElement.hidden = isClass || !fortnight;
      classSelect.parentElement.hidden = !isClass;
      classLoad.hidden = !isClass;
      notice.hidden = isClass;
      candidate = null;
      preview.replaceChildren();
      status.textContent = "";
      groupValues.clear();
      groups.hidden = true;
      saveButton.disabled = true;
    }
    async function loadClasses() {
      const stamp = ++classRequestVersion;
      classLoad.disabled = true;
      status.textContent = t("eeCompareLoading");
      try {
        const result = await message({ type: "ee-comparison-classes", origin: sourceOrigin });
        if (closed || source.value !== "class" || stamp !== classRequestVersion) return;
        sourceOrigin = result.origin;
        classes = result.data.classes;
        classSelect.replaceChildren();
        for (const entry of classes) option(classSelect, entry.id, entry.label);
        if (profile?.source === "class" && classes.some((entry) => entry.id === profile.ownerId)) classSelect.value = profile.ownerId;
        status.textContent = t("eeCompareChooseClass");
      } catch (reason) {
        if (!closed && source.value === "class" && stamp === classRequestVersion) error(reason);
      } finally { classLoad.disabled = false; }
    }
    function fillWeeks() {
      for (const [index, select] of [[0, weekA], [1, weekB]]) {
        const previous = select.value;
        select.replaceChildren();
        const pool = index === 1 && samples[1].length ? samples[1] : samples[0];
        const weeks = [...new Set(pool.map((lesson) => C.monday(lesson.date)))].sort();
        select.disabled = weeks.length === 0;
        for (const week of weeks) option(select, week, `${dateLabel(week)} – ${dateLabel(C.addDays(week, 6))}`);
        if (weeks.includes(previous)) select.value = previous;
        else if (index === 1 && !samples[1].length && weeks.length > 1) select.value = weeks[1];
      }
    }
    async function readFile(index, input) {
      const file = input.files?.[0];
      if (!file) return;
      const version = ++fileVersions[index];
      reading++;
      candidate = null;
      previewVersion++;
      saveButton.disabled = true;
      try {
        if (!/\.ics$/i.test(file.name) || file.size > C.MAX_FILE_BYTES) throw new Error("eeCompareTooLarge");
        const lessons = C.parseIcs(await file.text());
        if (closed || version !== fileVersions[index] || source.value !== "import") return;
        samples[index] = lessons;
        fillWeeks();
        candidate = null;
        groupValues.clear();
        preview.replaceChildren();
        status.textContent = t("eeCompareReadyToPreview");
      } catch (reason) {
        if (!closed && version === fileVersions[index] && source.value === "import") error(reason);
      } finally { reading--; }
    }
    function importCandidate() {
      const count = Number(cycle.value);
      let templates;
      if (!samples[0].length && profile?.source === "import") {
        if (count !== profile.cycleWeeks) throw new Error("eeCompareSelectWeeks");
        templates = profile.templates;
      } else {
        if (!samples[0].length || !weekA.value || (count === 2 && !weekB.value)) throw new Error("eeCompareSelectWeeks");
        if (count === 2 && !samples[1].length && weekA.value === weekB.value) throw new Error("eeCompareSelectWeeks");
        templates = [C.templateFromWeek(samples[0], weekA.value)];
        if (count === 2) templates.push(C.templateFromWeek(samples[1].length ? samples[1] : samples[0], weekB.value));
      }
      return C.normalizeProfile({ version: 1, source: "import", name: name.value, enabled: true, excludedGroups: [...excluded], cycleWeeks: count, anchorMonday: anchor.value, templates });
    }
    async function updatePreview() {
      if (reading) return;
      previewButton.disabled = true;
      saveButton.disabled = true;
      status.classList.remove("ee-comparison-error");
      status.textContent = t("eeCompareLoading");
      const stamp = ++previewVersion;
      try {
        let next;
        if (source.value === "class") {
          const selected = classes.find((entry) => entry.id === classSelect.value);
          if (!selected) throw new Error("eeCompareChooseClass");
          next = C.normalizeProfile({ version: 1, source: "class", name: name.value, enabled: true, origin: sourceOrigin,
            ownerId: selected.id, ownerLabel: selected.label, excludedGroups: [...excluded] });
          const start = C.monday(C.dateKey());
          const weeks = await Promise.all([start, C.addDays(start, 7)].map((weekStart) => message({ type: "ee-comparison-week", origin: next.origin, ownerId: next.ownerId, weekStart })));
          classLessons = weeks.flatMap((week) => week.data.lessons);
          classDates = weeks.flatMap((week) => week.data.dates);
        } else next = importCandidate();
        if (closed || stamp !== previewVersion) return;
        candidate = next;
        const start = C.monday(C.dateKey());
        const lessons = next.source === "import" ? C.expand({ ...next, excludedGroups: [] }, start, 14) : classLessons;
        showGroups(next.source === "import" ? next.templates.flat() : classLessons);
        const dates = Array.from({ length: 14 }, (_, index) => C.addDays(start, index));
        renderPreview(preview, C.included(lessons, next.excludedGroups), next.source === "import" ? dates : classDates, next.name);
        status.textContent = t("eeComparePreviewReady");
        saveButton.disabled = false;
      } catch (reason) {
        if (!closed && stamp === previewVersion) { candidate = null; error(reason); }
      } finally { previewButton.disabled = false; }
    }
    let previewVersion = 0;
    for (const input of [name, source, classSelect, cycle, weekA, weekB, anchor]) input.addEventListener("input", () => {
      candidate = null;
      previewVersion++;
      saveButton.disabled = true;
      preview.replaceChildren();
      if (input === source || input === cycle) visibility();
    });
    fileA.addEventListener("change", () => readFile(0, fileA));
    fileB.addEventListener("change", () => readFile(1, fileB));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!candidate || reading) { status.textContent = t("eeComparePreviewFirst"); return; }
      saveButton.disabled = true;
      try {
        await save(candidate, scheduleId);
        closeCurrentEditor();
        onSave(candidate);
      } catch (reason) { error(reason); saveButton.disabled = false; }
    });
    closeCurrentEditor = () => {
      closed = true;
      previewVersion++;
      editor.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.getElementById("ee-comparison-enabled")?.focus();
    };
    visibility();
    if (focus) name.focus();
    if (source.value === "class") loadClasses();
  }

  globalThis.EEComparisonUI = { t, el, button, load, loadLibrary, save, selectSchedule, removeSchedule, storage, message, dateLabel, renderCompact, openEditor, closeEditor: () => closeCurrentEditor() };
})();
