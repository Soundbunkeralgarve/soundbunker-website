import {randomUUID} from 'node:crypto';
import {json,parseJson} from './lib/http.js';
import {eventsDatabase} from './lib/events.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness,ticketBunkerOrigin} from './lib/ticketbunker-stripe.js';
import {AD_PACKAGES} from '../ticketbunker-site/ad-packages.js';
import {adRequest,adImage,liveAds} from './lib/ticketbunker-ads.js';
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

// Public. GET ?place=home|<city slug>: approved adverts running there now.
// POST: book an advert (no account needed) and get a Stripe Checkout link.
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 try{
  const db=eventsDatabase();
  if(req.method==='GET'){
   const place=String(req.query?.place||'home').toLowerCase().slice(0,60);
   if(!/^[a-z0-9-]+$/.test(place))return json(res,{ads:[]});
   return json(res,{ads:await liveAds(db,place)});
  }
  if(!ticketBunkerPaymentsEnabled())return json(res,{error:'Advert bookings are not open yet. Email bookings@theticketbunker.com and we will set it up.'},503);
  const body=await parseJson(req),req1=adRequest(body);
  if(req1.error)return json(res,req1,400);
  const img=adImage(body.image);
  if(img.error)return json(res,img,400);
  // A handful of attempts per address per hour is plenty; this stops form spam.
  const recent=await db.from('tb_ad_bookings').select('id',{count:'exact',head:true}).eq('contact_email',req1.row.contact_email).gt('created_at',new Date(Date.now()-36e5).toISOString());
  if(recent.error)throw recent.error;
  if(recent.count>=5)return json(res,{error:'Too many attempts. Please try again in an hour or email bookings@theticketbunker.com.'},429);
  if(!(await ticketBunkerPlatformReadiness()).ready)throw Error('Stripe platform setup incomplete');
  const id=randomUUID(),storage=db.storage.from('ticket-bunker-media'),path='ads/'+id+'.'+EXT[img.type];
  const up=await storage.upload(path,img.bytes,{contentType:img.type,upsert:false,cacheControl:'86400'});
  if(up.error)throw up.error;
  const image_url=storage.getPublicUrl(path).data.publicUrl;
  const saved=await db.from('tb_ad_bookings').insert({id,...req1.row,image_url}).select('id').single();
  if(saved.error){await storage.remove([path]);throw saved.error;}
  const r=req1.row,plan=AD_PACKAGES[r.package];
  const form=new URLSearchParams({
   mode:'payment',client_reference_id:id,customer_email:r.contact_email,
   // VAT-inclusive pricing without Stripe Managed Payments, like TicketBunker's other checkouts.
   'managed_payments[enabled]':'false',
   success_url:ticketBunkerOrigin+'/advertise?booked=1',cancel_url:ticketBunkerOrigin+'/advertise?cancelled=1',
   'line_items[0][quantity]':'1','line_items[0][price_data][currency]':r.currency,
   'line_items[0][price_data][unit_amount]':String(r.amount_cents),'line_items[0][price_data][tax_behavior]':'inclusive',
   'line_items[0][price_data][product_data][name]':'TicketBunker advert: '+plan.label+' ('+r.weeks+' week'+(r.weeks>1?'s':'')+')',
   'line_items[0][price_data][product_data][description]':r.headline,
   'metadata[purchase_type]':'ad_booking','metadata[ad_booking_id]':id,'payment_intent_data[metadata][ad_booking_id]':id
  });
  const checkout=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',body:form,idem:'ticketbunker-ad-'+id});
  if(checkout.livemode!==true||!/^https:\/\/checkout\.stripe\.com\//.test(checkout.url||''))throw Error('Advert checkout unavailable');
  const linked=await db.from('tb_ad_bookings').update({stripe_session_id:checkout.id}).eq('id',id);
  if(linked.error)throw linked.error;
  return json(res,{url:checkout.url});
 }catch(error){console.error('TicketBunker ads failed',error?.code||error?.message);
  return json(res,req.method==='GET'?{ads:[]}:{error:'Advert booking is unavailable right now. No payment has been taken. Please try again.'},req.method==='GET'?200:503);}
}
