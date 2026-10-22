(function () {
  "use strict";

  if (window.top !== window) return;
  if (window.__eeTimetableSyncInit) return;
  window.__eeTimetableSyncInit = true;

  const DAY_MS = 24 * 60 * 60 * 1000;
  let lastResolvedWeekStart = null;

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function parsePx(value) {
    const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number.parseFloat(match[0]) : 0;
  }

  function normalizeText(value) {
    return EE.normalizeKeyText(value);
  }

  function readStyleNumber(element, propertyName) {
    return parsePx(element?.style?.[propertyName] || "");
  }

  function parseDateOnly(value) {
    return EE.parseDateOnly(value);
  }

  function resolveDisplayedDate(dayText, monthText, anchorDate = new Date()) {
    const day = Number.parseInt(String(dayText || "").replace(/\D+/g, ""), 10);
    const month = Number.parseInt(String(monthText || "").replace(/\D+/g, ""), 10);
    if (!Number.isInteger(day) || !Number.isInteger(month)) return null;

    const reference = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
      ? anchorDate
      : new Date();
    const candidates = [-1, 0, 1]
      .map((offset) => reference.getFullYear() + offset)
      .map((year) => ({ year, date: new Date(year, month - 1, day) }))
      .filter(({ year, date }) => (
        date.getFullYear() === year
        && date.getMonth() === month - 1
        && date.getDate() === day
      ))
      .map(({ date }) => date);
    if (candidates.length === 0) return null;
    candidates.sort((left, right) => Math.abs(left.getTime() - reference.getTime()) - Math.abs(right.getTime() - reference.getTime()));
    return candidates[0];
  }

  function resolveDisplayedWeekDates(entries, anchorDate = new Date()) {
    const resolvedEntries = [];
    let previousDate = null;

    entries.forEach((entry) => {
      const dateMatch = String(entry?.dateText || "").match(/(\d+)[./]\s*(\d+)(?:\.|\b)/);
      if (!dateMatch) {
        resolvedEntries.push({
          ...entry,
          date: "",
        });
        return;
      }

      const baseDate = resolveDisplayedDate(dateMatch[1], dateMatch[2], previousDate || anchorDate);
      if (!baseDate) {
        resolvedEntries.push({
          ...entry,
          date: "",
        });
        return;
      }

      const candidates = [-1, 0, 1].map((yearOffset) => new Date(
        baseDate.getFullYear() + yearOffset,
        baseDate.getMonth(),
        baseDate.getDate(),
      ));
      candidates.sort((left, right) => {
        if (!previousDate) {
          return Math.abs(left.getTime() - anchorDate.getTime()) - Math.abs(right.getTime() - anchorDate.getTime());
        }

        const leftDiffDays = Math.round((left.getTime() - previousDate.getTime()) / DAY_MS);
        const rightDiffDays = Math.round((right.getTime() - previousDate.getTime()) / DAY_MS);
        const leftPenalty = leftDiffDays <= 0 ? (1000 + Math.abs(leftDiffDays)) : Math.abs(leftDiffDays - 1);
        const rightPenalty = rightDiffDays <= 0 ? (1000 + Math.abs(rightDiffDays)) : Math.abs(rightDiffDays - 1);
        if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
        return Math.abs(left.getTime() - previousDate.getTime()) - Math.abs(right.getTime() - previousDate.getTime());
      });

      const resolvedDate = candidates[0];
      previousDate = resolvedDate;
      resolvedEntries.push({
        ...entry,
        date: formatDate(resolvedDate),
      });
    });

    return resolvedEntries;
  }

  function formatDate(date) {
    return EE.formatDate(date);
  }

  function readWeekSignature() {
    const data = parseWeeklyTimetable();
    return data
      ? JSON.stringify(serializeParsedWeek(data))
      : "";
  }

  function findTimetableRoot() {
    const printRoot = Array.from(document.querySelectorAll(".print-nobreak")).find((element) =>
      element.querySelector(".tt-cell") || (findStickyHeader(element) && findStickyDayColumn(element)));
    if (printRoot) return printRoot;

    const lessonCell = document.querySelector(".tt-cell");
    if (!lessonCell) return null;

    let current = lessonCell.parentElement;
    while (current && current !== document.body) {
      if (current.querySelector("div[style*='font-size: 32px']")) {
        return current;
      }
      current = current.parentElement;
    }

    return lessonCell.parentElement;
  }

  function parseTimetableTimeRange(value) {
    const match = /^(\d{1,2}):(\d{2})\s*([ap]m)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap]m)?$/i.exec(String(value || "").trim());
    if (!match) return null;
    function time(hour, minute, suffix) {
      let h = Number(hour);
      const m = Number(minute);
      if (m > 59 || (suffix ? h < 1 || h > 12 : h > 23)) return null;
      if (suffix) h = h % 12 + (suffix.toLowerCase() === "pm" ? 12 : 0);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const startTime = time(match[1], match[2], match[3]);
    const endTime = time(match[4], match[5], match[6]);
    return startTime && endTime ? { startTime, endTime, implicit12Hour: !match[3] && !match[6] } : null;
  }

  function normalizeTimetablePeriods(headers) {
    let previousStart = -1;
    const minute = (value) => value.split(":").reduce((hours, mins) => Number(hours) * 60 + Number(mins));
    const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    return headers.map(({ implicit12Hour, ...header }) => {
      let start = minute(header.startTime);
      let end = minute(header.endTime);
      // Compact English headers omit AM/PM. Their chronological period order
      // disambiguates afternoon times without changing 24-hour headers.
      if (implicit12Hour && start < previousStart && start < 720 && start + 720 >= previousStart) start += 720;
      if (implicit12Hour && end <= start && end < 720 && end + 720 > start) end += 720;
      previousStart = start;
      return { ...header, startTime: clock(start), endTime: clock(end) };
    });
  }

  function findStickyHeader(root) {
    return Array.from(root.querySelectorAll("div")).find((element) => {
      const style = element.style || {};
      return style.position === "sticky"
        && Array.from(element.querySelectorAll("span")).some((span) => parseTimetableTimeRange(span.textContent));
    }) || null;
  }

  function findStickyDayColumn(root) {
    return Array.from(root.querySelectorAll("div")).find((element) => {
      const style = element.style || {};
      if (style.position !== "sticky") return false;
      return Array.from(element.querySelectorAll("div")).some((child) => /(\d+)[./]\s*(\d+)(?:\.|\b)/.test(child.textContent.replace(/\s+/g, " ").trim()));
    }) || null;
  }

  function parsePeriodHeaders(root) {
    const headers = [];
    const stickyHeader = findStickyHeader(root);
    if (!stickyHeader) return headers;

    stickyHeader.querySelectorAll("div[style*='position: absolute']").forEach((element) => {
      const spans = Array.from(element.querySelectorAll("span"));
      const combinedText = element.textContent.replace(/\s+/g, " ").trim();
      const label = spans[0]?.textContent?.trim() || combinedText.match(/\b(\d+)\b/)?.[1] || "";
      const timeRange = spans.map((span) => parseTimetableTimeRange(span.textContent)).find(Boolean);
      if (!/^\d+$/.test(label) || !timeRange) return;

      const { startTime, endTime, implicit12Hour } = timeRange;
      headers.push({
        period: label,
        left: readStyleNumber(element, "left"),
        width: readStyleNumber(element, "width"),
        startTime,
        endTime,
        implicit12Hour,
      });
    });

    return normalizeTimetablePeriods(headers.sort((left, right) => left.left - right.left));
  }

  function parseDayHeaders(root) {
    const headers = [];
    const stickyColumn = findStickyDayColumn(root);
    if (!stickyColumn) return headers;

    stickyColumn.querySelectorAll("div[style*='position: absolute']").forEach((element) => {
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (!text || !/(\d+)[./]\s*(\d+)(?:\.|\b)/.test(text)) return;
      const parts = Array.from(element.childNodes)
        .map((node) => node.textContent || "")
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (parts.length < 2) return;

      const dayToken = parts[0];
      const dateMatch = parts[1].match(/(\d+)[./]\s*(\d+)(?:\.|\b)/);
      if (!dateMatch) return;

      headers.push({
        label: dayToken,
        top: readStyleNumber(element, "top"),
        dateText: parts[1],
      });
    });

    const orderedHeaders = headers.sort((left, right) => left.top - right.top);
    const anchorDate = lastResolvedWeekStart || new Date();
    return resolveDisplayedWeekDates(orderedHeaders, anchorDate).map(({ label, top, date }) => ({
      label,
      top,
      date,
    }));
  }

  function parseWeeklyTimetable() {
    const root = findTimetableRoot();
    if (!root) return null;

    const title = root.querySelector("div[style*='font-size: 32px']");
    const weekLabelElement = Array.from(root.querySelectorAll("div")).find((element) =>
      element.style.position === "absolute" && element.parentElement?.style.position === "sticky"
      && readStyleNumber(element, "height") === 45 && !element.querySelector("span"));
    const periodHeaders = parsePeriodHeaders(root);
    const dayHeaders = parseDayHeaders(root);
    if (!weekLabelElement || periodHeaders.length === 0 || dayHeaders.length === 0 || dayHeaders.some((day) => !day.date)) return null;

    const grid = Array.from(root.querySelectorAll("div")).find((element) => {
      return Array.from(element.querySelectorAll(":scope > div[style*='position: absolute'][style*='overflow: visible']"))
        .some((row) => row.querySelector(":scope > div.tt-cell"));
    });
    if (!grid && root.querySelector(".tt-cell")) return null;

    const rowContainers = Array.from(grid?.querySelectorAll(":scope > div[style*='position: absolute'][style*='overflow: visible']") || [])
      .filter((element) => element.querySelector(":scope > div.tt-cell"))
      .sort((left, right) => readStyleNumber(left, "top") - readStyleNumber(right, "top"));

    const lessons = [];

    rowContainers.forEach((rowContainer) => {
      const rowTop = readStyleNumber(rowContainer, "top");
      const dayHeader = dayHeaders.slice()
        .sort((left, right) => Math.abs(left.top - rowTop) - Math.abs(right.top - rowTop))[0];
      if (!dayHeader?.date) return;
      const dayIndex = dayHeaders.indexOf(dayHeader);

      const blocks = Array.from(rowContainer.querySelectorAll(":scope > div.tt-cell"))
        .filter((element) => element.style.cursor === "pointer" && element.style.pointerEvents !== "none");

      const dayLessons = blocks.map((block) => {
        const left = readStyleNumber(block, "left");
        const top = readStyleNumber(block, "top");
        const width = readStyleNumber(block, "width");
        const height = readStyleNumber(block, "height");
        const borderStyle = block.style.border || "";

        const matchingTextLayers = Array.from(rowContainer.querySelectorAll(":scope > div")).filter((element) => {
          if (element === block) return false;
          if (readStyleNumber(element, "left") !== left) return false;
          if (readStyleNumber(element, "top") !== top) return false;
          if (readStyleNumber(element, "width") !== width) return false;
          if (readStyleNumber(element, "height") !== height) return false;
          return true;
        });

        const titleLayer = matchingTextLayers.find((element) => element.classList.contains("tt-cell") && element.style.pointerEvents === "none");
        const subject = titleLayer ? titleLayer.textContent.replace(/\s+/g, " ").trim() : "";
        const topLeft = matchingTextLayers.find((element) => element.style.justifyContent === "flex-start" && element.style.alignItems === "flex-start");
        const topRight = matchingTextLayers.find((element) => element.style.justifyContent === "flex-start" && element.style.alignItems === "flex-end");
        const bottomLeft = matchingTextLayers.find((element) => element.style.justifyContent === "flex-end" && element.style.alignItems === "flex-start");

        const coveredPeriods = periodHeaders.filter((period) => {
          const center = period.left + (period.width / 2);
          return center >= left && center <= (left + width);
        });
        const firstPeriod = coveredPeriods[0] || periodHeaders.find((period) => Math.abs(period.left - left) < 5);
        const lastPeriod = coveredPeriods[coveredPeriods.length - 1] || firstPeriod;

        return {
          date: dayHeader.date,
          dayIndex,
          period: firstPeriod?.period || "",
          startTime: firstPeriod?.startTime || "",
          endTime: lastPeriod?.endTime || "",
          duration: Math.max(1, coveredPeriods.length || 1),
          title: subject,
          group: topLeft ? topLeft.textContent.replace(/\s+/g, " ").trim() : "",
          room: topRight ? topRight.textContent.replace(/\s+/g, " ").trim() : "",
          teacher: bottomLeft ? bottomLeft.textContent.replace(/\s+/g, " ").trim() : "",
          changed: borderStyle.includes("dashed"),
          slotToken: `${firstPeriod?.period || left}:${Math.round(left)}:${normalizeText(subject)}:${normalizeText(topLeft?.textContent || "")}`,
        };
      }).filter((lesson) => lesson.title && lesson.startTime && lesson.endTime);

      dayLessons.sort((left, right) => {
        const periodDiff = (Number.parseInt(left.period, 10) || 0) - (Number.parseInt(right.period, 10) || 0);
        if (periodDiff !== 0) return periodDiff;
        return left.slotToken.localeCompare(right.slotToken);
      });

      dayLessons.forEach((lesson, slotIndex) => {
        lesson.slotIndex = slotIndex;
        lesson.eventKey = `${lesson.date}|${lesson.period}|${slotIndex}|${normalizeText(lesson.title)}|${normalizeText(lesson.group)}`;
        lessons.push(lesson);
      });
    });

    return {
      weekLabel: weekLabelElement.textContent.replace(/\s+/g, " ").trim(),
      classLabel: title ? title.textContent.replace(/\s+/g, " ").trim() : "",
      periodHeaders,
      dayHeaders,
      lessons,
    };
  }

  async function waitForTimetableReady(timeoutMs = 30000) {
    const startedAt = Date.now();
    let previous = "";
    let stableAt = startedAt;
    while (Date.now() - startedAt < timeoutMs) {
      const parsed = parseWeeklyTimetable();
      const signature = parsed ? JSON.stringify(serializeParsedWeek(parsed)) : "";
      if (signature !== previous) { previous = signature; stableAt = Date.now(); }
      if (parsed && Date.now() - stableAt >= 500) return parsed;
      await delay(250);
    }
    return null;
  }

  async function clickWeekNavigator(direction) {
    const forwardTexts = [">>", ">", "»", "›", "››"];
    const backwardTexts = ["<<", "<", "«", "‹", "‹‹"];
    const candidates = direction > 0 ? forwardTexts : backwardTexts;
    const control = Array.from(nativeNavigation()?.querySelectorAll("span") || []).find((element) => candidates.includes(element.textContent.trim()));
    if (!control) {
      throw new Error(`Could not find timetable navigation control: ${candidates[0]}`);
    }

    const before = readWeekSignature();
    control.click();

    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
      const after = readWeekSignature();
      if (after && after !== before) return true;
      await delay(250);
    }

    throw new Error(`Timetable did not change after clicking ${candidates[0]}.`);
  }

  function serializeParsedWeek(parsed) {
    return {
      weekLabel: parsed.weekLabel,
      classLabel: parsed.classLabel,
      dayHeaders: parsed.dayHeaders,
      lessons: parsed.lessons,
    };
  }

  chrome.runtime.sendMessage({
    type: "ee-edupage-page-context",
    origin: window.location.origin,
    href: window.location.href,
  }, () => {
    void chrome.runtime.lastError;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "ee-comparison-read" || message?.type === "ee-comparison-classes") {
      readComparison(message).then((data) => sendResponse({ ok: true, data }))
        .catch(() => sendResponse({ ok: false, error: "eeCompareLiveUnavailable" }));
      return true;
    }
    if (message?.type !== "ee-extract-timetable-week" && message?.type !== "ee-extract-timetable-week-series") return false;

    (async () => {
      lastResolvedWeekStart = null;

      if (globalThis.EEComparison?.pageMode(window.location.search) !== "timetable") {
        throw new Error("The hidden tab is not on the EduPage timetable page.");
      }

      let parsed = await selectOwnTimetable();
      if (!parsed) {
        throw new Error("EduPage timetable did not finish rendering.");
      }
      const ownLabel = parsed.classLabel;

      if (message?.type === "ee-extract-timetable-week-series") {
        const requestedCount = Number.parseInt(message.count, 10);
        const count = Math.max(1, Number.isFinite(requestedCount) ? requestedCount : 1);
        const weeks = [serializeParsedWeek(parsed)];
        lastResolvedWeekStart = parseDateOnly(parsed.dayHeaders?.[0]?.date);

        for (let index = 1; index < count; index += 1) {
          await clickWeekNavigator(1);
          parsed = await waitForTimetableReady();
          if (!parsed) {
            throw new Error("EduPage timetable did not finish rendering.");
          }
          verifyOwnTimetable(parsed, ownLabel);
          lastResolvedWeekStart = parseDateOnly(parsed.dayHeaders?.[0]?.date);
          weeks.push(serializeParsedWeek(parsed));
        }

        sendResponse({
          ok: true,
          data: { weeks },
        });
        return;
      }

      const steps = Number.parseInt(message.steps, 10) || 0;
      if (steps !== 0) {
        const direction = steps > 0 ? 1 : -1;
        for (let index = 0; index < Math.abs(steps); index += 1) {
          await clickWeekNavigator(direction);
          parsed = await waitForTimetableReady();
          if (!parsed) {
            throw new Error("EduPage timetable did not finish rendering.");
          }
          verifyOwnTimetable(parsed, ownLabel);
          lastResolvedWeekStart = parseDateOnly(parsed?.dayHeaders?.[0]?.date);
        }
      }
      lastResolvedWeekStart = parseDateOnly(parsed.dayHeaders?.[0]?.date);

      sendResponse({
        ok: true,
        data: serializeParsedWeek(parsed),
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "Could not extract EduPage timetable.",
      });
    });

    return true;
  });

  // Verified against EduPage's native #fitheight timetable navigation. Class
  // labels are the DOM's stable identity; they are always scoped to the school.
  function nativeNavigation() { return document.querySelector("#fitheight")?.firstElementChild; }

  function nativeControl(titles) {
    return Array.from(nativeNavigation()?.querySelectorAll("span[title]") || [])
      .find((element) => titles.includes(element.title));
  }

  function ownTimetableIdentity() {
    const ownName = Array.from(nativeNavigation()?.children || [])
      .find((element) => element.tagName === "SPAN" && element.style.fontWeight === "bold");
    const control = nativeControl(["My timetable", "Môj rozvrh", "Můj rozvrh"]) || ownName;
    const label = (ownName?.textContent || control?.textContent || "").replace(/\s+/g, " ").trim();
    if (!control || !label) throw new Error("Could not verify the native My timetable identity.");
    return { control, label };
  }

  function verifyOwnTimetable(parsed, label = ownTimetableIdentity().label) {
    if (!parsed || parsed.classLabel !== label) throw new Error("EduPage did not select My timetable.");
    return parsed;
  }

  async function selectOwnTimetable() {
    const { control, label } = ownTimetableIdentity();
    const before = parseWeeklyTimetable();
    const previousRoot = findTimetableRoot();
    const needsSelection = before?.classLabel !== label;
    if (needsSelection) control.click();
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      const parsed = await waitForTimetableReady(Math.min(2000, until - Date.now()));
      const completed = !needsSelection || findTimetableRoot() !== previousRoot || previousRoot?.isConnected === false;
      if (completed && parsed?.classLabel === label) return verifyOwnTimetable(parsed, label);
      await delay(250);
    }
    throw new Error("EduPage did not finish selecting My timetable.");
  }

  async function listComparisonClasses() {
    const control = nativeControl(["Classes", "Triedy", "Třídy"])
      || nativeNavigation()?.querySelector("img[src$='/class_32.svg']")?.closest("span");
    if (!control) throw new Error("Unsupported timetable navigation");
    control.click();
    const until = Date.now() + 8000;
    let options;
    do {
      await delay(100);
      options = Array.from(document.querySelectorAll(".dropDownPanel.asc-context-menu > li > a"));
    } while (!options.length && Date.now() < until);
    if (!options.length || options.length > 300) throw new Error("Class list unavailable");
    return options.map((element) => ({ id: element.textContent.trim(), label: element.textContent.trim() }));
  }

  async function readComparison(message) {
    lastResolvedWeekStart = null;
    if (!new URLSearchParams(window.location.search).has("eeComparison")) throw new Error("Comparison requires its own tab");
    if (!await waitForTimetableReady(15000)) throw new Error("Timetable unavailable");
    if (message.type === "ee-comparison-classes") return { classes: await listComparisonClasses() };
    const C = globalThis.EEComparison;
    if (!C || !Number.isFinite(C.dayNumber(message.weekStart)) || C.monday(message.weekStart) !== message.weekStart) throw new Error("Invalid week");
    let parsed = await selectOwnTimetable();
    if (!parsed) throw new Error("Timetable unavailable");
    const ownLabel = parsed.classLabel;
    if (message.ownerId !== "self") {
      const classes = await listComparisonClasses();
      if (!classes.some((entry) => entry.id === message.ownerId)) throw new Error("Class unavailable");
      const option = Array.from(document.querySelectorAll(".dropDownPanel.asc-context-menu > li > a"))
        .find((element) => element.textContent.trim() === message.ownerId);
      option.click();
      const until = Date.now() + 10000;
      do {
        await delay(200);
        parsed = parseWeeklyTimetable();
      } while (Date.now() < until && parsed?.classLabel !== message.ownerId);
      if (parsed?.classLabel !== message.ownerId) throw new Error("Class did not change");
    }
    const until = Date.now() + 30000;
    for (let index = 0; index < 54 && Date.now() < until; index++) {
      const current = parsed?.dayHeaders?.[0]?.date;
      if (!current) throw new Error("Week unavailable");
      const start = C.monday(current);
      if (start === message.weekStart) return serializeParsedWeek(parsed);
      lastResolvedWeekStart = parseDateOnly(current);
      await clickWeekNavigator(start < message.weekStart ? 1 : -1);
      parsed = await waitForTimetableReady(3000);
      if (message.ownerId !== "self" && parsed?.classLabel !== message.ownerId) throw new Error("Class changed unexpectedly");
      if (message.ownerId === "self") verifyOwnTimetable(parsed, ownLabel);
    }
    throw new Error("Week navigation limit reached");
  }

  window.__eeComparisonReader = { parseWeeklyTimetable, findTimetableRoot, parseTimetableTimeRange, normalizeTimetablePeriods };
  // Deliberate test hook — see tests/timetable-sync.test.js.
  if (globalThis.__EE_TEST__) {
    globalThis.__eeTestExports = { resolveDisplayedDate, resolveDisplayedWeekDates, formatDate, parseTimetableTimeRange, normalizeTimetablePeriods,
      parseWeeklyTimetable, waitForTimetableReady, clickWeekNavigator, selectOwnTimetable };
  }
})();
