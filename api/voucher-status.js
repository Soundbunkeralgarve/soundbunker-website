import { json } from "./lib/http.js";
export default async function handler(request,response){
 if(request.method!=="GET") return json(response,{error:"Method not allowed"},405);
 const id=String(request.query?.session_id||"");
 if(!/^cs_/.test(id)||!process.env.STRIPE_SECRET_KEY) return json(response,{error:"Invalid voucher session"},400);
 const r=await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`,{headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`}}); const d=await r.json();
 if(!r.ok||d.payment_status!=="paid"||d.metadata?.purchase_type!=="gift_voucher") return json(response,{error:"Voucher payment is not confirmed"},400);
 const m=d.metadata||{}; return json(response,{paid:true,code:m.voucher_code,to:m.gift_to,from:m.gift_from,startDate:m.gift_start_date,message:m.gift_message,service:m.service_name,total:m.total});
}
