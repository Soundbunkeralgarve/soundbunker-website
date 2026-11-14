// Writes the shared SoundBunker header into the public pages that use it.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const languageNames = { en: 'English', pt: 'Português', de: 'Deutsch', fr: 'Français' };
const chevron = '<span class="nav-chevron" aria-hidden="true"></span>';
const services = [
  ['/mixing-mastering.html', 'mixing', 'Online mixing &amp; mastering'],
  ['/production.html#tuition', 'tuition', 'One-to-one online tuition'],
  ['/production.html#production', 'production', 'Music production'],
  ['/production.html#remixes', 'remixes', 'Remixes'],
];
const more = [
  ['/record-label.html', 'label', 'Record label'],
  ['/blog.html', 'journal', 'Studio journal'],
  ['/redeem', 'redeem', 'Redeem a voucher'],
  ['#contact', 'contact', 'Contact'],
];

function header(page, { languages, basket }) {
  const mixingPage = page === 'mixing-mastering.html';
  const homePage = page === 'index.html';
  const orderHref = page === 'production.html' ? '#booking' : mixingPage || homePage || page === 'photography.html' ? '#book' : '/#book';
  const orderLabel = mixingPage || page === 'production.html' ? 'order' : page === 'photography.html' ? 'bookPhoto' : 'online';
  const orderText = { order: 'Order online', bookPhoto: 'Book a photoshoot', online: 'Online services' }[orderLabel];
  const menuLink = ([href, label, text]) => {
    const target = !homePage && href.startsWith('#') ? `/${href}` : href;
    return `<a href="${target}" data-nav-label="${label}">${text}</a>`;
  };
  const languageGroup = languages.length < 2 ? '' :
    `<div class="nav-language navigation-group"><button class="navigation-group-toggle" type="button" aria-controls="language-submenu" aria-expanded="false" aria-label="Language"><span class="nav-language-code">EN</span>${chevron}</button><div class="navigation-panel language-switcher" id="language-submenu" role="group" aria-label="Language">${languages.map((code, i) => `<button class="lang${i ? '' : ' active'}" type="button" data-lang="${code}" aria-pressed="${i ? 'false' : 'true'}"><b>${code.toUpperCase()}</b> ${languageNames[code]}</button>`).join('')}</div></div>`;
  return `<header class="site-header unified-header" id="top">
<a class="brand" href="/" aria-label="SoundBunker Algarve home"><img src="soundbunker-logo-white.png" alt="SoundBunker Algarve" width="1100" height="160"></a>
<button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open menu"><span>Menu</span><span class="menu-icon" aria-hidden="true"></span></button>
<nav aria-label="Main navigation" class="site-nav" id="site-nav">
<div class="nav-services navigation-group"><button class="navigation-group-toggle" type="button" aria-controls="services-submenu" aria-expanded="false"><span data-nav-label="services">Services</span>${chevron}</button><div class="navigation-panel" id="services-submenu"><div class="navigation-section">${services.map(menuLink).join('')}</div><div class="navigation-section">${menuLink(['/photography.html', 'photography', 'Photography'])}${menuLink(['#relocation', 'relocation', 'Studio relocation'])}</div></div></div>
${menuLink(['/retreats', 'retreats', 'Retreats'])}${menuLink(['/shop.html', 'shop', 'Shop'])}${menuLink(['/plugins', 'plugins', 'Plug-ins'])}<a href="https://theticketbunker.com" target="_blank" rel="noopener" class="nav-external">TicketBunker <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens The TicketBunker in a new tab)</span></a>
<div class="nav-more navigation-group"><button class="navigation-group-toggle" type="button" aria-controls="more-submenu" aria-expanded="false"><span data-nav-label="more">More</span>${chevron}</button><div class="navigation-panel" id="more-submenu">${more.map(menuLink).join('')}</div></div>
${languageGroup}
<div class="nav-mobile-actions"><a class="nav-client" href="/client" data-nav-label="client">Client area</a></div>
</nav><div class="header-actions">${basket}<a class="header-utility" href="/client" data-nav-label="client">Client area</a><a class="header-book" href="${orderHref}" data-nav-label="${orderLabel}">${orderText}</a></div></header>`;
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
  const next = html.replace(pattern, header(page, { languages: [...new Set(languages)], basket }))
    .replace(/site-navigation\.js\?v=[^"]+/, 'site-navigation.js?v=20261114-remote')
    .replace(/ask-studio\.js\?v=[^"]+/, 'ask-studio.js?v=20261114-remote');
  if (next !== html) {
    await writeFile(file, next);
    changed++;
  }
}
console.log(`${changed} page(s) updated`);
