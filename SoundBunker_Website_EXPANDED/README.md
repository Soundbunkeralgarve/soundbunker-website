# SoundBunker Algarve website

Trilingual, mobile-first website for SoundBunker Algarve. The public site works immediately. Online payment, live availability, calendar creation and invoicing activate when the private environment variables are added in Vercel.

## Expanded service pages

The homepage links to dedicated pages for recording, bespoke music production, mixing and mastering, remote voiceover and remote sessions, photography, and experiences and parties. All six pages support English, Portuguese and French and include a booking area.

Important: keep the `api` directory and its `lib` subdirectory intact. They contain the future Stripe, Google Calendar and InvoiceXpress automation.

## Deploy to Vercel

Important: extract the ZIP first and deploy the complete folder. Do not select only the HTML, CSS and JavaScript files. This repaired package also keeps the public images at the top level for safer manual uploads.

1. Create a private GitHub repository and upload the complete contents of this folder.
2. In Vercel, select **Add New → Project**, import the GitHub repository and click **Deploy**. Leave Framework Preset as **Other**. No build command or output directory is required.
3. Add the private values listed in `.env.example` under **Project Settings → Environment Variables**. Never put real keys in `.env.example` or commit them to GitHub.
4. Redeploy after adding or changing environment variables.
5. In Stripe, add the production webhook `https://YOUR-DOMAIN/api/stripe-webhook` and subscribe to `checkout.session.completed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Create a Google Cloud service account with Calendar API access. Share the SoundBunker booking calendar with the service-account email and allow it to make changes to events. Add its calendar ID, email and private key to Vercel.
7. Connect `INVOICEXPRESS_AUTOMATION_URL` to the verified InvoiceXpress automation endpoint. The booking webhook sends customer data, the full VAT-inclusive invoice total, the paid €100 deposit, the remaining balance and session due date. Configure the automation to create or match the customer, issue the invoice in the **Recording Studio** sequence, record the deposit as a partial payment, email the customer and notify Steve@soundbunker.pt.
8. In Vercel, open **Settings → Domains**, add `soundbunker.pt` and follow the DNS records shown by Vercel.

## Booking rules included

- Monday to Friday: 10:00, 13:00 and 16:00
- Saturday: 16:00, two-hour sessions only
- Sunday: 10:00, two-hour or four-hour sessions
- Full day: 10:00–17:00 on weekdays
- €100 VAT-inclusive deposit at booking
- Remaining balance due on the session day
- Free move with more than 24 hours' notice; deposit lost inside 24 hours

## Before public launch

- Test Stripe in test mode and complete one full test booking.
- Confirm the Google event and customer invitation are created once.
- Confirm InvoiceXpress creates the customer, invoice, partial payment and correct balance.
- Have the trilingual privacy and booking terms reviewed for the final business workflow.
- Replace the telephone placeholder when the new number is ready.
