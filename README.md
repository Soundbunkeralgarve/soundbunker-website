# SoundBunker Algarve - Premium Portal Build

This is the current 17 September 2026 website master with the premium Gift Experiences, Client Area and Community 2.0 update.

## Deploy

1. Extract the ZIP.
2. Upload the contents together so `index.html` remains at the top level.
3. In Vercel, leave Root Directory blank or set it to `./`.
4. Keep the existing production environment variables for Stripe, Supabase, Google Calendar and InvoiceXpress.

## One-time Supabase upgrade

Before testing vouchers or Community 2.0, open the Supabase SQL Editor and run:

`SUPABASE_PORTAL_UPGRADE_17_SEPT_2026.sql`

It creates or upgrades the private voucher, community post, comment and reaction tables. The migration is additive and can be run again safely.

## Voucher flow

- The purchaser chooses an experience and enters the recipient plus a visible From/message line.
- Voucher validity begins automatically on the Stripe purchase date and lasts 12 months.
- Paid voucher data is stored through the Stripe webhook and linked to a matching Client Area account.
- When a client signs in, older paid Stripe gift sessions using the same purchaser email are reconciled automatically.
- The purchaser or recipient can view and print the voucher from My Gift Vouchers.

## Community

Community pages are private to authenticated Client Area members. Members can create chat, collaboration, marketplace, showcase, event and feedback posts, plus comment, like, share and remove their own content. Administrators can moderate all posts and comments.
