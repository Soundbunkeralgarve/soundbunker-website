# TicketBunker API coverage and commercial action plan

Checked **25 November 2026**. Internal plan; enquiries below are **drafts, not sent**. No provider status, website/app integration, account, contract or payment was changed for this review.

The practical route is several authorised suppliers behind one TicketBunker trip flow. An available API product, affiliate account, public link and production booking permission are four different things. No source establishes complete worldwide inventory for this account.

## Current account and implementation position

| Area | Verified project/account position | Immediate action |
| --- | --- | --- |
| Trainline | Partnerize affiliate request **rejected 25 November at 15:00 UTC**. Notification gives no reason. Current affiliate entry is disabled; ordinary route/search links exist. | Qualify the separate Trainline Partner Solutions business API. Do not claim that the affiliate rejection blocks all B2B routes, or that public launch alone guarantees approval. |
| Omio | **Pending/unapproved**; no B2B approval evidenced. Ordinary outbound links exist, without a connected native search/booking API. | Ask Omio B2B for event-platform eligibility, metasearch or white-label pilot, then compare Booking API terms. |
| KAYAK Flights/Hotels | Adapters/browser hooks implemented; project evidence records successful synthetic sandbox checks. Production approval, credentials and approved origin remain required. | Ask the existing KAYAK contact for product-specific production approval; do not rebuild the already tested adapters. Cars needs separate access and implementation. |
| Existing flight/hotel links | Trip.com flight link marked approved; Expedia/Booking.com links preserve search context. Aviasales fare-card adapter uses recently found prices. | Retain correct price dates/basis and provider checkout. These links/cards do not establish native room booking or real-time flight ticket issuance. |
| Events and experiences | Own event gateway plus Skiddle/Viator/reviewed Awin discovery. Viator product search exists; CORAS work is sandbox-only. | Preserve actual seller and booking handoff. Seek access upgrades for native booking instead of inferring rights from catalogue access. |
| Ticketmaster and other pending ticket providers | Ticketmaster affiliate declined 25 November at 14:48 UTC; Developer Portal account was pending admin approval. Transactional Partner access not evidenced. Tiqets/NOS/Entradas partner-listing records remain pending. | Continue launch with authorised sources; revisit each provider through its appropriate commercial route. Ticketmaster's live/established-site criterion is one listed eligibility condition, not a guarantee of acceptance. |
| Coupons and promotions | Current live offer audit supplied for this plan: **one verified TTD 3% code offer plus five no-code promotions**. No verified food, hotel or transport codes. | Show only the offer's actual merchant/category, validity and redemption terms. Do not turn promotions into codes, invent a code string, promise travel discounts or imply that separate offers stack. |
| Local transport | TfL implementation; keyed operator adapters for Paris/Madrid/Prague/Helsinki. Uber/Bolt links and some Viator transfers exist. | Verify live responses city by city. A transfer starting price is not an exact taxi fare or allocated vehicle; timetable-only data must not be labelled live. |

Evidence: `trip-partners.js`, `travel-directory.js`, `travel-offers.js`, `api/partner-feed.js`, `api/lib/kayak.js`, `api/lib/kayak-service.js`, `api/lib/flight-quotes.js`, `get-around.js`, `api/lib/get-around-live.js`, `partner-listings-config.json`, `docs/kayak-integration.md`, `docs/ticketbunker-coras.md` and dated supplier correspondence checked in this session. This is not a new production booking transaction test. The newer KAYAK integration note supersedes the older readiness report's statement that no KAYAK adapter exists.

## Coverage matrix and commercial shortlist

All products below are candidates, with TicketBunker production access still to establish unless the current-position table says otherwise. Confirm named countries, carriers, suppliers and channels before publishing coverage.

