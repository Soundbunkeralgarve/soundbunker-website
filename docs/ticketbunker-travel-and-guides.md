# TicketBunker catalogue, travel and guides — 23 November 2026

## Current release

- Approved Skiddle affiliate feed: live music, club nights, festivals, comedy, theatre, cinema, families and experiences. Expanded to sport/racing, arts, exhibitions, pub events and seasonal occasions. Accept on-sale, non-cancelled, future listings up to 365 days away. Skiddle's tracked purchase URL remains unchanged apart from its existing affiliate code. Empty categories stay hidden.
- Theatre Tickets Direct: approved Awin catalogue snapshot remains on sale via its tracked links.
- Entradas.com: approved Spain browse links remain separate from dated feed inventory.
- GetYourGuide: existing partner-tagged location widgets and links remain available.
- Viator: Basic production access was enabled on 23 November after completing the customer-service contact. The production key remains a server-only sensitive Vercel secret. The destination-ID repair loaded 450 live products across 15 configured destinations; the public Algarve feed was then verified with 30 Viator offers. This category update adds a bounded free-text limousine search for those same destinations, retaining only explicit limo, limousine, chauffeur or private-transfer products. Results keep the exact returned tracked booking URL and use the standard listing cards. Additional limo inventory and city availability must be checked after deployment; this does not claim complete UK/EU coverage, stretch limousines in every city or native TicketBunker checkout. Buyers book and pay on Viator.
- CORAS: sandbox client only, production locked; native ticket fulfilment has not been activated.

## Listing categories and transport discovery

Viator and Awin listings use a shared, conservative activity-intent classifier. Trusted Awin merchant and product categories take precedence over title inference. Airport/private transfers, limousines and chauffeurs have a dedicated `transfer` category; surf, paddleboard and similar sporting activities join sport. Explicit performances, comedy, music, seasonal events and vessels join their matching categories. Generic walking, food, wine, historical and venue tours stay under days out. A mention of Santa Maria does not make a historic visit a family event, and a cave/grotto alone does not imply a boat trip. Awin musicals are classified as stage shows before music; the generic word “tour” is not a music classifier. Native organiser sports and workshops map to sport and days out respectively; community remains other.

General and limousine searches share one queue of at most four concurrent requests per process. Thirty requests with five-second timeouts fit within eight batches (about 40 seconds); failed transport searches retain successful general products, while failures that return no products are surfaced as a provider failure. Shared successful feed data is cached for 30 minutes, with five-minute retry after a fully failed provider. This leaves headroom for page-level caching under Viator's one-hour maximum search-result cache guidance. This is per-process concurrency control, not a distributed cache.

This is a website/source update. The native app imports the shared category model and receives it on its next build; no App Store or Play Store release is implied.

## Sharing

Native event pages and every discovery card share a public event URL. Feed items have `/listing/<encoded-feed-id>` pages with server-rendered event name, artwork, seller, booking link and social preview metadata. These pages resolve only current records in the real provider feed; arbitrary or retired IDs return 404/noindex. They never accept a supplier redirect URL from the visitor.

WhatsApp, Facebook, native device sharing, copy-link and copy-caption controls work across the two listing types. A 1080 × 1920 Story PNG can be generated, saved and shared with apps that accept files. Cross-origin poster failures fall back to branded event artwork. Instagram posting remains a user action: upload the image and add the public event URL as a Link sticker. No admission QR, booking identifier, ticket token or passenger information enters the sharing model.

## City guides

153 destinations have original short local history, food, shopping and nightlife notes in `ticketbunker-site/city-guide-data/batch-{1,2,3,4}.json`, with primary source URLs and research date. `/city-guides` links to every `/guides/<slug>` page. City landing pages link to their guide. Guides include Maps links, sources, relevant booking directories, sharing, self-contained HTML download and browser Print / Save PDF.

Dining offers are public provider offers, never invented TicketBunker-exclusive vouchers. TheFork links appear only for GB/PT/ES/FR/IT and ask the visitor to check their exact city/date/party. No confirmed voucher is currently configured. `city-guide-benefits.js` requires approval, public distribution permission, destination match, unexpired validity, HTTPS redemption URL and complete terms before a voucher can appear. Do not add NOS corporate codes or prepaid single-use codes here.

## Travel links versus actual sales

`travel-directory.js` contains clearly named ordinary public searches for hotels, rail/coach, car hire, restaurants, chauffeurs and group specialists. These are untracked and currently earn no commission. They do not make an affiliate application approved. The original approved-only gating in `TRIP_PARTNERS` remains intact. Existing city/planner links show who handles the booking and payment.

