import { json } from './lib/http.js';
import { eventsDatabase } from './lib/events.js';
export default async function handler(req,res) {
  if(req.method!=='GET') return json(res,{error:'Method not allowed'},405);
  try {
    const db=eventsDatabase();
    const event=await db.from('sb_events').select('id,slug,title,description,organiser,venue,image_url,starts_at,ends_at')
      .eq('status','published').gt('starts_at',new Date().toISOString()).order('starts_at',{ascending:true}).limit(60);
    if(event.error) throw event.error;
    const ids=event.data.map(e=>e.id);
    const tiers=ids.length?await db.from('sb_event_tiers').select('id,event_id,name,price_cents,quantity_total').in('event_id',ids):{data:[],error:null};
    if(tiers.error) throw tiers.error;
    const orders=tiers.data.length?await db.from('sb_event_orders').select('tier_id,quantity,status,reserved_until').in('tier_id',tiers.data.map(t=>t.id)):{data:[],error:null};
    if(orders.error) throw orders.error;
    const now=Date.now();
    return json(res,{events:event.data.map(e=>({...e,tiers:tiers.data.filter(t=>t.event_id===e.id).map(t=>({
      id:t.id,name:t.name,price_cents:t.price_cents,
      remaining:Math.max(0,t.quantity_total-orders.data.filter(o=>o.tier_id===t.id&&(o.status==='paid'||o.status==='needs_attention'||(o.status==='reserved'&&Date.parse(o.reserved_until)>now))).reduce((n,o)=>n+o.quantity,0))
    }))}))});
  } catch(error){console.error('Events list failed',error);return json(res,{error:'Events are temporarily unavailable'},503);}
}
