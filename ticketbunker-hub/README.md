# TicketBunker Check-in Hub

A local check-in authority for several iOS / Android scanner phones on the same private Wi-Fi network. It keeps working when internet is unavailable. The hub, rather than each phone, owns the event’s downloaded tickets and is the only place that can mark them used.

## Event-day setup

1. On a laptop with **Node.js 24.13 or newer**, open `start-mac.command` (macOS) or `start-windows.cmd` (Windows). First-time dependency installation needs internet; complete that before travel. Linux: `npm ci && npm start` from this folder. On subsequent starts with dependencies installed, no installation/network is required.
2. Open the private organiser link printed by the hub. Sign in with the event organiser account, load events, and download the event before losing internet. A working backend deployment is required for this download.
3. Connect laptop and phones to the same private Wi-Fi. A portable router can provide the network independently of venue internet. Guest networks / client isolation may prevent devices from talking; test the actual network before doors open. Keep the laptop awake, charged, and permit inbound TCP 8787 on the private network only.
4. Choose an authorised staff member, label their scanner and show their private five-minute pairing QR. In the new scanner app, choose **Connect to local hub**, then scan it. Each invitation is staff-specific and can pair one phone, with safe retries if the reply is lost.
5. Any paired phone can scan any ticket in the download at any door. The hub records staff member, phone and scan time in a durable SQLite transaction before returning approval. Other phones receive **ALREADY SCANNED**. Internet loss does not change this path.
6. The hub uploads saved entries when internet returns and refreshes new sales / staff access approximately every minute while connected. It shows the exact number still waiting to upload. **Finish event and release tickets** stops local entry first, uploads all saved entries and releases cloud reservations. If internet is unavailable, the hub stays stopped with entries safely stored; retry when connected.

## Guarantees and boundaries

- One hub, one database, one event ticket owner. Phones never fall back to separate cloud / local approvals when the hub is unreachable. They wait for reconnection; independent approval would lose the cross-phone duplicate guarantee.
- Admission is saved before approval. Disk failure, failed authentication, expired permit or an uncertain network reply cannot display a new approval. An unresolved scan is retried with its persisted request ID, so response loss does not consume it twice.
- The database uses WAL with synchronous FULL. Restarting the same hub restores scans, device keys and cloud upload receipts. A lock prevents two hub processes sharing the same data directory. Do not clone / restore the data folder onto a second active laptop. Automatic failover to another independent hub is deliberately not provided; without shared state it could admit duplicates.
- Local messages use authenticated TweetNaCl secretbox encryption with per-device keys, random nonces and request/response identity checks. Local HTTP transport is allowed only by the scanner’s private IPv4 / port allowlist; cloud tokens, passwords and signing keys never go to scanner phones; ticket QR contents travel only inside authenticated encrypted messages. The organiser interface is loopback-only and protected by a startup bearer capability, origin checks and DNS-rebinding Host checks.
- The hub stores its organiser session in its protected data directory (directory 0700, database 0600); passwords are not saved. Protect the laptop account / disk. Pairing QRs and the private organiser link are credentials: do not share screenshots of them. Revoke a phone from the hub screen if it is lost.
- An offline download cannot know about subsequent new sales, refunds, event cancellations or staff revocations until refreshed. The hub’s cloud refresh applies new staff revocations to local paired phones. Earlier legitimate receipts remain uploadable. Refunded/cancelled orders that were admitted from an older snapshot are flagged separately in the organiser report.
- Hub permits follow the existing event entry window, up to 36 hours after event start (private test expiry still applies). Cloud reservations never auto-expire because unsynced entries may exist. Device/hub clock changes fail closed and need a refresh.
- Stored post-event attendance reports refresh after late uploads and stay marked `pending_offline_sync` while any offline hub/lane remains active. Confirmed check-ins are distinguished from final no-show totals. Sales / payment settlement remain independent of attendance. Organiser report reads use keyset pagination rather than silently stopping at the Data API row cap.

## Requirements before release

The live database migration was declined by the database tool without a stated reason earlier in this session. It has **not** been applied through this work, and the hub cannot download live tickets until that is resolved. Do not treat this source update as a production release.

1. Apply the reviewed `../SUPABASE_TICKETBUNKER_OFFLINE_SCANNER.sql` (contains reservations, hub staff attribution and reporting state) and deploy the updated scanner/report APIs together. Keep existing tickets / payments unchanged.
2. Build new signed scanner binaries with TweetNaCl, the local network config plugin and existing SQLite/Crypto modules. A website deployment cannot update existing native app installs. Review App Store encryption declarations for the added application-level cryptography; the old blanket declaration was removed.
3. Test on physical iPhone / iPad / Android phones, the actual event router, laptop sleep / restart, denied local-network permission, Wi-Fi loss, late sales, expired cloud sign-in and upload retries. Check the final cloud report against hub totals and staff audit.
4. Complete store testing/submission. JavaScript exports and simulated scanner clients are not a substitute for those device tests.

## Development

`npm ci && npm test` in this folder runs real HTTP/encrypted scanner-client integration tests with SQLite: simultaneous scans, 20-phone collision, response replay/tampering, hub restart, disk write failure, staff-specific pairing, revoked devices, cloud outages, safe finishing and first-download response loss. Root tests also run the real migration in isolated PostgreSQL and check pagination / reporting reconciliation. Native tests exercise offline SQLite logic separately.

The data directory defaults to `~/.ticketbunker-hub`. `TB_HUB_DATA_DIR` selects another directory for controlled tests. Both the SQLite database and the lock file must stay on the hub’s local disk. This source package runs in the repository because it shares the protocol and public configuration files from `../ticketbunker-scanner-native/lib/`.


For the installable Windows/Mac app, organiser integration and signed release path, see [the desktop app](../ticketbunker-hub-desktop/README.md). The command-line steps above remain available for development.
