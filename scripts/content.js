/**
 * content.js - Edupage Extras: Dark Mode
 *
 * Edupage uses many independent modules with hardcoded colors and inline
 * styles. Static selectors cover known pages, while the normalizer below tags
 * newly rendered light surfaces and dark text so dark mode stays consistent.
 */

const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CUSTOM_THEME_KEY = "customThemeColors";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";
const ROZVRH_ROOM_CHANGE_COLOR_KEY = "eeRozvrhRoomChangeColor";
const ROZVRH_SUBSTITUTION_COLOR_KEY = "eeRozvrhSubstitutionColor";
const DEFAULT_ROZVRH_ROOM_CHANGE_COLOR = "#1565c0";
const DEFAULT_ROZVRH_SUBSTITUTION_COLOR = "#e65100";
const LAST_SEEN_VERSION_KEY = "eeLastSeenVersion";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
// The release workflow publishes a GitHub Release per tag (notes pulled from
// CHANGELOG.md, zip/xpi attached), so link straight to the Releases page.
const REPO_RELEASES_URL = "https://github.com/JustAlex0000/Edupage-Extras/releases";
const MOBILE_RESPONSIVE_KEY = "eeMobileResponsiveEnabled";
const THEME_CACHE_KEY = "eeThemeCacheV1";

// chrome.storage.local.get() is always async, so on every full-page nav the
// page would otherwise paint once with the light-mode default before the
// real settings resolve and we re-apply dark mode — a visible white flash.
// localStorage is synchronous and shared with the page, so we stash the
// last-applied settings there and use them for the very first paint, then
// reconcile with the real chrome.storage values right after.
function readThemeCache() {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeThemeCache(settings) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(settings));
  } catch (e) {
    // localStorage unavailable (private mode, quota, etc.) — cache is a
    // FOUC-prevention nicety, not required for correctness, so just skip.
  }
}

// Heavier pages (e.g. grades — 7+ blocking stylesheets + several scripts)
// take noticeably longer to finish loading all render-blocking CSS than
// the dashboard, and the browser paints nothing at all until every one of
// them is ready — that blank wait is what shows as a "white flash", not
// our stylesheet losing a cascade fight (it hasn't even had a chance to
// paint yet). A plain inline background-color on <html>, set synchronously
// here, paints immediately regardless of pending stylesheet loads, so the
// blank wait itself reads as dark instead of white. The real per-theme
// background from buildDarkCSS() takes over the instant it's ready.
//
// "pink" is a light pastel theme (see isLightTonedTheme() below), and a
// custom theme can pick a light bgBase too — forcing the dark navy for
// those would itself be the wrong-color flash this code exists to avoid,
// so skip the early paint and let the real light background load in.
const LIGHT_TONED_THEMES = ["pink"];
(function paintEarlyBackground() {
  try {
    const cached = readThemeCache();
    if (
      cached &&
      cached.darkModeEnabled &&
      cached.theme !== "light" &&
      !shouldSuppressThemeForPath() &&
      !isLightTonedTheme(cached.theme, cached.customTheme)
    ) {
      document.documentElement.style.backgroundColor = "#0c1220";
    }
  } catch (e) {
    // best-effort only
  }
})();
const MOBILE_STYLE_ID = "ee-mobile-responsive-style";
const CLASS_NAME = "ee-dark";
const THEME_CLASSES = [
  "ee-theme-dark",
  "ee-theme-ocean",
  "ee-theme-forest",
  "ee-theme-emerald",
  "ee-theme-pink",
  "ee-theme-purple",
  "ee-theme-custom",
  "ee-theme-light",
];
const CLEAN_UI_CLASS = "ee-clean-ui";
const HIDE_HELP_TEXT_CLASS = "ee-hide-help-text";
// "pink" is a light pastel theme, not a dark one — it still goes through the
// ee-dark code path (recolors EduPage's containers via the --ee-* vars), but
// dark-mode-specific sensory adjustments (forced color-scheme: dark, image
// dimming, icon inversion) would look broken on its light background, so
// those are gated behind SCHEME_DARK_CLASS instead of CLASS_NAME.
// (LIGHT_TONED_THEMES itself is declared above paintEarlyBackground(), which
// needs it before this point in the file.)
const SCHEME_DARK_CLASS = "ee-scheme-dark";
const STYLE_ID = "ee-dark-mode-style";
const SURFACE_CLASS = "ee-dark-surface";
const ELEVATED_CLASS = "ee-dark-elevated";
const MUTED_SURFACE_CLASS = "ee-dark-muted-surface";
const TEXT_CLASS = "ee-dark-text";
const MUTED_TEXT_CLASS = "ee-dark-muted-text";
const BORDER_CLASS = "ee-dark-border";
const NORMALIZED_ATTR = "data-ee-dark-normalized";

let observer = null;
let normalizeTimer = null;
let pendingNormalizeRoots = new Set();
let hasBootstrappedDarkMode = false;
let currentTheme = "dark";
let currentCustomTheme = null;
let cleanUiEnabled = false;
let hideHelpTextEnabled = false;
let currentRozvrhRoomChangeColor = DEFAULT_ROZVRH_ROOM_CHANGE_COLOR;
let currentRozvrhSubstitutionColor = DEFAULT_ROZVRH_SUBSTITUTION_COLOR;
const DEFAULT_CUSTOM_THEME = EE.DEFAULT_CUSTOM_THEME;

