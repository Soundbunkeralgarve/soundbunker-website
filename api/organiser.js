import { requireUser } from './lib/supabase-auth.js';
import { json,parseJson,safeText } from './lib/http.js';
import { localEventInstant } from './lib/events-time.js';
import { eventSlugCandidate } from './lib/event-slug.js';
import { randomBytes } from 'node:crypto';

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
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 const db=ctx.admin;
 try {
   const organisation=await organiserForUser(db,ctx.user.id);
   if(req.method==='GET') {
     if(!organisation)return json(res,{organiser:null,events:[]});
     const ev=await db.from('sb_events').select('id,slug,title,description,venue,starts_at,ends_at,status,country_code,currency,venue_timezone,event_kind,image_url,event_logo_url,headline_artist,venue_city,publish_requested_at')
       .eq('organiser_profile_id',organisation.id).order('starts_at',{ascending:false}).limit(200);
     if(ev.error)throw ev.error;
     const ids=ev.data.map(v=>v.id);
     const tiers=ids.length?await db.from('sb_event_tiers').select('id,event_id,name,price_cents,quantity_total').in('event_id',ids):{data:[],error:null};
     if(tiers.error)throw tiers.error;
     const fees=ids.length?await db.from('sb_event_listing_fees').select('event_id,status,tier_code,amount_cents,currency').in('event_id',ids):{data:[],error:null};
     if(fees.error)throw fees.error;
     const showcases=ids.length
       ?await db.from('sb_event_showcase_requests').select('event_id,status,currency,proposed_amount_cents,requested_at').in('event_id',ids)
       :{data:[],error:null};
     if(showcases.error)throw showcases.error;
     const festivalQuotes=ids.length
       ?await db.from('sb_event_festival_quotes').select('event_id,tier_code,expected_tickets,status,currency,quoted_amount_cents').in('event_id',ids)
       :{data:[],error:null};
     if(festivalQuotes.error)throw festivalQuotes.error;
     const charities=ids.length
       ?await db.from('sb_event_charity_claims').select('event_id,registration_number,status,country_code,created_at').in('event_id',ids)
       :{data:[],error:null};
     if(charities.error)throw charities.error;
     return json(res,{organiser:{
       id:organisation.id,display_name:organisation.display_name,country_code:organisation.country_code,
       status:organisation.status,stripe_connected:!!organisation.stripe_account_id,
       stripe_capabilities_ready:organisation.stripe_capabilities_ready,tax_review_complete:organisation.tax_review_complete
     },events:ev.data.map(e=>({...e,tiers:tiers.data.filter(t=>t.event_id===e.id),fees:fees.data.filter(f=>f.event_id===e.id),showcase:showcases.data.find(f=>f.event_id===e.id)||null,festivalQuote:festivalQuotes.data.find(f=>f.event_id===e.id)||null,charity:charities.data.find(f=>f.event_id===e.id)||null}))});
   }
   if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
   const body=await parseJson(req);
   const action=safeText(body.action,32);
   if(action==='register'){
     if(organisation)return json(res,{error:'Organiser account already exists'},409);
     const display_name=safeText(body.displayName,160),country_code=safeText(body.country,2).toUpperCase();
     if(display_name.length<2||!organiserCountries[country_code]||body.acceptTerms!==true)
       return json(res,{error:'Enter a promoter name, select your country and accept organiser terms'},400);
     const saved=await db.from('sb_event_organisers').insert({owner_user_id:ctx.user.id,display_name,country_code})
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
     if(title.length<3||!venue||!['show','festival','workshop','club','community','comedy','sports','other'].includes(category)||description.length<20)
       return json(res,{error:'Check your event name, link, venue, dates and category'},400);
     const place=organiserCountries[organisation.country_code];
     let startInstant,endInstant;
     try {
       startInstant=localEventInstant(startsAt,place.timezone);
       endInstant=endsAt?localEventInstant(endsAt,place.timezone):null;
     } catch(error){return json(res,{error:error.message},400);}
     if(Date.parse(startInstant)<=Date.now()||(endInstant&&Date.parse(endInstant)<=Date.parse(startInstant)))
       return json(res,{error:'Enter a future event with the end after its start'},400);
     const details={
       title,venue,organiser:organisation.display_name,organiser_profile_id:organisation.id,
       country_code:organisation.country_code,currency:place.currency,venue_timezone:place.timezone,
       starts_at:startInstant,ends_at:endInstant,
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
   if(action==='festivalQuote')return json(res,{error:'We are focusing this BETA on events up to 2,000 tickets. Festival enquiries will open in a later phase.'},503);
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
     if(process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED!=='true')
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
     if(tiers.error||fees.error||exemption.error||!tiers.data?.length||
        (!fees.data?.length&&!exemption.data?.length))
       return json(res,{error:'Add tickets and complete either the listing payment or verified charity exemption first'},409);
     const {quoteListing}=await import('./lib/event-listings.js');
     const cap=tiers.data.reduce((sum,row)=>sum+row.quantity_total,0);
     if(exemption.data?.length){if(cap>2000)return json(res,{error:'The beta limit is 2,000 tickets per event'},409);}
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
