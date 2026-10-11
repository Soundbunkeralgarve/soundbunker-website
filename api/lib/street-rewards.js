// Validated, organiser-defined milestones. No payout or ticket issuance happens here.
export const streetRewardTypes=Object.freeze(['free_tickets','vip_table','cash_bonus','cash_per_sale','other_perk']);
export function normaliseStreetRewardRules(raw){
 if(!Array.isArray(raw)||raw.length<1||raw.length>6)throw Error('Add between one and six reward milestones');
 const used=new Set();
 return raw.map((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Reward '+(index+1)+' is incomplete');
  const type=String(item.type||'').trim();
  const title=String(item.title||'').trim().slice(0,90);
  const details=String(item.details||'').trim().slice(0,310);
  const target=Number(item.target),quantity=Number(item.quantity||1),cashCents=Number(item.cashCents||0);
  if(!streetRewardTypes.includes(type))throw Error('Choose a valid reward type');
  if(title.length<2||title.length>80||/[\u0000-\u001f\u007f]/.test(title))throw Error('Enter a reward name (2–80 characters)');
  if(details.length>300||/[\u0000-\u001f\u007f]/.test(details))throw Error('Reward details may contain up to 300 characters');
  if(!Number.isSafeInteger(target)||target<1||target>100000)throw Error('Reward targets must be between 1 and 100,000 confirmed paid tickets');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>50)throw Error('Choose a reward quantity between 1 and 50');
  if(!Number.isSafeInteger(cashCents)||cashCents<0||cashCents>1000000)throw Error('Cash reward must be between 0 and 10,000 currency units');
  if((type==='cash_per_sale'||type==='cash_bonus')&&cashCents<1)throw Error('Enter a positive cash reward amount');
  if(!['cash_per_sale','cash_bonus'].includes(type)&&cashCents!==0)throw Error('Cash amount belongs only to a cash reward');
  if(type==='other_perk'&&details.length<3)throw Error('Describe the custom perk');
  const key=title.toLocaleLowerCase()+'|'+target;
  if(used.has(key))throw Error('Remove duplicate milestone: '+title);
  used.add(key);
  return {type,title,target,quantity,cashCents,details};
 });
}
export function progressForStreetRewards(rules,paidTickets){
 const count=Number.isFinite(paidTickets)?Math.max(0,Math.floor(paidTickets)):0;
 return rules.map(rule=>({...rule,progress:Math.min(count,rule.target),unlocked:count>=rule.target}));
}
export function legacyStreetReward(person){
 return [{type:person.reward_type,title:person.reward_type==='vip_table'?'VIP table':person.reward_type==='free_tickets'?'Free tickets':person.reward_type==='cash_per_sale'?'Cash per ticket':'Custom perk',target:person.reward_goal,quantity:1,cashCents:person.reward_value_cents||0,details:person.reward_description||''}];
}
export function legacyStreetRewardType(type){
 return type==='cash_bonus'?'other_perk':type;
}
