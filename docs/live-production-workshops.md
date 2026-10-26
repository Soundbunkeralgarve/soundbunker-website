# SoundBunker Live Sessions

Private one-to-one, two-hour music production lessons using the existing SoundBunker account. The student works in their own project, joins embedded Zoom on a supported desktop browser, uploads music and returns to tutor feedback and lesson resources after the call.

## Implementation status

Prepared on a feature branch. Not activated on the production website. Database setup has been validated in local Postgres through PGlite, but has not been applied to the hosted database. No Zoom account or credentials have been configured for this feature. Automated tests pass; a real two-person call, hosted storage transfer and browser layout validation remain required. The cloud browser could not reach the local QA server.

The initial booking path is an enquiry followed by tutor scheduling. It does not create checkout payments, send emails, or book external calendars. Decide pricing and service terms before adding a checkout service. No new external subscriptions have been purchased.

## Included

- `/live-sessions` and `live-sessions.html`, linked from Client Area and Studio Control.
- Existing account login with an allowlisted return path; no second student account.
- Tutor-created two-hour lessons assigned to an existing profile by account email; dates shown in the viewer's timezone.
- Server-verified access on every lesson, note, file and join request. Student list queries are scoped to their verified ID. Tutor permissions come from the server-side profile role.
- Server-only lesson tables, private file bucket, short-lived download links and per-object signed uploads. Files are marked ready only after checking stored size.
- Student music/project uploads and tutor resources, including plugin installers. Maximum 50 MiB per file and 50 files per lesson. Larger project folders use the existing My Music workflow.
- Audio playback for compatible formats; downloads for all accepted formats. Project ZIPs and installers are never extracted or executed by the portal.
- Shared notes with question, music-review, tutor-feedback and homework categories. Optional track/version and timestamp. Notes refresh every 15 seconds and can be exported as text.
- Zoom Meeting SDK component view, loaded on join. Server-generated meeting JWT; host authorization uses a fresh ZAK token. The student cannot request a host role or supply a meeting number.
- Private Zoom meeting provisioning on the configured host account; waiting room enabled, join-before-host disabled and automatic recording off.
- Join access from 15 minutes before until 30 minutes after the two-hour slot. This gates issuance of join credentials; it does not forcibly disconnect an ongoing Zoom meeting at that time.
- Full-screen workspace and local device-permission preview. The device preview does not establish that the remote person can hear the microphone.
- Complete course content in `data/production-workshop.json` with preparation, eight timed teaching blocks, exercises, understanding checks, adaptations and homework.

## Configuration

Reuse the existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and server-only `SUPABASE_SECRET_KEY`. Apply `docs/production-lessons-setup.sql` only after inspecting the existing schema and `storage.objects` policies. The new tables revoke `anon` and `authenticated` access and enable RLS; the API uses `service_role` after verifying the user and lesson ownership. Existing broad storage policies must not expose the new `soundbunker-lessons` bucket. Do not make the bucket public.

Set these secrets in the deployment environment; never place them in frontend source:

| Variable | Purpose |
| --- | --- |
| `LESSONS_ZOOM_CLIENT_ID` | Meeting SDK app client ID |
| `LESSONS_ZOOM_CLIENT_SECRET` | Meeting SDK JWT signing secret |
| `LESSONS_ZOOM_ACCOUNT_ID` | Studio Zoom account for server-to-server OAuth |
| `LESSONS_ZOOM_OAUTH_CLIENT_ID` | Server-to-server OAuth client ID |
| `LESSONS_ZOOM_OAUTH_CLIENT_SECRET` | Server-to-server OAuth secret |
| `LESSONS_ZOOM_HOST_ID` | Licensed studio host user ID or email |

Enable the Meeting SDK on the app, configure the allowed website domain/origin as required by Zoom, and grant the server-to-server app the documented permissions for creating host meetings and retrieving that host's user token. All provisioned meetings must belong to the app owner's account. Verify the account's duration and usage limits cover a full two-hour paid session. Review the official current scope requirements during app setup.

The frontend pins the Zoom CDN to `6.10.0`, the npm-published version checked during implementation. Test CDN availability and all vendor assets in the deployed environment; keep the SDK above Zoom's enforced minimum. The browser Supabase client is pinned to `2.57.4` and the server uses the existing repository lockfile.

## Audio and browser constraints

Worldwide zero latency is not possible. Teach by demonstrating and listening in turns. Students hear their own playing locally. Screen sharing is not remote computer control.

Zoom component view targets desktop browsers. Provide the Zoom fallback on mobile or when browser video fails. Both people can share screens in turn; simultaneous dual-screen sharing has not been implemented or tested. Computer audio capture depends on browser and OS. Verify the actual DAW output on Mac and Windows instead of assuming screen sharing includes it.

The optional tutor-set HTTPS studio audio link opens separately. An external high-fidelity player is **not** embedded or synchronized in this implementation. For an all-in-page dedicated audio stream, validate the chosen provider's supported embed/API, permissions and browser behavior before extending the interface. LISTENTO is an option to evaluate, not an installed or purchased integration. Avoid echo and duplicate music paths; test both directions before a lesson.

Plugin downloads are installers for local DAWs, not browser-hosted plugin processing. Distribute only software and materials SoundBunker is entitled to share; use official third-party links when redistribution is not permitted. Test installation and activation outside paid lesson time.

## Provisioning and changes

Room creation first claims the lesson in the database. A concurrent request cannot create a second room. If Zoom times out or the database save fails after creation, the claim deliberately remains set: inspect the host's Zoom meetings, attach the actual room or remove it, then reset `provisioning` through an authorized administrative database change. Do not blindly retry room creation.

Once a Zoom room is provisioned, this initial UI blocks changing its time. Create a replacement lesson and cancel the old one, then manage the old room in Zoom. Cancelling a portal lesson blocks new portal joins; it does not delete the Zoom meeting or invalidate previously issued Zoom credentials. If immediate revocation is needed, end/delete the room in Zoom as well.

Set a retention policy before launch. Pending upload rows count towards the lesson quota; clean abandoned pending objects and rows through an authorized admin maintenance process after the signed-upload validity has expired. There is no automated cleanup, file deletion UI, storage cost cap or virus scanner in this version. Keep tutor-provided software trusted and do not auto-execute downloads. The signed upload token can be valid for two hours; download links expire after five minutes.

## Validation

Run `npm run check` and `npm test`. The lesson tests exercise cross-student access denial, tutor-only controls, hidden room credentials, file-to-lesson binding, server-selected Zoom role and meeting, join windows, filename and size limits, verified note authors, unsafe links, timezone validation and the exact 120-minute curriculum. The initial full suite passed 368 tests.

Before launch, apply the schema and check RLS/grants and storage policies; test with two actual accounts. Verify upload, completion, download, playback, saved feedback and sign-out. Test a full two-hour Zoom session on two computers with both DAWs, both screen-sharing directions, microphone plus music, reconnect, mobile fallback, waiting room and cancellation. Browser layout and real audio latency remain unverified. Recording remains off unless consent, retention and the audio capture route have been agreed and tested.

## Primary documentation

- [Zoom Meeting SDK](https://developers.zoom.us/docs/meeting-sdk/)
- [Zoom authorization](https://developers.zoom.us/docs/meeting-sdk/auth/)
- [Zoom browser support](https://developers.zoom.us/docs/meeting-sdk/web/browser-support/)
- [Zoom component view](https://developers.zoom.us/docs/meeting-sdk/web/component-view/)
- [Supabase signed upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
- [Supabase object info](https://supabase.com/docs/reference/javascript/storage-from-info)
