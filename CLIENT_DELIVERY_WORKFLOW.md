# Client music delivery

Finished songs belong in the client's **My Music** folder, including its project subfolders.

- The admin uploader queues a readiness email immediately after upload completes.
- Direct Dropbox uploads are detected by the production minute cron at `/api/client-delivery-reconcile`.
- Each file revision has one durable notification and one email idempotency key. Retrying a failed scan or email does not create another message.
- Client uploads are treated as incoming session material and do not announce a finished song.
- Existing music is baselined when this workflow is enabled. New folders receive their watcher before being exposed as ready, so their first upload is captured.
- Clients sign in with a verified email. Downloads and playback stay locked while the account has an outstanding studio balance or requires a billing review. Uploads remain available.
- Payments reuse the original InvoiceXpress invoice and Stripe balance checkout. Only confirmed, signed payment events unlock access; the return URL cannot unlock a file.
- Public music-folder and ancestor links are revoked. Playback and downloads use short-lived Dropbox file links issued after a server-side balance check. Photos retain their existing workflow.

Apply `SUPABASE_CLIENT_DELIVERY_PAYMENTS.sql`, `SUPABASE_CLIENT_DELIVERY_NOTIFICATIONS.sql`, and `SUPABASE_CLIENT_DELIVERY_SECURITY.sql` before deploying the matching code. Keep the existing Stripe webhook and production `CRON_SECRET`, Dropbox and Resend configuration. The cron has server-only authorization and does not require a separate ChatGPT scheduled task.

For support, inspect `sb_delivery_watchers.last_error` and the server-only `sb_delivery_notifications` outbox. Sends with an uncertain result older than the provider's idempotency window are held for review rather than automatically resent. A legacy booking without an issued invoice stays locked until the studio prepares its invoice.
