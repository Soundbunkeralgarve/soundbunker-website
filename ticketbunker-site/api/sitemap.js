// The sitemap lists the fixed pages plus every upcoming public event, so search engines find new shows.
import {CITY_PAGES} from '../city-places.js';
import {GUIDES} from '../guide-content.js';
const SITE='https://theticketbunker.com';
const PAGES=[['/','daily','1.0'],['/city-guides','weekly','0.8'],...CITY_PAGES.map(([slug])=>['/guides/'+slug,'monthly','0.7']),...GUIDES.map(g=>['/'+g.slug,'weekly','0.8']),...CITY_PAGES.map(([slug])=>['/'+slug,'daily','0.8']),['/vip','weekly','0.8'],['/advertise','weekly','0.7'],['/for-organisers','weekly','0.9'],['/pricing','weekly','0.8'],['/about','monthly','0.6'],['/contact','monthly','0.5'],['/terms','monthly','0.3']];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function publicEventUrls(events,now=Date.now()){
 return (events||[]).filter(e=>e?.slug&&e.status==='published'&&!e.public_beta_test&&!e.internal_free_test&&Date.parse(e.starts_at)>now).map(e=>SITE+'/event/'+encodeURIComponent(e.slug));
}
export function sitemapXml(eventUrls=[]){
 const rows=PAGES.map(([path,freq,priority])=>` <url><loc>${SITE}${path}</loc><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`)
  .concat([...new Set(eventUrls)].map(url=>` <url><loc>${esc(url)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`));
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+rows.join('\n')+'\n</urlset>\n';
}
export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 let urls=[];
 try{const r=await fetch('https://www.soundbunker.pt/api/events',{signal:AbortSignal.timeout(8000)});if(r.ok)urls=publicEventUrls((await r.json()).events);}catch{}
 res.setHeader('Content-Type','application/xml; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
 return res.status(200).send(req.method==='HEAD'?'':sitemapXml(urls));
}
