// Trip.com is an approved affiliate (Allianceid/SID are public tracking fields, not secrets).
// Trip.com ignores a typed city name in a link, so each TicketBunker city carries Trip.com's
// own hotel city ID. Every ID below was checked on 25 Nov 2026: the city search on trip.com
// (destination name and country confirmed) and/or trip.com's public city page for that ID.
// Islands and regions use the main town Trip.com lists (third value is the name shown).
// [hotel city ID, destination airport/city code for Flight + Hotel ('' = no airport), label]
import {CITY_PAGES} from './city-places.js';

export const TRIPCOM = Object.freeze({Allianceid: '11489066', SID: '336945869'});
export const TRIPCOM_CITIES = Object.freeze({
  london: [338, 'LON'], manchester: [722, 'MAN'], liverpool: [3187, 'LPL'], glasgow: [780, 'GLA'], edinburgh: [706, 'EDI'],
  birmingham: [1270, 'BHX'], brighton: [679573, ''], bristol: [838, 'BRS'], leeds: [1733, 'LBA'], newcastle: [1289, 'NCL'],
  sheffield: [3191, ''], nottingham: [1199, ''], cardiff: [1475, 'CWL'], belfast: [777, 'BFS'], dublin: [803, 'DUB'],
  algarve: [3725, 'FAO', 'Albufeira'], lisbon: [1231, 'LIS'], porto: [826, 'OPO'], madeira: [3298, 'FNC', 'Funchal'],
  barcelona: [40795, 'BCN'], madrid: [357, 'MAD'], seville: [1350, 'SVQ'], malaga: [1268, 'AGP'], ibiza: [1768, 'IBZ'],
  tenerife: [62299, 'TCI', 'Costa Adeje'], mallorca: [1267, 'PMI', 'Palma'], paris: [192, 'PAR'], amsterdam: [176, 'AMS'],
  berlin: [193, 'BER'], rome: [343, 'ROM'], prague: [1288, 'PRG'], vienna: [651, 'VIE'], budapest: [637, 'BUD'],
  preston: [10141, ''], chester: [3185, ''], southampton: [3857, 'SOU'], portsmouth: [7741, ''], leicester: [3552, ''],
  derby: [10284, ''], coventry: [3544, ''], wolverhampton: [9239, ''], solihull: [35132, ''], "stoke-on-trent": [35175, ''],
  "milton-keynes": [4063, ''], northampton: [10030, ''], peterborough: [3560, ''], cambridge: [1194, ''],
  oxford: [721, ''], reading: [10290, ''], norwich: [1464, ''], colchester: [9497, ''], chelmsford: [34976, ''],
  southend: [34102, ''], canterbury: [34559, ''], maidstone: [3556, ''], "tunbridge-wells": [34459, ''],
  guildford: [34497, ''], worthing: [35271, ''], bournemouth: [3194, 'BOH'], salisbury: [35131, ''], bath: [1190, ''],
  exeter: [6721, 'EXT'], plymouth: [3561, ''], cheltenham: [3195, ''], worcester: [10262, ''], lincoln: [20395, ''],
  york: [3566, ''], hull: [34431, ''], bradford: [4845, ''], doncaster: [9553, ''], middlesbrough: [7801, ''],
  sunderland: [19736, ''], carlisle: [9450, ''], kendal: [9788, ''], blackpool: [3226, ''], bolton: [3543, ''],
  wigan: [9230, ''], warrington: [9217, ''], stockport: [9093, ''], aberdeen: [1195, 'ABZ'], dundee: [1198, ''],
  stirling: [3196, ''], inverness: [1730, 'INV'], swansea: [5979, ''], newport: [35674, ''], derry: [3551, 'LDY'],
  cork: [832, 'ORK'], galway: [3094, ''], limerick: [3089, ''], albufeira: [3725, 'FAO'], coimbra: [3731, ''],
  braga: [3728, ''], valencia: [1351, 'VLC'], bilbao: [772, 'BIO'], granada: [717, 'GRX'], alicante: [1293, 'ALC'],
  benidorm: [3477, 'ALC'], marbella: [3169, 'AGP'], "gran-canaria": [3174, 'LPA', 'Las Palmas'], lanzarote: [1766, 'ACE'],
  "san-sebastian": [3481, 'EAS'], nice: [775, 'NCE'], lyon: [713, 'LYS'], marseille: [712, 'MRS'], bordeaux: [776, 'BOD'],
  toulouse: [1361, 'TLS'], milan: [361, 'MIL'], florence: [687, 'FLR'], venice: [688, 'VCE'], naples: [1262, 'NAP'],
  bologna: [1240, 'BLQ'], turin: [32159, 'TRN'], munich: [363, 'MUC'], hamburg: [763, 'HAM'], cologne: [709, 'CGN'],
  frankfurt: [250, 'FRA'], rotterdam: [718, 'RTM'], utrecht: [719, ''], brussels: [196, 'BRU'], antwerp: [1767, ''],
  bruges: [3128, ''], ghent: [3423, ''], salzburg: [739, 'SZG'], zurich: [434, 'ZRH'], geneva: [666, 'GVA'],
  copenhagen: [260, 'CPH'], stockholm: [420, 'STO'], oslo: [827, 'OSL'], helsinki: [277, 'HEL'], tallinn: [1737, 'TLL'],
  riga: [4079, 'RIX'], vilnius: [786, 'VNO'], krakow: [1343, 'KRK'], warsaw: [293, 'WAW'], gdansk: [1461, 'GDN'],
  bratislava: [4008, 'BTS'], ljubljana: [1266, 'LJU'], zagreb: [1418, 'ZAG'], split: [3264, 'SPU'], dubrovnik: [3901, 'DBV'],
  bucharest: [674, 'BUH'], sofia: [792, 'SOF'], athens: [710, 'ATH'], thessaloniki: [3584, 'SKG'], mykonos: [42294, 'JMK'],
  santorini: [3576, 'JTR'], crete: [6890, 'HER', 'Heraklion'], corfu: [5046, 'CFU', 'Corfu Town'], rhodes: [3570, 'RHO'],
  malta: [1214, 'MLA', 'Valletta'], "ayia-napa": [3452, 'LCA'], paphos: [3291, 'PFO'], limassol: [3454, 'LCA'],
});

