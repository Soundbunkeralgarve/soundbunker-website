# TicketBunker For Organisers: organiser app (iPhone, iPad, Android)

Organisers can create, publish and run their TicketBunker events from a phone. The app uses the same account and APIs as the web portal at theticketbunker.com/organiser. Its setup copies the fan app (`../theticketbunker`) and the door scanner (Expo SDK 57, React Native 0.86.3, EAS profiles, session stored in Keychain/Keystore).

## What it does
- **Sign in:** the same organiser login as the website. New organisers are sent to the website to create their profile. That is where name, country, logo, billing and Stripe verification are set up, because Stripe's own onboarding runs there.
- **My events:** Live, Drafts and Past tabs, pull to refresh. A banner shows what is left before the account can sell tickets. On iPad and the open iPhone Duo, the event list sits beside the chosen event.
- **Create an event:** in three steps.
  1. Details: name, category, venue, town, headline act, start and end times in venue local time, full information, and a poster chosen from photos or the camera. The poster is resized on the phone to fit the 2 MB limit.
  2. Ticket types: name, price including VAT/IVA, and quantity. Only rows with a price are saved, as on the web portal.
  3. Review: shows the listing-fee band (from `ticketbunker-site/pricing-rules.js`), any discount offer or prepaid bundle, then **Pay listing fee** and **Publish**.
- **Event dashboard:** paid tickets, gross revenue, door check-ins, no-shows or not-yet-scanned, guest passes, and card/cash door sales from `/api/event-organiser-report`. It also has share link, copy link, view page, ticket types, and edit details and poster.
- **Door staff:** invite by email, and revoke staff or pending invitations. Staff scan with TicketBunker Scanner, and the app can open it.
- **Guest list:** give artists free passes on a ticket type, retry emails, and revoke access.
- **Website only for now:** postponing, cancelling, refunds, payout choices, promoters (street team), branding and billing. The app links to each.

The web portal (`organiser-v2.js`) is a classic browser script that can't be imported, so its checks are copied into `lib/organiser.js` and covered by tests. Listing-fee bands are imported from the site's own `pricing-rules.js`.

## Run and test
```bash
cd theticketbunker-organiser
npm ci
npm test
npm run doctor
npx expo run:ios
npx expo run:android
```

## Release (Steve)
- Store records (created 22 Nov 2026): App Store Connect app 6837950804 · Google Play app 4974060826560110726 (Play developer account 8835832747595155098).
- iOS and Android always ship together, with the same `version` in `app.json` (tests check this).
- The bundle ID and package are `pt.soundbunker.theticketbunker.organiser`. The home-screen name is "TicketBunker For Organisers" (`expo.name`).
- Store text, privacy answers and App Review notes are in `STORE-LISTING.md`.
- The existing EAS project is `c3c754ba-b9e9-4b76-a679-88c310f87d7e`, owned by `soundbunker`; `eas.json` already points to App Store Connect `6837950804`. Preserve these identities and existing signing access. Store builds need the existing `EXPO_TOKEN`.
- **App Review risks:**
  - **Listing fee:** it is paid through Stripe Checkout, opened from the app in a browser sheet. It is a business service fee for real-world events, which Apple's guideline 3.1.3 normally allows outside In-App Purchase, but say so in the review notes. If Apple objects, change the button to open theticketbunker.com/organiser instead.
  - **Account deletion:** done in the app (Delete my account opens a deletion case in Support admin). Complete each one within 30 days and email the person, as the app and the privacy policy (terms#app-privacy) promise.
  - **Demo login:** App Review needs an organiser account with a published event.

## Brand update validation — 25 November 2026

The native interface now uses the published website’s Barlow Condensed headlines, DM Sans body text, premium dark palette, official wordmark and teal pill controls. Static font files are bundled with their SIL Open Font License notices and source URLs in `assets/fonts/`. No runtime font download is needed.

Validation passed: 9 existing organiser tests, Expo Doctor 21/21, and Android/iOS JavaScript/Hermes bundle exports on Expo 57.0.34. These checks did not create signed app binaries or submit anything to either store; no on-device visual review was performed.

The initial store version remains `1.0.0`; EAS uses remote build numbering and production `autoIncrement`. After publishing the exact source commit, dispatch `.github/workflows/ticketbunker-mobile-release.yml` with `upload: false` for signed builds only, or `upload: true` for the existing TestFlight/Play internal upload route. The workflow builds buyer and organiser apps for both iOS and Android.
