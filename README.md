# SoundBunker Algarve - Premium Portal Build

This is the current 18 September 2026 website master with premium Gift Experiences, Client Area, Dropbox delivery and SoundBunker Social.

## Deploy

1. Extract the ZIP.
2. Upload the contents together so `index.html` remains at the top level.
3. In Vercel, leave Root Directory blank or set it to `./`.
4. Keep the existing production environment variables for Stripe, Supabase, Google Calendar and InvoiceXpress.

## One-time Supabase upgrade

Before testing vouchers or SoundBunker Social, open the Supabase SQL Editor and run:

`SUPABASE_PORTAL_UPGRADE_17_SEPT_2026.sql`

It creates or upgrades the private voucher, social post, comment, reaction, live-chat, member-profile, presence and profile-image storage setup. The migration is additive and can be run again safely.

If the earlier portal upgrade has already been run, you can run only:

`SUPABASE_SOUNDBUNKER_SOCIAL_18_SEPT_2026.sql`

## Automatic Dropbox client folders

The Client Area creates a delivery folder when the client first has a confirmed, signed-in session. With email confirmation enabled, the client confirms their email first. Existing clients receive one when they next open the Client Area. If an administrator creates the folder while the client is already signed in, the link appears automatically within about 15 seconds; the client can also use **Check my files** immediately without logging out.

Add these Vercel Production environment variables from a Dropbox Developer App:

- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_CLIENT_ROOT` (optional; defaults to `/SoundBunker Clients`)

For a short-lived test token, `DROPBOX_ACCESS_TOKEN` is also supported. When both credential sets are present, refresh-token credentials take priority. Enable `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write`, `sharing.read` and `sharing.write`. Client links are view/download only; clients continue using the existing Dropbox File Request for uploads. If a folder cannot be created, the Admin Dashboard's **Create Dropbox folder** action displays the Dropbox error for diagnosis. Add the confirmed `/client` redirect URL to Supabase Auth's allowed redirects if email confirmation is enabled.

## Voucher flow

- The purchaser chooses an experience and enters the recipient plus a visible From/message line.
- Voucher validity begins automatically on the Stripe purchase date and lasts 12 months.
- Paid voucher data is stored through the Stripe webhook and linked to a matching Client Area account.
- When a client signs in, older paid Stripe gift sessions using the same purchaser email are reconciled automatically.
- The purchaser or recipient can view and print the voucher from My Gift Vouchers.

## SoundBunker Social

SoundBunker Social is private to authenticated Client Area members. It includes live chat with online status, editable member profiles, profile images, bios and creative roles, a searchable social feed, collaboration and marketplace posts, likes, comments and sharing. Gold members display a gold tick. Administrators can add or remove Gold status from the client list and moderate posts and comments.
