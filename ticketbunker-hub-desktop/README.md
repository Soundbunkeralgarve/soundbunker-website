# TicketBunker Check-in Hub desktop app

The Windows/Mac app includes its runtime. Organisers do not install Node or run terminal commands. It opens the existing local hub control screen, holds an app-suspension blocker while running and confirms before closing. Closing the app preserves the SQLite ledger and cloud reservation; it does not release tickets. Reopening uses the same data folder as the command-line hub: `~/.ticketbunker-hub`. Do not copy or restore an active ledger onto another laptop.

## Organiser flow

1. In the TicketBunker organiser platform, choose **App Downloads**. Install the appropriate desktop release while internet is available.
2. Choose the event and **Open installed hub app**. This opens `ticketbunkerhub://open?event=<UUID>`; no account tokens travel through that link. Sign into the hub with the organiser account, load events, and download the selected event.
3. Follow **Connect your private Wi-Fi**. In the Windows QA build, **Create TicketBunker Wi-Fi** starts a password-protected local access point on a supported Wi-Fi adapter. Scan its Wi-Fi QR with each phone's Camera and approve joining. On Mac, use **Open network setup** to configure Internet Sharing with a suitable separate source connection, or connect the laptop and phones to a private router. The Mac app does not create an automatic offline hotspot. For an existing secured network, enter its name and password to show a join QR. Guest Wi-Fi with client isolation will not work.
4. Allow private-network connections on the laptop if prompted. Open the scanner app, pair each staff phone using its own five-minute QR, and confirm the correct event on every phone. Wi-Fi joining and staff pairing are separate QR codes. Staff should sign into the scanner app before travelling offline. Confirm every required scanner is shown as **Connected**; a downloaded event or a broadcasting hotspot alone does not show the Hub as ready.
5. Keep the laptop lid open, powered, and on the same network. Run a venue rehearsal before opening doors. The app can prevent ordinary idle suspension; it cannot overcome a closed lid, flat battery, failing disk or router, forced sleep, or a lost local connection.
6. After the event, restore internet, finish in the hub and wait for all receipts to upload. Reports remain marked pending until the ownership reservation is released.

With internet, local approvals and automatic cloud uploads run together. With poor or no internet, downloaded tickets still share the same admission ledger. New ticket purchases, refunds and staff changes require an internet refresh to reach the hub. A scanner that loses Wi-Fi contact pauses admissions; it never switches approval authority behind the organiser's back.

### Local network setup and validation

The Hub uses the approved TicketBunker logo and offline-bundled black, white and teal interface. Its dashboard separates the event download, local network, paired scanners and internet sync. Connection illustrations and scanner indicators reflect authenticated local contact; internet sync has a separate status. Fonts, graphics and the logo are bundled locally, without external asset requests.

**Sync tickets & entries** uploads saved check-ins first, then forces a ticket refresh even if the previous download was recent. **Refresh downloaded tickets** also uploads pending entries before refreshing. The dashboard shows the most recent ticket download, check-in upload and number of entries still waiting to upload. Automatic background sync retries while the Hub is open. An internet-sync failure preserves downloaded tickets and durable check-ins; local entry can continue while the offline permit remains valid and the scanners stay connected to the Hub over local Wi-Fi. New sales/refunds/staff changes require a successful internet refresh. A real API response is required before showing internet sync as available; merely opening the software or completing an empty background task does not prove connectivity.

Windows QA packaging builds `network-helper/TicketBunker.Network.csproj` with .NET 8 for Windows 10 build 19041 or later. The self-contained helper uses Microsoft's Wi-Fi Direct legacy access-point API; users do not install .NET. The helper owns only its own network and stops when the Hub exits. Windows Mobile Hotspot and this access point cannot run together. Unsupported hardware, a radio failure or a startup timeout produces a visible error and keeps the existing-network setup available. Network credentials travel over a private process pipe, not command-line arguments, and are not saved in the event database or logs. The helper is currently included in QA builds only, pending physical Windows testing and release signing verification.

Live scanner connection status comes from authenticated pairing, heartbeat and scan requests. A scanner becomes disconnected on the organiser display after 15 seconds without contact. This is a display timeout; a failed scan request already prevents admission immediately. The Hub does not infer working connectivity from an SSID, a downloaded event or QR display. The Wi-Fi join QR uses the SSID/password entered by the organiser and cannot prove they match the actual network. Pairing proves the phone can reach the Hub. Treat the join QR as a network password and hide it after staff have joined.

Before public release, test actual Windows adapters and iPhone/iPad/Android phones: create/join without upstream internet, permit or deny local-network access, check firewall behaviour, scan a ticket simultaneously at two doors, move a phone out of range and reconnect, stop the hotspot, restart the Hub, and verify delayed cloud upload. Repeat a separate Mac Internet Sharing/private-router rehearsal. CI can compile/package the native helper but cannot validate a real Wi-Fi radio or venue coverage.

## Development and verification

Use Node 24.13+ for development only. Install locked production dependencies in `ticketbunker-hub`, then dependencies here:

```sh
npm ci --prefix ../ticketbunker-hub
npm ci
npm test
npm run prepare:resources
npx electron smoke.cjs
npm start
```

