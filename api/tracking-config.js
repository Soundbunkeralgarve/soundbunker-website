const valid=(value,re)=>typeof value==='string'&&re.test(value.trim())?value.trim():'';
const SITE_GA4_ID='G-TJJW844B5S';
const SITE_META_PIXEL_ID='2214465322781138';
export default function handler(req,res){
 if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');res.end(JSON.stringify({error:'Method not allowed'}));return}
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.end(JSON.stringify({
  gtmId:valid(process.env.GTM_CONTAINER_ID,/^GTM-[A-Z0-9]+$/i),
  ga4Id:process.env.GA4_MEASUREMENT_ID===undefined?SITE_GA4_ID:valid(process.env.GA4_MEASUREMENT_ID,/^G-[A-Z0-9]+$/i),
  metaPixelId:process.env.META_PIXEL_ID===undefined?SITE_META_PIXEL_ID:valid(process.env.META_PIXEL_ID,/^[0-9]{5,30}$/)
 }));
}
