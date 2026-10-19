const HUB_ORIGIN='http://127.0.0.1:8788';
function localWindowUrl(value){try{const u=new URL(value);return u.origin===HUB_ORIGIN&&!u.username&&!u.password&&u.pathname==='/';}catch{return false;}}
function eventFromLink(value){try{const u=new URL(value);if(u.protocol!=='ticketbunkerhub:'||u.hostname!=='open')return null;const id=u.searchParams.get('event');return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')?id:null;}catch{return null;}}
module.exports={HUB_ORIGIN,localWindowUrl,eventFromLink};
