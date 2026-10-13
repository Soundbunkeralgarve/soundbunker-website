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

Create official branded square PNG icons and 1024px App Store artwork from the existing `assets/ticketbunker/ticketbunker-scanner-icon.svg`. Add `icon`, `android.adaptiveIcon` and screenshots in `app.json` before building for stores. Reserve application ID `pt.soundbunker.ticketbunkerscanner` after checking availability; package/bundle IDs cannot readily be changed after release.

## Pre-release checklist
1. Google Play developer account / Apple Developer Program membership approved
2. Verify bundle IDs and generated icons/splash/screenshots, store metadata, privacy-policy URL and age rating
3. EAS Build produces **signed** Android .aab and Apple .ipa; install both on real devices
4. Invite and revoke separate staff accounts using organiser dashboard; test denied access after revocation
5. Paid valid QR admits once; repeat is rejected. Test, old-transfer, refunded, cancelled and wrong-event QR never admit
6. Test interruptions/low signal, denied camera permission, password reset/expiry, torch and long queues
7. First uploads to Google Play internal testing and Apple TestFlight, then request store review

No app store submission is represented as complete until a signed binary is accepted in the appropriate console.
