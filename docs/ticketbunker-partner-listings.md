# Ticket Bunker partner listings

Updated 23 November 2026. This document describes the original controlled static
catalogue. The shop also has the separately implemented affiliate feeds and the
Entradas.com browse directory described below; their publication paths do not use
this legacy JSON configuration.

## Current integrations

- `partner-directory.js` adds approved Entradas.com browse links for Spain, using
  Awin programme 24761 and the existing publisher configuration. Madrid,
  Barcelona, Málaga and Seville use verified supplier city URLs; other Spanish
  destinations use a clearly labelled national directory. The tracked redirect
  was checked to reach the correct supplier page with Awin attribution
  parameters. No purchase or commission payout was tested.
- The directory follows the selected destination and stays separate from event
  results and ticket counts. Customers browse and pay on entradas.com; it is not
  a catalogue API or a Ticket Bunker checkout integration.
- `api/partner-feed.js` retains independent Skiddle, Viator and Awin feed loaders.
  Failed providers retry after five minutes; a fully successful load is cached
  for 30 minutes. Viator requires a working production API key; sandbox access
  must not be substituted for production inventory.
- CORAS catalogue search is implemented for isolated sandbox development only.
  See [CORAS setup](ticketbunker-coras.md) for the live-account and settlement
  dependencies. It is not wired to public discovery or payments.
- FareHarbor and Tiqets require their own onboarding and approved account access
  before their offers can be published. No inferred booking-API permission is
  granted by this code.

## Current state

The original four-provider configuration is disabled and contains no listings or
booking links. Its own section remains hidden. Entradas.com's separate directory
does not depend on those legacy records. Fetch, JSON and validation errors leave
native Ticket Bunker event discovery available. No external ticket is passed to
native checkout, ticket issuance, QR, wallet or refund handlers.

| Area | Provider | Initial market and approval |
| --- | --- | --- |
| Concerts and events | Ticketmaster | Apply to the global affiliate programme via Impact. Only approved markets are allowed; Portugal is not in the published programme market list checked for this implementation. |
| Cinema | Entradas.com | Spain; Awin programme approval required. |
| Cinema | Cinemas NOS | Portugal; negotiate express public distribution rights. A corporate voucher purchase does not establish resale permission. |
| Attractions and experiences | Tiqets | Approved catalogue destinations; begin with affiliate booking links. Booking API access is a separate supplier decision. |

Official entry points:

- Ticketmaster: https://developer.ticketmaster.com/partners/distribution-partners/affiliate-sign-up/
- Entradas cinema: https://www.entradas.com/campaign/en/afiliacion-cine
- Cinemas NOS: https://www.cinemas.nos.pt/contactos/Apoios_parcerias
- Tiqets: https://www.tiqets.com/en/partner-program/sign-up-form/

## Enable after approval

The controlled setup path is a reviewed edit to `ticketbunker-site/partner-listings-config.json`, followed by validation and deployment. There is no public admin editor, anonymous update endpoint or browser-local setting that can publish inventory.

1. Verify the supplier's approval, authorised countries and permitted use of content in the partner account. Confirm any fees and contract obligations before accepting them. Store evidence privately; never put credentials, contracts, private commercial details or customer information in this public JSON.
2. Set the relevant provider's `status` to `approved`. Put a **non-secret approval note** in `approvalReference`; it is a publication review reference, not an API key. Set `countries` to the ISO two-letter destination codes authorised by the agreement.
3. Copy the exact hostname(s) used by that supplier's approved tracking links into `allowedBookingHosts`. No wildcard hosts, URL prefixes, ports or arbitrary visitor-provided domains are supported. Include only the particular tracking host supplied for this account; do not add every host on an affiliate network. Redirect targets must also be verified in the provider portal.
4. Add a `bookingLinks` record with a unique `id`, the exact approved HTTPS `url`, a non-secret `trackingReference`, `trackingVerifiedAt` (an ISO timestamp after verifying attribution in the partner portal) and a future `expiresAt` timestamp. This verifies configuration shape and review dates; code cannot independently prove commercial approval or attribution. Generic untracked homepage fallbacks are rejected. Set expiry according to supplier terms and the next required review.
5. Add a `listings` record with unique `id`, `providerId`, `status: published`, `category` (`events`, `music`, `comedy`, `cinema` or `attractions`), `countryCode`, `city`, `title`, `description` and the `bookingLinkId`. Use only real current provider content that the agreement permits publishing. Do not invent events, reviews, availability, prices or inventory. Category and country must be supported by both the agreement and the provider. Use `music` or `comedy` only when the authorised event content establishes that category; broader event records retain `events`. The Concerts & events filter includes all three, with separate Live music and Comedy choices when available. Attractions & activities uses `attractions`.
6. Change `enabled` to `true` only once there is at least one approved, current listing. Run the checks below, then deploy through the existing Ticket Bunker release process. No copy of this repository needs to be saved separately.
7. Check the public section, country, town/city and activity filters on mobile and desktop. Confirm the displayed provider and affiliate disclosure. Follow a booking link and verify the correct supplier inventory and attribution in the supplier portal; do not make a paid test booking without authorisation.

```sh
node scripts/validate-ticketbunker-partners.mjs
node --test ticketbunker-site/test/partner-listings.test.mjs
```

When enabled, publication validation fails if a published record is blocked by approval, invalid market, unsafe or missing link, duplicate IDs or expiry. Disabled empty configuration is valid and reports `publicSection: hidden`.

The destination filters describe **where the activity takes place**, not the visitor's residence; they do not use visitor IP or restrict tourists searching abroad. Country options and town/city suggestions come from all approved, current listings, with no curated city list in live discovery. Town/city text search supports partial names, ignores case, extra spacing and accents, and combines with country and activity choices. Suggestions follow the selected country and activity; leaving country blank searches every approved destination worldwide. UK-wide and European coverage remains subject to each supplier's authorised catalogue, rather than being limited to the example cities or promising inventory in every town.

Country coverage is explicit per provider, with an additional bounded provider market list. The current first-stage model supports one destination per listing. Broad multi-country catalogue links should be split into reviewed destination-specific links. The separate `/partner-preview` page uses six clearly labelled, non-bookable layout examples in London, Edinburgh, Lisbon, Paris, Amsterdam and Barcelona. These examples are not approved inventory or coverage claims and are never read into the live catalogue.

Cards identify who sells the booking and say that the provider's prices, fees, ticket delivery and refund terms apply. Booking links open in a separate tab with `sponsored noopener noreferrer`. Ticket Bunker accounts, wallets and native fee promises do not automatically extend to provider bookings. Review any global fee marketing copy when activating external listings.

## Scope and next stage

This static publication path does not implement seat selection, transactions,
commission reconciliation, portal credential storage or direct checkout. Those
depend on approved account access and supplier-specific contracts. The legacy
static catalogue remains empty; the separate feed and directory paths above
handle their own listings. Pausing a legacy provider or disabling this JSON
catalogue affects only its own offers.
