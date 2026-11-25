// "Make a night of it": partner tickets, travel, stays and food each book on the partner's
// own site, so instead of one basket we walk the visitor through them in order and keep
// the plan in "My trip" (this browser only). Steps without an approved partner say
// "Coming soon". Public search links are identified separately from approved tracking links.
import {tripHref,eventTripState} from './home-trip-context.js?v=20261123-trip-flow';
import {tripOptions, withClickRef} from './trip-partners.js?v=20261126-packages';
import {gygPlace, GYG_PLACES} from './gyg-box.js?v=20261121c';
import {directionLinks, travelEstimates, estimateText} from './get-there.js?v=20261122d';

const KEY = 'tb-my-trip', MAX = 12;
const GYG_PARTNER = 'KNICMG4';

export function tourLink(city, country) {
  if (!city) return '';
  const key = gygPlace({city, country});
  // Places without a known GetYourGuide location ID use its search, still tagged with our partner ID.
  return key ? `https://www.getyourguide.com/${key}-l${GYG_PLACES[key]}/?partner_id=${GYG_PARTNER}&cmp=night-planner`
    : `https://www.getyourguide.com/s/?q=${encodeURIComponent(city)}&partner_id=${GYG_PARTNER}&cmp=night-planner`;
}

// The ordered steps for one event: tickets first, then getting there, a bed, food, extras.
export function plannerSteps(item) {
  const city = item.city || '', country = item.countryCode || '';
  const page = (typeof window !== 'undefined' && window.__TB_CITY?.slug) || 'home';
  const options = Object.fromEntries(tripOptions(country, city, {page, spot: 'planner'}).map(o => [o.kind, o]));
  const partnerStep = (kind, label, blurb) => ({kind, label, blurb, links: options[kind]?.partners || []});
  const tours = tourLink(city, country);
  return [
    {kind: 'tickets', label: 'Tickets', blurb: item.external ? `Book with ${item.seller}.` : 'No booking fee with TicketBunker.', links: [{name: item.external ? item.seller : 'TicketBunker', url: item.external ? withClickRef(item.url, page, 'planner') : item.url}]},
    {kind: 'route', label: 'Get to the venue', blurb: item.venue ? `Directions to ${item.venue} from where you are.` : 'Directions from where you are.', links: directionLinks(item)},
    partnerStep('travel', city ? `Travel to ${city}` : 'Travel there', 'Compare train and coach routes for your journey.'),
    partnerStep('car', 'Car hire', 'Check pickup times, deposits, cover and fuel policy.'),
    partnerStep('stay', 'Find a hotel', item.venue ? `Search hotels in ${city}; check the distance to ${item.venue}.` : 'Search hotels and check the distance to your venue.'),
    partnerStep('transfer', 'Chauffeur & transfers', 'Check coverage, pickup details and the total quote.'),
    partnerStep('eat', 'Eat nearby', 'Check participating restaurants, current offers and booking terms.'),
    {kind: 'tours', label: 'Things to do', blurb: 'Tours and day trips while you are there.', links: tours ? [{name: 'GetYourGuide', url: tours}] : []}
  ];
}

// My trip: a short list of saved nights, soonest first, past ones dropped.
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: the plan still works for this visit */ } };
export function tidyTrip(list, now = Date.now()) {
  return list.filter(n => n && n.id && (!n.startsAt || Date.parse(n.startsAt) > now - 864e5))
    .sort((a, b) => (Date.parse(a.startsAt) || Infinity) - (Date.parse(b.startsAt) || Infinity)).slice(0, MAX);
}
// Blended listings carry a `key` (feed:…, partner:…); raw items may only have an id.
export const nightId = item => item.key || item.id || item.url;
export function saveNight(list, item, now = Date.now()) {
  const id = nightId(item), keep = list.find(n => n.id === id);
  const night = {id, title: item.title, startsAt: item.startsAt || '', timezone: item.timezone || '', city: item.city || '',
    countryCode: item.countryCode || '', category: item.category || '', venue: item.venue || '', seller: item.seller || '', url: item.url, external: Boolean(item.external),
    address: item.address || '', ...(Number.isFinite(item.lat) && Number.isFinite(item.lng) ? {lat: item.lat, lng: item.lng} : {}),
    done: {tickets: false, ...(keep?.done || {})}, userMarked: {...(keep?.userMarked || {})}};
  return tidyTrip([night, ...list.filter(n => n.id !== id)], now);
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const when = n => { if (!n.startsAt) return ''; try { return new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: n.timezone || undefined}).format(new Date(n.startsAt)); } catch { return ''; } };

