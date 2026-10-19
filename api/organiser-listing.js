import {clientControl,activeClientDiscount} from './lib/ticketbunker-owner.js';
import { requireUser } from './lib/supabase-auth.js';
import { organiserForUser } from './organiser.js';
import { quoteListing } from './lib/event-listings.js';
import { json,parseJson } from './lib/http.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness} from './lib/ticketbunker-stripe.js';
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ticketBunkerPaymentsEnabled()||process.env.EVENT_LISTING_PAYMENTS_ENABLED!=='true')
   return json(res,{error:'Event listing payments are not yet enabled'},503);
 try{
   if(!(await ticketBunkerPlatformReadiness()).ready)return json(res,{error:'Complete live Stripe platform setup first'},503);
   const input=await parseJson(req),org=await organiserForUser(ctx.admin,ctx.user.id);
   if(!org||org.status!=='approved'||!org.stripe_account_id||!org.stripe_capabilities_ready||!org.tax_review_complete)
     return json(res,{error:'Complete organiser verification before publishing'},403);
   const event=await ctx.admin.from('sb_events').select('id,title,status,currency')
     .eq('id',input.eventId).eq('organiser_profile_id',org.id).maybeSingle();
   if(event.error||event.data?.status!=='draft')return json(res,{error:'Event must be a valid draft'},409);
   const tiers=await ctx.admin.from('sb_event_tiers').select('quantity_total').eq('event_id',event.data.id);
   if(tiers.error||!tiers.data.length)return json(res,{error:'Add at least one ticket type'},409);
   const capacity=tiers.data.reduce((a,b)=>a+b.quantity_total,0);
   let plan;try{plan=quoteListing(event.data.currency,input.plan,capacity)}
   catch(e){return json(res,{error:e.message},400);}
   const discount=activeClientDiscount(await clientControl(ctx.admin,org.id));
   if(discount===100)return json(res,{waived:true,message:'Your approved account has free fixed-band listings. No listing payment is required.'});
   plan={...plan,amount:plan.amount-Math.round(plan.amount*discount/100)};
   // Festival / Festival Pro cannot use an automatic published price.
   // A bespoke agreement and separate authorised fee flow must be implemented.
   if(!Number.isSafeInteger(plan.amount)||plan.amount<=0)
     return json(res,{error:'Festival and Festival Pro require a personal quote before any payment can be collected'},409);
   const existing=await ctx.admin.from('sb_event_listing_fees').select('id,status,created_at')
     .eq('event_id',event.data.id).in('status',['pending','paid']).order('created_at',{ascending:false}).limit(1);
   if(existing.error)throw existing.error;
   if(existing.data.some(f=>f.status==='paid'))return json(res,{error:'This event listing has already been paid'},409);
   if(existing.data.some(f=>Date.parse(f.created_at)>Date.now()-37*60000))
     return json(res,{error:'A listing checkout is already pending. Please use the existing session or try later.'},409);
   for(const pending of existing.data)await ctx.admin.from('sb_event_listing_fees')
     .update({status:'expired'}).eq('id',pending.id).eq('status','pending');
   const created=await ctx.admin.from('sb_event_listing_fees').insert({
     event_id:event.data.id,organiser_profile_id:org.id,tier_code:plan.tier,amount_cents:plan.amount,currency:plan.currency
   }).select('*').single();
   if(created.error)throw Error('Could not reserve event listing payment');
   const row=created.data;
   const origin='https://theticketbunker.com';
   const form=new URLSearchParams({
     mode:'payment',customer_email:ctx.user.email,client_reference_id:row.id,
     success_url:origin+'/organiser?listing=success&event='+event.data.id,cancel_url:origin+'/organiser?listing=cancelled&event='+event.data.id,
     expires_at:String(Math.floor(Date.now()/1000)+1805),
     'line_items[0][quantity]':'1',
     'line_items[0][price_data][currency]':plan.currency,
     'line_items[0][price_data][unit_amount]':String(plan.amount),
     'line_items[0][price_data][tax_behavior]':'inclusive',
     'line_items[0][price_data][product_data][name]':'TicketBunker '+plan.label+' event listing',
     'line_items[0][price_data][product_data][description]':event.data.title,
     'tax_id_collection[enabled]':'true',
     'customer_creation':'always',
     'metadata[purchase_type]':'event_listing_fee',
     'metadata[event_listing_id]':row.id,
     'metadata[event_id]':event.data.id
   });
   const stripe=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',body:form,idem:'listing-fee-'+row.id});
   if(stripe.livemode!==true||!/^https:\/\/checkout\.stripe\.com\//.test(stripe.url||''))throw Error('Stripe listing checkout was unavailable');
   const saved=await ctx.admin.from('sb_event_listing_fees')
     .update({stripe_session_id:stripe.id}).eq('id',row.id).eq('status','pending');
   if(saved.error)throw Error('Could not attach Stripe listing checkout');
   return json(res,{url:stripe.url});
 }catch(error){console.error('Event listing checkout failed',error);return json(res,{error:'Could not start event listing payment'},503);}
}
