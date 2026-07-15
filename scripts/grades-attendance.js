/**
 * grades-attendance.js
 *
 * Current-halfyear subject absence stats: scraping/merging EduPage's
 * attendance + classbook ("ttday"/"gcall") pages, matching them up against
 * the grades table's subject rows, and rendering the dedicated attendance
 * columns (+ their loading/unavailable placeholders).
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});

  const GRADES_ATTENDANCE_CACHE_KEY = "eeGradesAttendanceStatsCache";
  const GRADES_ATTENDANCE_CACHE_VERSION = 15;
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const CLASSBOOK_RANGE_MAX_DAYS = 30;
  const ATTENDANCE_RENDER_SIGNATURE_ATTR = "data-ee-attendance-render-signature";
  let attendanceBaseStatsPromise = null;
  let attendanceStatsPromise = null;

    function currentGradesViewSignature() {
      return GE.state.gradesView?.signature || "current:current";
    }
    function resetForGradesView() {
      attendanceBaseStatsPromise = null;
      attendanceStatsPromise = null;
      GE.state.attendanceStatsCache = null;
    }
    function updateAttendanceCache(byOrigin, origin, stats, fallbackSignature) {
      const cache = byOrigin && typeof byOrigin === "object" ? byOrigin : {};
      const storedOrigin = cache[origin];
      const byView = storedOrigin && typeof storedOrigin === "object" && !("version" in storedOrigin)
        ? storedOrigin
        : {};
      const viewSignature = stats.viewSignature || fallbackSignature || "current:current";
      return {
        ...cache,
        [origin]: {
          ...byView,
          [viewSignature]: stats,
        },
      };
    }

    function shouldCountAbsentType(typeMeta) {
      if (!typeMeta) return true;

      const category = String(typeMeta.et || "").trim().toLowerCase();
      if (category) {
        return category === "o" || category === "n";
      }

      const short = String(typeMeta.short || "").trim().toLowerCase();
      const normalizedName = normalizeText(typeMeta.name || "");

      if (short === "r" || normalizedName.includes("reprezent")) {
        return false;
      }

      if (short === "o" || short === "n") {
        return true;
      }

      if (normalizedName.includes("ospravedlnen") || normalizedName.includes("neospravedlnen")) {
        return true;
      }

      return true;
    }
    function isMissedLessonRecord(record, absenceTypeMap = null) {
      if (String(record?.presence || "") !== "A") return false;

      const typeId = String(record?.studentabsent_typeid || "").trim();
      if (!typeId) return true;

      return shouldCountAbsentType(absenceTypeMap?.get(typeId));
    }
    function separateMergedWords(value) {
      return String(value || "")
        .replace(/([a-záäčďéíĺľňóôŕšťúýž])([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])/g, "$1 $2");
    }
    function separateMergedWordsUnicode(value) {
      return String(value || "")
        .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2");
    }
    function normalizeText(value) {
      return separateMergedWordsUnicode(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    function hasUsefulLetters(value) {
      return /[a-z]/i.test(String(value || ""));
    }
    function extractCallArguments(text, marker, searchFrom = 0) {
      const markerIndex = text.indexOf(marker, searchFrom);
      if (markerIndex === -1) return null;

      const openParenIndex = text.indexOf("(", markerIndex + marker.length);
      if (openParenIndex === -1) return null;

      const balanced = EE.extractBalanced(text, openParenIndex);
      if (!balanced) return null;

      return EE.splitTopLevelArguments(balanced.slice(1, -1));
    }
    function decodeAscJsonDc(payload) {
      const encodedValues = payload[0];
      const library = payload[1];
      const keyCache = [];
      let pointer = 0;

      function decodeValue() {
        const token = encodedValues[pointer++];

        switch (token) {
          case -1: {
            const size = encodedValues[pointer++];
            const array = [];
            for (let index = 0; index < size; index += 1) {
              array.push(decodeValue());
            }
            return array;
          }
          case -2: {
            const size = encodedValues[pointer++];
            const keys = [];
            const object = {};
            for (let index = 0; index < size; index += 1) {
              keys.push(decodeValue());
            }
            keyCache.push(keys);
            for (let index = 0; index < size; index += 1) {
              object[keys[index]] = decodeValue();
            }
            return object;
          }
          case -3:
            return [];
          case -4:
            return [decodeValue()];
          case -5:
            return [decodeValue(), decodeValue()];
          default:
            break;
        }

        if (token < 0) {
          const keys = keyCache[-token - 10];
          const object = {};
          for (let index = 0; index < keys.length; index += 1) {
            object[keys[index]] = decodeValue();
          }
          return object;
        }

        const value = library[token];
        return Array.isArray(value) ? value.slice(0) : value;
      }

      return decodeValue();
    }
    function parseSerializedValue(text) {
      const rawText = String(text || "").trim();
      if (!rawText) return null;

      if (rawText.startsWith("ASC.json_dc")) {
        const openParenIndex = rawText.indexOf("(");
        const balanced = EE.extractBalanced(rawText, openParenIndex);
        if (!balanced) {
          throw new Error("Could not extract ASC.json_dc payload.");
        }
        const decodedPayload = JSON.parse(balanced.slice(1, -1));
        return decodeAscJsonDc(decodedPayload);
      }

      return JSON.parse(rawText);
    }
    function parseSubjectMap(...sources) {
      const map = new Map();

      sources.forEach((source) => {
        Object.entries(source || {}).forEach(([key, value]) => {
          const subjectId = String(key || "").trim();
          if (!subjectId) return;

          const existing = map.get(subjectId) || { id: subjectId, name: "", short: "" };
          const nextValue = {
            id: subjectId,
            name: String(value?.name || existing.name || "").trim(),
            short: String(value?.short || existing.short || "").trim(),
          };

          map.set(subjectId, nextValue);
        });
      });

      return map;
    }
    function parseAttendanceHalfStats(html) {
      const halfStatsText = EE.extractObjectLiteral(html, "\"halfStats\":");
      if (!halfStatsText) return null;

      try {
        return JSON.parse(halfStatsText);
      } catch (error) {
        console.warn("[Edupage Extras] Could not parse attendance halfStats payload.", error);
        return null;
      }
    }
    function parseAttendanceTypeMap(html) {
      const candidateMarkers = [
        "\"ciselnik0\":",
        "\"studentabsent_types\":",
      ];

      for (const marker of candidateMarkers) {
        const rawText = EE.extractObjectLiteral(html, marker);
        if (!rawText) continue;

        try {
          const parsed = JSON.parse(rawText);
          const map = new Map();

          Object.entries(parsed || {}).forEach(([id, value]) => {
            const typeId = String(value?.id || id || "").trim();
            if (!typeId) return;

            map.set(typeId, {
              id: typeId,
              name: String(value?.name || "").trim(),
              short: String(value?.short || "").trim(),
              et: String(value?.et || "").trim(),
            });
          });

          if (map.size > 0) {
            return map;
          }
        } catch (error) {
          console.warn("[Edupage Extras] Could not parse attendance type map.", error);
        }
      }

      return new Map();
    }
    function addAlias(set, value) {
      const normalized = normalizeText(value);
      if (normalized) {
        set.add(normalized);
      }
    }
    function buildNameAliases(...values) {
      const aliases = new Set();

      values.forEach((value) => {
        const raw = String(value || "").trim();
        if (!raw) return;

        addAlias(aliases, raw);

        const withoutParentheses = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
        addAlias(aliases, withoutParentheses);

        Array.from(raw.matchAll(/\(([^)]+)\)/g)).forEach((match) => {
          const inner = String(match[1] || "").trim();
          if (inner.length >= 2) {
            addAlias(aliases, inner);
          }
        });

        withoutParentheses.split(/\s+-\s+|\/|\||,/g).forEach((part) => {
          const trimmed = part.trim();
          if (trimmed.length >= 2 && hasUsefulLetters(trimmed)) {
            addAlias(aliases, trimmed);
          }
        });
      });

      return Array.from(aliases);
    }
    function resolveSubjectMeta(subjectToken, subjectMap) {
      const rawId = String(subjectToken || "").trim();
      if (!rawId) return null;

      const subject = subjectMap.get(rawId);
      const displayName = String(
        subject?.name || (/^\d+$/.test(rawId) ? "" : rawId),
      ).trim();
      const shortName = String(subject?.short || "").trim();

      return {
        rawId,
        displayName,
        shortName,
        aliases: buildNameAliases(displayName, shortName, /^\d+$/.test(rawId) ? "" : rawId),
      };
    }
    function isResolvableSubjectToken(subjectToken, subjectMap) {
      const rawId = String(subjectToken || "").trim();
      if (!rawId) return false;
      if (subjectMap?.has(rawId)) return true;
      return /^\d+$/.test(rawId);
    }
    function subjectEntryKey(meta) {
      if (!meta) return "";
      return meta.rawId ? `id:${meta.rawId}` : `name:${normalizeText(meta.displayName)}`;
    }
    function ensureSubjectEntry(entryMap, subjectToken, subjectMap) {
      const meta = resolveSubjectMeta(subjectToken, subjectMap);
      if (!meta) return null;

      const key = subjectEntryKey(meta);
      if (!key) return null;

      let entry = entryMap.get(key);
      if (!entry) {
        entry = {
          key,
          rawId: meta.rawId,
          displayName: meta.displayName || meta.shortName || meta.rawId,
          shortName: meta.shortName || "",
          absent: 0,
          total: 0,
          aliases: new Set(meta.aliases),
        };
        entryMap.set(key, entry);
      } else {
        meta.aliases.forEach((alias) => entry.aliases.add(alias));
        if (!entry.displayName && meta.displayName) {
          entry.displayName = meta.displayName;
        }
        if (!entry.shortName && meta.shortName) {
          entry.shortName = meta.shortName;
        }
      }

      return entry;
    }
    function resolveSecondHalfStartDate(turnoverDate, overrideValue) {
      const nextTurnover = new Date(
        turnoverDate.getFullYear() + 1,
        turnoverDate.getMonth(),
        turnoverDate.getDate(),
      );
      const overrideDate = GE.parseDateOnly(overrideValue);
      if (overrideDate && overrideDate >= turnoverDate && overrideDate < nextTurnover) {
        return overrideDate;
      }
      return new Date(turnoverDate.getFullYear() + 1, 1, 1);
    }
    function resolveSecondHalfEndDate(turnoverDate, secondHalfStart, overrideValue) {
      const nextTurnover = new Date(
        turnoverDate.getFullYear() + 1,
        turnoverDate.getMonth(),
        turnoverDate.getDate(),
      );
      const overrideDate = GE.parseDateOnly(overrideValue);
      if (overrideDate && overrideDate >= secondHalfStart && overrideDate < nextTurnover) {
        return overrideDate;
      }
      return new Date(turnoverDate.getFullYear() + 1, 5, 30);
    }
    function resolveCurrentHalfWindow({
      currentDate,
      yearTurnover,
      selectedYear,
      selectedHalfKey,
      halves,
      secondHalfOverride,
      secondHalfEndOverride,
    }) {
      const today = GE.parseDateOnly(currentDate) || new Date();

      let turnoverDate = GE.parseDateOnly(yearTurnover);
      if (Number.isInteger(selectedYear) && turnoverDate?.getFullYear() !== selectedYear) {
        turnoverDate = new Date(selectedYear, 8, 1);
      }

      if (!turnoverDate) {
        const fallbackYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
        turnoverDate = new Date(fallbackYear, 8, 1);
      }

      const secondHalfStart = resolveSecondHalfStartDate(turnoverDate, secondHalfOverride);
      const secondHalfEnd = resolveSecondHalfEndDate(turnoverDate, secondHalfStart, secondHalfEndOverride);
      const halfKey = selectedHalfKey === "1" || selectedHalfKey === "2"
        ? selectedHalfKey
        : (today < secondHalfStart ? "1" : "2");
      const startDate = halfKey === "1" ? turnoverDate : secondHalfStart;
      const halfEndDate = halfKey === "1"
        ? new Date(secondHalfStart.getFullYear(), secondHalfStart.getMonth(), secondHalfStart.getDate() - 1)
        : secondHalfEnd;
      const effectiveEndDate = today < startDate
        ? startDate
        : (today > halfEndDate ? halfEndDate : today);
      const effectiveEndIso = GE.formatDateISO(effectiveEndDate);
      const now = new Date();

      return {
        currentDate: effectiveEndIso,
        startDate: GE.formatDateISO(startDate),
        endDate: effectiveEndIso,
        halfEndDate: GE.formatDateISO(halfEndDate),
        halfKey,
        halfLabel: halves?.[halfKey] || `${halfKey}. Polrok`,
        nowMinutes: effectiveEndIso === GE.formatDateISO(now) ? now.getHours() * 60 + now.getMinutes() : 24 * 60,
      };
    }

    // Parent accounts with multiple children get one entry per child in both
    // `order` and `students`; nothing here tells us which child's grades table
    // is currently displayed, so — same policy as the #22 fix in
    // attendance-enhancer.js — resolve a student id only when it's
    // unambiguous. Guessing `order[0]`/first key would silently show one
    // child's absences next to another child's grades.
    function resolveUnambiguousStudentId(payload) {
      const order = Array.isArray(payload?.order) ? payload.order : [];
      const studentKeys = Object.keys(payload?.students || {});
      if (order.length > 1 || studentKeys.length > 1) return "";
      return String(order[0] || studentKeys[0] || "").trim();
    }
    function resolveOfficialHalfSummary(attendanceInfo, halfWindow) {
      const studentId = resolveUnambiguousStudentId(attendanceInfo?.payload);

      if (!studentId) return null;

      const rawHalfStats = attendanceInfo?.halfStats?.[studentId];
      const currentHalfStats = rawHalfStats?.[halfWindow?.halfKey];
      if (!currentHalfStats) return null;

      const absent = GE.numberValue(currentHalfStats.absent);
      // Slovak schools compute absence % as absent / (present + absent).
      // Distant lessons (trips, competitions, school activities) are excluded from
      // the denominator — same formula as computeHalfStats in attendance-enhancer.js.
      const total = GE.numberValue(currentHalfStats.present) + absent;

      if (total <= 0 && absent <= 0) return null;

      return {
        absent,
        total,
        percent: total > 0 ? (absent / total) * 100 : Number.NaN,
      };
    }
    function parseAttendancePage(html) {
      const markerIndex = html.indexOf("/dashboard/dochadzka.js#initZiak");
      if (markerIndex === -1) {
        throw new Error("Attendance GE.init payload was not found.");
      }

      const initArgs = extractCallArguments(html, "return f", markerIndex);
      if (!initArgs || initArgs.length < 3) {
        throw new Error("Attendance GE.init payload arguments were not found.");
      }

      const payload = parseSerializedValue(initArgs[2]);
      const ttdbArgs = extractCallArguments(html, "ttdb.fill");
      const ttdb = ttdbArgs?.[0] ? parseSerializedValue(ttdbArgs[0]) : {};

      return {
        payload,
        halfStats: parseAttendanceHalfStats(html),
        absenceTypeMap: parseAttendanceTypeMap(html),
        subjectMap: parseSubjectMap(ttdb?.subjects),
        yearTurnover: payload?.info?.year_turnover || (html.match(/"year_turnover":"(\d{4}-\d{2}-\d{2})"/)?.[1] || null),
        selectedYear: Number.parseInt(html.match(/"selectedYear":(\d{4})/)?.[1] || "", 10) || null,
        halves: payload?.halves || { "1": "1. Polrok", "2": "2. Polrok" },
      };
    }
    function parseTtdayPage(html) {
      const classbookSectionIndex = html.indexOf("DashboardClassbook");
      if (classbookSectionIndex === -1) {
        throw new Error("Classbook section was not found on ttday page.");
      }

      const fillArgs = extractCallArguments(html, "classbook.fill", classbookSectionIndex);
      if (!fillArgs || fillArgs.length < 2) {
        throw new Error("Initial classbook payload was not found.");
      }

      const classbookData = parseSerializedValue(fillArgs[1]);
      const gparamMatch = html
        .slice(Math.max(0, classbookSectionIndex - 300), classbookSectionIndex + 900)
        .match(/gpid=(\d+)&gsh=([^"&]+)/);
      const renderArgs = extractCallArguments(html, "classbook.render", classbookSectionIndex);

      return {
        user: parseSerializedValue(fillArgs[0]),
        classbookData,
        subjectMap: parseSubjectMap(classbookData?.dbi?.subjects),
        renderDate: renderArgs?.[0] ? parseSerializedValue(renderArgs[0]) : GE.formatDateISO(new Date()),
        gpid: gparamMatch?.[1] || "",
        gsh: gparamMatch?.[2] || "",
        yearTurnover: html.match(/"year_turnover":"(\d{4}-\d{2}-\d{2})"/)?.[1] || null,
        selectedYear: Number.parseInt(html.match(/"selectedYear":(\d{4})/)?.[1] || "", 10) || null,
      };
    }
    function parseClassbookDataFromText(text) {
      const fillArgs = extractCallArguments(text, "classbook.fill");
      if (fillArgs?.[1]) {
        try {
          return parseSerializedValue(fillArgs[1]);
        } catch (error) {
          console.warn("[Edupage Extras] Could not parse classbook.fill payload.", error);
        }
      }

      const jsonDcIndex = text.indexOf("ASC.json_dc(");
      if (jsonDcIndex !== -1) {
        try {
          const openParenIndex = text.indexOf("(", jsonDcIndex);
          const balanced = EE.extractBalanced(text, openParenIndex);
          if (balanced) {
            const payload = JSON.parse(balanced.slice(1, -1));
            const decoded = decodeAscJsonDc(payload);
            if (decoded?.dates) {
              return decoded;
            }
          }
        } catch (error) {
          console.warn("[Edupage Extras] Could not decode classbook ASC.json_dc payload.", error);
        }
      }

      const trimmed = text.trim();
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
        try {
          const direct = JSON.parse(trimmed);
          if (direct?.dates) {
            return direct;
          }
        } catch (error) {
          console.warn("[Edupage Extras] Could not parse direct classbook payload.", error);
        }
      }

      const objectMarkerMatches = text.matchAll(/"dates"\s*:/g);
      for (const match of objectMarkerMatches) {
        const markerIndex = match.index || 0;

        for (let index = markerIndex; index >= 0; index -= 1) {
          if (text[index] !== "{") continue;

          const balanced = EE.extractBalanced(text, index);
          if (!balanced || !balanced.includes("\"dates\"")) continue;

          try {
            const candidate = JSON.parse(balanced);
            if (candidate?.dates) {
              return candidate;
            }
          } catch (error) {
            continue;
          }
        }
      }

      return null;
    }
    function mergeClassbookData(baseData, extraData) {
      return {
        ...(baseData || {}),
        ...(extraData || {}),
        dates: {
          ...(baseData?.dates || {}),
          ...(extraData?.dates || {}),
        },
        dbi: {
          ...(baseData?.dbi || {}),
          ...(extraData?.dbi || {}),
          subjects: {
            ...(baseData?.dbi?.subjects || {}),
            ...(extraData?.dbi?.subjects || {}),
          },
        },
      };
    }
    function mergeManyClassbookData(...datasets) {
      return datasets.reduce(
        (merged, dataset) => mergeClassbookData(merged, dataset),
        { dates: {} },
      );
    }
    function inspectClassbookResponseText(text) {
      const source = String(text || "");
      return {
        length: source.length,
        hasClassbookFill: source.includes("classbook.fill"),
        hasJsonDc: source.includes("ASC.json_dc("),
        hasDatesKey: source.includes("\"dates\""),
        startsWith: source.slice(0, 120),
      };
    }
    function lessonDurationUnits(item) {
      const candidates = [item?.period, item?.uniperiod, item?.periodorbreak];

      for (const candidate of candidates) {
        const value = String(candidate || "");
        const rangeMatch = /^(\d+)-(\d+)$/.exec(value);
        if (rangeMatch) {
          const start = Number.parseInt(rangeMatch[1], 10);
          const end = Number.parseInt(rangeMatch[2], 10);
          if (end >= start) {
            return end - start + 1;
          }
        }
        if (/^\d+$/.test(value)) {
          return 1;
        }
      }

      return 1;
    }
    function extractLessonPeriods(item) {
      const candidates = [item?.period, item?.uniperiod, item?.periodorbreak];

      for (const candidate of candidates) {
        const value = String(candidate || "");
        const rangeMatch = /^(\d+)-(\d+)$/.exec(value);
        if (rangeMatch) {
          const start = Number.parseInt(rangeMatch[1], 10);
          const end = Number.parseInt(rangeMatch[2], 10);
          if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
            return Array.from({ length: end - start + 1 }, (_, index) => start + index);
          }
        }

        const singleMatch = /^(\d+)$/.exec(value);
        if (singleMatch) {
          return [Number.parseInt(singleMatch[1], 10)];
        }
      }

      return [];
    }
    function isDateInRange(dateKey, startDate, endDate) {
      return dateKey >= startDate && dateKey <= endDate;
    }
    function extractLessonSubjectId(item) {
      return String(
        item?.flags?.dp0?.subjectid
        || item?.subjectid
        || item?.header?.find?.((entry) => entry?.item?.subjectid)?.item?.subjectid
        || "",
      ).trim();
    }
    function computeSubjectAbsences(
      attendancePayload,
      absenceTypeMap,
      classbookData,
      subjectMap,
      halfWindow,
      diagnostics = [],
    ) {
      const entryMap = new Map();
      const studentId = resolveUnambiguousStudentId(attendancePayload);
      const dailyRecords = attendancePayload?.students?.[studentId] || {};

      const unresolvedAbsencesByDate = new Map();

      Object.entries(dailyRecords).forEach(([dateKey, dayEntries]) => {
        if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

        const unresolvedPeriods = new Set();
        let hasDirectPeriodMapping = false;

        Object.entries(dayEntries || {}).forEach(([periodKey, record]) => {
          if (periodKey === "ad" || !isMissedLessonRecord(record, absenceTypeMap)) {
            return;
          }

          const directEntry = ensureSubjectEntry(entryMap, record?.subjectid, subjectMap);
          if (directEntry) {
            directEntry.absent += 1;
            hasDirectPeriodMapping = true;
            diagnostics.push({
              date: dateKey,
              source: "period-direct",
              subjectid: directEntry.rawId,
              mapped: true,
              displayName: directEntry.displayName,
              period: /^\d+$/.test(periodKey) ? Number.parseInt(periodKey, 10) : null,
              absentUnits: 1,
              typeId: String(record?.studentabsent_typeid || ""),
            });
            return;
          }

          if (/^\d+$/.test(periodKey)) {
            unresolvedPeriods.add(Number.parseInt(periodKey, 10));
          }

          diagnostics.push({
            date: dateKey,
            source: "period-unresolved",
            subjectid: String(record?.subjectid || ""),
            mapped: false,
            displayName: "",
            period: /^\d+$/.test(periodKey) ? Number.parseInt(periodKey, 10) : null,
            typeId: String(record?.studentabsent_typeid || ""),
          });
        });

        if (unresolvedPeriods.size > 0) {
          unresolvedAbsencesByDate.set(dateKey, { periods: unresolvedPeriods });
          return;
        }

        const allDayRecord = dayEntries?.ad;
        if (hasDirectPeriodMapping || !isMissedLessonRecord(allDayRecord, absenceTypeMap)) {
          return;
        }

        const directAllDayEntry = ensureSubjectEntry(entryMap, allDayRecord?.subjectid, subjectMap);
        if (directAllDayEntry) {
          const duration = Math.max(1, GE.numberValue(allDayRecord?.durationperiods));
          directAllDayEntry.absent += duration;
          diagnostics.push({
            date: dateKey,
            source: "all-day-direct",
            subjectid: directAllDayEntry.rawId,
            mapped: true,
            displayName: directAllDayEntry.displayName,
            absentUnits: duration,
            durationperiods: duration,
            typeId: String(allDayRecord?.studentabsent_typeid || ""),
          });
          return;
        }

        diagnostics.push({
          date: dateKey,
          source: "all-day-unresolved",
          subjectid: String(allDayRecord?.subjectid || ""),
          mapped: false,
          displayName: "",
          durationperiods: Math.max(1, GE.numberValue(allDayRecord?.durationperiods)),
          typeId: String(allDayRecord?.studentabsent_typeid || ""),
        });
        unresolvedAbsencesByDate.set(dateKey, { allDay: true });
      });

      Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
        if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

        const unresolvedAbsence = unresolvedAbsencesByDate.get(dateKey);
        if (!unresolvedAbsence) return;

        const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
        plan.forEach((item) => {
          if (!shouldCountLessonItem(item, dateKey, halfWindow)) return;

          const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
          if (!entry) return;

          let absentUnits = 0;
          if (unresolvedAbsence.allDay) {
            absentUnits = lessonDurationUnits(item);
          } else if (unresolvedAbsence.periods instanceof Set) {
            const lessonPeriods = extractLessonPeriods(item);
            absentUnits = lessonPeriods.filter((period) => unresolvedAbsence.periods.has(period)).length;
          }

          if (absentUnits > 0) {
            entry.absent += absentUnits;
            diagnostics.push({
              date: dateKey,
              source: unresolvedAbsence.allDay ? "lesson-from-all-day" : "lesson-from-periods",
              subjectid: entry.rawId,
              mapped: true,
              displayName: entry.displayName,
              periods: extractLessonPeriods(item),
              absentUnits,
            });
          }
        });
      });

      return entryMap;
    }
    function shouldCountLessonItem(item, dateKey, halfWindow) {
      if (item?.type !== "lesson") return false;
      if (!extractLessonSubjectId(item)) return false;
      if (item?.flags?.dp0?.cancelled || item?.cancelled) return false;

      if (dateKey === halfWindow.currentDate) {
        const startMinutes = GE.timeToMinutes(item?.starttime || item?.flags?.dp0?.starttime);
        if (Number.isFinite(startMinutes) && startMinutes > halfWindow.nowMinutes) {
          return false;
        }
      }

      return true;
    }
    function computeSubjectTotals(classbookData, subjectMap, halfWindow) {
      const entryMap = new Map();

      Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
        if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

        const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
        plan.forEach((item) => {
          if (!shouldCountLessonItem(item, dateKey, halfWindow)) return;

          const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
          if (!entry) return;

          entry.total += lessonDurationUnits(item);
        });
      });

      return entryMap;
    }
    function weekdayIndexFromISO(dateKey) {
      const date = GE.parseDateOnly(dateKey);
      return date ? date.getDay() : -1;
    }
    function computeProjectedSubjectTotals(classbookData, subjectMap, halfWindow) {
      const entryMap = new Map();
      const observedWeekdayCounts = new Map();
      const remainingWeekdayCounts = new Map();
      const currentDate = String(halfWindow?.currentDate || "");
      const projectionEndDate = String(halfWindow?.halfEndDate || halfWindow?.endDate || "");

      Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
        if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;
        if (dateKey >= currentDate) return;

        const weekday = weekdayIndexFromISO(dateKey);
        if (weekday < 1 || weekday > 5) return;

        const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
        const countedItems = plan.filter((item) => shouldCountLessonItem(item, dateKey, halfWindow));
        if (countedItems.length === 0) return;

        observedWeekdayCounts.set(weekday, GE.numberValue(observedWeekdayCounts.get(weekday)) + 1);

        countedItems.forEach((item) => {
          const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
          if (!entry) return;

          if (!entry.weekdayUnits) {
            entry.weekdayUnits = new Map();
          }

          entry.weekdayUnits.set(
            weekday,
            GE.numberValue(entry.weekdayUnits.get(weekday)) + lessonDurationUnits(item),
          );
        });
      });

      let cursor = addDaysISO(currentDate, 1);
      while (cursor && projectionEndDate && cursor <= projectionEndDate) {
        if (isSchoolDayISO(cursor)) {
          const weekday = weekdayIndexFromISO(cursor);
          if (weekday >= 1 && weekday <= 5) {
            remainingWeekdayCounts.set(weekday, GE.numberValue(remainingWeekdayCounts.get(weekday)) + 1);
          }
        }
        cursor = addDaysISO(cursor, 1);
      }

      const projectedTotals = new Map();
      entryMap.forEach((entry, key) => {
        let projectedRemaining = 0;

        entry.weekdayUnits?.forEach((units, weekday) => {
          const observedDays = GE.numberValue(observedWeekdayCounts.get(weekday));
          const remainingDays = GE.numberValue(remainingWeekdayCounts.get(weekday));
          if (observedDays <= 0 || remainingDays <= 0) return;
          projectedRemaining += (units / observedDays) * remainingDays;
        });

        projectedTotals.set(key, Math.max(0, Math.round(projectedRemaining)));
      });

      return projectedTotals;
    }
    function finalizeSubjectStats(absentEntries, totalEntries, projectedTotals = null) {
      const combined = new Map();

      [absentEntries, totalEntries].forEach((sourceMap) => {
        sourceMap.forEach((entry, key) => {
          const existing = combined.get(key) || {
            key,
            rawId: entry.rawId,
            displayName: entry.displayName,
            shortName: entry.shortName,
            absent: 0,
            total: 0,
            aliases: new Set(),
          };

          existing.absent += GE.numberValue(entry.absent);
          existing.total += GE.numberValue(entry.total);
          entry.aliases.forEach((alias) => existing.aliases.add(alias));

          if (!existing.displayName && entry.displayName) {
            existing.displayName = entry.displayName;
          }
          if (!existing.shortName && entry.shortName) {
            existing.shortName = entry.shortName;
          }

          combined.set(key, existing);
        });
      });

      return Array.from(combined.values())
        .filter((entry) => entry.total > 0 || entry.absent > 0)
        .map((entry) => ({
          key: entry.key,
          rawId: entry.rawId,
          displayName: entry.displayName,
          shortName: entry.shortName,
          absent: entry.absent,
          total: entry.total,
          predictedTotal: entry.total + Math.max(0, GE.numberValue(projectedTotals?.get?.(entry.key))),
          percent: entry.total > 0 ? (entry.absent / entry.total) * 100 : Number.NaN,
          predictedPercent: (entry.total + Math.max(0, GE.numberValue(projectedTotals?.get?.(entry.key)))) > 0
            ? (entry.absent / (entry.total + Math.max(0, GE.numberValue(projectedTotals?.get?.(entry.key))))) * 100
            : Number.NaN,
          aliases: Array.from(entry.aliases),
        }))
        .sort((left, right) => {
          const leftName = normalizeText(left.displayName || left.shortName || left.rawId);
          const rightName = normalizeText(right.displayName || right.shortName || right.rawId);
          return leftName.localeCompare(rightName);
        });
    }
    function formatPercent(value) {
      if (!Number.isFinite(value)) return "-";

      const formatter = new Intl.NumberFormat(document.documentElement.lang || navigator.language || "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${formatter.format(value)} %`;
    }
    function attendanceTone(percent) {
      if (!Number.isFinite(percent) || percent <= 5) {
        return {
          background: "rgba(46, 125, 50, 0.12)",
          color: "var(--ee-link, #2e7d32)",
          className: "ee-attendance-tone-good",
        };
      }
      if (percent <= 15) {
        return {
          background: "rgba(245, 127, 23, 0.12)",
          color: "var(--ee-warning, #f57f17)",
          className: "ee-attendance-tone-warn",
        };
      }
      return {
        background: "rgba(198, 40, 40, 0.12)",
        color: "var(--ee-danger, #c62828)",
        className: "ee-attendance-tone-danger",
      };
    }
    function findSubjectCell(row) {
      return row.querySelector("td.fixedCell")
        || Array.from(row.cells).find((cell) => !cell.classList.contains("znPriemerCell"))
        || row.cells[0]
        || null;
    }
    function insertCellAfter(referenceCell, cell) {
      if (!referenceCell?.parentElement) return cell;

      const parent = referenceCell.parentElement;
      const nextSibling = referenceCell.nextElementSibling;
      parent.insertBefore(cell, nextSibling || null);
      return cell;
    }
    const AVERAGE_HEADER_LABELS = new Set(["priemer", "prumer", "average"]);

    function findAverageHeaderCell(headerRow) {
      if (!headerRow) return null;

      const exactMatch = Array.from(headerRow.cells).find(
        (cell) => AVERAGE_HEADER_LABELS.has(normalizeText(cell.textContent)),
      );
      if (exactMatch) return exactMatch;

      return headerRow.cells[headerRow.cells.length - 2]
        || headerRow.cells[headerRow.cells.length - 1]
        || null;
    }

    // The compact grades table has a top event/category row followed by the
    // summary row containing Average, Certificate, and Notices. EduPage does
    // not consistently put that visible summary row in <thead>, so inspect all
    // table rows instead of assuming standard table-section markup. Header
    // labels must be inserted into that summary row: using the first row makes
    // the extension columns land one grid column away from their body cells.
    // EduPage localises Average, hence all supported labels are recognised
    // before the single-row fallback is used.
    function findAttendanceHeaderRow(table) {
      const tableRows = Array.from(table?.rows || table?.querySelectorAll?.("tr") || []);
      const averageRow = tableRows.find((row) => Array.from(row.cells).some(
        (cell) => AVERAGE_HEADER_LABELS.has(normalizeText(cell.textContent)),
      ));
      return averageRow || tableRows[tableRows.length - 1] || null;
    }

    // EduPage's "Vysvedčenie" (final report grade) column only appears at term end.
    // Natively it sits right after Priemer; our attendance columns must not wedge
    // between them. Tag it once so we can anchor our columns AFTER it. Fully safe —
    // a no-op — when the column isn't present (which is most of the year), so the
    // page never breaks whether it shows up or disappears again.
    //
    // IMPORTANT: each grade renders as its OWN <td> (not one cell holding every
    // grade), so a row's total cell count — and therefore the Vysvedčenie column's
    // index — varies per subject (verified live: index ranged 2 to 14 across rows
    // with header count fixed at 9). A header-derived index does NOT line up with
    // the same column in the body, so we never use one. Instead we confirm the
    // column exists via the header (by text), then locate each row's cell
    // structurally as ".znPriemerCell"'s next sibling — that relationship holds
    // regardless of how many grade cells precede it.
    function tagVysvedcenieColumn(table) {
      const headerRow = findAttendanceHeaderRow(table);
      if (!headerRow) return;
      if (headerRow.querySelector(".ee-vysvedcenie-header")) return; // already tagged

      const headerCells = Array.from(headerRow.cells);
      const headerCell = headerCells.find((cell) =>
        !cell.classList.contains("ee-attendance-header")
        && normalizeText(cell.textContent) === "vysvedcenie");
      if (!headerCell) return; // column absent → robust no-op

      headerCell.classList.add("ee-vysvedcenie-header");
      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const priemerCell = row.querySelector(".znPriemerCell");
        const cell = priemerCell?.nextElementSibling;
        if (cell && cell.tagName === "TD") cell.classList.add("ee-vysvedcenie-cell");
      });
    }

    // Where our attendance columns attach: just after Vysvedčenie when it's shown
    // (so the native Priemer → Vysvedčenie pairing stays intact), otherwise just
    // after Priemer (the all-year default).
    function findAttendanceAnchorHeader(headerRow) {
      return headerRow?.querySelector(".ee-vysvedcenie-header") || findAverageHeaderCell(headerRow);
    }
    function findAttendanceAnchorCell(row) {
      return row.querySelector(".ee-vysvedcenie-cell") || row.querySelector(".znPriemerCell");
    }
    function ensureAttendanceHeaderCell(headerRow, className, text, title, afterCell) {
      let cell = headerRow.querySelector(`.${className}`);
      if (!cell) {
        cell = document.createElement("th");
        cell.className = `ee-attendance-header ${className}`;
        cell.addEventListener("click", (e) => e.stopPropagation());
      } else {
        cell.classList.add("ee-attendance-header", className);
      }

      if (cell.parentElement !== headerRow) {
        cell.remove();
        insertCellAfter(afterCell, cell);
      } else if (afterCell && cell.previousElementSibling !== afterCell) {
        cell.remove();
        insertCellAfter(afterCell, cell);
      }

      cell.textContent = text;
      cell.title = title;
      return cell;
    }
    function syncHeaderCellLayout(cell, referenceCell) {
      if (!(cell instanceof HTMLTableCellElement) || !(referenceCell instanceof HTMLTableCellElement)) {
        return;
      }

      const existingTextAlign = cell.style.textAlign;
      const existingWhiteSpace = cell.style.whiteSpace;

      // Do not clone cssText here. EduPage writes sticky positioning, offsets,
      // and stacking order into native header cells at runtime. Copying those
      // values gives our cells a different sticky layer from the rest of the
      // table, making them detach at the top of the page while native headers
      // remain in their own row. The table's normal <th> rules provide the
      // visual styling; only retain the safe text-layout choices below.
      cell.style.textAlign = existingTextAlign || "center";
      cell.style.whiteSpace = existingWhiteSpace || "nowrap";
    }
    function syncAttendanceHeaderLayout(table) {
      const headerRow = findAttendanceHeaderRow(table);
      if (!headerRow) return;

      const averageHeaderCell = findAverageHeaderCell(headerRow);
      const notesHeader = Array.from(headerRow.cells).find((cell) =>
        !cell.classList.contains("ee-attendance-header")
        && normalizeText(cell.textContent) === "poznamky",
      );
      const referenceCell = averageHeaderCell || notesHeader || headerRow.cells[0] || null;
      if (!(referenceCell instanceof HTMLTableCellElement)) return;

      [
        ".ee-attendance-percent-header",
        ".ee-attendance-total-header",
        ".ee-attendance-predicted-percent-header",
        ".ee-attendance-predicted-total-header",
      ].forEach((selector) => {
        const headerCell = headerRow.querySelector(selector);
        if (headerCell instanceof HTMLTableCellElement) {
          syncHeaderCellLayout(headerCell, referenceCell);
        }
      });
    }
    function ensureAttendanceDataCell(row, className, afterCell) {
      let cell = row.querySelector(`.${className}`);
      if (!cell) {
        cell = document.createElement("td");
        cell.className = `ee-attendance-cell ${className}`;
        cell.addEventListener("click", (e) => e.stopPropagation());
      } else {
        cell.classList.add("ee-attendance-cell", className);
      }

      if (cell.parentElement !== row) {
        cell.remove();
        insertCellAfter(afterCell, cell);
      } else if (afterCell && cell.previousElementSibling !== afterCell) {
        cell.remove();
        insertCellAfter(afterCell, cell);
      }

      return cell;
    }
    function ensureAttendanceColumns(table) {
      table.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
      tagVysvedcenieColumn(table);

      const headerRow = findAttendanceHeaderRow(table);
      const anchorHeaderCell = findAttendanceAnchorHeader(headerRow);

      if (headerRow && anchorHeaderCell) {
        const percentHeader = ensureAttendanceHeaderCell(
          headerRow,
          "ee-attendance-percent-header",
          GE.t("gradesColAbsPercent"),
          GE.t("gradesColAbsPercentTitle"),
          anchorHeaderCell,
        );
        ensureAttendanceHeaderCell(
          headerRow,
          "ee-attendance-total-header",
          GE.t("gradesColAbsTotal"),
          GE.t("gradesColAbsTotalTitle"),
          percentHeader,
        );
        const predictedPercentHeader = ensureAttendanceHeaderCell(
          headerRow,
          "ee-attendance-predicted-percent-header",
          GE.t("gradesColPredAbsPercent"),
          GE.t("gradesColPredAbsPercentTitle"),
          headerRow.querySelector(".ee-attendance-total-header"),
        );
        ensureAttendanceHeaderCell(
          headerRow,
          "ee-attendance-predicted-total-header",
          GE.t("gradesColPredAbsTotal"),
          GE.t("gradesColPredAbsTotalTitle"),
          predictedPercentHeader,
        );
        syncAttendanceHeaderLayout(table);
      }

      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const averageCell = row.querySelector(".znPriemerCell");
        if (!averageCell) return;

        const percentCell = ensureAttendanceDataCell(
          row,
          "ee-attendance-percent-cell",
          findAttendanceAnchorCell(row),
        );
        ensureAttendanceDataCell(
          row,
          "ee-attendance-total-cell",
          percentCell,
        );
        const predictedPercentCell = ensureAttendanceDataCell(
          row,
          "ee-attendance-predicted-percent-cell",
          row.querySelector(".ee-attendance-total-cell"),
        );
        ensureAttendanceDataCell(
          row,
          "ee-attendance-predicted-total-cell",
          predictedPercentCell,
        );
      });
    }
    function clearSubjectAttendance(table) {
      table.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
      table.querySelectorAll(".ee-attendance-header").forEach((element) => element.remove());
      table.querySelectorAll("tr.predmetRow .ee-attendance-cell").forEach((element) => element.remove());
      table.querySelectorAll("tr.predmetRow").forEach((row) => {
        delete row.dataset.eeAttendanceSignature;
      });
      table.removeAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR);
    }
    function buildAttendancePlaceholderState(mode = "unavailable", title = "") {
      const loading = mode === "loading";
      return {
        text: loading ? "..." : "-",
        title: title || (loading
          ? "Attendance data is still loading."
          : "Attendance data is not available yet."),
        empty: true,
        loading,
        className: loading ? "ee-attendance-empty ee-attendance-loading" : "ee-attendance-empty",
      };
    }
    function shouldRenderPredictedAttendance({ predictionState = "ready", predictedPercent, predictedTotal } = {}) {
      if (predictionState !== "ready") {
        return false;
      }
      return Number.isFinite(predictedPercent) && GE.numberValue(predictedTotal) > 0;
    }
    function setAttendanceCellValue(cell, text, { tone = null, title = "", empty = false, loading = false } = {}) {
      cell.textContent = "";

      const value = document.createElement("span");
      value.className = empty ? "ee-attendance-empty" : "ee-attendance-stat";
      if (empty && loading) {
        value.classList.add("ee-attendance-loading");
      }
      if ((cell.classList.contains("ee-attendance-total-cell") || cell.classList.contains("ee-attendance-predicted-total-cell")) && !empty) {
        value.classList.add("ee-attendance-total");
      }
      if (!empty) {
        value.style.color = "";
      }
      if (tone?.className && !empty) {
        value.classList.add(tone.className);
      } else if (tone?.color && !empty) {
        value.style.color = tone.color;
      }
      value.textContent = text;

      cell.appendChild(value);
      if (title) {
        cell.title = title;
      } else {
        cell.removeAttribute("title");
      }
    }
    function populateAttendancePlaceholders(table, title = GE.t("gradesAttendanceUnavailable"), { loading = false } = {}) {
      GE.markInternalMutation();
      ensureAttendanceColumns(table);
      const placeholder = buildAttendancePlaceholderState(loading ? "loading" : "unavailable", title);

      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const percentCell = row.querySelector(".ee-attendance-percent-cell");
        const totalCell = row.querySelector(".ee-attendance-total-cell");
        const predictedPercentCell = row.querySelector(".ee-attendance-predicted-percent-cell");
        const predictedTotalCell = row.querySelector(".ee-attendance-predicted-total-cell");
        if (!percentCell || !totalCell || !predictedPercentCell || !predictedTotalCell) return;

        setAttendanceCellValue(percentCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
        setAttendanceCellValue(totalCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
        setAttendanceCellValue(predictedPercentCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
        setAttendanceCellValue(predictedTotalCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
        delete row.dataset.eeAttendanceSignature;
      });

      table.removeAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR);
    }
    function readRowSubjectText(row) {
      const subjectCell = findSubjectCell(row);
      if (!subjectCell) return "";

      const directText = Array.from(subjectCell.childNodes || [])
        .filter((node) => node?.nodeType === Node.TEXT_NODE)
        .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
        .map((text) => text.replace(/^[+*•\s-]+/, "").trim())
        .find((text) => hasUsefulLetters(text) && normalizeText(text).length >= 3);
      if (directText) {
        return directText;
      }

      const clone = subjectCell.cloneNode(true);
      clone.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
      const rawText = typeof clone.innerText === "string" ? clone.innerText : clone.textContent;
      const lines = String(rawText || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const firstLine = (lines[0] || "").replace(/^[+*•\s-]+/, "").trim();
      if (hasUsefulLetters(firstLine) && normalizeText(firstLine).length >= 3) {
        return firstLine;
      }

      const meaningfulLine = lines
        .map((line) => line.replace(/^[+*•\s-]+/, "").trim())
        .find((line) => hasUsefulLetters(line) && normalizeText(line).length >= 3);
      return meaningfulLine || firstLine || lines[0] || "";
    }
    function readPrimaryRowSubjectText(row) {
      const subjectCell = findSubjectCell(row);
      if (!subjectCell) return "";

      const directText = Array.from(subjectCell.childNodes || [])
        .filter((node) => node?.nodeType === Node.TEXT_NODE)
        .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
        .map((text) => text.replace(/^[+*\s-]+/, "").trim())
        .find((text) => hasUsefulLetters(text) && normalizeText(text).length >= 3);
      if (directText) {
        return directText;
      }

      const clone = subjectCell.cloneNode(true);
      clone.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
      const rawText = typeof clone.innerText === "string" ? clone.innerText : clone.textContent;
      const lines = String(rawText || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const firstLine = (lines[0] || "").replace(/^[+*\s-]+/, "").trim();
      if (hasUsefulLetters(firstLine) && normalizeText(firstLine).length >= 3) {
        return firstLine;
      }

      const meaningfulLine = lines
        .map((line) => line.replace(/^[+*\s-]+/, "").trim())
        .find((line) => hasUsefulLetters(line) && normalizeText(line).length >= 3);
      return meaningfulLine || firstLine || lines[0] || "";
    }
    function readRowSubjectId(row) {
      return String(row?.dataset?.predmetid || "").trim();
    }
    function buildRowAliases(rowText) {
      return new Set(buildNameAliases(rowText));
    }
    function isExactSubjectAliasMatch(rowAliases, entry) {
      return Array.from(entry.aliases || []).some((alias) => alias && rowAliases.has(alias));
    }
    function aggregateMatchedStats(entries) {
      const displayNames = [];
      let absent = 0;
      let total = 0;
      let predictedTotal = 0;

      entries.forEach((entry) => {
        absent += GE.numberValue(entry.absent);
        total += GE.numberValue(entry.total);
        predictedTotal += Math.max(GE.numberValue(entry.total), GE.numberValue(entry.predictedTotal) || GE.numberValue(entry.total));
        if (entry.displayName) {
          displayNames.push(entry.displayName);
        }
      });

      return {
        displayNames,
        absent,
        total,
        predictedTotal,
        percent: total > 0 ? (absent / total) * 100 : Number.NaN,
        predictedPercent: predictedTotal > 0 ? (absent / predictedTotal) * 100 : Number.NaN,
      };
    }
    function projectionEntryMatchesSubject(entry, projection) {
      const subjectAliases = new Set(entry.aliases || []);
      const projectionAliases = buildNameAliases(projection?.title || "");
      return projectionAliases.some((alias) => alias && subjectAliases.has(alias));
    }
    function applyProjectedTimetableTotals(subjects, projectedSubjects) {
      return (subjects || []).map((entry) => {
        const matchingProjections = (projectedSubjects || []).filter((projection) => projectionEntryMatchesSubject(entry, projection));
        const projectedRemaining = matchingProjections.reduce(
          (sum, projection) => sum + GE.numberValue(projection?.remainingUnits),
          0,
        );
        const predictedTotal = entry.total + Math.max(0, projectedRemaining);

        return {
          ...entry,
          predictedTotal,
          predictedPercent: predictedTotal > 0 ? (entry.absent / predictedTotal) * 100 : Number.NaN,
        };
      });
    }
    function findMatchingSubjectEntries(rowText, subjectStats, rowSubjectId = "") {
      const rowAliases = buildRowAliases(rowText);
      const normalizedRowText = normalizeText(rowText);
      const directMatches = rowSubjectId
        ? subjectStats.filter((entry) => String(entry?.rawId || "").trim() === rowSubjectId)
        : [];
      if (rowAliases.size === 0 && !normalizedRowText) {
        return Array.from(
          new Map(directMatches.map((entry) => [entry.key, entry])).values(),
        );
      }

      let aliasMatches = subjectStats.filter((entry) =>
        isExactSubjectAliasMatch(rowAliases, entry),
      );

      if (aliasMatches.length === 0 && normalizedRowText) {
        aliasMatches = subjectStats.filter((entry) =>
          Array.from(entry.aliases || []).some((alias) =>
            alias && (
              normalizedRowText === alias
              || normalizedRowText.startsWith(`${alias} `)
              || alias.startsWith(`${normalizedRowText} `)
            ),
          ),
        );
      }

      if (aliasMatches.length > 0) {
        const longestAliasLength = aliasMatches.reduce((maxLength, entry) => {
          const entryMax = Array.from(entry.aliases || []).reduce((entryLength, alias) => {
            if (!alias) return entryLength;
            if (
              normalizedRowText === alias
              || normalizedRowText.startsWith(`${alias} `)
              || alias.startsWith(`${normalizedRowText} `)
            ) {
              return Math.max(entryLength, alias.length);
            }
            return entryLength;
          }, 0);
          return Math.max(maxLength, entryMax);
        }, 0);

        if (longestAliasLength > 0) {
          aliasMatches = aliasMatches.filter((entry) =>
            Array.from(entry.aliases || []).some((alias) =>
              alias
              && alias.length === longestAliasLength
              && (
                normalizedRowText === alias
                || normalizedRowText.startsWith(`${alias} `)
                || alias.startsWith(`${normalizedRowText} `)
              ),
            ),
          );
        }
      }

      const combinedMatches = [...directMatches, ...aliasMatches];

      return Array.from(
        new Map(combinedMatches.map((entry) => [entry.key, entry])).values(),
      );
    }
    function matchSubjectStats(rowText, subjectStats, rowSubjectId = "") {
      const matches = findMatchingSubjectEntries(rowText, subjectStats, rowSubjectId);
      if (matches.length === 0) {
        return null;
      }
      return aggregateMatchedStats(matches);
    }
    function buildSubjectAttendanceRenderSignature(table, data) {
      const rowSignature = Array.from(table.querySelectorAll("tr.predmetRow"))
        .map((row) => readPrimaryRowSubjectText(row))
        .join("|");

      return `${data.currentDate}:${data.halfKey}:${data.subjects.length}:${data.fetchedAt}:${data.predictionState || "ready"}:${rowSignature}`;
    }
    function renderSubjectAttendance(table, data) {
      GE.markInternalMutation();
      ensureAttendanceColumns(table);

      const renderSignature = buildSubjectAttendanceRenderSignature(table, data);
      if (table.getAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR) === renderSignature) {
        return;
      }

      table.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
      const renderDebugRows = [];

      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const percentCell = row.querySelector(".ee-attendance-percent-cell");
        const totalCell = row.querySelector(".ee-attendance-total-cell");
        const predictedPercentCell = row.querySelector(".ee-attendance-predicted-percent-cell");
        const predictedTotalCell = row.querySelector(".ee-attendance-predicted-total-cell");
        if (!percentCell || !totalCell || !predictedPercentCell || !predictedTotalCell) return;

        const rowText = readPrimaryRowSubjectText(row);
        const rowSubjectId = readRowSubjectId(row);
        const matchedStats = matchSubjectStats(rowText, data.subjects, rowSubjectId);
        if (!matchedStats) {
          setAttendanceCellValue(
            percentCell,
            "-",
            { empty: true, title: GE.t("gradesRowUnmatched", [data.halfLabel]) },
          );
          setAttendanceCellValue(
            totalCell,
            "-",
            { empty: true, title: GE.t("gradesRowUnmatched", [data.halfLabel]) },
          );
          setAttendanceCellValue(
            predictedPercentCell,
            "-",
            { empty: true, title: GE.t("gradesRowPredictedUnmatched", [data.halfLabel]) },
          );
          setAttendanceCellValue(
            predictedTotalCell,
            "-",
            { empty: true, title: GE.t("gradesRowPredictedUnmatched", [data.halfLabel]) },
          );
          delete row.dataset.eeAttendanceSignature;
          renderDebugRows.push({
            rowText,
            matched: false,
          });
          return;
        }

        const predictedReady = shouldRenderPredictedAttendance({
          predictionState: data.predictionState || "ready",
          predictedPercent: matchedStats.predictedPercent,
          predictedTotal: matchedStats.predictedTotal,
        });
        const predictedPlaceholder = buildAttendancePlaceholderState(
          data.predictionState === "unavailable" ? "unavailable" : "loading",
          data.predictionState === "unavailable"
            ? GE.t("gradesPredictedUnavailable")
            : GE.t("gradesPredictedLoading"),
        );
        const rowSignature = `${rowText}:${matchedStats.absent}:${matchedStats.total}:${predictedReady ? matchedStats.predictedTotal : data.predictionState || "loading"}`;
        const title = GE.t("gradesRowTooltip", [data.halfLabel, String(matchedStats.absent), String(matchedStats.total)]);
        const predictedTitle = GE.t("gradesRowPredictedTooltip", [data.halfLabel, String(matchedStats.absent), String(matchedStats.predictedTotal)]);
        const tone = attendanceTone(matchedStats.percent);
        const predictedTone = attendanceTone(matchedStats.predictedPercent);

        setAttendanceCellValue(
          percentCell,
          Number.isFinite(matchedStats.percent) ? formatPercent(matchedStats.percent) : "-",
          {
            tone: Number.isFinite(matchedStats.percent) ? tone : null,
            title,
            empty: !Number.isFinite(matchedStats.percent),
          },
        );
        setAttendanceCellValue(
          totalCell,
          `${matchedStats.absent}/${matchedStats.total}`,
          { title },
        );
        setAttendanceCellValue(
          predictedPercentCell,
          predictedReady ? formatPercent(matchedStats.predictedPercent) : predictedPlaceholder.text,
          {
            tone: predictedReady ? predictedTone : null,
            title: predictedReady ? predictedTitle : predictedPlaceholder.title,
            empty: !predictedReady,
            loading: !predictedReady && predictedPlaceholder.loading,
          },
        );
        setAttendanceCellValue(
          predictedTotalCell,
          predictedReady ? `${matchedStats.absent}/${matchedStats.predictedTotal}` : predictedPlaceholder.text,
          {
            title: predictedReady ? predictedTitle : predictedPlaceholder.title,
            empty: !predictedReady,
            loading: !predictedReady && predictedPlaceholder.loading,
          },
        );

        row.dataset.eeAttendanceSignature = rowSignature;
        renderDebugRows.push({
          rowText,
          matched: true,
          absent: matchedStats.absent,
          total: matchedStats.total,
          predictedTotal: predictedReady ? matchedStats.predictedTotal : null,
          percent: Number.isFinite(matchedStats.percent) ? Number(matchedStats.percent.toFixed(2)) : null,
          predictedPercent: predictedReady && Number.isFinite(matchedStats.predictedPercent) ? Number(matchedStats.predictedPercent.toFixed(2)) : null,
          displayNames: matchedStats.displayNames,
        });
      });

      table.setAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR, renderSignature);
      GE.debug.log("Rendered rows", renderDebugRows);

      const rowTexts = renderDebugRows.map((entry) => entry.rowText).filter(Boolean);
      const unmatchedRows = renderDebugRows
        .filter((entry) => !entry.matched)
        .map((entry) => entry.rowText);
      const matchedRowsWithAbsences = renderDebugRows
        .filter((entry) => entry.matched && GE.numberValue(entry.absent) > 0);
      const unmatchedAbsentSubjects = (data.subjects || [])
        .filter((entry) => GE.numberValue(entry.absent) > 0)
        .filter((entry) => !rowTexts.some((rowText) =>
          findMatchingSubjectEntries(rowText, [entry]).length > 0,
        ))
        .map((entry) => ({
          key: entry.key,
          rawId: entry.rawId,
          displayName: entry.displayName,
          shortName: entry.shortName,
          absent: entry.absent,
          total: entry.total,
          percent: Number.isFinite(entry.percent) ? Number(entry.percent.toFixed(2)) : null,
          aliases: Array.from(entry.aliases || []).sort(),
        }));

      GE.debug.log("Matched rows with absences", matchedRowsWithAbsences);
      GE.debug.log("Unmatched row texts", unmatchedRows);
      GE.debug.log("Subjects with absences but no row match", unmatchedAbsentSubjects);
      GE.debug.log("Counted absence diagnostics", data.debug?.absenceDiagnostics || []);
      GE.debug.log(
        "Counted absence diagnostics JSON",
        JSON.stringify(data.debug?.absenceDiagnostics || [], null, 2),
      );
    }
    function summarizeAttendance(subjects) {
      let absent = 0;
      let total = 0;

      (subjects || []).forEach((entry) => {
        absent += GE.numberValue(entry.absent);
        total += GE.numberValue(entry.total);
      });

      return {
        absent,
        total,
        percent: total > 0 ? (absent / total) * 100 : Number.NaN,
      };
    }
    function summarizeRenderableAttendance(subjects) {
      return summarizeAttendance(
        (subjects || []).filter((entry) => GE.numberValue(entry.total) > 0),
      );
    }
    function summarizePredictedAttendance(subjects, currentSummary = null) {
      let absent = GE.numberValue(currentSummary?.absent);
      let total = GE.numberValue(currentSummary?.total);
      let currentMatchedTotal = 0;
      let predictedMatchedTotal = 0;

      (subjects || []).forEach((entry) => {
        const currentTotal = GE.numberValue(entry.total);
        const predictedTotal = Math.max(currentTotal, GE.numberValue(entry.predictedTotal) || currentTotal);
        currentMatchedTotal += currentTotal;
        predictedMatchedTotal += predictedTotal;
      });

      if (!currentSummary) {
        absent = 0;
        total = 0;
        (subjects || []).forEach((entry) => {
          absent += GE.numberValue(entry.absent);
        });
        total = currentMatchedTotal;
      }

      const projectedTotal = total + Math.max(0, predictedMatchedTotal - currentMatchedTotal);

      return {
        absent,
        total: projectedTotal,
        percent: projectedTotal > 0 ? (absent / projectedTotal) * 100 : Number.NaN,
      };
    }
    function listAttendanceOnlyAbsentSubjects(subjects) {
      return (subjects || [])
        .filter((entry) => GE.numberValue(entry.absent) > 0 && GE.numberValue(entry.total) <= 0)
        .map((entry) => ({
          key: entry.key,
          rawId: entry.rawId,
          displayName: entry.displayName,
          shortName: entry.shortName,
          absent: entry.absent,
          total: entry.total,
          percent: Number.isFinite(entry.percent) ? Number(entry.percent.toFixed(2)) : null,
          aliases: Array.from(entry.aliases || []).sort(),
        }));
    }
    function resolveAttendanceBreakdown(renderedSummary, officialHalfSummary, rawAbsentLessons) {
      const matchedAbsent = GE.numberValue(renderedSummary?.absent);
      const matchedTotal = GE.numberValue(renderedSummary?.total);
      const officialAbsent = Math.max(
        GE.numberValue(rawAbsentLessons),
        GE.numberValue(officialHalfSummary?.absent),
      );
      const officialTotal = GE.numberValue(officialHalfSummary?.total);

      const summaryAbsent = Math.max(matchedAbsent, officialAbsent);
      const summaryTotal = Math.max(matchedTotal, officialTotal);
      const unmatchedAbsent = Math.max(0, summaryAbsent - matchedAbsent);
      const unmatchedTotal = Math.max(0, summaryTotal - matchedTotal);

      return {
        matched: {
          absent: matchedAbsent,
          total: matchedTotal,
          percent: matchedTotal > 0 ? (matchedAbsent / matchedTotal) * 100 : Number.NaN,
        },
        unmatched: {
          absent: unmatchedAbsent,
          total: unmatchedTotal,
          percent: unmatchedTotal > 0 ? (unmatchedAbsent / unmatchedTotal) * 100 : Number.NaN,
        },
        summary: {
          absent: summaryAbsent,
          total: summaryTotal,
          percent: summaryTotal > 0 ? (summaryAbsent / summaryTotal) * 100 : Number.NaN,
        },
      };
    }
    function countOverallAbsenceLessons(attendancePayload, absenceTypeMap, halfWindow) {
      const studentId = resolveUnambiguousStudentId(attendancePayload);
      const dailyRecords = attendancePayload?.students?.[studentId] || {};
      let absent = 0;

      Object.entries(dailyRecords).forEach(([dateKey, dayEntries]) => {
        if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

        const countedPeriods = Object.entries(dayEntries || {}).filter(([periodKey, record]) =>
          periodKey !== "ad"
          && isMissedLessonRecord(record, absenceTypeMap),
        );

        if (countedPeriods.length > 0) {
          absent += countedPeriods.length;
          return;
        }

        const allDayRecord = dayEntries?.ad;
        if (
          isMissedLessonRecord(allDayRecord, absenceTypeMap)
        ) {
          absent += Math.max(1, GE.numberValue(allDayRecord?.durationperiods));
        }
      });

      return absent;
    }
    function weekStartISO(dateText) {
      const date = GE.parseDateOnly(dateText);
      if (!date) return "";

      const weekday = date.getDay();
      const offset = weekday === 0 ? -6 : 1 - weekday;
      date.setDate(date.getDate() + offset);
      return GE.formatDateISO(date);
    }
    function addDaysISO(dateText, deltaDays) {
      const date = GE.parseDateOnly(dateText);
      if (!date) return "";

      date.setDate(date.getDate() + deltaDays);
      return GE.formatDateISO(date);
    }
    function buildWeekAnchors(startDate, endDate) {
      const anchors = [];
      let cursor = weekStartISO(startDate);
      const lastWeek = weekStartISO(endDate);

      while (cursor && cursor <= lastWeek) {
        anchors.push(cursor);
        cursor = addDaysISO(cursor, 7);
      }

      return anchors;
    }
    function buildRangeChunks(startDate, endDate, maxDays = CLASSBOOK_RANGE_MAX_DAYS) {
      const chunks = [];
      let cursor = startDate;

      while (cursor && cursor <= endDate) {
        let chunkEnd = addDaysISO(cursor, Math.max(0, maxDays - 1));
        if (!chunkEnd || chunkEnd > endDate) {
          chunkEnd = endDate;
        }

        chunks.push({
          startDate: cursor,
          endDate: chunkEnd,
        });

        if (chunkEnd >= endDate) {
          break;
        }

        cursor = addDaysISO(chunkEnd, 1);
      }

      return chunks;
    }
    function isSchoolDayISO(dateText) {
      const date = GE.parseDateOnly(dateText);
      if (!date) return false;
      const day = date.getDay();
      return day >= 1 && day <= 5;
    }
    function buildSchoolDayAnchors(startDate, endDate) {
      const anchors = [];
      let cursor = startDate;

      while (cursor && cursor <= endDate) {
        if (isSchoolDayISO(cursor)) {
          anchors.push(cursor);
        }
        cursor = addDaysISO(cursor, 1);
      }

      return anchors;
    }
    function countSchoolDaysInRange(startDate, endDate) {
      return buildSchoolDayAnchors(startDate, endDate).length;
    }
    async function readCachedAttendanceStats() {
      const today = GE.formatDateISO(new Date());
      const viewSignature = currentGradesViewSignature();
      if (GE.state.gradesAttendanceDebugEnabled) return null;
      const result = await GE.storageGet([GRADES_ATTENDANCE_CACHE_KEY]);
      const byOrigin = result[GRADES_ATTENDANCE_CACHE_KEY] || {};
      const cached = byOrigin[GE.currentOrigin()]?.[viewSignature];

      if (!cached) return null;
      if (cached.version !== GRADES_ATTENDANCE_CACHE_VERSION) return null;
      if (cached.cacheDate !== today) return null;
      if (Date.now() - GE.numberValue(cached.fetchedAt) > CACHE_TTL_MS) return null;

      return cached;
    }
    async function writeCachedAttendanceStats(stats) {
      if (GE.state.gradesAttendanceDebugEnabled) return;
      const result = await GE.storageGet([GRADES_ATTENDANCE_CACHE_KEY]);
      const byOrigin = result[GRADES_ATTENDANCE_CACHE_KEY] || {};
      const origin = GE.currentOrigin();
      const updated = updateAttendanceCache(byOrigin, origin, stats, currentGradesViewSignature());
      await GE.storageSet({ [GRADES_ATTENDANCE_CACHE_KEY]: updated });
    }
    async function fetchText(url, options = {}) {
      GE.debug.log("Fetch start", {
        url,
        method: options.method || "GET",
      });
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...options,
      });

      if (!response.ok) {
        throw new Error(`Request failed for ${url}: ${response.status}`);
      }

      const text = await response.text();
      GE.debug.log("Fetch ok", {
        url,
        method: options.method || "GET",
        length: text.length,
        startsWith: text.slice(0, 120),
      });
      return text;
    }
    async function fetchClassbookData(ttdayInfo, {
      date,
      datefrom = "",
      dateto = "",
    } = {}) {
      const params = new URLSearchParams({
        gpid: ttdayInfo.gpid,
        gsh: ttdayInfo.gsh,
        action: "loadData",
        user: String(ttdayInfo.user || ""),
        date: date || ttdayInfo.renderDate,
        changes: JSON.stringify({}),
        _LJSL: "0",
      });

      if (datefrom) {
        params.set("datefrom", datefrom);
      }
      if (dateto) {
        params.set("dateto", dateto);
      }

      const body = params.toString();
      GE.debug.log("Classbook gcall request", {
        date: date || ttdayInfo.renderDate,
        datefrom,
        dateto,
        gpid: ttdayInfo.gpid,
        user: String(ttdayInfo.user || ""),
        body,
      });

      return fetchText("/gcall", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body,
      });
    }
    async function fetchClassbookRange(ttdayInfo, halfWindow) {
      return fetchClassbookData(ttdayInfo, {
        date: halfWindow.endDate,
        datefrom: halfWindow.startDate,
        dateto: halfWindow.endDate,
      });
    }
    async function fetchAnchoredClassbookRange(ttdayInfo, halfWindow, diagnostics = []) {
      const anchors = buildWeekAnchors(halfWindow.startDate, halfWindow.endDate);
      if (anchors.length === 0) {
        return { dates: {} };
      }

      let mergedData = { dates: {} };

      for (const anchor of anchors) {
        const anchoredResponse = await fetchClassbookData(ttdayInfo, { date: anchor });
        const responseInfo = inspectClassbookResponseText(anchoredResponse);
        const anchoredData = parseClassbookDataFromText(anchoredResponse);
        diagnostics.push({
          anchor,
          responseInfo,
          parsedDateCount: Object.keys(anchoredData?.dates || {}).length,
        });
        if (anchoredData?.dates) {
          mergedData = mergeClassbookData(mergedData, anchoredData);
        }
      }

      return mergedData;
    }
    async function fetchChunkedClassbookRange(ttdayInfo, halfWindow, diagnostics = []) {
      const chunks = buildRangeChunks(halfWindow.startDate, halfWindow.endDate);
      if (chunks.length === 0) {
        return { dates: {} };
      }

      let mergedData = { dates: {} };

      for (const chunk of chunks) {
        const responseText = await fetchClassbookData(ttdayInfo, {
          date: chunk.endDate,
          datefrom: chunk.startDate,
          dateto: chunk.endDate,
        });
        const responseInfo = inspectClassbookResponseText(responseText);
        const chunkData = parseClassbookDataFromText(responseText);
        diagnostics.push({
          startDate: chunk.startDate,
          endDate: chunk.endDate,
          responseInfo,
          parsedDateCount: Object.keys(chunkData?.dates || {}).length,
        });

        if (chunkData?.dates) {
          mergedData = mergeClassbookData(mergedData, chunkData);
        }
      }

      return mergedData;
    }
    async function fetchAnchoredTtdayPages(halfWindow, diagnostics = []) {
      const anchors = buildWeekAnchors(halfWindow.startDate, halfWindow.endDate);
      if (anchors.length === 0) {
        return { dates: {} };
      }

      let mergedData = { dates: {} };

      for (const anchor of anchors) {
        const url = `/dashboard/eb.php?mode=ttday&date=${encodeURIComponent(anchor)}`;
        const anchoredHtml = await fetchText(url);
        let parsedInfo = null;

        try {
          parsedInfo = parseTtdayPage(anchoredHtml);
        } catch (error) {
          diagnostics.push({
            anchor,
            source: "ttday-page",
            error: String(error?.message || error || "Unknown parse error"),
          });
          continue;
        }

        diagnostics.push({
          anchor,
          source: "ttday-page",
          renderDate: parsedInfo.renderDate,
          parsedDateCount: Object.keys(parsedInfo.classbookData?.dates || {}).length,
        });

        if (parsedInfo.classbookData?.dates) {
          mergedData = mergeClassbookData(mergedData, parsedInfo.classbookData);
        }
      }

      return mergedData;
    }
    async function fetchDenseTtdayPages(halfWindow, diagnostics = []) {
      const anchors = buildSchoolDayAnchors(halfWindow.startDate, halfWindow.endDate);
      if (anchors.length === 0) {
        return { dates: {} };
      }

      const BATCH_SIZE = 4;
      let mergedData = { dates: {} };

      for (let index = 0; index < anchors.length; index += BATCH_SIZE) {
        const batch = anchors.slice(index, index + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (anchor) => {
            const url = `/dashboard/eb.php?mode=ttday&date=${encodeURIComponent(anchor)}`;

            try {
              const anchoredHtml = await fetchText(url);
              const parsedInfo = parseTtdayPage(anchoredHtml);
              return {
                anchor,
                source: "ttday-dense",
                parsedInfo,
              };
            } catch (error) {
              return {
                anchor,
                source: "ttday-dense",
                error: String(error?.message || error || "Unknown parse error"),
              };
            }
          }),
        );

        results.forEach((result) => {
          if (result.error) {
            diagnostics.push(result);
            return;
          }

          const parsedDateCount = Object.keys(result.parsedInfo?.classbookData?.dates || {}).length;
          diagnostics.push({
            anchor: result.anchor,
            source: result.source,
            renderDate: result.parsedInfo?.renderDate || "",
            parsedDateCount,
          });

          if (parsedDateCount > 0) {
            mergedData = mergeClassbookData(mergedData, result.parsedInfo.classbookData);
          }
        });
      }

      return mergedData;
    }
    async function loadBaseSubjectAttendanceStats() {
      const today = GE.formatDateISO(new Date());
      const viewSignature = currentGradesViewSignature();

      if (
        GE.state.attendanceStatsCache
        && GE.state.attendanceStatsCache.cacheDate === today
        && GE.state.attendanceStatsCache.viewSignature === viewSignature
        && Date.now() - GE.numberValue(GE.state.attendanceStatsCache.fetchedAt) <= CACHE_TTL_MS
      ) {
        return GE.state.attendanceStatsCache;
      }

      if (attendanceBaseStatsPromise?.viewSignature === viewSignature) {
        return attendanceBaseStatsPromise.promise;
      }

      const request = {
        viewSignature,
        promise: (async () => {
        const cached = await readCachedAttendanceStats();
        if (cached) {
          GE.state.attendanceStatsCache = cached;
          window.__eeGradesAttendanceDebug = cached.debug || null;
          GE.debug.syncAttendanceDebug(cached.debug || null);
          attendanceStatsPromise = { viewSignature, promise: Promise.resolve(cached) };
          return cached;
        }

        const [attendanceHtml, ttdayHtml] = await Promise.all([
          fetchText("/dashboard/eb.php?mode=attendance"),
          fetchText("/dashboard/eb.php?mode=ttday"),
        ]);

        const attendanceInfo = parseAttendancePage(attendanceHtml);
        const ttdayInfo = parseTtdayPage(ttdayHtml);
        GE.debug.log("Parsed source pages", {
          today,
          ttdayRenderDate: ttdayInfo.renderDate,
          attendanceSubjects: attendanceInfo.subjectMap.size,
          ttdaySubjects: ttdayInfo.subjectMap.size,
          embeddedDates: Object.keys(ttdayInfo.classbookData?.dates || {}).length,
        });
        const gradesView = GE.state.gradesView || {};
        const selectedYear = Number.isInteger(gradesView.selectedYear)
          ? gradesView.selectedYear
          : (attendanceInfo.selectedYear || ttdayInfo.selectedYear);
        const halfWindow = resolveCurrentHalfWindow({
          currentDate: today,
          yearTurnover: attendanceInfo.yearTurnover || ttdayInfo.yearTurnover,
          selectedYear,
          selectedHalfKey: gradesView.halfKey,
          halves: attendanceInfo.halves,
          secondHalfOverride: GE.state.halfyearStartOverride,
          secondHalfEndOverride: GE.state.halfyearEndOverride,
        });
        const attendanceMatchesGradesYear = !Number.isInteger(gradesView.selectedYear)
          || !Number.isInteger(attendanceInfo.selectedYear)
          || gradesView.selectedYear === attendanceInfo.selectedYear;
        const officialHalfSummary = attendanceMatchesGradesYear
          ? resolveOfficialHalfSummary(attendanceInfo, halfWindow)
          : null;
        GE.debug.log("Resolved half window", halfWindow);

        const classbookResponse = await fetchClassbookRange(ttdayInfo, halfWindow);
        const rangedResponseInfo = inspectClassbookResponseText(classbookResponse);
        const rangedClassbookData = parseClassbookDataFromText(classbookResponse) || { dates: {} };
        const embeddedDateCount = Object.keys(ttdayInfo.classbookData?.dates || {}).length;
        const rangedDateCount = Object.keys(rangedClassbookData?.dates || {}).length;
        const chunkDiagnostics = [];
        const needsChunkedFallback = rangedDateCount <= embeddedDateCount || rangedDateCount < 20;
        const chunkedClassbookData = needsChunkedFallback
          ? await fetchChunkedClassbookRange(ttdayInfo, halfWindow, chunkDiagnostics)
          : { dates: {} };
        const chunkedDateCount = Object.keys(chunkedClassbookData?.dates || {}).length;
        const needsAnchoredFallback = chunkedDateCount <= embeddedDateCount || chunkedDateCount < 20;
        const anchoredDiagnostics = [];
        let anchoredClassbookData = needsAnchoredFallback
          ? await fetchAnchoredClassbookRange(ttdayInfo, halfWindow, anchoredDiagnostics)
          : { dates: {} };
        if (needsAnchoredFallback && Object.keys(anchoredClassbookData?.dates || {}).length < 20) {
          const anchoredPageData = await fetchAnchoredTtdayPages(halfWindow, anchoredDiagnostics);
          anchoredClassbookData = mergeManyClassbookData(
            anchoredClassbookData,
            anchoredPageData,
          );
        }
        let mergedClassbookData = mergeManyClassbookData(
          ttdayInfo.classbookData,
          rangedClassbookData,
          chunkedClassbookData,
          anchoredClassbookData,
        );
        let subjectMap = parseSubjectMap(
          Object.fromEntries(attendanceInfo.subjectMap),
          Object.fromEntries(ttdayInfo.subjectMap),
          mergedClassbookData?.dbi?.subjects,
        );

        const absenceDiagnostics = [];
        const rawAbsentLessons = countOverallAbsenceLessons(
          attendanceInfo.payload,
          attendanceInfo.absenceTypeMap,
          halfWindow,
        );
        let absentEntries = computeSubjectAbsences(
          attendanceInfo.payload,
          attendanceInfo.absenceTypeMap,
          mergedClassbookData,
          subjectMap,
          halfWindow,
          absenceDiagnostics,
        );
        let totalEntries = computeSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
        let subjects = finalizeSubjectStats(absentEntries, totalEntries);
        let renderedAttendanceSummary = summarizeRenderableAttendance(subjects);
        const expectedSchoolDays = countSchoolDaysInRange(halfWindow.startDate, halfWindow.endDate);
        const expectedAbsentLessons = Math.max(
          rawAbsentLessons,
          GE.numberValue(officialHalfSummary?.absent),
        );
        const denseDiagnostics = [];
        const denseFallbackThreshold = Math.max(15, Math.ceil(expectedSchoolDays * 0.7));
        const shouldUseDenseFallback = (
          expectedAbsentLessons > renderedAttendanceSummary.absent
          && Object.keys(mergedClassbookData?.dates || {}).length < denseFallbackThreshold
        );

        if (shouldUseDenseFallback) {
          const denseClassbookData = await fetchDenseTtdayPages(halfWindow, denseDiagnostics);
          const denseDateCount = Object.keys(denseClassbookData?.dates || {}).length;

          if (denseDateCount > 0) {
            mergedClassbookData = mergeManyClassbookData(
              mergedClassbookData,
              denseClassbookData,
            );
            subjectMap = parseSubjectMap(
              Object.fromEntries(attendanceInfo.subjectMap),
              Object.fromEntries(ttdayInfo.subjectMap),
              mergedClassbookData?.dbi?.subjects,
            );
            absenceDiagnostics.length = 0;
            absentEntries = computeSubjectAbsences(
              attendanceInfo.payload,
              attendanceInfo.absenceTypeMap,
              mergedClassbookData,
              subjectMap,
              halfWindow,
              absenceDiagnostics,
            );
            totalEntries = computeSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
            subjects = finalizeSubjectStats(absentEntries, totalEntries);
            renderedAttendanceSummary = summarizeRenderableAttendance(subjects);
          }
        }

        const classbookProjectedTotals = computeProjectedSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
        subjects = subjects.map((entry) => {
          const remaining = GE.numberValue(classbookProjectedTotals.get(entry.key));
          const predictedTotal = entry.total + Math.max(0, remaining);
          return {
            ...entry,
            predictedTotal,
            predictedPercent: predictedTotal > 0 ? (entry.absent / predictedTotal) * 100 : Number.NaN,
          };
        });

        const attendanceBreakdown = resolveAttendanceBreakdown(
          renderedAttendanceSummary,
          officialHalfSummary,
          expectedAbsentLessons,
        );
        const attendanceSummary = attendanceBreakdown.summary;
        const attendanceOnlyAbsentSubjects = listAttendanceOnlyAbsentSubjects(subjects);
        const baseDebug = {
          currentDate: halfWindow.currentDate,
          ttdayRenderDate: ttdayInfo.renderDate,
          halfKey: halfWindow.halfKey,
          halfLabel: halfWindow.halfLabel,
          embeddedDateCount,
          rangedDateCount,
          chunkedDateCount,
          anchoredDateCount: Object.keys(anchoredClassbookData?.dates || {}).length,
          mergedDateCount: Object.keys(mergedClassbookData?.dates || {}).length,
          expectedSchoolDays,
          subjectCount: subjects.length,
          totalLessons: attendanceSummary.total,
          absentLessons: attendanceSummary.absent,
          rawAbsentLessons,
          renderedAbsentLessons: renderedAttendanceSummary.absent,
          unmatchedLessons: attendanceBreakdown.unmatched.total,
          unmatchedAbsentLessons: attendanceBreakdown.unmatched.absent,
          attendanceOnlyAbsentSubjects,
          officialHalfSummary,
          absenceDiagnostics,
          rangedResponseInfo,
          chunkDiagnostics,
          anchoredDiagnostics,
          denseDiagnostics,
          subjects: GE.debug.summarizeSubjectsForDebug(subjects),
        };

        const predictedAttendanceSummary = summarizePredictedAttendance(subjects, attendanceSummary);
        const baseStats = {
          version: GRADES_ATTENDANCE_CACHE_VERSION,
          viewSignature,
          cacheDate: today,
          fetchedAt: Date.now(),
          currentDate: halfWindow.currentDate,
          halfKey: halfWindow.halfKey,
          halfLabel: halfWindow.halfLabel,
          subjects,
          attendanceSummary,
          predictedAttendanceSummary,
          attendanceBreakdown,
          predictionState: "ready",
          debug: baseDebug,
        };

        window.__eeGradesAttendanceDebug = baseDebug;
        GE.debug.syncAttendanceDebug(baseDebug);

        const finalRequest = {
          viewSignature,
          promise: (async () => {
          const predictedSubjects = subjects;
          const debug = {
            ...baseDebug,
            subjects: GE.debug.summarizeSubjectsForDebug(predictedSubjects),
          };
          const stats = {
            ...baseStats,
            fetchedAt: Date.now(),
            subjects: predictedSubjects,
            predictedAttendanceSummary,
            predictionState: "ready",
            debug,
          };

          GE.state.attendanceStatsCache = stats;
          window.__eeGradesAttendanceDebug = debug;
          GE.debug.syncAttendanceDebug(debug);
          GE.debug.log("Final attendance stats", debug);
          if (attendanceSummary.total < 100 || debug.mergedDateCount <= embeddedDateCount) {
            console.warn("[Edupage Extras] Grades attendance diagnostic", debug);
          }
          if (attendanceSummary.total >= 100) {
            await writeCachedAttendanceStats(stats);
          }
          return stats;
          })()
          .finally(() => {
            if (attendanceStatsPromise === finalRequest) attendanceStatsPromise = null;
          }),
        };
        attendanceStatsPromise = finalRequest;

        return baseStats;
        })()
        .catch((error) => {
          if (String(error?.message).includes("Extension context invalidated")) return;
          GE.debug.warn("Could not load grades attendance stats.", error);
          console.warn("[Edupage Extras] Could not load grades attendance stats.", error);
          throw error;
        })
        .finally(() => {
          if (attendanceBaseStatsPromise === request) attendanceBaseStatsPromise = null;
        }),
      };
      attendanceBaseStatsPromise = request;

      return request.promise;
    }
    async function loadSubjectAttendanceStats() {
      const today = GE.formatDateISO(new Date());
      const viewSignature = currentGradesViewSignature();

      if (
        GE.state.attendanceStatsCache
        && GE.state.attendanceStatsCache.cacheDate === today
        && GE.state.attendanceStatsCache.viewSignature === viewSignature
        && Date.now() - GE.numberValue(GE.state.attendanceStatsCache.fetchedAt) <= CACHE_TTL_MS
      ) {
        return GE.state.attendanceStatsCache;
      }

      if (attendanceStatsPromise?.viewSignature === viewSignature) {
        return attendanceStatsPromise.promise;
      }

      const baseStats = await loadBaseSubjectAttendanceStats();
      if (baseStats?.predictionState === "ready") {
        return baseStats;
      }
      if (attendanceStatsPromise?.viewSignature === viewSignature) {
        return attendanceStatsPromise.promise;
      }
      return baseStats;
    }

  GE.attendance = {
    resetForGradesView,
    updateAttendanceCache,
    ensureAttendanceColumns,
    clearSubjectAttendance,
    populateAttendancePlaceholders,
    syncAttendanceHeaderLayout,
    renderSubjectAttendance,
    loadBaseSubjectAttendanceStats,
    loadSubjectAttendanceStats,
    summarizeAttendance,
    summarizeRenderableAttendance,
    readPrimaryRowSubjectText,
    parseSubjectMap,
    computeSubjectAbsences,
    finalizeSubjectStats,
    resolveAttendanceBreakdown,
    resolveOfficialHalfSummary,
    resolveUnambiguousStudentId,
    matchSubjectStats,
    resolveCurrentHalfWindow,
    computeProjectedSubjectTotals,
    buildAttendancePlaceholderState,
    shouldRenderPredictedAttendance,
    normalizeText,
    formatPercent,
    attendanceTone,
    findAttendanceHeaderRow,
    tagVysvedcenieColumn,
  };
})();
