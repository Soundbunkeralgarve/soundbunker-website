import { json } from './lib/http.js';
import { eventsDatabase } from './lib/events.js';
export default async function handler(req,res) {
  if(req.method!=='GET') return json(res,{error:'Method not allowed'},405);
  try {
    const db=eventsDatabase();
    const event=await db.from('sb_events').select('id,slug,title,description,organiser,venue,image_url,event_logo_url,headline_artist,venue_city,starts_at,ends_at,country_code,currency,venue_timezone,event_kind,status,public_beta_test,beta_test_expires_at,organiser_profile_id')
      .eq('internal_free_test',false)
      .or('status.eq.published,public_beta_test.eq.true')
      .order('starts_at',{ascending:true}).limit(60);
    if(event.error) throw event.error;
    const now=Date.now();
    const visible=event.data.filter(e=>
      (e.status==='published'&&Date.parse(e.starts_at)>now)||
      (e.status==='draft'&&e.public_beta_test&&Date.parse(e.beta_test_expires_at)>now));
    const ids=visible.map(e=>e.id);
    const organiserIds=[...new Set(visible.map(e=>e.organiser_profile_id).filter(Boolean))];
    const logos=organiserIds.length?await db.from('sb_event_organisers').select('id,logo_url').in('id',organiserIds):{data:[],error:null};
    if(logos.error)throw logos.error;
    const logoMap=new Map((logos.data||[]).map(x=>[x.id,x.logo_url]));
    // Only paid Premium Placements are granted featured-position priority.
    const promotions=ids.length?await db.from('sb_event_showcase_requests')
      .select('event_id').in('event_id',ids).in('status',['paid','scheduled','live']).not('paid_at','is',null)
      :{data:[],error:null};
    if(promotions.error)throw promotions.error;
    const featured=new Set(promotions.data.map(p=>p.event_id));
    const tiers=ids.length?await db.from('sb_event_tiers').select('id,event_id,name,price_cents,quantity_total').in('event_id',ids):{data:[],error:null};
    if(tiers.error) throw tiers.error;
    const inventory=await db.rpc('sb_event_inventory');
    if(inventory.error) throw inventory.error;
    const used=new Map((inventory.data||[]).map(row=>[row.tier_id,Number(row.used_count)]));
    return json(res,{events:visible.map(e=>({
      ...e,event_logo_url:e.event_logo_url||logoMap.get(e.organiser_profile_id)||null,featured:featured.has(e.id),public_beta_test:e.public_beta_test===true,
      beta_test_expires_at:undefined,
      tiers:tiers.data.filter(t=>t.event_id===e.id).map(t=>({
       id:t.id,name:t.name,
       price_cents:e.public_beta_test?0:t.price_cents,
       remaining:Math.max(0,(e.public_beta_test?Math.min(t.quantity_total,50):t.quantity_total)-(used.get(t.id)||0))
      }))
    }))});
  } catch(error){console.error('Events list failed',error);return json(res,{error:'Events are temporarily unavailable'},503);}
}
