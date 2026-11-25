import {tripDestination} from './travel-directory.js';
import {cityMatches} from './discovery-model.js';
import {CITY_PAGES} from './city-places.js';

export const TRIP_BUILDER_KEY = 'tb-trip-builder-v1';
export const BUILDER_STEPS = Object.freeze([
  ['tickets', 'Tickets & activities'], ['stay', 'Hotel'], ['travel', 'Travel & transport'],
  ['food', 'Food & offers'], ['review', 'Your plan']
]);
export const TRIP_PARTIES = Object.freeze([
  ['families', 'Family trip'], ['kids', 'With the kids'], ['staghen', 'Stag & hen'],
  ['couples', 'Couples'], ['weekend', 'Long weekend']
]);
const steps = new Set(BUILDER_STEPS.map(([id]) => id));
const parties = new Set(TRIP_PARTIES.map(([id]) => id));
const clean = (value, max = 80) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const date = value => {
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T12:00:00Z') : NaN;
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value ? value : '';
};
const count = (value, fallback, min, max) => Number.isInteger(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
const unique = values => [...new Set((Array.isArray(values) ? values : []).map(v => clean(v, 160)).filter(Boolean))].slice(0, 12);
export const destinationKey = (country, city) => [String(country || '').toUpperCase(), clean(city).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()].join('|');

export function normaliseDraft(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const d = tripDestination(raw.country, raw.city || 'London');
  const from = date(raw.from), to = date(raw.to);
  const selected = Object.fromEntries(BUILDER_STEPS.filter(([id]) => id !== 'review').map(([id]) => [id, unique(raw.selected?.[id])]));
  const progress = Object.fromEntries(Object.keys(selected).map(id => [id,
    ['planned', 'confirmed', 'skipped'].includes(raw.progress?.[id]) ? raw.progress[id] : 'unplanned']));
  return {version: 1, country: d.country, city: d.city, from, to: to && (!from || to >= from) ? to : '',
    party: parties.has(raw.party) ? raw.party : 'weekend', adults: count(raw.adults, 2, 1, 30), children: count(raw.children, 0, 0, 20),
    step: steps.has(raw.step) ? raw.step : 'tickets', selected, progress, updatedAt: Number(raw.updatedAt) || 0};
}

export function cleanStore(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const drafts = {};
  for (const draft of Object.values(raw.drafts || {}).slice(0, 30)) {
    if (!draft || typeof draft !== 'object' || !draft.city) continue;
    const normal = normaliseDraft(draft);
    drafts[destinationKey(normal.country, normal.city)] = normal;
  }
  const kept = Object.fromEntries(Object.entries(drafts).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 8));
  return {version: 1, active: Object.hasOwn(kept, raw.active) ? raw.active : '', drafts: kept};
}

export function openDraft(store = {}, search = '') {
  const saved = cleanStore(store), q = new URLSearchParams(search);
  const active = saved.drafts[saved.active];
  const d = tripDestination(q.has('country') ? q.get('country') : q.has('city') ? '' : active?.country,
    q.has('city') ? q.get('city') : active?.city || 'London');
  const old = saved.drafts[destinationKey(d.country, d.city)];
  const base = normaliseDraft({...old, ...d}), patch = {};
  for (const key of ['from', 'to', 'party', 'adults', 'children', 'step']) if (q.has(key)) patch[key] = q.get(key);
  return updateDetails(base, patch);
}

export function persistDraft(store, draft, now = Date.now()) {
  const saved = cleanStore(store), next = normaliseDraft({...draft, updatedAt: now});
  const key = destinationKey(next.country, next.city);
  return cleanStore({active: key, drafts: {...saved.drafts, [key]: next}});
}

export function switchDestination(store, draft, country, city) {
  const d = tripDestination(country, city);
  const saved = cleanStore(store), existing = saved.drafts[destinationKey(d.country, d.city)];
  return normaliseDraft(existing || {...d, from: draft.from, to: draft.to, party: draft.party, adults: draft.adults, children: draft.children});
}

export function applyTripDetails(store, draft, values = {}) {
  const country = String(values.country || '').toUpperCase(), city = clean(values.city);
  const found = CITY_PAGES.find(c => c[2] === country && [c[0],c[1].replace(/^the /,''),c[3]].some(n=>n.toLowerCase()===city.toLowerCase()));
  if (!found) return {error:'Choose one of the cities in the list.', field:'city'};
  for (const key of ['from','to']) if (values[key] && !date(values[key])) return {error:'Choose a valid date.',field:key};
  if (values.from && values.to && values.to < values.from) return {error:'Choose an end date on or after the start date.',field:'to'};
  for (const [key,min,max] of [['adults',1,30],['children',0,20]]) {
    if (values[key] !== undefined && values[key] !== '' && (!Number.isInteger(Number(values[key])) || Number(values[key])<min || Number(values[key])>max)) return {error:`Choose a number from ${min} to ${max}.`,field:key};
  }
  const saved = persistDraft(store,draft), next = switchDestination(saved,draft,country,found[1].replace(/^the /,''));
  const patch = Object.fromEntries(['from','to','adults','children','party'].filter(k=>Object.hasOwn(values,k)).map(k=>[k,values[k]]));
  return {draft:updateDetails(next,patch)};
}

