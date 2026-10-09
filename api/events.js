import { json } from './lib/http.js';
import { eventsDatabase } from './lib/events.js';
export default async function handler(req,res) {
  if(req.method!=='GET') return json(res,{error:'Method not allowed'},405);
  try {
    const db=eventsDatabase();
    const event=await db.from('sb_events').select('id,slug,title,description,organiser,venue,image_url,starts_at,ends_at,country_code,currency,venue_timezone,event_kind,venue_city,headline_artist,event_logo_url')
      .eq('status','published').gt('starts_at',new Date().toISOString()).order('starts_at',{ascending:true}).limit(60);
    if(event.error) throw event.error;
    const ids=event.data.map(e=>e.id);
    const tiers=ids.length?await db.from('sb_event_tiers').select('id,event_id,name,price_cents,quantity_total').in('event_id',ids):{data:[],error:null};
    if(tiers.error) throw tiers.error;
    const inventory=await db.rpc('sb_event_inventory');
    if(inventory.error) throw inventory.error;
    const used=new Map((inventory.data||[]).map(row=>[row.tier_id,Number(row.used_count)]));
    return json(res,{events:event.data.map(e=>({...e,tiers:tiers.data.filter(t=>t.event_id===e.id).map(t=>({
      id:t.id,name:t.name,price_cents:t.price_cents,
      remaining:Math.max(0,t.quantity_total-(used.get(t.id)||0))
    }))}))});
  } catch(error){console.error('Events list failed',error);return json(res,{error:'Events are temporarily unavailable'},503);}
}