| Need | Primary route / verified product | Request or remaining gap |
| --- | --- | --- |
| Rail, coaches and selected flights | **Omio B2B** [1]: white label explicitly serves event organisers; Meta Search API supports native results with Omio/branded checkout; Booking API supports partner merchant-of-record operation. | Request a startup pilot and exact UK/EU/PT, cross-border and Eurostar content. Compare provider-managed checkout with the cost/responsibility of Booking API. |
| UK/European rail | **Trainline Partner Solutions Global API** [2]: search, booking and aftersales including changes/refunds. | Separate business enquiry from Partnerize affiliate application. Ask specifically about Eurostar, CP/Portugal, UK domestic rail, passes, groups and minimum volume. |
| Rail alternative and agent pilot | **Rail Europe** [3]: API, trade website and affiliation; live availability/pricing, ticket issuance and aftersales. Published carrier list includes Eurostar, National Rail and CP. | Ask which carriers are sellable to this account. An agent portal pilot is not automatically an automated public checkout entitlement. |
| Coaches, selected rail, ferries and airport buses | **Distribusion** [4]: ground transport distribution to retailers. | Obtain startup eligibility and named routes. A mutual NDA precedes detailed inventory, commercial terms and credentials; none has been signed here. |
| Flight/hotel comparison; car hire search | **KAYAK** [5]: Flights, Hotels and Cars search products with separate sandbox and production steps. | Prioritise Flights/Hotels production access. Request Cars separately. Confirm the final provider handoff; search access does not establish TicketBunker ticket issuance. |
| Native flight checkout | **Duffel** [6]: flight offers, refresh and orders using passenger/payment details. | Qualify airline content, ticketing/payment model, funding, fees and servicing before a native checkout build. No account approval or complete low-cost-airline coverage evidenced. |
| Hotels/apartments and other stays | **Expedia Rapid** [7]: content, shopping, price check, booking and itinerary/cancellation operations. | Qualify startup access and payment model. Confirm apartment, villa, hostel and vacation-rental entitlements; consumer Expedia/Vrbo inventory is not automatically included. |
| Accommodation alternative | **Booking.com Demand API** [8]: managed affiliate status, agreed contract, Partner Centre and generated credentials are prerequisites. | Check eligibility before implementing. A consumer account or outbound Booking.com link does not meet these requirements. |
| Taxis, private hire, airport transfers, chauffeur, limousines, accessible vehicles, minibuses and group coaches | **Mozio** [9]: API, white label, widget and agent-tool options; real-time transfer data and branded booking. | Ask for a small-brand pilot, then API terms. Confirm Algarve/city coverage, pickup time, luggage, child seats, capacity and actual vehicle classes. Do not promise universal instant taxi dispatch. |
| Tours, attractions, museums, zoos, theme parks and activities | **Viator** [10]: Basic/Full/Full + Booking affiliate and Merchant tiers. Full + Booking requires authorisation and can retain Viator as merchant of record. | Request this account's exact tier and upgrade assessment. Content access alone does not grant booking, cancellation or live availability access. Validate each venue/activity, including karting or paintball. |
| Theatre and selected attractions/events | **CORAS** [11]: sandbox/production APIs and unified reservations. | Continue existing sandbox work only after production distribution, settlement, final-price and ticket-delivery terms. Confirm actual cinema/sport/theatre catalogue rather than assuming it. |
| Major concerts, festivals, comedy, sport/F1 and other live events | Existing authorised feeds/own events; **Ticketmaster Partner API** [12] is restricted to official distribution relationships. | No blanket F1/West End/major-venue access. Seek the correct provider relationship; a Discovery key does not grant transactional or affiliate rights. |
| Cinema | Provider-specific cinema agreements or confirmed inventory through an approved distributor. | NOS/Entradas pending records are not cinema inventory. Confirm actual UK/EU exhibitors, territory, voucher vs seat booking, showtimes, expiry and redemption. |
| Metro/tram/local bus/urban rail/public river services | Official operator feeds; **TransportAPI** for Great Britain routing/data [13]; **Mobility Database** for GTFS/Realtime/GBFS discovery [14]. | Data is not ticket-sale permission. Verify each feed's licence, authentication, freshness and routing coverage. Preserve useful scheduled information when real-time data is absent. |
| Ferries and water taxis | Qualify Distribusion's named ferry content; use authorised actual transfer/tour products where suitable. | FerryHopper affiliate entry remains unapproved. Passenger/vehicle/cabin data, check-in and ticket delivery need a distinct flow. |
| Boat trips, yachts, helicopter experiences and bespoke charters | Approved experience products or a transparent supplier enquiry where inventory is absent. | Categories do not prove availability. Exact capacity/date/conditions/booking rights required. Private jets and bespoke yacht charter remain explicit supplier gaps. |
| Car hire and parking | KAYAK Cars qualification; current supplier car-hire searches. | No Cars adapter or parking booking API verified. Driver age, pickup/drop-off, deposits/excess, vehicle restrictions, cancellation and parking entry instructions need structured handling. |
| Bikes/scooters, walking and cycling | Licensed operator/GBFS information and route data. | Feed discovery does not reserve, unlock or charge for a vehicle. Operator-specific rental/deep-link permission remains required. |
| Dining, vouchers, group weekends and combined trips | Current authorised offers and restaurant links; saved trip choices. | No universal reservation/voucher API or combined package booking established. Merchant-specific agreements and clear payment/support responsibility are required before selling combined services. |

## Delivery priorities

1. **Commercial qualification:** parallel enquiries for KAYAK production, Omio/rail alternatives, Viator booking upgrade and Mozio pilot. Compare written scope and total costs before choosing integrations. Do not assume free access or promise approval dates.
2. **One shared capability registry:** per account/product record approval reference, territories/carriers, search/booking/refund permissions, price freshness, checkout/merchant/support party and delivery rules. Reuse the same adapters in web and app clients.
3. **One trip context:** preserve destinations, local dates/times, passenger ages, rooms, vehicles and accessibility needs. Show total vs per-person/per-room prices, currency, fees and restrictions; revalidate expiring offers.
4. **Evidence before activation:** test search, empty inventory, changed price, failed payment, confirmation, retrieval, cancellation/refund and outage for the enabled product/market. A saved choice or opened link is planned, not booked. Supplier confirmation is required to record a reservation; retries must not duplicate orders.

## Draft commercial API enquiry — not sent

**Subject:** TicketBunker — UK/European API or branded checkout pilot

Hello [Provider] partnerships team,

