import {approvedPartnerListings, partnerCategories} from './partner-listings-model.js';

const root = document.querySelector('[data-partner-listings]');
const countryNames = new Intl.DisplayNames(['en'], {type: 'region'});
const countryName = code => countryNames.of(code) || code;
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function card(listing) {
  const article = element('article', 'partner-card');
  article.append(element('p', 'partner-card-category', listing.categoryName));
  article.append(element('h3', '', listing.title));
  article.append(element('p', 'partner-card-place', `${listing.city} · ${countryName(listing.countryCode)}`));
  article.append(element('p', 'partner-card-description', listing.description));
  article.append(element('p', 'partner-card-supplier', `Sold by ${listing.providerName}`));
  const link = element('a', 'btn btn-black', `Book with ${listing.providerName}`);
  link.href = listing.bookingUrl;
  link.target = '_blank';
  link.rel = 'sponsored noopener noreferrer';
  link.setAttribute('aria-label', `${listing.title}: book with ${listing.providerName} (opens in a new tab)`);
  article.append(link);
  return article;
}

function option(select, value, label) {
  const node = element('option', '', label);
  node.value = value;
  select.append(node);
}

async function loadPartnerListings() {
  if (!root) return;
  try {
    const response = await fetch('/partner-listings-config.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
    if (!response.ok) return;
    const config = await response.json();
    const listings = approvedPartnerListings(config);
    if (!listings.length) return;
    const category = root.querySelector('[data-partner-category]');
    const country = root.querySelector('[data-partner-country]');
    const grid = root.querySelector('[data-partner-grid]');
    const status = root.querySelector('[data-partner-status]');
    for (const code of [...new Set(listings.map(l => l.countryCode))].sort((a, b) => countryName(a).localeCompare(countryName(b)))) {
      option(country, code, countryName(code));
    }
    for (const [key, label] of Object.entries(partnerCategories)) {
      if (listings.some(l => l.category === key)) option(category, key, label);
    }
    const render = () => {
      // Reapply expiry checks on every render, including a page left open overnight.
      const selected = approvedPartnerListings(config, {country: country.value, category: category.value});
      grid.replaceChildren(...selected.map(card));
      status.textContent = selected.length ? `${selected.length} partner listing${selected.length === 1 ? '' : 's'}` : 'No partner listings match these choices. Try another destination or activity.';
    };
    country.addEventListener('change', render);
    category.addEventListener('change', render);
    render();
    root.hidden = false;
  } catch {
    // Partner content is optional. Native event discovery remains available.
    root.hidden = true;
  }
}

loadPartnerListings();
