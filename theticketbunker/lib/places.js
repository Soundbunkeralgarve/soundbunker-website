import {CITY_PAGES, CITY_COORDS} from './site.js';
import {cityRow} from './listings.js';
import {searchPlaces, normalisePlace} from '../../ticketbunker-site/place-search.js';

const withPoint = row => ({...cityRow(row), at: CITY_COORDS[row[0]]});
export const countryPlaces = country => CITY_PAGES.filter(row => !country || row[2] === country).map(withPoint);
export const matchingPlaces = (query, country) => searchPlaces(query, country, 5).map(withPoint);

// Ambiguous keyboard searches keep their choices visible instead of selecting an arbitrary city.
export function submittedPlace(query, country) {
  const matches = matchingPlaces(query, country);
  if (matches.length === 1) return matches[0];
  const wanted = normalisePlace(query);
  return matches.find(city => [city.slug, city.name.replace(/^the /, ''), city.query].some(value => normalisePlace(value) === wanted)) || null;
}

export function mapDestination(slug, country) {
  return countryPlaces(country).find(city => city.slug === slug) || null;
}