const normal = v => String(v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/^the /, '').trim();
// The TicketBunker city a visitor chose (slug, name or feed query), with its Trip.com IDs.
export function tripcomCity(country = '', city = '') {
  const want = normal(city), cc = /^[A-Za-z]{2}$/.test(String(country)) ? String(country).toUpperCase() : '';
  if (!want) return null;
  const page = CITY_PAGES.find(([slug, label, code, query]) => (!cc || code === cc) && [slug, label, query].some(v => normal(v) === want));
  const row = page && TRIPCOM_CITIES[page[0]];
  if (!row) return null;
  return {slug: page[0], name: row[2] || page[1].replace(/^the /, ''), hotelCity: row[0], airport: row[1], country: page[2]};
}

const track = url => { for (const [k, v] of Object.entries(TRIPCOM)) url.searchParams.set(k, v); return url.href; };
const isoDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) ? String(v) : '';
const count = (v, lo, hi, fallback) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback; };
function stay(trip = {}) {
  let from = isoDay(trip.from), to = isoDay(trip.to);
  if (from && to && to <= from) to = '';
  const adults = count(trip.adults, 1, 30, 2);
  return {from, to, adults, rooms: Math.min(count(trip.rooms, 1, 8, 1), adults)};
}

// Hotel list for the city, with dates and guests when we have them (verified link format).
// A place with no Trip.com match opens Trip.com hotels, where the visitor types the town.
export function tripcomHotelsUrl(match, trip = {}) {
  if (!match) return track(new URL('https://www.trip.com/hotels/'));
  const t = stay(trip), url = new URL('https://www.trip.com/hotels/list');
  url.searchParams.set('city', String(match.hotelCity));
  if (t.from && t.to) { url.searchParams.set('checkIn', t.from); url.searchParams.set('checkOut', t.to); }
  url.searchParams.set('adult', String(t.adults));
  url.searchParams.set('crn', String(t.rooms));
  return track(url);
}

// Flight + Hotel results need a departure airport and both dates; without them the visitor
// lands on Trip.com's package search to fill those in. The departure can be changed there.
export function tripcomPackageUrl(match, trip = {}, origin = 'LON') {
  if (!match?.airport) return '';
  const t = stay(trip), from = /^[A-Z]{3}$/.test(origin) ? origin : 'LON';
  if (!t.from || !t.to || from === match.airport) return track(new URL('https://www.trip.com/packages/'));
  const url = new URL('https://www.trip.com/packages/list');
  for (const [k, v] of Object.entries({adult: Math.min(t.adults, 9), child: 0, infants: 0, dCityCode: from, aCityCode: match.airport,
    tripWay: 'round-trip', classType: 'ys', dDate: t.from, rDate: t.to, hCity: match.hotelCity, iDate: t.from, oDate: t.to, room: t.rooms}))
    url.searchParams.set(k, String(v));
  return track(url);
}

// Trip.com options for a city's stay step, in the shape the travel directory uses.
export function tripcomStayProviders(country = '', city = '', trip = {}) {
  const match = tripcomCity(country, city), t = stay(trip), ready = t.from && t.to;
  const where = match ? match.name : 'your destination';
  const out = [{id: 'tripcom-hotels', name: 'Hotels on Trip.com', url: tripcomHotelsUrl(match, trip), commercial: 'affiliate',
    description: match
      ? (ready ? `Opens Trip.com on ${where} hotels with your dates and guests: see live prices, then book there.` : `Opens Trip.com on ${where} hotels: choose your dates and guests there.`)
      : 'Opens Trip.com hotels: enter your destination, dates and guests there.'}];
  if (match?.airport) out.push({id: 'tripcom-packages', name: 'Flight + Hotel on Trip.com', url: tripcomPackageUrl(match, trip), commercial: 'affiliate', serviceLabel: 'Flight + Hotel package',
    description: ready && match.airport !== 'LON' ? `Flights from London plus a ${where} hotel for your dates in one booking. Change the departure airport on Trip.com.`
      : `Bundle flights and a ${where} hotel in one booking. Choose your airport and dates on Trip.com.`});
  return out;
}
