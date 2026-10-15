# TicketBunker Scanner — native iOS + Android
Native React Native/Expo camera application (NOT a WebView). Uses the same TicketBunker server-side scanner endpoints as the existing web app. No private signing keys or Supabase service-role credentials are shipped to phones.

## Features
- Real camera QR scanner, torch and coloured admission results
- Existing verified TicketBunker/SoundBunker user sign-in
- Secure encrypted local session storage (iOS Keychain / Android Keystore)
- Event-scoped staff authorisation and invite acceptance
- Server-authoritative one-time ticket entry; duplicate, cancelled, refunded, transferred-out and wrong-event tickets are denied
- Manual QR URL fallback
- No offline admissions; this is intentional to prevent double-scanning and stale access

## Run / test
```bash
cd ticketbunker-scanner-native
npm install
npm test
npx expo start
```
Test on physical Android and iPhone cameras. The app retrieves the public Supabase client configuration only from `https://theticketbunker.com/api/supabase-config`, and posts signed-in requests to existing `/api/event-staff` and `/api/event-scan`. It does not use any buyer/admin credentials.

## Build and store submission (needs your own developer accounts)
```bash
npm install --global eas-cli
eas login
eas init
eas build --platform android --profile preview
eas build --platform ios --profile preview
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit --platform android --profile production
eas submit --platform ios --profile production
```
Apple Developer Program organisation enrollment must become active before signing and App Store Connect submission. Google Play Console organisation registration is distinct from Google Wallet. EAS needs Expo authentication and per-platform signing setup; **there are no accounts, keys or EAS project IDs in this repository**.

The approved scanner icon is generated as `assets/icon.png` at 1024px by `npm install` and is already configured for iOS and Android in `app.json`. Store screenshots are still required. Reserve application ID `pt.soundbunker.ticketbunkerscanner` after checking availability; package/bundle IDs cannot readily be changed after release.

## GitHub simulator build
The **TicketBunker Scanner iOS Simulator Build** workflow builds the exact `TicketBunkerScanner` app scheme and verifies its bundle ID and executable before uploading it. A missing app fails the job. The artifact contains `ticketbunker-scanner-ios-simulator.tar.gz`; extract it to preserve the `.app` bundle's executable permissions and symlinks.

This is an unsigned Debug build for a Mac's iOS Simulator, with Metro required for JavaScript. It is not an iPhone-installable IPA or a TestFlight upload. Physical iPhone distribution still requires Apple signing and the production build steps above.

## Pre-release checklist
1. Google Play developer account / Apple Developer Program membership approved
2. Verify bundle IDs and generated icons/splash/screenshots, store metadata, privacy-policy URL and age rating
3. EAS Build produces **signed** Android .aab and Apple .ipa; install both on real devices
4. Invite and revoke separate staff accounts using organiser dashboard; test denied access after revocation
5. Paid valid QR admits once; repeat is rejected. Test, old-transfer, refunded, cancelled and wrong-event QR never admit
6. Test interruptions/low signal, denied camera permission, password reset/expiry, torch and long queues
7. First uploads to Google Play internal testing and Apple TestFlight, then request store review

No app store submission is represented as complete until a signed binary is accepted in the appropriate console.
