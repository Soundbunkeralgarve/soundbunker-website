# Guest lists and capacity

Organisers use Guest Lists to reserve a quota on an existing ticket type for a DJ or band. Artists sign into /guest-list using the verified invited email. Names issue one complimentary order and standard QR ticket, then send the branded email. Failed emails are explicitly retryable; retrying never issues another ticket. Revoking artist access releases unused places and hides their list from the artist, but issued passes remain valid. The organiser can retry delivery of already-issued tickets after revocation.

Unused active allocations are deducted from inventory and checked alongside live checkout reservations under the tier row lock. Guest passes have zero value and are separated from paid reporting. QR scanning checks current order status and transfer generation.

Capacity notifications are in-app, with a five-minute Postgres cron check. Thresholds are 80%, 95%, and 100%; notifications are deduplicated per event/capacity/threshold. Counts include paid orders, pending checkout reservations and unused guest allocations. Historical notifications show the capacity when raised; the capacity page shows current availability.

An organiser quotes and confirms a larger quantity for a selected tier. Within the already paid listing band it is applied without charge. Paid changes use a dedicated immutable quote, Stripe Checkout, and a signed webhook. Only a matching verified payment releases the increase. Webhook retries are idempotent. Stale or cancelled-event payments become needs_attention for reconciliation, without changing capacity. Upgrades are capped at 2,000 total places. Verified charity exemptions cover the maximum band.

## Release

Database migration order: guest-list-schema.sql, guest-list-existing-functions.sql, capacity-schema.sql. These are one-time migrations, already recorded remotely as ticketbunker_artist_guest_lists_capacity_upgrades.

Existing Resend sender, signing secret, and standard authentication are reused. No credentials are stored in this repository.

Payment collection stays disabled. The capacity checkout requires ALL of EVENTS_MARKETPLACE_PAYMENTS_ENABLED, EVENT_LISTING_PAYMENTS_ENABLED and EVENT_CAPACITY_PAYMENTS_ENABLED to equal true. Do not enable those until the overall payment launch and the platform Stripe webhook are approved and verified. Existing ticket/listing checkout hard stops are preserved. The shared stripe-webhook endpoint handles event_capacity_upgrade. No billing happens automatically on a threshold alert.

The database's service-only functions are not public/client RPCs. New tables have RLS and no client grants or policies, deliberately.

## Verification

Run node --experimental-vm-modules --test test/guest-capacity.test.mjs and the existing events, email and wallet tests. test/guest-capacity-schema.sql runs rollback-only integration assertions for quota reservation, ownership, artist scope, duplicate issuance, scans, revocation, difference quotes, payment matching, paid upgrade retries and notification deduplication. No live email or Stripe request is made in these tests.
