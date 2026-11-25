import {CITY_PAGES} from './city-places.js';
import {tripOptions} from './trip-partners.js?v=20261126-packages';
import {directoryProviders, tripDestination, tripDates} from './travel-directory.js?v=20261126-packages';
import {escapeHtml as esc} from './shared.js';
import {OFFER_KINDS, pickOffers, offerCards, loadOffers} from './travel-offers.js?v=20261125gg';

export function guideProviders(kind, country, city, trip = {}) {
  const options = tripOptions(country, city, {page: kind + '-guide', spot: 'directory', trip});
  const chosen = kind === 'all' || kind === 'groups' ? options : options.filter(o =>
    o.kind === kind || (kind === 'travel' && ['flight', 'car'].includes(o.kind)));
  return [
    ...(kind === 'groups' ? [{kind: 'groups', label: 'Group specialists', partners: directoryProviders('groups', country, city, trip)}] : []),
    ...chosen
  ].flatMap(o => o.partners.map(p => ({...p, category: p.serviceLabel || o.label})));
}

export function providerCards(items) {
  return items.map(p => `<article class="guide-card"><span class="label">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description || 'Check current options and complete your booking with the named provider.')}</p><a href="${esc(p.url)}" target="_blank" rel="${p.commercial === 'affiliate' ? 'sponsored ' : ''}noopener noreferrer">${esc(p.name)}</a></article>`).join('');
}

// "Fri 11 Dec → Sun 13 Dec · 2 nights · 4 adults · 2 rooms" for the hotel and car searches.
const day = v => new Date(v + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
export function tripSummary(kind, trip) {
  const t = tripDates(trip);
  if (!t.from || !t.to) return '';
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  if (kind === 'car') return [day(t.from) + (t.pickup ? ' ' + t.pickup : '') + ' → ' + day(t.to) + (t.dropoff ? ' ' + t.dropoff : ''), plural(t.nights, 'day')].join(' · ');
  return [day(t.from) + ' → ' + day(t.to), plural(t.nights, 'night'), t.adults && plural(t.adults, 'adult'), t.adults && plural(t.rooms, 'room')].filter(Boolean).join(' · ');
}
// The next Friday-to-Sunday weekend, as a sensible starting point for the date boxes.
export function nextWeekend(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((5 - now.getUTCDay() + 7) % 7 || 7)));
  const iso = x => x.toISOString().slice(0, 10);
  return {from: iso(d), to: iso(new Date(d.getTime() + 2 * 864e5))};
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
    // Hotel and car pages carry dates (and guests/times); other guides have no such boxes.
    const tripFields = ['from','to','adults','rooms','pickup','dropoff'].filter(k => form.elements[k]);
    const today = new Date().toISOString().slice(0,10), weekend = nextWeekend();
    for (const k of tripFields) {
      const el = form.elements[k], v = q.get(k);
      if (el.type === 'date') { el.min = today; el.value = /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v >= today ? v : weekend[k]; }
      else if (v) el.value = v;
    }
    const tripValues = () => Object.fromEntries(tripFields.map(k => [k, form.elements[k].value]));
    if (form.elements.from) form.elements.from.addEventListener('change', () => {
      const from = form.elements.from, to = form.elements.to;
      to.min = from.value || today;
      if (from.value && (!to.value || to.value <= from.value)) to.value = new Date(Date.parse(from.value) + 2 * 864e5).toISOString().slice(0,10);
    });
    const render = () => {
      const d = tripDestination(country.value, city.value), trip = tripValues();
      const results = document.querySelector('[data-guide-results]');
      results.innerHTML = providerCards(guideProviders(kind, d.country, d.city, trip));
      showOffers(results, d.city);
      const summary = tripSummary(kind, trip), when = document.querySelector('[data-trip-summary]');
      if (when) { when.hidden = !summary; when.innerHTML = summary ? `<b>${esc(d.city)}</b><span>${esc(summary)}</span>` : ''; }
      document.querySelector('[data-guide-status]').textContent = d.search
        ? (summary ? 'Each button opens the provider’s live prices with your search filled in. You choose and pay on their site.'
          : `Planning ${d.search}. ${kind === 'transfer' ? 'Check the exact vehicle, pickup, date and passenger capacity. Availability varies by city.' : 'Check your destination and dates on each provider’s site.'}`)
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
    // Real bookable options from the live feed, above the provider search buttons.
    let offerCity = '';
    async function showOffers(results, cityName) {
      if (!(OFFER_KINDS[kind] || []).length) return;
      let box = document.querySelector('[data-guide-offers]');
      if (!box) { box = document.createElement('section'); box.className = 'guide-offers'; box.dataset.guideOffers = ''; results.before(box); results.classList.add('guide-more'); }
      if (offerCity === cityName) return;
      offerCity = cityName;
      box.innerHTML = `<div class="guide-offers-head"><span class="label">Bookable now</span><h2>Explore ${esc(cityName)}</h2></div><div class="offer-grid"><p class="offer-loading">Finding live options…</p></div>`;
      const items = pickOffers(await loadOffers(cityName), kind, 9);
      if (offerCity !== cityName) return;
      box.querySelector('.offer-grid').innerHTML = items.length ? offerCards(items)
        : `<p class="offer-empty">No live ${kind === 'transfer' ? 'transfers or chauffeur options' : 'options'} listed for ${esc(cityName)} right now. Search the providers below for your dates.</p>`;
      const more = document.querySelector('.guide-more-head') || Object.assign(document.createElement('h2'), {className: 'guide-more-head'});
      more.textContent = items.length ? 'Search more providers' : 'Search providers'; if (!more.isConnected) results.before(more);
    }
    form.addEventListener('change', e => { if (tripFields.includes(e.target.name)) render(); });
    form.onsubmit = e => {
      e.preventDefault();
      const d = tripDestination(country.value, city.value);
      const to = form.elements.to;
      if (to && form.elements.from.value && to.value && to.value <= form.elements.from.value) {
        to.setCustomValidity('Choose a date after the first one.'); to.reportValidity(); to.setCustomValidity(''); return;
      }
      history.replaceState(null,'',location.pathname+'?'+new URLSearchParams({city:d.city,country:d.country,...tripValues()}));
      render();
      document.querySelector('[data-guide-status]').focus({preventScroll:true});
    };
    render();
  }
}