function buildDarkCSS() {
  return `
    /* === Dark mode, rebuilt from real measured stock colors ==============
       Token set mirrors the actual distinct regions EduPage's own *light*
       skin uses (measured live against a real school instance), not an
       invented design system:
         --ee-page-bg     page body, cards, dialogs — in stock these are
                          ALL literally the same white. No separate "card"
                          tier exists in EduPage's own design, so we don't
                          invent one either.
         --ee-header-bg   the blue top bar (#edubar / .edubarHeader).
         --ee-brand-dark  the one specific dark-navy block EduPage itself
                          hardcodes regardless of skin — the homepage
                          timetable-strip background AND the active sidebar
                          nav item reuse this exact same color in stock, so
                          they share one token here too.
         --ee-sidebar-bg  the left nav column — barely off-white in stock,
                          barely off-page-bg here.
         --ee-border      hairline dividers between cards/rows.
         --ee-text        body/heading text.
         --ee-text-muted  secondary text (timestamps, subtitles).
         --ee-link        clickable text / highlighted values.
       "dark" now uses the palette from the "EduPage Dark Mode" design
       handoff (Claude Design, 2026-07-01) — same regions/selectors as
       before, just repainted with that spec's exact hex values. The other
       theme classes still alias to the previous dark values for now —
       recoloring them properly is the next step once this base is
       confirmed good, not a bug. */
    html.ee-dark.ee-scheme-dark {
      color-scheme: dark !important;
    }

    html.ee-dark:not(.ee-scheme-dark) {
      color-scheme: light !important;
    }

    html.ee-dark {
      --ee-page-bg: #0c1220;
      --ee-card-bg: #141d2e;
      --ee-card-bg-bright: #1a2538;
      --ee-card-hover: #202d43;
      --ee-header-bg: #16233a;
      --ee-brand-dark: #080d16;
      --ee-sidebar-bg: #080d16;
      --ee-sidebar-hover: #0c1726;
      --ee-border: rgba(255, 255, 255, 0.08);
      --ee-text: #e9edf4;
      --ee-text-muted: #b6c0d1;
      --ee-link: #6fa8e8;
      --ee-current-period: #3f5b52;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
      --ee-table-header-bg: #2c70a3;
    }

    html.ee-theme-ocean {
      --ee-page-bg: #071a1f;
      --ee-card-bg: #0d242b;
      --ee-card-bg-bright: #123039;
      --ee-card-hover: #173b46;
      --ee-header-bg: #0e6675;
      --ee-brand-dark: #082b33;
      --ee-sidebar-bg: #0d242b;
      --ee-sidebar-hover: #123640;
      --ee-border: rgba(255, 255, 255, 0.08);
      --ee-text: #d8f3f0;
      --ee-text-muted: #a8d0d1;
      --ee-link: #4dd0e1;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
      --ee-table-header-bg: #0e6675;
    }

    html.ee-theme-forest {
      --ee-page-bg: #11170f;
      --ee-card-bg: #182015;
      --ee-card-bg-bright: #1e291a;
      --ee-card-hover: #243321;
      --ee-header-bg: #2e5a2e;
      --ee-brand-dark: #15241a;
      --ee-sidebar-bg: #182015;
      --ee-sidebar-hover: #20301f;
      --ee-border: rgba(255, 255, 255, 0.08);
      --ee-text: #e5f2df;
      --ee-text-muted: #b3c6aa;
      --ee-link: #81c784;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
      --ee-table-header-bg: #2e5a2e;
    }

    html.ee-theme-emerald {
      --ee-page-bg: #071a12;
      --ee-card-bg: #0d241a;
      --ee-card-bg-bright: #123121;
      --ee-card-hover: #173d29;
      --ee-header-bg: #0f6b4a;
      --ee-brand-dark: #0a2c1f;
      --ee-sidebar-bg: #0d241a;
      --ee-sidebar-hover: #133c2a;
      --ee-border: rgba(255, 255, 255, 0.08);
      --ee-text: #eafff3;
      --ee-text-muted: #a5d6bd;
      --ee-link: #4adfa3;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
      --ee-table-header-bg: #0f6b4a;
    }

    html.ee-theme-purple {
      --ee-page-bg: #171326;
      --ee-card-bg: #1f1a33;
      --ee-card-bg-bright: #26203f;
      --ee-card-hover: #2e274c;
      --ee-header-bg: #4a3a8f;
      --ee-brand-dark: #211a3d;
      --ee-sidebar-bg: #1f1a33;
      --ee-sidebar-hover: #2a2247;
      --ee-border: rgba(255, 255, 255, 0.08);
      --ee-text: #f0eaff;
      --ee-text-muted: #c3b9df;
      --ee-link: #b39ddb;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
      --ee-table-header-bg: #4a3a8f;
    }

    /* Pink is light-toned (see isLightTonedTheme()) so its tiers run the
       opposite direction of the dark themes — "elevated" surfaces get
       brighter/whiter, not darker, same way EduPage's own light skin does. */
    html.ee-theme-pink {
      --ee-page-bg: #fff5fa;
      --ee-card-bg: #ffffff;
      --ee-card-bg-bright: #fff0f7;
      --ee-card-hover: #ffe4ef;
      --ee-header-bg: #f48fb1;
      --ee-brand-dark: #f8c1d8;
      --ee-sidebar-bg: #fff9fc;
      --ee-sidebar-hover: #ffeaf3;
      --ee-border: rgba(0, 0, 0, 0.08);
      --ee-text: #25111b;
      --ee-text-muted: #8a6373;
      --ee-link: #e91e63;
      --ee-warning: #ed6c02;
      --ee-danger: #d32f2f;
      --ee-table-header-bg: #f48fb1;
    }

    html.ee-theme-custom {
      --ee-page-bg: var(--ee-custom-bg-base, #11161f);
      --ee-card-bg: var(--ee-custom-bg-raised, #171d28);
      --ee-card-bg-bright: var(--ee-custom-bg-elevated, #1d2532);
      --ee-card-hover: var(--ee-custom-bg-muted, #232d3d);
      --ee-header-bg: var(--ee-custom-bg-elevated, #255b87);
      --ee-brand-dark: var(--ee-custom-bg-muted, #11263d);
      --ee-sidebar-bg: var(--ee-custom-bg-raised, #171d28);
      --ee-sidebar-hover: var(--ee-custom-bg-elevated, #1b2738);
      --ee-border: var(--ee-custom-border, rgba(255, 255, 255, 0.08));
      --ee-text: var(--ee-custom-text-main, #eef2f7);
      --ee-text-muted: var(--ee-custom-text-muted, #bac3df);
      --ee-link: var(--ee-custom-accent, #4fc3f7);
      --ee-warning: var(--ee-custom-warning, #ffb74d);
      --ee-danger: var(--ee-custom-danger, #ef5350);
      --ee-table-header-bg: var(--ee-custom-table-header-bg, #2c70a3);
    }

    html.ee-dark,
    html.ee-dark body {
      background-color: var(--ee-page-bg) !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark ::selection {
      background-color: var(--ee-brand-dark) !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark input,
    html.ee-dark textarea,
    html.ee-dark select,
    html.ee-dark button {
      background-color: var(--ee-card-bg) !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
    }

    html.ee-dark input::placeholder,
    html.ee-dark textarea::placeholder {
      color: var(--ee-text-muted) !important;
    }

    /* Page: full-bleed wrappers with no visible card boundary of their own. */
    html.ee-dark .bgDiv,
    html.ee-dark .userHomeWidget,
    html.ee-dark .userContentInner,
    html.ee-dark .withMargin,
    html.ee-dark .userTopDivInner,
    html.ee-dark .wmaxL1,
    html.ee-dark .skinContent,
    html.ee-dark .skinBody,
    html.ee-dark .mainBox,
    html.ee-dark .edubarMainNoSkin,
    html.ee-dark #bar_mainDiv,
    html.ee-dark #eb_main_content,
    html.ee-dark .timeline-container,
    html.ee-dark .grid-container,
    html.ee-dark .hwMainListMain,
    html.ee-dark body.skindefault {
      background-color: var(--ee-page-bg) !important;
      background-image: none !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
    }

    /* Cards: dashboard tiles, calendar cells, homework items, grade table,
       popovers/dialogs — one step up from the page so every card boundary
       stays as visible as it is in the light theme (border is brighter
       than the page/card contrast alone to guarantee that). */
    html.ee-dark .userButton,
    html.ee-dark .userHomeOther,
    html.ee-dark .userHomeTitle,
    html.ee-dark .userCal2,
    html.ee-dark .calendar,
    html.ee-dark .userCalInner,
    html.ee-dark .usercalendarTitle,
    html.ee-dark .usercalendarTitle h1,
    html.ee-dark .tml-in-reply,
    html.ee-dark .substitution-item,
    html.ee-dark .attendance-box,
    html.ee-dark .attendanceItem,
    html.ee-dark .gadgetBox,
    html.ee-dark .hw-content,
    html.ee-dark .print-box,
    html.ee-dark .zsvHeader,
    html.ee-dark .zsvFilterElem,
    html.ee-dark #znamkyTableHeaderBg,
    html.ee-dark .zsvActionButtonsInner,
    html.ee-dark table.znamkyTable,
    html.ee-dark table.znamkyTable tr,
    html.ee-dark .notifBox,
    html.ee-dark .smartb,
    html.ee-dark .timeline-item,
    html.ee-dark .tml-item,
    html.ee-dark .profilemenu,
    html.ee-dark .profilemenu li,
    html.ee-dark .profilemenu a,
    html.ee-dark .edubarProfilebox,
    html.ee-dark .dialog,
    html.ee-dark .popup,
    html.ee-dark .modal-content,
    html.ee-dark .zsvHeaderTab,
    html.ee-dark .dropDownPanel,
    html.ee-dark .dropDown,
    html.ee-dark .zsvFilterItem select,
    html.ee-dark .flat-button:not([class*="flat-button-"]) {
      background-color: var(--ee-card-bg) !important;
      background-image: none !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
      border-width: 1px !important;
      border-style: solid !important;
      box-sizing: border-box !important;
    }

    /* The message/news card reads as the "primary" card in stock too
       (first item, boldest content) — give it the brighter card tier so
       it still stands out the same way against its neighbors. */
    html.ee-dark li.news .userButton,
    html.ee-dark li.news .userHomeOther {
      background-color: var(--ee-card-bg-bright) !important;
    }

    /* .hwItem and its inner wrappers (homework/notification list rows) are
       natively transparent in stock — there's no card box around each row,
       just plain rows stacked on the page background. Giving them a card
       background+border (like the old rule here did) invents a box that
       doesn't exist in stock and was the source of "random boxes" on the
       Notifikácie/Učivo pages. */
    html.ee-dark .hwItem,
    html.ee-dark .hwItemBg,
    html.ee-dark .hwItemInner,
    html.ee-dark .hwListElem,
    html.ee-dark .hwDateItem,
    html.ee-dark .hwWeekItem {
      background-color: transparent !important;
      background-image: none !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
    }

    /* The "selected" pill in side list-menus (e.g. "Všetky správy" on the
       Notifikácie page) is hardcoded solid white in stock with a drop
       shadow — left unstyled it shows as a glaring white box in dark mode. */
    html.ee-dark .hwMenuListItem.selected {
      background-color: var(--ee-card-bg-bright) !important;
      box-shadow: none !important;
    }

    html.ee-dark .hwMenuListItem .hwMenuListItemName,
    html.ee-dark .hwMenuListItem {
      color: var(--ee-text) !important;
    }

    /* Timetable cells: slightly lighter than regular cards and a softer
       border at all — in stock this entire strip is one continuous dark
       navy panel with no per-cell dividers, not a grid of boxes. */
    html.ee-dark .gotoDay,
    html.ee-dark .day,
    html.ee-dark .ttday,
    html.ee-dark .ttItem,
    html.ee-dark .tt-day,
    html.ee-dark .timetable,
    html.ee-dark .timetable-cell,
    html.ee-dark .rozvrhItem,
    html.ee-dark .rozvrhItemAlign {
      background-color: var(--ee-brand-dark) !important;
      background-image: none !important;
      color: var(--ee-text) !important;
      border: none !important;
    }

    /* The top info row ("hurá víkend" / teacher info) sits directly under
       the timetable strip in stock as ONE continuous dark navy panel —
       same color, no seam between them — not its own separate card. */
    html.ee-dark .userStats {
      background-color: var(--ee-brand-dark) !important;
      border: none !important;
      color: var(--ee-text) !important;
    }

    /* .userHomeOther/.userHomeTitle are reused generic card-tier classnames,
       but the two specific instances inside the top strip are just wrappers
       around the timetable/nameday panel, not standalone cards — stock has
       no box or seam around them at all, just the one continuous navy
       panel. Strip the card-tier border/background these picked up from
       the generic bordered-card rule so nothing shows through but the
       shared brand-dark panel behind them. */
    html.ee-dark .userTopDivInner .userHomeOther,
    html.ee-dark .userTopDivInner .userHomeTitle {
      background-color: transparent !important;
      border: none !important;
    }

    /* .userTopDivInner/.wmaxL1 themselves still picked up the flat
       page-bg tier (they're generic full-bleed wrapper classnames used
       elsewhere too), which showed through as a mismatched patch behind
       the brand-dark panel above. Scoped to inside .userTopDiv only, so
       other pages that reuse these classnames outside the strip are
       untouched. */
    html.ee-dark .userTopDiv .userTopDivInner,
    html.ee-dark .userTopDiv .wmaxL1 {
      background-color: transparent !important;
    }

    html.ee-dark .userTopLogo,
    html.ee-dark .userTopLogo div {
      color: var(--ee-text) !important;
      background-color: transparent !important;
      background-image: none !important;
    }

    /* Header: the blue top bar, recolored to a darker blue — same hue
       family as stock's own blue header, just dark, not a different color
       entirely. */
    html.ee-dark #edubar,
    html.ee-dark .edubarHeader,
    html.ee-dark .edubarHeaderRight,
    html.ee-dark #edubarStartButton,
    html.ee-dark .edubarRibbon,
    html.ee-dark .ribbon-tab,
    html.ee-dark .ribbon-section,
    html.ee-dark .ribbon-button {
      background-color: var(--ee-header-bg) !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
    }

    /* Sidebar: same tone as the dashboard tiles in the middle of the page,
       per the user's request — no longer its own darker step. */
    html.ee-dark .edubarSidebar,
    html.ee-dark .edubarSidemenu2 {
      background-color: var(--ee-card-bg) !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
    }

    /* The one specific dark-navy block EduPage hardcodes in stock — the
       homepage timetable strip and the active sidebar item share this
       exact same color natively, so they share one token here too. */
    html.ee-dark .userTopDiv,
    html.ee-dark .userRozvrh,
    html.ee-dark .userRozvrh ul.rozvrh,
    html.ee-dark .userTopDiv ul.rozvrh,
    html.ee-dark .edubarMenuitem.active > a {
      background-color: var(--ee-brand-dark) !important;
      background-image: none !important;
      color: var(--ee-text) !important;
    }

    /* Native stock puts a hardcoded light gray-blue border
       (rgb(144, 164, 174)) around the active sidebar link, meant to read
       as a subtle outline on a white sidebar — on a dark sidebar it glows
       as a visible "box" around the current page. Just the brand-dark
       highlight itself is enough of a selected-page indicator. */
    html.ee-dark .edubarMenuitem.active > a {
      border: none !important;
    }

    /* Native profile name label has no border of its own — it's plain text
       inside the already-bordered .edubarProfilebox, not its own card. */
    html.ee-dark .edubarProfilebox .display,
    html.ee-dark .edubarProfilebox .display span {
      background-color: transparent !important;
      border: none !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark .edubarProfilebox .display b {
      color: var(--ee-text-muted) !important;
    }

    html.ee-dark .edubarProfilebox .profilemenu,
    html.ee-dark .edubarHelpMenu .edubarHelpSubmenu {
      background: var(--ee-card-bg) !important;
      border-color: var(--ee-border) !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark .edubarProfilebox .profilemenu a,
    html.ee-dark .edubarProfilebox .profilemenu h1,
    html.ee-dark .edubarProfilebox .profilemenu span {
      color: var(--ee-text) !important;
    }

    html.ee-dark .edubarProfilebox .profilemenu a:hover {
      background: var(--ee-card-hover) !important;
      color: var(--ee-link) !important;
    }

    html.ee-dark .userButton:hover,
    html.ee-dark .profilemenu a:hover,
    html.ee-dark .zsvHeaderTab.selected,
    html.ee-dark .zsvHeaderTab:hover,
    html.ee-dark .flat-button:not([class*="flat-button-"]):hover,
    html.ee-dark table.znamkyTable tr.predmetRow:nth-child(even) {
      background-color: var(--ee-card-hover) !important;
    }

    /* Sidebar item hover gets its own subtle blue tint, separate from the
       generic card-hover tier, so the active/hover states stay in the
       same family as the active block instead of looking like a card. */
    html.ee-dark .edubarMenuitem:hover > a {
      background-color: var(--ee-sidebar-hover) !important;
    }

    html.ee-dark .userButton {
      border: 1px solid var(--ee-border) !important;
    }

    html.ee-dark .userButton:hover {
      border-color: var(--ee-link) !important;
    }

    html.ee-dark .userButton .title,
    html.ee-dark h1,
    html.ee-dark h2,
    html.ee-dark h3,
    html.ee-dark table.znamkyTable td,
    html.ee-dark table.znamkyTable th {
      color: var(--ee-text) !important;
    }

    html.ee-dark .zsvHeaderTitle span,
    html.ee-dark .edubarMenuitem > a,
    html.ee-dark .rozvrhItem .casy {
      color: var(--ee-text-muted) !important;
    }

    /* .subtitle's native stock color is the same link-blue used for
       actual links (rgb(3, 169, 244)), not muted gray — every dashboard
       tile's caption line ("Posledná zmena: ...", message bodies, etc.)
       reads in that cyan in stock, so it does here too. */
    html.ee-dark .userButton .subtitle,
    html.ee-dark .userButton .subtitle * {
      color: var(--ee-link) !important;
    }

    html.ee-dark .subtitle b,
    html.ee-dark .rozvrhItem .predmet,
    html.ee-dark .calendar .day .date,
    html.ee-dark .event.schoolevent b,
    html.ee-dark #edubarStartButton span,
    html.ee-dark #edubarStartButton div,
    html.ee-dark .edubarMenuitem.active > a,
    html.ee-dark .edubarMenuitem:hover > a,
    html.ee-dark a {
      color: var(--ee-link) !important;
    }

    /* Grade table header row is EduPage's own hardcoded brand blue
       (rgb(44, 112, 163), confirmed live 2026-07-01), untouched by any
       theme so it clashed against purple/forest/etc. Themeable via its own
       token (independent of --ee-header-bg) so it's exposed as a separate
       swatch in the custom theme builder. */
    html.ee-dark table.znamkyTable thead th {
      background-color: var(--ee-table-header-bg) !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark .calendar .day.today {
      background-color: color-mix(in srgb, var(--ee-link) 25%, var(--ee-card-bg)) !important;
      border: 1px solid var(--ee-link) !important;
    }

    /* The current-lesson cell in the "Rozvrh dnes" strip — native stock
       highlights this with a translucent yellow (rgba(255, 252, 159, 0.3)
       on .rozvrhItem.selected, confirmed live 2026-07-01), distinct from
       "today" elsewhere in the calendar. Dark mode's own accent color per
       the "EduPage Dark Mode" design handoff. */
    html.ee-dark .rozvrhItem.selected {
      background-color: color-mix(in srgb, var(--ee-current-period) 55%, var(--ee-card-bg)) !important;
      border: 1px solid var(--ee-current-period) !important;
    }

    html.ee-dark .events li {
      background-color: var(--ee-card-bg-bright) !important;
      color: var(--ee-text) !important;
      border: none !important;
    }

    html.ee-dark .events li a {
      color: inherit !important;
    }

    html.ee-dark .notif {
      background-color: var(--ee-danger) !important;
      color: var(--ee-page-bg) !important;
    }

    html.ee-dark .zsvHeaderTabs {
      background-color: transparent !important;
    }

    /* Brand-colored action buttons (e.g. the red "Videl som" acknowledge
       button, blue print button) keep their native color regardless of
       theme — red/blue convey "acknowledge/primary action," not a surface
       to recolor, so they're deliberately excluded from the rules above. */

    html.ee-dark .ee-avg-bar-track {
      background-color: var(--ee-border) !important;
    }

    html.ee-dark tr.ee-overall-row td {
      background-color: var(--ee-card-bg-bright) !important;
      border-top-color: var(--ee-link) !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark tr.ee-overall-row .ee-overall-label {
      color: var(--ee-link) !important;
    }

    html.ee-dark .warning,
    html.ee-dark .hasChange {
      color: var(--ee-warning) !important;
      border-color: var(--ee-warning) !important;
    }

    /* Runtime-normalized unknown Edupage markup */
    html.ee-dark .${SURFACE_CLASS} {
      background-color: var(--ee-card-bg) !important;
      background-image: none !important;
    }

    html.ee-dark .${ELEVATED_CLASS} {
      background-color: var(--ee-sidebar-bg) !important;
      background-image: none !important;
    }

    html.ee-dark .${MUTED_SURFACE_CLASS} {
      background-color: var(--ee-brand-dark) !important;
      background-image: none !important;
    }

    html.ee-dark .${TEXT_CLASS} {
      color: var(--ee-text) !important;
    }

    html.ee-dark .${MUTED_TEXT_CLASS} {
      color: var(--ee-text-muted) !important;
    }

    /* Grades: native stock dims lower-weight/duplicate grades to a lighter
       gray to de-emphasize them, but per user feedback that gray reads as
       barely legible against the dark card background — just make every
       grade number the same readable white regardless of that native
       distinction. */
    html.ee-dark table.znamkyTable .${MUTED_TEXT_CLASS} {
      color: var(--ee-text) !important;
    }

    /* Brand-colored action buttons (flat-button-red/-blue/-graym etc.) keep
       their native saturated background so "acknowledge"/"action" still
       reads regardless of theme (see the dedicated flat-button rule above).
       But the DOM normalizer classifies text color purely by its own
       luminance, with no notion of "sits on a colored button" — a button's
       native medium-toned label text got reclassified as muted-gray and
       forced to --ee-text-muted, which is unreadable against a saturated
       blue/gray button fill. Force full-contrast text back on these. */
    html.ee-dark [class*="flat-button-"].${MUTED_TEXT_CLASS} {
      color: var(--ee-text) !important;
    }

    html.ee-dark .${BORDER_CLASS} {
      border-color: var(--ee-border) !important;
      outline-color: var(--ee-border) !important;
    }

    /* Inline hardcoded light backgrounds that are common in Edupage widgets */
    html.ee-dark *[style*="background-color: white"],
    html.ee-dark *[style*="background: white"],
    html.ee-dark *[style*="background-color: #fff"],
    html.ee-dark *[style*="background: #fff"],
    html.ee-dark *[style*="background-color:#ffffff"],
    html.ee-dark *[style*="background-color: #ffffff"],
    html.ee-dark *[style*="background-color: rgb(255, 255, 255)"],
    html.ee-dark *[style*="background-color: #f5f5f5"],
    html.ee-dark *[style*="background-color: #eeeeee"],
    html.ee-dark *[style*="background-color: #f6f7f9"] {
      background-color: var(--ee-card-bg) !important;
      color: var(--ee-text) !important;
    }

    html.ee-dark.ee-scheme-dark img {
      filter: brightness(0.82) contrast(1.08) !important;
    }

    /* NOTE: dashboard/sidebar icons (.user-button-icon, .ebicon) and most
       img[src*="icon"] assets are full-color illustrations, not simple
       monochrome glyphs — a blanket invert+hue-rotate(180deg) used to be
       applied here to make dark icons visible on a dark page, but rotating
       hue 180° on a colorful icon (e.g. an orange/brown briefcase) shifts
       it to an unrelated color (blue) instead of just inverting lightness.
       That broke "preserve original icon colors," so it's removed — icons
       now only get the gentle brightness/contrast dimming below, which
       doesn't touch hue. */

    /* The top-bar action icons (chat/mail/help/etc, .qbutton img) are
       already white-on-transparent assets (served from EduPage's own
       /bar/white/ icon set) meant for its colored header skins. Inverting
       an already-white icon turns it almost black, making it disappear
       against our dark header — so these are left at their native color
       instead of going through the generic dark-icon inversion above. */
    html.ee-dark.ee-scheme-dark .qbutton img {
      filter: none !important;
    }

    html.ee-dark * {
      box-shadow: none !important;
    }

    html.ee-clean-ui .adsbygoogle,
    html.ee-clean-ui iframe[src*="ads"],
    html.ee-clean-ui [class*="advert"],
    html.ee-clean-ui [id*="advert"],
    html.ee-clean-ui [class*="banner"],
    html.ee-clean-ui [id*="banner"] {
      display: none !important;
    }

    html.ee-clean-ui .skinContent,
    html.ee-clean-ui .userContentInner,
    html.ee-clean-ui #eb_main_content,
    html.ee-clean-ui .mainBox,
    html.ee-clean-ui .userTopDivInner,
    html.ee-clean-ui .userTopDiv .withMargin,
    html.ee-clean-ui .userRozvrh {
      margin-left: auto !important;
      margin-right: auto !important;
      max-width: 1180px !important;
    }

    html.ee-clean-ui .userTopDiv {
      display: block !important;
      padding-left: 12px !important;
      padding-right: 12px !important;
    }

    html.ee-clean-ui .userTopDivInner {
      display: flex !important;
      justify-content: center !important;
      width: calc(100% - 24px) !important;
    }

    html.ee-hide-help-text .userTopLogo,
    html.ee-hide-help-text a.userTopLogo.learnMoreBtn {
      display: none !important;
    }
  `;
}

