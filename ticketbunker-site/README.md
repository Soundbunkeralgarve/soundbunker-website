# TicketBunker

Canonical TicketBunker frontend and gateway. Keep this folder with the shared ticket services in this repository.

Work project: https://chatgpt.com/space/page_6acbbe157b608191a2b4ec9772ed4d76
Live site: https://theticketbunker.com
Organiser portal: https://theticketbunker.com/organiser

Deploy this directory to Vercel project the-ticket-bunker in the sound-bunker team. Shared SoundBunker authentication and ticket services remain at www.soundbunker.pt/api. Do not replace newer repository or deployment changes with older snapshots.

The portal provides organiser business details and transparent black-lettering PNG logos, event tools, promotions, staff, street teams and automatic post-show reports. See LAUNCH.md for the exact live Stripe activation work still required. Never enable payment gates just to make unavailable payment features appear live.

Run npm test for gateway and payout checks. SQL and Edge function sources are in reporting-schema.sql and edge/reporting.ts. Customer pages never display service keys or fictitious payment amounts.
