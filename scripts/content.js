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
// No GitHub Releases are published for this repo (just tags), so that page
// is always empty — link to the commit history instead, which actually has
// real per-version descriptions in the commit messages.
const REPO_RELEASES_URL = "https://github.com/Alexosavrua/Edupage-Extras/commits/main";
const MOBILE_RESPONSIVE_KEY = "eeMobileResponsiveEnabled";
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
const LIGHT_TONED_THEMES = ["pink"];
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
const DEFAULT_CUSTOM_THEME = {
  bgBase: "#11111b",
  bgRaised: "#181825",
  bgElevated: "#1e1e2e",
  bgMuted: "#2a2b3d",
  border: "#313244",
  textMain: "#cdd6f4",
  textMuted: "#a6adc8",
  accent: "#89b4fa",
  warning: "#fab387",
  danger: "#f38ba8",
};

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
       Only "dark" has real designed values below. The other theme classes
       intentionally alias to the same values for now — recoloring them
       properly is the next step once this base is confirmed good, not a
       bug. */
    html.ee-dark.ee-scheme-dark {
      color-scheme: dark !important;
    }

    html.ee-dark:not(.ee-scheme-dark) {
      color-scheme: light !important;
    }

    html.ee-dark {
      --ee-page-bg: #11161f;
      --ee-card-bg: #171d28;
      --ee-card-bg-bright: #1d2532;
      --ee-card-hover: #232d3d;
      --ee-header-bg: #255b87;
      --ee-brand-dark: #11263d;
      --ee-sidebar-bg: #171d28;
      --ee-sidebar-hover: #1b2738;
      --ee-border: rgba(255, 255, 255, 0.08);
      --ee-text: #eef2f7;
      --ee-text-muted: #8c96a6;
      --ee-link: #4fc3f7;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
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
      --ee-text-muted: #7fa8ac;
      --ee-link: #4dd0e1;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
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
      --ee-text-muted: #93a78c;
      --ee-link: #81c784;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
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
      --ee-text-muted: #7fb89e;
      --ee-link: #4adfa3;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
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
      --ee-text-muted: #a79bc7;
      --ee-link: #b39ddb;
      --ee-warning: #ffb74d;
      --ee-danger: #ef5350;
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
      --ee-text-muted: var(--ee-custom-text-muted, #8c96a6);
      --ee-link: var(--ee-custom-accent, #4fc3f7);
      --ee-warning: var(--ee-custom-warning, #ffb74d);
      --ee-danger: var(--ee-custom-danger, #ef5350);
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
    html.ee-dark .userTopDiv,
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
    html.ee-dark .rozvrhItem,
    html.ee-dark .rozvrhItemAlign,
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
    html.ee-dark .edubarProfilebox .display,
    html.ee-dark .edubarProfilebox .display span,
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
    html.ee-dark .timetable-cell {
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

    /* Sidebar: barely off the page background, the same small step stock
       takes (its sidebar is #f6f7f9 against a white page). */
    html.ee-dark .edubarSidebar,
    html.ee-dark .edubarSidemenu2 {
      background-color: var(--ee-sidebar-bg) !important;
      color: var(--ee-text) !important;
      border-color: var(--ee-border) !important;
    }

    /* The one specific dark-navy block EduPage hardcodes in stock — the
       homepage timetable strip and the active sidebar item share this
       exact same color natively, so they share one token here too. */
    html.ee-dark .userRozvrh,
    html.ee-dark .userRozvrh ul.rozvrh,
    html.ee-dark .userTopDiv ul.rozvrh,
    html.ee-dark .edubarMenuitem.active > a {
      background-color: var(--ee-brand-dark) !important;
      background-image: none !important;
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
    html.ee-dark table.znamkyTable thead th,
    html.ee-dark a {
      color: var(--ee-link) !important;
    }

    html.ee-dark .calendar .day.today,
    html.ee-dark .rozvrhItem.selected {
      background-color: color-mix(in srgb, var(--ee-link) 25%, var(--ee-card-bg)) !important;
      border: 1px solid var(--ee-link) !important;
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

    html.ee-clean-ui .userRozvrh {
      width: min(100%, 1180px) !important;
    }

    html.ee-hide-help-text .userTopLogo,
    html.ee-hide-help-text a.userTopLogo.learnMoreBtn {
      display: none !important;
    }
  `;
}

// Debug-only, off by default — structural layout fixes only (wrapping,
// scrolling, scaling), nothing content-dependent, so it doesn't need exam-day
// page states to verify against. Scoped under a max-width media query so it
// has zero effect on desktop regardless of the toggle.
function buildMobileResponsiveCSS() {
  return `
    @media (max-width: 768px) {
      html.ee-mobile-responsive body {
        overflow-x: hidden !important;
      }

      html.ee-mobile-responsive .userTopDivInner,
      html.ee-mobile-responsive .wmaxL1,
      html.ee-mobile-responsive .userRozvrh {
        flex-wrap: wrap !important;
        width: auto !important;
        max-width: 100% !important;
      }

      html.ee-mobile-responsive .edubarSidebar,
      html.ee-mobile-responsive .edubarSidemenu2 {
        width: auto !important;
        min-width: 0 !important;
      }

      html.ee-mobile-responsive table.znamkyTable,
      html.ee-mobile-responsive .timetable,
      html.ee-mobile-responsive .gotoDay {
        display: block !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        max-width: 100% !important;
      }

      html.ee-mobile-responsive .userButton,
      html.ee-mobile-responsive .userHomeOther {
        font-size: 13px !important;
      }

      html.ee-mobile-responsive img,
      html.ee-mobile-responsive .user-button-icon {
        max-width: 100% !important;
        height: auto !important;
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

function applyMobileResponsive(enabled) {
  ensureMobileResponsiveStylesheet();
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
  if (root) pendingNormalizeRoots.add(root);
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
  pendingNormalizeRoots.clear();
}

function clearNormalizedClasses() {
  document.querySelectorAll(`[${NORMALIZED_ATTR}]`).forEach(resetElementClasses);
}

function normalizeTheme(theme) {
  return ["dark", "ocean", "forest", "emerald", "pink", "purple", "custom", "light"].includes(theme) ? theme : "dark";
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
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function normalizeCustomTheme(theme) {
  return Object.fromEntries(
    Object.entries(DEFAULT_CUSTOM_THEME).map(([key, fallback]) => [
      key,
      normalizeColor(theme?.[key], fallback),
    ]),
  );
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

function applyDarkMode(enabled) {
  applyTheme({
    darkModeEnabled: enabled,
    theme: currentTheme,
    customTheme: currentCustomTheme,
    cleanEnabled: cleanUiEnabled,
    helpHidden: hideHelpTextEnabled,
  });
}

function initDarkMode() {
  if (!hasBootstrappedDarkMode) {
    hasBootstrappedDarkMode = true;
    applyTheme({ darkModeEnabled: false, theme: "dark", cleanEnabled: false, helpHidden: false });
  }

  chrome.storage.local.get(
    [STORAGE_KEY, THEME_KEY, CUSTOM_THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY, ROZVRH_ROOM_CHANGE_COLOR_KEY, ROZVRH_SUBSTITUTION_COLOR_KEY, MOBILE_RESPONSIVE_KEY],
    (result) => {
      applyMobileResponsive(result[MOBILE_RESPONSIVE_KEY] === true);
      const enabled = result[STORAGE_KEY] === true;
      const theme = normalizeTheme(result[THEME_KEY]);
      const customTheme = normalizeCustomTheme(result[CUSTOM_THEME_KEY]);
      const cleanEnabled = result[CLEAN_UI_KEY] === true;
      const helpHidden = result[HIDE_HELP_TEXT_KEY] === true;
      const rozvrhRoomChangeColor = normalizeColor(result[ROZVRH_ROOM_CHANGE_COLOR_KEY], DEFAULT_ROZVRH_ROOM_CHANGE_COLOR);
      const rozvrhSubstitutionColor = normalizeColor(result[ROZVRH_SUBSTITUTION_COLOR_KEY], DEFAULT_ROZVRH_SUBSTITUTION_COLOR);
      applyTheme({ darkModeEnabled: enabled, theme, customTheme, cleanEnabled, helpHidden, rozvrhRoomChangeColor, rozvrhSubstitutionColor });
    },
  );
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
  document.body.appendChild(toast);
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

checkForUpdateToast();

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
  ) return;

  chrome.storage.local.get(
    [STORAGE_KEY, THEME_KEY, CUSTOM_THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY, ROZVRH_ROOM_CHANGE_COLOR_KEY, ROZVRH_SUBSTITUTION_COLOR_KEY],
    (result) => {
      applyTheme({
        darkModeEnabled: result[STORAGE_KEY] === true,
        theme: normalizeTheme(result[THEME_KEY]),
        customTheme: normalizeCustomTheme(result[CUSTOM_THEME_KEY]),
        cleanEnabled: result[CLEAN_UI_KEY] === true,
        helpHidden: result[HIDE_HELP_TEXT_KEY] === true,
        rozvrhRoomChangeColor: normalizeColor(result[ROZVRH_ROOM_CHANGE_COLOR_KEY], DEFAULT_ROZVRH_ROOM_CHANGE_COLOR),
        rozvrhSubstitutionColor: normalizeColor(result[ROZVRH_SUBSTITUTION_COLOR_KEY], DEFAULT_ROZVRH_SUBSTITUTION_COLOR),
      });
    },
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "ee-set-dark-mode") {
    applyDarkMode(Boolean(message.enabled));
  }
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
