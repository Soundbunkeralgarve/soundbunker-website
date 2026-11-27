# TicketBunker app release checkpoint — 27 November 2026

The customer app and TicketBunker For Organisers are publicly available on Apple's Portugal storefront at 1.0.1 (released 25 November). The new 1.0.2 customer/organiser source in this change has not been signed, uploaded or submitted.

## Changes

- Customer: country choice, shared destination search, focused map and precise Near me marker, using the current website's dark/teal typography and controls.
- Organiser: readable long actions, poster processing/error feedback and venue-time editing independent of the phone's timezone, including UK/Portugal DST validation.
- Scanner: scrollable compact-screen permission, reconnect and result states, with safe areas and the existing matching brand.
- Desktop Hub: matching dark surfaces, bundled DM Sans/Barlow fonts and readable controls; separate Mac App Store preparation with sandbox entitlements and a container-owned ledger. Store builds omit privileged Wi-Fi preparation and retain private-network scanner pairing.

## Store evidence and remaining work

- Scanner: public lookup returned no listing on 27 November. Apple status recorded 1.0.2/build16 waiting for review on 25 November, automatic release after approval; email confirms build17 reached TestFlight on 26 November. A current signed-in check is needed to determine the selected production-review build and outcome.
- Hub: Mac1.0.4 signed/notarised testing downloads exist, but the public complete-release endpoint returns available:false. A direct-download DMG is not a Mac App Store package. The separate MAS variant still requires matching development/distribution profiles, signed Mac execution, offline multi-phone acceptance and its App Store record/review materials. No paid price or agreement has been set.
- Google Play distributes Android/Chromebook apps, not this Mac/Windows desktop package. A Windows store listing would be a separate Microsoft Store route; none was created here.
- Actual app-store submission is blocked by incomplete Apple sign-in. The GitHub browser is also signed out; CLI authentication is absent. No new credentials, pricing or paid plan were created.

## Validation limits

Customer:34 tests, Expo Doctor21/21 and Android/iOS Hermes exports passed. Organiser:10 tests (including New York and Tokyo phone timezones), Doctor21/21 and both exports passed. Scanner:28 tests, Doctor21/21 and both exports passed. Hub:25 tests passed. Desktop:19 passed with one Mac-only skip. Website destination search:6 tests passed. The broader website suite returned360 passes and one pre-existing asset-version assertion failure; its expected home.js version predates the current published country/search release, and public-navigation.js also has two existing cache tags. Those unrelated website files were not changed.

No physical iPhone/Android/Mac visual or offline event rehearsal is established by these checks. A signed package, TestFlight upload, production review and public release remain separate milestones.
