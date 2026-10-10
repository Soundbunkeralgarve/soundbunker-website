import { json,parseJson,safeText } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
const idOk=v=>/^[a-f0-9-]{36}$/i.test(String(v||''));
export default async function handler(req,res){
  const ctx=await requireAdmin(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
  try {
    const db=ctx.admin;
    if(req.method==='GET'){
      const [events,tiers,orders,tickets]=await Promise.all([
        db.from('sb_events').select('*').order('starts_at',{ascending:false}).limit(200),
        db.from('sb_event_tiers').select('*').limit(500),
        db.from('sb_event_orders').select('event_id,tier_id,quantity,status').limit(5000),
        db.from('sb_event_tickets').select('event_id,checked_in_at').limit(10000)
      ]);
      if([events,tiers,orders,tickets].some(x=>x.error))throw Error('Events database is not ready');
      const [charities,organisers]=await Promise.all([
        db.from('sb_event_charity_claims').select('id,event_id,organiser_profile_id,country_code,registration_number,status,created_at,reviewed_at,reviewer_notes').order('created_at',{ascending:false}).limit(200),
        db.from('sb_event_organisers').select('id,display_name,country_code').limit(300)
      ]);
      if(charities.error||organisers.error)throw Error('Charity review service is not configured');
      return json(res,{events:events.data,tiers:tiers.data,orders:orders.data,tickets:tickets.data,
        charities:charities.data,organisers:organisers.data});
    }
    if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
    const input=await parseJson(req),action=safeText(input.action,24);
    if(action==='charityReview'){
      // This endpoint is protected by requireAdmin, never exposed to event organisers.
      if(!idOk(input.claimId)||!['verified','rejected'].includes(input.decision))
        return json(res,{error:'Choose a charity application and approve or reject it'},400);
      const status=input.decision;
      const reviewedAt=new Date().toISOString();
      const saved=await db.from('sb_event_charity_claims').update({
        status,reviewed_at:reviewedAt,reviewed_by:ctx.user.id,
        reviewer_notes:safeText(input.notes,500)
      }).eq('id',input.claimId).eq('status','pending_review')
       .select('id,status').maybeSingle();
      if(saved.error)throw saved.error;
      if(!saved.data)return json(res,{error:'This application has already been reviewed or cannot be found'},409);
      return json(res,{charityReview:saved.data});
    }
    if(action==='create'){
      const title=safeText(input.title,160),slug=safeText(input.slug,160).toLowerCase(),
        startsAt=String(input.startsAt||''),venue=safeText(input.venue,180)||'The Hub Culture, Loulé';
      if(title.length<3||!(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))||!Number.isFinite(Date.parse(startsAt))||Date.parse(startsAt)<=Date.now())
        return json(res,{error:'Enter a valid title, URL slug and future date'},400);
      const added=await db.from('sb_events').insert({
        title,slug,starts_at:new Date(startsAt).toISOString(),venue,
        description:safeText(input.description,4000),organiser:safeText(input.organiser,140)||'SoundBunker Algarve',
        image_url: /^https:\/\//.test(String(input.imageUrl||''))?safeText(input.imageUrl,900):null
      }).select('*').single();
      if(added.error)return json(res,{error:'Could not create event (the URL slug might already exist)'},409);
      return json(res,{event:added.data});
    }
    if(action==='tier'){
      if(!idOk(input.eventId))return json(res,{error:'Invalid event'},400);
      const name=safeText(input.name,100),price=Number(input.priceCents),qty=Number(input.capacity);
      if(!name||!Number.isInteger(price)||price<100||!Number.isInteger(qty)||qty<1||qty>100000)
        return json(res,{error:'Enter a ticket name, price (minimum €1) and capacity'},400);
      const exists=await db.from('sb_events').select('id,status').eq('id',input.eventId).single();
      if(exists.error||exists.data?.status!=='draft')return json(res,{error:'Ticket types can only be added before publishing'},409);
      const added=await db.from('sb_event_tiers').insert({event_id:input.eventId,name,price_cents:price,quantity_total:qty}).select('*').single();
      if(added.error)throw added.error;return json(res,{tier:added.data});
    }
    if(action==='publish'){
      if(!idOk(input.eventId))return json(res,{error:'Invalid event'},400);
      const found=await db.from('sb_events').select('id,starts_at,status').eq('id',input.eventId).single();
      const tier=await db.from('sb_event_tiers').select('id').eq('event_id',input.eventId).limit(1);
      if(found.error||found.data.status!=='draft'||Date.parse(found.data.starts_at)<=Date.now()||tier.error||!tier.data?.length)
        return json(res,{error:'Add a ticket type and future date before publishing'},409);
      const updated=await db.from('sb_events').update({status:'published'}).eq('id',input.eventId).eq('status','draft').select('*').single();
      if(updated.error)throw updated.error;return json(res,{event:updated.data});
    }
    return json(res,{error:'Unknown action'},400);
  }catch(err){console.error('Events admin error',err);return json(res,{error:'Could not process event request'},503);}
}
