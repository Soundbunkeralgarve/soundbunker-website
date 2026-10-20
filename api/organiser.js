import {clientControl,activeClientDiscount} from './lib/ticketbunker-owner.js';
import {ticketBunkerPaymentsEnabled} from './lib/ticketbunker-stripe.js';
import {walletTestEvent} from './lib/ticket-wallet.js';
import { requireUser } from './lib/supabase-auth.js';
import { json,parseJson,safeText } from './lib/http.js';
import { localEventInstant } from './lib/events-time.js';
import { eventSlugCandidate } from './lib/event-slug.js';
import { randomBytes } from 'node:crypto';
import { sendStudioEmail } from './lib/notify.js';

const uuid=value=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(String(value||''));
export const organiserCountries=Object.freeze({
 PT:{currency:'eur',timezone:'Europe/Lisbon'},
 GB:{currency:'gbp',timezone:'Europe/London'}
});
export async function organiserForUser(admin,id){
 const result=await admin.from('sb_event_organisers').select('*').eq('owner_user_id',id).maybeSingle();
 if(result.error)throw result.error;
 return result.data;
}
export default async function handler(req,res){
 const ctx=await requireUser(req,{loadProfile:false});
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 const db=ctx.admin;
 try {
   const organisation=await organiserForUser(db,ctx.user.id);
   if(req.method==='GET') {
     if(!organisation)return json(res,{organiser:null,events:[]});
     const ev=await db.from('sb_events').select('id,slug,title,description,venue,starts_at,ends_at,status,country_code,currency,venue_timezone,event_kind,image_url,event_logo_url,headline_artist,venue_city,publish_requested_at,public_beta_test,beta_test_expires_at,created_at,internal_free_test,test_expires_at')
       .eq('organiser_profile_id',organisation.id).order('starts_at',{ascending:false}).limit(200);
     if(ev.error)throw ev.error;
     const ids=ev.data.map(v=>v.id);
     // Independent account sections load concurrently instead of seven serial round trips.
     const queries=[
       ['sb_event_tiers','id,event_id,name,price_cents,quantity_total'],
       ['sb_event_listing_fees','event_id,status,tier_code,amount_cents,currency'],
       ['sb_event_showcase_requests','event_id,status,currency,proposed_amount_cents,requested_at'],
       ['sb_event_festival_quotes','event_id,tier_code,expected_tickets,status,currency,quoted_amount_cents'],
       ['sb_event_charity_claims','event_id,registration_number,status,country_code,created_at'],
       ['sb_event_payment_terms_requests','event_id,status,payment_preference,ticket_capacity']
     ];
     const [tiers,fees,showcases,festivalQuotes,charities,paymentTerms,listingOffer]=await Promise.all([
       ...queries.map(([table,columns])=>ids.length?db.from(table).select(columns).in('event_id',ids):{data:[],error:null}),
       clientControl(db,organisation.id)
     ]);
     for(const result of [tiers,fees,showcases,festivalQuotes,charities,paymentTerms])if(result.error)throw result.error;
     return json(res,{organiser:{
       id:organisation.id,display_name:organisation.display_name,country_code:organisation.country_code,
       status:organisation.status,stripe_connected:!!organisation.stripe_account_id,
       stripe_capabilities_ready:organisation.stripe_capabilities_ready,tax_review_complete:organisation.tax_review_complete,logo_url:organisation.logo_url||null,listingOffer
     },events:ev.data.map(e=>({...e,wallet_test:walletTestEvent(e),tiers:tiers.data.filter(t=>t.event_id===e.id),fees:fees.data.filter(f=>f.event_id===e.id),showcase:showcases.data.find(f=>f.event_id===e.id)||null,festivalQuote:festivalQuotes.data.find(f=>f.event_id===e.id)||null,
       flexibleTerms:paymentTerms.data.find(f=>f.event_id===e.id)||null,charity:charities.data.find(f=>f.event_id===e.id)||null}))});
   }
   if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
   const body=await parseJson(req);
   const action=safeText(body.action,32);
   if(action==='register'){
     if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email before creating an organiser account.'},403);
     const display_name=safeText(body.displayName,160),country_code=safeText(body.country,2).toUpperCase();
     if(display_name.length<2||!organiserCountries[country_code]||body.acceptTerms!==true)
       return json(res,{error:'Enter a promoter name, select your country and accept organiser terms'},400);
     // A lost response must not turn a successful registration into a dead end.
     if(organisation){
       if(organisation.status!=='suspended'&&organisation.display_name===display_name&&organisation.country_code===country_code)
         return json(res,{organiser:organisation,alreadySaved:true});
       return json(res,{error:'Your organiser profile already exists. Refresh to continue setup.'},409);
     }
     const saved=await db.from('sb_event_organisers').insert({owner_user_id:ctx.user.id,display_name,country_code,status:'approved'})
       .select('id,display_name,country_code,status').single();
     if(saved.error)return json(res,{error:'Could not create organiser profile'},409);
     return json(res,{organiser:saved.data});
   }
   if(!organisation)return json(res,{error:'Create your organiser account first'},403);
   if(organisation.status==='suspended')return json(res,{error:'Organiser account suspended'},403);
   if(action==='event'){
     const title=safeText(body.title,160),venue=safeText(body.venue,180);
     const category=safeText(body.kind,20),description=safeText(body.description,4000);
     const charityEvent=body.charityEvent===true||body.charityEvent==='on';
     const charityNumber=safeText(body.charityNumber,40).trim();
     // A number is evidence for *manual* charity verification, not an automatic waiver.
     if(charityEvent&&!/^[A-Za-z0-9][A-Za-z0-9 .\/-]{2,39}$/.test(charityNumber))
       return json(res,{error:'Enter the registered charity number (3–40 characters)'},400);
     const startsAt=String(body.startsAt||''),endsAt=String(body.endsAt||'');
     for(const [field,valid,error] of [
       ['title',title.length>=3,'Enter an event name of at least 3 characters.'],
       ['venue',!!venue,'Enter the venue name and address.'],
       ['kind',['show','festival','workshop','club','community','comedy','sports','other'].includes(category),'Choose an event category.'],
       ['description',description.length>=20,'Add at least 20 characters of event information.']
     ])if(!valid)return json(res,{error,field},400);
     const place=organiserCountries[organisation.country_code];
     if(!place)return json(res,{error:'Your organiser country needs checking. Please contact Customer Services.'},409);
     let startInstant,endInstant;
     try{startInstant=localEventInstant(startsAt,place.timezone)}catch(error){return json(res,{error:error.message,field:'startsAt'},400);}
     try{endInstant=localEventInstant(endsAt,place.timezone)}catch(error){return json(res,{error:error.message,field:'endsAt'},400);}
     if(Date.parse(startInstant)<=Date.now())return json(res,{error:'Choose an event start in the future.',field:'startsAt'},400);
     if(Date.parse(endInstant)<=Date.parse(startInstant))return json(res,{error:'Set a finish time after the start time.',field:'endsAt'},400);
     const details={
       title,venue,organiser:organisation.display_name,organiser_profile_id:organisation.id,
       country_code:organisation.country_code,currency:place.currency,venue_timezone:place.timezone,
       starts_at:startInstant,ends_at:endInstant,
       event_logo_url:organisation.logo_url||null,
       event_kind:category,description,headline_artist:safeText(body.headlineArtist,120),venue_city:safeText(body.venueCity,120),
       image_url:/^https:\/\/[^\s]+$/i.test(body.imageUrl||'')?safeText(body.imageUrl,900):null,
       status:'draft'
     };
     // Event titles are untouched. A duplicate title may have a distinct URL.
     // Only retry when PostgreSQL confirms a URL uniqueness conflict.
     let saved;
     for(let attempt=0;attempt<4;attempt++){
       const slug=eventSlugCandidate(title,attempt,attempt?randomBytes(3).toString('hex'):'');
       saved=await db.from('sb_events').insert({...details,slug}).select('id,slug,title,status').single();
       if(!saved.error)break;
       if(saved.error.code==='23505'&&/slug|sb_events_slug_key/i.test(saved.error.message||'')&&attempt<3)continue;
       console.error('Organiser event save error',{code:saved.error.code,details:saved.error.details,message:saved.error.message});
       return json(res,{error:saved.error.code==='23505'
        ?'This event URL is unavailable. Please try saving again.'
        :'We could not save this event yet. Your details are still in the form; please retry.'},503);
     }
     if(saved?.error||!saved?.data)return json(res,{error:'Could not allocate an event URL. Please try again.'},503);
     if(charityEvent){
       const claim=await db.from('sb_event_charity_claims').insert({
         event_id:saved.data.id,organiser_profile_id:organisation.id,
         country_code:organisation.country_code,registration_number:charityNumber,
         status:'pending_review'
       }).select('id,status').single();
       if(claim.error){
         console.error('Charity claim creation failed',claim.error);
         const revert=await db.from('sb_events').delete().eq('id',saved.data.id).eq('organiser_profile_id',organisation.id);
         if(revert.error)console.error('Charity draft rollback failed',revert.error);
         return json(res,{error:'Charity registration could not be saved. Please try creating the event again.'},503);
       }
       return json(res,{event:saved.data,charity:claim.data});
     }
     return json(res,{event:saved.data});
   }
   if(action==='activateBetaTest'||action==='stopBetaTest'){
     if(!uuid(body.eventId))return json(res,{error:'Choose your event first'},400);
     const ev=await db.from('sb_events')
      .select('id,slug,status,starts_at,description,image_url,public_beta_test,internal_free_test')
      .eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||!ev.data||ev.data.internal_free_test||ev.data.status!=='draft')
      return json(res,{error:'Choose your own draft event'},403);
     if(action==='stopBetaTest'){
      const result=await db.from('sb_events')
       .update({public_beta_test:false,beta_test_expires_at:null})
       .eq('id',ev.data.id).eq('organiser_profile_id',organisation.id)
       .select('id').single();
      if(result.error)throw result.error;
      return json(res,{stopped:true,message:'The public €0 test listing is now hidden. Paid prices are unchanged.'});
     }
     if(Date.parse(ev.data.starts_at)<=Date.now()||!ev.data.image_url||
         (ev.data.description||'').trim().length<20)
      return json(res,{error:'Add a poster and description and choose a future event date before testing'},409);
     const tiers=await db.from('sb_event_tiers').select('id')
       .eq('event_id',ev.data.id).gte('price_cents',100).limit(1);
     if(tiers.error||!tiers.data?.length)
      return json(res,{error:'Add at least one priced ticket type first. Actual prices stay saved; test bookings are €0.'},409);
     const until=new Date(Date.now()+72*60*60*1000).toISOString();
     const result=await db.from('sb_events')
      .update({public_beta_test:true,beta_test_expires_at:until})
      .eq('id',ev.data.id).eq('organiser_profile_id',organisation.id)
      .eq('status','draft').select('id,slug,beta_test_expires_at').single();
     if(result.error)throw result.error;
     return json(res,{active:true,
      url:(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'')+'/event?slug='+encodeURIComponent(ev.data.slug),
      expiresAt:until,message:'Event is publicly visible in €0 TEST MODE for 72 hours. No payment or real admission.'});
   }
   if(action==='requestPublish'){
     if(!uuid(body.eventId))return json(res,{error:'Choose your event first'},400);
     const ev=await db.from('sb_events').select('id,status,starts_at,title,description,image_url,internal_free_test')
       .eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||!ev.data||ev.data.status!=='draft'||ev.data.internal_free_test||Date.parse(ev.data.starts_at)<=Date.now())
       return json(res,{error:'Choose a future draft event you own'},409);
     if(!ev.data.description||ev.data.description.trim().length<20||!ev.data.image_url)
       return json(res,{error:'Add your event description and poster before requesting publication'},400);
     const tiers=await db.from('sb_event_tiers').select('id').eq('event_id',ev.data.id).limit(1);
     if(tiers.error||!tiers.data?.length)return json(res,{error:'Add at least one ticket type first'},409);
     const saved=await db.from('sb_events').update({publish_requested_at:new Date().toISOString()})
       .eq('id',ev.data.id).eq('status','draft').select('id,publish_requested_at').maybeSingle();
     if(saved.error||!saved.data)throw Error('Could not request event review');
     return json(res,{event:saved.data,message:'Your event is saved and submitted for review. No payments or live ticket sales are enabled yet.'});
   }
   if(action==='tiers'){
     if(!uuid(body.eventId))return json(res,{error:'Choose a valid draft event'},400);
     const ev=await db.from('sb_events').select('id,status,internal_free_test')
       .eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||!ev.data||ev.data.status!=='draft'||ev.data.internal_free_test)
       return json(res,{error:'Only your ordinary draft events can add ticket types'},403);
     if(!Array.isArray(body.tiers)||body.tiers.length<1||body.tiers.length>10)
       return json(res,{error:'Choose between 1 and 10 ticket types at a time'},400);
     const items=body.tiers.map(item=>({
       name:safeText(item?.name,100),price_cents:Number(item?.priceCents),
       quantity_total:Number(item?.capacity)
     }));
     if(items.some(item=>item.name.length<2||!Number.isInteger(item.price_cents)||
       item.price_cents<100||item.price_cents>10000000||!Number.isInteger(item.quantity_total)||
       item.quantity_total<1||item.quantity_total>2000))
       return json(res,{error:'Every ticket needs a name, valid price (minimum 1) and quantity (1–2,000)'},400);
     const unique=new Set(items.map(item=>item.name.toLocaleLowerCase()));
     if(unique.size!==items.length)
       return json(res,{error:'You have chosen the same ticket type more than once. Each name must be unique.'},409);
     const existing=await db.from('sb_event_tiers').select('id,name,price_cents,quantity_total').eq('event_id',ev.data.id);
     if(existing.error)throw existing.error;
     const already=new Set(existing.data.map(item=>item.name.toLocaleLowerCase()));
     const duplicate=items.find(item=>already.has(item.name.toLocaleLowerCase()));
     if(duplicate){
       const identical=items.every(item=>existing.data.some(t=>t.name.toLocaleLowerCase()===item.name.toLocaleLowerCase()&&t.price_cents===item.price_cents&&t.quantity_total===item.quantity_total));
       if(identical)return json(res,{tiers:existing.data,alreadySaved:true,total:existing.data.reduce((n,t)=>n+Number(t.quantity_total||0),0)});
       return json(res,{error:duplicate.name+' is already saved. Choose Review draft to continue, or use a different name for a new ticket type.'},409);
     }
     const currentCount=existing.data.reduce((total,item)=>total+Number(item.quantity_total||0),0);
     const addedCount=items.reduce((total,item)=>total+item.quantity_total,0);
     if(currentCount+addedCount>2000)
       return json(res,{error:'Your combined ticket quantities exceed 2,000. Reduce a quantity before saving.'},409);
     // One database insert for the complete batch: no partially saved types.
     // The Postgres 2,000-ticket trigger protects against concurrent requests.
     const saved=await db.from('sb_event_tiers').insert(
       items.map(item=>({...item,event_id:ev.data.id}))
     ).select('id,name,price_cents,quantity_total');
     if(saved.error){
       console.error('Bulk event ticket insert failed',{code:saved.error.code,message:saved.error.message});
       return json(res,{error:'Could not save these ticket types. No partial batch was accepted; please check quantities and retry.'},409);
     }
     return json(res,{tiers:saved.data,added:addedCount,total:currentCount+addedCount},201);
   }
   if(action==='tier'){
     if(!uuid(body.eventId))return json(res,{error:'Select a valid event'},400);
     const ev=await db.from('sb_events').select('id,status').eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||ev.data?.status!=='draft')return json(res,{error:'Only draft events can add ticket types'},409);
     const name=safeText(body.name,100),price=Number(body.priceCents),capacity=Number(body.capacity);
     if(!name||!Number.isInteger(price)||price<100||price>10000000||!Number.isInteger(capacity)||capacity<1||capacity>2000)
       return json(res,{error:'Enter a valid price and capacity'},400);
     // BETA hard limit: organisers cannot configure an event above 2,000 tickets.
     const tiers=await db.from('sb_event_tiers').select('quantity_total').eq('event_id',ev.data.id);
     if(tiers.error)throw tiers.error;
     const used=tiers.data.reduce((sum,row)=>sum+Number(row.quantity_total||0),0);
     if(used+capacity>2000)return json(res,{error:'Our small-events BETA supports up to 2,000 tickets in total across all ticket types'},409);
     const saved=await db.from('sb_event_tiers').insert({event_id:ev.data.id,name,price_cents:price,quantity_total:capacity})
       .select('id,name,price_cents,quantity_total').single();
     if(saved.error)throw saved.error;
     return json(res,{tier:saved.data});
   }
   if(action==='eventPlusTerms'){
     const id=String(body.eventId||'');
     if(!uuid(id)||body.paymentPreference!=='deposit_sales')
       return json(res,{error:'Choose an Event Plus draft and an approved payment preference'},400);
     const ev=await db.from('sb_events').select('id,title,status,currency,internal_free_test,starts_at')
       .eq('id',id).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||!ev.data||ev.data.status!=='draft'||ev.data.internal_free_test
        ||Date.parse(ev.data.starts_at)<=Date.now())
       return json(res,{error:'Choose one of your future ordinary draft events'},403);
     const tiers=await db.from('sb_event_tiers').select('quantity_total').eq('event_id',id);
     if(tiers.error)throw tiers.error;
     const capacity=tiers.data.reduce((n,t)=>n+Number(t.quantity_total||0),0);
     if(capacity<1001||capacity>2000)
       return json(res,{error:'Deposit terms are available only for Event Plus (1,001–2,000) and separately quoted larger events.'},400);
     const existing=await db.from('sb_event_payment_terms_requests').select('id,status')
       .eq('event_id',id).maybeSingle();
     if(existing.error)throw existing.error;
     if(existing.data)return json(res,{error:'Flexible payment terms have already been requested for this event.'},409);
     const amount=39900;
     const notes=safeText(body.notes,1200);
     const saved=await db.from('sb_event_payment_terms_requests').insert({
       event_id:id,organiser_profile_id:organisation.id,
       ticket_capacity:capacity,currency:ev.data.currency,
       proposed_listing_fee_cents:amount,payment_preference:'deposit_sales',
       notes,status:'requested'
     }).select('id,status,ticket_capacity').single();
     if(saved.error){
       if(saved.error.code==='23505')return json(res,{error:'Flexible terms already requested for this event.'},409);
       throw saved.error;
     }
     const email=await sendStudioEmail(process.env.BOOKING_NOTIFICATION_EMAIL||'bookings@soundbunker.pt',
       'TicketBunker Event Plus flexible payment request · '+ev.data.title,
       'Flexible listing payment enquiry (no authorisation to charge)\nEvent: '+ev.data.title
       +'\nOrganiser: '+organisation.display_name
       +'\nTier: Event Plus · '+capacity+' tickets\nIndicative listing fee including applicable VAT: '
       +(ev.data.currency==='gbp'?'£399':'€399')
       +'\nRequested terms: Deposit upfront plus capped recovery from eligible ticket sales, subject to written terms and Stripe Connect approval.'
       +'\nNotes: '+notes, {brand:'ticketbunker'});
     if(email.status!=='sent')console.warn('Event Plus enquiry email notification not confirmed',{requestId:saved.data.id,status:email.status});
     return json(res,{request:saved.data,message:'Flexible payment terms request saved. We will contact you to agree deposit and revenue collection terms. No payment was taken or ticket sales enabled.'},201);
   }
   if(action==='festivalQuote'){
     const id=String(body.eventId||''),expected=Number(body.expectedTickets);
     const paymentPreference=safeText(body.paymentPreference,30);
     const notes=safeText(body.notes,1200);
     if(!uuid(id)||!Number.isSafeInteger(expected)||expected<2001||expected>1000000)
       return json(res,{error:'Choose a saved event and enter at least 2,001 expected tickets'},400);
     if(!['upfront','deposit_sales','discuss'].includes(paymentPreference))
       return json(res,{error:'Select your preferred payment arrangement'},400);
     const event=await db.from('sb_events').select('id,title,starts_at,status,currency,internal_free_test')
       .eq('id',id).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(event.error||!event.data||event.data.status!=='draft'||event.data.internal_free_test
       ||Date.parse(event.data.starts_at)<=Date.now())
       return json(res,{error:'Choose one of your upcoming draft events'},403);
     const existing=await db.from('sb_event_festival_quotes').select('id,status')
       .eq('event_id',event.data.id).maybeSingle();
     if(existing.error)throw existing.error;
     if(existing.data)return json(res,{error:'A custom quote is already requested for this event. We will contact you to discuss the details.'},409);
     const tier=expected<=5000?'festival':'festival_pro';
     const details='Preferred payment arrangement: '+paymentPreference
       +'\nExpected tickets: '+expected
       +'\nNotes: '+notes;
     const quote=await db.from('sb_event_festival_quotes').insert({
       event_id:event.data.id,organiser_profile_id:organisation.id,
       tier_code:tier,expected_tickets:expected,currency:event.data.currency,
       event_details:details,status:'requested'
     }).select('id,status,expected_tickets,tier_code').single();
     if(quote.error){
       if(quote.error.code==='23505')return json(res,{error:'A custom quote for this event has already been requested.'},409);
       throw quote.error;
     }
     const email=await sendStudioEmail(process.env.BOOKING_NOTIFICATION_EMAIL||'bookings@soundbunker.pt',
       'TicketBunker large-event quote · '+event.data.title,
       'New large-event quote enquiry\nEvent: '+event.data.title
       +'\nOrganiser: '+organisation.display_name
       +'\nExpected ticket volume: '+expected+'\nPayment preference: '+paymentPreference
       +'\nDetails: '+notes+'\n\nCheck the TicketBunker admin quote records.', {brand:'ticketbunker'});
     if(email.status!=='sent')console.warn('Large-event quote email notification not confirmed',{quoteId:quote.data.id,status:email.status});
     return json(res,{quote:quote.data,message:'Your custom quote request has been saved. We will discuss pricing and payment terms before anything goes live. No payment was taken.'},201);
   }
   if(action==='featureRequest'){
     if(!uuid(body.eventId))return json(res,{error:'Choose your event first'},400);
     const event=await db.from('sb_events').select('id,status,currency,organiser_profile_id,starts_at')
       .eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(event.error||!event.data||event.data.status!=='draft'||Date.parse(event.data.starts_at)<=Date.now())
       return json(res,{error:'Choose a future draft event you own'},400);
     const amount=event.data.currency==='gbp'?4900:5900;
     const inserted=await db.from('sb_event_showcase_requests').insert({
       event_id:event.data.id,organiser_profile_id:organisation.id,
       currency:event.data.currency,proposed_amount_cents:amount,status:'requested'
     }).select('id,status,proposed_amount_cents,currency').single();
     if(inserted.error){
       if(inserted.error.code==='23505')return json(res,{error:'Featured Showcase already requested for this event'},409);
       throw inserted.error;
     }
     return json(res,{showcase:inserted.data,payment_required_now:false});
   }
   if(action==='publish'){
     if(!ticketBunkerPaymentsEnabled())
       return json(res,{error:'Third-party ticket publishing is not enabled yet'},503);
     if(!uuid(body.eventId)||organisation.status!=='approved'||!organisation.tax_review_complete||
         !organisation.stripe_capabilities_ready||!organisation.stripe_account_id)
       return json(res,{error:'Complete Stripe and organiser verification first'},403);
     const ev=await db.from('sb_events').select('id,status,starts_at,currency')
       .eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||ev.data?.status!=='draft'||Date.parse(ev.data.starts_at)<=Date.now())
       return json(res,{error:'Select a future draft event'},409);
     const tiers=await db.from('sb_event_tiers').select('quantity_total').eq('event_id',ev.data.id);
     const fees=await db.from('sb_event_listing_fees').select('tier_code').eq('event_id',ev.data.id).eq('status','paid').limit(1);
     const exemption=await db.from('sb_event_charity_claims').select('id').eq('event_id',ev.data.id)
       .eq('organiser_profile_id',organisation.id).eq('status','verified').limit(1);
     const freeListing=activeClientDiscount(await clientControl(db,organisation.id))===100;
     if(tiers.error||fees.error||exemption.error||!tiers.data?.length||
        (!fees.data?.length&&!exemption.data?.length&&!freeListing))
       return json(res,{error:'Add tickets and complete either the listing payment or verified charity exemption first'},409);
     const {quoteListing}=await import('./lib/event-listings.js');
     const cap=tiers.data.reduce((sum,row)=>sum+row.quantity_total,0);
     if(exemption.data?.length||freeListing){if(cap>2000)return json(res,{error:'The beta limit is 2,000 tickets per event'},409);}
     else try{quoteListing(ev.data.currency,fees.data[0].tier_code,cap);}
     catch{return json(res,{error:'Event has exceeded the paid listing tier capacity'},409);}
     const saved=await db.from('sb_events').update({status:'published'})
       .eq('id',ev.data.id).eq('status','draft').select('id,status').maybeSingle();
     if(saved.error||!saved.data)return json(res,{error:'Event publication is not approved'},409);
     return json(res,{event:saved.data});
   }
   return json(res,{error:'Unknown organiser operation'},400);
 }catch(error){
   console.error('Organiser API error',error);
   return json(res,{error:'Organiser service temporarily unavailable'},503);
 }
}
