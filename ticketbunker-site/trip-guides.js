import {CITY_PAGES} from './city-places.js';
import {tripOptions} from './trip-partners.js?v=20261123-travel';
import {directoryProviders, tripDestination} from './travel-directory.js?v=20261123-limos';
import {escapeHtml as esc} from './shared.js';

export function guideProviders(kind, country, city) {
  const options = tripOptions(country, city, {page: kind + '-guide', spot: 'directory'});
  const chosen = kind === 'all' || kind === 'groups' ? options : options.filter(o =>
    o.kind === kind || (kind === 'travel' && ['car'].includes(o.kind)));
  return [
    ...(kind === 'groups' ? [{kind: 'groups', label: 'Group specialists', partners: directoryProviders('groups', country, city)}] : []),
    ...chosen
  ].flatMap(o => o.partners.map(p => ({...p, category: p.serviceLabel || o.label})));
}

export function providerCards(items) {
  return items.map(p => `<article class="guide-card"><span class="label">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description || 'Check current options and complete your booking with the named provider.')}</p><a href="${esc(p.url)}" target="_blank" rel="${p.commercial === 'affiliate' ? 'sponsored ' : ''}noopener noreferrer">${esc(p.name)}</a></article>`).join('');
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('[data-guide-search]');
  if (form) {
    const page = document.querySelector('[data-guide-kind]'), kind = page.dataset.guideKind;
    const city = form.elements.city, country = form.elements.country;
    const names = new Intl.DisplayNames(['en'], {type: 'region'});
    const codes = [...new Set(CITY_PAGES.map(p => p[2]))].sort((a,b) => names.of(a).localeCompare(names.of(b)));
    country.replaceChildren(new Option('Use the city’s country', ''), ...codes.map(c => new Option(names.of(c), c)));
    const list = document.querySelector('#guide-cities');
    list.replaceChildren(...[...new Set(CITY_PAGES.map(p=>p[1].replace(/^the /,'')))].map(c=>new Option(c,c)));
    const q = new URLSearchParams(location.search);
    city.value = String(q.get('city') || 'London').slice(0,80);
    country.value = codes.includes(q.get('country')) ? q.get('country') : '';
    const render = () => {
      const d = tripDestination(country.value, city.value);
      document.querySelector('[data-guide-results]').innerHTML = providerCards(guideProviders(kind, d.country, d.city));
      document.querySelector('[data-guide-status]').textContent = d.search
        ? `Planning ${d.search}. ${kind === 'transfer' ? 'Check the exact vehicle, pickup, date and passenger capacity. Availability varies by city.' : 'Check your destination and dates on each provider’s site.'}`
        : 'Choose your destination on the provider’s site.';
      const event = document.querySelector('[data-guide-events]');
      const found = CITY_PAGES.find(([slug,label,cc,query]) => cc === d.country &&
        [slug,label.replace(/^the /,''),query].some(s=>s.toLowerCase()===d.city.toLowerCase()));
      event.href = found ? '/' + found[0] : '/?' + new URLSearchParams({city:d.city,country:d.country});
      event.textContent = d.city ? 'Events & activities in ' + d.city : 'Browse events & activities';
      for (const transport of document.querySelectorAll('[data-transport-guide]')) {
        transport.href = '/vip-transfers?' + new URLSearchParams({city:d.city,country:d.country});
      }
    };
    form.onsubmit = e => {
      e.preventDefault();
      const d = tripDestination(country.value, city.value);
      history.replaceState(null,'',location.pathname+'?'+new URLSearchParams({city:d.city,country:d.country}));
      render();
      document.querySelector('[data-guide-status]').focus({preventScroll:true});
    };
    render();
  }
}
