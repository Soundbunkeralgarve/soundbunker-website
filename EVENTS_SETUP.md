# SoundBunker Events — pre-launch checklist

## Status
Feature branch only. No example events or tickets published; do not merge without testing.

## Organiser marketplace: revised payment policy (9 October 2026)
**Locked decision:** For third-party events, SoundBunker charges only an upfront event-listing fee, no per-ticket platform commission. Ticket buyers pay the organiser's own Stripe connected account (Connect direct charges), and Stripe pays out to organisers according to its schedules. SoundBunker does **not** collect, hold, transfer or manually pay third-party ticket proceeds. See [EVENTS_CONNECT_MODEL.md](EVENTS_CONNECT_MODEL.md).

**The current events v1 checkout still charges the SoundBunker platform account, so it is NOT approved for third-party organisers.** Do not enable externally organised events or claim that direct payouts are implemented until organiser onboarding, merchant routing, Stripe Connect event webhooks and separated listing-fee checkout are complete and tested. The existing route may be used for SoundBunker-owned events after normal testing only.

## Database
Review and apply SUPABASE_EVENTS_SETUP.sql to the **SoundBunker Algarve** Supabase project, not Crude City. All four new tables have RLS enabled; customer orders and QR tickets have no anon/authenticated grants. Reserved inventory is atomically checked with row locks. Ticket admission atomically records the first valid scan.

## Environment (Vercel)
Existing variables: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, NOTIFICATION_FROM_EMAIL, SITE_URL.

**Add EVENT_TICKET_SECRET**: independent cryptographically random value, at least 32 characters. Add separately to preview and production environments; keep the value stable after issuing tickets, because changing it invalidates existing links. Do not commit it or paste it into chat.

Stripe existing webhook must receive checkout.session.completed and checkout.session.async_payment_succeeded to /api/stripe-webhook.

## Features
- /events public event listings and price/availability
- /events-admin.html create draft events, add ticket types, publish
- Stripe-hosted payment for paid ticket orders (max 8 per checkout)
- Signed QR links emailed via Resend only after paid webhook confirms matching Stripe session, currency and amount
- /event-ticket.html ticket display and QR
- /event-scanner.html admin-authenticated phone camera scanning and duplicate blocking
- Homepage Events navigation and promotion

## Before live tickets
1. Confirm existing Stripe webhooks are correctly configured, do not change other booking payments.
2. Check events tables/functions and database security advisors.
3. Configure EVENT_TICKET_SECRET and verify email domain and template.
4. Test preview: create draft, add tier, publish, check sell-out capacity with parallel checkout attempts, complete a Stripe TEST purchase, check exactly one ticket per quantity, scan once, scan twice and verify rejection, verify forged QR rejected.
5. Test refunded/failed/abandoned checkouts and delayed Stripe events, and verify cancellation/hold timeout.
6. Test email re-delivery and multiple door scanners, plus camera access on iPhone and Android.
7. Test checkout and pages on mobile; ensure actual event artwork/organiser/venue.
8. Only then merge and enable production sale. Free events, refunds, CSV export, door staff roles, offline check-in, promo codes and promoter accounts are **not** implemented in v1.

CAUTION: Preview points to production ticket QR domain unless SITE_URL and the generated QR host are coordinated for test; do not sell on preview. Ticket QR depends on browser-loaded QRCode and scanner libraries; vendor/pin these dependencies before launch. Stripe test payments must never be treated as real admission.