I run The Ticket Bunker, operated by SOUNDBUNKER ALGARVE, SOCIEDADE UNIPESSOAL LDA in Portugal: https://theticketbunker.com. We connect event discovery with transport, accommodation and relevant extras, with clear provider identification and prices.

Please assess a startup pilot for [specific product]. We prioritise the UK and Europe, including Eurostar, UK domestic routes and Portugal/the Algarve; wider markets only where authorised. We can provide the current working site/preview. Is public launch, established traffic, sales history, accreditation or a minimum volume required?

Please confirm:

- Available search/metasearch, white-label/hosted-checkout and booking API routes; whether we can start with provider-managed checkout and upgrade later.
- Exact authorised countries/carriers/categories, including CP/Portugal and Eurostar for rail, purchaser residency, point-of-sale, channel and currency restrictions.
- Setup/licence/platform/API/search fees, minimum volumes/spend, deposits/prefunding, credit/invoice settlement, commission/net rates, payout timing and refunds/clawbacks. Our preferred pilot has no committed minimum spend or bulk purchase; please state your actual terms.
- Merchant of record, contracting party, payment collector, ticket issuer, customer support and disruption/change/refund/chargeback responsibilities; settlement if we collect payment.
- Sandbox/production access, documentation/certification, quotas/cache rules, offer expiry/repricing, holds, idempotency, webhooks and onboarding steps.
- Ticket/voucher delivery, issuer-valid QR/barcode and Wallet permissions, plus branding restrictions.

Please introduce a commercial/technical contact and propose a limited pilot. This enquiry commits us to no fee, deposit, minimum sales or exclusivity.

Best regards,
Steven Liddle
The Ticket Bunker
bookings@theticketbunker.com

### Provider-specific draft opening lines

| Target | Add to the draft |
| --- | --- |
| Omio B2B | Your event-organiser white label and Meta Search API appear relevant. Please compare these with Booking API eligibility, merchant responsibilities and migration costs. |
| Trainline Partner Solutions | This enquiry concerns your commercial Global API distribution product, separately from our consumer affiliate application. Please confirm startup access and named rail content. Business contact: `Corporate.Sales@thetrainline.com`. |
| Rail Europe / Distribusion | Please compare a trade/hosted pilot with public API distribution, name available carriers/routes, and outline any NDA, funding, certification or minimum-volume steps. |
| Existing KAYAK relationship | Our Flights/Hotels sandbox integration is implemented. Please assess production access for both products, approved origin and production credentials; separately outline Cars access. |
| Viator | Please confirm our current access tier and assess Full + Booking affiliate access with Viator as merchant of record, including payments, certification and cancellations. |
| Mozio | Please assess an event-platform transfer widget/white-label pilot, startup commercial terms and upgrade path to API; prioritise Algarve airports and UK/EU city transfers. |

No outreach was sent or forms submitted by this work.

## Primary references checked

1. Omio B2B: https://www.omio.com/corporate/omio-b2b/
2. Trainline Global API: https://tps.thetrainline.com/our-products/global-api/
3. Rail Europe: https://agent.raileurope.com/
4. Distribusion: https://www.distribusion.com/es/faq ; https://www.distribusion.com/es/products
5. KAYAK access/production: https://affiliates.kayak.com/apis
6. Duffel: https://duffel.com/docs/guides/getting-started-with-flights
7. Expedia Rapid: https://developers.expediagroup.com/rapid/lodging?locale=en_US
8. Booking prerequisites: https://developers.booking.com/demand/docs/getting-started/prerequisites
9. Mozio: https://www.mozio.com/ ; https://fsbooking.mozio.com/business-partners
10. Viator: https://docs.viator.com/partner-api/technical/ ; https://partnerresources.viator.com/travel-commerce/levels-of-access/
11. CORAS: https://developer.coras.io/docs/api/latest/
12. Ticketmaster: https://developer.ticketmaster.com/products-and-docs/apis/partner/
13. TransportAPI: https://www.transportapi.com/managed-services/journey-planner/
14. MobilityData: https://mobilitydatabase.org/

Six focused search queries were used across this review and its ground-transport research, followed by opening primary sources. Supplier product descriptions were not treated as account approval. Current coupon numbers are a dated live-audit snapshot, not a promise of future availability.

## Added after affiliate portal verification, 25 November 2026

The signed-in Trip.com joined affiliate Promo Campaign tool supplied a tracked UK train campaign URL (Alliance11489066/SID336945869). Its public redemption page confirms a claimable **£8 coupon for UK train bookings over £20**, for users who have never bought train tickets for routes in the UK, Italy, Spain, France or Germany on Trip.com; payment must be GBP/EUR. Claim and use by30November2026; one per user/device/email/payment account, no combined discounts. The site now publishes it as a **claimable offer**, with no invented generic code, and drops it automatically after expiry. UK-wide eligibility is separate from local attraction destinations.

A hotel campaign advertised in the en-GB affiliate tool was also inspected; it applies to selected **China** hotels, with booking by30November and stays1December2026–28February2027. It was not added as a UK/EU hotel discount. No general accommodation coupon was verified.
