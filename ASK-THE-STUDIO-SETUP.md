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

This uses Meta's WhatsApp Cloud API in **coexistence** mode, so +351 964 895 908 stays in the
WhatsApp Business app on your phone and you can keep replying from it.

1. The number must be on the **WhatsApp Business app** (not personal WhatsApp), up to date.
2. In https://business.facebook.com make sure SoundBunker has a Meta Business portfolio.
3. In https://developers.facebook.com → My Apps → Create app → type **Business** → add the
   **WhatsApp** product.
4. WhatsApp → API Setup → **Add phone number** → choose to connect your existing WhatsApp
   Business app number, then follow the QR-code step in the app on your phone.
5. Create a permanent token: Business settings → Users → System users → add one (Admin) →
   Generate token for this app with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
6. Add to Vercel (Production):
   - `WHATSAPP_TOKEN`: the system user token
   - `WHATSAPP_PHONE_NUMBER_ID`: from WhatsApp → API Setup (the ID, not the phone number)
   - `WHATSAPP_APP_SECRET`: App settings → Basic → App secret
   - `WHATSAPP_VERIFY_TOKEN`: any long random text you make up
   - `STUDIO_CHAT_LINK_SECRET`: another long random text (signs the "hand back" links)
7. Redeploy, then in the app: WhatsApp → Configuration → Webhook:
   - Callback URL: `https://www.soundbunker.pt/api/whatsapp-webhook`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to **messages** and **smb_message_echoes** (the second one is how the assistant
     knows you've replied from the app).
8. Send a test message to the studio number from another phone.

## Costs

- **Claude:** model `claude-opus-5-5` (set `STUDIO_AGENT_MODEL` to change it). The studio
  information is prompt-cached, so a typical reply costs roughly one to three euro cents.
- **WhatsApp:** Meta charges per message by category; replies to clients who messaged you first
  have been free in Meta's pricing. Check the current rates in WhatsApp Manager.

## Keeping answers accurate

- Prices and availability are read live from the booking system (`api/lib/catalog.js` and the
  admin price overrides).
- Everything else comes from the site copy. After changing page text, run
  `node scripts/build-studio-knowledge.mjs` and deploy, so the assistant learns the new wording.
- Add a line to the privacy policy that website and WhatsApp chats are stored and answered with
  the help of an AI assistant (Anthropic) before switching it on.
