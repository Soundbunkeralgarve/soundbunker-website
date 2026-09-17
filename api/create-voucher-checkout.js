import { randomBytes, randomUUID } from "node:crypto";
import { getSession, isIsoDate } from "./lib/catalog.js";
import { json, parseJson, safeText, validEmail } from "./lib/http.js";

const clean = (v,n=200) => safeText(v,n);
const voucherCode = () => `SB-${new Date().getFullYear().toString().slice(-2)}-${randomBytes(3).toString("hex").toUpperCase()}`;

export default async function handler(request,response){
  if(request.method!=="POST") return json(response,{error:"Method not allowed"},405);
  try{
    const input=await parseJson(request);
    const service=clean(input.service,50), session=getSession(service);
    const gift={from:clean(input.giftFrom,120),to:clean(input.giftTo,120),email:clean(input.email,200),phone:clean(input.phone,60),recipientEmail:clean(input.recipientEmail,200),message:clean(input.giftMessage,400),startDate:clean(input.giftStartDate,10)};
    if(!session?.voucher||!gift.from||!gift.to||!validEmail(gift.email)||!gift.phone||!isIsoDate(gift.startDate)) return json(response,{error:"Please complete the required voucher details."},400);
    if(gift.recipientEmail&&!validEmail(gift.recipientEmail)) return json(response,{error:"Recipient email is not valid."},400);
    if(!process.env.STRIPE_SECRET_KEY) return json(response,{error:"Online payment is not configured."},503);
    const origin=process.env.SITE_URL||`https://${request.headers.host}`;
    const ref=randomUUID(), code=voucherCode();
    const metadata={purchase_type:"gift_voucher",booking_ref:ref,service_id:service,service_name:session.name,total:String(session.price),deposit:String(session.price),customer_name:gift.from,customer_email:gift.email,phone:gift.phone,gift_to:gift.to,gift_from:gift.from,gift_start_date:gift.startDate,gift_recipient_email:gift.recipientEmail,gift_message:gift.message,voucher_code:code,language:"en"};
    const body=new URLSearchParams({mode:"payment",submit_type:"pay",success_url:`${origin}/voucher-success.html?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/gift-vouchers.html`,customer_email:gift.email,customer_creation:"always",locale:"en-GB",client_reference_id:ref,"phone_number_collection[enabled]":"true","tax_id_collection[enabled]":"true","line_items[0][quantity]":"1","line_items[0][price_data][currency]":"eur","line_items[0][price_data][unit_amount]":String(session.price*100),"line_items[0][price_data][product_data][name]":`SoundBunker — ${session.name}`,"line_items[0][price_data][product_data][description]":`Gift experience for ${gift.to}. VAT included. Experience date booked on redemption.`});
    Object.entries(metadata).forEach(([k,v])=>body.set(`metadata[${k}]`,String(v||"").slice(0,500)));
    const stripe=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,"content-type":"application/x-www-form-urlencoded"},body});
    const data=await stripe.json(); if(!stripe.ok) throw new Error(data.error?.message||"Stripe Checkout could not be created");
    return json(response,{url:data.url});
  }catch(e){ return json(response,{error:"Gift voucher checkout could not be started."},500); }
}