function buildMobileResponsiveCSS() {
  const M = "html.ee-mobile-responsive";
  return `
    @media (max-width: 768px) {
      /* ── Global guards ──────────────────────────────────
         Nothing may force the layout viewport wider than the
         screen: hidden overflow as the last resort, fluid media,
         and breakable long words (links, filenames, teacher
         emails) inside content cards. */
      ${M} body {
        overflow-x: hidden !important;
        -webkit-text-size-adjust: 100% !important;
      }

      ${M} img {
        max-width: 100% !important;
        height: auto !important;
      }

      ${M} iframe,
      ${M} video,
      ${M} canvas,
      ${M} embed,
      ${M} object {
        max-width: 100% !important;
      }

      ${M} .userButton,
      ${M} .userHomeWidget,
      ${M} .userHomeOther,
      ${M} .timeline-item,
      ${M} .tml-item,
      ${M} .tml-in-reply,
      ${M} .hwItem,
      ${M} .hw-content,
      ${M} .notifBox {
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }

      /* ── Fixed-width containers → fluid ─────────────────
         Also strip left/right margins and floats: the desktop
         layout reserves a gutter for the sidebar column, which
         otherwise survives as dead space once the sidebar is
         repositioned. */
      ${M} .userTopDivInner,
      ${M} .wmaxL1,
      ${M} .userRozvrh,
      ${M} .skinContent,
      ${M} .skinBody,
      ${M} .userContentInner,
      ${M} .mainBox,
      ${M} .bgDiv,
      ${M} .withMargin,
      ${M} .edubarMain,
      ${M} .edubarMainNoSkin,
      ${M} #eb_main_content,
      ${M} #bar_mainDiv,
      ${M} .hwMainListMain {
        width: auto !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        float: none !important;
        box-sizing: border-box !important;
      }

      /* ── Sidebar → horizontal chip rail ─────────────────
         A wrapped wall of menu pills eats half a phone screen
         before any content shows. One compact row that scrolls
         sideways (like every mobile tab bar) keeps the menu
         reachable and the content on top. */
      ${M} .edubarSidebar,
      ${M} .edubarSidemenu2 {
        position: static !important;
        float: none !important;
        display: flex !important;
        flex-wrap: nowrap !important;
        align-items: stretch !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        max-height: none !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        gap: 2px !important;
        padding: 4px !important;
        box-sizing: border-box !important;
        scrollbar-width: thin !important;
      }

      ${M} .edubarSidebar::-webkit-scrollbar,
      ${M} .edubarSidemenu2::-webkit-scrollbar {
        height: 4px !important;
      }

      ${M} .edubarMenuitem {
        flex: 0 0 auto !important;
        width: auto !important;
        min-width: 0 !important;
      }

      ${M} .edubarMenuitem > a {
        display: inline-flex !important;
        align-items: center !important;
        min-height: 40px !important;
        padding: 6px 12px !important;
        font-size: 13px !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
      }

      /* ── Top bar compact ────────────────────────────── */
      ${M} #edubar,
      ${M} .edubarHeader {
        flex-wrap: wrap !important;
        min-height: 0 !important;
        max-width: 100% !important;
      }

      ${M} .edubarHeaderRight {
        flex-wrap: wrap !important;
        gap: 4px !important;
      }

      ${M} .edubarProfilebox {
        max-width: 100% !important;
      }

      ${M} .edubarProfilebox .display {
        font-size: 13px !important;
      }

      ${M} #edubarStartButton {
        padding: 6px 10px !important;
        font-size: 13px !important;
      }

      /* ── Main content column ────────────────────────── */
      ${M} .skinBody {
        display: flex !important;
        flex-direction: column !important;
      }

      ${M} .edubarMainNoSkin {
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
      }

      /* ── Dashboard widgets → stack vertically ──────── */
      ${M} .userTopDiv {
        flex-direction: column !important;
      }

      ${M} .userTopDivInner {
        flex-direction: column !important;
        flex-wrap: wrap !important;
      }

      ${M} .userButton,
      ${M} .userHomeWidget,
      ${M} .userHomeOther {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        font-size: 13px !important;
      }

      ${M} .userHomeTitle {
        font-size: 14px !important;
      }

      /* ── Timetable strip → one row, swipeable ───────── */
      ${M} .userRozvrh {
        flex-direction: column !important;
      }

      ${M} ul.rozvrh {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        max-width: 100% !important;
        padding: 0 !important;
      }

      ${M} ul.rozvrh > li {
        flex: 0 0 auto !important;
      }

      ${M} .userStats {
        flex-wrap: wrap !important;
        font-size: 12px !important;
      }

      /* ── Data tables → horizontal scroll ────────────── */
      ${M} table.znamkyTable,
      ${M} .timetable,
      ${M} .gotoDay,
      ${M} table.dash_dochadzka,
      ${M} .rozvrhTable,
      ${M} .grid-container {
        display: block !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        max-width: 100% !important;
      }

      ${M} table.znamkyTable td,
      ${M} table.znamkyTable th {
        padding: 4px 6px !important;
        font-size: 12px !important;
      }

      /* ── Timetable cells ────────────────────────────── */
      ${M} .rozvrhItem,
      ${M} .rozvrhItemAlign,
      ${M} .timetable-cell,
      ${M} .ttItem {
        min-width: 60px !important;
        padding: 4px !important;
        font-size: 11px !important;
      }

      /* ── Calendar ───────────────────────────────────── */
      ${M} .userCal2,
      ${M} .calendar,
      ${M} .userCalInner {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
      }

      /* ── Timeline / news feed ───────────────────────── */
      ${M} .timeline-container {
        padding: 0 !important;
      }

      ${M} .timeline-item,
      ${M} .tml-item,
      ${M} .tml-in-reply {
        padding: 8px !important;
        font-size: 13px !important;
      }

      /* ── Homework / notifications ───────────────────── */
      ${M} .hwItem,
      ${M} .hwItemInner,
      ${M} .hw-content {
        padding: 8px !important;
      }

      ${M} .notifBox {
        padding: 8px !important;
        font-size: 13px !important;
      }

      ${M} .substitution-item {
        flex-wrap: wrap !important;
        font-size: 13px !important;
      }

      /* ── Dialogs / modals → near full-screen ────────── */
      ${M} .dialog,
      ${M} .popup,
      ${M} .modal-content {
        position: fixed !important;
        top: 4px !important;
        left: 4px !important;
        right: 4px !important;
        bottom: auto !important;
        width: auto !important;
        max-width: calc(100vw - 8px) !important;
        max-height: 90vh !important;
        overflow-y: auto !important;
        margin: 0 !important;
        transform: none !important;
      }

      ${M} .dropDownPanel,
      ${M} .dropDown {
        max-width: calc(100vw - 16px) !important;
        overflow-x: auto !important;
      }

      /* ── Forms & touch targets ──────────────────────────
         16px text inputs stop iOS Safari from auto-zooming the
         page on focus. The touch-size floor stays scoped to
         real action buttons — a blanket "button {min-height:
         44px}" inflates the small inline icon buttons EduPage
         scatters through tables and toolbars. */
      ${M} input[type="text"],
      ${M} input[type="password"],
      ${M} input[type="email"],
      ${M} input[type="search"],
      ${M} input[type="number"],
      ${M} select,
      ${M} textarea {
        font-size: 16px !important;
        max-width: 100% !important;
      }

      ${M} .smartb,
      ${M} .flat-button {
        min-height: 40px !important;
        box-sizing: border-box !important;
      }

      /* ── Grade filter bar → wrap ────────────────────── */
      ${M} .zsvHeader,
      ${M} .zsvHeaderTab,
      ${M} .zsvFilterElem,
      ${M} .zsvActionButtonsInner {
        flex-wrap: wrap !important;
        gap: 4px !important;
        max-width: 100% !important;
      }

      ${M} .zsvFilterItem select {
        min-width: 100px !important;
      }

      /* ── Attendance grid ────────────────────────────── */
      ${M} .attendance-box,
      ${M} .attendanceItem {
        min-width: 0 !important;
        font-size: 12px !important;
      }

      /* ── Print boxes → stack ────────────────────────── */
      ${M} .print-box {
        width: 100% !important;
        max-width: 100% !important;
      }

      /* ── Logo area compact ──────────────────────────── */
      ${M} .userTopLogo {
        padding: 8px !important;
        font-size: 14px !important;
      }

      ${M} .userTopLogo img {
        max-height: 32px !important;
        width: auto !important;
      }

      /* ── Ribbon (toolbar) → wrap ────────────────────── */
      ${M} .edubarRibbon,
      ${M} .ribbon-section {
        flex-wrap: wrap !important;
        gap: 2px !important;
      }

      ${M} .ribbon-button {
        padding: 6px 8px !important;
        font-size: 12px !important;
      }

      /* ── Profile menu dropdown ──────────────────────── */
      ${M} .profilemenu {
        max-width: calc(100vw - 16px) !important;
      }

      ${M} .profilemenu li,
      ${M} .profilemenu a {
        padding: 10px 12px !important;
        font-size: 14px !important;
      }

      /* ── Gadget boxes → full width ──────────────────── */
      ${M} .gadgetBox {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* ── Scrollbar hide on touch (thin on desktop) ──── */
      ${M} ::-webkit-scrollbar {
        width: 4px !important;
        height: 4px !important;
      }
    }

    @media (max-width: 480px) {
      ${M} .edubarSidebar {
        gap: 1px !important;
        padding: 2px !important;
      }

      ${M} .edubarMenuitem > a {
        padding: 5px 9px !important;
        font-size: 12px !important;
      }

      ${M} .userButton,
      ${M} .userHomeOther,
      ${M} .timeline-item,
      ${M} .tml-item,
      ${M} .hwItem,
      ${M} .notifBox {
        padding: 6px !important;
        font-size: 12px !important;
      }

      ${M} table.znamkyTable td,
      ${M} table.znamkyTable th {
        padding: 3px 4px !important;
        font-size: 11px !important;
      }

      ${M} .rozvrhItem,
      ${M} .timetable-cell,
      ${M} .ttItem {
        min-width: 50px !important;
        font-size: 10px !important;
      }
    }
  `;
}

