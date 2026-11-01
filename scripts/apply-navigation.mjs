// Writes the one shared SoundBunker header into every public page that uses it.
// Edit the menu here, then run: node scripts/apply-navigation.mjs
// Each page keeps its own booking link, basket and the languages it can actually show.
import { readFile, writeFile, readdir, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const exists = path => access(new URL(path, root)).then(() => true, () => false);
const hasPlugins = await exists('plugins.html');

const services = [
  ['recording.html', 'Recording &amp; engineering'],
  ['production.html', 'Music production'],
  ['mixing-mastering.html', 'Mixing &amp; mastering'],
  ['voiceover.html', 'Voiceover &amp; podcasts'],
  ['photography.html', 'Photography'],
];
const experiences = [
  ['index.html#pricing', 'Prices &amp; studio hire'],
  ['experiences-parties.html', 'Parties &amp; experiences'],
  ['gift-vouchers.html', 'Gift vouchers'],
];
const more = [
  ['record-label.html', 'Record label'],
  ['blog.html', 'Studio journal'],
  ['/redeem', 'Redeem a voucher'],
  ['https://theticketbunker.com', 'The TicketBunker ↗', true],
  ['index.html#contact', 'Contact &amp; directions'],
];
const languageNames = { en: 'English', pt: 'Português', de: 'Deutsch', fr: 'Français' };

const chevron = '<span class="nav-chevron" aria-hidden="true"></span>';
const link = (page, [href, label, external]) => {
  // On the homepage, homepage sections are plain anchors so the page does not reload.
  const target = page === 'index.html' && href.startsWith('index.html#') ? href.slice(10) : href;
  return `<a href="${target}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
};
const group = (name, id, labelKey, label, body) =>
  `<div class="nav-${name} navigation-group"><button class="navigation-group-toggle" type="button" aria-controls="${id}" aria-expanded="false"><span data-nav-label="${labelKey}">${label}</span>${chevron}</button><div class="navigation-panel" id="${id}">${body}</div></div>`;

function header(page, { bookHref, languages, basket }) {
  const l = item => link(page, item);
  const servicesPanel = `<div class="navigation-section">${services.map(l).join('')}</div><div class="navigation-section">${experiences.map(l).join('')}</div>`;
  const languageGroup = languages.length < 2 ? '' :
    `<div class="nav-language navigation-group"><button class="navigation-group-toggle" type="button" aria-controls="language-submenu" aria-expanded="false" aria-label="Language"><span class="nav-language-code">EN</span>${chevron}</button><div class="navigation-panel language-switcher" id="language-submenu" role="group" aria-label="Language">${languages.map((code, i) => `<button class="lang${i ? '' : ' active'}" type="button" data-lang="${code}" aria-pressed="${i ? 'false' : 'true'}"><b>${code.toUpperCase()}</b> ${languageNames[code]}</button>`).join('')}</div></div>`;
  return `<header class="site-header unified-header" id="top">
<a class="brand" href="index.html" aria-label="SoundBunker Algarve home"><img src="soundbunker-logo-white.png" alt="SoundBunker Algarve" width="1100" height="160"></a>
<button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open menu"><span>Menu</span><span class="menu-icon" aria-hidden="true"></span></button>
<nav aria-label="Main navigation" class="site-nav" id="site-nav">
${group('services', 'services-submenu', 'services', 'Services', servicesPanel)}
<a href="hub-academy.html" data-nav-label="academy">Academy</a><a href="/retreats" data-nav-label="retreats">Retreats</a><a href="shop.html" data-nav-label="shop">Shop</a>${hasPlugins ? '<a href="plugins.html" data-nav-label="plugins">Plug-ins</a>' : ''}
${group('more', 'more-submenu', 'more', 'More', more.map(l).join(''))}
${languageGroup}
<div class="nav-mobile-actions"><a class="nav-client" href="client.html" data-nav-label="client">Client area</a></div>
</nav><div class="header-actions">${basket}<a class="header-utility" href="client.html" data-nav-label="client">Client area</a><a class="header-book" href="${bookHref}" data-nav-label="book">Book now</a></div></header>`;
}

const pattern = /<header class="site-header unified-header"[\s\S]*?<\/header>/;
let changed = 0;
for (const page of (await readdir(root)).filter(name => name.endsWith('.html')).sort()) {
  const file = new URL(page, root);
  const html = await readFile(file, 'utf8');
  const current = html.match(pattern)?.[0];
  if (!current) continue;
  const bookHref = current.match(/class="header-book" href="([^"]+)"/)?.[1] || 'index.html#book';
  const basket = current.match(/<a class="nav-shop-basket"[\s\S]*?<\/a>/)?.[0] || '';
  let languages = [...current.matchAll(/data-lang="([a-z]{2})"/g)].map(m => m[1]);
  // Service and legal pages only carry English, Portuguese and French copy.
  if (/src="(service-page|legal)\.js/.test(html)) languages = languages.filter(code => code !== 'de');
  const next = html.replace(pattern, header(page, { bookHref, languages: [...new Set(languages)], basket }));
  if (next !== html) { await writeFile(file, next); changed++; console.log('updated', page, languages.join(',') || '-'); }
}
console.log(`${changed} page(s) updated`);
