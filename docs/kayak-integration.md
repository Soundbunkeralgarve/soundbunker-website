# KAYAK integration status — 25 November 2026

The Flights and Hotels adapters, public service boundary and browser result integration are implemented. Real browser requests to a protected preview successfully completed both sandbox searches. Customer-facing KAYAK results remain disabled because production access, production credentials and the approved production origin have not been supplied.

KAYAK's 03:45 UTC email to `bookings@theticketbunker.com` grants **sandbox API access**. It does not approve production use. A production-access request draft has been prepared and remains unsent; no production approval or production key has been received.

## Implementation and verified status

| Component | Current behavior |
| --- | --- |
| `ticketbunker-site/api/lib/kayak.js` | Server-side Flights/Hotels adapter, input validation, bounded requests, normalized results and credential suppression. |
| `ticketbunker-site/api/lib/kayak-service.js` | Public `/api/kayak-search` boundary. Rejects sandbox/off/unapproved configurations before any supplier request. |
| `ticketbunker-site/kayak-search.js` | Browser capability check, session UUID, bounded polling and additional offer cards for the existing flight/hotel forms. Creates no result UI or submit handlers when disabled. |
| `travel.html` and `hotels.html` | Include the production-gated browser hook alongside the existing travel workflows. Existing provider searches remain available when KAYAK is disabled, unavailable or unsuitable for the requested party. |
| Temporary smoke helper | Used only on an authenticated preview. `api/integration-check.js` is excluded from main/production; its preview-only check returns 404 outside preview. It is not a customer sandbox endpoint. |

The protected-preview tests used a real browser's incoming User-Agent and trusted Vercel client IP. They did not substitute a fabricated CLI User-Agent or invented address.

| Sandbox browser check | Results | Options | Polls | Completion |
| --- | ---: | ---: | ---: | --- |
| Flights: BOS → JFK | 8 | 64 | 2 | Complete |
| Hotels: Boston | 20 | 78 | 2 | Complete |

Both checks returned `testData: true`, `live: false` and `bookable: false`. Sandbox booking URLs were suppressed. These are synthetic supplier test results, not production inventory, prices or reservations. The counts describe those checks, not an availability guarantee.

## Official references and sandbox behavior

