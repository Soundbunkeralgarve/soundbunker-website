import { requireUser } from './lib/supabase-auth.js';
import { json,parseJson,safeText } from './lib/http.js';
import { localEventInstant } from './lib/events-time.js';
import { ownedEventMedia } from './lib/event-media.js';

const uuid=value=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(String(value||''));
const slugOk=value=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const eventKinds=['show','live_music','club','festival','comedy','theatre','conference','arts','sports','family','food','workshop','community','other'];
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
     const ev=await db.from('sb_events').select('id,slug,title,description,venue,starts_at,ends_at,status,country_code,currency,venue_timezone,event_kind,image_url,headline_artist,venue_city,admission_info,event_logo_url')
       .eq('organiser_profile_id',organisation.id).order('starts_at',{ascending:false}).limit(200);
     if(ev.error)throw ev.error;
     const ids=ev.data.map(v=>v.id);
     const tiers=ids.length?await db.from('sb_event_tiers').select('id,event_id,name,price_cents,quantity_total').in('event_id',ids):{data:[],error:null};
     if(tiers.error)throw tiers.error;
     const fees=ids.length?await db.from('sb_event_listing_fees').select('event_id,status,tier_code,amount_cents,currency').in('event_id',ids):{data:[],error:null};
     if(fees.error)throw fees.error;
     return json(res,{organiser:{
       id:organisation.id,display_name:organisation.display_name,country_code:organisation.country_code,logo_url:organisation.logo_url,
       status:organisation.status,stripe_connected:!!organisation.stripe_account_id,
       stripe_capabilities_ready:organisation.stripe_capabilities_ready,tax_review_complete:organisation.tax_review_complete
     },events:ev.data.map(e=>({...e,tiers:tiers.data.filter(t=>t.event_id===e.id),fees:fees.data.filter(f=>f.event_id===e.id)}))});
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
   if(action==='branding'){
     const logo=ownedEventMedia(db,organisation.id,'logo',body.logoUrl);
     if(!logo)return json(res,{error:'Upload a valid logo from your organiser account first'},400);
     const result=await db.from('sb_event_organisers').update({logo_url:logo}).eq('id',organisation.id).eq('owner_user_id',ctx.user.id).select('logo_url').single();
     if(result.error)throw result.error;
     return json(res,{logoUrl:result.data.logo_url});
   }
   if(action==='event'){
     const title=safeText(body.title,160),slug=safeText(body.slug,160).toLowerCase(),venue=safeText(body.venue,180);
     const category=safeText(body.kind,20);
     const startsAt=String(body.startsAt||''),endsAt=String(body.endsAt||'');
     if(title.length<3||!slugOk(slug)||!venue||!eventKinds.includes(category))
       return json(res,{error:'Check your event name, link, venue, dates and category'},400);
     const poster=ownedEventMedia(db,organisation.id,'poster',body.imageUrl);
     const eventLogo=ownedEventMedia(db,organisation.id,'logo',body.eventLogoUrl);
     if(poster===false||eventLogo===false)return json(res,{error:'Upload your poster and logo with TicketBunker first'},400);
     const place=organiserCountries[organisation.country_code];
     let startInstant,endInstant;
     try {
       startInstant=localEventInstant(startsAt,place.timezone);
       endInstant=endsAt?localEventInstant(endsAt,place.timezone):null;
     } catch(error){return json(res,{error:error.message},400);}
     if(Date.parse(startInstant)<=Date.now()||(endInstant&&Date.parse(endInstant)<=Date.parse(startInstant)))
       return json(res,{error:'Enter a future event with the end after its start'},400);
     const saved=await db.from('sb_events').insert({
       title,slug,venue,organiser:organisation.display_name,organiser_profile_id:organisation.id,
       country_code:organisation.country_code,currency:place.currency,venue_timezone:place.timezone,
       starts_at:startInstant,ends_at:endInstant,
       event_kind:category,description:safeText(body.description,4000),
       headline_artist:safeText(body.headliner,180),venue_city:safeText(body.city,130),
       admission_info:safeText(body.admissionInfo,600),
       image_url:poster||null,event_logo_url:eventLogo||organisation.logo_url||null,
       status:'draft'
     }).select('id,slug,title,status').single();
     if(saved.error)return json(res,{error:'Could not create event: check if your event link is taken'},409);
     return json(res,{event:saved.data});
   }
   if(action==='updateDraft'){
     if(!uuid(body.eventId))return json(res,{error:'Select a valid draft event'},400);
     const changes={};
     if(Object.hasOwn(body,'imageUrl')){
       const image=ownedEventMedia(db,organisation.id,'poster',body.imageUrl);
       if(image===false)return json(res,{error:'Invalid event poster'},400);
       changes.image_url=image;
     }
     if(Object.hasOwn(body,'eventLogoUrl')){
       const logo=ownedEventMedia(db,organisation.id,'logo',body.eventLogoUrl);
       if(logo===false)return json(res,{error:'Invalid event logo'},400);
       changes.event_logo_url=logo;
     }
     if(!Object.keys(changes).length)return json(res,{error:'Nothing to update'},400);
     const saved=await db.from('sb_events').update(changes).eq('id',body.eventId).eq('organiser_profile_id',organisation.id).eq('status','draft').select('id').maybeSingle();
     if(saved.error||!saved.data)return json(res,{error:'Only your draft events can be updated'},409);
     return json(res,{event:saved.data});
   }
   if(action==='tier'){
     if(!uuid(body.eventId))return json(res,{error:'Select a valid event'},400);
     const ev=await db.from('sb_events').select('id,status').eq('id',body.eventId).eq('organiser_profile_id',organisation.id).maybeSingle();
     if(ev.error||ev.data?.status!=='draft')return json(res,{error:'Only draft events can add ticket types'},409);
     const name=safeText(body.name,100),price=Number(body.priceCents),capacity=Number(body.capacity);
     if(!name||!Number.isInteger(price)||price<100||price>10000000||!Number.isInteger(capacity)||capacity<1||capacity>100000)
       return json(res,{error:'Enter a valid price and capacity'},400);
     const saved=await db.from('sb_event_tiers').insert({event_id:ev.data.id,name,price_cents:price,quantity_total:capacity})
       .select('id,name,price_cents,quantity_total').single();
     if(saved.error)throw saved.error;
     return json(res,{tier:saved.data});
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
     if(tiers.error||fees.error||!tiers.data?.length||!fees.data?.length)
       return json(res,{error:'Add tickets and complete the event listing payment first'},409);
     const {quoteListing}=await import('./lib/event-listings.js');
     const cap=tiers.data.reduce((sum,row)=>sum+row.quantity_total,0);
     try{quoteListing(ev.data.currency,fees.data[0].tier_code,cap);}
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
