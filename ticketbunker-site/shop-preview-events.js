// Display fixtures only. No database writes, real inventory or checkout identifiers.
import {clubPreview} from './club-preview.js';
const sample = ({slug,title,kind,venue,city,when,until,image,artist,price,art,tag,tone='green',story,programme,policy='Sample age policy: 18+ with photo ID'}) => ({
 preview:true,id:'shop-preview-'+slug,slug,title,event_kind:kind,
 organiser:'TicketBunker Demo Organiser',venue:venue+' · fictional venue',venue_city:city,
 venue_timezone:'Europe/Lisbon',currency:'eur',starts_at:when,ends_at:until,
 image_url:image,event_logo_url:'/brand-icon.png',headline_artist:artist,
 art_title:art,art_tag:tag,art_tone:tone,
 description:`DEMONSTRATION ONLY. This is a fictional sample event. Artists, venues, dates and prices are illustrative. No event will take place and no tickets are on sale.

The experience:
${story}

On the programme:
${programme}

Entry information:
- ${policy}
- Bring the current ticket QR and check the organiser’s entry information before travelling to a real event.

Accessibility & travel:
This venue is fictional. A real event page should list step-free access, accessible facilities, transport and a contact for assistance. No address or directions apply to this preview.

Ticket information:
These example ticket tiers show how the shop works. This page cannot take payment, send a booking email, issue a ticket or grant admission.`,
 tiers:[{id:'sample-'+slug+'-early',name:'Early release · sample',price_cents:Math.max(0,price-400),remaining:0},{id:'sample-'+slug+'-general',name:'General admission · sample',price_cents:price,remaining:80},{id:'sample-'+slug+'-supporter',name:'Supporter ticket · sample',price_cents:price+1000,remaining:20}]
});
const previews=[
 sample({slug:'after-dark',title:'After Dark: Warehouse Sessions',kind:'club',venue:'The Warehouse',city:'Loulé',when:'2026-11-14T22:00:00Z',until:'2026-11-15T04:00:00Z',image:'/assets/club.jpg',artist:'Demo Selector One · Demo Selector Two',price:1500,art:'AFTER\nDARK',tag:'HOUSE / GARAGE / LATE NIGHTS',tone:'purple',story:'Low lights, deep bass and a room full of people who came to dance. A sample night that moves from warm house and garage into a late-night closing set.',programme:'22:00 · Doors and opening selector\n00:00 · Main-room session\n02:00 · Closing set',policy:'Sample age policy: 18+ with photo ID; sample last entry 01:00'}),
 sample({slug:'coastline-live',title:'Coastline Live: The Independent Sessions',kind:'show',venue:'The Electric Room',city:'Faro',when:'2026-11-20T20:00:00Z',until:'2026-11-20T23:30:00Z',image:'/assets/band.webp',artist:'The Sample Coast · Demo Support',price:2200,art:'COASTLINE\nLIVE',tag:'INDEPENDENT MUSIC / LIVE & LOUD',story:'Guitars up front, a close-up stage and a night for discovering your next favourite band. This sample show pairs a headline set with a local support slot.',programme:'20:00 · Doors\n20:30 · Demo support\n21:30 · The Sample Coast headline set'}),
 sample({slug:'open-skies',title:'Open Skies: Music Under the Stars',kind:'festival',venue:'The Meadow',city:'Almancil',when:'2026-11-21T16:00:00Z',until:'2026-11-21T23:00:00Z',image:'/assets/festival.webp',artist:'The Demo Assembly · Sample Sunset DJs',price:3500,art:'OPEN\nSKIES',tag:'OPEN AIR / ONE GREAT DAY',tone:'sunset',story:'Open skies, live stages and the feeling of being exactly where you should be. A sample outdoor day of live music, DJ sets and food stalls, carrying on after sunset.',programme:'16:00 · Gates and afternoon selectors\n18:00 · Live stage opens\n20:00 · Demo Assembly headline set\n21:30 · Sunset DJ session',policy:'Sample age policy: under-18s accompanied by an adult; check the real organiser’s policy'}),
 sample({slug:'mic-drop',title:'Mic Drop: Friday Night Comedy',kind:'comedy',venue:'The Back Room',city:'Vilamoura',when:'2026-11-27T19:30:00Z',until:'2026-11-27T22:30:00Z',image:'/assets/comedy.jpg',artist:'Demo Host · Three Sample Comics',price:1800,art:'MIC\nDROP',tag:'STAND-UP / BIG LAUGHS',tone:'sunset',story:'A small room, a sharp host and three very different voices. This fictional comedy bill shows how an organiser can present a seated show with a clear running order.',programme:'19:30 · Doors\n20:00 · Host and opening set\n20:45 · Interval\n21:00 · Headline set'}),
 sample({slug:'vinyl-social',title:'The Vinyl Social: All Night Selectors',kind:'club',venue:'Studio After Hours',city:'Loulé',when:'2026-11-28T21:00:00Z',until:'2026-11-29T02:00:00Z',image:'/assets/dj.webp',artist:'Demo Vinyl Residents · Guest Selector',price:1200,art:'THE VINYL\nSOCIAL',tag:'SOUL / DISCO / HOUSE',tone:'purple',story:'Records with a story, selectors with a point of view. A sample listening-into-dancing night, moving from soul and disco to classic house.',programme:'21:00 · Listening session\n22:30 · Guest selector\n00:00 · Resident close'}),
 sample({slug:'together-live',title:'Together Live: The Weekend Gathering',kind:'community',venue:'The Courtyard',city:'Faro',when:'2026-11-29T15:00:00Z',until:'2026-11-29T20:00:00Z',image:'/assets/crowd.jpg',artist:'Demo Acoustic Collective · Sample Selectors',price:1000,art:'TOGETHER\nLIVE',tag:'GOOD MUSIC / GOOD COMPANY',story:'Good music and a little room to slow down. This fictional community gathering brings acoustic sets, relaxed DJ selections and independent food stalls together for an afternoon.',programme:'15:00 · Courtyard opens\n16:00 · Acoustic collective\n17:30 · Afternoon selectors\n19:00 · Closing live set',policy:'Sample age policy: all ages; under-16s accompanied by an adult'})
];
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const shopPreviewEvents=freeze(previews);
export function shopPreviewEvent(slug){return slug?shopPreviewEvents.find(e=>e.slug===slug)||(slug===clubPreview.slug?clubPreview:null):clubPreview;}
