import { requireUser } from './lib/supabase-auth.js';
import { json,parseJson,safeText } from './lib/http.js';

const uuid=value=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(String(value||''));
const slugOk=value=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
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
     const ev=await db.from('sb_events').select('id,slug,title,description,venue,starts_at,ends_at,status,country_code,currency,venue_timezone,event_kind,image_url')
       .eq('organiser_profile_id',organisation.id).order('starts_at',{ascending:false}).limit(200);
     if(ev.error)throw ev.error;
     const ids=ev.data.map(v=>v.id);
     const tiers=ids.length?await db.from('sb_event_tiers').select('id,event_id,name,price_cents,quantity_total').in('event_id',ids):{data:[],error:null};
     if(tiers.error)throw tiers.error;
     const fees=ids.length?await db.from('sb_event_listing_fees').select('event_id,status,tier_code,amount_cents,currency').in('event_id',ids):{data:[],error:null};
     if(fees.error)throw fees.error;
     return json(res,{organiser:{
       id:organisation.id,display_name:organisation.display_name,country_code:organisation.country_code,
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
   if(action==='event'){
     const title=safeText(body.title,160),slug=safeText(body.slug,160).toLowerCase(),venue=safeText(body.venue,180);
     const category=safeText(body.kind,20);
     const startsAt=String(body.startsAt||''),endsAt=String(body.endsAt||'');
     if(title.length<3||!slugOk(slug)||!venue||!['show','festival','workshop','club','community'].includes(category)||
       !Number.isFinite(Date.parse(startsAt))||Date.parse(startsAt)<=Date.now()||
       (endsAt&&(!Number.isFinite(Date.parse(endsAt))||Date.parse(endsAt)<=Date.parse(startsAt))))
       return json(res,{error:'Check your event name, link, venue, dates and category'},400);
     const place=organiserCountries[organisation.country_code];
     const saved=await db.from('sb_events').insert({
       title,slug,venue,organiser:organisation.display_name,organiser_profile_id:organisation.id,
       country_code:organisation.country_code,currency:place.currency,venue_timezone:place.timezone,
       starts_at:new Date(startsAt).toISOString(),ends_at:endsAt?new Date(endsAt).toISOString():null,
       event_kind:category,description:safeText(body.description,4000),
       image_url:/^https:\/\/[^\s]+$/i.test(body.imageUrl||'')?safeText(body.imageUrl,900):null,
       status:'draft'
     }).select('id,slug,title,status').single();
     if(saved.error)return json(res,{error:'Could not create event: check if your event link is taken'},409);
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
   return json(res,{error:'Unknown organiser operation'},400);
 }catch(error){
   console.error('Organiser API error',error);
   return json(res,{error:'Organiser service temporarily unavailable'},503);
 }
}
