const preferred = localStorage.getItem("sb-language") || "en";
function showLanguage(language) {
  const lang = ["en", "pt", "fr"].includes(language) ? language : "en";
  document.documentElement.lang = lang;
  localStorage.setItem("sb-language", lang);
  document.querySelectorAll("[data-legal-lang]").forEach(section => { section.hidden = section.dataset.legalLang !== lang; });
  document.querySelectorAll(".lang").forEach(button => { const active = button.dataset.lang === lang; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
}
document.querySelectorAll(".lang").forEach(button => button.addEventListener("click", () => showLanguage(button.dataset.lang)));
showLanguage(preferred);