function ensureMobileResponsiveStylesheet() {
  const existing = document.getElementById(MOBILE_STYLE_ID);
  if (existing) {
    existing.textContent = buildMobileResponsiveCSS();
    return existing;
  }
  const style = document.createElement("style");
  style.id = MOBILE_STYLE_ID;
  style.textContent = buildMobileResponsiveCSS();
  (document.head || document.documentElement).appendChild(style);
  return style;
}

const MOBILE_VIEWPORT_CONTENT = "width=device-width, initial-scale=1";

// EduPage's own markup has no <meta name="viewport">, so mobile browsers fall
// back to a desktop-width layout viewport (~980px) and zoom the whole page out
// to fit the screen instead of reflowing it. That means our max-width:768px
// media query never matches on a real phone, and even if it did the elements
// are still laid out at desktop width underneath the zoom. Forcing a proper
// viewport tag is what actually makes the layout viewport match the screen so
// the responsive CSS below has something to respond to.
function ensureMobileViewport(enabled) {
  const runWithHead = (fn) => {
    if (document.head) {
      fn();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.head) {
        observer.disconnect();
        fn();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  };

  runWithHead(() => {
    let meta = document.head.querySelector('meta[name="viewport"]');
    if (enabled) {
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "viewport");
        meta.dataset.eeAdded = "true";
        document.head.appendChild(meta);
      } else if (meta.dataset.eeOriginalContent === undefined) {
        meta.dataset.eeOriginalContent = meta.getAttribute("content") || "";
      }
      meta.setAttribute("content", MOBILE_VIEWPORT_CONTENT);
    } else if (meta) {
      if (meta.dataset.eeAdded === "true") {
        meta.remove();
      } else if (meta.dataset.eeOriginalContent !== undefined) {
        meta.setAttribute("content", meta.dataset.eeOriginalContent);
        delete meta.dataset.eeOriginalContent;
      }
    }
  });
}

