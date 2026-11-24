import {AD_PACKAGES,AD_WEEKS,AD_COUNTRIES,adPrice,adShowsOn} from '../../ticketbunker-site/ad-packages.js';
import {cityBySlug} from '../../ticketbunker-site/city-places.js';
import {safeText,validEmail} from './http.js';
import {ticketBunkerStripe} from './ticketbunker-stripe.js';
import {sendStudioEmail} from './notify.js';
import {ticketBunkerReplyTo} from './ticketbunker-email-template.js';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const DAY=864e5;

export function imageType(bytes){
 if(bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return 'image/jpeg';
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
// An advertiser's link: plain https, no login details or odd ports, never our own site.
export function adLink(value){
 try{const u=new URL(String(value||'').trim());
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/(^|\.)theticketbunker\.com$/i.test(u.hostname))return '';
  return u.href.length<=500?u.href:'';}catch{return '';}
}

// The booking form → a database row, or the first problem with the field it belongs to.
export function adRequest(body,now=Date.now()){
 const pkg=String(body.package||''),plan=AD_PACKAGES[pkg],weeks=Number(body.weeks),currency=String(body.currency||'');
 if(!plan)return {error:'Choose an advert package.',field:'package'};
 if(!AD_WEEKS.includes(weeks))return {error:'Choose how many weeks.',field:'weeks'};
 if(!['eur','gbp'].includes(currency))return {error:'Choose euros or pounds.',field:'currency'};
 const country=String(body.country||'').toUpperCase();
 if(!AD_COUNTRIES.includes(country))return {error:'Choose the country your advert is for.',field:'country'};
 let citySlug=null;
 if(plan.needsCity){const city=cityBySlug(String(body.city||'').toLowerCase());
  if(!city||city[2]!==country)return {error:'Choose a city page in that country.',field:'city'};citySlug=city[0];}
 const business=safeText(body.businessName,80),email=safeText(body.email,200).toLowerCase();
 const headline=safeText(body.headline,60),text=safeText(body.body,160),cta=safeText(body.cta||'Find out more',24);
 if(business.length<2)return {error:'Add your business name.',field:'businessName'};
 if(!validEmail(email))return {error:'Add an email address we can reach you on.',field:'email'};
 if(headline.length<3)return {error:'Add a headline (up to 60 characters).',field:'headline'};
 if(text.length<3)return {error:'Add a short line about your offer (up to 160 characters).',field:'body'};
 if(cta.length<2)return {error:'Add the button text.',field:'cta'};
 const link=adLink(body.link);
 if(!link)return {error:'Add the https:// web address your advert should open.',field:'link'};
 const start=String(body.start||'');
 const startMs=Date.parse(start+'T00:00:00Z'),today=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!(startMs>=today)||startMs>today+180*DAY)return {error:'Choose a start date within the next six months.',field:'start'};
 return {row:{package:pkg,weeks,currency,amount_cents:adPrice(pkg,weeks,currency),country_code:country,city_slug:citySlug,business_name:business,
  contact_email:email,headline,body:text,cta,link_url:link,requested_start:start}};
}
export function adImage(raw){
 const m=/^data:(image\/(?:jpeg|png|webp));base64,([a-z\d+/=]+)$/i.exec(String(raw||''));
 if(!m)return {error:'Add a JPEG, PNG or WebP picture.',field:'image'};
 const bytes=Buffer.from(m[2],'base64');
 if(bytes.length<100||bytes.length>2_000_000||imageType(bytes)!==m[1].toLowerCase())return {error:'Use a picture under 2 MB.',field:'image'};
 return {bytes,type:m[1].toLowerCase()};
}

// What the public sees: approved banners running now for this place, newest booking
// last so earlier buyers keep the first slot.
export async function liveAds(db,place,now=Date.now()){
 const city=place==='home'?null:cityBySlug(place);
 if(place!=='home'&&!city)return [];
 const iso=new Date(now).toISOString();
 const r=await db.from('tb_ad_bookings').select('id,package,country_code,city_slug,business_name,headline,body,cta,link_url,image_url,starts_at,ends_at,paid_at')
  .eq('status','approved').lte('starts_at',iso).gt('ends_at',iso).order('paid_at',{ascending:true}).limit(50);
 if(r.error)throw r.error;
 return r.data.filter(b=>adShowsOn(b,place==='home'?'home':city[0],city?.[2]||'')).slice(0,3)
  .map(b=>({id:b.id,advertiser:b.business_name,headline:b.headline,body:b.body,cta:b.cta,url:b.link_url,image:b.image_url}));
}

