export const ECB_RATES='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

export function selectGBPRate(xml,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Invoice exchange-rate date is invalid');
 const rows=[...String(xml).matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)].map(([,day,body])=>({date:day,rate:Number(body.match(/<Cube\s+currency=['"]GBP['"]\s+rate=['"]([\d.]+)['"]\s*\/?\s*>/)?.[1])})).filter(r=>r.date<=date&&Number.isFinite(r.rate)&&r.rate>0.05&&r.rate<10).sort((a,b)=>b.date.localeCompare(a.date));
 const rate=rows[0];if(!rate||Date.parse(date)-Date.parse(rate.date)>7*86400000)throw Error('A verified GBP accounting exchange rate is unavailable');
 return {...rate,source:ECB_RATES,base:'EUR',quote:'GBP'};
}
export async function ecbGBPRate(date,{fetcher=fetch}={}){
 const response=await fetcher(ECB_RATES,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('ECB exchange rates are unavailable');
 return selectGBPRate(await response.text(),date);
}
export async function accountingAmounts(row,date,loadFX=ecbGBPRate){
 const gross=Number(row.amount_cents);if(!Number.isSafeInteger(gross)||gross<=0)throw Error('Invoice amount is invalid');
 if(row.currency==='eur')return {fiscal_total_cents:gross,accounting_currency:'eur'};
 if(row.currency!=='gbp')throw Error('Unsupported invoice currency');
 const fx=await loadFX(date);
 if(fx.base!=='EUR'||fx.quote!=='GBP'||!Number.isFinite(fx.rate)||fx.rate<=0||fx.date>date||Date.parse(date)-Date.parse(fx.date)>7*86400000)throw Error('Verified foreign-currency invoice rate is required');
 const euroCents=Math.round(gross/fx.rate);
 if(!Number.isSafeInteger(euroCents)||euroCents<=0||Math.round(euroCents*fx.rate)!==gross)throw Error('GBP invoice rounding requires review');
 return {fiscal_total_cents:euroCents,accounting_currency:'eur',fx:{...fx,tax_point_date:date},currency_code:'GBP',rate:String(fx.rate)};
}
