import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { json } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';

const templates={
 'voucher-starter':'SoundBunker_Voucher_StudioStarter_120.pdf',
 'voucher-pro':'SoundBunker_Voucher_SessionPro_200.pdf',
 'voucher-popstar':'SoundBunker_Voucher_PopStar_250.pdf'
};
const clean=s=>String(s||'').replace(/[\r\n]+/g,' ').slice(0,80);
const fmtDate=v=>{const d=v?new Date(v):new Date();return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)};

async function stripeVoucher(sessionId){
 if(!/^cs_/.test(sessionId||'')||!process.env.STRIPE_SECRET_KEY)return null;
 const r=await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,{headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`}});
 const d=await r.json(); if(!r.ok||d.payment_status!=='paid'||d.metadata?.purchase_type!=='gift_voucher')return null;
 const m=d.metadata||{}; return {service_id:m.service_id,gift_to:m.gift_to,gift_from:m.gift_from,voucher_code:m.voucher_code,purchase_date:new Date((d.created||0)*1000)};
}

export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 try{
  let v=null; const sessionId=String(req.query?.session_id||''),code=String(req.query?.code||'');
  if(sessionId)v=await stripeVoucher(sessionId);
  else if(code){const c=await requireUser(req);if(c.error)return json(res,{error:c.error},c.status);const q=await c.admin.from('vouchers').select('*').eq('voucher_code',code).eq('owner_id',c.user.id).maybeSingle();if(q.error||!q.data)return json(res,{error:'Voucher not found'},404);v={...q.data,purchase_date:q.data.created_at};}
  if(!v)return json(res,{error:'Voucher not found'},404);
  const filename=templates[v.service_id];if(!filename)return json(res,{error:'Voucher artwork not found'},404);
  const origin=process.env.SITE_URL||`https://${req.headers.host}`;
  const template=await fetch(`${origin}/assets/vouchers/${filename}`);if(!template.ok)throw new Error('Voucher artwork could not be loaded');
  const pdf=await PDFDocument.load(await template.arrayBuffer());const page=pdf.getPages()[0];const font=await pdf.embedFont(StandardFonts.HelveticaBold);const ink=rgb(0.08,0.08,0.12);
  const fit=(text,max=34)=>{let t=clean(text);while(font.widthOfTextAtSize(t,10)>max*10&&t.length>4)t=t.slice(0,-1);return t};
  page.drawText(fit(v.gift_to,42),{x:159,y:275,size:10,font,color:ink});
  page.drawText(fit(v.gift_from,42),{x:159,y:245,size:10,font,color:ink});
  page.drawText(clean(v.voucher_code),{x:159,y:215,size:9,font,color:ink});
  page.drawText(fmtDate(v.purchase_date),{x:390,y:215,size:9,font,color:ink});
  const bytes=await pdf.save();res.setHeader('content-type','application/pdf');res.setHeader('content-disposition',`attachment; filename="SoundBunker-${clean(v.voucher_code)||'Gift-Voucher'}.pdf"`);res.setHeader('cache-control','private, no-store');return res.status(200).send(Buffer.from(bytes));
 }catch(e){return json(res,{error:e.message||'Voucher PDF could not be created'},500)}
}
