// Convert promoter-supplied wall-clock time to an ISO instant in their venue timezone.
const FORMATTERS=new Map();
function getParts(iso,timezone){
  let formatter=FORMATTERS.get(timezone);
  if(!formatter){
    formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    FORMATTERS.set(timezone,formatter);
  }
  return Object.fromEntries(formatter.formatToParts(new Date(iso)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
}
export function localEventInstant(local,timezone) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local||''))throw Error('Enter the venue local date and time');
  const [year,month,day,hour,minute]=local.match(/\d+/g).map(Number);
  if(month<1||month>12||day<1||day>31||hour>23||minute>59)throw Error('Invalid event time');
  const wanted=Date.UTC(year,month-1,day,hour,minute);
  let utc=wanted;
  for(let i=0;i<4;i++){
    const p=getParts(utc,timezone);
    const actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    const delta=wanted-actual;
    if(delta===0)break;
    utc+=delta;
  }
  const p=getParts(utc,timezone);
  if(p.year!==year||p.month!==month||p.day!==day||p.hour!==hour||p.minute!==minute)
    throw Error('This local time does not exist due to a daylight-saving change');
  return new Date(utc).toISOString();
}
