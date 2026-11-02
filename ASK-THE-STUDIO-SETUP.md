# Ask the Studio: website chat + WhatsApp assistant

One AI assistant (Claude) answers clients on the website chat and on the studio WhatsApp,
in whatever language they write. It answers from the site copy and the live price list,
checks real session availability, and hands over to the team when a person is needed.

## How it behaves

- **Website:** an "Ask the studio" button sits bottom-right on every public page. When the
  assistant hands over, the team gets an email with the summary and the client gets a
  "Continue on WhatsApp" button with their request already written.
- **WhatsApp:** the assistant replies to every client message on the studio number.
- **Taking over:** reply to the client from the WhatsApp Business app on your phone as normal.
  The moment you send a message, the assistant goes quiet in that chat for 12 hours
  (`STUDIO_CHAT_HUMAN_HOLD_HOURS`). Each handover email also has a link to hand the chat back
  to the assistant straight away.
- **Handover triggers:** quotes, group/corporate work, discounts, refunds, changing or cancelling
  a booking, complaints, payment/file problems, urgent requests, voice notes and photos, or when
  the client asks for a person. When the assistant hands over it also goes quiet in that
  WhatsApp chat so it never talks over you.
- It never takes payments or confirms bookings; it points clients to the booking form.
- All conversations are saved in Supabase (`studio_chat_threads`, `studio_chat_messages`).

## 1. Website chat

1. Create an API key at https://platform.claude.com (Settings → API keys) and add it in Vercel →
   Project → Settings → Environment Variables as `ANTHROPIC_API_KEY` (Production).
2. Run `SUPABASE_STUDIO_CHAT.sql` once in the Supabase SQL editor.
3. Optional: `STUDIO_CHAT_NOTIFY_EMAIL` (where handover emails go; defaults to
   `BOOKING_NOTIFICATION_EMAIL`, then bookings@soundbunker.pt).
4. Deploy. Until the key is set, the chat says it isn't switched on yet.

## 2. WhatsApp (keeps your existing number and the Business app)

Meta's own developer dashboard cannot connect a number that stays in the WhatsApp Business app, so the
studio number is connected through **360dialog** (a Meta WhatsApp partner) in **coexistence** mode.
+351 964 895 908 stays in the WhatsApp Business app on your phone and you keep replying from it.
Never uninstall the Business app afterwards: that disconnects the number.

1. Sign up at https://hub.360dialog.com and start connecting a number. When asked, choose the option for a
   number that is **already on the WhatsApp Business app** (coexistence). Log in with Facebook, pick the
   **SoundBunker** business portfolio, then scan the QR code shown with the WhatsApp Business app.
2. In the 360dialog Hub, generate the **API key** for the number and save it on this Mac without pasting it
   anywhere else:
   ```bash
   pbpaste > ~/.soundbunker/d360-api-key.txt
   ```
3. In Vercel (project **soundbunker-website-fgmk** → Settings → Environment Variables, Production) add:
   - `D360_API_KEY`: the 360dialog API key
   - `WHATSAPP_WEBHOOK_KEY`: the contents of `~/.soundbunker/whatsapp-verify-token.txt`
   - `STUDIO_CHAT_LINK_SECRET`: the contents of `~/.soundbunker/studio-chat-link-secret.txt`
   Then redeploy.
4. Point 360dialog at the site: `node scripts/set-360dialog-webhook.mjs`
5. On your phone: WhatsApp Business → Settings → Business tools → turn off **Away message** and
   **Greeting message**, so clients don't get both.
6. Message the studio number from another phone to test, then reply from the Business app and check the
   assistant stays quiet in that chat.

Connecting straight to Meta (no partner) still works if you ever move the number off the Business app:
set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`
instead of the 360dialog values, and subscribe the Meta app's webhook to `messages`.

## Costs

- **Claude:** model `claude-opus-5-5` (set `STUDIO_AGENT_MODEL` to change it). The studio
  information is prompt-cached, so a typical reply costs roughly one to three euro cents.
- **WhatsApp:** 360dialog charges a monthly fee per number, and Meta charges per message by category;
  replies to clients who messaged you first have been free in Meta's pricing. Check both before you start.

## Keeping answers accurate

- Prices and availability are read live from the booking system (`api/lib/catalog.js` and the
  admin price overrides).
- Everything else comes from the site copy. After changing page text, run
  `node scripts/build-studio-knowledge.mjs` and deploy, so the assistant learns the new wording.
- Add a line to the privacy policy that website and WhatsApp chats are stored and answered with
  the help of an AI assistant (Anthropic) before switching it on.