// Stripe has taken payment: check it matches the booking, then put it up for review.
export async function fulfilAdCheckout(db,session,{notify=sendStudioEmail}={}){
 const id=session.metadata?.ad_booking_id;
 if(!UUID.test(id||'')||session.client_reference_id!==id)throw Error('Ad booking reference mismatch');
 const b=await db.from('tb_ad_bookings').select('*').eq('id',id).maybeSingle();
 if(b.error||!b.data)throw Error('Ad booking missing');
 if(b.data.status!=='pending_payment')return b.data;
 if(session.amount_total!==b.data.amount_cents||session.currency!==b.data.currency||session.id!==b.data.stripe_session_id)throw Error('Ad booking payment mismatch');
 const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null;
 const saved=await db.from('tb_ad_bookings').update({status:'review',paid_at:new Date().toISOString(),stripe_payment_intent:pi}).eq('id',id).eq('status','pending_payment').select('*').maybeSingle();
 if(saved.error)throw saved.error;
 const row=saved.data||b.data,where=row.city_slug?cityBySlug(row.city_slug)?.[1]:row.package==='home'?'the homepage':'the homepage and city pages';
 await Promise.allSettled([
  notify(ticketBunkerReplyTo,'New advert to review: '+row.business_name,`${row.business_name} has paid for a ${AD_PACKAGES[row.package].label.toLowerCase()} (${row.weeks} week${row.weeks>1?'s':''}, ${where}), starting ${row.requested_start}.\n\n"${row.headline}" — ${row.body}\nLink: ${row.link_url}\n\nApprove or turn it down in the control room: https://theticketbunker.com/control-room`,{brand:'ticketbunker'}),
  notify(row.contact_email,'Your TicketBunker advert is being reviewed',`Thanks, ${row.business_name}. We have your payment for a ${AD_PACKAGES[row.package].label.toLowerCase()} for ${row.weeks} week${row.weeks>1?'s':''}.\n\nWe check every advert before it goes live, usually within one working day. Once approved it runs from ${row.requested_start} (or the day we approve it, if later). If we can't run it, we refund you in full.\n\nQuestions? Reply to this email.`,{brand:'ticketbunker'})
 ]);
 return row;
}

// Owner decision. Approve: it runs for the paid number of weeks from the requested start
// (or today, if that has passed). Turn down: a full Stripe refund, then the row is closed.
export async function reviewAd(db,{id,decision,note,reviewer},{stripe=ticketBunkerStripe,notify=sendStudioEmail,now=Date.now()}={}){
 if(!UUID.test(id||'')||!['approve','refund'].includes(decision))return {error:'Choose an advert and a decision.',status:400};
 const b=await db.from('tb_ad_bookings').select('*').eq('id',id).maybeSingle();
 if(b.error)throw b.error;
 if(!b.data||b.data.status!=='review')return {error:'This advert is not waiting for review.',status:409};
 const row=b.data,reviewed={reviewed_at:new Date(now).toISOString(),reviewed_by:reviewer,review_note:safeText(note,300)||null};
 if(decision==='approve'){
  const start=Math.max(now,Date.parse(row.requested_start+'T00:00:00Z'));
  const saved=await db.from('tb_ad_bookings').update({...reviewed,status:'approved',starts_at:new Date(start).toISOString(),ends_at:new Date(start+row.weeks*7*DAY).toISOString()})
   .eq('id',id).eq('status','review').select('*').single();
  if(saved.error)throw saved.error;
  await notify(row.contact_email,'Your TicketBunker advert is approved',`Good news, ${row.business_name}: your advert "${row.headline}" is approved and runs from ${saved.data.starts_at.slice(0,10)} to ${saved.data.ends_at.slice(0,10)}.`,{brand:'ticketbunker'}).catch(()=>{});
  return {booking:saved.data};
 }
 if(!/^pi_[A-Za-z0-9]+$/.test(row.stripe_payment_intent||''))return {error:'No payment found to refund.',status:409};
 const refund=await stripe('/v1/refunds',{method:'POST',body:new URLSearchParams({payment_intent:row.stripe_payment_intent,'metadata[ad_booking_id]':id}),idem:'ticketbunker-ad-refund-'+id});
 if(!/^re_/.test(refund.id||''))throw Error('Refund not created');
 const saved=await db.from('tb_ad_bookings').update({...reviewed,status:'refunded',stripe_refund_id:refund.id}).eq('id',id).eq('status','review').select('*').single();
 if(saved.error)throw saved.error;
 await notify(row.contact_email,'About your TicketBunker advert',`Sorry, ${row.business_name}: we can't run the advert "${row.headline}" this time${reviewed.review_note?' ('+reviewed.review_note+')':''}. We have refunded your payment in full; it usually shows on your card within 5–10 days.`,{brand:'ticketbunker'}).catch(()=>{});
 return {booking:saved.data};
}

export async function adminAds(db){
 const r=await db.from('tb_ad_bookings').select('*').neq('status','pending_payment').order('created_at',{ascending:false}).limit(100);
 // Until the adverts table exists the rest of the control room keeps working.
 if(r.error?.code==='42P01'||r.error?.code==='PGRST205')return [];
 if(r.error)throw r.error;return r.data;
}
