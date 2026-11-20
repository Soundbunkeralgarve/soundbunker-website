import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson,safeText} from './lib/http.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness,ticketBunkerOrigin} from './lib/ticketbunker-stripe.js';
import {fulfilBundleCheckout} from './lib/event-listings.js';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PLAN_NAMES={mini:'Mini',starter:'Starter',club:'Club',standard:'Standard',headline:'Headline',event_plus:'Event Plus'};

// Pays a saved bundle quote upfront. The bundle is invoiced once and each event then uses one prepaid listing.
async function payBundle(ctx,id){
 if(!ticketBunkerPaymentsEnabled()||process.env.EVENT_LISTING_PAYMENTS_ENABLED!=='true')return [{error:'Online bundle payments are not available yet. We will confirm your bundle with you.'},503];
 if(!ID.test(id))return [{error:'Invalid reservation reference'},400];
 const found=await ctx.admin.from('tb_event_prebookings').select('*').eq('id',id).eq('owner_user_id',ctx.user.id).maybeSingle();
 if(found.error)throw found.error;
 const b=found.data;
 if(!b)return [{error:'Reservation not found'},404];
 if(b.status==='paid')return [{status:'paid'},200];
 if(!['requested','approved'].includes(b.status)||b.plan==='usage'||!PLAN_NAMES[b.plan]||!(b.total_cents>0))return [{error:'This reservation cannot be paid online. Contact us to arrange it.'},409];
 if(Date.parse(b.quote_valid_until)<=Date.now())return [{error:'This quote has expired. Save a new pre-booking to get today’s price.'},409];
 const org=await ctx.admin.from('sb_event_organisers').select('id,status,tax_review_complete').eq('owner_user_id',ctx.user.id).maybeSingle();
 if(org.error)throw org.error;
 const billing=org.data?await ctx.admin.from('tb_organiser_billing').select('legal_name,billing_email,address_line_1,city,postal_code').eq('organiser_profile_id',org.data.id).maybeSingle():{data:null};
 if(billing.error)throw billing.error;
 const billingDone=!!billing.data&&['legal_name','billing_email','address_line_1','city','postal_code'].every(k=>String(billing.data[k]||'').trim());
 if(org.data?.status!=='approved'||!org.data.tax_review_complete||!billingDone)return [{error:'Finish your organiser account setup, including billing details, before paying for a bundle.',code:'setup_required'},403];
 if(!(await ticketBunkerPlatformReadiness()).ready)return [{error:'Online bundle payments are temporarily unavailable. Please try again later.'},503];
 if(b.stripe_session_id){
  const existing=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(b.stripe_session_id));
  if(existing.status==='open'&&existing.url)return [{url:existing.url},200];
  if(existing.status==='complete'&&existing.payment_status==='paid'){await fulfilBundleCheckout(existing,ctx.admin);return [{status:'paid'},200];}
 }
 const name=b.event_count+' prepaid '+PLAN_NAMES[b.plan]+' events';
 const form={mode:'payment',customer_email:ctx.user.email,client_reference_id:b.id,
  success_url:ticketBunkerOrigin+'/pricing?bundle=paid#your-reservations',cancel_url:ticketBunkerOrigin+'/pricing?bundle=cancelled#your-reservations',
  expires_at:String(Math.floor(Date.now()/1000)+1805),
  'line_items[0][quantity]':'1','line_items[0][price_data][currency]':b.currency,'line_items[0][price_data][unit_amount]':String(b.total_cents),
  'line_items[0][price_data][tax_behavior]':'inclusive','line_items[0][price_data][product_data][name]':'TicketBunker event bundle · '+name,
  'line_items[0][price_data][product_data][description]':'Use one prepaid event listing per event within 12 months of payment.',
  'tax_id_collection[enabled]':'true',customer_creation:'always',
  'metadata[purchase_type]':'listing_bundle','metadata[prebooking_id]':b.id};
 const session=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',body:form,idem:'tb-bundle-'+b.id+'-'+(b.stripe_session_id||'first')});
 if(session.livemode!==true||!/^https:\/\/checkout\.stripe\.com\//.test(session.url||''))throw Error('Stripe bundle checkout was unavailable');
 let attach=ctx.admin.from('tb_event_prebookings').update({stripe_session_id:session.id,organiser_id:org.data.id}).eq('id',b.id).in('status',['requested','approved']);
 attach=b.stripe_session_id?attach.eq('stripe_session_id',b.stripe_session_id):attach.is('stripe_session_id',null);
 const saved=await attach.select('id').maybeSingle();
 if(saved.error||!saved.data)return [{error:'This bundle payment changed. Refresh and try again.'},409];
 return [{url:session.url},200];
}

export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your email first'},403);
 try{
  if(req.method==='GET'){const r=await ctx.admin.from('tb_event_prebookings').select('*').eq('owner_user_id',ctx.user.id).order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;return json(res,{reservations:r.data});}
  const b=await parseJson(req);
  if(b.action==='pay'){const [body,status]=await payBundle(ctx,String(b.id||''));return json(res,body,status);}
  if(!/^[a-f0-9-]{36}$/i.test(b.requestId||''))return json(res,{error:'Invalid reservation reference'},400);
  const r=await ctx.admin.rpc('tb_reserve_events',{p_id:b.requestId,p_owner:ctx.user.id,p_plan:String(b.plan||''),p_currency:String(b.currency||''),p_count:Number(b.count),p_code:safeText(b.code,32),p_notes:safeText(b.notes,1500)});
  if(r.error){const allowed=['Choose a valid plan','Verify your email before reserving','Discount code is unavailable','Discount code usage limit reached','You already have ten open reservations','Usage pricing is quoted separately; codes and bundles do not apply'];return json(res,{error:allowed.find(v=>r.error.message?.includes(v))||'Could not reserve this plan. Please retry.'},400);}
  return json(res,{reservation:r.data,message:r.data.plan==='usage'?'Pre-booking saved. No payment taken. We will confirm your event dates, eligibility, tax and payment terms before activation.':'Quote saved. Pay now to activate your prepaid events, or come back within 30 days.'},201);
 }catch(error){console.error('Bundle request failed',{message:error?.message});return json(res,{error:'Pre-booking service temporarily unavailable'},503);}
}
