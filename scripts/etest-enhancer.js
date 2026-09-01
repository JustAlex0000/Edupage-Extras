(function () {
  "use strict";

  const IS_TEST = globalThis.__EE_TEST__ === true;
  if (!IS_TEST && window.top !== window) return;
  if (!IS_TEST && !/^\/elearning\//i.test(window.location.pathname)) return;

  const ETEST_COPY_KEY = "eeEtestCopyEnabled";
  const ETEST_QUESTION_BUTTONS_KEY = "eeEtestQuestionButtonsEnabled";
  const ETEST_WHOLE_TEST_BUTTON_KEY = "eeEtestWholeTestButtonEnabled";
  const ETEST_INCLUDE_ANSWERS_KEY = "eeEtestIncludeAnswers";
  const ETEST_INCLUDE_IMAGES_KEY = "eeEtestIncludeImages";
  const AI_HELPER_ENABLED_KEY = "eeAiQuestionHelperEnabled";
  const AI_HELPER_MESSAGES_KEY = "eeAiHelperMessagesEnabled";
  const AI_ANSWER_MODE_KEY = "eeAiAnswerMode";
  const AI_VISUAL_FALLBACK_KEY = "eeAiVisualFallbackEnabled";
  const COPY_BTN_CLASS = "ee-etest-question-copy-btn";
  const COPY_ALL_BTN_CLASS = "ee-etest-copyall-btn";
  const AI_BTN_CLASS = "ee-etest-ai-btn";
  const AI_BADGE_CLASS = "ee-etest-ai-badge";
  const AI_HINT_CLASS = "ee-etest-ai-hint";
  const AI_NOTE_CLASS = "ee-etest-ai-note";
  const AI_SUGGESTED_CLASS = "ee-etest-ai-suggested";
  const AI_MATCH_PORT_ID = "ee-etest-ai-match-port";
  const AI_MATCH_EVENT = "ee-etest-ai-apply-matches";
  const STYLE_ID = "ee-etest-copy-style";
  const BLANK_MARKER = "___";
  const SELECTED_MARKER_TOKEN = "\ue000ee-selected\ue001";
  const SELECTED_MARKER_HTML = "<!--ee-selected-choice-->";
  const EXCLUDED_CLASSES = new Set([
    "etest-question-title",
    "etest-question-playactions",
    "etest-question-clearbtn",
    "etest-question-reportbtn",
    COPY_BTN_CLASS,
    COPY_ALL_BTN_CLASS,
    AI_BTN_CLASS,
    AI_BADGE_CLASS,
    AI_HINT_CLASS,
    AI_NOTE_CLASS,
  ]);
  const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DL", "DT", "DD",
    "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6",
    "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION",
    "TABLE", "TBODY", "TFOOT", "THEAD", "UL",
  ]);
  const SAFE_HTML_TAGS = new Set([
    "B", "BLOCKQUOTE", "CODE", "DIV", "EM", "I", "LI", "OL", "P", "PRE",
    "S", "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH",
    "THEAD", "TR", "U", "UL",
  ]);
  const BLANK_INPUT_TYPES = new Set([
    "", "date", "datetime-local", "email", "month", "number",
    "search", "tel", "text", "time", "url", "week",
  ]);
  const ANSWER_INPUT_TYPES = new Set([...BLANK_INPUT_TYPES].filter((type) => type !== "password"));

  let etestCopyEnabled = false;
  let questionButtonsEnabled = true;
  let wholeTestButtonEnabled = true;
  let includeSelectedAnswers = true;
  let includeWholeTestImages = true;
  let aiHelperEnabled = false;
  let aiHelperMessagesEnabled = false;
  let aiAnswerMode = "buttons";
  let aiVisualFallbackEnabled = false;
  let aiMatchRequestSequence = 0;
  let observerTimer = null;
  let snapshotTimer = null;
  let seenSequence = 0;
  let activeTestScope = "";
  let activePlayerRoot = null;
  let lastAiQuestionContent = null;
  const seenQuestions = new Map();

  function getMessage(key, fallback, substitutions) {
    try {
      return chrome.i18n.getMessage(key, substitutions) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function decodeBasicEntities(value) {
    const decodeCodePoint = (raw, radix) => {
      const codePoint = parseInt(raw, radix);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    };
    return String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(code, 10))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => decodeCodePoint(code, 16))
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'");
  }

  function normalizeInlineText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .trim();
  }

  function normalizeStructuredText(value) {
    const lines = String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => normalizeInlineText(line));
    const output = [];
    lines.forEach((line) => {
      if (line) {
        output.push(line);
      } else if (output.length && output[output.length - 1] !== "") {
        output.push("");
      }
    });
    while (output[0] === "") output.shift();
    while (output[output.length - 1] === "") output.pop();
    return output.join("\n");
  }

  function hasClass(element, className) {
    if (!element || !className) return false;
    if (element.classList && typeof element.classList.contains === "function") {
      return element.classList.contains(className);
    }
    return String(element.className || "").split(/\s+/).includes(className);
  }

  function shouldExcludeElement(element) {
    if (!element || element.nodeType !== 1) return false;
    for (const className of EXCLUDED_CLASSES) {
      if (hasClass(element, className)) return true;
    }
    return ["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(element.tagName);
  }

  function getOptionText(option) {
    if (!option) return "";
    const visible = normalizeInlineText(option.textContent || option.label || "");
    if (visible) return visible;
    const htmlText = typeof option.getAttribute === "function"
      ? option.getAttribute("data-htmltext")
      : option.dataHtmlText;
    return normalizeInlineText(decodeBasicEntities(htmlText));
  }

  function isPlaceholderOption(option, index = 0) {
    const text = getOptionText(option);
    const normalized = text.toLocaleLowerCase();
    if (!text) return true;
    if (/^-{1,}\s*.*\s*-{1,}$/.test(text)) return true;
    if (/^(choose|select|pick|vyber|vyberte|zvoľ|zvolte|zvolte|vyberte|vyberte)\b/u.test(normalized)) return true;
    const value = option && option.value != null ? String(option.value) : "";
    return index === 0 && !value && (option.disabled || option.hidden || option.selected);
  }

  function getChoiceLabels(select) {
    const options = Array.from((select && select.options) || []);
    const seen = new Set();
    return options.reduce((labels, option, index) => {
      if (isPlaceholderOption(option, index)) return labels;
      const label = getOptionText(option);
      if (!label || seen.has(label)) return labels;
      seen.add(label);
      labels.push(label);
      return labels;
    }, []);
  }

  function selectedOptionLabels(select) {
    const options = Array.from((select && select.options) || []);
    return options
      .filter((option, index) => option.selected && !isPlaceholderOption(option, index))
      .map(getOptionText)
      .filter(Boolean);
  }

  function sanitizeImageSource(source) {
    if (!source) return "";
    if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) {
      return source.replace(/\s+/g, "");
    }
    try {
      const url = new URL(source, typeof document !== "undefined" ? document.baseURI : undefined);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function sanitizeLinkTarget(target) {
    if (!target) return "";
    try {
      const url = new URL(target, typeof document !== "undefined" ? document.baseURI : undefined);
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function serializeChildren(node, includeImages) {
    return Array.from(node.childNodes || []).reduce((result, child) => {
      const serialized = serializeNode(child, includeImages);
      result.plain += serialized.plain;
      result.html += serialized.html;
      return result;
    }, { plain: "", html: "" });
  }

  function formatAnswerOptionText(value) {
    return normalizeInlineText(value).replace(/^([A-Za-z]|\d+)\s*[).:-]\s*/, "$1) ");
  }

  function isSelectedChoice(element) {
    if (!element || !hasClass(element, "etest-alist-answer")) return false;
    if (element.getAttribute) {
      if (element.getAttribute("aria-checked") === "true") return true;
      if (element.getAttribute("aria-selected") === "true") return true;
    }
    if (["selected", "checked", "isSelected", "is-selected"].some((name) => hasClass(element, name))) {
      return true;
    }
    return Boolean(
      typeof element.querySelector === "function"
      && element.querySelector("input[type='checkbox']:checked, input[type='radio']:checked"),
    );
  }

  function serializeNode(node, includeImages) {
    if (!node) return { plain: "", html: "" };
    if (node.nodeType === 3) {
      return { plain: node.nodeValue || "", html: escapeHtml(node.nodeValue || "") };
    }
    if (node.nodeType !== 1 || shouldExcludeElement(node)) return { plain: "", html: "" };

    const tagName = String(node.tagName || "").toUpperCase();
    if (tagName === "BR") return { plain: "\n", html: "<br>" };
    if (tagName === "SELECT") {
      const choices = getChoiceLabels(node);
      if (!choices.length) return { plain: BLANK_MARKER, html: `<span>${BLANK_MARKER}</span>` };
      const label = `[${choices.join(" / ")}]`;
      return { plain: label, html: `<span>${escapeHtml(label)}</span>` };
    }
    if (tagName === "TEXTAREA") {
      return { plain: BLANK_MARKER, html: `<span>${BLANK_MARKER}</span>` };
    }
    if (tagName === "INPUT") {
      const type = String(node.type || (node.getAttribute && node.getAttribute("type")) || "").toLowerCase();
      if (BLANK_INPUT_TYPES.has(type)) {
        return { plain: BLANK_MARKER, html: `<span>${BLANK_MARKER}</span>` };
      }
      return { plain: "", html: "" };
    }
    if (tagName === "IMG") {
      if (!includeImages) return { plain: "", html: "" };
      const source = sanitizeImageSource(node.currentSrc || node.src || (node.getAttribute && node.getAttribute("src")));
      if (!source) return { plain: "", html: "" };
      const alt = normalizeInlineText(node.alt || (node.getAttribute && node.getAttribute("alt")) || "");
      return {
        plain: alt ? `\n[${alt}]\n` : "\n",
        html: `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;">`,
      };
    }

    if ((hasClass(node, "etest-answer-input-field-outer") || hasClass(node, "etest-agroups-select-outer"))
      && typeof node.querySelector === "function") {
      const select = node.querySelector("select");
      if (select) return serializeNode(select, includeImages);
    }

    if (hasClass(node, "etest-pair-item") && typeof node.querySelector === "function") {
      const left = node.querySelector(".pair-l");
      const right = node.querySelector(".pair-r");
      if (left && right) {
        const leftValue = serializeNode(left, includeImages);
        const rightValue = serializeNode(right, includeImages);
        const leftPlain = normalizeStructuredText(leftValue.plain).replace(/\n+/g, " ");
        const rightPlain = normalizeStructuredText(rightValue.plain).replace(/\n+/g, " ");
        return {
          plain: `${leftPlain} → ${rightPlain}\n`,
          html: `<div>${leftValue.html} → ${rightValue.html}</div>`,
        };
      }
    }

    if (tagName === "TR") {
      const cells = Array.from(node.childNodes || []).filter((child) => ["TD", "TH"].includes(child.tagName));
      const values = cells.map((cell) => serializeChildren(cell, includeImages));
      return {
        plain: `${values.map((value) => normalizeStructuredText(value.plain).replace(/\n+/g, " ")).join("\t")}\n`,
        html: `<tr>${values.map((value, index) => `<${cells[index].tagName.toLowerCase()}>${value.html}</${cells[index].tagName.toLowerCase()}>`).join("")}</tr>`,
      };
    }

    const children = serializeChildren(node, includeImages);
    if (hasClass(node, "etest-answer-num")) {
      return { plain: `${children.plain} `, html: `${children.html} ` };
    }
    if (hasClass(node, "etest-alist-answer")) {
      const line = formatAnswerOptionText(normalizeStructuredText(children.plain).replace(/\n+/g, " "));
      const selectedPlain = isSelectedChoice(node) ? ` ${SELECTED_MARKER_TOKEN}` : "";
      const selectedHtml = isSelectedChoice(node) ? SELECTED_MARKER_HTML : "";
      return {
        plain: line ? `${line}${selectedPlain}\n` : "",
        html: line ? `<div>${children.html}${selectedHtml}</div>` : "",
      };
    }
    if (hasClass(node, "etest-alist-abcd")) {
      return {
        plain: `\n\n${normalizeStructuredText(children.plain)}`,
        html: `<div>${children.html}</div>`,
      };
    }

    if (tagName === "A") {
      const href = sanitizeLinkTarget(node.href || (node.getAttribute && node.getAttribute("href")));
      return {
        plain: children.plain,
        html: href ? `<a href="${escapeHtml(href)}">${children.html}</a>` : children.html,
      };
    }

    if (BLOCK_TAGS.has(tagName)) {
      const safeTag = SAFE_HTML_TAGS.has(tagName) ? tagName.toLowerCase() : "div";
      return {
        plain: `\n${children.plain}\n`,
        html: `<${safeTag}>${children.html}</${safeTag}>`,
      };
    }
    if (SAFE_HTML_TAGS.has(tagName)) {
      const safeTag = tagName.toLowerCase();
      return { plain: children.plain, html: `<${safeTag}>${children.html}</${safeTag}>` };
    }
    return children;
  }

  function extractElementText(element) {
    return normalizeStructuredText(serializeNode(element, false).plain)
      .replaceAll(SELECTED_MARKER_TOKEN, "")
      .replace(/\n+/g, " ")
      .trim();
  }

  function collectSelectedAnswers(content) {
    if (!content || typeof content.querySelectorAll !== "function") return [];
    const answers = [];
    const sources = new Set();
    const addAnswer = (value, source) => {
      const normalized = normalizeInlineText(value);
      if (!normalized || sources.has(source)) return;
      sources.add(source);
      answers.push(normalized);
    };

    content.querySelectorAll("input, textarea, select").forEach((control, index) => {
      const tagName = String(control.tagName || "").toUpperCase();
      const type = String(control.type || "").toLowerCase();
      if (tagName === "SELECT") {
        selectedOptionLabels(control).forEach((label, optionIndex) => addAnswer(label, `select-${index}-${optionIndex}`));
      } else if (tagName === "TEXTAREA" || (tagName === "INPUT" && ANSWER_INPUT_TYPES.has(type))) {
        addAnswer(control.value, `field-${index}`);
      } else if (tagName === "INPUT" && ["checkbox", "radio"].includes(type) && control.checked) {
        const host = typeof control.closest === "function"
          ? control.closest(".etest-alist-answer, label")
          : null;
        if (!host || !hasClass(host, "etest-alist-answer")) {
          addAnswer(host ? extractElementText(host) : control.value, `check-${index}`);
        }
      }
    });

    content.querySelectorAll(".etest-alist-ordering").forEach((list, index) => {
      const order = Array.from(list.querySelectorAll(".etest-alist-answer"))
        .map(extractElementText)
        .filter(Boolean);
      if (order.length) addAnswer(order.join(" → "), `order-${index}`);
    });

    content.querySelectorAll(".etest-pair-item").forEach((pair, index) => {
      const left = pair.querySelector(".pair-l");
      const right = pair.querySelector(".pair-r");
      const leftText = left ? extractElementText(left) : "";
      const rightText = right ? extractElementText(right) : "";
      if (leftText && rightText) addAnswer(`${leftText} → ${rightText}`, `pair-${index}`);
    });
    return answers;
  }

  function getQuestionNumber(content) {
    if (!content || typeof content.querySelector !== "function") return "";
    const number = content.querySelector(".etest-question-number-value, .etest-question-number-result, .etest-question-number-title");
    return normalizeInlineText(number && number.textContent).replace(/[^\p{L}\p{N}._-]+/gu, "");
  }

  function getQuestionIdentity(content, index, plainBody) {
    const explicitKeys = ["data-cardid", "data-questionid", "data-question-id", "data-id", "data-eid"];
    for (const key of explicitKeys) {
      const value = content && typeof content.getAttribute === "function" ? content.getAttribute(key) : "";
      if (value) return `${key}:${value}`;
    }
    const number = getQuestionNumber(content);
    if (number) return `number:${number}`;
    return `position:${index}:${plainBody.slice(0, 120)}`;
  }

  function getQuestionType(content) {
    if (!content || typeof content.querySelector !== "function") return "question";
    const types = [
      ["ordering", ".etest-alist-ordering"],
      ["matching", ".etest-pair-item"],
      ["choice", ".etest-alist-answer"],
      ["dropdown", "select"],
      ["fill-in", "textarea, input:not([type='radio']):not([type='checkbox'])"],
    ].filter(([, selector]) => content.querySelector(selector)).map(([type]) => type);
    if (types.includes("ordering")) return "ordering";
    if (types.includes("matching")) return "matching";
    if (types.length > 1) return "mixed";
    if (types.length) return types[0];
    return "question";
  }

  function isBlankControl(control) {
    if (String(control?.tagName || "").toUpperCase() === "TEXTAREA") return true;
    return BLANK_INPUT_TYPES.has(String(control?.type || "").toLowerCase());
  }

  function getQuestionInteractionData(content, type) {
    if (!content || typeof content.querySelectorAll !== "function") return {};
    const interactionData = {};
    if (type === "choice" || type === "ordering" || type === "mixed") {
      interactionData.options = Array.from(content.querySelectorAll(".etest-alist-answer"))
        .map(extractElementText)
        .filter(Boolean);
    }
    if (type === "dropdown" || type === "mixed") {
      interactionData.dropdowns = Array.from(content.querySelectorAll("select"))
        .map(getChoiceLabels)
        .filter((choices) => choices.length);
    }
    if (type === "fill-in" || type === "mixed") {
      interactionData.blanks = Array.from(content.querySelectorAll("textarea, input"))
        .filter(isBlankControl)
        .length;
    }
    if (type === "matching") {
      interactionData.pairs = Array.from(content.querySelectorAll(".etest-pair-item"))
        .map((pair) => {
          const left = pair.querySelector(".pair-l");
          const right = pair.querySelector(".pair-r");
          return left && right ? [extractElementText(left), extractElementText(right)] : null;
        })
        .filter((pair) => pair && pair[0] && pair[1]);
    }
    return interactionData;
  }

  function buildQuestionModel(content, index = 0) {
    const withoutImages = serializeNode(content, false);
    const withImages = serializeNode(content, true);
    const plainBody = normalizeStructuredText(withoutImages.plain);
    const type = getQuestionType(content);
    return {
      identity: getQuestionIdentity(content, index, plainBody),
      number: getQuestionNumber(content),
      plainBody,
      htmlBody: withImages.html,
      htmlBodyWithoutImages: withoutImages.html,
      answers: collectSelectedAnswers(content),
      type,
      interactionData: getQuestionInteractionData(content, type),
      order: index,
    };
  }

  function renderAnswerPlain(answers) {
    const label = getMessage("etestSelectedAnswer", "Selected answer");
    if (!answers.length) return "";
    if (answers.length === 1) return `${label}: ${answers[0]}`;
    return `${label}:\n${answers.map((answer) => `- ${answer}`).join("\n")}`;
  }

  function renderQuestionPlain(model, options = {}) {
    const prefix = options.numbered ? `${options.index + 1}. ` : "";
    const marker = `(${getMessage("etestSelectedMarker", "selected")})`;
    const body = String(model.plainBody || "").replaceAll(
      ` ${SELECTED_MARKER_TOKEN}`,
      options.includeAnswers ? ` ${marker}` : "",
    );
    const sections = [`${prefix}${body}`.trim()];
    const answer = options.includeAnswers ? renderAnswerPlain(model.answers || []) : "";
    if (answer) sections.push(answer);
    return `${sections.filter(Boolean).join("\n\n")}\n`;
  }

  function renderAnswerHtml(answers) {
    const label = escapeHtml(getMessage("etestSelectedAnswer", "Selected answer"));
    if (!answers.length) return "";
    if (answers.length === 1) return `<p><strong>${label}:</strong> ${escapeHtml(answers[0])}</p>`;
    return `<div><strong>${label}:</strong><ul>${answers.map((answer) => `<li>${escapeHtml(answer)}</li>`).join("")}</ul></div>`;
  }

  function renderQuestionHtml(model, options = {}) {
    const number = options.numbered ? `<strong>${options.index + 1}. </strong>` : "";
    const selectedMarker = ` <span>(${escapeHtml(getMessage("etestSelectedMarker", "selected"))})</span>`;
    const body = String(options.includeImages ? model.htmlBody : model.htmlBodyWithoutImages).replaceAll(
      SELECTED_MARKER_HTML,
      options.includeAnswers ? selectedMarker : "",
    );
    const answer = options.includeAnswers ? renderAnswerHtml(model.answers || []) : "";
    const type = escapeHtml(model.type || "question");
    const interactionData = encodeURIComponent(JSON.stringify(model.interactionData || {}));
    return `<section data-ee-question-type="${type}" data-ee-question-data="${escapeHtml(interactionData)}">${number}${body}${answer}</section>`;
  }

  function renderTestPayload(models, options = {}) {
    const plain = models.map((model, index) => renderQuestionPlain(model, {
      numbered: true,
      index,
      includeAnswers: options.includeAnswers,
    }).trimEnd()).join("\n\n") + (models.length ? "\n" : "");
    const html = models.map((model, index) => renderQuestionHtml(model, {
      numbered: true,
      index,
      includeAnswers: options.includeAnswers,
      includeImages: options.includeImages,
    })).join("<hr>");
    return { plain, html };
  }

  function writePlainText(text) {
    const copyWithLegacyCommand = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
      (document.body || document.documentElement).appendChild(textarea);
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } finally {
        textarea.remove();
      }
      return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard copy was rejected"));
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).catch(copyWithLegacyCommand);
    }
    return copyWithLegacyCommand();
  }

  function writeClipboard(payload) {
    const canWriteRich = navigator.clipboard
      && typeof navigator.clipboard.write === "function"
      && typeof ClipboardItem === "function"
      && typeof Blob === "function";
    if (!canWriteRich || !payload.html) return writePlainText(payload.plain);
    const item = new ClipboardItem({
      "text/plain": new Blob([payload.plain], { type: "text/plain" }),
      "text/html": new Blob([payload.html], { type: "text/html" }),
    });
    return navigator.clipboard.write([item]).catch(() => writePlainText(payload.plain));
  }

  function flashFeedback(button, icon, status, ok, successMessage) {
    const originalClass = icon.className;
    const originalLabel = button.getAttribute("aria-label") || "";
    const message = ok
      ? (successMessage || getMessage("etestCopySucceeded", "Copied"))
      : getMessage("etestCopyFailed", "Copy failed");
    icon.className = ok ? "fa fa-fw fa-check" : "fa fa-fw fa-times";
    button.classList.add(ok ? "ee-copy-ok" : "ee-copy-fail");
    button.setAttribute("aria-label", message);
    button.title = message;
    status.textContent = message;
    setTimeout(() => {
      icon.className = originalClass;
      button.classList.remove("ee-copy-ok", "ee-copy-fail");
      button.setAttribute("aria-label", originalLabel);
      button.title = originalLabel;
      status.textContent = "";
    }, 1200);
  }

  function createIconButton(className, label, iconClass = "fa fa-fw fa-copy") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.title = label;
    button.setAttribute("aria-label", label);
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    const status = document.createElement("span");
    status.className = "ee-etest-copy-status";
    status.setAttribute("aria-live", "polite");
    button.appendChild(icon);
    button.appendChild(status);
    return { button, icon, status };
  }

  function refreshTestScope() {
    const locationKey = `${window.location.pathname}${window.location.search}`;
    const playerRoot = document.querySelector(".etest-player");
    const playerChanged = activePlayerRoot && playerRoot && playerRoot !== activePlayerRoot;
    const routeChanged = activeTestScope && locationKey !== activeTestScope;
    if (playerChanged || routeChanged) {
      seenQuestions.clear();
      seenSequence = 0;
    }
    activePlayerRoot = playerRoot;
    activeTestScope = locationKey;
  }

  function snapshotQuestion(content, index = 0) {
    if (!content) return;
    const model = buildQuestionModel(content, index);
    if (!model.plainBody) return;
    const previous = seenQuestions.get(model.identity);
    model.seenAt = previous ? previous.seenAt : seenSequence++;
    seenQuestions.set(model.identity, model);
  }

  function snapshotVisibleQuestions() {
    refreshTestScope();
    const contents = Array.from(document.querySelectorAll(".etest-question-content"));
    contents.forEach((content, index) => {
      snapshotQuestion(content, index);
    });
    return contents;
  }

  function getSeenQuestionModels() {
    snapshotVisibleQuestions();
    return Array.from(seenQuestions.values())
      .filter((model) => model.plainBody)
      .sort((a, b) => {
        const aNumber = Number.parseFloat(a.number);
        const bNumber = Number.parseFloat(b.number);
        if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
        return a.seenAt - b.seenAt;
      });
  }

  function clearAiSuggestion(content) {
    if (!content || typeof content.querySelectorAll !== "function") return;
    content.querySelectorAll(`.${AI_BADGE_CLASS}, .${AI_HINT_CLASS}, .${AI_NOTE_CLASS}`).forEach((element) => element.remove());
    content.querySelectorAll("[data-ee-ai-suggestion]").forEach(clearAiControlSuggestion);
    content.querySelectorAll(`.${AI_SUGGESTED_CLASS}`).forEach((element) => {
      element.classList.remove(AI_SUGGESTED_CLASS);
    });
  }

  function getBlankControls(content) {
    if (!content || typeof content.querySelectorAll !== "function") return [];
    return Array.from(content.querySelectorAll("textarea, input"))
      .filter(isBlankControl);
  }

  function getDropdownOption(select, answerIndex) {
    return Array.from((select && select.options) || [])
      .filter((option, index) => !isPlaceholderOption(option, index))[answerIndex] || null;
  }

  function setControlValue(control, value) {
    control.value = value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncDropdownDisplay(select, option) {
    if (!select || !option || typeof select.closest !== "function") return;
    const host = select.closest(".etest-answer-input-field-outer");
    const buttonId = select.id ? `${select.id}-button` : "";
    const button = buttonId && typeof select.ownerDocument?.getElementById === "function"
      ? select.ownerDocument.getElementById(buttonId)
      : null;
    const label = button?.querySelector?.(".ui-selectmenu-text")
      || host?.querySelector?.(".ui-selectmenu-text")
      || select.parentElement?.querySelector?.(".ui-selectmenu-text");
    if (!label) return;
    label.textContent = getOptionText(option);
    if (label.classList && typeof label.classList.add === "function") {
      label.classList.add("ee-etest-ai-filled-select");
    }
  }

  function getMatchingRows(content) {
    return Array.from(content.querySelectorAll(".etest-pair-item"));
  }

  function getOrderingRows(content) {
    return Array.from(content.querySelectorAll(".etest-alist-ordering .etest-alist-answer"));
  }

  function hasOrderingAnswer(content) {
    return getOrderingRows(content).some((row, index) => Number.parseInt(row.dataset?.ind, 10) !== index);
  }

  function hasMatchingAnswer(content) {
    return getMatchingRows(content).some((row) => hasClass(row, "isConnected"));
  }

  function dispatchMouseDrag(source, target, { before = false } = {}) {
    if (!source || !target || typeof source.getBoundingClientRect !== "function") return false;
    const sourceBox = source.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    if (!sourceBox.width || !sourceBox.height || !targetBox.width || !targetBox.height) return false;
    const startX = sourceBox.left + (sourceBox.width / 2);
    const startY = sourceBox.top + (sourceBox.height / 2);
    const endX = targetBox.left + (targetBox.width / 2);
    const endY = targetBox.top + (targetBox.height * (before ? 0.2 : 0.5));
    const mouse = (type, x, y, buttons) => new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
    });
    const dispatch = (targetNode, type, x, y, buttons) => {
      const event = mouse(type, x, y, buttons);
      try {
        Object.defineProperty(event, "which", { value: buttons ? 1 : 0 });
      } catch (_) {
        // Browsers with a non-configurable MouseEvent.which derive it from button.
      }
      targetNode.dispatchEvent(event);
    };
    dispatch(source, "mousedown", startX, startY, 1);
    dispatch(document, "mousemove", startX + Math.sign(endX - startX || 1) * 6, startY + Math.sign(endY - startY || 1) * 6, 1);
    dispatch(document, "mousemove", startX + ((endX - startX) / 2), startY + ((endY - startY) / 2), 1);
    const endTarget = typeof target.dispatchEvent === "function" ? target : document;
    dispatch(endTarget, "mousemove", endX, endY, 1);
    dispatch(endTarget, "mouseup", endX, endY, 0);
    return true;
  }

  function applyAiMatches(content, matches) {
    const rows = getMatchingRows(content);
    if (!Array.isArray(matches)) return 0;
    if (matches.length !== rows.length || hasMatchingAnswer(content)) return 0;
    const validMatches = matches.every((match) => Number.isInteger(match.left) && Number.isInteger(match.right)
      && match.left >= 0 && match.left < rows.length && match.right >= 0 && match.right < rows.length);
    if (!validMatches || new Set(matches.map((match) => match.left)).size !== rows.length
      || new Set(matches.map((match) => match.right)).size !== rows.length) return 0;
    if (!IS_TEST) return applyAiMatchesThroughPage(content, matches);
    return matches.reduce((applied, match) => {
      const source = rows[match.right].querySelector(".pair-r");
      const target = rows[match.left];
      return dispatchMouseDrag(source, target) ? applied + 1 : applied;
    }, 0);
  }

  function applyAiMatchesThroughPage(content, matches) {
    if (!content || !document.documentElement) return 0;
    let port = document.getElementById(AI_MATCH_PORT_ID);
    if (!port) {
      port = document.createElement("div");
      port.id = AI_MATCH_PORT_ID;
      port.hidden = true;
      document.documentElement.appendChild(port);
    }
    const requestId = String(++aiMatchRequestSequence);
    content.dataset.eeAiMatchRequest = requestId;
    port.dataset.request = JSON.stringify({ id: requestId, matches });
    delete port.dataset.response;
    window.dispatchEvent(new Event(AI_MATCH_EVENT));
    delete content.dataset.eeAiMatchRequest;
    try {
      const response = JSON.parse(port.dataset.response || "");
      return response.id === requestId && Number.isInteger(response.applied) ? response.applied : 0;
    } catch (_) {
      return 0;
    } finally {
      delete port.dataset.request;
      delete port.dataset.response;
    }
  }

  function applyAiOrdering(content, ordering) {
    const originalRows = getOrderingRows(content);
    if (!originalRows.length || ordering.length !== originalRows.length || hasOrderingAnswer(content)) return 0;
    const intendedRows = ordering.map((index) => originalRows[index]);
    if (intendedRows.some((row) => !row)) return 0;

    let applied = 0;
    for (let index = 0; index < intendedRows.length; index += 1) {
      const source = intendedRows[index];
      const currentRows = getOrderingRows(content);
      if (currentRows[index] === source) continue;
      const target = currentRows[index];
      if (!dispatchMouseDrag(source, target, { before: true })) return 0;
      if (getOrderingRows(content)[index] !== source) return 0;
      applied += 1;
    }
    return applied;
  }

  function clearAiControlSuggestion(control) {
    if (!control) return;
    if (control.hasAttribute("data-ee-ai-original-placeholder")) {
      control.setAttribute("placeholder", control.getAttribute("data-ee-ai-original-placeholder") || "");
      control.removeAttribute("data-ee-ai-original-placeholder");
    }
    control.removeAttribute("data-ee-ai-suggestion");
    control.classList.remove(AI_SUGGESTED_CLASS);
  }

  function showInputSuggestion(control, value) {
    if (!control || !value || String(control.value || "").trim()) return false;
    control.setAttribute("data-ee-ai-original-placeholder", control.getAttribute("placeholder") || "");
    control.setAttribute("placeholder", value);
    control.setAttribute("data-ee-ai-suggestion", value);
    return true;
  }

  function questionHasAnswer(content) {
    const hasChoice = Array.from(content.querySelectorAll(".etest-alist-answer")).some(isSelectedChoice);
    if (hasChoice) return true;
    const hasInput = getBlankControls(content).some((control) => String(control.value || "").trim());
    if (hasInput) return true;
    if (Array.from(content.querySelectorAll("select")).some((select) => selectedOptionLabels(select).length)) return true;
    if (hasOrderingAnswer(content)) return true;
    return hasMatchingAnswer(content);
  }

  function canApplyAiAnswer(content, suggestion) {
    const choiceIndexes = suggestion.choiceIndexes || [];
    const fillIns = suggestion.fillIns || [];
    const dropdownIndexes = suggestion.dropdownIndexes || [];
    const matches = suggestion.matches || [];
    const ordering = suggestion.ordering || [];
    const optionRows = Array.from(content.querySelectorAll(".etest-alist-answer"));
    const blankControls = getBlankControls(content);
    const dropdowns = Array.from(content.querySelectorAll("select"));
    const matchingRows = getMatchingRows(content);
    const isOrdering = ordering.length === optionRows.length && optionRows.length > 0;
    if (optionRows.length && !choiceIndexes.length && !isOrdering) return false;
    if (isOrdering && hasOrderingAnswer(content)) return false;
    if (blankControls.length && (fillIns.length !== blankControls.length || !fillIns.every(Boolean))) {
      return false;
    }
    if (dropdowns.length && (dropdownIndexes.length !== dropdowns.length
      || !dropdownIndexes.every(Number.isInteger))) return false;
    if (matchingRows.length && (matches.length !== matchingRows.length
      || new Set(matches.map((match) => match.left)).size !== matchingRows.length
      || new Set(matches.map((match) => match.right)).size !== matchingRows.length)) return false;
    return Boolean(optionRows.length || blankControls.length || dropdowns.length || matchingRows.length);
  }

  function applyAiAnswer(content, suggestion) {
    let applied = 0;
    const optionRows = Array.from(content.querySelectorAll(".etest-alist-answer"));
    suggestion.choiceIndexes.forEach((index) => {
      const row = optionRows[index];
      if (!row || isSelectedChoice(row)) return;
      const control = row.querySelector("input[type='radio'], input[type='checkbox']");
      if (control && !control.checked) control.click();
      else row.click();
      if (isSelectedChoice(row) || control?.checked) applied += 1;
    });

    applied += applyAiOrdering(content, suggestion.ordering || []);

    const blankControls = getBlankControls(content);
    if (blankControls.length && suggestion.fillIns.length === blankControls.length && suggestion.fillIns.every(Boolean)) {
      suggestion.fillIns.forEach((value, index) => {
        const control = blankControls[index];
        if (String(control.value || "").trim()) return;
        setControlValue(control, value);
        clearAiControlSuggestion(control);
        applied += 1;
      });
    }

    const dropdowns = Array.from(content.querySelectorAll("select"));
    if (dropdowns.length && suggestion.dropdownIndexes.length === dropdowns.length
      && suggestion.dropdownIndexes.every(Number.isInteger)) {
      suggestion.dropdownIndexes.forEach((answerIndex, index) => {
        const select = dropdowns[index];
        const option = getDropdownOption(select, answerIndex);
        if (!option || selectedOptionLabels(select).length) return;
        select.value = option.value;
        option.selected = true;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncDropdownDisplay(select, option);
        applied += 1;
      });
    }
    applied += applyAiMatches(content, suggestion.matches || []);
    return applied;
  }

  function makeAiBadge(text, label) {
    const badge = document.createElement("span");
    badge.className = AI_BADGE_CLASS;
    badge.textContent = text;
    if (label) badge.setAttribute("aria-label", label);
    return badge;
  }

  function appendAiNote(content, text, isError = false) {
    if (!aiHelperMessagesEnabled || !text) return;
    const note = document.createElement("div");
    note.className = AI_NOTE_CLASS;
    note.dataset.state = isError ? "error" : "suggestion";
    note.setAttribute("role", isError ? "alert" : "status");
    note.textContent = text;
    content.appendChild(note);
  }

  function appendAiDebugResponse(content, responseText) {
    if (!aiHelperMessagesEnabled || !content || !String(responseText || "").trim()) return;
    const details = document.createElement("details");
    details.className = `${AI_NOTE_CLASS} ee-etest-ai-debug-response`;
    details.dataset.state = "error";
    const summary = document.createElement("summary");
    summary.textContent = getMessage("aiSuggestionResponse", "Model response (local only)");
    const response = document.createElement("pre");
    response.textContent = responseText;
    details.append(summary, response);
    content.appendChild(details);
  }

  function applyAiSuggestion(content, suggestion, { showOrderingHint = true } = {}) {
    clearAiSuggestion(content);
    let visualCueCount = 0;
    const optionRows = Array.from(content.querySelectorAll(".etest-alist-answer"));
    suggestion.choiceIndexes.forEach((index) => {
      const row = optionRows[index];
      if (!row) return;
      row.classList.add(AI_SUGGESTED_CLASS);
      visualCueCount += 1;
    });

    if (showOrderingHint && suggestion.ordering.length === optionRows.length && optionRows.length) {
      suggestion.ordering.forEach((originalIndex, rank) => {
        const row = optionRows[originalIndex];
        if (!row) return;
        row.insertBefore(makeAiBadge(
          String(rank + 1),
          getMessage("aiSuggestedPosition", `Suggested position ${rank + 1}`, [String(rank + 1)]),
        ), row.firstChild);
        visualCueCount += 1;
      });
    }

    const blankControls = getBlankControls(content);
    suggestion.fillIns.forEach((value, index) => {
      const control = blankControls[index];
      if (showInputSuggestion(control, value)) visualCueCount += 1;
    });

    const dropdowns = Array.from(content.querySelectorAll("select"));
    suggestion.dropdownIndexes.forEach((optionIndex, index) => {
      const select = dropdowns[index];
      const value = getOptionText(getDropdownOption(select, optionIndex));
      if (!select || !value) return;
      select.classList.add(AI_SUGGESTED_CLASS);
      const hint = document.createElement("span");
      hint.className = AI_HINT_CLASS;
      hint.textContent = value;
      const host = select.closest(".etest-answer-input-field-outer") || select;
      host.insertAdjacentElement("afterend", hint);
      visualCueCount += 1;
    });

    if (suggestion.matches.length) {
      const pairs = suggestion.matches.map((match) => `${match.left + 1} → ${match.right + 1}`).join(", ");
      appendAiNote(content, pairs);
      visualCueCount += 1;
    }

    if (!visualCueCount && suggestion.answer) appendAiNote(content, suggestion.answer);
  }

  function requestAiSuggestion(content, buttonState) {
    if (!content || content.dataset.eeAiRequestPending === "true") return;
    const model = buildQuestionModel(content);
    const hadOrderingAnswer = hasOrderingAnswer(content);
    if (!model.plainBody) return;
    lastAiQuestionContent = content;
    clearAiSuggestion(content);
    content.dataset.eeAiRequestPending = "true";
    const { button, icon, status } = buttonState || {};
    const originalIconClass = icon?.className;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    if (icon) icon.className = "fa fa-fw fa-circle-o-notch fa-spin";
    if (status) status.textContent = getMessage("aiSuggestionLoading", "Getting suggestion");
    chrome.runtime.sendMessage({
      type: "ee-ai-question-suggestion",
      question: {
        plainBody: model.plainBody.replaceAll(SELECTED_MARKER_TOKEN, ""),
        type: model.type,
        interactionData: model.interactionData,
        currentAnswers: model.answers,
      },
    }, (response) => {
      delete content.dataset.eeAiRequestPending;
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      if (icon) icon.className = originalIconClass;
      if (status) status.textContent = "";
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError || !response?.ok || !response.suggestion) {
        appendAiNote(
          content,
          response?.error || getMessage("aiSuggestionFailed", "Could not get a suggestion. Check AI settings and try again."),
          true,
        );
        appendAiDebugResponse(content, response?.debugResponse);
        return;
      }
      if (!questionHasAnswer(content) && canApplyAiAnswer(content, response.suggestion)
        && applyAiAnswer(content, response.suggestion) && questionHasAnswer(content)) return;
      if (aiVisualFallbackEnabled) {
        applyAiSuggestion(content, response.suggestion, { showOrderingHint: hadOrderingAnswer });
      }
    });
  }

  function makeAiButton(playactions) {
    const label = getMessage("aiSuggestQuestion", "Suggest answer");
    const { button, icon, status } = createIconButton(
      `etest-question-copybtn ${AI_BTN_CLASS}`,
      label,
      "fa fa-fw fa-question",
    );
    button.addEventListener("click", () => {
      const content = playactions.closest(".etest-question-content");
      if (!content || button.disabled) return;
      requestAiSuggestion(content, { button, icon, status });
    });
    return button;
  }

  function makeCopyButton(playactions) {
    const label = getMessage("etestCopyQuestion", "Copy question");
    const { button, icon, status } = createIconButton(
      `etest-question-copybtn ${COPY_BTN_CLASS}`,
      label,
    );
    button.addEventListener("click", () => {
      const content = playactions.closest(".etest-question-content");
      if (!content) return;
      const model = buildQuestionModel(content);
      if (!model.plainBody) return;
      const payload = {
        plain: renderQuestionPlain(model, { includeAnswers: includeSelectedAnswers }),
        html: renderQuestionHtml(model, { includeAnswers: includeSelectedAnswers, includeImages: true }),
      };
      writeClipboard(payload)
        .then(() => flashFeedback(button, icon, status, true))
        .catch(() => flashFeedback(button, icon, status, false));
    });
    return button;
  }

  function makeCopyAllButton() {
    const label = getMessage("etestCopyAllQuestions", "Copy whole test");
    const { button, icon, status } = createIconButton(
      `etest-screen-action-btn flat-button flat-button-blue ${COPY_ALL_BTN_CLASS}`,
      label,
    );
    button.addEventListener("click", () => {
      const models = getSeenQuestionModels();
      if (!models.length) return;
      const payload = renderTestPayload(models, {
        includeAnswers: includeSelectedAnswers,
        includeImages: includeWholeTestImages,
      });
      writeClipboard(payload)
        .then(() => flashFeedback(button, icon, status, true))
        .catch(() => flashFeedback(button, icon, status, false));
    });
    return button;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const styleHost = document.head || document.documentElement;
    if (!styleHost) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${COPY_BTN_CLASS}, .${AI_BTN_CLASS} {
        align-items: center;
        box-sizing: border-box;
        cursor: pointer;
        display: inline-flex;
        justify-content: center;
        font-size: 16px;
        line-height: 1;
        position: relative;
        transition: opacity 100ms ease-out, transform 100ms ease-out;
      }
      .${COPY_BTN_CLASS} > i, .${AI_BTN_CLASS} > i {
        color: currentColor !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .${COPY_BTN_CLASS}, .${AI_BTN_CLASS} {
        appearance: none;
        background: transparent;
        border: 0;
        color: inherit;
        height: 32px;
        min-height: 0;
        min-width: 0;
        padding: 0;
        width: 32px;
      }
      .${COPY_BTN_CLASS}::before, .${AI_BTN_CLASS}::before {
        content: "";
        inset: -6px;
        position: absolute;
      }
      html.ee-dark .${COPY_BTN_CLASS}, html.ee-dark .${AI_BTN_CLASS} {
        background: transparent !important;
        border-color: transparent !important;
        color: var(--ee-text, #f5f7fa) !important;
      }
      .${COPY_BTN_CLASS}:focus-visible, .${COPY_ALL_BTN_CLASS}:focus-visible, .${AI_BTN_CLASS}:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
      .${COPY_BTN_CLASS}:active, .${AI_BTN_CLASS}:active { transform: scale(0.97); }
      .${AI_BTN_CLASS}:disabled { cursor: wait; opacity: 0.62; }
      .${AI_SUGGESTED_CLASS} {
        box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--ee-accent, #3973d6) 62%, transparent) !important;
      }
      .ee-etest-ai-filled-select {
        color: var(--ee-text, #20262e) !important;
        opacity: 1 !important;
      }
      input[data-ee-ai-suggestion]::placeholder,
      textarea[data-ee-ai-suggestion]::placeholder {
        color: color-mix(in srgb, var(--ee-text-muted, #667085) 58%, transparent);
        opacity: 0.55;
      }
      .${AI_BADGE_CLASS} {
        background: color-mix(in srgb, var(--ee-accent, #3973d6) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--ee-accent, #3973d6) 45%, transparent);
        border-radius: 4px;
        color: var(--ee-text, inherit);
        display: inline-block;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.25;
        margin: 2px 6px;
        padding: 2px 5px;
        vertical-align: middle;
      }
      .etest-alist-ordering .etest-alist-answer { position: relative; }
      .etest-alist-ordering .${AI_BADGE_CLASS} {
        margin: 0;
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
      }
      .${AI_HINT_CLASS} {
        color: var(--ee-text-muted, #667085);
        display: inline-block;
        font-size: 12px;
        margin-left: 6px;
      }
      .${AI_NOTE_CLASS} {
        border-left: 2px solid color-mix(in srgb, var(--ee-accent, #3973d6) 55%, transparent);
        color: var(--ee-text-muted, #667085);
        font-size: 12px;
        line-height: 1.45;
        margin: 8px 12px 4px;
        max-width: 70ch;
        padding: 3px 8px;
      }
      .${AI_NOTE_CLASS}[data-state="error"] {
        border-left-color: #b42318;
        color: #b42318;
      }
      .ee-etest-ai-debug-response summary {
        cursor: pointer;
      }
      .ee-etest-ai-debug-response pre {
        margin: 6px 0 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .ee-etest-copy-status {
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        height: 1px;
        overflow: hidden;
        position: absolute;
        white-space: nowrap;
        width: 1px;
      }
      @media (prefers-reduced-motion: reduce) {
        .${COPY_BTN_CLASS}, .${AI_BTN_CLASS} { transition-duration: 0.01ms; }
        .${AI_BTN_CLASS} .fa-spin { animation: none !important; }
      }
    `;
    styleHost.appendChild(style);
  }

  function removeButtons() {
    document.querySelectorAll(`.${COPY_BTN_CLASS}, .${COPY_ALL_BTN_CLASS}, .${AI_BTN_CLASS}`).forEach((element) => element.remove());
    document.querySelectorAll(".etest-question-content").forEach(clearAiSuggestion);
  }

  function ensureButtons() {
    if (!etestCopyEnabled && !aiHelperEnabled) {
      removeButtons();
      return;
    }
    ensureStyles();
    if (etestCopyEnabled) snapshotVisibleQuestions();
    document.querySelectorAll(".etest-question-playactions").forEach((playactions) => {
      if (!etestCopyEnabled || !questionButtonsEnabled) {
        playactions.querySelectorAll(`.${COPY_BTN_CLASS}`).forEach((button) => button.remove());
      } else if (!playactions.querySelector(`.${COPY_BTN_CLASS}`)) {
        playactions.insertBefore(makeCopyButton(playactions), playactions.firstChild);
      }
      if (!aiHelperEnabled || aiAnswerMode === "hotkeys") {
        playactions.querySelectorAll(`.${AI_BTN_CLASS}`).forEach((button) => button.remove());
        const content = playactions.closest(".etest-question-content");
        if (content) clearAiSuggestion(content);
      } else if (!playactions.querySelector(`.${AI_BTN_CLASS}`)) {
        const copyButton = playactions.querySelector(`.${COPY_BTN_CLASS}`);
        playactions.insertBefore(makeAiButton(playactions), copyButton?.nextSibling || playactions.firstChild);
      }
    });
    document.querySelectorAll(".etest-screen-actions").forEach((actions) => {
      if (!etestCopyEnabled || !wholeTestButtonEnabled) {
        actions.querySelectorAll(`.${COPY_ALL_BTN_CLASS}`).forEach((button) => button.remove());
        return;
      }
      if (!document.querySelector(".etest-question-content")) return;
      if (!actions.querySelector(`.${COPY_ALL_BTN_CLASS}`)) actions.appendChild(makeCopyAllButton());
    });
  }

  function scheduleEnsure() {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      ensureButtons();
    }, 150);
  }

  function scheduleSnapshotFromEvent(event) {
    if (!etestCopyEnabled || snapshotTimer) return;
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const content = target.closest(".etest-question-content");
    if (!content) return;
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      refreshTestScope();
      const visibleQuestions = Array.from(document.querySelectorAll(".etest-question-content"));
      snapshotQuestion(content, Math.max(0, visibleQuestions.indexOf(content)));
    }, 0);
  }

  function rememberAiQuestion(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const content = target.closest(".etest-question-content");
    if (content) lastAiQuestionContent = content;
  }

  function acceptAiSuggestionWithTab(event) {
    if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const control = event.target;
    if (!control || typeof control.getAttribute !== "function") return;
    const value = control.getAttribute("data-ee-ai-suggestion");
    if (!value || String(control.value || "").trim()) return;
    event.preventDefault();
    setControlValue(control, value);
    clearAiControlSuggestion(control);
  }

  function getCurrentAiQuestion() {
    if (lastAiQuestionContent && document.documentElement.contains(lastAiQuestionContent)) return lastAiQuestionContent;
    const focused = document.activeElement;
    if (focused && typeof focused.closest === "function") {
      const content = focused.closest(".etest-question-content");
      if (content) return content;
    }
    const questions = Array.from(document.querySelectorAll(".etest-question-content"));
    return questions.length === 1 ? questions[0] : null;
  }

  function snapshotBeforeNavigation(event) {
    if (!etestCopyEnabled) return;
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    if (target.closest(`.${COPY_BTN_CLASS}, .${COPY_ALL_BTN_CLASS}, .${AI_BTN_CLASS}`)) return;
    if (target.closest(".etest-player-sidebar-question, .etest-screen-action-btn, .etest-header-nav")) {
      snapshotVisibleQuestions();
    }
  }

  function initObserver() {
    if (!document.documentElement) {
      document.addEventListener("readystatechange", initObserver, { once: true });
      return;
    }
    const observer = new MutationObserver(scheduleEnsure);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
    document.addEventListener("input", scheduleSnapshotFromEvent, true);
    document.addEventListener("change", scheduleSnapshotFromEvent, true);
    document.addEventListener("focusin", rememberAiQuestion, true);
    document.addEventListener("pointerdown", rememberAiQuestion, true);
    document.addEventListener("keydown", acceptAiSuggestionWithTab, true);
    document.addEventListener("click", snapshotBeforeNavigation, true);
    document.addEventListener("click", (event) => {
      rememberAiQuestion(event);
      scheduleSnapshotFromEvent(event);
    }, false);
  }

  function resolvePreferences(values = {}) {
    return {
      copyEnabled: values[ETEST_COPY_KEY] === true,
      questionButtons: values[ETEST_QUESTION_BUTTONS_KEY] !== false,
      wholeTestButton: values[ETEST_WHOLE_TEST_BUTTON_KEY] !== false,
      selectedAnswers: values[ETEST_INCLUDE_ANSWERS_KEY] !== false,
      wholeTestImages: values[ETEST_INCLUDE_IMAGES_KEY] !== false,
      aiHelper: values[AI_HELPER_ENABLED_KEY] === true,
      aiHelperMessages: values[AI_HELPER_MESSAGES_KEY] === true,
      aiAnswerMode: ["buttons", "hotkeys", "both"].includes(values[AI_ANSWER_MODE_KEY])
        ? values[AI_ANSWER_MODE_KEY]
        : "buttons",
      aiVisualFallback: values[AI_VISUAL_FALLBACK_KEY] === true,
    };
  }

  function initStorage() {
    const keys = [
      ETEST_COPY_KEY,
      ETEST_QUESTION_BUTTONS_KEY,
      ETEST_WHOLE_TEST_BUTTON_KEY,
      ETEST_INCLUDE_ANSWERS_KEY,
      ETEST_INCLUDE_IMAGES_KEY,
      AI_HELPER_ENABLED_KEY,
      AI_HELPER_MESSAGES_KEY,
      AI_ANSWER_MODE_KEY,
      AI_VISUAL_FALLBACK_KEY,
    ];
    chrome.storage.local.get(keys, (result) => {
      const preferences = resolvePreferences(result);
      etestCopyEnabled = preferences.copyEnabled;
      questionButtonsEnabled = preferences.questionButtons;
      wholeTestButtonEnabled = preferences.wholeTestButton;
      includeSelectedAnswers = preferences.selectedAnswers;
      includeWholeTestImages = preferences.wholeTestImages;
      aiHelperEnabled = preferences.aiHelper;
      aiHelperMessagesEnabled = preferences.aiHelperMessages;
      aiAnswerMode = preferences.aiAnswerMode;
      aiVisualFallbackEnabled = preferences.aiVisualFallback;
      ensureButtons();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[ETEST_COPY_KEY]) etestCopyEnabled = changes[ETEST_COPY_KEY].newValue === true;
      if (changes[ETEST_QUESTION_BUTTONS_KEY]) {
        questionButtonsEnabled = changes[ETEST_QUESTION_BUTTONS_KEY].newValue !== false;
      }
      if (changes[ETEST_WHOLE_TEST_BUTTON_KEY]) {
        wholeTestButtonEnabled = changes[ETEST_WHOLE_TEST_BUTTON_KEY].newValue !== false;
      }
      if (changes[ETEST_INCLUDE_ANSWERS_KEY]) includeSelectedAnswers = changes[ETEST_INCLUDE_ANSWERS_KEY].newValue !== false;
      if (changes[ETEST_INCLUDE_IMAGES_KEY]) includeWholeTestImages = changes[ETEST_INCLUDE_IMAGES_KEY].newValue !== false;
      if (changes[AI_HELPER_ENABLED_KEY]) aiHelperEnabled = changes[AI_HELPER_ENABLED_KEY].newValue === true;
      if (changes[AI_HELPER_MESSAGES_KEY]) aiHelperMessagesEnabled = changes[AI_HELPER_MESSAGES_KEY].newValue === true;
      if (changes[AI_ANSWER_MODE_KEY]) {
        aiAnswerMode = ["buttons", "hotkeys", "both"].includes(changes[AI_ANSWER_MODE_KEY].newValue)
          ? changes[AI_ANSWER_MODE_KEY].newValue
          : "buttons";
      }
      if (changes[AI_VISUAL_FALLBACK_KEY]) aiVisualFallbackEnabled = changes[AI_VISUAL_FALLBACK_KEY].newValue === true;
      if (keys.some((key) => changes[key])) ensureButtons();
    });
  }

  if (IS_TEST) {
    globalThis.__eeTestExports = {
      normalizeStructuredText,
      formatAnswerOptionText,
      getChoiceLabels,
      selectedOptionLabels,
      sanitizeImageSource,
      SELECTED_MARKER_TOKEN,
      serializeNode,
      collectSelectedAnswers,
      getQuestionIdentity,
      getQuestionType,
      isBlankControl,
      getQuestionInteractionData,
      buildQuestionModel,
      getSeenQuestionModels,
      renderQuestionPlain,
      renderQuestionHtml,
      renderTestPayload,
      writePlainText,
      writeClipboard,
      resolvePreferences,
      clearAiSuggestion,
      questionHasAnswer,
      getBlankControls,
      getOrderingRows,
      hasOrderingAnswer,
      canApplyAiAnswer,
      applyAiAnswer,
      applyAiOrdering,
      syncDropdownDisplay,
      acceptAiSuggestionWithTab,
      getCurrentAiQuestion,
      applyAiSuggestion,
      init,
    };
    return;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ee-ai-suggest-current-question" && aiHelperEnabled && aiAnswerMode !== "buttons") {
      const content = getCurrentAiQuestion();
      if (content) requestAiSuggestion(content);
      return;
    }
    if (!etestCopyEnabled) return;
    if (message?.type === "ee-etest-copy-current-question") {
      const content = getCurrentAiQuestion();
      content?.closest(".etest-question-content")?.querySelector(`.${COPY_BTN_CLASS}`)?.click();
      return;
    }
    if (message?.type === "ee-etest-copy-whole-test") {
      document.querySelector(`.${COPY_ALL_BTN_CLASS}`)?.click();
    }
  });

  function init() {
    initStorage();
    initObserver();
  }

  init();
})();