`npm run dist` produces a Windows NSIS installer on Windows and Mac DMGs for Apple silicon and Intel on macOS. `npm run pack` creates an unpacked local build. Resource staging explicitly includes the hub source, locked production dependencies and three shared scanner modules. It excludes accounts, ledgers, credentials and tests. Installer removal preserves admission data.

The desktop renderer has no Node integration or preload bridge, is sandboxed, and can request only the loopback control service. The worker uses authenticated encrypted scanner messages over the private LAN. Its startup key is sent over process IPC and never written to logs. A singleton app lock and the existing database lock prevent simultaneous hub processes from owning the same folder.

PR CI builds QA installers (Windows unsigned; Mac ad-hoc integrity signed), tests first-run startup, the sandboxed renderer, Node SQLite and worker IPC in the real Electron runtime on Windows and Mac, and uploads installers as GitHub Actions artifacts. Mac QA images are re-signed after executable/fuse changes and checked with `codesign --verify --deep --strict`, including the app mounted from the final DMG. The native-architecture packaged executable must pass the renderer/SQLite smoke test. QA uses `entitlements.qa.mac.plist` only; signed releases retain `entitlements.mac.plist`. These test builds do not establish Developer ID trust or notarization, and may still require a one-time macOS approval. They must never be described as a signed public release.

## Public desktop release

Merge and deploy the backend, complete a physical multi-phone/router rehearsal, and configure the existing repository's signing credentials before tagging `ticketbunker-hub-v1.0.0` on `main`:

- Mac: `HUB_MAC_CSC_LINK`, `HUB_MAC_CSC_KEY_PASSWORD` (Developer ID certificate); `HUB_APPLE_API_KEY_P8`, `HUB_APPLE_API_KEY_ID`, `HUB_APPLE_API_ISSUER` (notarization).
- Windows: `HUB_WIN_CSC_LINK`, `HUB_WIN_CSC_KEY_PASSWORD` (code-signing certificate).

The tag workflow requires signing, validates the Windows signature and stapled Mac notarization, then publishes all three installers plus checksums and a signed-release marker. The organiser `/api/hub-release` endpoint enables downloads only when that complete published release exists. A failed or unsigned job never enables those download buttons. Retain the release tag and its assets unchanged.

## Scanner store update

The iOS/Android scanner remains the existing `pt.soundbunker.ticketbunkerscanner` app in the existing Expo project. The prepared marketing version is **1.0.1**. EAS remote build numbering with auto-increment prevents repeated CI builds from reusing the same build number. Before the first release, verify that EAS's remote iOS and Android counters are at least the highest numbers already uploaded to each store (`eas build:version:get`, and `eas build:version:set` if needed); local source numbers are not a report of store state.

After backend deployment and device testing, the **TicketBunker Scanner Store Update** manual workflow on `main` builds the requested platform(s). It needs `EXPO_TOKEN` for the existing `soundbunker` Expo account and configured remote signing and submission credentials. iOS targets the existing App Store Connect app **6823316315**. Android targets internal testing. The optional submit switch uploads the **new** binaries to TestFlight / Play internal testing; it does not release them publicly.

An already-submitted binary does not change when source changes. If the current App Store version is still in review, the account owner must decide whether to replace that review submission or release 1.0.1 afterward. No existing submission is withdrawn by this code. After testing, select the uploaded build and complete App Review / Play production rollout in the existing listings. New native SQLite, local-network configuration and encryption code require new signed binaries; there is no OTA-only shortcut. Complete the store encryption/compliance questions against the actual binary before TestFlight distribution.

## Current release status

This source is prepared in PR #51. The production database migration was applied successfully on 19 October 2026 through the same deployment tool after the organiser authorised continuing. Hub table RLS, restricted RPC permissions, ticket guard and attendance-report columns were verified. Unsigned Windows/Mac QA installers and both real Electron startup/renderer checks pass. API/organiser publication, signed desktop distribution and scanner store uploads are separate release steps; record their verified status in the release notes. Real hardware validation remains required before operational use.

## Mac download acceptance gate

The ad-hoc Mac QA packages 1.0.0 and 1.0.1 were withdrawn after a real browser download was rejected by Gatekeeper. Passing `codesign --verify` and direct executable startup is insufficient for distribution. Do not restore those download links or suggest disabling Gatekeeper/removing quarantine.

The manual **Publish Gatekeeper-Verified TicketBunker Mac Hub** workflow runs only from main. It requires the existing Mac signing/notarization secret names, uses Developer ID signing for both app and DMG, notarizes the final DMGs, staples both distribution and app tickets, adds browser-style quarantine to a fresh copy, and requires `syspolicy_check distribution` plus Gatekeeper assessment before artifact upload/publication. A native-architecture packaged startup test also passes before publication. It can publish Mac testing installers independently of Windows signing. It does not activate the complete public desktop release gate.

The same verification script also protects the full signed desktop release workflow. Credentials must be configured through the authorised Apple account and encrypted GitHub Actions secrets; the unsigned/ad-hoc QA workflow cannot substitute for this release gate.
