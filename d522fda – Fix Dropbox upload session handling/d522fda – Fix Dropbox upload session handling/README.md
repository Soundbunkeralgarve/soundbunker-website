# SoundBunker Algarve — Studio Control build

Updated 22 September 2026 from the current Premium Portal master. The existing Hub Academy redesign, Gift Experiences, SoundBunker Social, Dropbox folders and website assets remain in this ZIP.

## Included

- /admin: Google Calendar upcoming sessions, website booking ledger, move approvals, client records, folder manager, projects, VIP discounts, service settings, client updates, vouchers and prize code generation.
- /client: own bookings and move proposals, private member inbox, notifications, music and photo delivery, vouchers and Social.
- /redeem: signed-in clients redeem purchased gift experiences and one-use prize codes using their account email. Studio Starter, Session Pro and Pop Star offer their exact purchased experience as the first booking choice, fully covered by the voucher; gift value can also be used towards another service, with unused value retained. The two Junction prizes match the supplied PDFs: one-hour recording (up to three songs, mixed and mastered), or 30-minute team photoshoot (10 edited images). Admin prints each code onto the original two-page PDF in its redeem box and downloads it immediately; repeat PDF download and booking-link copy are available in the register. Codes expire one calendar month after the quiz date entered by Admin. Free redemptions confirm directly; partial payments use Stripe.
- /mixing-mastering: prominent VAT-inclusive prices, direct online booking and a link to the private My Music file upload. Paid recording sessions have a two-hour minimum; the one-hour Junction prize is a separate voucher exception. Photography uses the studio's 10:00, 13:00 and 16:00 weekday starts, with the published weekend slots subject to availability.
- Homepage: genuine five-star Google review highlights with the actual overall rating/count, when a Google reviews API is configured.

## Deploy in order

1. Extract the ZIP and place all contents at the Vercel project root so index.html is at the top level.
2. If not already run, apply SUPABASE_PORTAL_UPGRADE_17_SEPT_2026.sql, SUPABASE_DROPBOX_CLIENT_FOLDERS_18_SEPT_2026.sql and SUPABASE_CLIENT_DELIVERIES_21_SEPT_2026.sql in Supabase.
3. Follow ADMIN_SETUP_ORDER.txt in Supabase before deploying. It lists the portal, Dropbox, client deliveries, and admin SQL in dependency order. The admin dashboard now shows available sections while identifying database sections still missing.
4. Keep existing Supabase, Dropbox, Stripe, InvoiceXpress and Google Calendar Production variables. Verify the Stripe webhook still points to /api/stripe-webhook and subscribes to checkout.session.completed.
5. For email alerts, set RESEND_API_KEY, NOTIFICATION_FROM_EMAIL (a verified sender) and optionally ADMIN_NOTIFICATION_EMAIL (defaults to steve@soundbunker.pt). RESEND_FROM_EMAIL is supported as a sender fallback. Failed move alerts are flagged in admin with Retry email.
6. For 15 live review highlights, configure GOOGLE_BUSINESS_ACCOUNT_ID, GOOGLE_BUSINESS_LOCATION_ID, GOOGLE_BUSINESS_REFRESH_TOKEN, GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET. Your Google Cloud project needs Business Profile API access and owner OAuth consent. Alternatively use GOOGLE_PLACE_ID and GOOGLE_MAPS_API_KEY with Places API (New), which supplies at most five individual reviews.
7. Deploy. Test a new paid booking, move approval, file upload notification, direct message, generated prize PDF, signed-in redemption and gift voucher in a test environment. Keep the api/_prize_templates folder when deploying.

## Important operating details

- Admin access depends on profiles.role = admin; client actions use Supabase authentication.
- Older Stripe transactions are not automatically imported into the new booking ledger. Manually created Google Calendar sessions are visible in the separate upcoming calendar panel.
- Clients propose a different day more than 24 hours before their original session; acceptance updates the existing Google event and retains the deposit. Inside 24 hours they need a new booking and deposit.
- The studio calendar must be connected to confirm a dated free voucher booking. A confirmed calendar failure releases the code; an uncertain response is kept for admin review so the recipient cannot accidentally double-book.
- In /admin → Vouchers & prizes, enter the quiz date and select the matching prize. The original Junction voucher is downloaded as a two-page PDF with its unique code printed on the supplied code line. The embedded QR on your supplied artwork leads to /redeem, where winners create an account or sign in. Gift recipients enter purchased gift codes at the same page.
- Creating a project through the admin form or a direct subfolder of My Music/My Photos through the admin folder manager registers it in the client's dashboard and attempts a portal and email notification. Uploading a file through the admin console also attempts both notifications and reports the outcome. Changes made directly in Dropbox do not trigger website notifications. The client can use Refresh my files or reopen the portal to see newly registered projects; email needs the Resend variables and a verified sender.
- VIP discounts apply to the full session total and reduce the remaining balance when the normal deposit still covers today's payment. VIP codes cannot be combined with gift/prize vouchers.
- An individual client update is emailed when Resend is ready; all-client updates are portal notifications.
- Service changes update the booking selector, mixing price cards and checkout. Review other fixed marketing prices elsewhere on the site separately after changing a price.
- File uploads use 2 MiB chunks; the site adds no arbitrary total size cap. Dropbox quota and provider limits still apply.
- Existing Dropbox shared links can be viewed by anyone holding the link. Authenticated portal/admin controls do not revoke previously shared links.
- Confirm gift voucher invoice and tax treatment with the studio accountant before relying on redemption reports.
- The reviews section selects genuine five-star reviews while displaying Google's true overall rating and count. It does not assert 15 unless 15 qualifying reviews are returned.
