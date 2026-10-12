// Isolated display fixture. Never inserted into the event catalogue or ticket database.
export const clubPreview = Object.freeze({
 preview:true,id:'club-layout-preview',slug:'after-dark-test-club-night',
 title:'After Dark — Test Club Night',organiser:'TicketBunker Demo Organiser',
 event_kind:'club',venue:'The Demo Warehouse — fictional venue',venue_city:'Loulé',
 venue_timezone:'Europe/Lisbon',currency:'eur',
 starts_at:'2026-11-14T22:00:00Z',ends_at:'2026-11-15T04:00:00Z',
 image_url:'/assets/club.jpg',event_logo_url:'/brand-icon.png',
 headline_artist:'Demo DJ One · Demo DJ Two',
 description:`DEMONSTRATION ONLY. This is a fictional club night for testing the event page. No event will take place and no tickets are on sale.

The night:
A sample six-hour journey through house, garage and drum & bass. This preview shows how an organiser can tell the story of their event, present the line-up and give guests everything they need before booking.

Line-up:
22:00–00:00 · Demo DJ One — house & garage
00:00–02:00 · Demo DJ Two — drum & bass
02:00–04:00 · Demo closing set

Entry information:
- Sample age policy: 18+ with photo ID
- Sample doors: 22:00; last entry: 01:00
- Sample policy: no re-entry

Accessibility:
This venue is fictional. A real organiser should describe step-free access, accessible toilets and how to request assistance here.

Travel & venue:
No real address or directions apply to this preview. For a real event, include the full venue address, parking and public transport information.

Ticket information:
Early Bird, General Admission and VIP are example prices only. This page cannot take payment, issue a ticket or grant admission.`,
 tiers:[{id:'demo-early',name:'Early Bird · sample',price_cents:1000,remaining:0},{id:'demo-general',name:'General Admission · sample',price_cents:1500,remaining:80},{id:'demo-vip',name:'VIP · sample',price_cents:2500,remaining:10}]
});
