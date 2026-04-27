(function () {
  "use strict";

  if (window.top !== window) return;

  const DAY_TOKENS = ["Po", "Ut", "St", "St", "Št", "Pi", "So", "Ne"];

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function parsePx(value) {
    const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number.parseFloat(match[0]) : 0;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function readStyleNumber(element, propertyName) {
    return parsePx(element?.style?.[propertyName] || "");
  }

  function resolveDisplayedDate(dayText, monthText) {
    const day = Number.parseInt(String(dayText || "").replace(/\D+/g, ""), 10);
    const month = Number.parseInt(String(monthText || "").replace(/\D+/g, ""), 10);
    if (!Number.isFinite(day) || !Number.isFinite(month)) return null;

    const today = new Date();
    const candidates = [
      new Date(today.getFullYear() - 1, month - 1, day),
      new Date(today.getFullYear(), month - 1, day),
      new Date(today.getFullYear() + 1, month - 1, day),
    ];
    candidates.sort((left, right) => Math.abs(left.getTime() - today.getTime()) - Math.abs(right.getTime() - today.getTime()));
    return candidates[0];
  }

  function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readWeekSignature() {
    const data = parseWeeklyTimetable();
    return data
      ? `${data.weekLabel}|${data.dayHeaders.map((entry) => entry.date).join(",")}|${data.lessons.length}`
      : "";
  }

  function findTimetableRoot() {
    const printRoot = Array.from(document.querySelectorAll(".print-nobreak")).find((element) => element.querySelector(".tt-cell"));
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

  function findStickyHeader(root) {
    return Array.from(root.querySelectorAll("div")).find((element) => {
      const style = element.style || {};
      return style.position === "sticky"
        && Array.from(element.querySelectorAll("span")).some((span) => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(span.textContent.trim()));
    }) || null;
  }

  function findStickyDayColumn(root) {
    return Array.from(root.querySelectorAll("div")).find((element) => {
      const style = element.style || {};
      if (style.position !== "sticky") return false;
      return Array.from(element.querySelectorAll("div")).some((child) => /(\d+)\.\s*(\d+)\./.test(child.textContent.replace(/\s+/g, " ").trim()));
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
      const timeRange = spans.find((span) => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(span.textContent.trim()))?.textContent?.trim()
        || combinedText.match(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/)?.[1]
        || "";
      if (!/^\d+$/.test(label) || !/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(timeRange)) return;

      const [startTime, endTime] = timeRange.split("-").map((value) => value.trim());
      headers.push({
        period: label,
        left: readStyleNumber(element, "left"),
        width: readStyleNumber(element, "width"),
        startTime,
        endTime,
      });
    });

    return headers.sort((left, right) => left.left - right.left);
  }

  function parseDayHeaders(root) {
    const headers = [];
    const stickyColumn = findStickyDayColumn(root);
    if (!stickyColumn) return headers;

    stickyColumn.querySelectorAll("div[style*='position: absolute']").forEach((element) => {
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (!text || !/(\d+)\.\s*(\d+)\./.test(text)) return;
      const parts = Array.from(element.childNodes)
        .map((node) => node.textContent || "")
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (parts.length < 2) return;

      const dayToken = parts[0];
      const dateMatch = parts[1].match(/(\d+)\.\s*(\d+)\./);
      if (!dateMatch) return;

      const resolvedDate = resolveDisplayedDate(dateMatch[1], dateMatch[2]);
      headers.push({
        label: dayToken,
        top: readStyleNumber(element, "top"),
        date: formatDate(resolvedDate),
      });
    });

    return headers.sort((left, right) => left.top - right.top);
  }

  function parseWeeklyTimetable() {
    const root = findTimetableRoot();
    if (!root) return null;

    const title = root.querySelector("div[style*='font-size: 32px']");
    const weekLabelElement = root.querySelector("div[style*='width: 80px'][style*='height: 45px']");
    const periodHeaders = parsePeriodHeaders(root);
    const dayHeaders = parseDayHeaders(root);
    if (!weekLabelElement || periodHeaders.length === 0 || dayHeaders.length === 0) return null;

    const grid = Array.from(root.querySelectorAll("div")).find((element) => {
      const absoluteChildren = element.querySelectorAll(":scope > div[style*='position: absolute']");
      const lessonBlocks = element.querySelectorAll(".tt-cell");
      return absoluteChildren.length > 5 && lessonBlocks.length > 5;
    });
    if (!grid) return null;

    const rowContainers = Array.from(grid.querySelectorAll(":scope > div[style*='position: absolute'][style*='overflow: visible']"))
      .filter((element) => element.querySelector(":scope > div.tt-cell"))
      .sort((left, right) => readStyleNumber(left, "top") - readStyleNumber(right, "top"));

    const lessons = [];

    rowContainers.forEach((rowContainer, dayIndex) => {
      const rowTop = readStyleNumber(rowContainer, "top");
      const dayHeader = dayHeaders[dayIndex]
        || dayHeaders
          .slice()
          .sort((left, right) => Math.abs(left.top - rowTop) - Math.abs(right.top - rowTop))[0];
      if (!dayHeader?.date) return;

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
    while (Date.now() - startedAt < timeoutMs) {
      const parsed = parseWeeklyTimetable();
      if (parsed && parsed.lessons.length > 0) return parsed;
      await delay(250);
    }
    return null;
  }

  async function clickWeekNavigator(direction) {
    const targetText = direction > 0 ? ">>" : "<<";
    const control = Array.from(document.querySelectorAll("span")).find((element) => element.textContent.trim() === targetText);
    if (!control) {
      throw new Error(`Could not find timetable navigation control: ${targetText}`);
    }

    const before = readWeekSignature();
    control.click();

    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
      const after = readWeekSignature();
      if (after && after !== before) return true;
      await delay(250);
    }

    throw new Error(`Timetable did not change after clicking ${targetText}.`);
  }

  chrome.runtime.sendMessage({
    type: "ee-google-calendar-page-context",
    origin: window.location.origin,
    href: window.location.href,
  }, () => {
    void chrome.runtime.lastError;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "ee-extract-timetable-week") return false;

    (async () => {
      if (!window.location.href.includes("mode=timetable")) {
        throw new Error("The hidden tab is not on the EduPage timetable page.");
      }

      await waitForTimetableReady();
      const steps = Number.parseInt(message.steps, 10) || 0;
      if (steps !== 0) {
        const direction = steps > 0 ? 1 : -1;
        for (let index = 0; index < Math.abs(steps); index += 1) {
          await clickWeekNavigator(direction);
          await waitForTimetableReady();
        }
      }

      const parsed = await waitForTimetableReady();
      if (!parsed) {
        throw new Error("EduPage timetable did not finish rendering.");
      }

      sendResponse({
        ok: true,
        data: {
          weekLabel: parsed.weekLabel,
          classLabel: parsed.classLabel,
          dayHeaders: parsed.dayHeaders,
          lessons: parsed.lessons,
        },
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "Could not extract EduPage timetable.",
      });
    });

    return true;
  });
})();
