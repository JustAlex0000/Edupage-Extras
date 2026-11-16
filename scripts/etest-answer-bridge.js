(() => {
  "use strict";

  const PORT_ID = "ee-etest-ai-match-port";
  const APPLY_EVENT = "ee-etest-ai-apply-matches";

  function getPort() {
    return document.getElementById(PORT_ID);
  }

  function findQuestion(requestId) {
    return Array.from(document.querySelectorAll(".etest-question-content"))
      .find((content) => content.dataset.eeAiMatchRequest === requestId) || null;
  }

  function getRows(content) {
    return Array.from(content?.querySelectorAll(".etest-pair-item") || []);
  }

  function isValidMatching(matches, count) {
    return Array.isArray(matches)
      && matches.length === count
      && matches.every((match) => Number.isInteger(match?.left)
        && Number.isInteger(match?.right)
        && match.left >= 0 && match.left < count
        && match.right >= 0 && match.right < count)
      && new Set(matches.map((match) => match.left)).size === count
      && new Set(matches.map((match) => match.right)).size === count;
  }

  const sequences = new WeakMap();

  function applyMatches(requestId, matches, step) {
    const content = findQuestion(requestId);
    const initialRows = getRows(content);
    if (!content || !isValidMatching(matches, initialRows.length)) return 0;
    if (step !== undefined && (!Number.isInteger(step) || step < 0 || step >= matches.length)) return 0;
    let sequence = sequences.get(content);
    if (step === undefined || step === 0) {
      if (initialRows.some((row) => row.classList.contains("isConnected"))) return 0;
      const pairIds = initialRows.map(row => ({ left: row.dataset.id,
        right: row.querySelector(".etest-answer-inner.pair-r")?.dataset.id }));
      if (pairIds.some(pair => !pair.left || !pair.right)) return 0;
      sequence = { pairIds, signature: JSON.stringify(matches), next: 0 };
      if (step !== undefined) sequences.set(content, sequence);
    }
    if (!sequence || (step !== undefined && (sequence.next !== step || sequence.signature !== JSON.stringify(matches)))) return 0;
    const pairIds = sequence.pairIds;
    const selected = step === undefined ? matches : [matches[step]];

    let applied = 0;
    for (const match of selected) {
      const targetId = pairIds[match.left].left;
      const sourceId = pairIds[match.right].right;
      const target = getRows(content).find((row) => row.dataset.id === targetId);
      const source = Array.from(content.querySelectorAll(".etest-answer-inner.pair-r"))
        .find((element) => element.dataset.id === sourceId);
      const jq = window.jQuery || window.$;
      const drop = target && jq?.(target).data("ui-droppable")?.options?.drop;
      if (!source || typeof drop !== "function") return applied;

      drop.call(target, jq.Event("drop", { target }), { helper: jq(source) });
      applied += 1;
    }
    if (step !== undefined) {
      sequence.next++;
      if (!applied || sequence.next === matches.length) sequences.delete(content);
    }
    return applied;
  }

  window.addEventListener(APPLY_EVENT, () => {
    const port = getPort();
    if (!port) return;
    let request;
    try {
      request = JSON.parse(port.dataset.request || "");
    } catch (_) {
      return;
    }
    const applied = applyMatches(String(request?.id || ""), request?.matches, request?.step);
    port.dataset.response = JSON.stringify({ id: request?.id, applied });
  });
})();
