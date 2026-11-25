# TicketBunker on-page travel readiness

Checked 25 November 2026, Europe/Lisbon. This report distinguishes results shown inside TicketBunker from checkout completed with a named provider.

| Service | Verified current connection | Missing for live prices and availability on TicketBunker |
| --- | --- | --- |
| Trainline | Public Trainline search/route links. Affiliate entry remains disabled in TRIP_PARTNERS. No connected rail fare search API. | Approved Trainline Partner Solutions distribution/Global API access, credentials and sandbox; station/route mapping, server-side journey search, fare conditions and availability UI. Own checkout also needs booking/fulfilment and aftersales integration. |
| Omio | Public Omio outbound search links. No connected B2B search or booking API. No supplier approval message found in the checked TicketBunker/SoundBunker mailboxes. | Approved Omio Meta Search API access and integration for native train/bus/flight results; Omio or branded checkout can remain provider-managed. Full native payment/booking needs its separately contracted Booking API. |
| Other rail/ferries | Northern, TransPennine Express and FerryHopper affiliate entries remain disabled in the current catalogue. | Individual programme acceptance/tracking, then separately authorised timetable/fare API integration for native results. Trip.com/KAYAK native quote adapters are also not present in current source. |
| Flights | Live /api/flight-quotes responds enabled:true and returns recently found Aviasales Data API prices, with tracked provider booking links. | Exact-date searches may fall back to other dates in the month. These are cached discovered prices, not guaranteed live seat availability or party totals. A real-time search/reprice/booking API is still needed for full native flight sales. |
| Hotels | Expedia and Booking.com destination/date/adult/room search links. No room inventory/rate API. | Approved hotel inventory API account, credentials, room/occupancy handling, date-specific rates and availability. Booking Demand API requires managed affiliate status, contract, Partner Centre access, API token and affiliate ID. |
| Taxis | Uber/Bolt ride links; Viator feed has real airport/chauffeur/transfer products and starting prices. | Approved route/time-specific taxi quote API and pickup/drop-off/passenger context. Product starting prices cannot be represented as an exact taxi fare. |
| Deals | /api/partner-offers?country=GB responds ready:true with one offer at time of check. | More approved, unexpired merchant offers with destinations, redemption terms and permitted distribution. A group of separate merchant offers is not a single combined booking or automatically stackable discount. |

## Verification evidence

- Flight test LON to FAO, 11–14 December 2026, EUR: HTTP 200, enabled true, three returned fare cards, exact false. Returned fare dates must be shown because alternatives may differ from requested dates.
- London partner catalogue: HTTP 200, 659 records; a separate transfer-only selection identified three real Viator products with starting prices. This does not establish a route/time cab quote.
- Partnerize welcome and email verification messages dated 21 November are present. They are network account messages, not Trainline/Omio programme or API approval. No approval email was found in the two relevant mailboxes checked.
- Travelpayouts site verification email received 24 November, 19:06 UTC. The flight API was also independently tested, so this status is not inferred from the email alone.

## Website improvements

The public website now has readable 50px controls, a compact shared route list, logical ticket-first discovery and optional travel details. The welcome notice is loaded directly before normal homepage/navigation modules. Existing preview persistence and operational-page exemptions are retained.

Follow-up fixes preserve selected destination for deals, carry the flight passenger/date context, and save an opened provider choice as planned while moving to the next trip stage. Opening a provider never records a confirmed booking.

## Practical priority

1. Obtain an actual B2B search integration for rail and coaches. Omio Meta Search is a strong fit for on-page comparison with provider-managed checkout; Trainline Global API is the rail alternative. Commercial eligibility and terms are still supplier decisions.
2. Connect an approved hotel rate/availability API. Current hotel links already carry the visitor’s selected dates and rooms, but cannot return native room quotes.
3. keep supported flight fare cards and real transfer listings available with their actual price basis while exact fare, taxi and native booking integrations are qualified.

## Official supplier references

- Trainline Global API: https://tps.thetrainline.com/our-products/global-api/
- Trainline affiliate tools: https://www.thetrainline.com/about-us/partnerships/affiliates
- Omio B2B Meta Search, White Label and Booking API: https://www.omio.com/corporate/omio-b2b/
- Booking Demand API prerequisites: https://developers.booking.com/demand/docs/getting-started/prerequisites

No supplier messages, account signups, paid services, deposits or contract acceptance were performed in this review.
