// Only public destination, date and event context crosses into the trip builder.
export const PARTY_TYPES = Object.freeze([
  ['families', 'Families', 'family'], ['kids', 'With kids', 'family'],
  ['staghen', 'Stag & hen', ''], ['couples', 'Couples', ''], ['weekend', 'Weekend away', '']
]);
export const partyType = value => PARTY_TYPES.find(([key]) => key === value)?.[0] || '';
const day = value => {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T12:00:00Z') : NaN;
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : '';
};
const stamp = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function tripDates(state = {}, now = Date.now()) {
  if (state.when === 'dates' || state.from || state.to) {
    const from = day(state.range?.from || state.from), to = day(state.range?.to || state.to);
    return {from, to: to && (!from || to >= from) ? to : from};
  }
  if (!['tonight', 'week', 'weekend'].includes(state.when)) return {from: '', to: ''};
  const start = new Date(now), end = new Date(now);
  if (state.when === 'weekend') {
    const weekday=start.getDay();
    if(weekday>0&&weekday<6)start.setDate(start.getDate()+5-weekday);
    end.setTime(start.getTime());end.setDate(end.getDate()+(7-end.getDay())%7);
  } else if (state.when === 'week') end.setDate(end.getDate() + 7);
  return {from: stamp(start), to: stamp(end)};
}
export function eventTripState(state = {}, item = {}) {
  const selected={...state,city:item.city||state.city,country:item.countryCode||state.country};
  if(state.when!=='dates'&&item.startsAt){
    try{
      const bits=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:item.timezone||'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(item.startsAt)).map(p=>[p.type,p.value]));
      const from=`${bits.year}-${bits.month}-${bits.day}`;
      selected.when='dates';selected.range={from,to:from};
    }catch{/* An open-dated product keeps the visitor's existing dates. */}
  }
  return selected;
}
export function tripHref(path = '/plan-your-trip', state = {}, {party = state.party, event = '', step = '', now = Date.now()} = {}) {
  const params = new URLSearchParams(), dates = tripDates(state, now);
  const city = String(state.city || '').trim().slice(0, 80), country = String(state.country || '').toUpperCase();
  if (city) params.set('city', city);
  if (/^[A-Z]{2}$/.test(country)) params.set('country', country);
  if (dates.from) params.set('from', dates.from);
  if (dates.to) params.set('to', dates.to);
  if (partyType(party)) params.set('party', party);
  if (/^(?:feed|tb|partner):[^\s?#<>]{1,180}$/.test(event)) params.set('event', event);
  if (['tickets', 'stay', 'travel', 'food', 'review'].includes(step)) params.set('step', step);
  return path + (params.size ? '?' + params : '');
}
