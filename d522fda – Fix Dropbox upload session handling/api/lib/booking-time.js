import { TIME_ZONE } from './catalog.js';

// Booking slots are entered as wall time in Portugal. This also handles the
// mainland daylight-saving change without assuming a fixed UTC offset.
export function bookingInstant(day, time) {
  const target = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Invalid booking time');
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(instant));
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    instant += target - shown;
  }
  return new Date(instant).toISOString();
}

export function endInstant(start, hours) {
  return new Date(Date.parse(start) + Number(hours) * 3600000).toISOString();
}

export function moreThan24HoursAway(start) {
  return Date.parse(start) - Date.now() > 24 * 3600000;
}
