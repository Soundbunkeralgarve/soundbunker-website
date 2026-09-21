# SoundBunker Algarve - Premium Portal Build

This website package includes premium Gift Experiences, Client Area, Dropbox delivery, SoundBunker Social and the 21 September Hub Academy redesign.

## Hub Academy design update

The homepage Academy feature and the full `/hub-academy.html` page now use the editorial colour system, club panels and patch motif from the supplied school proposal and Creative Clubs leaflet. The two PDFs are reference material only and are not embedded or linked on the site. Academy photography was extracted from the supplied leaflet; the Academy badge and original SoundBunker and Hub Culture logos retain their existing artwork.

## Deploy

1. Extract the ZIP.
2. Upload the contents together so `index.html` remains at the top level.
3. In Vercel, leave Root Directory blank or set it to `./`.
4. Keep the existing production environment variables for Stripe, Supabase, Google Calendar and InvoiceXpress.

## One-time Supabase upgrade

Before testing vouchers or SoundBunker Social, open the Supabase SQL Editor and run:

`SUPABASE_PORTAL_UPGRADE_17_SEPT_2026.sql`

It creates or upgrades the private voucher, social post, comment, reaction, live-chat, member-profile, presence and profile-image storage setup. The migration is additive and can be run again safely.

For the updated client files and admin assignments, also run `SUPABASE_DROPBOX_CLIENT_FOLDERS_18_SEPT_2026.sql` and `SUPABASE_CLIENT_DELIVERIES_21_SEPT_2026.sql`. Both are safe to rerun. Run them before deploying this version so the admin dashboard can read the new folder links.

If the earlier portal upgrade has already been run, you can run only:

`SUPABASE_SOUNDBUNKER_SOCIAL_18_SEPT_2026.sql`

## Automatic Dropbox client folders

The Client Area creates one folder for each client, with `My Music` and `My Photos` subfolders. With email confirmation enabled, clients confirm their email before signing in. Existing clients receive the two subfolders in their existing folder when they next open the Client Area. Administrators can also add them from the dashboard. Clients can browse/download their files and upload directly to each private subfolder. Uploads use 2 MiB chunks with no total file size cap in the website; Dropbox account quotas still apply.

Add these Vercel Production environment variables from a Dropbox Developer App:

- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_CLIENT_ROOT` (optional; defaults to `/SoundBunker Clients`)

For a short-lived test token, `DROPBOX_ACCESS_TOKEN` is also supported. When both credential sets are present, refresh-token credentials take priority. Enable `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write`, `sharing.read` and `sharing.write`. Shared folder links are view/download; the signed-in upload control sends files through the website to the account's own Dropbox subfolder. Add the confirmed `/client` redirect URL to Supabase Auth's allowed redirects if email confirmation is enabled.

## Admin and sessions

An admin who signs in through `/client` is taken directly to `/admin`. The one-page dashboard lists clients, booking records, folder links, project/gallery assignment and vouchers. Assign a delivery by entering a title and an HTTPS share link under the correct client. The client dashboard displays those assignments and also exposes the full Dropbox subfolders.

Manage Sessions links clients to the booking flow and a prefilled WhatsApp conversation with the studio. The page explains the 24-hour deposit rule. A booking move is arranged by the studio; this build does not automatically change a paid Stripe booking or Google Calendar event. The booking list on the admin page shows records already in the existing `bookings` table; this build does not backfill Stripe or calendar bookings into that table.

## Voucher flow

- The purchaser chooses an experience and enters the recipient plus a visible From/message line.
- Voucher validity begins automatically on the Stripe purchase date and lasts 12 months.
- Paid voucher data is stored through the Stripe webhook and linked to a matching Client Area account.
- When a client signs in, older paid Stripe gift sessions using the same purchaser email are reconciled automatically.
- The purchaser or recipient can view and print the voucher from My Gift Vouchers.

## SoundBunker Social

SoundBunker Social is private to authenticated Client Area members. It includes live chat with online status, editable member profiles, profile images, bios and creative roles, a searchable social feed, collaboration and marketplace posts, likes, comments and sharing. Gold members display a gold tick. Administrators can add or remove Gold status from the client list and moderate posts and comments.
