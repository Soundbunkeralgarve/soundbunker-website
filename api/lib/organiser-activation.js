// Stripe verification is the account check: once Stripe confirms a live, payout-ready
// recipient and the organiser's billing details are complete, the account goes live.
const BILLING_FIELDS=['legal_name','billing_email','address_line_1','city','postal_code'];
export const billingComplete=b=>!!b&&BILLING_FIELDS.every(k=>String(b[k]??'').trim().length>0);

export async function activateVerifiedOrganiser(db,organiserId,stripeReady){
 if(!stripeReady)return false;
 const org=await db.from('sb_event_organisers').select('id,owner_user_id,status,tax_review_complete').eq('id',organiserId).maybeSingle();
 if(org.error)throw org.error;
 if(!org.data||org.data.status!=='approved')return false;
 if(org.data.tax_review_complete)return true;
 const billing=await db.from('tb_organiser_billing').select(BILLING_FIELDS.join(',')).eq('organiser_profile_id',organiserId).maybeSingle();
 if(billing.error)throw billing.error;
 if(!billingComplete(billing.data))return false;
 const saved=await db.from('sb_event_organisers').update({tax_review_complete:true}).eq('id',organiserId).eq('tax_review_complete',false).select('id');
 if(saved.error)throw saved.error;
 if(saved.data?.length){
  const audit=await db.from('tb_finance_audit').insert({actor:org.data.owner_user_id,organiser_id:organiserId,action:'billing_auto_activated',detail:{source:'stripe_verified'}});
  if(audit.error)console.error('Organiser activation audit failed',audit.error.message);
 }
 return true;
}
