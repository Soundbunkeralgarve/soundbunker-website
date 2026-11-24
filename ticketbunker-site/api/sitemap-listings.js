// Second sitemap: one URL per bookable partner listing (/listing/<id>), so search engines
// find show, tour and attraction pages. Past dates and unsafe links are left out.
import {allPartnerListings, findPartnerListing} from './partner-feed.js';
const SITE='https://theticketbunker.com';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function listingUrls(items,now=Date.now()){
 const ids=new Set();
 for(const i of items||[])if(i?.id&&findPartnerListing([i],i.id,now))ids.add(i.id);
 return [...ids].slice(0,45000).map(id=>SITE+'/listing/'+encodeURIComponent(id));
}
export function listingsSitemapXml(urls){
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>` <url><loc>${esc(u)}</loc><changefreq>daily</changefreq><priority>0.5</priority></url>`).join('\n')+'\n</urlset>\n';
}
export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 let urls=[];
 try{urls=listingUrls(await allPartnerListings());}catch{}
 res.setHeader('Content-Type','application/xml; charset=utf-8');
 res.setHeader('Cache-Control',urls.length?'public, s-maxage=21600, stale-while-revalidate=86400':'public, s-maxage=300');
 return res.status(200).send(req.method==='HEAD'?'':listingsSitemapXml(urls));
}
