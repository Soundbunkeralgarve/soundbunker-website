// TicketBunker money is isolated from the SoundBunker studio account.
const BASE='https://api.stripe.com';
export const ticketBunkerOrigin='https://theticketbunker.com';
export function ticketBunkerStripeConfigured(env=process.env){return /^(sk|rk)_live_/.test(env.TICKETBUNKER_STRIPE_SECRET_KEY||'')&&/^acct_[A-Za-z0-9]+$/.test(env.TICKETBUNKER_STRIPE_ACCOUNT_ID||'');}
export function ticketBunkerPaymentsEnabled(env=process.env){return ticketBunkerStripeConfigured(env)&&env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED==='true'&&env.TICKETBUNKER_PAYMENTS_ENABLED==='true'&&!!env.TICKETBUNKER_STRIPE_WEBHOOK_SECRET&&!!env.TICKETBUNKER_CONNECT_WEBHOOK_SECRET;}
export async function ticketBunkerStripe(path,{method='GET',body,idem,account,request=fetch,env=process.env}={}){
 if(!ticketBunkerStripeConfigured(env))throw Error('TicketBunker Stripe credentials are not configured');
 if(!/^\/v1\/[a-z0-9_/?.%=&\[\]-]+$/i.test(path))throw Error('Invalid Stripe operation');
 const result=await request(BASE+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.TICKETBUNKER_STRIPE_SECRET_KEY,'Stripe-Version':'2026-09-30.endive',...(account?{'Stripe-Account':account}:{}),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idem?{'Idempotency-Key':idem}:{})},body:body?new URLSearchParams(body):undefined});
 const data=await result.json().catch(()=>({}));
 if(!result.ok){const error=Error('Stripe operation was not confirmed');error.code=data.error?.code||'stripe_unavailable';error.status=result.status;throw error;}
 return data;
}
export async function ticketBunkerPlatformReadiness(options={}){
 if(!ticketBunkerStripeConfigured(options.env||process.env))return {configured:false,ready:false,reason:'credentials_missing'};
 const env=options.env||process.env;
 const account=await ticketBunkerStripe('/v1/account',options);
 const correct=account.id===env.TICKETBUNKER_STRIPE_ACCOUNT_ID;
 const ready=correct&&account.charges_enabled===true&&account.payouts_enabled===true&&account.settings?.payouts?.schedule?.interval==='manual';
 return {configured:true,ready,chargesEnabled:correct&&account.charges_enabled===true,payoutsEnabled:correct&&account.payouts_enabled===true,holdsFunds:correct&&account.settings?.payouts?.schedule?.interval==='manual',reason:!correct?'account_mismatch':!account.charges_enabled?'payments_restricted':!account.payouts_enabled?'payouts_restricted':account.settings?.payouts?.schedule?.interval!=='manual'?'manual_payout_schedule_required':null};
}
export function settlementAmounts(payments,{model='fixed',includedTickets=2000,rateCents=15,paidTickets=0}={}){
 if(!['fixed','usage'].includes(model)||!Number.isSafeInteger(paidTickets)||paidTickets<0||!Number.isSafeInteger(includedTickets)||includedTickets<0||!Number.isSafeInteger(rateCents)||rateCents<0)throw Error('Invalid settlement terms');
 const totals=payments.reduce((a,p)=>{
  for(const key of ['gross_cents','refunded_cents','processing_fee_cents'])if(!Number.isSafeInteger(p[key])||p[key]<0)throw Error('Payment is not reconciled');
  if(p.refunded_cents>p.gross_cents||p.disputed||p.refund_pending||p.currency!==p.settlement_currency||!Number.isFinite(Date.parse(p.available_on))||Date.parse(p.available_on)>Date.now())throw Error('Payment is not available for release');
  a.grossCents+=p.gross_cents;a.refundCents+=p.refunded_cents;a.processingCents+=p.processing_fee_cents;return a;
 },{grossCents:0,refundCents:0,processingCents:0});
 if(Object.values(totals).some(v=>!Number.isSafeInteger(v)))throw Error('Settlement totals require review');
 const usageCents=model==='usage'?Math.max(0,paidTickets-includedTickets)*rateCents:0;
 // The upfront listing/deposit was paid separately. Never deduct it again.
 const netCents=totals.grossCents-totals.refundCents-totals.processingCents-usageCents;
 if(!Number.isSafeInteger(netCents)||netCents<0)throw Error('Settlement needs review');
 return {...totals,usageCents,netCents};
}