function applyMobileResponsive(enabled) {
  ensureMobileResponsiveStylesheet();
  ensureMobileViewport(Boolean(enabled));
  document.documentElement.classList.toggle("ee-mobile-responsive", Boolean(enabled));
}

function ensureStylesheet() {
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = buildDarkCSS();
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildDarkCSS();
  (document.head || document.documentElement).appendChild(style);
}

function parseRgb(value) {
  if (!value || value === "transparent") return null;

  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;

  const r = Number.parseFloat(parts[0]);
  const g = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;

  if ([r, g, b, a].some((part) => Number.isNaN(part))) return null;
  return { r, g, b, a };
}

function luminance(color) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) return null;
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

// Pink is statically known to be light. Custom is user-defined, so its
// "light or dark" tone is derived from the actual background color picked
// instead of guessed.
function isLightTonedTheme(theme, customTheme) {
  if (LIGHT_TONED_THEMES.includes(theme)) return true;
  if (theme !== "custom") return false;
  const rgb = hexToRgb(customTheme?.bgBase);
  return rgb ? luminance(rgb) > 0.5 : false;
}

function shouldSkipElement(element) {
  if (!(element instanceof Element)) return true;
  if (element.id === STYLE_ID) return true;
  if (["SCRIPT", "STYLE", "LINK", "META", "TITLE", "SVG", "PATH"].includes(element.tagName)) {
    return true;
  }
  return false;
}

