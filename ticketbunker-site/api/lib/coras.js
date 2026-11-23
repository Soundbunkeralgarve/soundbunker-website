// Catalogue-only sandbox client. No public feed, reservations or payment methods.
const SANDBOX_ORIGIN = 'https://sandbox.coras.io/v2';

export class CorasError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'CorasError';
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

export function corasReadiness(env = process.env) {
  const environment = String(env.CORAS_ENVIRONMENT || '').trim().toLowerCase();
  const distributorId = String(env.CORAS_DISTRIBUTOR_ID || '').trim();
  let code = 'disabled';
  if (environment === 'production') code = 'production_locked';
  else if (environment && environment !== 'sandbox') code = 'invalid_environment';
  else if (environment === 'sandbox') {
    code = /^[a-zA-Z0-9-]{1,100}$/.test(distributorId)
      ? 'sandbox_ready' : 'missing_or_invalid_distributor';
  }
  return Object.freeze({
    provider: 'coras',
    environment: environment === 'sandbox' || environment === 'production' ? environment : 'disabled',
    code,
    catalogueReady: code === 'sandbox_ready',
    publicEnabled: false,
    bookingEnabled: false
  });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function minorUnits(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function plainText(value) {
  return text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeCorasCity(city) {
  if (!city || !text(city.name) || !text(city.search_key)) return null;
  return {
    id: String(city.id ?? city.search_key), name: text(city.name),
    searchKey: text(city.search_key), countryCode: text(city.country_code).toUpperCase()
  };
}

export function normalizeCorasAttraction(attraction, currency = 'EUR') {
  if (!attraction || !text(attraction.attraction_id) || !text(attraction.attraction_name)) return null;
  const media = Array.isArray(attraction.media) ? attraction.media : [];
  const image = media.find(item => item?.type === 'IMAGE' && httpsUrl(item.url));
  const images = attraction.images || {};
  const location = attraction.location || {};
  return {
    id: text(attraction.attraction_id), name: text(attraction.attraction_name),
    provider: 'coras', environment: 'sandbox', bookable: false,
    city: text(attraction.city),
    countryCode: text(location.parent_location?.code || location.code).toUpperCase(),
    description: plainText(attraction.description),
    image: image ? httpsUrl(image.url) : httpsUrl(images.image_w345_h237 || images.image_w200_h200),
    category: text(attraction.main_category?.slug),
    attractionTypeId: Number.isInteger(attraction.attraction_type_id) ? attraction.attraction_type_id : null,
    currency,
    minPriceCents: minorUnits(attraction.min_price?.[currency]),
    maxPriceCents: minorUnits(attraction.max_price?.[currency]),
    // Catalogue prices do not establish the final total including supplier fees.
    pricingComplete: false,
    timezone: text(attraction.timezone),
    upcomingInstances: Array.isArray(attraction.upcoming_instances)
      ? attraction.upcoming_instances.filter(value => typeof value === 'string') : [],
    ticketDeliveryMethod: Number.isInteger(attraction.ticket_delivery_method) ? attraction.ticket_delivery_method : null
  };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createCorasClient({env = process.env, fetcher = globalThis.fetch, timeoutMs = 10000} = {}) {
  const readiness = corasReadiness(env);
  const distributorId = String(env.CORAS_DISTRIBUTOR_ID || '').trim();
  const requestTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30000) : 10000;

  async function request(path, {session, body} = {}) {
    if (!readiness.catalogueReady) {
      throw new CorasError(readiness.code, 'CORAS sandbox catalogue is not configured.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);
    try {
      const headers = {'Content-Type': 'application/json', 'Coras-Distributor': distributorId};
      if (session) headers['Booking-Session'] = session;
      const response = await fetcher(SANDBOX_ORIGIN + path, {
        method: body === undefined ? 'GET' : 'POST', headers,
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        signal: controller.signal, redirect: 'error'
      });
      if (!response.ok) {
        throw new CorasError('upstream_http_error', 'CORAS catalogue request failed.', response.status);
      }
      try { return await response.json(); }
      catch { throw new CorasError('invalid_response', 'CORAS returned an invalid catalogue response.'); }
    } catch (error) {
      if (error instanceof CorasError) throw error;
      throw new CorasError(controller.signal.aborted ? 'upstream_timeout' : 'upstream_unavailable',
        controller.signal.aborted ? 'CORAS catalogue request timed out.' : 'CORAS catalogue is unavailable.');
    } finally { clearTimeout(timer); }
  }

  async function getCities({language = 'en'} = {}) {
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
      throw new CorasError('invalid_input', 'A supported language code is required.');
    }
    const result = await request('/common?' + new URLSearchParams({language_code: language}));
    if (!Array.isArray(result?.cities)) {
      throw new CorasError('invalid_response', 'CORAS returned an invalid city catalogue.');
    }
    return {environment: 'sandbox', publicEnabled: false, cities: result.cities.map(normalizeCorasCity).filter(Boolean)};
  }

  async function getAttractions({city, dateStart, dateEnd, currency = 'EUR', page = 0, size = 20, searchTerm = ''} = {}) {
    if (!text(city) || text(city).length > 160 || !validDate(dateStart)
        || (dateEnd !== undefined && (!validDate(dateEnd) || dateEnd < dateStart))
        || !/^[A-Z]{3}$/.test(currency) || !Number.isInteger(page) || page < 0
        || !Number.isInteger(size) || size < 1 || size > 100 || typeof searchTerm !== 'string' || searchTerm.length > 200) {
      throw new CorasError('invalid_input', 'A city, valid date range, currency and pagination are required.');
    }
    // A new isolated session for each search avoids sharing customer/session state.
    const sessionResponse = await request('/booking-session', {body: {language: 'en'}});
    const session = text(sessionResponse?.['booking-session']);
    if (!session || !/^[a-zA-Z0-9-]{1,200}$/.test(session)) {
      throw new CorasError('invalid_response', 'CORAS did not provide a catalogue session.');
    }
    const params = new URLSearchParams({city: text(city), date_start: dateStart, currency, page: String(page), size: String(size)});
    if (dateEnd) params.set('date_end', dateEnd);
    if (searchTerm) params.set('search_term', searchTerm);
    const result = await request('/attractions?' + params, {session});
    if (!Array.isArray(result?.results)) {
      throw new CorasError('invalid_response', 'CORAS returned an invalid attraction catalogue.');
    }
    return {
      environment: 'sandbox', publicEnabled: false, bookingEnabled: false,
      total: Number.isSafeInteger(result.total) && result.total >= 0 ? result.total : result.results.length,
      alternativeResults: result.alternative_results === true,
      items: result.results.map(item => normalizeCorasAttraction(item, currency)).filter(Boolean)
    };
  }

  return Object.freeze({readiness, getCities, getAttractions});
}
