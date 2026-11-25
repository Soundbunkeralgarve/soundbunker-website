import {supplierForUrl} from './partner-booking-suppliers.js';

// Opening a supplier is a saved link, never evidence that a purchase happened.
export function bookingDraft(anchor, doc=document) {
  const supplier=supplierForUrl(anchor.href);
  if(!supplier||anchor.closest('[data-partner-booking-actions],[data-partner-no-save]'))return null;
  const card=anchor.closest('[data-partner-title],.offer-card,.guide-card,.tb-builder-provider,.tb-builder-offer,.fare-card,.partner-card');
  let listing;
  try {listing=JSON.parse(doc.getElementById('listing-data')?.textContent||'null');}catch{}
  // Listing metadata applies only to that listing's supplier, never to extras
  // such as a hotel link displayed underneath the same event.
  const isListing=listing&&supplierForUrl(listing.url)?.id===supplier.id;
  const title=(card?.dataset.partnerTitle||card?.querySelector('h2,h3,h4')?.textContent||
    (isListing?listing.title:'')||anchor.textContent||supplier.name).trim().slice(0,200);
  return {action:'save',source:'click',providerId:supplier.id,providerName:supplier.name,
    title:title||supplier.name,bookingUrl:anchor.href,
    ...(isListing?{listingId:String(listing.id||listing.listingId||'').slice(0,160),
      startsAt:listing.startsAt||null,venue:[listing.venue,listing.city].filter(Boolean).join(', ').slice(0,220)}:{})};
}

let ready;
async function existingSession() {
  // Do not make every anonymous browse load the auth library or send a request.
  try {if(!localStorage.getItem('sb-mshjykmopgvvupmymgxb-auth-token'))return null;}catch{return null;}
  ready ||= (async()=>{
    if(!window.supabase)await new Promise((resolve,reject)=>{
      let script=document.querySelector('script[src="/vendor/supabase.js"]');
      if(!script){script=document.createElement('script');script.src='/vendor/supabase.js';script.async=true;document.head.append(script);}
      script.addEventListener('load',resolve,{once:true});script.addEventListener('error',reject,{once:true});
    });
    const {authClient}=await import('./shared.js');return authClient();
  })().catch(error=>{ready=null;throw error;});
  const sb=await ready;
  const {data,error}=await sb.auth.getSession();
  return error?null:data.session;
}
function savedNotice() {
  let box=document.getElementById('partner-saved-notice');
  if(!box){
    box=document.createElement('div');box.id='partner-saved-notice';box.setAttribute('role','status');
    box.style.cssText='position:fixed;bottom:max(24px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(440px,calc(100% - 32px));padding:16px 20px;border:1px solid #29725d;border-radius:12px;background:#0b2019;color:#fff;font:400 14px/1.5 Arial,sans-serif;box-shadow:0 8px 32px #0006;z-index:9990';
    const text=document.createElement('span');text.textContent='Partner link saved. Add your confirmation after booking. ';
    const link=document.createElement('a');link.href='/my-tickets';link.textContent='My tickets & bookings';link.style.cssText='color:#00e0a6;font-weight:700';
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Dismiss saved link notice');close.style.cssText='float:right;margin:-8px -8px 0 8px;border:0;background:none;color:#fff;font-size:24px;padding:8px;cursor:pointer';close.onclick=()=>box.remove();
    box.append(close,text,link);document.body.append(box);
  }
}
const pending=new Set(),recent=new Map();
export function wirePartnerBookingCapture(doc=document) {
  const warm=e=>{const a=e.target.closest?.('a[href]');if(a&&supplierForUrl(a.href))existingSession().catch(()=>{});};
  doc.addEventListener('pointerdown',warm,{passive:true});
  const capture=async e=>{
    if(e.type==='click'&&e.button!==0||e.type==='auxclick'&&e.button!==1||e.defaultPrevented)return;
    const a=e.target.closest?.('a[href]');if(!a)return;
    const draft=bookingDraft(a,doc);if(!draft||pending.has(draft.bookingUrl))return;
    pending.add(draft.bookingUrl);
    try {
      const session=await existingSession();if(!session)return;
      const key=session.user.id+'|'+draft.bookingUrl;
      if(Date.now()-(recent.get(key)||0)<15000)return;
      const response=await fetch('/api/partner-bookings',{method:'POST',cache:'no-store',keepalive:true,
        headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:JSON.stringify(draft)});
      if(response.ok){recent.set(key,Date.now());savedNotice();}
    }catch{/* Booking continues on the supplier; no unconfirmed save is announced. */}
    finally{pending.delete(draft.bookingUrl);}
  };
  doc.addEventListener('click',capture);doc.addEventListener('auxclick',capture);
}
if(typeof document!=='undefined')wirePartnerBookingCapture();
