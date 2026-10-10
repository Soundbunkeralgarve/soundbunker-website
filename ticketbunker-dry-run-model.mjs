// Isolated browser-side demonstration. No Stripe, event APIs, real admission or shared inventory.
export const DRY_PREFIX='TBDRY:v1:';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function makeCode(runId,ticketId){return DRY_PREFIX+runId+':'+ticketId;}
export function newRun(values,id=crypto.randomUUID()){
 if(!uuid.test(id))throw Error('Invalid demo session ID');
 const title=String(values.title||'').trim(),promoter=String(values.promoter||'').trim(),
 venue=String(values.venue||'').trim(),date=String(values.date||'');
 if(title.length<3||!promoter||!venue||!date||!Number.isFinite(Date.parse(date)))
  throw Error('Complete the event name, promoter, venue and date.');
 return {version:1,id,title,promoter,venue,date,category:String(values.category||'club'),
  currency:values.country==='GB'?'GBP':'EUR',country:values.country==='GB'?'GB':'PT',
  capacity:200,tickets:[],scans:[],createdAt:new Date().toISOString()};
}
export function issue(run,values,idFactory=()=>crypto.randomUUID(),now=()=>new Date().toISOString()){
 if(!run||run.version!==1||!uuid.test(run.id))throw Error('Create a demo event first.');
 const quantity=Number(values.quantity),capacity=Number(values.capacity),price=Number(values.price);
 const tier=String(values.tier||'').trim();
 if(!Number.isInteger(quantity)||quantity<1||quantity>8)throw Error('Issue between 1 and 8 demo tickets at a time.');
 if(!Number.isInteger(capacity)||capacity<1||capacity>2000)throw Error('Capacity must be 1–2,000.');
 if(capacity<run.tickets.length||run.tickets.length+quantity>capacity)throw Error('Demo capacity exceeded.');
 if(!Number.isFinite(price)||price<0||price>100000||Math.round(price*100)!==price*100)
  throw Error('Enter a valid two-decimal ticket price.');
 if(!tier||tier.length>100)throw Error('Enter a ticket type.');
 const existing=new Set(run.tickets.map(t=>t.id));
 const created=[];
 for(let i=0;i<quantity;i++){
  const id=idFactory();
  if(!uuid.test(id)||existing.has(id))throw Error('Unable to generate a unique demo ticket.');
  existing.add(id);
  created.push({id,tier,priceCents:Math.round(price*100),createdAt:now(),usedAt:null,usedBy:null});
 }
 return {...run,capacity,tickets:[...run.tickets,...created]};
}
export function checkIn(run,code,actor='Door staff',now=()=>new Date().toISOString()){
 if(!run||!Array.isArray(run.tickets))return {status:'invalid',run,message:'No demo event'};
 const raw=String(code||'').trim(),parts=raw.split(':');
 if(parts.length!==4||parts[0]!=='TBDRY'||parts[1]!=='v1'||!uuid.test(parts[2])||!uuid.test(parts[3]))
  return {status:'invalid',run,message:'Invalid demo ticket code'};
 if(parts[2]!==run.id)return {status:'wrong_event',run,message:'Ticket belongs to another demo event'};
 const index=run.tickets.findIndex(t=>t.id===parts[3]);
 if(index===-1)return {status:'invalid',run,message:'Unknown demo ticket'};
 if(run.tickets[index].usedAt)return {status:'used',run,message:'Already scanned',ticket:run.tickets[index]};
 const at=now(),by=String(actor||'Door staff').trim().slice(0,60)||'Door staff';
 const tickets=run.tickets.map((t,i)=>i===index?{...t,usedAt:at,usedBy:by}:t);
 return {status:'valid',run:{...run,tickets,scans:[...run.scans,{ticketId:parts[3],at,by}]},
  ticket:tickets[index],message:'Demo entry accepted'};
}
export function quotePlan(count,country){
 const n=Number(count);
 if(!Number.isInteger(n)||n<1||n>2000)throw Error('Choose 1–2,000 tickets');
 const prices=country==='GB'?[49,99,199]:[59,119,239];
 const p=n<=100?0:n<=500?1:2;
 return {name:['Starter','Standard','Event Plus'][p],price:prices[p],currency:country==='GB'?'GBP':'EUR'};
}
