import {plans,bundleRate} from '../../ticketbunker-site/pricing-rules.js';
export {usageQuote} from '../../ticketbunker-site/pricing-rules.js';
export const commercialPlans=plans;
export function prebookingQuote(plan,currency,count=1){
 const p=plans[plan];if(!p||!['eur','gbp'].includes(currency)||![1,4,8].includes(count))throw Error('Choose a valid plan, currency and event count');
 const subtotal=p[currency]*count,discount=Math.round(subtotal*bundleRate(count));return {subtotalCents:subtotal,discountCents:discount,totalCents:subtotal-discount,count,plan,currency};
}
export async function ticketBunkerAdmin(ctx){
 if(!ctx.user?.email_confirmed_at||!ctx.user?.email)return false;
 const r=await ctx.admin.from('tb_platform_admins').select('email').eq('email',ctx.user.email.toLowerCase()).eq('active',true).maybeSingle();
 if(r.error)throw Error('Admin access could not be verified');return !!r.data;
}
