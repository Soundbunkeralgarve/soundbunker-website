# SoundBunker Events — organiser-owned payments (locked product decision, 9 October 2026)

## Business model
SoundBunker is the event-listing and ticketing software provider, **not the intermediary holding third-party ticket proceeds**. Third-party organisers pay a **one-time, VAT-accounted listing fee** to SoundBunker. SoundBunker takes **0% application fee** on each ticket. Payment processing fees are collected by Stripe directly from the organiser.

**Current launch focus (9 October 2026):** small independent events up to 2,000 tickets, with no public festival packages yet. BETA proposed listing tiers: Starter 1–100 tickets sold £49/€59; Standard 101–500 £59/€79; Event Plus 501–2,000 £149/€179. Bigger festivals and bespoke Festival Pro are deliberately deferred until later. GBP and EUR prices are set separately; appropriate tax applies. **Stripe is the payment processor:** buyers pay for tickets through the organiser's own connected Stripe merchant account; Stripe deducts its card payment processing fees from each transaction and pays the resulting balance out to the organiser on their Stripe payout schedule. SoundBunker/ticketBunker NEVER holds ticket revenue, takes a per-ticket commission, or adds a buyer-facing platform fee. The standard Stripe bank payout is not itself assumed to carry an extra charge; optional Instant Payout can have additional fees and eligibility restrictions. Flat listing charges go separately to ticketBunker. Tier upgrades require explicit approval and only the fee difference. The prototype currently has disabled checkout; no third-party sales are live or promised.

## Payment architecture
1. Organiser creates a SoundBunker profile with event/brand information. Free draft permitted.
2. Organiser completes Stripe-hosted Connect onboarding. Use Stripe's **Accounts v2** Merchant configuration if supported. Require `defaults.responsibilities.fees_collector = stripe`, `defaults.responsibilities.losses_collector = stripe`, with full Stripe Dashboard access where appropriate and supported. Do **not** silently fall back to platform liability. Eligibility and capabilities must be confirmed in Stripe.
3. Save organiser's verified Stripe connected account ID against their authenticated SoundBunker organiser record. Never trust an account ID supplied by a buyer or client-side form. Stripe handles identity and bank detail collection; we only store account identifiers, state and authorised metadata.
4. Organiser picks the listing tier, configures event, and pays a **separate** Stripe Checkout session on the **SoundBunker platform account** for the listing fee. Use separate type e.g. `event_listing_fee` in payment metadata. Publish only after a verified successful fee webhook and eligible Connect status, plus organiser/legal checks. Store idempotent listing fee payment record keyed to Stripe session.
5. Ticket buyers use Stripe Checkout as a **direct charge on that event organiser's connected account**, by using the `Stripe-Account` request header for session creation. Do **not** set `application_fee_amount` or transfer destinations. Funds land in the organiser's Stripe balance, NOT SoundBunker's Stripe balance.
6. Set up Connect event webhooks and always validate signature and connected-account context (`event.account`) against the actual event/order merchant. Continue capacity reservation checks, idempotent fulfilment, and issue QR tickets ONLY after matching confirmed paid direct charge. Ordinary platform webhook cannot be assumed to receive all connected-account events. Adapt the current fulfilment code accordingly.
7. The organiser owns refunds, cancellations, disputes, customer-payment tax records and Stripe payout preferences. Support self-service links to Stripe Dashboard/embedded components; provide event attendees with organiser contact and support escalation. Track refund/dispute webhooks so voided or refunded tickets cannot be scanned.
8. Standard bank payouts and eligible Instant Payouts are managed by the connected organiser/Stripe, **not SoundBunker**. Never promise instant settlement, availability of funds on the same day, or guaranteed bank transfer timing. Stripe determines funding delay, holds, eligibility and pricing.

## Why this matters
With direct charges, organiser is merchant of record and pays processing fees. If Stripe takes connected-account negative-balance responsibility (confirm explicitly), the platform avoids automatically becoming liable for organiser refunds/disputes, but still has its own liabilities. See:
- https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted
- https://docs.stripe.com/connect/accounts-v2/connected-account-configuration
- https://docs.stripe.com/connect/risk-management
- https://stripe.com/pt-pt/connect/pricing

## Payout timing requirements — added 9 October 2026
Product intention: organisers should receive their ticket funds through their **own** connected Stripe account and bank. SoundBunker never collects event ticket sale revenue. The requested standard payout service is initiated after an event has ended, with bank receipt several business days later; optional paid fast payout targets **bank arrival the next day after the event** (subject to eligibility), not just payout initiation.

**Critical feasibility restrictions**:
1. Stripe direct charges usually release funds on the connected merchant's payout schedule relative to payment date, NOT the event date. A post-event payout requires a manual payout schedule or other Stripe-approved controlled payout mechanism.
2. Stripe manual payouts have a maximum holding period of 90 days for Portugal. Events sold more than 90 days in advance cannot have all ticket proceeds held to the event date using ordinary Stripe manual payouts. We must not promise event+1 bank receipt until an approved compliant design handles advance ticket sales.
3. Platform controls for accounts with a full Stripe Dashboard allow payout scheduling but may not prevent organisers from initiating manual payouts themselves. Full payout control requires approval from Stripe. The event-specific ledger must handle multiple overlapping events per organiser; Stripe balance is account-wide.
4. Stripe Instant Payouts require eligible connected accounts and payout destinations, positive instant-available balance, and payout limits. They typically reach bank accounts within ~30 minutes but are not guaranteed. Stripe Connect publishes a 1% cost for Instant Payouts. Any SoundBunker uplift needs confirmed permissions, transparent pricing and testing. Do not charge an upgrade unless fast payout eligibility is verified.
5. Fallback for an ineligible or unavailable fast payout is a normal standard payout and prompt refund of any upsell fee.
6. Stripe-hosted full onboarding, organiser tax compliance, processor responsibility, refunds, cancellations and chargebacks stay part of the design. Avoid falsely labelling the ordinary account as escrow; Stripe explicitly does not provide escrow accounts.

