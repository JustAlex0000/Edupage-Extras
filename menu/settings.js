const toggle = document.getElementById("DarkModeCheckbox");
const themeSelect = document.getElementById("ThemeSelect");
const cleanUiToggle = document.getElementById("CleanUiCheckbox");
const hideHelpTextToggle = document.getElementById("HideHelpTextCheckbox");
const gradeBadgesToggle = document.getElementById("GradeBadgesCheckbox");
const absenceColumnsToggle = document.getElementById("AbsenceColumnsCheckbox");
const experimentalSettingsButton = document.getElementById("ExperimentalSettingsButton");
const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";
const GRADE_BADGES_KEY = "gradeBadgesEnabled";
const ABSENCE_COLUMNS_KEY = "absenceColumnsEnabled";

function notifyEdupageTabs() {
	const darkModeEnabled = toggle.checked;
	const theme = themeSelect.value;
	const cleanUiEnabled = cleanUiToggle.checked;
	const hideHelpTextEnabled = hideHelpTextToggle.checked;

	chrome.tabs.query({ url: "*://*.edupage.org/*" }, (tabs) => {
		tabs.forEach((tab) => {
			if (tab.id) {
				chrome.tabs.sendMessage(tab.id, {
					type: "ee-set-theme",
					darkModeEnabled,
					theme,
					cleanUiEnabled,
					hideHelpTextEnabled,
				});
			}
		});
	});
}

chrome.storage.local.get([STORAGE_KEY, THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY], (result) => {
	const enabled = result[STORAGE_KEY] !== false;
	const theme = ["dark", "ocean", "forest", "light"].includes(result[THEME_KEY]) ? result[THEME_KEY] : "dark";
	toggle.checked = enabled;
	themeSelect.value = theme;
	cleanUiToggle.checked = result[CLEAN_UI_KEY] !== false;
	hideHelpTextToggle.checked = result[HIDE_HELP_TEXT_KEY] !== false;
});

chrome.storage.local.get([GRADE_BADGES_KEY, ABSENCE_COLUMNS_KEY], (result) => {
	gradeBadgesToggle.checked = result[GRADE_BADGES_KEY] !== false;
	absenceColumnsToggle.checked = result[ABSENCE_COLUMNS_KEY] === true;
});

toggle.addEventListener("change", () => {
	const enabled = toggle.checked;
	chrome.storage.local.set({ [STORAGE_KEY]: enabled });
	notifyEdupageTabs();
});

themeSelect.addEventListener("change", () => {
	chrome.storage.local.set({ [THEME_KEY]: themeSelect.value });
	notifyEdupageTabs();
});

cleanUiToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [CLEAN_UI_KEY]: cleanUiToggle.checked });
	notifyEdupageTabs();
});

hideHelpTextToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [HIDE_HELP_TEXT_KEY]: hideHelpTextToggle.checked });
	notifyEdupageTabs();
});

gradeBadgesToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [GRADE_BADGES_KEY]: gradeBadgesToggle.checked });
});

absenceColumnsToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [ABSENCE_COLUMNS_KEY]: absenceColumnsToggle.checked });
});

experimentalSettingsButton.addEventListener("click", () => {
	window.location.href = "experimental.html";
});
