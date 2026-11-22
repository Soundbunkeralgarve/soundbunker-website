import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {ticketBunkerStripe,ticketBunkerPlatformReadiness,ticketBunkerOrigin} from './lib/ticketbunker-stripe.js';
import {VIP_PRICES,VIP_PERKS,vipSalesEnabled,vipView} from './lib/ticketbunker-vip.js';
const CUS=/^cus_[A-Za-z0-9]+$/;

// GET: prices, perks and your own membership. POST actions:
//  interest  – tell me when VIP opens (no payment)
//  checkout  – start a Stripe subscription (only once VIP sales are switched on)
//  manage    – open Stripe's billing page to update the card or cancel
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your account email first'},403);
 const db=ctx.admin,userId=ctx.user.id,email=String(ctx.user.email||'').trim().toLowerCase();
 try{
  const current=await db.from('tb_vip_members').select('*').eq('user_id',userId).maybeSingle();
  if(current.error)throw current.error;
  const view=()=>({salesOpen:vipSalesEnabled(),prices:VIP_PRICES,perks:VIP_PERKS,...vipView(current.data)});
  if(req.method==='GET')return json(res,view());
  const body=await parseJson(req),action=body.action;
  if(action==='interest'){
   if(!current.data){const saved=await db.from('tb_vip_members').insert({user_id:userId,email,status:'interested'});if(saved.error)throw saved.error;}
   return json(res,{...view(),interested:true});
  }
  if(action==='checkout'){
   if(!vipSalesEnabled())return json(res,{error:'VIP is not open yet. We will email you when it is.'},503);
   if(vipView(current.data).member)return json(res,{error:'You are already a VIP member.'},409);
   const plan=body.plan,currency=body.currency;
   if(!VIP_PRICES[plan]||!['eur','gbp'].includes(currency))return json(res,{error:'Choose monthly or yearly, in euros or pounds.'},400);
   if(!(await ticketBunkerPlatformReadiness()).ready)throw Error('Stripe platform setup incomplete');
   const meta={'purchase_type':'vip_membership','user_id':userId};
   const form=new URLSearchParams({
    mode:'subscription',client_reference_id:userId,
    success_url:ticketBunkerOrigin+'/vip?joined=1',cancel_url:ticketBunkerOrigin+'/vip?cancelled=1',
    'line_items[0][quantity]':'1',
    'line_items[0][price_data][currency]':currency,
    'line_items[0][price_data][unit_amount]':String(VIP_PRICES[plan][currency]),
    'line_items[0][price_data][tax_behavior]':'inclusive',
    'line_items[0][price_data][recurring][interval]':plan==='yearly'?'year':'month',
    'line_items[0][price_data][product_data][name]':'TicketBunker VIP '+(plan==='yearly'?'(yearly)':'(monthly)'),
    // On both the checkout and the subscription, so renewals can be matched later.
    ...Object.fromEntries(Object.entries(meta).flatMap(([k,v])=>[['metadata['+k+']',v],['subscription_data[metadata]['+k+']',v]]))
   });
   if(CUS.test(current.data?.stripe_customer_id||''))form.set('customer',current.data.stripe_customer_id);else form.set('customer_email',email);
   const checkout=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',body:form,idem:'ticketbunker-vip-'+userId+'-'+plan+'-'+currency+'-'+new Date().toISOString().slice(0,13)});
   if(checkout.livemode!==true||!/^https:\/\/checkout\.stripe\.com\//.test(checkout.url||''))throw Error('VIP secure checkout unavailable');
   return json(res,{url:checkout.url});
  }
  if(action==='manage'){
   if(!CUS.test(current.data?.stripe_customer_id||''))return json(res,{error:'No VIP billing to manage yet.'},404);
   const portal=await ticketBunkerStripe('/v1/billing_portal/sessions',{method:'POST',body:{customer:current.data.stripe_customer_id,return_url:ticketBunkerOrigin+'/vip'}});
   if(!/^https:\/\/billing\.stripe\.com\//.test(portal.url||''))throw Error('Billing page unavailable');
   return json(res,{url:portal.url});
  }
  return json(res,{error:'Unknown VIP action'},400);
 }catch(error){console.error('TicketBunker VIP failed',error?.code||error?.message);
  return json(res,{error:'VIP is unavailable right now. No payment has been taken. Please try again.'},503);}
}
