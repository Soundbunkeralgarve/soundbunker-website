# SoundBunker Events — organiser-owned payments (locked product decision, 9 October 2026)

## Business model
SoundBunker is the event-listing and ticketing software provider, **not the intermediary holding third-party ticket proceeds**. Third-party organisers pay a **one-time, VAT-accounted listing fee** to SoundBunker. SoundBunker takes **0% application fee** on each ticket. Payment processing fees are collected by Stripe directly from the organiser.

Proposed tier prices from product discussion (subject to tax and commercial review): Starter €19/event (up to 100 tickets), Standard €39/event (up to 500), Large €79/event (up to 2,000). Avoid activation of unreviewed tiers and VAT settings.

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
