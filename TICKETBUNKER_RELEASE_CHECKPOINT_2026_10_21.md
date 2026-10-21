# TicketBunker scanner release checkpoint — 21 October 2026

## Android
- App: TicketBunker Scanner (`pt.soundbunker.ticketbunkerscanner`).
- Version 1.0.1, version code 9, release name `1.0.1 (9) — Offline Hub`.
- Internal testing is active.
- All 10 production/listing/content changes were submitted through Google Play Console.
- Console confirmation: **Changes in review**. Automatic quick checks were still running after confirmation. This is not public availability or review approval.
- Initial production countries: Portugal and United Kingdom. Managed publishing is off.
- Required store listing, content rating, target audience (adult staff), privacy policy, data safety, app access and advertising ID declarations completed.
- Dedicated private reviewer access and a synthetic test-ticket link saved with explicit owner approval. Credentials and signed ticket links must never be copied into this repository.
- Advertising ID is not used; actual build 9 manifest was checked and has no AD_ID permission.
- Only release warning: missing optional deobfuscation mapping file.

## Private demonstration repair
- Assigned private review events remain visible until their explicit test expiry rather than the standard live-event window.
- Offline preparation follows the private test expiry while retaining the existing live-event windows, staff checks and reservations.
- Seven relevant Node tests passed. Database preparation and denial for an unauthorised actor were verified within a rolled-back test transaction.
- The SQL patch is preserved in `SUPABASE_TICKETBUNKER_REVIEW_OFFLINE_WINDOW.sql`. It was already applied.
- The one-off encrypted reviewer-access recovery workflow was removed after use.

## Apple — checked at 20:23 UTC
- Build 10, version 1.0.1: processing VALID; internal and external beta state MISSING_EXPORT_COMPLIANCE.
- `usesNonExemptEncryption` remains null; no encryption declaration is attached.
- Existing App Store version 1.0 remains WAITING_FOR_REVIEW with older build 7.
- Build 10 must not be described as available in TestFlight, submitted for App Store review, approved or live.
- The local Hub payload uses published third-party TweetNaCl encryption; do not declare OS-only encryption. Resolve the export documentation classification and French distribution requirements accurately before clearing compliance.
- Read-only verification: Actions run 39563367630, latest job 119464709899.

## Notifications
The existing release watcher was updated with this baseline. Alert only for new blockers, rejections, approvals, test availability or public release; suppress repeated waiting notices.