Shotgun context: its published Portugal 2024 10% fee was paid by the ticket buyer, not necessarily deducted from organiser proceeds. At 500 tickets x €20, illustrative buyer-facing Shotgun fee is €1,000, subject to current contract details and pricing. Shotgun documents default initiation 24h after event, bank receipt normally 2–3 business days later. Never claim organiser has an automatic 10% organiser commission without a current contract.

Reference: https://docs.stripe.com/connect/manual-payouts ; https://docs.stripe.com/connect/platform-controls-for-stripe-dashboard-accounts ; https://docs.stripe.com/connect/instant-payouts ; https://support-pro.shotgun.live/hc/en-us/articles/31170525215122-Make-your-first-transfer

## International launch / UK festival promoters (9 October 2026)

Global scope: event discovery can operate worldwide. Prioritise UK and Portugal organiser pilots; enable paid ticket sales only in countries where supported by Stripe Connect and local regulation. Organiser country, event venue country and payout country are distinct.

- Direct charges remain the desired flow: each promoter is the merchant of record and receives funds into their own Stripe connected account. No proceeds enter SoundBunker's Stripe balance. Check whether Portugal-based Stripe platform can onboard and route direct charges to UK merchants with the selected Accounts v2 configuration before enabling their sales.
- Support GBP and EUR and, later, other supported currencies. Store currency per event ticket tier and order. Do not hardcode EUR, make all money calculations exact in minor units, and handle country-specific tax/invoicing on listing charges.
- Store event country, venue address and the venue's IANA timezone (Europe/London, Europe/Lisbon etc). Multi-day events have distinct start/end times. Tickets, emails and scanning must show the actual local venue time including DST.
- UK festival promoters can be an individual or registered business where Stripe permits. Stripe KYC must be completed through its hosted onboarding. Do not require Portuguese NIF for all UK organisers; use appropriate country-specific identifiers and compliance.
- Festival-scale requirements: capacity much higher than 2,000 tickets, multiple simultaneous gates, reliable atomic scan validation, staff roles, offline capability with safe synchronisation, weekend passes, day passes, camping add-ons, timed slots, age policies, wristband/re-entry control, refund and cancellation workflows, reports, multiple ticket types, peak load testing, organiser self-service.
- UK festivals and licensed live music/alcohol events require proper venue and organiser permissions. The organiser is responsible for obtaining applicable licences; ensure appropriate organiser declaration, terms and legal review before selling tickets.
- Promoter pitch: one fixed listing price, zero SoundBunker ticket commission, buyer pays the promoter's Stripe account directly. Stripe's own payment and payout fees remain visible.
- Do NOT market guaranteed event+1 bank payouts until the country-specific Stripe payout controls, 90-day holding limits, accounts eligible for instant payouts, and early ticket sales are properly addressed. The ordinary direct-charge schedule releases relative to payment date unless specifically changed.
- User's business hypothesis: UK independent festivals and other regional promoters could benefit substantially; start by recruiting a small pilot cohort and validate outcomes.

Source references:
https://stripe.com/gb/connect/pricing
https://docs.stripe.com/connect/accounts-v2/connected-account-configuration
https://docs.stripe.com/connect/direct-charges
https://docs.stripe.com/connect/instant-payouts
https://www.gov.uk/find-licences/premises-licence
https://www.gov.uk/guidance/admission-charges-to-cultural-events-vat-notice-70147

Current Events v1 is **Portugal-only, EUR-only, not an external promoter marketplace**, and does not implement offline scanning or UK event payouts. Do not present these as live features.

## Compliance
Stripe KYC verification is not bypassable. Collect/display the organiser's legal name, country and required tax details; for Portuguese taxable organisers this may include NIF/NIPC and invoicing/IGAC obligations. Tax and event licensing rules require Portuguese professional review. Distinguish the organiser's ticket invoices from SoundBunker's listing-fee invoices. Terms must clarify who sells/admisses/refunds tickets.

## Existing v1 implementation and migration
**IMPORTANT: Current feature branch is NOT a live organiser marketplace.** The existing `api/event-checkout.js` and `api/stripe-webhook.js` charge the **SoundBunker Stripe account**. Retain that checkout pathway **only for SoundBunker-operated events**. Do not enable third-party publishing or claim 0% ticket commission until direct-charge routing, verified onboarding and Connect webhooks are implemented and tested. Organiser display name is NOT a payment destination.

Next build stage:
- Add organiser profiles, verification status and Connect connected-account ownership in Supabase with RLS.
- Add per-event listing-fee orders, paid/expired/refund statuses, and publish gating.
- Add explicit event merchant ownership (`soundbunker` vs `connected_organiser`) and server-side payout destination; prevent merchant changes after paid ticket sales.
- Separate ticket Checkout route for connected organisers using Stripe-Account; connect-specific webhook verification, cancellation/refund void logic.
- Adapt admin/UI to allow self-service organiser publishing and login.
- Test with **Stripe TEST mode** accounts, £/€ customer pricing, fee charges, checkout merchant, successful/failed/expired payments, fraud/race conditions, QR issuance, refunds, disputes and payouts.
- Nothing touches production money until those tests pass.

This specification reflects the user's choice to avoid handling ticket revenues and payout remittances. Do not redesign back to separate charges and transfers without explicit approval.
