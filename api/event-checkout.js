import { json,parseJson,safeText,validEmail } from './lib/http.js';
import { eventsDatabase } from './lib/events.js';
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
  // Public BETA safety: never initiate payments or Connect onboarding.
  return json(res,{error:'SoundBunker Events is in BETA. Checkout and payments are not live.'},503);
  let order;
  try{
    if(!process.env.STRIPE_SECRET_KEY)return json(res,{error:'Ticket checkout is not configured'},503);
    const input=await parseJson(req);
    const tier=String(input.tier||''),quantity=Number(input.quantity),
      name=safeText(input.name,120),email=safeText(input.email,200).toLowerCase();
    if(!/^[a-f0-9-]{36}$/i.test(tier)||!Number.isInteger(quantity)||quantity<1||quantity>8||name.length<2||!validEmail(email))
      return json(res,{error:'Check ticket selection, name and email'},400);
    const db=eventsDatabase();
    const reserved=await db.rpc('sb_reserve_event_tickets',{p_tier:tier,p_name:name,p_email:email,p_quantity:quantity});
    if(reserved.error)return json(res,{error:'These tickets are no longer available. Please refresh.'},409);
    order=reserved.data;
    const product=await db.from('sb_events').select('id,title,status,currency,organiser_profile_id').eq('id',order.event_id).single();
    const level=await db.from('sb_event_tiers').select('name').eq('id',order.tier_id).single();
    if(product.error||level.error||product.data.status!=='published'||order.currency!==product.data.currency)
      throw Error('Ticket details are unavailable');
    let merchant=null;
    if(product.data.organiser_profile_id){
      if(process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED!=='true')
        return json(res,{error:'This organiser is not yet enabled for ticket payments'},503);
      const org=await db.from('sb_event_organisers').select('id,status,stripe_account_id,stripe_capabilities_ready,tax_review_complete')
        .eq('id',product.data.organiser_profile_id).single();
      const paid=await db.from('sb_event_listing_fees').select('id').eq('event_id',order.event_id)
        .eq('organiser_profile_id',product.data.organiser_profile_id).eq('status','paid').limit(1);
      if(org.error||paid.error||org.data?.status!=='approved'||!org.data?.stripe_capabilities_ready||
        !org.data?.tax_review_complete||!paid.data?.length||!/^acct_[A-Za-z0-9]+$/.test(org.data.stripe_account_id||''))
        return json(res,{error:'This event organiser is not approved for ticket sales'},403);
      merchant=org.data.stripe_account_id;
    }
    const origin=(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
    const form=new URLSearchParams({
      mode:'payment',customer_email:email,client_reference_id:order.id,
      success_url:origin+'/events.html?checkout=success',cancel_url:origin+'/events.html?checkout=cancelled',
      expires_at:String(Math.floor(Date.now()/1000)+1805),
      'line_items[0][quantity]':String(quantity),
      'line_items[0][price_data][currency]':order.currency,
      'line_items[0][price_data][unit_amount]':String(order.total_cents/quantity),
      'line_items[0][price_data][product_data][name]':product.data.title+' — '+level.data.name,
      'metadata[purchase_type]':'event_ticket','metadata[event_order_id]':order.id
    });
    const result=await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded',...(merchant?{'Stripe-Account':merchant}:{})},body:form
    });
    const session=await result.json();
    if(!result.ok||!session.url||!session.id)throw Error('Stripe checkout could not be created');
    const saved=await db.from('sb_event_orders').update({stripe_session_id:session.id,stripe_connected_account:merchant})
       .eq('id',order.id).eq('status','reserved').select('id').maybeSingle();
    if(saved.error)throw Error('Could not save checkout session');
    return json(res,{url:session.url});
  }catch(error){
    if(order?.id) {try{await eventsDatabase().from('sb_event_orders').update({status:'cancelled'}).eq('id',order.id).eq('status','reserved').is('stripe_session_id',null)}catch{}}
    console.error('Event checkout error',error);
    return json(res,{error:'Unable to start checkout. Please try again.'},503);
  }
}