- [Getting Started](https://developers.kayak.com/getting-started)
- [Flights Search API](https://developers.kayak.com/flights-search-api)
- [Hotels Search API](https://developers.kayak.com/hotels-search-api)
- [API access and production approval](https://affiliates.kayak.com/apis)

The implementation follows the developer portal's request and response schemas. It does not infer API contracts from consumer search URLs.

The documented sandbox origin is `https://sandbox-en-us.kayakaffiliates.com`. Sandbox tests use the US market; prices are synthetic, images can be placeholders and booking redirects are synthetic click pages. KAYAK documents a three-month lifetime for sandbox keys. Production approval and product-specific production access are separate.

## Browser context, sessions and secrets

The browser generates an anonymous UUID and stores only that identifier in `sessionStorage` under `tb-kayak-session-id`. The same UUID is sent in `x-kayak-session-id` throughout the browser-tab session and retained across search polls. Search details are not stored by this session helper.

The public service reads the actual incoming `User-Agent`. It requires `VERCEL=1` and a valid Vercel edge-provided client address, preferring `x-vercel-forwarded-for` and then the trusted platform's `x-forwarded-for`. It forwards this address as `x-original-client-ip`; it does not accept an IP or User-Agent supplied in the request body. Missing or invalid browser/session/IP context fails before contacting KAYAK. Outside Vercel, forwarded headers are not treated as verified context.

The lower-level adapter accepts `context = {userTrackId, userAgent, clientIp}`; its client IP is optional for documented exemption cases. The public boundary is deliberately stricter and currently requires a trusted IP. Any exemption must be agreed with KAYAK before changing this behavior.

API authentication uses a server-side `apiKey` query parameter. Never log complete supplier URLs, raw supplier exceptions or hotel `href` fields: these can contain the key. The implementation returns whitelisted fields and generic errors, strips credential-bearing URLs and never sends API keys, trusted IPs or browser User-Agents back to the browser. The public route uses `private, no-store` responses. Identical concurrent requests are coalesced only within their own session/client/configuration; completed search results are not cached.

## Production configuration and public gate

| Variable | Purpose |
| --- | --- |
| `KAYAK_MODE` | `off` by default. `sandbox` is for protected testing; `production` is required for public results. |
| `KAYAK_SANDBOX_API_KEY` | Secret issued for tests. It is configured only on the intended protected preview, not as a production credential. |
| `KAYAK_PRODUCTION_API_KEY` | Separate approved production credential. It must not equal the configured sandbox key. |
| `KAYAK_PRODUCTION_APPROVED` | Must explicitly equal `true`. This records supplier approval; setting it does not obtain approval. |
| `KAYAK_PRODUCTION_ORIGIN` | Exact HTTPS origin confirmed by KAYAK for the approved integration. It must be a non-sandbox `kayakaffiliates.com` origin. No production origin has been guessed or configured. |

Public capability is enabled only when the adapter reports production mode, valid approved configuration, `canServePublic: true` and `testData: false`.

- Disabled/off/sandbox/unapproved: `GET /api/kayak-search` returns HTTP 200 with `{enabled:false,provider:'kayak'}`. `POST` returns HTTP 404 and makes no supplier call.
- Approved and configured: `GET` exposes only capability metadata and the supported kinds, `flights` and `hotels`. `POST` then validates the body, kind, context and search before requesting data.
- Returned results must still identify production mode, `testData: false` and `live: true`. The browser independently rejects any other envelope.
- Offer cards require a safe HTTPS booking URL and explicit offer/envelope bookability. Empty searches, incomplete metadata-only results, synthetic responses and unsafe or credential-bearing URLs do not become bookable offers.

The current approval flag, key and origin cover both products together. Obtain explicit access for **both Flights and Hotels** before enabling this configuration. If KAYAK approves only one product, add product-specific capability/configuration gates first; do not enable both kinds with the shared flag.

## Search contracts and displayed prices

`createKayakClient({env = process.env, fetchImpl = fetch, timeoutMs = 8000})` exposes safe `status` metadata, `pollFlights(input, context)` and `searchHotels(input, context)`. `createKayakSessionId()` creates a UUID for route-owned sessions; it must not be regenerated between polls of the same search.

Flights use `POST /i/api/affiliate/search/flight/v1/poll`. The first body contains `searchStartParameters` with cabin, passengers and airport/date legs. Continuations retain `searchId`, `cluster` and the original user session. The request asks for total prices and excludes split bookings. Partial results remain explicitly incomplete until KAYAK reports `complete`.

The browser displays only total-price flight options, retains the selected adult party and one-way/return itinerary, and prefers a supplied `totalPrice` over `displayPrice`. Provider names, operating-carrier information and supplied non-refundable disclosures are shown. Child-inclusive searches are not silently quoted as adults-only searches; unsupported party inputs retain the existing provider flow.

Hotels use `GET /api/3.0/hotels` with an explicit `kplace` key or `klatlon:latitude,longitude`, stay dates, documented room occupancy, currency and `responseOptions=topRates,images`. The adapter asks to include taxes and local taxes in totals but the customer still confirms the final charges and terms with the booking provider.

Room encoding is preserved: `rooms='2'` means one room with two adults; `rooms='1:4,6|3'` means two rooms, the first with one adult and children aged four and six, the second with three adults. The current browser hook supports adult-only party allocation across the selected number of rooms, with one to nine adults per room. It does not invent missing child ages or silently reduce the party.

A HotelRate `totalRate` is displayed as a **provider room quote**. It is not multiplied by the group size, room count or number of nights, and is not relabelled as a guaranteed total for the whole party. The requested dates, nights, adults, rooms and adult allocation are shown separately; the provider confirms the room combination and full booking total. Cancellation and payment flags retain the supplier's supplied values. No per-night price is invented.

Hotel HTTP 202 responses remain pending. HTTP 200 with `isComplete:false` and metadata but no `results` array is also a normal pending response; polling repeats the same search and context. A completed response without the required result array is invalid. Browser polling is bounded, retains partial status and prevents delayed responses from an obsolete search replacing current offers.

## Remaining production steps

1. Send the prepared request or otherwise obtain KAYAK's approval for the actual TicketBunker Flights and Hotels use case, production key(s) and exact approved origin.
2. Complete the product-specific contract, attribution, fare/baggage, room-combination and booking disclosure review. Add separate product gates if approval is not granted for both together.
3. Configure the approved production values server-side, run a private real-price smoke, verify both public capabilities and provider booking hand-offs, then enable customer KAYAK offers. Keep the existing provider alternatives available through failures.

The sandbox smoke is complete; it is not an outstanding prerequisite and does not replace production approval or a real-price check.

The existing application has already been submitted. The public inquiry form at `https://affiliates.kayak.com/apis#get-in-touch` includes Terms/Privacy acceptance and reCAPTCHA; no self-service production-approval switch is documented. The unsent follow-up should reference the existing application and completed sandbox checks without claiming production access. Official contact: `partnerships@kayak.com`.

## Automated checks

Run from the repository root:

```sh
node --test ticketbunker-site/test/kayak.test.mjs ticketbunker-site/test/kayak-service.test.mjs ticketbunker-site/test/kayak-search.test.mjs
```

All 40 tests passed during this update. Fixtures are explicitly synthetic and contain no account credentials. Coverage includes documented request shapes, stable session/cluster continuation, sandbox suppression, production gating, trusted context, room/date validation, safe booking links, HotelRate quote semantics, bounded polling, stale response cancellation, disabled UI behavior and safe failure fallbacks.
