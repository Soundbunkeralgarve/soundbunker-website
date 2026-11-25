# TicketBunker account bookings

Implemented 25 November 2026. `/my-tickets` now provides All, TB tickets and
Partner bookings views. Native admission controls remain attached to TB tickets.
Partner records show the booking provider, reference, date, destination and
supplier link, with optional private PDF/JPEG/PNG confirmation uploads (2 MB).

## Supplier coverage and confirmation

`ticketbunker-site/partner-booking-suppliers.js` identifies the suppliers used by
current event, travel, hotel, restaurant, transfer and group searches, including
the merchants behind Awin links. The manual form also accepts Other supplier.
Registry inclusion does not activate a feed or change affiliate approval.

Signed-in outbound supplier visits are saved as unconfirmed links, without
changing their original tracking URLs. Existing links are deduplicated per
account and exact URL. Customers can add their own purchase reference and file.
No customer action creates a supplier-confirmed state or a TB admission ticket.

| State | Evidence and account wording |
| --- | --- |
| `saved` | Supplier visit or saved details; booking unconfirmed |
| `customer_added` | Customer reports purchase or uploads confirmation; Added by you, not verified by supplier |
| `provider_confirmed` | Reserved for a trusted future supplier integration; Confirmed by supplier |
| `cancelled` | Reserved for trusted supplier cancellation evidence |

Automatic supplier purchase/cancellation synchronization is **not enabled** by
this release. Individual partner permissions, an opaque account-to-referral
mapping, verified booking events and appropriate reconciliation are required
before enabling it. Clicks, uploaded files and affiliate approval alone do not
prove a completed purchase. Supplier admission, changes and refunds remain with
the original provider. KAYAK and Aviasales are comparison routes, so account cards
use "Booking provider" rather than claiming that every route is the final seller.

## Backend and privacy

`/api/partner-bookings` is proxied by TicketBunker to the existing authenticated
SoundBunker service. Every action uses a server-verified, email-confirmed user ID
and an ownership filter. Customer requests cannot set owner, confirmation status,
verification source or storage path. Verified supplier records cannot be edited
by customers. Manual saves retain a request ID across retries.

The additive schema is in `ticketbunker-partner-bookings-schema.sql` and was
applied to the existing SoundBunker Supabase project. RLS permits an authenticated
customer to read only their records; direct customer writes and anonymous reads
are revoked. The storage bucket is private and has no customer storage policy.
Downloads require API ownership checks and receive a 60-second signed URL.
Existing storage policies were inspected and are scoped to other buckets.

Account switches discard in-flight web responses; native account lists are
keyed to the authenticated user. Partner service failures leave TB tickets usable.
Removing a saved partner record removes its private file and does not cancel the
supplier booking. Account deletion procedures must remove any remaining private
files under the customer's bucket prefix before deleting their auth identity.

## Verification and release scope

- Live rollback-only SQL checks verified RLS ownership, anonymous denial, denied
  customer writes and private bucket configuration without retaining fixtures.
- Backend tests cover ownership, forged confirmation fields, tracking attribution,
  idempotency, upload signatures/limits, private downloads and concurrency.
- Website tests cover partner/native rendering, existing refund flows, account
  switch races and all current generated supplier search URLs.
- Buyer app source includes the same distinction and supplier records. This does
  not update an already installed or store-published native app; it needs its
  normal build and release process.
- Browser preview could not connect to the local QA server. No signed-in visual
  browser validation is claimed.
