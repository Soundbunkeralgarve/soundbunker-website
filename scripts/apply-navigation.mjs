// Writes the shared SoundBunker header into the public pages that use it.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const languageNames = { en: 'English', pt: 'Português', de: 'Deutsch', fr: 'Français' };
const chevron = '<span class="nav-chevron" aria-hidden="true"></span>';

function header(page, { languages, basket }) {
  const orderHref = page === 'mixing-mastering.html' ? '#book' : '/mixing-mastering.html#book';
  const contactHref = page === 'index.html' ? '#contact' : '/#contact';
  const languageGroup = languages.length < 2 ? '' :
    `<div class="nav-language navigation-group"><button class="navigation-group-toggle" type="button" aria-controls="language-submenu" aria-expanded="false" aria-label="Language"><span class="nav-language-code">EN</span>${chevron}</button><div class="navigation-panel language-switcher" id="language-submenu" role="group" aria-label="Language">${languages.map((code, i) => `<button class="lang${i ? '' : ' active'}" type="button" data-lang="${code}" aria-pressed="${i ? 'false' : 'true'}"><b>${code.toUpperCase()}</b> ${languageNames[code]}</button>`).join('')}</div></div>`;
  return `<header class="site-header unified-header" id="top">
<a class="brand" href="/" aria-label="SoundBunker Algarve home"><img src="soundbunker-logo-white.png" alt="SoundBunker Algarve" width="1100" height="160"></a>
<button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open menu"><span>Menu</span><span class="menu-icon" aria-hidden="true"></span></button>
<nav aria-label="Main navigation" class="site-nav" id="site-nav">
<a href="/mixing-mastering.html" data-nav-label="mixing">Online mixing &amp; mastering</a>
<a href="${contactHref}" data-nav-label="contact">Contact</a>
${languageGroup}
<div class="nav-mobile-actions"><a class="nav-client" href="/client" data-nav-label="client">Client area</a></div>
</nav><div class="header-actions">${basket}<a class="header-utility" href="/client" data-nav-label="client">Client area</a><a class="header-book" href="${orderHref}" data-nav-label="book">Order online</a></div></header>`;
}

const pattern = /<header class="site-header unified-header"[\s\S]*?<\/header>/;
let changed = 0;
for (const page of (await readdir(root)).filter(name => name.endsWith('.html')).sort()) {
  const file = new URL(page, root);
  const html = await readFile(file, 'utf8');
  const current = html.match(pattern)?.[0];
  if (!current) continue;
  const basket = current.match(/<a class="nav-shop-basket"[\s\S]*?<\/a>/)?.[0] || '';
  let languages = [...current.matchAll(/data-lang="([a-z]{2})"/g)].map(m => m[1]);
  if (/src="(service-page|legal)\.js/.test(html)) languages = languages.filter(code => code !== 'de');
  const next = html.replace(pattern, header(page, { languages: [...new Set(languages)], basket }));
  if (next !== html) {
    await writeFile(file, next);
    changed++;
  }
}
console.log(`${changed} page(s) updated`);