export function updateDetails(draft, patch) {
  const next = normaliseDraft({...draft, ...patch});
  const changed = ['from', 'to', 'party', 'adults', 'children'].some(k => next[k] !== draft[k]);
  if (changed) for (const id of Object.keys(next.progress)) if (next.progress[id] === 'confirmed') next.progress[id] = 'planned';
  return next;
}

export function chooseOption(draft, step, id, checked = true) {
  const next = normaliseDraft(draft);
  if (!Object.hasOwn(next.selected, step)) return next;
  next.selected[step] = unique(checked ? [...next.selected[step], id] : next.selected[step].filter(value => value !== id));
  next.progress[step] = next.selected[step].length ? 'planned' : 'unplanned';
  return next;
}

// Opening a provider saves a planning choice and moves the local workflow along.
// It never supplies the visitor confirmation required by stepProgress.
export function openPlannedOption(draft, step, id) {
  const base = normaliseDraft(draft), option = clean(id, 160);
  if (!Object.hasOwn(base.selected, step) || !option) return base;
  const alreadyConfirmed = base.progress[step] === 'confirmed' && base.selected[step].includes(option);
  const next = chooseOption(base, step, option);
  if (alreadyConfirmed) next.progress[step] = 'confirmed';
  const index = BUILDER_STEPS.findIndex(([name]) => name === step);
  next.step = BUILDER_STEPS[index + 1][0];
  return next;
}

export function reconcileSelections(draft, allowed = {}) {
  const next = normaliseDraft(draft);
  for (const step of Object.keys(next.selected)) {
    const valid = new Set(allowed[step] || []), before = next.selected[step];
    next.selected[step] = before.filter(id => valid.has(id));
    if (next.selected[step].length !== before.length) next.progress[step] = next.selected[step].length ? 'planned' : 'unplanned';
  }
  return next;
}

export function stepProgress(draft, step, state, {visitorConfirmed = false} = {}) {
  const next = normaliseDraft(draft);
  if (!Object.hasOwn(next.progress, step)) return next;
  if (state === 'confirmed' && !visitorConfirmed) return next;
  if (state === 'skipped') next.selected[step] = [];
  next.progress[step] = ['planned', 'confirmed', 'skipped'].includes(state) ? state : 'unplanned';
  return next;
}

export function publicBookingUrl(value) {
  if (typeof value !== 'string') return '';
  if (/^\/(event\/|listing\/)[^\s]*$/.test(value)) return value;
  try {
    const u = new URL(value);
    const hosts = ['theticketbunker.com', 'www.theticketbunker.com', 'www.viator.com', 'viator.com', 'www.skiddle.com', 'skiddle.com',
      'www.awin1.com', 'awin1.com', 'www.theatreticketsdirect.co.uk', 'www.entradas.com', 'entradas.com', 'www.getyourguide.com'];
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname) ? u.href : '';
  } catch { return ''; }
}

export function matchingNights(raw, draft, now = Date.now()) {
  return (Array.isArray(raw) ? raw : []).filter(n => n && clean(n.id, 160) && clean(n.title, 140) && publicBookingUrl(n.url) &&
    (!n.startsAt || Date.parse(n.startsAt) > now - 864e5) &&
    (!draft.country || String(n.countryCode || '').toUpperCase() === draft.country) && cityMatches(n.city, draft.city))
    .slice(0, 12).map(n => ({id: clean(n.id, 160), title: clean(n.title, 140), category:clean(n.category,30), city: clean(n.city), countryCode: clean(n.countryCode, 2).toUpperCase(),
      startsAt: typeof n.startsAt === 'string' ? n.startsAt : '', timezone: clean(n.timezone), seller: clean(n.seller, 60), url: publicBookingUrl(n.url), external: n.external === true}));
}

export const savedListingStep = category => ['transit','transfer'].includes(category) ? 'travel' : category === 'dining' ? 'food' : 'tickets';

export function transportBrowseHref(draft, category = 'transit') {
  const d=normaliseDraft(draft), q=new URLSearchParams({city:d.city,country:d.country,cat:category==='transfer'?'transfer':'transit',party:d.party});
  if(d.from)q.set('from',d.from);
  if(d.to)q.set('to',d.to);
  // Transport products are open-dated; the provider checks the selected dates.
  return '/?'+q;
}

export function ticketBrowseHref(draft) {
  const state = normaliseDraft(draft), q = new URLSearchParams({city: state.city, country: state.country, party:state.party});
  if (['families', 'kids'].includes(state.party)) q.set('cat', 'family');
  if (state.from) {q.set('when', 'dates'); q.set('from', state.from); if (state.to) q.set('to', state.to);}
  return '/?' + q;
}

export function flightSearchHref(draft) {
  const d = normaliseDraft(draft), q = new URLSearchParams({city:d.city, country:d.country,
    adults:d.adults, children:d.children, party:d.party});
  if (d.from) q.set('depart', d.from);
  if (d.to) q.set('back', d.to);
  return '/travel?' + q + '#flights';
}

export function draftQuery(draft) {
  const d = normaliseDraft(draft);
  return new URLSearchParams(Object.fromEntries(['city', 'country', 'from', 'to', 'party', 'adults', 'children', 'step'].map(k => [k, d[k]]).filter(([, v]) => v !== ''))).toString();
}
