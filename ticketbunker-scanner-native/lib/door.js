import qrcode from 'qrcode-generator';

export const money=(cents,currency='eur')=>(String(currency).toLowerCase()==='gbp'?'£':'€')+((Number(cents)||0)/100).toFixed(2);

// Dark modules merged into horizontal runs, so a payment QR draws as a few
// hundred Views instead of thousands.
export function qrRuns(text){
 const q=qrcode(0,'L');q.addData(text);q.make();
 const size=q.getModuleCount(),rows=[];
 for(let r=0;r<size;r++){
  const runs=[];
  for(let c=0;c<size;){
   if(!q.isDark(r,c)){c++;continue;}
   const start=c;while(c<size&&q.isDark(r,c))c++;
   runs.push([start,c-start]);
  }
  rows.push(runs);
 }
 return {size,rows};
}

// Door crew can only sell what is left; the server re-checks every sale.
export function sellableTiers(summary){
 return (summary?.tiers||[]).filter(t=>t.remaining>0&&(summary.rehearsal||t.priceCents>0));
}

export function doorSaleResult(kind,sale){
 const n=Number(sale?.quantity)||1,amount=money(sale?.totalCents,sale?.currency);
 if(kind==='cash')return {kind:'approved',heading:'CASH · ADMIT '+n,detail:amount+' cash recorded. '+(n>1?'All '+n+' tickets are checked in.':'Ticket checked in.')};
 if(sale?.status==='paid')return {kind:'approved',heading:'PAID · ADMIT '+n,detail:amount+' card payment received. '+(n>1?'All '+n+' tickets are checked in.':'Ticket checked in.')};
 if(sale?.status==='needs_attention')return {kind:'warning',heading:'CHECK PAYMENT',detail:'Paid, but this ticket type filled up at the same moment. Ask the organiser before admitting.'};
 return {kind:'rejected',heading:'NOT PAID',detail:'The card payment was cancelled or timed out. Nothing was charged. Start a new sale.'};
}
