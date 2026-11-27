// Shared pure destination search for the website and native customer app.
import {CITY_PAGES} from './city-places.js';

export const normalisePlace = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function searchPlaces(query, country = '', limit = 5) {
  const wanted = normalisePlace(query);
  if (!wanted) return [];
  return CITY_PAGES.map((row, order) => {
    const names = [row[0], row[1].replace(/^the /, ''), row[3]].map(normalisePlace);
    const rank = names.some(n => n === wanted) ? 0 : names.some(n => n.startsWith(wanted)) ? 1 : names.some(n => n.includes(wanted)) ? 2 : 3;
    return {row, rank, order};
  }).filter(({row, rank}) => rank < 3 && (!country || row[2] === country))
    .sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, Math.max(0, limit)).map(({row}) => row);
}
