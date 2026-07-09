/**
 * grades-virtual.js
 *
 * "What-if" virtual grade projection popover: lets a student add hypothetical
 * grades to a subject and see the projected average, using the same
 * weighted-average math EduPage itself uses (auto-detected or overridden
 * existing weight mass).
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});

  const VIRTUAL_GRADES_KEY = "eeVirtualGrades";
  const EXISTING_MASS_OVERRIDES_KEY = "eeVirtualGradeExistingMassOverrides";
  // In-memory per-page-load cache of the weight mass auto-detected by
  // briefly expanding a subject row. Avoids re-running the expand dance every
  // time the popover opens on the same subject.
  const autoDetectedMassCache = new Map();
  // Tracks subjects we expanded ourselves so we can detect them as
  // "auto-expanded" vs "user-expanded" if we ever want to collapse back.
  const autoExpandedSubjects = new Set();
  let activeVirtualPopover = null;

    function calcWeightedAvg(grades) {
      if (!grades.length) return Number.NaN;
      const totalWeight = grades.reduce((s, g) => s + g.weight, 0);
      if (totalWeight === 0) return Number.NaN;
      return grades.reduce((s, g) => s + g.value * g.weight, 0) / totalWeight;
    }
    function parseGradeWeight(tooltipText) {
      // EduPage labels the weight in the school's language. The label can stand
      // alone ("Váha: 2"), include a multiplier suffix ("Váha: 2x"), or pad the
      // label with extra words ("Váha udalosti: 2x"). The previous regex
      // required ":" immediately after "Váha", so the "Váha udalosti: 2x" form
      // silently fell back to weight 1, which under-weighted real grades and
      // skewed the projection. Allow up to 30 non-digit characters between the
      // label and the number so all the common Slovak/Czech/English/German
      // tooltip variants are covered.
      if (!tooltipText) return null;
      const match = /(?:v[aá]h[ay]|weight|gewicht)[^0-9]{0,30}?(\d+(?:[.,]\d+)?)/i
        .exec(String(tooltipText));
      if (!match) return null;
      const value = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    function countGradeCellsIn(element) {
      let count = 0;
      if (!element || typeof element.querySelectorAll !== "function") return 0;
      element.querySelectorAll("span.tips").forEach((tip) => {
        if (!tip.querySelector(".znZnamka")) return;
        const text = GE.normalizeWhitespace(tip.querySelector(".znZnamka").textContent || "");
        const value = GE.parseAverage(text);
        if (Number.isFinite(value) && value > 0) count += 1;
      });
      return count;
    }
    function findSubjectSubRows(predmetRow) {
      // EduPage renders a subject's grades broken down into category sub-rows
      // ("ústna odpoveď", "písomná odpoveď", ...) where the category label
      // carries the weight ("Váha udalosti: 2×"). Sub-rows may be:
      //   (a) sibling <tr>s placed AFTER predmetRow, up to the next predmetRow
      //   (b) nested <tr>s inside predmetRow (some skins wrap them in an inner
      //       table inside one of predmetRow's <td>s)
      // We collect both so the mass calculation works regardless of layout.
      const subRows = [];

      // EduPage stamps the category sub-rows (class "udalostRow") with the SAME
      // data-predmetid as their parent subject row, so we can only treat a
      // sibling as the next subject when (a) it carries the predmetRow class, or
      // (b) its data-predmetid actually differs from ours. The old check broke
      // out on any sibling that had data-predmetid at all, which meant sub-rows
      // were never collected and the per-category "Váha udalosti: 2×" labels
      // were invisible to the weight parser.
      const startingPredmetid = predmetRow.dataset ? predmetRow.dataset.predmetid || "" : "";
      let cursor = predmetRow.nextElementSibling;
      while (cursor) {
        const classes = cursor.classList;
        const cursorPredmetid = cursor.dataset ? cursor.dataset.predmetid || "" : "";
        const isNextSubject = (classes && typeof classes.contains === "function" && classes.contains("predmetRow"))
          || (cursorPredmetid && cursorPredmetid !== startingPredmetid);
        if (isNextSubject) break;
        if (cursor.tagName === "TR") subRows.push(cursor);
        cursor = cursor.nextElementSibling;
      }

      if (typeof predmetRow.querySelectorAll === "function") {
        Array.from(predmetRow.querySelectorAll("tr")).forEach((nested) => {
          if (nested !== predmetRow && !subRows.includes(nested)) {
            subRows.push(nested);
          }
        });
      }

      return subRows;
    }
    function readExistingGradeMass(predmetRow) {
      // Prefer sub-row math: each sub-row contributes (cellCount × rowWeight),
      // where rowWeight comes from "Váha udalosti: N×" on the row's label.
      // This is the only signal that exists for the weight-2 categories in
      // typical EduPage skins — per-cell tooltips don't carry the weight.
      // Fall back to per-cell tooltip parsing only when no sub-row has any
      // grade cells (single-category subjects, exotic skins, etc.).
      let totalWeight = 0;
      let cellCount = 0;
      let weightsParsed = 0;

      const subRows = findSubjectSubRows(predmetRow);
      for (const subRow of subRows) {
        const subRowCellCount = countGradeCellsIn(subRow);
        if (subRowCellCount === 0) continue;
        const labelText = subRow.textContent || "";
        const explicitWeight = parseGradeWeight(labelText);
        const subRowWeight = explicitWeight !== null ? explicitWeight : 1;
        totalWeight += subRowCellCount * subRowWeight;
        cellCount += subRowCellCount;
        if (explicitWeight !== null) {
          weightsParsed += subRowCellCount;
        }
      }

      if (cellCount > 0) {
        return { totalWeight, cellCount, weightsParsed };
      }

      // Fallback path: no sub-rows had grade cells. Read from predmetRow
      // directly and try per-cell tooltips. This is the original behavior and
      // still correct for layouts that don't use category sub-rows at all.
      predmetRow.querySelectorAll("span.tips").forEach((tip) => {
        if (!tip.querySelector(".znZnamka")) return;
        const text = GE.normalizeWhitespace(tip.querySelector(".znZnamka").textContent || "");
        const value = GE.parseAverage(text);
        if (!Number.isFinite(value) || value <= 0) return;

        cellCount += 1;
        const tooltip = tip.getAttribute("data-ee-original-grade-title")
          || tip.getAttribute("original-title")
          || tip.getAttribute("title")
          || "";
        const parsedWeight = parseGradeWeight(tooltip);
        if (parsedWeight !== null) {
          totalWeight += parsedWeight;
          weightsParsed += 1;
        } else {
          totalWeight += 1;
        }
      });

      return { totalWeight, cellCount, weightsParsed };
    }
    function projectAverageWithVirtualGrades(originalAvg, existingMass, virtualGrades) {
      // Treat the EduPage-rendered average as the aggregate of every existing
      // grade, weighted by the SUM of the cells' individual weights (read from
      // their tooltips). That's exactly the same arithmetic as a full per-grade
      // weighted mean — only the existing side is collapsed to (average, mass).
      //
      //   projected = (originalAvg * existingMass + Σ(v_i · w_i))
      //             / (existingMass + Σ(w_i))
      //
      // When all existing cells share a weight, mass == cellCount and the
      // result is identical to enumerating each grade. When weights differ, the
      // tooltip-derived mass keeps the result aligned with the school's own
      // weighted-mean math. If weights can't be parsed at all, mass falls back
      // to cellCount which still produces a sensible projection between
      // originalAvg and the new grades — never below originalAvg for a worse
      // grade or above it for a better one.
      if (!Array.isArray(virtualGrades) || virtualGrades.length === 0) return null;
      if (!Number.isFinite(originalAvg)) return null;

      const mass = Math.max(0.1, Number.isFinite(existingMass) ? existingMass : 0);
      return calcWeightedAvg([
        { value: originalAvg, weight: mass },
        ...virtualGrades,
      ]);
    }
    function resolveExistingMassForRow(row) {
      const info = readExistingGradeMass(row);
      // No grade cells found at all -> treat the EduPage average as a single
      // weight-1 anchor so the projection is just the mean of original + new.
      if (info.cellCount === 0) {
        return { mass: 1, ...info };
      }
      return { mass: info.totalWeight, ...info };
    }
    function readExistingMassOverride(predmetid) {
      const key = String(predmetid || "").trim();
      if (!key) return null;
      const value = Number(GE.state.existingMassOverrides[key]);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    function persistExistingMassOverrides() {
      GE.state.existingMassOverridesByOrigin[GE.currentOrigin()] = GE.state.existingMassOverrides;
      return GE.storageSet({ [EXISTING_MASS_OVERRIDES_KEY]: GE.state.existingMassOverridesByOrigin });
    }
    function saveExistingMassOverride(predmetid, mass) {
      const key = String(predmetid || "").trim();
      if (!key) return Promise.resolve();
      const normalized = Number(mass);
      if (!Number.isFinite(normalized) || normalized <= 0) {
        delete GE.state.existingMassOverrides[key];
      } else {
        GE.state.existingMassOverrides[key] = normalized;
      }
      return persistExistingMassOverrides();
    }
    function dispatchSyntheticClick(element) {
      if (!element) return false;
      try {
        // Use a bubbling MouseEvent so jQuery delegation handlers higher up
        // the tree also fire (direct .click() doesn't always reach them).
        element.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        }));
        return true;
      } catch (error) {
        return false;
      }
    }
    function findExpandToggleCandidates(predmetRow) {
      const candidates = new Set();
      if (!predmetRow || typeof predmetRow.querySelectorAll !== "function") {
        return [];
      }

      predmetRow.querySelectorAll("td, span, a, button, img, div, i").forEach((el) => {
        const text = (el.textContent || "").trim();
        const cls = String(el.className || "").toLowerCase();
        const aria = el.getAttribute?.("aria-expanded");

        if (text === "+" || text === "−" || text === "-") candidates.add(el);
        if (/expand|collap|toggle|plus|minus|znamky-expand/.test(cls)) candidates.add(el);
        if (aria === "false") candidates.add(el);
      });

      // EduPage often makes the subject's first cell (or the row itself)
      // clickable to toggle expansion, with no explicit "+" element. Add both
      // as last-resort candidates so we still hit the right handler when the
      // toggle is a delegated row-level click.
      const firstCell = predmetRow.querySelector("td, th");
      if (firstCell) candidates.add(firstCell);
      candidates.add(predmetRow);

      return Array.from(candidates);
    }
    function detectExistingMass(predmetRow, predmetid, { timeoutMs = 700 } = {}) {
      // Already cached from an earlier popover open on this page? Return it.
      if (predmetid && autoDetectedMassCache.has(predmetid)) {
        return Promise.resolve(autoDetectedMassCache.get(predmetid));
      }

      const initial = readExistingGradeMass(predmetRow);
      if (initial.weightsParsed > 0) {
        if (predmetid) autoDetectedMassCache.set(predmetid, initial);
        return Promise.resolve(initial);
      }

      // Need to expand the subject to surface the category sub-rows. Watch the
      // containing tbody for newly-added rows and re-read mass whenever the DOM
      // changes; resolve as soon as weights become available, or after a short
      // timeout if nothing usable appears.
      return new Promise((resolve) => {
        const tbody = (typeof predmetRow.closest === "function" ? predmetRow.closest("tbody") : null)
          || predmetRow.parentElement;
        let resolved = false;
        let observer = null;
        let timer = null;

        const finish = (info) => {
          if (resolved) return;
          resolved = true;
          if (observer) {
            try { observer.disconnect(); } catch (error) { /* ignore */ }
          }
          if (timer) clearTimeout(timer);
          if (predmetid) autoDetectedMassCache.set(predmetid, info);
          resolve(info);
        };

        if (tbody && typeof MutationObserver === "function") {
          observer = new MutationObserver(() => {
            const info = readExistingGradeMass(predmetRow);
            if (info.weightsParsed > 0) finish(info);
          });
          try {
            observer.observe(tbody, { childList: true, subtree: true });
          } catch (error) {
            observer = null;
          }
        }

        const toggles = findExpandToggleCandidates(predmetRow);
        for (const toggle of toggles) {
          if (dispatchSyntheticClick(toggle)) {
            if (predmetid) autoExpandedSubjects.add(predmetid);
          }
        }

        timer = setTimeout(() => finish(readExistingGradeMass(predmetRow)), timeoutMs);
      });
    }

    // EduPage stores grade weights as `p_vaha`, scaled ×20 (p_vaha 20 = the "1×"
    // weight the UI shows). Verified live 2026-06-21 by cross-checking the rendered
    // "Váha udalosti: N×" labels against p_vaha (labels 2 / 2.5 / 0.5 ↔ p_vaha
    // 40 / 50 / 10). Dividing by this keeps blob-derived mass in the same units
    // users type for virtual grades.
    const PVAHA_PER_WEIGHT_UNIT = 20;

    // undefined = not parsed yet; null = unavailable on this page;
    // Map(predmetid → { mass, count }) otherwise.
    let blobGradeWeightModel;

    // Reads grade weights straight from the embedded `.znamkyStudentViewer(` blob:
    // `vsetkyUdalosti.edupage[].p_vaha` joined to `vsetkyZnamky` by `udalostid`,
    // summed per subject. This replaces the fragile, language-dependent
    // "Váha udalosti: N×" tooltip-text parsing with structured data — the tooltip
    // path stays as a fallback when the blob is absent (older skins, or pages that
    // don't embed it). Memoized for the page load.
    function getBlobGradeWeightModel() {
      if (blobGradeWeightModel !== undefined) return blobGradeWeightModel;
      blobGradeWeightModel = null;
      try {
        let blobText = null;
        for (const script of document.querySelectorAll("script:not([src])")) {
          const text = script.textContent || "";
          const marker = ".znamkyStudentViewer(";
          const markerIndex = text.indexOf(marker);
          if (markerIndex === -1) continue;
          const braceIndex = text.indexOf("{", markerIndex + marker.length);
          if (braceIndex === -1) continue;
          blobText = EE.extractBalanced(text, braceIndex);
          if (blobText) break;
        }
        if (!blobText) return blobGradeWeightModel;

        const blob = JSON.parse(blobText);
        const eventsRaw = blob && blob.vsetkyUdalosti && blob.vsetkyUdalosti.edupage;
        const events = Array.isArray(eventsRaw) ? eventsRaw : eventsRaw ? Object.values(eventsRaw) : [];
        blobGradeWeightModel = buildGradeWeightModel(blob && blob.vsetkyZnamky, events);
      } catch (error) {
        console.warn("[Edupage Extras] Could not read grade weights from the znamky blob.", error);
      }
      return blobGradeWeightModel;
    }

    // Pure join: sum each subject's grade weights from `p_vaha` (÷20 → display
    // units), matching grades to events by udalostid. Returns Map(predmetid →
    // { mass, count }), or null when no grade resolves to a weight. Kept separate
    // from the DOM extraction above so it can be unit-tested.
    function buildGradeWeightModel(grades, events) {
      if (!Array.isArray(grades) || !Array.isArray(events)) return null;

      const weightByUdalost = new Map();
      events.forEach((event) => {
        const weight = Number(event && event.p_vaha);
        if (Number.isFinite(weight)) weightByUdalost.set(String(event.UdalostID), weight);
      });

      const model = new Map();
      let matched = false;
      grades.forEach((grade) => {
        const predmetid = String((grade && grade.predmetid) || "").trim();
        const weight = weightByUdalost.get(String(grade && grade.udalostid));
        if (!predmetid || !Number.isFinite(weight)) return;
        matched = true;
        const entry = model.get(predmetid) || { mass: 0, count: 0 };
        entry.mass += weight / PVAHA_PER_WEIGHT_UNIT;
        entry.count += 1;
        model.set(predmetid, entry);
      });

      return matched ? model : null;
    }

    // The blob's per-subject { mass, count } when the structured weights cover this
    // subject — the authoritative source, preferred over tooltip parsing.
    function getBlobMassInfo(predmetid) {
      const key = String(predmetid || "").trim();
      if (!key) return null;
      const model = getBlobGradeWeightModel();
      const entry = model && model.get(key);
      return entry && entry.mass > 0 ? entry : null;
    }
    function getEffectiveExistingMass(row, predmetid) {
      const override = readExistingMassOverride(predmetid);
      if (override !== null) return { mass: override, source: "override" };
      // Structured weights from the embedded blob beat the tooltip-text parse —
      // exact and language-independent. Fall through to the DOM paths if the blob
      // isn't present or doesn't cover this subject.
      const blob = getBlobMassInfo(predmetid);
      if (blob) return { mass: blob.mass, source: "blob", info: blob };
      if (predmetid && autoDetectedMassCache.has(predmetid)) {
        const cached = autoDetectedMassCache.get(predmetid);
        if (cached.weightsParsed > 0) {
          return { mass: cached.totalWeight, source: "auto-detected", info: cached };
        }
      }
      const live = resolveExistingMassForRow(row);
      return { mass: live.mass, source: live.weightsParsed > 0 ? "auto-detected" : "count-fallback", info: live };
    }
    function getProjectedAverage(row, predmetid, originalAvg) {
      const virtual = GE.state.virtualGradesData[predmetid];
      if (!virtual || virtual.length === 0) return null;
      const { mass } = getEffectiveExistingMass(row, predmetid);
      return projectAverageWithVirtualGrades(originalAvg, mass, virtual);
    }
    function saveVirtualGrades() {
      GE.state.virtualGradesByOrigin[GE.currentOrigin()] = GE.state.virtualGradesData;
      return GE.storageSet({ [VIRTUAL_GRADES_KEY]: GE.state.virtualGradesByOrigin });
    }
    function closeVirtualPopover() {
      if (activeVirtualPopover) {
        activeVirtualPopover.remove();
        activeVirtualPopover = null;
      }
    }
    function handleDocumentClickForPopover(event) {
      if (!activeVirtualPopover) return;
      if (activeVirtualPopover.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".ee-vg-btn")) return;
      closeVirtualPopover();
    }
    function updateVirtualDisplay(row, predmetid, scale, originalAvg) {
      const priemerCell = row.querySelector(".znPriemerCell");
      if (!priemerCell) return;

      priemerCell.querySelector(".ee-vg-projected")?.remove();

      const btn = priemerCell.querySelector(".ee-vg-btn");
      const hasVirtual = (GE.state.virtualGradesData[predmetid] || []).length > 0;
      if (btn) btn.classList.toggle("ee-vg-btn-active", hasVirtual);

      if (!hasVirtual) return;

      const projected = getProjectedAverage(row, predmetid, originalAvg);
      if (!Number.isFinite(projected)) return;

      const indicator = document.createElement("div");
      indicator.className = "ee-vg-projected";

      const arrow = document.createElement("span");
      arrow.className = "ee-vg-arrow";
      arrow.textContent = "→";

      const projValue = document.createElement("span");
      projValue.className = "ee-avg-value";
      projValue.style.setProperty("--avg-color", GE.gradeColor(projected, scale));
      projValue.textContent = GE.formatAverageDisplay(projected, scale);

      indicator.appendChild(arrow);
      indicator.appendChild(projValue);
      priemerCell.appendChild(indicator);
    }
    function buildPopoverContent(popover, row, predmetid, scale, originalAvg) {
      popover.innerHTML = "";

      const header = document.createElement("div");
      header.className = "ee-vg-popover-header";
      header.textContent = GE.t("vgTitle");
      popover.appendChild(header);

      const virtual = GE.state.virtualGradesData[predmetid] || [];

      const list = document.createElement("div");
      list.className = "ee-vg-list";

      if (virtual.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ee-vg-empty";
        empty.textContent = GE.t("vgEmpty");
        list.appendChild(empty);
      } else {
        virtual.forEach((grade, i) => {
          const item = document.createElement("div");
          item.className = "ee-vg-item";

          const lbl = document.createElement("span");
          lbl.className = "ee-vg-item-label";
          lbl.textContent = `${GE.formatAverageDisplay(grade.value, scale)} (${GE.t("vgWeightLabel")}: ${grade.weight})`;

          const removeBtn = document.createElement("button");
          removeBtn.className = "ee-vg-remove";
          removeBtn.textContent = "×";
          removeBtn.title = GE.t("vgRemove");
          removeBtn.addEventListener("click", async () => {
            const arr = GE.state.virtualGradesData[predmetid] || [];
            arr.splice(i, 1);
            if (arr.length === 0) delete GE.state.virtualGradesData[predmetid];
            await saveVirtualGrades();
            updateVirtualDisplay(row, predmetid, scale, originalAvg);
            updateResetButtonState(row.closest("table.znamkyTable"));
            buildPopoverContent(popover, row, predmetid, scale, originalAvg);
          });

          item.appendChild(lbl);
          item.appendChild(removeBtn);
          list.appendChild(item);
        });
      }

      popover.appendChild(list);

      if (virtual.length > 0) {
        const projected = getProjectedAverage(row, predmetid, originalAvg);
        if (Number.isFinite(projected)) {
          const projRow = document.createElement("div");
          projRow.className = "ee-vg-projection-row";

          const projLabel = document.createElement("span");
          projLabel.className = "ee-vg-proj-label";
          projLabel.textContent = GE.t("vgProjected");

          const projBadge = GE.createBadgeElement(projected, GE.formatAverageDisplay(projected, scale), { scale });

          projRow.appendChild(projLabel);
          if (projBadge) projRow.appendChild(projBadge);
          popover.appendChild(projRow);

          // Existing weight mass — detected by briefly expanding the subject
          // row when the popover opens, or filled in manually if detection
          // can't see the per-category weights for some reason.
          const override = readExistingMassOverride(predmetid);
          const blobInfo = getBlobMassInfo(predmetid);
          const cached = autoDetectedMassCache.get(predmetid);
          const liveInfo = readExistingGradeMass(row);
          // Prefer the blob's structured weights (authoritative, language-neutral);
          // then the cached sub-row parse (captured while sub-rows were in the
          // DOM); then whatever the live DOM currently shows. This must match the
          // source getEffectiveExistingMass uses, so the box and the projection agree.
          const usableInfo = blobInfo
            ? { totalWeight: blobInfo.mass, cellCount: blobInfo.count, weightsParsed: blobInfo.count }
            : (cached && cached.weightsParsed > 0) ? cached : liveInfo;
          const detectedMass = usableInfo.totalWeight;
          const detectedCellCount = usableInfo.cellCount;
          const effectiveMass = override !== null ? override : detectedMass;
          const detectionSucceeded = usableInfo.weightsParsed > 0;

          const massBox = document.createElement("div");
          massBox.className = "ee-vg-mass-box";

          const massLabel = document.createElement("span");
          massLabel.className = "ee-vg-mass-label";
          massLabel.textContent = detectedCellCount > 0
            ? GE.t("vgExistingWeightCount", [String(detectedCellCount)])
            : GE.t("vgExistingWeight");
          massBox.appendChild(massLabel);

          const massInput = document.createElement("input");
          massInput.type = "number";
          massInput.step = "0.5";
          massInput.min = "0.5";
          massInput.className = "ee-vg-input ee-vg-mass-input";
          massInput.value = String(Number.isInteger(effectiveMass) ? effectiveMass : Number(effectiveMass.toFixed(2)));
          massInput.title = override !== null
            ? GE.t("vgMassOverrideTitle", [String(detectedMass)])
            : detectionSucceeded
              ? (blobInfo ? GE.t("vgMassBlobTitle") : GE.t("vgMassSubrowTitle"))
              : GE.t("vgMassUnknownTitle");
          massInput.addEventListener("change", async () => {
            const typed = Number.parseFloat(massInput.value);
            const shouldClear = !Number.isFinite(typed) || typed <= 0 || typed === detectedMass;
            await saveExistingMassOverride(predmetid, shouldClear ? null : typed);
            updateVirtualDisplay(row, predmetid, scale, originalAvg);
            buildPopoverContent(popover, row, predmetid, scale, originalAvg);
          });
          massInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") massInput.blur();
          });
          massBox.appendChild(massInput);

          if (override !== null) {
            const resetBtn = document.createElement("button");
            resetBtn.type = "button";
            resetBtn.className = "ee-vg-mass-reset";
            resetBtn.textContent = `auto: ${detectedMass}`;
            resetBtn.title = "Clear the manual override and use the auto-detected value.";
            resetBtn.addEventListener("click", async () => {
              await saveExistingMassOverride(predmetid, null);
              updateVirtualDisplay(row, predmetid, scale, originalAvg);
              buildPopoverContent(popover, row, predmetid, scale, originalAvg);
            });
            massBox.appendChild(resetBtn);
          }

          popover.appendChild(massBox);

          // Compact diagnostic so the source of the mass is visible at a glance.
          const hint = document.createElement("div");
          hint.className = "ee-vg-mass-hint";
          if (override !== null) {
            hint.textContent = "Using manual override.";
          } else if (detectionSucceeded) {
            hint.textContent = `Auto-detected (${detectedCellCount} grades, mass ${detectedMass}).`;
          } else if (detectedCellCount > 0) {
            hint.textContent = "Detecting weights… if the row didn't expand automatically, expand it with the \"+\" toggle.";
          } else {
            hint.textContent = "No grade cells found yet — try expanding the subject row.";
          }
          popover.appendChild(hint);
        }
      }

      const form = document.createElement("div");
      form.className = "ee-vg-form";

      const gradeInput = document.createElement("input");
      gradeInput.type = "number";
      gradeInput.step = "0.1";
      gradeInput.min = scale === "percent" ? "0" : "1";
      gradeInput.max = scale === "percent" ? "100" : "5";
      gradeInput.placeholder = scale === "percent" ? GE.t("vgGradePlaceholderPercent") : GE.t("vgGradePlaceholder");
      gradeInput.className = "ee-vg-input";

      const weightInput = document.createElement("input");
      weightInput.type = "number";
      weightInput.step = "0.1";
      weightInput.min = "0.1";
      weightInput.value = "1";
      weightInput.placeholder = GE.t("vgWeightPlaceholder");
      weightInput.className = "ee-vg-input ee-vg-weight-input";

      const addBtn = document.createElement("button");
      addBtn.className = "ee-vg-add-btn";
      addBtn.textContent = GE.t("vgAdd");
      addBtn.addEventListener("click", async () => {
        const value = Number.parseFloat(gradeInput.value);
        const weight = Math.max(0.1, Number.parseFloat(weightInput.value) || 1);
        if (!Number.isFinite(value)) return;
        if (!GE.state.virtualGradesData[predmetid]) GE.state.virtualGradesData[predmetid] = [];
        GE.state.virtualGradesData[predmetid].push({ value, weight });
        await saveVirtualGrades();
        gradeInput.value = "";
        weightInput.value = "1";
        updateVirtualDisplay(row, predmetid, scale, originalAvg);
        updateResetButtonState(row.closest("table.znamkyTable"));
        buildPopoverContent(popover, row, predmetid, scale, originalAvg);
        gradeInput.focus();
      });

      gradeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addBtn.click();
      });

      form.appendChild(gradeInput);
      form.appendChild(weightInput);
      form.appendChild(addBtn);
      popover.appendChild(form);
    }
    function openVirtualPopover(triggerBtn, row, predmetid, scale, originalAvg) {
      const popover = document.createElement("div");
      popover.className = "ee-vg-popover";
      popover.dataset.eeVgFor = predmetid;
      // Render once immediately with whatever mass info is available right now,
      // then run async detection (which may briefly expand the row to surface
      // category sub-rows) and re-render once the real weights are known.
      buildPopoverContent(popover, row, predmetid, scale, originalAvg);
      detectExistingMass(row, predmetid).then(() => {
        if (activeVirtualPopover !== popover) return;
        buildPopoverContent(popover, row, predmetid, scale, originalAvg);
        updateVirtualDisplay(row, predmetid, scale, originalAvg);
      });
      document.body.appendChild(popover);
      activeVirtualPopover = popover;

      const btnRect = triggerBtn.getBoundingClientRect();
      const popWidth = popover.offsetWidth || 210;
      let left = btnRect.left;
      const top = btnRect.bottom + 4;
      if (left + popWidth > window.innerWidth - 8) {
        left = Math.max(4, window.innerWidth - popWidth - 8);
      }
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;

      popover.querySelector(".ee-vg-input")?.focus();
    }
    function updateResetButtonState(table) {
      const btn = table?.querySelector("thead .ee-vg-reset-btn");
      if (!btn) return;
      btn.disabled = Object.keys(GE.state.virtualGradesData).length === 0
        && Object.keys(GE.state.existingMassOverrides).length === 0;
    }
    function ensureResetVirtualGradesButton(table) {
      const headers = Array.from(table.querySelectorAll("thead th"));
      const priemerHeader = headers.find((th) => th.textContent.trim().toLowerCase().startsWith("priemer"));
      if (!priemerHeader) return;
      if (priemerHeader.querySelector(".ee-vg-reset-btn")) {
        updateResetButtonState(table);
        return;
      }

      const btn = document.createElement("button");
      btn.className = "ee-vg-reset-btn";
      btn.textContent = "↺";
      btn.title = "Reset all virtual grades";
      btn.setAttribute("aria-label", "Reset all virtual grades");
      btn.disabled = Object.keys(GE.state.virtualGradesData).length === 0
        && Object.keys(GE.state.existingMassOverrides).length === 0;
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        GE.state.virtualGradesData = {};
        GE.state.existingMassOverrides = {};
        autoDetectedMassCache.clear();
        autoExpandedSubjects.clear();
        await saveVirtualGrades();
        await persistExistingMassOverrides();
        closeVirtualPopover();
        Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
          const predmetid = String(row.dataset?.predmetid || "").trim();
          if (!predmetid) return;
          const priemerCell = row.querySelector(".znPriemerCell");
          if (!priemerCell) return;
          const rawText = priemerCell.dataset.eeOriginalAverage || GE.readAverageText(priemerCell);
          const avg = GE.parseAverage(rawText);
          if (!Number.isFinite(avg)) return;
          const scale = GE.detectAverageScale(rawText, avg) || "grade";
          updateVirtualDisplay(row, predmetid, scale, avg);
        });
        btn.disabled = true;
      });

      priemerHeader.appendChild(btn);
    }
    function ensureVirtualGradeButtons(table) {
      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const predmetid = String(row.dataset?.predmetid || "").trim();
        if (!predmetid) return;

        const priemerCell = row.querySelector(".znPriemerCell");
        if (!priemerCell) return;

        const rawText = priemerCell.dataset.eeOriginalAverage || GE.readAverageText(priemerCell);
        const avg = GE.parseAverage(rawText);
        if (!Number.isFinite(avg)) return;
        const scale = GE.detectAverageScale(rawText, avg) || "grade";

        if (!priemerCell.querySelector(".ee-vg-btn")) {
          const btn = document.createElement("button");
          btn.className = "ee-vg-btn";
          btn.textContent = "+";
          btn.title = "Virtual grade calculator";
          btn.setAttribute("aria-label", "Open virtual grade calculator");
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (activeVirtualPopover?.dataset.eeVgFor === predmetid) {
              closeVirtualPopover();
              return;
            }
            closeVirtualPopover();
            openVirtualPopover(btn, row, predmetid, scale, avg);
          });

          priemerCell.appendChild(btn);
        }

        updateVirtualDisplay(row, predmetid, scale, avg);
      });
      ensureResetVirtualGradesButton(table);
    }

  GE.virtual = {
    ensureVirtualGradeButtons,
    closeVirtualPopover,
    handleDocumentClickForPopover,
    parseGradeWeight,
    findSubjectSubRows,
    calcWeightedAvg,
    projectAverageWithVirtualGrades,
    readExistingGradeMass,
    buildGradeWeightModel,
  };
})();
