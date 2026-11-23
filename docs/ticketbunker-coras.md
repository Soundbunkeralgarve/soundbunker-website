# CORAS catalogue integration

The server-side module `ticketbunker-site/api/lib/coras.js` supports sandbox city
discovery and attraction search. It is not connected to the public partner feed.
It cannot reserve tickets, charge cards, confirm purchases or generate tickets.

## Configure sandbox development

Set these server environment variables using the distributor identifier provided
for your sandbox integration:

```text
CORAS_ENVIRONMENT=sandbox
CORAS_DISTRIBUTOR_ID=<sandbox distributor identifier>
```

No credentials or demo identifiers are embedded in the source. The client uses
only `https://sandbox.coras.io/v2`. Missing configuration disables requests.
`CORAS_ENVIRONMENT=production` always fails closed with `production_locked`;
setting a live identifier alone cannot enable public sales.

```js
import { createCorasClient } from '../ticketbunker-site/api/lib/coras.js';

const client = createCorasClient();
const { cities } = await client.getCities();
// Use an actual searchKey returned by getCities(), not a guessed city slug.
const result = await client.getAttractions({
  city: cities[0].searchKey,
  dateStart: '2026-12-01',
  dateEnd: '2026-12-07',
  currency: 'EUR',
  size: 20,
  page: 0
});
```

`client.readiness` is safe for internal diagnostics: it reports configuration
readiness, not a successful upstream test. It never includes credentials and
always reports `publicEnabled: false` and `bookingEnabled: false`. Search results
also identify `environment: 'sandbox'` and each item is `bookable: false`.
Do not add sandbox items to the public shop.

## Implemented protocol

- Send `Content-Type: application/json` and `Coras-Distributor` on every request.
- Read city `search_key` from `GET /common?language_code=en`.
- Create a fresh isolated session with `POST /booking-session` for each search;
  this POST creates only search session state, not a reservation.
- Send the returned `Booking-Session` token to `GET /attractions` with `city`,
  `date_start`, optional `date_end`, `currency`, `page`, `size` and optional
  `search_term`. The session stays server-side and is not returned to callers.
- Preserve prices as integer minor units. `minPriceCents` and `maxPriceCents`
  reflect catalogue bounds; `pricingComplete: false` means they do not establish
  the final total including supplier fees. The historical field suffix follows
  the site's price convention; values stay in the requested currency's minor units.
- Fail on invalid response shapes or upstream failures. Errors have stable codes,
  omit upstream bodies and use a bounded timeout. Redirects are rejected so
  distributor headers are not forwarded to a different origin.

Sessions expire after 20 minutes of inactivity; relevant calls refresh their TTL.
The current v2 contract uses unified `/attractions/{id}` and `/reservations`
endpoints for a future booking integration. Type-specific reservation endpoints
are deprecated.

## Requirements before a separate production release

1. Obtain Ticket Bunker's own production distributor identifier and written
   confirmation of enabled catalogue, territories, sales and settlement terms.
   CORAS's public introduction includes a shared demo distributor: access to that
   sandbox does not establish a production account or sales approval.
2. Agree the checkout model. CORAS's web flow uses its Stripe publishable key,
   reservation `client_secret`, SCA and payment webhook, followed by transaction
   polling. A Ticket Bunker merchant-of-record flow instead requires a saved
   supplier payment method plus CORAS-provisioned login/password, `/auth` token
   and authenticated synchronous confirmation. Ticket Bunker's customer Stripe
   payment by itself does not settle a CORAS reservation.
3. Implement reservation holds, expiry, attendee requirements, supplier-required
   phone verification, full-price review, payment/booking reconciliation and
   support/refund handling before making any product bookable.
4. Display all supplier ticket and reservation fees. The selectable booking fee
   must stay inside the API's allowed range. Distributor revenue is a negotiated
   share of that fee, not a percentage of the ticket's face value.
5. Support the supplier's ticket delivery method. It may require box-office
   collection, an email attachment, separate provider email, delivery close to
   the event, or a download link. Do not promise immediate downloads or create
   replacement admission barcodes/Wallet passes without supplier approval.
6. Complete sandbox booking/decline/expiry/refund tests, production certification
   if required, and a separately reviewed release that enables live access.

## Validation

```sh
cd ticketbunker-site
node --test test/coras.test.mjs
```

Tests use fake identifiers and local fetch fixtures. They exercise disabled and
production gates, request sequencing/headers, minor-unit prices, malformed
responses, safe errors and timeout cancellation. They do not book or pay.

## Official references

- [Introduction and environments](https://developer.coras.io/docs/api/latest/)
- [Authentication](https://developer.coras.io/docs/api/latest/integration-guide/authentication/)
- [Booking flow](https://developer.coras.io/docs/api/latest/integration-guide/booking-flow/)
- [Stripe and merchant-of-record integration](https://developer.coras.io/docs/api/latest/integration-guide/payment-integration/)
- [Pricing and supplier fees](https://developer.coras.io/docs/api/latest/integration-guide/pricing-and-currency/)
- [API reference and delivery methods](https://developer.coras.io/docs/api/)
- [Embed SDK and shared sandbox example](https://embed.coras.io/getting-started/introduction/)