function resetElementClasses(element) {
  element.classList.remove(
    SURFACE_CLASS,
    ELEVATED_CLASS,
    MUTED_SURFACE_CLASS,
    TEXT_CLASS,
    MUTED_TEXT_CLASS,
    BORDER_CLASS,
  );
  element.removeAttribute(NORMALIZED_ATTR);
}

function normalizeElement(element) {
  if (shouldSkipElement(element)) return;

  resetElementClasses(element);

  const styles = window.getComputedStyle(element);
  const background = parseRgb(styles.backgroundColor);
  const color = parseRgb(styles.color);
  const borderColors = [
    parseRgb(styles.borderTopColor),
    parseRgb(styles.borderRightColor),
    parseRgb(styles.borderBottomColor),
    parseRgb(styles.borderLeftColor),
    parseRgb(styles.outlineColor),
  ].filter(Boolean);

  let touched = false;

  if (background && background.a > 0.1) {
    const bgLum = luminance(background);
    if (bgLum > 0.86) {
      element.classList.add(SURFACE_CLASS);
      touched = true;
    } else if (bgLum > 0.72) {
      element.classList.add(ELEVATED_CLASS);
      touched = true;
    } else if (bgLum > 0.52) {
      element.classList.add(MUTED_SURFACE_CLASS);
      touched = true;
    }
  }

  if (color && color.a > 0.35) {
    const textLum = luminance(color);
    if (textLum < 0.2) {
      element.classList.add(TEXT_CLASS);
      touched = true;
    } else if (textLum < 0.42) {
      element.classList.add(MUTED_TEXT_CLASS);
      touched = true;
    }
  }

  if (borderColors.some((borderColor) => borderColor.a > 0.15 && luminance(borderColor) > 0.68)) {
    element.classList.add(BORDER_CLASS);
    touched = true;
  }

  if (touched) {
    element.setAttribute(NORMALIZED_ATTR, "1");
  }
}

