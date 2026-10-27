// Display-only account anonymization. Real names and original text stay in memory.
(() => {
  "use strict";
  const NAME_SELECTOR = ".edubarProfilebox .profilemenu .userName, .edubarProfilebox a.display > span";
  const SKIP = "script,style,noscript,template,input,textarea,select,option,[contenteditable]:not([contenteditable='false']),[data-ee-anonymizer-ignore]";
  const BLOCKS = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BODY", "BR", "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "UL"]);
  const ATTRS = ["title", "aria-label", "alt"];

  function namePattern(name) {
    const parts = String(name || "").trim().split(/\s+/u);
    if (parts.length < 2 || parts.join(" ").length > 200) return null;
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const variants = [parts.map(escape).join("\\s+")];
    if (parts.length === 2) variants.push(`${escape(parts[1])},?\\s+${escape(parts[0])}`);
    return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${variants.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  }

  EE.createNameAnonymizer = function (doc = document) {
    let enabled = false, alias = "Anonymous", identity = "", pattern = null, observer = null, timer = null;
    let pageName = "", requestingName = false;
    const textChanges = new Map(), attrChanges = new Map(), roots = new Set();
    const sourceText = node => {
      const entry = textChanges.get(node);
      return entry && node.data === entry.rendered ? entry.original : node.data;
    };
    function originalText(element) {
      return Array.from(element.childNodes || [], node => node.nodeType === 3 ? sourceText(node) : originalText(node)).join("");
    }
    function discoverName() {
      if (namePattern(pageName)) return pageName;
      // Widget unavailable: use the original profile text as a fallback.
      for (const selector of NAME_SELECTOR.split(", ")) {
        const value = Array.from(doc.querySelectorAll(selector), originalText)
          .map(s => s.replace(/\s+/gu, " ").trim()).find(s => s !== alias && namePattern(s));
        if (value) return value;
      }
      return "";
    }
    function restore() {
      for (const [node, entry] of textChanges) {
        if (node.data === entry.rendered) node.data = entry.original;
      }
      for (const [element, entries] of attrChanges) {
        for (const [attr, entry] of entries) {
          if (element.getAttribute(attr) === entry.rendered) element.setAttribute(attr, entry.original);
        }
      }
      textChanges.clear(); attrChanges.clear();
    }
    function writeText(node, original, rendered) {
      if (rendered === original) textChanges.delete(node);
      else textChanges.set(node, { original, rendered });
      if (node.data !== rendered) node.data = rendered;
    }
    function replaceRun(nodes) {
      if (!nodes.length || !pattern) return;
      const sources = nodes.map(sourceText), joined = sources.join("");
      const matches = Array.from(joined.matchAll(pattern));
      let offset = 0;
      nodes.forEach((node, index) => {
        const original = sources[index], end = offset + original.length;
        let rendered = "", cursor = 0;
        for (const match of matches) {
          const matchEnd = match.index + match[0].length;
          if (match.index >= end || matchEnd <= offset) continue;
          const from = Math.max(0, match.index - offset), to = Math.min(original.length, matchEnd - offset);
          rendered += original.slice(cursor, from) + (match.index >= offset ? alias : "");
          cursor = to;
        }
        rendered += original.slice(cursor);
        writeText(node, original, rendered);
        offset = end;
      });
    }
    function replaceAttributes(element) {
      for (const attr of ATTRS) {
        const current = element.getAttribute(attr);
        if (current === null) continue;
        const entry = attrChanges.get(element)?.get(attr);
        const original = entry && current === entry.rendered ? entry.original : current;
        const rendered = original.replace(pattern, () => alias);
        if (rendered !== original) {
          if (!attrChanges.has(element)) attrChanges.set(element, new Map());
          attrChanges.get(element).set(attr, { original, rendered });
        } else {
          attrChanges.get(element)?.delete(attr);
          if (!attrChanges.get(element)?.size) attrChanges.delete(element);
        }
        if (current !== rendered) element.setAttribute(attr, rendered);
      }
    }
    function scan(root) {
      if (!root || !pattern || !root.isConnected) return;
      let run = [];
      const flush = () => { replaceRun(run); run = []; };
      function walk(node) {
        if (node.nodeType === 3) { run.push(node); return; }
        if (node.nodeType !== 1) return;
        if (node.matches(SKIP) || node.isContentEditable) { flush(); return; }
        const block = BLOCKS.has(node.tagName);
        if (block) flush();
        replaceAttributes(node);
        for (const child of node.childNodes) walk(child);
        if (block) flush();
      }
      if (root.nodeType === 1 && root.closest(SKIP)) return;
      walk(root); flush();
    }
    function releaseDetached() {
      // Restore before releasing detached fragments, so a reused node has its real source.
      for (const [node, entry] of textChanges) if (!node.isConnected) {
        if (node.data === entry.rendered) node.data = entry.original;
        textChanges.delete(node);
      }
      for (const [element, entries] of attrChanges) if (!element.isConnected) {
        for (const [attr, entry] of entries) if (element.getAttribute(attr) === entry.rendered) element.setAttribute(attr, entry.original);
        attrChanges.delete(element);
      }
    }
    function flush() {
      timer = null;
      if (!enabled || !doc.body?.isConnected) {
        doc.documentElement?.classList.remove("ee-anonymizer-active");
        return;
      }
      requestingName = true;
      try { doc.dispatchEvent(new Event("ee-anonymizer-name-request")); }
      finally { requestingName = false; }
      releaseDetached();
      const nextName = discoverName();
      if (nextName && nextName !== identity) {
        restore(); identity = nextName; pattern = namePattern(identity); roots.clear(); roots.add(doc.body);
      }
      const queued = Array.from(roots); roots.clear();
      if (queued.includes(doc.body)) scan(doc.body);
      else queued.filter(root => !queued.some(other => other !== root && other.contains(root))).forEach(scan);
      scan(doc.querySelector("title"));
      doc.documentElement.classList.toggle("ee-anonymizer-active", !!pattern);
    }
    function enqueue(node) {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      if (!element || element.nodeType !== 1 || element.closest(SKIP)) return;
      // Include inline siblings when a name is split over several text nodes.
      let root = element;
      while (root.parentElement && !BLOCKS.has(root.tagName)) root = root.parentElement;
      roots.add(root);
      if (timer === null) timer = setTimeout(flush, 0);
    }
    function start() {
      if (observer || !doc.documentElement) return;
      doc.addEventListener("ee-anonymizer-name", receivePageName);
      doc.addEventListener("ee-anonymizer-name-ready", pageReady);
      observer = new MutationObserver(records => {
        for (const record of records) {
          if (record.type === "characterData" && textChanges.get(record.target)?.rendered === record.target.data) continue;
          if (record.type === "attributes" && attrChanges.get(record.target)?.get(record.attributeName)?.rendered === record.target.getAttribute(record.attributeName)) continue;
          enqueue(record.target);
        }
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    function receivePageName(event) {
      if (!enabled || typeof event.detail !== "string") return;
      const next = event.detail.replace(/\s+/gu, " ").trim();
      if (next.length > 200 || next === pageName) return;
      pageName = next;
      if (!requestingName) enqueue(doc.body);
    }
    function pageReady() { if (enabled) enqueue(doc.body); }
    return {
      setState(on, replacement) {
        const nextAlias = EE.normalizeAnonymizerAlias(replacement);
        const changed = nextAlias !== alias;
        if (!on) {
          doc.documentElement?.classList.remove("ee-anonymizer-active");
          enabled = false; observer?.disconnect(); observer = null;
          doc.removeEventListener("ee-anonymizer-name", receivePageName);
          doc.removeEventListener("ee-anonymizer-name-ready", pageReady);
          clearTimeout(timer); timer = null; roots.clear(); restore(); identity = ""; pattern = null;
          pageName = "";
          return;
        }
        if (!enabled || changed) {
          restore(); alias = nextAlias; enabled = true;
          if (doc.body) roots.add(doc.body);
          start(); flush();
        }
      },
    };
  };
  if (globalThis.__EE_TEST__) globalThis.__eeAnonymizerTest = { namePattern };
})();
