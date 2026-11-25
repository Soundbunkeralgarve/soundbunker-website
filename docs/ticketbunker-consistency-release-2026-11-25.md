# TicketBunker consistency release — 25 November 2026

The web branding and local transport fixes were published on 25 November. Buyer, organiser and scanner source now share the dark teal palette, Barlow Condensed / DM Sans fonts, official branding and readable controls. Native Get Around retains actual GPS coordinates, follows foreground movement, preserves explicit city selection, rejects stale requests and distinguishes live predictions from mapped information and timetables.

The buyer's later premium HomeScreen/EventCard changes from `e90de0a` are included in the clean 1.0.1 update source, `c611edd0f9b79829204c84d5c0dc83c04751290e`. This also updates stale Trip.com train-provider assertions and allows stable production version updates in the release checker. App identities, dependency versions, remote build increments and Play internal-testing safeguards are preserved.

## Website and checks

- Website: https://theticketbunker.com/.
- This thread's web release: `7715bb8`, followed by shared native URL compatibility fix in `6bc57ff1`. Its production deployment `dpl_8JU2o4G9ssdM9ZS5dYnnWuDfH3fd` reached READY.
- Later website upgrades were preserved. Current production was independently observed READY at `dpl_CtnaeAgFAmp5pqqGmWQnNRq5B6V1` during the evening check. It was deployed through CLI; this check did not establish its exact Git SHA. No web deployment was performed for the app-only 1.0.1 metadata changes.
- Morning checks: 342 local web tests, including six private integration-probe tests; 29 buyer, nine organiser and 28 scanner tests. Each app passed Expo Doctor 21/21 and both native runtime exports. All seven GitHub workflows on `6bc57ff1` subsequently succeeded, including the scanner test APK and iOS simulator workflows.
- Evening clean buyer 1.0.1 snapshot: 29 tests, identity validation and Android/iOS Hermes exports passed; 39 critical source hashes remained unchanged during export. Organiser's nine tests, both app identity checks and 12 release-configuration checks also passed. Version changes did not alter dependencies. GitHub buyer, organiser and site workflows on `c611edd0` all succeeded.
- No physical-device visual review was performed. JavaScript exports, signed builds, store submission and public availability are separate milestones.

## Signed production builds

All builds below used the existing Expo account and connected repository. Automatic store submission was disabled. These builds were not submitted by this thread.

| App | Platform | Version/build | Expo build ID | Verified result |
| --- | --- | --- | --- | --- |
| Buyer, morning `6bc57ff1` | Android | 1.0.0 / 7 | `ba006aaa-7800-40e5-aa0a-6dbde10706d1` | Succeeded; AAB available |
| Organiser, morning `6bc57ff1` | Android | 1.0.0 / 4 | `28b0964d-98b2-4647-9484-490f7ed9e5a0` | Succeeded; AAB available |
| Scanner, `6bc57ff1` | Android | 1.0.2 / 12 | `9649d46e-cc30-43c0-a0e0-21c1fc76d500` | Succeeded; AAB available |
| Scanner, `6bc57ff1` | iOS | 1.0.2 / 11 | `7eb5d335-a475-4fa2-be50-e9c493f6a9a4` | Succeeded; IPA available; store build-number mapping still unverified |
| Buyer, current `c611edd0` | Android | 1.0.1 / pending | `3e0fb39b-0696-4059-b926-686242d83609` | Queued — Expo Free Tier Queue |
| Organiser, current `c611edd0` | Android | 1.0.1 / pending | `244f6cb7-9fda-48f6-b617-c1139897c1bc` | Queued — Expo Free Tier Queue |

Other sessions produced separate dirty-source 1.0.1 builds. The clean requests above identify the exact reviewed Git source; this thread did not cancel or change those other builds. The Expo dashboard explicitly reported both clean requests waiting in the Free Tier Queue during the evening check. No queue upgrade or new paid plan was purchased.

## Apple and submission limits

- Apple emails verified review completion for buyer iOS 1.0.0 at 16:31 UTC and organiser iOS 1.0.0 at 16:04 UTC on 25 November. Those submissions were made on 24 November, so they do not establish inclusion of today's branding, GPS or later premium UI updates. Public store availability was not independently verified.
- Expo still reported no iOS signing credentials stored for buyer/organiser when the clean update builds were prepared. The saved distribution certificate could be selected, but the only saved provisioning profile belonged to the scanner. No credential association was saved; the buyer/organiser need matching provisioning profiles before their new iOS builds.
- Apple's previously uploaded scanner builds include valid builds 11 and 16. The available report omitted their marketing-version relationship, so a duplicate `1.0.2 (11)` tuple was neither proved nor ruled out. Verify the actual App Store Connect build/version mapping before submitting this IPA; do not treat a successful EAS build as proof of submission eligibility.
- Apple verification was cancelled before completion. No verification code or credential is retained in this record.
- Automatic approval review rejected enabling automatic store submission because explicit approval for that setting was absent. It remained disabled. Do not work around the rejected submission action.
- Earlier GitHub store workflows lacked `EXPO_TOKEN`, and the local CLI was not signed in. The authenticated Expo dashboard allowed the build-only requests without changing authentication settings or exposing tokens.

## KAYAK

Both protected real-browser sandbox searches completed successfully: Flights 8 results/64 options; Hotels 20 results/78 options. Both remained synthetic, non-live and non-bookable. Public production capability remains disabled until the supplier approves production use and provides the required product access/configuration.

The production-access request was already sent by another session at 10:59 UTC on 25 November. An evening mailbox check found no production approval or reply. Do not send a duplicate request.

## Remaining work

Confirm terminal results of the two clean 1.0.1 Android builds, resolve matching buyer/organiser iOS provisioning, verify scanner iOS build/version eligibility and location privacy declarations, then obtain any required submission approval and verify the resulting provider/store status. A completed build alone is not a live app update.
