# The TicketBunker (`theticketbunker/`): fan app (iPhone, iPad, Android)

The theticketbunker.com experience as a native Expo / React Native app: find events, plan the night, get to the venue and show your tickets at the door. It is set up the same way as the door scanner in `../ticketbunker-scanner-native` (Expo SDK 57, React Native 0.86.3, EAS profiles, Keychain/Keystore session storage).

## Screens
- **Discover**: "Book it. Head out." / "Your night out, sorted." The home screen has search by place, date (tonight, this weekend, next 7 days) and type, plus Near me, browse by type, popular places and a mixed "On soon" list. The live count shows every listing on sale.
- **Places**: all 153 city pages from `ticketbunker-site/city-places.js`, grouped by country and searchable. Near me lists the three closest cities. The map uses Leaflet and OpenStreetMap, the same as the site, so it needs no maps API key. Pins come from `city-coords.js`.
- **City / results lists**: our events plus partner listings, soonest first, with date and type filters. On iPad and tablets (≥ 768 pt wide) the list sits on the left and the chosen event on the right.
- **Event detail**: every partner listing says "Sold by <seller> · fees may apply". TicketBunker events say "no booking fee". **Get tickets** opens the partner's page (with our tracked link) or the existing TicketBunker checkout at `/event/<slug>` in an in-app browser. The screen also has Add to My trip and Share.
- **Get to the venue**: Walk, bus/train/metro, Uber, Citymapper (in cities where it runs) and the Tube map (London), from `get-there.js`. "How far is it from here?" works out rough walking and taxi times on the phone. The rough distance calculation runs on the device; opening a route or nearby transport search sends coordinates to the selected map/transport provider or TicketBunker for that request.
- **Get around**: nearby mapped transport, connected operator departure feeds and provider route searches use the same current sources as the website. Coordinates are shared for the requested nearby lookup; background location is blocked.
- **My trip**: the night planner from the site. Steps are tickets, getting there, travel, a bed, food and things to do. Partners not yet approved show "Coming soon". Saved on the phone only.
- **My tickets**: the TicketBunker sign-in from the website (Supabase, publishable key only), `/api/my-event-tickets`, and each ticket with the same door QR as the ticket web page. Apple Wallet appears on iOS and Google Wallet on Android.

## Shared code with the website
`metro.config.cjs` watches `../ticketbunker-site`, and `lib/site.js` imports the site's own `discovery-model.js`, `get-there.js`, `trip-partners.js`, `city-places.js`, `city-coords.js` and `gyg-box.js`. A change to listing rules, directions or partners on the site therefore reaches the app on its next build. `lib/planner.js` mirrors the plan logic of `night-planner.js`, because that file also drives the site's dialog and cannot load outside a browser.

Data comes only from the live site: `/api/partner-feed?city=`, `/api/events`, `/api/my-event-tickets`, `/api/event-ticket` and `/api/event-wallet`. The app contains no sample or demo events.

## Run and test
```bash
cd theticketbunker
npm ci
npm test
npm run doctor
npx expo run:ios       # simulator (LANG=en_US.UTF-8 for pod install)
npx expo run:android   # emulator
```

## Release (Steve)
- Store records (created 22 Nov 2026): App Store Connect app 6837950372 · Google Play app 4976172756937096556 (Play developer account 8835832747595155098).
- Store text, privacy answers and App Review notes are in `STORE-LISTING.md`.
- iOS and Android always ship together, with the same `version` in `app.json` (tests check this).
- The bundle ID and package are `pt.soundbunker.theticketbunker`. Reserve them before the first upload.
- The existing EAS project is `0027b9f4-e08e-4887-93b6-44f7bc8552b7`, owned by `soundbunker`; `eas.json` already points to App Store Connect `6837950372`. Preserve these identities and existing signing access.
- Store builds need `EXPO_TOKEN`, or use the scanner's local signing route.
- Before App Review:
  - **Account deletion:** done in the app (Delete my account opens a deletion case in Support admin). Complete each one within 30 days and email the person, as the app and the privacy policy (terms#app-privacy) promise.
  - **Privacy labels:** foreground coordinates are sent to TicketBunker and map/transport providers for nearby transport and routes; do not describe location as device-only. Update location disclosures using the platform definitions and the actual provider retention before submission. The email is used for sign-in.
  - **App Review login:** give App Review a buyer login that has a valid ticket.