let dialog, openId = '', installPrompt = null;
// Installing the site as an app: Chrome and Android offer a prompt we can trigger; iPhone
// needs Share → Add to Home Screen. Hidden once it is already running as the app.
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const iPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function showInstall() {
  if (!dialog) return;
  const box = dialog.querySelector('.np-install'), btn = box.querySelector('.np-install-btn');
  btn.hidden = !installPrompt;
  box.querySelector('.np-ios').hidden = !(iPhone() && !installPrompt);
  box.hidden = standalone() || (!installPrompt && !iPhone());
}
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; showInstall(); });
  addEventListener('appinstalled', () => { installPrompt = null; showInstall(); });
}
function nightHtml(n) {
  const steps = plannerSteps(n);
  return `<article class="np-night" data-night="${esc(n.id)}"><header><p class="np-when">${esc([when(n), n.venue, n.city].filter(Boolean).join(' · '))}</p><h3>${esc(n.title)}</h3></header><ol class="np-steps">${steps.map((s, i) => {
    const done = Boolean(n.userMarked?.[s.kind]), live = s.links.length > 0;
    const times = s.kind === 'route' && Number.isFinite(n.lat) && Number.isFinite(n.lng) && navigator.geolocation
      ? `<button type="button" class="np-times" data-times>How far is it from here?</button><span class="np-eta" aria-live="polite"></span>` : '';
    return `<li class="np-step${done ? ' is-done' : ''}${live ? '' : ' is-soon'}" data-kind="${s.kind}"><span class="np-num" aria-hidden="true">${done ? '✓' : i + 1}</span><div class="np-body"><b>${esc(s.label)}</b><span>${esc(s.blurb)}</span>${times}</div><div class="np-act">${live
      ? s.links.map(l => `<a class="np-link" href="${esc(l.url)}" target="_blank" rel="${l.commercial === 'affiliate' || ['tickets','tours'].includes(s.kind) ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}" data-step="${s.kind}" data-mode="${esc(l.kind || '')}">${esc(s.kind === 'tickets' && done ? 'Reopen ' + l.name : l.name)}<small class="np-mins"></small> ↗</a>`).join('') + (done ? '<small class="np-user-marked">Marked by you</small>' : `<button type="button" class="np-tick" data-tick="${s.kind}">${s.kind === 'route' ? 'Mark planned' : 'I booked this'}</button>`)
      : '<em>Coming soon</em>'}</div></li>`;
  }).join('')}</ol><p><a class="plan-link" href="${esc(tripHref('/plan-your-trip',eventTripState({},n),{event:n.id,party:typeof location!=='undefined'?new URLSearchParams(location.search).get('party'):''}))}">Build this trip →</a></p><button type="button" class="np-remove" data-remove="${esc(n.id)}">Remove from My trip</button></article>`;
}
function render() {
  const list = tidyTrip(read());
  const shown = openId ? list.filter(n => n.id === openId) : list;
  dialog.querySelector('.np-title').textContent = openId ? 'Make a night of it.' : 'My trip.';
  dialog.querySelector('.np-lead').textContent = openId ? 'A saved event is a plan. Book each part with its provider, then mark your own progress.' : 'Every night you are planning, step by step. Saved on this device.';
  dialog.querySelector('.np-list').innerHTML = shown.length ? shown.map(nightHtml).join('') : '<p class="np-empty">Nothing planned yet. Pick an event and we’ll line up the rest.</p>';
  dialog.querySelector('.np-all').hidden = !openId || list.length < 2;
  dialog.querySelector('.np-all').textContent = 'See all of My trip (' + list.length + ')';
  const btn = document.getElementById('my-trip-btn');
  if (btn) { btn.hidden = !list.length; btn.querySelector('b').textContent = String(list.length); }
}
export function markNightDone(list, id, kind) {
  return list.map(n => n.id === id ? {...n, done: {...n.done, [kind]: true}, userMarked: {...n.userMarked, [kind]: true}} : n);
}
function mark(id, kind) {
  write(markNightDone(read(), id, kind));
  render();
}
function ensure() {
  if (dialog) return;
  dialog = document.createElement('dialog');
  dialog.className = 'night-planner'; dialog.id = 'night-planner'; dialog.setAttribute('aria-labelledby', 'np-title');
  dialog.innerHTML = '<div class="np-head"><div><span class="label">Plan your night</span><h2 class="np-title" id="np-title">Make a night of it.</h2><p class="np-lead"></p></div><button type="button" class="np-close" aria-label="Close">×</button></div><div class="np-list"></div><button type="button" class="np-all btn-quiet" hidden></button><div class="np-install" hidden><span>Keep My trip on your home screen, with directions one tap away.</span><button type="button" class="np-install-btn">Add the app</button><small class="np-ios" hidden>On iPhone: tap Share, then \u201cAdd to Home Screen\u201d.</small></div><p class="np-note">External bookings are made on the named provider’s site under its prices, fees and terms. TicketBunker events never add a booking fee.</p>';
  document.body.append(dialog);
  dialog.querySelector('.np-install-btn').onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; showInstall(); };
  showInstall();
  dialog.addEventListener('click', e => {
    if (e.target === dialog || e.target.closest('.np-close')) return dialog.close();
    const night = e.target.closest('[data-night]')?.dataset.night;
    const tick = e.target.closest('[data-tick]');
    if (tick && night) mark(night, tick.dataset.tick);
    const remove = e.target.closest('[data-remove]');
    if (remove) { write(read().filter(n => n.id !== remove.dataset.remove)); if (openId === remove.dataset.remove) openId = ''; render(); }
    if (e.target.closest('.np-all')) { openId = ''; render(); }
    const ask = e.target.closest('[data-times]');
    if (ask && night) {
      // The visitor's position stays on the phone; it is only used for this sum.
      const n = read().find(x => x.id === night), out = ask.nextElementSibling;
      ask.disabled = true; out.textContent = 'Finding you\u2026';
      navigator.geolocation.getCurrentPosition(p => {
        const est = travelEstimates([p.coords.latitude, p.coords.longitude], [n.lat, n.lng]), li = ask.closest('li');
        ask.hidden = true; out.textContent = estimateText(est) + '. Pick the one that suits you:';
        // Each option shows its own time so people can compare before tapping.
        const put = (mode, text) => { const m = li.querySelector(`[data-mode="${mode}"] .np-mins`); if (m) m.textContent = ' \u00b7 ' + text; };
        if (est.walkMin <= 75) put('walk', '~' + est.walkMin + ' min'); else li.querySelector('[data-mode="walk"]')?.classList.add('is-far');
        put('taxi', '~' + est.carMin + ' min');
        put('transit', 'live times'); put('citymapper', 'live times');
      },
        () => { ask.disabled = false; out.textContent = 'Location is off, so the map apps below will work it out instead.'; }, {timeout: 12000, maximumAge: 3e5});
    }
  });
}

// Public event handoff for the page builder. Saving is never a booking confirmation.
export function saveNightToMyTrip(item) {
  const list=saveNight(read(),item);write(list);return list.find(n=>n.id===nightId(item));
}
// Explicit planner action: save the event and show the visitor's next steps.
export function openPlanner(item) {
  ensure();
  saveNightToMyTrip(item);
  openId = nightId(item);
  render();
  if (!dialog.open) dialog.showModal();
}
export function openMyTrip() { ensure(); openId = ''; render(); if (!dialog.open) dialog.showModal(); }
export function mountMyTrip() {
  if (document.getElementById('my-trip-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'my-trip-btn'; btn.className = 'my-trip-btn';
  btn.innerHTML = 'My trip <b>0</b>';
  btn.onclick = openMyTrip;
  document.body.append(btn);
  ensure(); render();
}
