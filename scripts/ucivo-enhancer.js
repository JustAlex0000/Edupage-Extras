(function () {
  "use strict";

  if (window.top !== window) return;
  if (!/^\/elearning\//i.test(window.location.pathname)) return;

  const UCIVO_EXPORT_KEY = "eeUcivoExportEnabled";
  const BUTTONS_ID = "ee-ucivo-export-buttons";
  let ucivoExportEnabled = true;
  let observerTimer = null;

  function getMessage(key, fallback) {
    try {
      return chrome.i18n.getMessage(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function extractDate(text) {
    const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text || "");
    if (!match) return "";
    const [, day, month, year] = match;
    return `${day.padStart(2, "0")}.${month.padStart(2, "0")}.${year}`;
  }

  function subjectLabel() {
    // Hero block holds an H1 ("Učivo predmetu") followed by a div with the
    // subject itself, e.g. "matematika · II.SA".
    const hero = document.querySelector(".pbrowser-hero-title");
    if (hero) {
      const sub = hero.querySelector("h1 ~ *");
      if (sub && sub.textContent.trim()) return sub.textContent.trim();
    }
    const fixed = document.querySelector(".pbrowser-fixed-title-content");
    if (fixed && fixed.textContent.trim()) return fixed.textContent.trim();
    return "";
  }

  function collectPlanData() {
    const groups = [];
    document.querySelectorAll(".pbrowser-group").forEach((groupEl) => {
      const heading = groupEl.querySelector("h2");
      const group = {
        title: heading ? heading.textContent.trim() : "",
        chapters: [],
      };
      let chapter = null;
      groupEl.querySelectorAll(".pbrowser-chapter, .pbrowser-boxes").forEach((el) => {
        if (el.classList.contains("pbrowser-chapter")) {
          const h3 = el.querySelector("h3");
          chapter = {
            title: h3 ? h3.textContent.trim() : "",
            topics: [],
          };
          group.chapters.push(chapter);
          return;
        }
        el.querySelectorAll(".pbrowser-topic-box").forEach((box) => {
          const titleEl = box.querySelector(".pbrowser-box-title");
          const metaEl = box.querySelector(".pbrowser-box-numCards");
          if (!titleEl) return;
          if (!chapter) {
            chapter = { title: "", topics: [] };
            group.chapters.push(chapter);
          }
          chapter.topics.push({
            title: titleEl.textContent.trim(),
            date: extractDate(metaEl ? metaEl.textContent : ""),
            taught: box.classList.contains("isTaught"),
          });
        });
      });
      group.chapters = group.chapters.filter((ch) => ch.topics.length > 0);
      if (group.chapters.length > 0) groups.push(group);
    });
    return groups;
  }

  function formatStamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function buildTxt(subject, groups) {
    const lines = [];
    lines.push(subject ? `Učivo — ${subject}` : "Učivo");
    lines.push(`Export: ${formatStamp(new Date())}`);
    groups.forEach((group) => {
      lines.push("");
      lines.push(`== ${group.title || "—"} ==`);
      group.chapters.forEach((chapter) => {
        if (chapter.title) lines.push(`${chapter.title}:`);
        chapter.topics.forEach((topic) => {
          const date = topic.date ? `${topic.date}  ` : "";
          lines.push(`  - ${date}${topic.title}`);
        });
      });
    });
    return lines.join("\n") + "\n";
  }

  function csvEscape(value) {
    return EE.csvEscape(value);
  }

  function buildCsv(subject, groups) {
    const rows = [["subject", "section", "chapter", "date", "topic", "taught"]];
    groups.forEach((group) => {
      group.chapters.forEach((chapter) => {
        chapter.topics.forEach((topic) => {
          rows.push([
            subject,
            group.title,
            chapter.title,
            topic.date,
            topic.title,
            topic.taught ? "1" : "0",
          ]);
        });
      });
    });
    return "﻿" + rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
  }

  function downloadFile(filename, mime, content) {
    EE.downloadTextFile(filename, mime, content);
  }

  function slugify(text) {
    return String(text || "ucivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ucivo";
  }

  function handleExport(format) {
    const groups = collectPlanData();
    if (groups.length === 0) return;
    const subject = subjectLabel();
    const base = `ucivo-${slugify(subject)}-${formatStamp(new Date())}`;
    if (format === "csv") {
      downloadFile(`${base}.csv`, "text/csv;charset=utf-8", buildCsv(subject, groups));
    } else {
      downloadFile(`${base}.txt`, "text/plain;charset=utf-8", buildTxt(subject, groups));
    }
  }

  function makeExportLink(label, format) {
    const link = document.createElement("a");
    link.href = "#";
    link.className = "actionButton";
    link.textContent = label;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      handleExport(format);
    });
    return link;
  }

  function removeButtons() {
    const existing = document.getElementById(BUTTONS_ID);
    if (existing) existing.remove();
  }

  function ensureButtons() {
    if (!ucivoExportEnabled) {
      removeButtons();
      return;
    }
    if (document.getElementById(BUTTONS_ID)) return;

    const actions = document.querySelector(".etest-pbrowser-collapseActions");
    if (!actions) return;
    if (!document.querySelector(".pbrowser-topic-box")) return;

    const wrap = document.createElement("span");
    wrap.id = BUTTONS_ID;
    wrap.appendChild(
      makeExportLink(getMessage("ucivoExportTxt", "Export (.txt)"), "txt")
    );
    wrap.appendChild(
      makeExportLink(getMessage("ucivoExportCsv", "Export (.csv)"), "csv")
    );
    wrap.querySelectorAll("a").forEach((a) => {
      a.style.marginLeft = "12px";
    });
    actions.appendChild(wrap);
  }

  function scheduleEnsure() {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      ensureButtons();
    }, 150);
  }

  function initObserver() {
    const observer = new MutationObserver(scheduleEnsure);
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function initStorage() {
    chrome.storage.local.get([UCIVO_EXPORT_KEY], (result) => {
      ucivoExportEnabled = result[UCIVO_EXPORT_KEY] !== false;
      ensureButtons();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes[UCIVO_EXPORT_KEY]) return;
      ucivoExportEnabled = changes[UCIVO_EXPORT_KEY].newValue !== false;
      ensureButtons();
    });
  }

  function init() {
    initStorage();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
