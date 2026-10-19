# Organiser verification release — 11 October 2026

New and existing SoundBunker clients keep their existing verified login. After creating their organiser profile, uploading their logo and saving company billing details, they are prompted to validate their account. A permanent Validate your account navigation item and Business details button let current users resume at any time.

POST /api/organiser-connect accepts only the onboarding action. Account IDs are derived from the authenticated owner. Stripe hosts identity, banking and agreement collection. Account creation uses a stable organiser idempotency key; resuming reuses the stored account. Only live credentials are allowed in this production flow. The endpoint does not create charges, transfers or payouts.

Accounts v2 recipient configuration, Express dashboard and application-owned fees/loss responsibility support the requested future separate charges and transfers model. The platform owner must complete Connect platform activation and accept responsibility in Stripe. Code must not accept that acknowledgement or user KYC on their behalf.

Verification is retrieved from Stripe on login, return and manual refresh. It requires a live compatible account, active transfer capability and enabled bank payouts. A return URL never proves completion. The account flag is updated independently of tax review and event publication approval. Ticket checkout, listing-fee checkout and payouts remain disabled; no status flag here overrides those gates.

Deployment: set EVENTS_CONNECT_ENABLED=true in the existing SoundBunker backend production environment, retain the existing STRIPE_SECRET_KEY, and deploy both that backend and ticketbunker-site from main. api/supabase-config exposes only enabled/live booleans for runtime verification; never expose secret values.

Before enabling ticket sales or automated releases: configure a dedicated signed Connect event destination for verification changes, check fresh Stripe capability state before financial operations, complete reconciliation and post-show transfer/refund workers, and verify end-to-end with the owner's real account. Current onboarding status is refreshed on demand; background Stripe event synchronization is not enabled by this change.

Business details save fix: normalize public website formats (including http and pasted slash mistakes) to HTTPS, keep errors alongside the form, clear stale publication notices on navigation, and update the account name without invoking a full dashboard/payment refresh. Saving company details never calls event publication.

Validation: 15 focused backend tests and 12 frontend/service tests pass. No fake account or financial transaction was created. Owner completion of the hosted Stripe journey remains necessary.

Live incident follow-up: the owner’s first attempt returned Stripe `non_connect_platform_accounts_v2_access_blocked`. Connect platform access is therefore not yet confirmed. The portal now checks access with a read-only Accounts list request before offering onboarding, displays a blocked state instead of repeating “Not started”, and shows Connect setup/platform-profile links only to authenticated platform admins. Owner completion in the live Stripe Dashboard remains required if access is still rejected. Never work around a rejected platform by changing liability or creating fake accounts.

Account creation and reads use `2026-09-30.endive`, the current stable version verified at https://docs.stripe.com/api/versioning. Account Links retain `2026-09-30.preview` as documented at https://docs.stripe.com/api/v2/core/account-links/create?api-version=preview. Other payment pins and webhooks are unchanged.

The heading is “Set up your account.” Existing accounts with a saved logo and billing details return to Overview, with an explicit verification status and navigation option. New organisers continue from saved billing details to business and bank verification. Empty setup panels and the duplicate validation step have been removed. No completed account is forced through the account-creation wizard again solely because Stripe is unavailable.


## Embedded organiser verification — 19 October 2026

The TicketBunker organiser portal now mounts Stripe’s account-onboarding embedded component instead of redirecting to a hosted Account Link. The owner-authenticated `embedded` action creates a short-lived Account Session for the saved recipient account, enabling account onboarding and bank collection only. IDs and component permissions cannot be selected by the browser. Stripe authentication and its agreement collection remain enabled; authentication can open a Stripe window. A component exit always triggers a fresh server-side capability check and never means verification succeeded.

Set the dedicated `TICKETBUNKER_STRIPE_PUBLISHABLE_KEY` to the public key of the same TicketBunker live account. The studio keys remain separate. The official MIT-licensed @stripe/connect-js 3.4.6 pure loader is vendored with its license; it loads Connect.js directly from Stripe on demand. No identity or bank fields pass through TicketBunker. The older `onboard` endpoint remains for clients loaded before deployment, while the current portal exclusively uses embedded sessions. No financial feature gates are changed by this release.


## Registration and welcome email release — 19 October 2026

Registration requires the authenticated owner’s confirmed email. A database trigger queues one personal welcome only after Stripe verification and the platform billing/tax review are both complete. No registration or Stripe-only welcome is sent. The worker rechecks fresh Stripe readiness, the approved profile, logo, verified owner and saved billing name before sending. Messages use the trusted auth owner address, The TicketBunker sender and bookings@theticketbunker.com reply address. The concise welcome is signed Steve and confirms organiser name, country, currency, sign-in email and billing name without including tax IDs, identity documents or bank details.

The service-only mail queue uses unique organiser/kind jobs, row-locked claims, a frozen payload and a stable Resend idempotency key. Retryable failures back off; ambiguous attempts older than 23 hours require review rather than risking a duplicate outside the provider window. Completion of the owner billing review attempts delivery immediately; the protected five-minute cron retries queued messages. Provider acceptance is stored separately from actual delivery.

The portal, scanner help and welcome email display an inactive App Store coming-soon badge. The working mobile scanner link and Safari/Chrome home-screen instructions remain available. Activate an App Store link only after the real listing exists.

The production payment, listing and settlement flags have been enabled for the dedicated TicketBunker account. Per-organiser billing review, fresh Stripe readiness, event publication/listing payment and post-show reconciliation gates remain enforced. SoundBunker completed Stripe verification; its owner billing/tax review is still pending. No payment, transfer or payout was executed during this release.

Validation: 42 focused tests passed. The wider suite has 222 passing tests and the same 14 failures reproduced on the previous local baseline (no newly failing tests); those failures include older beta wording and stale fixtures.

The owner-requested SoundBunker preview was delivered to the verified owner address before the final-only email instruction. Its accepted record prevents a second automatic welcome.
