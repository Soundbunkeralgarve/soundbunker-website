# TicketBunker release — 11 October 2026

## Released scope
- Standalone TicketBunker site with real SoundBunker/Supabase account authentication, verified-email access, draft event tools, artwork, tiers, staff and promoter links.
- No browser-local demo accounts or fabricated sales. Public inventory excludes test/internal/draft/ended events. Existing real accounts and private drafts are retained.
- Featured price (€59 / £49 plus tax), request link, event-based email preview and consent controls.
- Clean printable QR ticket with TicketBunker and promoter marks, event image, holder/reference, ticket conditions and SoundBunker company footer.
- Durable refund requests, reviewed separately from actual Stripe refunds. Existing secure ownership transfer rotates QR signatures.
- Post-show snapshot at ends_at + 12 hours via the active Supabase pg_cron job `ticketbunker-post-show-reports`; every minute, idempotent, published non-test events only. Portal shows snapshot independently from settlement reconciliation.
- Payout figures remain unset until reconciliation. Fast payout is not described as purchased unless payment is verified. Arrival is shown only from a Stripe-confirmed date.

## Live payment activation still required
The connected Stripe plugin exposes account acct_1SZVCbAZnbtxEFga in test mode only. Existing shared SoundBunker ticket payment handlers also contain explicit disabled-sales gates. No paid sales, instant payout or promotional campaign has been falsely enabled or sent.

Existing ticket charge code uses direct charges. The requested post-show release requires a deliberately implemented and tested Connect flow, e.g. separate charges and transfers with platform liability and funds availability controls. It is not safe to switch all SoundBunker payouts to manual because that account also services studio bookings. Complete live Connect platform and organiser onboarding, use server-derived prices, signed webhook verification and idempotency, and reconcile each event before release. Refunds must reverse associated transfers when applicable and invalidate admission; disputes require reserves/hold handling. Never assume a long card authorisation can last until an event.

Report and settlement tables are ready but no Stripe settlement ingestion/automatic payout worker has been enabled. The schema prevents invented paid states without Stripe references, but live Stripe webhook/reconciliation integration must populate the settlement ledger. Proposed fast price is Stripe's instant fee at cost (indicative 1%, no TicketBunker markup); confirm current country pricing and eligibility before checkout. Do not charge fast fees before eligibility or promise bank receipt exactly 12 hours after a show.

Before sales activation, verify the live key/account, connected-account capabilities, charge model, platform balance policy, regional holding limit, webhook endpoint/signing secret, reconciliation, refund/reversal paths, instant availability and a complete controlled payment-to-payout test. Use the existing backend secret store; do not embed keys in frontend code.

## Email and account activation checks
The existing premium mailout pipeline verifies payment metadata/amount/currency/live mode, requires a published event, records provider campaign ID and handles send retries. It is still gated by EVENTS_MARKETPLACE_PAYMENTS_ENABLED, EVENT_PREMIUM_PAYMENTS_ENABLED and EVENT_PREMIUM_MAIL_AUTOSEND_ENABLED. Keep gates off until live paid-event fulfilment is tested. No mailing list was contacted during this release. Root email template now uses the real TicketBunker event URL, PNG wordmark, promoter branding and company address.

Verify the Supabase Auth redirect allowlist includes https://theticketbunker.com/login and allowed query variants before using production email verification/reset links. Settings are not exposed by the connected Supabase tool. No fake users were created to bypass this check. Existing verified users can sign in with their normal password.

## Verification
- Gateway authentication, method allowlist, test visibility, end-time requirement and recoverable failure tests.
- Payout formatting tests: unknown amounts stay pending; unpaid fast selection does not claim paid service; verified amount/arrival display.
- SQL transactional checks: report due at 12 hours, future reports excluded, repeated runs idempotent, test events excluded; temporary fixtures rolled back.
- Scheduler execution confirmed successful. Tables use RLS with no public/client grants; Edge API verifies JWT email and event ownership.
- Live visual browser QA is not available in this execution environment. HTML assets/DOM hooks, JavaScript syntax and HTTP endpoints are checked. Complete a real verified organiser sign-in, transfer, print-layout and payment test before declaring the whole product bug-free.

## Rollback anchors
TicketBunker previous deployment: dpl_2N57bjok9Ei16Yv8JJ7yx7zmrDW3.
SoundBunker previous deployment: dpl_9GSZEuDSoxRGix19GXjHZrwa4fCC (26a3ddcc67f99b4e230a7702dd43db4c243b75e1).
Database changes are additive. Do not drop report/refund tables; disabling the named cron job is sufficient to pause reporting without deleting records.