function normalizeSubtree(root = document.documentElement) {
  if (!document.documentElement.classList.contains(CLASS_NAME)) return;
  if (!root) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    normalizeElement(root);
    root.querySelectorAll("*").forEach(normalizeElement);
  }
}

function flushNormalize() {
  normalizeTimer = null;
  const roots = Array.from(pendingNormalizeRoots);
  pendingNormalizeRoots.clear();

  if (!document.documentElement.classList.contains(CLASS_NAME)) return;

  // If a full-document pass is queued, do it once and skip the per-node work.
  if (roots.includes(document.documentElement)) {
    normalizeSubtree(document.documentElement);
    return;
  }

  roots.forEach((root) => {
    if (root && root.isConnected) {
      normalizeSubtree(root);
    }
  });
}

function scheduleNormalize(root = document.documentElement) {
  // Leading-edge: the first node in a burst gets normalized immediately so
  // freshly AJAX-injected content (e.g. switching sidebar tabs) doesn't sit
  // unstyled/white for the debounce window — only the rest of the burst is
  // still debounced, so large re-renders don't trigger a sweep per node.
  const isLeading = normalizeTimer === null && root && root.isConnected;
  if (isLeading) {
    normalizeSubtree(root);
  } else if (root) {
    pendingNormalizeRoots.add(root);
  }
  window.clearTimeout(normalizeTimer);
  normalizeTimer = window.setTimeout(flushNormalize, 80);
}

function startObserver() {
  if (observer || !document.documentElement) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only re-scan the inserted subtrees, not the whole document, so large
      // EduPage re-renders do not trigger a full-page getComputedStyle sweep.
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scheduleNormalize(node);
          }
        });
        continue;
      }

      if (
        mutation.type === "attributes" &&
        mutation.target instanceof Element &&
        !mutation.attributeName.startsWith("data-ee-") &&
        mutation.attributeName !== "class"
      ) {
        scheduleNormalize(mutation.target);
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
    childList: true,
    subtree: true,
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.clearTimeout(normalizeTimer);
  normalizeTimer = null;
  pendingNormalizeRoots.clear();
}

function clearNormalizedClasses() {
  document.querySelectorAll(`[${NORMALIZED_ATTR}]`).forEach(resetElementClasses);
}

function normalizeTheme(theme) {
  return EE.normalizeTheme(theme);
}

function shouldSuppressThemeForPath(pathname = window.location.pathname) {
  return /^\/login(?:\/|$)/i.test(String(pathname || ""));
}

function resolveAppliedTheme({
  darkModeEnabled = false,
  theme = currentTheme,
  pathname = window.location.pathname,
} = {}) {
  if (!darkModeEnabled || shouldSuppressThemeForPath(pathname)) {
    return "light";
  }
  return normalizeTheme(theme);
}

function normalizeColor(value, fallback) {
  return EE.normalizeColor(value, fallback);
}

function normalizeCustomTheme(theme) {
  return EE.normalizeCustomTheme(theme);
}

function applyCustomThemeProperties(theme) {
  const colors = normalizeCustomTheme(theme);
  const root = document.documentElement;
  root.style.setProperty("--ee-custom-bg-base", colors.bgBase);
  root.style.setProperty("--ee-custom-bg-raised", colors.bgRaised);
  root.style.setProperty("--ee-custom-bg-elevated", colors.bgElevated);
  root.style.setProperty("--ee-custom-bg-muted", colors.bgMuted);
  root.style.setProperty("--ee-custom-border", colors.border);
  root.style.setProperty("--ee-custom-text-main", colors.textMain);
  root.style.setProperty("--ee-custom-text-muted", colors.textMuted);
  root.style.setProperty("--ee-custom-accent", colors.accent);
  root.style.setProperty("--ee-custom-warning", colors.warning);
  root.style.setProperty("--ee-custom-danger", colors.danger);
  root.style.setProperty("--ee-custom-table-header-bg", colors.tableHeaderBg);
}

// Applied unconditionally (not gated behind html.ee-dark or any ee-theme-*
// class) so the homepage schedule highlight colors stay correct in every
// theme, including "light" — where ee-dark is never added at all.
function applyRozvrhColorProperties(roomChangeColor, substitutionColor) {
  const root = document.documentElement;
  root.style.setProperty("--ee-rozvrh-room-change-color", normalizeColor(roomChangeColor, DEFAULT_ROZVRH_ROOM_CHANGE_COLOR));
  root.style.setProperty("--ee-rozvrh-substitution-color", normalizeColor(substitutionColor, DEFAULT_ROZVRH_SUBSTITUTION_COLOR));
}

function setThemeClasses(theme, cleanEnabled, helpHidden, schemeIsLight) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  root.classList.toggle(CLEAN_UI_CLASS, cleanEnabled);
  root.classList.toggle(HIDE_HELP_TEXT_CLASS, helpHidden);
  root.classList.add(`ee-theme-${theme}`);
  root.classList.toggle(SCHEME_DARK_CLASS, theme !== "light" && !schemeIsLight);
  root.dataset.eeTheme = theme;
}

function applyTheme({
  darkModeEnabled = false,
  theme = currentTheme,
  customTheme = currentCustomTheme,
  cleanEnabled = cleanUiEnabled,
  helpHidden = hideHelpTextEnabled,
  rozvrhRoomChangeColor = currentRozvrhRoomChangeColor,
  rozvrhSubstitutionColor = currentRozvrhSubstitutionColor,
} = {}) {
  const normalizedTheme = normalizeTheme(theme);
  const selectedTheme = resolveAppliedTheme({
    darkModeEnabled,
    theme: normalizedTheme,
    pathname: window.location.pathname,
  });
  currentTheme = normalizedTheme;
  currentCustomTheme = normalizeCustomTheme(customTheme);
  cleanUiEnabled = cleanEnabled;
  hideHelpTextEnabled = helpHidden;
  currentRozvrhRoomChangeColor = normalizeColor(rozvrhRoomChangeColor, DEFAULT_ROZVRH_ROOM_CHANGE_COLOR);
  currentRozvrhSubstitutionColor = normalizeColor(rozvrhSubstitutionColor, DEFAULT_ROZVRH_SUBSTITUTION_COLOR);
  applyCustomThemeProperties(currentCustomTheme);
  applyRozvrhColorProperties(currentRozvrhRoomChangeColor, currentRozvrhSubstitutionColor);
  ensureStylesheet();
  setThemeClasses(selectedTheme, cleanEnabled, helpHidden, isLightTonedTheme(selectedTheme, currentCustomTheme));

  if (selectedTheme !== "light") {
    document.documentElement.classList.add(CLASS_NAME);
    normalizeSubtree();
    startObserver();
  } else {
    stopObserver();
    document.documentElement.classList.remove(CLASS_NAME);
    clearNormalizedClasses();
  }
}

function initDarkMode() {
  if (!hasBootstrappedDarkMode) {
    hasBootstrappedDarkMode = true;
    const cached = readThemeCache();
    if (cached) {
      applyMobileResponsive(cached.mobileResponsiveEnabled === true);
      applyTheme(cached);
    } else {
      applyTheme({ darkModeEnabled: false, theme: "dark", cleanEnabled: false, helpHidden: false });
    }
  }

  chrome.storage.local.get(
    [STORAGE_KEY, THEME_KEY, CUSTOM_THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY, ROZVRH_ROOM_CHANGE_COLOR_KEY, ROZVRH_SUBSTITUTION_COLOR_KEY, MOBILE_RESPONSIVE_KEY],
    (result) => {
      const mobileResponsiveEnabled = result[MOBILE_RESPONSIVE_KEY] === true;
      applyMobileResponsive(mobileResponsiveEnabled);
      const enabled = result[STORAGE_KEY] === true;
      const theme = normalizeTheme(result[THEME_KEY]);
      const customTheme = normalizeCustomTheme(result[CUSTOM_THEME_KEY]);
      const cleanEnabled = result[CLEAN_UI_KEY] === true;
      const helpHidden = result[HIDE_HELP_TEXT_KEY] === true;
      const rozvrhRoomChangeColor = normalizeColor(result[ROZVRH_ROOM_CHANGE_COLOR_KEY], DEFAULT_ROZVRH_ROOM_CHANGE_COLOR);
      const rozvrhSubstitutionColor = normalizeColor(result[ROZVRH_SUBSTITUTION_COLOR_KEY], DEFAULT_ROZVRH_SUBSTITUTION_COLOR);
      const settings = { darkModeEnabled: enabled, theme, customTheme, cleanEnabled, helpHidden, rozvrhRoomChangeColor, rozvrhSubstitutionColor, mobileResponsiveEnabled };
      applyTheme(settings);
      writeThemeCache(settings);
    },
  );
}

