"use strict";

const policies = [...document.querySelectorAll("main > article[lang]")];
const preferredLanguages = navigator.languages.map((locale) => locale.toLowerCase().split("-")[0]);
const preferredPolicy = preferredLanguages
    .map((language) => policies.find((policy) => policy.lang === language))
    .find(Boolean) || policies[0];

preferredPolicy.parentElement.prepend(preferredPolicy);
document.documentElement.lang = preferredPolicy.lang;
document.title = preferredPolicy.querySelector("h1").textContent;

const preferredLink = document.querySelector(`a[hreflang="${preferredPolicy.lang}"]`);
preferredLink.parentElement.prepend(preferredLink);
