# KAYAK integration status — 25 November 2026

KAYAK emailed `bookings@theticketbunker.com` at 03:45 UTC with **Sandbox API access granted**. This grants testing access, not production approval. The earlier registration email says applications are reviewed case by case. No production approval email was found.

The current public flight search continues to use Aviasales / Travelpayouts recently found fares. The current hotel flow opens Expedia and Booking.com with the selected search. The KAYAK module is a server-only prototype and adds no public route or customer-facing result UI.

## Verified official documentation

- [Getting Started](https://developers.kayak.com/getting-started)
- [Flights Search API](https://developers.kayak.com/flights-search-api)
- [Hotels Search API](https://developers.kayak.com/hotels-search-api)
- [API access and production approval](https://affiliates.kayak.com/apis)

The API reference is navigable through the buttons in the developer portal. The implementation was checked against its request and response schemas, not inferred from consumer URLs.

## Sandbox facts

The documented sandbox origin is `https://sandbox-en-us.kayakaffiliates.com`. It supports only the US market. Prices are synthetic, media can be placeholders and booking redirects are synthetic click pages. KAYAK states that sandbox keys last three months from issuance. Production approval and product-specific production keys are separate.

Authentication uses the `apiKey` query parameter. Search calls also require a session-specific `userTrackId`; generate one UUID per end-user session and retain it across polls. Send the actual client User-Agent. Forward `x-original-client-ip` only from a trusted source; do not invent an IP address or let a caller freely spoof it. KAYAK documents that exemptions can be arranged when obtaining the client IP is impossible.

API keys must remain server-side. Never log a complete supplier request URL: it contains the key. Upstream error messages and hotel result `href` URLs can also contain it. The adapter returns whitelisted fields and generic errors and never passes raw upstream exceptions, hotel `href`, or query credentials to callers.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `KAYAK_MODE` | `off` by default; explicitly choose `sandbox` for a private test. |
| `KAYAK_SANDBOX_API_KEY` | Secret key from the sandbox email. Configure only in the intended private preview/test environment. |
| `KAYAK_PRODUCTION_API_KEY` | Separate approved production credential; never substitute the sandbox credential. |
| `KAYAK_PRODUCTION_APPROVED` | Must explicitly equal `true` before production is enabled. This records approval; setting it does not obtain approval. |
| `KAYAK_PRODUCTION_ORIGIN` | Exact HTTPS origin supplied/confirmed by KAYAK for the approved integration; no production hostname has been guessed or configured. |

Production requires explicit mode, approval, a separate key and an approved non-sandbox `kayakaffiliates.com` origin. Missing any requirement keeps `canServePublic` and `live` false. The prototype does not set any environment values itself.

## Adapter contract

`createKayakClient({env = process.env, fetchImpl = fetch, timeoutMs = 8000})` exposes safe `status` metadata and two request methods:

- `pollFlights(input, context)` starts a search or retrieves its next page/phase.
- `searchHotels(input, context)` retrieves current hotel-search results. Repeating the same search may be required until `complete` is true.

`context` requires `userTrackId` and the actual `userAgent`; trusted `clientIp` is optional in the adapter. `createKayakSessionId()` creates a UUID; the route/session owner must persist it for the session rather than regenerate it on every poll.

Every result envelope identifies `provider`, `mode`, `testData`, `live`, `bookable`, `label`, `complete` and normalized `results`. Sandbox envelopes and offers always use `testData: true`, `live: false`, and `bookable: false`; their booking URLs are omitted. A partial response remains explicitly incomplete. `live` and `canServePublic` describe the approved source capability; an individual offer is `bookable` only when it has an accepted booking URL, and an envelope is `bookable` only when at least one such offer exists. Empty and HTTP 202 responses are never bookable. No source price is treated as a confirmed reservation, and no missing price or result is invented.

Flight amounts retain their returned currency and `priceMode`; the initial request asks for total prices. Hotel amounts retain the supplier's total rates and cancellation/payment flags. No per-night conversion is invented. Additional disclosures, baggage/fare UI, room combinations, production attribution and commercial terms need review before any public KAYAK release. Split flight bookings are intentionally excluded from this prototype because they require a separate disclosure and booking flow.

## Fixed private smoke samples

These US examples are explicitly identified in the official documentation. Dates below are future test dates, not a travel request or booking.

```js
import {createKayakClient, createKayakSessionId} from './ticketbunker-site/api/lib/kayak.js';

const client = createKayakClient();
const context = {
  userTrackId: createKayakSessionId(),
  userAgent: 'TicketBunker-KAYAK-Sandbox-Prototype/1.0'
};

const flight = await client.pollFlights({
  from: 'BOS', to: 'JFK', depart: '2026-12-10', adults: 1, currency: 'USD'
}, context);

// Preserve context, searchId and cluster for subsequent requests until complete.
const next = flight.complete ? flight : await client.pollFlights({
  searchId: flight.searchId, cluster: flight.cluster, currency: 'USD'
}, context);

const hotel = await client.searchHotels({
  destination: 'kplace:58075', // Boston, Massachusetts, US — official example key
  checkin: '2026-12-10', checkout: '2026-12-12', rooms: '2', currency: 'USD'
}, context);
```

Flights use `POST /i/api/affiliate/search/flight/v1/poll`. The first body contains `searchStartParameters` with cabin, passenger types and airport/date legs. Later bodies carry `searchId`, with `cluster` in the query. Stop when `status` becomes `complete`; preserve and expose partial state while providers are still responding.

Hotels use `GET /api/3.0/hotels`. This prototype supplies an explicit place key or `klatlon:latitude,longitude`, stay dates, documented room/guest encoding, `responseOptions=topRates,images`, language and currency. `rooms='2'` means one room with two adults; `rooms='1:4,6|3'` means two rooms, the first with one adult and children aged four and six, the second with three adults. An HTTP 202 remains incomplete.

Any temporary HTTP smoke route must be private and preview-only, protected by existing deployment authentication, and must not return keys, full upstream URLs, IPs, User-Agents or raw responses. The adapter itself is not a substitute for route access controls. No such public route is added by this change.

## Production prerequisites still outstanding

1. KAYAK approval of the actual TicketBunker affiliate/use case, followed by production keys and exact approved origin for Flights and Hotels.
2. A successful private sandbox smoke with the issued key, followed by production contract/attribution/disclosure review and a separate real-price smoke after approval.
3. Public integration work using the approved product behavior, with existing working travel alternatives retained during failures.

The existing application has already been submitted. The public inquiry form at `https://affiliates.kayak.com/apis#get-in-touch` asks for name, business email, company, website, project and sandbox preference, and includes Terms/Privacy acceptance and reCAPTCHA. No self-service approval button is documented. A follow-up can reference the existing application; it should not pretend that sandbox access means production is active. Official contact: `partnerships@kayak.com`.

## Checks

Run `node --test ticketbunker-site/test/kayak.test.mjs` from the repository root. Fixtures are explicitly synthetic and include no account credentials. The tests cover documented request shapes, stable session/cluster continuation, sandbox labels, production gating, date/room validation, timeout behavior, malformed/partial results and suppression of credential-bearing URLs/errors.
