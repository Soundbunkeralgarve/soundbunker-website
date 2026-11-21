// GetYourGuide activity widget: bookable tours and activities for the place being browsed.
// GetYourGuide only offers affiliates an embedded widget (no data feed), so it sits in
// its own clearly labelled box rather than in our rails. Partner ID KNICMG4.
const PARTNER = 'KNICMG4';
const SCRIPT = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
// GetYourGuide location IDs (looked up in the partner portal, 21 Nov 2026).
export const GYG_PLACES = Object.freeze({
  algarve: 66, lisbon: 42, porto: 151, madeira: 67, barcelona: 45, madrid: 46, seville: 48,
  malaga: 402, ibiza: 276, paris: 16, amsterdam: 36, rome: 33, dublin: 31, london: 57, edinburgh: 44,
  berlin: 17, munich: 26, prague: 10, vienna: 7, budapest: 29, krakow: 40, athens: 91, venice: 35, florence: 32,
  milan: 139, naples: 162, nice: 314, brussels: 8, bruges: 854, copenhagen: 12, stockholm: 50, valencia: 49,
  mallorca: 47, tenerife: 350, split: 268
});
// Local spellings people type, mapped to the keys above.
const ALIASES = Object.freeze({
  lisboa: 'lisbon', sevilla: 'seville', munchen: 'munich', praha: 'prague', wien: 'vienna', krakow: 'krakow', athina: 'athens',
  venezia: 'venice', firenze: 'florence', milano: 'milan', napoli: 'naples', roma: 'rome', bruxelles: 'brussels', brussel: 'brussels',
  brugge: 'bruges', kobenhavn: 'copenhagen', majorca: 'mallorca', palma: 'mallorca', funchal: 'madeira'
});
const COUNTRY_DEFAULT = Object.freeze({PT: 'algarve', ES: 'barcelona', FR: 'paris', NL: 'amsterdam', IT: 'rome', IE: 'dublin', GB: 'london',
  DE: 'berlin', AT: 'vienna', CZ: 'prague', HU: 'budapest', PL: 'krakow', GR: 'athens', BE: 'brussels', DK: 'copenhagen', SE: 'stockholm', HR: 'split'});
const ALGARVE = ['albufeira', 'alvor', 'armacao de pera', 'carvoeiro', 'faro', 'ferragudo', 'lagoa', 'lagos', 'loule', 'monte gordo', 'olhao', 'portimao', 'quarteira', 'sagres', 'silves', 'tavira', 'vilamoura', 'almancil'];
const norm = v => String(v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const label = key => key.charAt(0).toUpperCase() + key.slice(1);

// Which GetYourGuide place fits the visitor's choice; '' hides the box. No choice → Algarve.
export function gygPlace({city = '', country = ''} = {}) {
  const want = norm(city);
  if (want) {
    if (ALGARVE.includes(want)) return 'algarve';
    const alias = Object.keys(ALIASES).find(a => want.includes(a));
    if (alias) return ALIASES[alias];
    return Object.keys(GYG_PLACES).find(k => want.includes(k)) || '';
  }
  if (country) return COUNTRY_DEFAULT[country] || '';
  return 'algarve';
}

let shown = '';
export function renderGygBox(box, state) {
  const key = gygPlace(state);
  box.hidden = !key;
  if (!key || key === shown) return;
  shown = key;
  box.querySelector('#gyg-heading').textContent = 'Tours & experiences in ' + label(key) + '.';
  const slot = box.querySelector('[data-gyg-slot]');
  slot.innerHTML = `<div data-gyg-href="https://widget.getyourguide.com/default/activities.frame" data-gyg-location-id="${GYG_PLACES[key]}" data-gyg-locale-code="en-GB" data-gyg-widget="activities" data-gyg-number-of-items="${matchMedia('(max-width: 650px)').matches ? 4 : 8}" data-gyg-partner-id="${PARTNER}"><span>Powered by <a target="_blank" rel="sponsored noopener" href="https://www.getyourguide.com/">GetYourGuide</a></span></div>`;
  // The GetYourGuide script turns widget placeholders into frames when it loads, so it is
  // (re)loaded after each place change.
  document.querySelector('script[data-gyg-loader]')?.remove();
  const s = document.createElement('script');
  s.src = SCRIPT + '?t=' + Date.now(); s.async = true; s.dataset.gygPartnerId = PARTNER; s.dataset.gygLoader = '';
  document.body.append(s);
}