Standalone flight search links and flight+hotel directory landing pages were removed after the user clarified that they want actual flight sales. Flights should launch through an approved commercial booking integration, not an untracked link advertised as resale.

## Commercial flight and broad travel activation

The user accepts both an on-site booking API and tracked reseller/affiliate booking links. Target: UK/EU travellers, flights, hotels, car hire, trains, days out, races, festivals, music, theatre and seasonal events. Do not imply exhaustive coverage in every city.

1. **Trip.com direct affiliate or Awin EU programme 22403** is the broad first candidate: flights, hotels, trains, activities, transfers, car hire and flight+hotel. No approved account/link was found in connected TB/SoundBunker email. Direct registration currently requires Trip.com sign-in/register and acceptance of affiliate cooperation terms. Registration has NOT been submitted. Use only links/widgets generated for the approved publisher; validate click attribution, device, currency and final seller. Programme rates differ between direct/network routes; check the actual signed account plan rather than promising public marketing rates.
2. **Duffel** is the candidate for native flight sales and branded booking. No account or live key found in connected mail or Vercel configuration. Account/email/business verification and live airline/payment enablement are required. Links uses a fresh session per visitor, supports branded hosted flight/stay checkout, and requires a country supported by Duffel Payments. Confirm Portugal eligibility for the intended current payment product. API supports own interface but requires a complete booking/servicing flow. Prices shown publicly on 23 Nov 2026 are $3/order + 1% Managed Content, plus applicable ancillary, excess-search and FX fees. Reconfirm the actual account's contracted currency/rates before enabling. Customer-card routing requires approval and passes supplier-exact fare; merchant markup has different payment/funding implications. Do not assume it removes pre-funding without confirming the approved payment flow.
3. **Expedia** Travel Creator can monetise eligible hotels, cars and packages after approval, but the current standard commission table shows no standalone-flight commission. TAAP is a travel-agent booking route for flight+hotel+car combinations, subject to its own agency eligibility and terms. Neither account is activated here.
4. **Trainline/Omio**: keep individual supplier approval/tracking verification separate from public search links. Welcome/verification emails for a network are not programme approval.
5. **Sport/racing**: existing approved Skiddle SPORT listings are now accepted. Evaluate additional official motorsport and horse-racing suppliers separately. Motorsport Tickets was excluded: its current public site states ceased trading/preparation for liquidation despite older affiliate pages still being indexed. Do not activate it from stale Awin/marketing information.

A real flight launch must cover live fares, airports and dates, passenger entry, baggage and fare conditions, current total price/taxes, repricing before payment, secure card collection/3DS, atomic booking/payment recovery, PNR/e-ticket confirmation, duplicate protection, order ownership, customer emails, refunds/changes/schedule-change servicing and reconciliation. Never treat a success redirect alone as evidence of ticket issuance. If using hosted reseller checkout, verify which of these responsibilities the supplier contracts to handle.

Only call a priced fare a deal when the route, dates, passenger basis, baggage, taxes/mandatory fees, source and checked time are present. Reprice at checkout; expire stale offers. No real flight fare/deal feed has been enabled in this release.

## SEO

City and partner pages render share metadata and readable content on the server. New planning hubs and all digital city guides appear in the sitemap. Internal links connect city events, travel and guides. No fake Offer, review, availability or discount schema has been added. Robots excludes account/checkout/test/private routes. Search Console connection, sitemap submission/indexing and ranking changes have not been verified. No ad spend or social posting was initiated.

## Sources checked

- https://www.trip.com/partners/index
- https://ui.awin.com/merchant-profile/22403
- https://duffel.com/docs/guides/duffel-links
- https://duffel.com/docs/guides/getting-started-with-the-dashboard
- https://duffel.com/docs/guides/choosing-a-payment-method
- https://duffel.com/pricing
- https://creator.expediagroup.com/commission-terms?locale=en_GB
- https://taapacademy.expediagroup.com/about-taap/why-packages
- https://github.com/Skiddle/web-api
- https://motorsporttickets.com/en

## Regeneration / validation

Run `node scripts/build-ticketbunker-guides.mjs` after changing planning copy or shared header/footer. Run `node --test ticketbunker-site/test/*.test.mjs` and JavaScript syntax / whitespace checks. Deployment root is `ticketbunker-site`, using production Vercel environment variables only for the production rebuild.
