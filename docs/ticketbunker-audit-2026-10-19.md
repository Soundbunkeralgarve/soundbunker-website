# TicketBunker audit — 19 October 2026

## Scope and evidence

Reviewed all 16 HTML entry points in the canonical ticketbunker-site directory, shared scripts, local navigation/assets, and the signed-in SoundBunker organiser workspace and owner controls. All 16 page requests and the events, public configuration and scanner-store endpoints returned HTTP 200. The events endpoint currently returns no bookable public events. App Store availability remains false and the download stays inactive.

Browser-reviewed organiser areas: overview, event list/create, ticket options, reports, scanner crew, guest lists, capacity, street team, branding, business/billing details, verification and promotion. Buyer ticket loading completed and showed the expected empty account. The scanner returned the expected no-active-assignment message. Demo cards and ticket/email design previews remain clearly labelled and isolated from purchases.

## Changes

- Routed all TicketBunker help/refund contacts to bookings@theticketbunker.com.
- Replaced stale global booking/payout-unavailable claims with event/account eligibility wording. Refund rights and amounts were preserved.
- Replaced SoundBunker-specific organiser copy and fixed the organiser-benefits homepage link.
- Added actionable billing-review guidance without asking organisers to repeat completed Stripe checks.
- Ran independent billing and Stripe status reads concurrently, shared concurrent Stripe status reads, and bounded portal requests.
- Allowed sign-in configuration to recover from a temporary fetch failure and preserved safe return destinations through account verification.
- Clarified incomplete ticket and missing checkout-reference states without generating a QR or polling with an invalid reference.
- Displayed already saved ticket types before adding more, with correct event currency and a route directly to review.
- Added hero-image preload, styled the promotion country selector, and handled organiser hash navigation.
- Clarified promotion requests and inclusive pricing language.

## Checks

25 canonical frontend/gateway tests passed. Added behavioral regressions for incomplete ticket links, absent/malformed checkout references, server-confirmed paid status and sign-in recovery/concurrency. All canonical frontend JavaScript passed node --check. Local asset and navigation references passed, including documented rewrite/dynamic-route exceptions. git diff --check passed.

## Live-test blocker and limits

Production owner controls report the dedicated Stripe account, payment webhooks and paid booking as configured. SoundBunker shows Stripe verified but its owner billing/tax declaration has not been recorded. No declaration, payment, listing-fee charge, transfer, refund, promotional send, or payout was executed by this audit. A real paid purchase, issued ticket, email delivery, wallet addition and successful/duplicate scanner check remain to be verified after the organiser is cleared and an actual event is published. Desktop browser UI was inspected; a physical iPhone/Android camera and wallet test remains necessary.