// Deliberate test hook: tests set globalThis.__EE_TEST__ before evaluating
// this file in a vm sandbox and read the internals from __eeTestExports —
// a missing name then fails loudly instead of a string-replace anchor
// silently no-opping after a refactor. Never set in the real extension.
if (globalThis.__EE_TEST__) {
  globalThis.__eeTestExports = { normalizeTheme, shouldSuppressThemeForPath, resolveAppliedTheme };
}

initDarkMode();

// Shows a one-time toast the first time the page loads after an update —
// not on first install (lastSeen is unset then, so we just record the
// version silently). Respects the same "Update Reminders" toggle the
// GitHub-install update checker already uses, so muting one mutes both.
function showUpdateToast(version) {
  if (document.getElementById("ee-update-toast")) return;

  const toast = document.createElement("div");
  toast.id = "ee-update-toast";
  toast.setAttribute("role", "status");
  toast.style.cssText = [
    "position: fixed", "bottom: 20px", "right: 20px", "z-index: 2147483000",
    "max-width: 320px", "padding: 14px 16px", "border-radius: 10px",
    "background: #171d28", "color: #eef2f7",
    "font: 13px/1.4 -apple-system, 'Segoe UI', Roboto, sans-serif",
    "box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)",
    "border: 1px solid rgba(255, 255, 255, 0.12)",
  ].join(";");

  const title = document.createElement("strong");
  title.style.cssText = "display: block; margin-bottom: 4px; font-size: 13px;";
  title.textContent = (chrome.i18n.getMessage("updateToastTitle") || "Edupage Extras updated to v{version}")
    .replace("{version}", version);

  const body = document.createElement("p");
  body.style.cssText = "margin: 0 0 10px 0; color: #b9c2cf;";
  body.textContent = chrome.i18n.getMessage("updateToastBody") || "See what changed in this version.";

  const actions = document.createElement("div");
  actions.style.cssText = "display: flex; gap: 10px; justify-content: flex-end; align-items: center;";

  const viewLink = document.createElement("a");
  viewLink.href = REPO_RELEASES_URL;
  viewLink.target = "_blank";
  viewLink.rel = "noopener noreferrer";
  viewLink.textContent = chrome.i18n.getMessage("updateToastViewChanges") || "What's new";
  viewLink.style.cssText = "color: #4fc3f7; text-decoration: none; font-weight: 600;";

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.textContent = chrome.i18n.getMessage("updateToastDismiss") || "Dismiss";
  dismissButton.style.cssText = [
    "background: #232d3d", "color: #eef2f7", "border: 1px solid rgba(255, 255, 255, 0.12)",
    "border-radius: 6px", "padding: 4px 10px", "cursor: pointer", "font-size: 12px",
  ].join(";");
  dismissButton.addEventListener("click", () => toast.remove());

  actions.append(viewLink, dismissButton);
  toast.append(title, body, actions);

  // Runs from a storage callback, which can resolve before <body> exists on
  // slow-loading pages (this script runs at document_start) — wait for it
  // instead of throwing.
  if (document.body) {
    document.body.appendChild(toast);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.body.appendChild(toast), { once: true });
  }
}

function checkForUpdateToast() {
  const currentVersion = chrome.runtime.getManifest().version;
  chrome.storage.local.get([LAST_SEEN_VERSION_KEY, UPDATE_REMINDER_ENABLED_KEY], (result) => {
    const lastSeenVersion = result[LAST_SEEN_VERSION_KEY];
    const reminderEnabled = result[UPDATE_REMINDER_ENABLED_KEY] !== false;
    if (lastSeenVersion && lastSeenVersion !== currentVersion && reminderEnabled) {
      showUpdateToast(currentVersion);
    }
    if (lastSeenVersion !== currentVersion) {
      chrome.storage.local.set({ [LAST_SEEN_VERSION_KEY]: currentVersion });
    }
  });
}

// content.js runs in every frame (theming applies everywhere), but the
// update toast/lastSeenVersion bookkeeping must run once per page load —
// otherwise iframe-embedded EduPage views race on eeLastSeenVersion (every
// frame reads the old value, any of them can write the new one first) and
// can either duplicate/clip the toast inside a small iframe or, worse,
// suppress it entirely on the real page (see #46).
if (window.top === window) {
  checkForUpdateToast();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[MOBILE_RESPONSIVE_KEY]) {
    applyMobileResponsive(changes[MOBILE_RESPONSIVE_KEY].newValue === true);
  }
  if (
    !changes[STORAGE_KEY]
    && !changes[THEME_KEY]
    && !changes[CUSTOM_THEME_KEY]
    && !changes[CLEAN_UI_KEY]
    && !changes[HIDE_HELP_TEXT_KEY]
    && !changes[ROZVRH_ROOM_CHANGE_COLOR_KEY]
    && !changes[ROZVRH_SUBSTITUTION_COLOR_KEY]
    && !changes[MOBILE_RESPONSIVE_KEY]
  ) return;

  chrome.storage.local.get(
    [STORAGE_KEY, THEME_KEY, CUSTOM_THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY, ROZVRH_ROOM_CHANGE_COLOR_KEY, ROZVRH_SUBSTITUTION_COLOR_KEY, MOBILE_RESPONSIVE_KEY],
    (result) => {
      const settings = {
        darkModeEnabled: result[STORAGE_KEY] === true,
        theme: normalizeTheme(result[THEME_KEY]),
        customTheme: normalizeCustomTheme(result[CUSTOM_THEME_KEY]),
        cleanEnabled: result[CLEAN_UI_KEY] === true,
        helpHidden: result[HIDE_HELP_TEXT_KEY] === true,
        rozvrhRoomChangeColor: normalizeColor(result[ROZVRH_ROOM_CHANGE_COLOR_KEY], DEFAULT_ROZVRH_ROOM_CHANGE_COLOR),
        rozvrhSubstitutionColor: normalizeColor(result[ROZVRH_SUBSTITUTION_COLOR_KEY], DEFAULT_ROZVRH_SUBSTITUTION_COLOR),
        mobileResponsiveEnabled: result[MOBILE_RESPONSIVE_KEY] === true,
      };
      applyTheme(settings);
      writeThemeCache(settings);
    },
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "ee-set-theme") {
    applyTheme({
      darkModeEnabled: message.darkModeEnabled === true,
      theme: message.theme,
      customTheme: message.customTheme || currentCustomTheme,
      cleanEnabled: message.cleanUiEnabled === true,
      helpHidden: message.hideHelpTextEnabled === true,
      rozvrhRoomChangeColor: message.rozvrhRoomChangeColor || currentRozvrhRoomChangeColor,
      rozvrhSubstitutionColor: message.rozvrhSubstitutionColor || currentRozvrhSubstitutionColor,
    });
    applyMobileResponsive(message.mobileResponsiveEnabled === true);
  }
  if (message && message.type === "ee-preview-update-toast") {
    showUpdateToast(chrome.runtime.getManifest().version);
  }
  return false;
});
