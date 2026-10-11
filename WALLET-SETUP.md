# TicketBunker Wallet activation

Wallet code is installed but remains disabled until both provider credentials and explicit activation flags are configured in the shared ticket API project's production environment. Never put private keys in browser code or this repository.

Apple Wallet:
- APPLE_PASS_TYPE_ID, APPLE_TEAM_ID
- APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_CERT_PEM
- APPLE_PASS_KEY_PASSPHRASE only if applicable
- APPLE_WALLET_ENABLED=true only after an actual iPhone installation test

Google Wallet:
- GOOGLE_WALLET_ISSUER_ID
- GOOGLE_WALLET_CLIENT_EMAIL, GOOGLE_WALLET_PRIVATE_KEY
- The service account must have issuer access; the issuer must have production publishing access.
- GOOGLE_WALLET_ENABLED=true only after an actual save test

Both providers reuse the existing signed QR and transfer generation. The API rejects test tickets, used tickets, invalid signatures, cancelled/refunded orders and ended events. The scanner remains authoritative: an old saved wallet pass may remain visible after a transfer/refund, but its admission code is rejected. This first release does not push visual updates to previously saved passes; users must reopen My tickets and save again after changes.

Apple organiser thumbnails and event strips are embedded only from the project's public Supabase storage, with size, timeout and decoding limits. External artwork is omitted rather than fetched unsafely. Google passes retain artwork and organiser logos as provider-rendered image modules. Native device layouts vary; provided previews are illustrative, not screenshots of an installed pass.

Validation before activation: save one genuine test-owned paid ticket on iPhone and Android; check offline QR display; scan once and reject a repeat scan; transfer and reject the old QR; verify cancellation/refund rejection. Do not email customers or run promotional sends for testing.
