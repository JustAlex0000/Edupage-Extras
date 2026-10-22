(() => {
  "use strict";
  const select = document.getElementById("ee-language-select");
  const status = document.getElementById("ee-language-status");
  function sync() { select.value = EE.i18n.preference; }
  EE.i18n.ready.then(() => { sync(); select.disabled = false; });
  EE.i18n.subscribe(sync);
  select.addEventListener("change", async () => {
    select.disabled = true; status.hidden = true;
    try { await EE.i18n.setPreference(select.value); }
    catch (_) {
      sync(); status.textContent = EE.getMessage("languageSaveError"); status.hidden = false;
    } finally { select.disabled = false; }
  });
})();
