const toggle = document.getElementById("DarkModeCheckbox");
const settingsButton = document.getElementById("SettingsButton");
const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";

// Default to true if not set
chrome.storage.local.get(STORAGE_KEY, (result) => {
	const enabled = result[STORAGE_KEY] !== false; // If undefined, it's true
	toggle.checked = enabled;
});

toggle.addEventListener("change", () => {
	const enabled = toggle.checked;
	chrome.storage.local.set({ [STORAGE_KEY]: enabled });

	chrome.storage.local.get([THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY], (result) => {
		chrome.tabs.query({ url: "*://*.edupage.org/*" }, (tabs) => {
			tabs.forEach(tab => {
				if (tab.id) {
					chrome.tabs.sendMessage(tab.id, {
						type: "ee-set-theme",
						darkModeEnabled: enabled,
						theme: result[THEME_KEY] || "dark",
						cleanUiEnabled: result[CLEAN_UI_KEY] !== false,
						hideHelpTextEnabled: result[HIDE_HELP_TEXT_KEY] !== false,
					});
				}
			});
		});
	});
});

settingsButton.addEventListener("click", () => {
	chrome.runtime.openOptionsPage();
});
