# TicketBunker Scanner — mobile app release checklist

## Live web scanner
- URL: https://theticketbunker.com/event-scanner
- Staff must sign in with the verified email invited by an organiser.
- Scanner authorisation is event-scoped. A scan is validated server-side.
- The server rejects duplicate, invalid, refunded, cancelled and transferred-out admissions.
- Requires internet access at the door; offline validation is not currently supported.
- Staff should test camera permissions over HTTPS before doors open.

## App branding
- App name: TicketBunker Scanner
- Short name: TB Scanner
- Publisher: SoundBunker Algarve, Sociedade Unipessoal Lda
- Suggested category: Business
- Short description: Secure ticket scanning for event door teams.
- Full description: Scan TicketBunker event QR tickets securely with your phone. Invited door staff can sign in, access their assigned events, validate one-time admission, and identify tickets that have already been used. Organisers control staff access from TicketBunker. A network connection is required during admission.

## Google Play
- Google Wallet issuer approval is NOT Google Play Console developer approval.
- Verify an organisation developer account is active in Play Console.
- Build a signed Android App Bundle (AAB) under a stable application ID. The current PWA manifest is not a Play submission artifact.
- If using a Trusted Web Activity, configure HTTPS Digital Asset Links for the app signing certificate and package.
- Provide 512x512 icon, screenshots, feature graphic, support details, privacy-policy URL, data-safety responses, target-SDK compatibility and content-rating answers.
- Upload to internal testing before submitting to production. Confirm background/foreground camera operation, authentication persistence, QR response latency, permission handling, screen wake behaviour, and staff access revocation.
- Check whether the account is subject to Google Play closed testing requirements. New personal accounts can require 12 testers continuously for 14 days; this is not automatically applicable to organisation accounts.

## Apple
- The Apple Developer Program organisation enrollment was submitted 11 October 2026. Membership must be active before App Store Connect release setup.
- Build an iOS app with clear scanner-specific native utility and camera permission; a website-only wrapper risks rejection under guideline 4.2.
- Configure bundle ID, signing, icons, privacy details, support and review credentials.
- Test on an actual iPhone with TestFlight before App Review.

## Release gate
Do not claim store availability or enable broad distribution until signed builds are uploaded, reviewed where applicable, and complete admission/transfer/revocation tests pass. The web scanner stays available throughout.
