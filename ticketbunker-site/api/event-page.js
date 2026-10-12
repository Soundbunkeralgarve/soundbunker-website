import {readFile} from 'node:fs/promises';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function socialMeta(event){
 const url='https://theticketbunker.com/event/'+encodeURIComponent(event.slug);
 const description=[event.venue,event.venue_city,event.description].filter(Boolean).join(' · ').slice(0,250);
 let image='https://theticketbunker.com/brand-icon.png';try{const u=new URL(event.image_url);if(u.protocol==='https:')image=u.href;}catch{}
 return `<title>${esc(event.title)} | TicketBunker</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="TicketBunker"><meta property="og:title" content="${esc(event.title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(event.title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}">`;
}
export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 const slug=typeof req.query.slug==='string'?req.query.slug:'';
 try{
  const [shell,response]=await Promise.all([readFile(new URL('../event.html',import.meta.url),'utf8'),fetch('https://www.soundbunker.pt/api/events',{signal:AbortSignal.timeout(10000)})]);
  if(!response.ok)throw Error('Event catalogue unavailable');
  const data=await response.json();
  const event=(data.events||[]).find(e=>e.slug===slug&&e.status==='published'&&!e.public_beta_test&&!e.internal_free_test&&Date.parse(e.starts_at)>Date.now());
  let html=shell;
  if(event)html=shell.replace(/<title>[\s\S]*?<\/title>/,'').replace(/<meta\s+content="[^"]*"\s+name="description"\s*\/>/,'').replace('</head>',socialMeta(event)+'</head>');
  else html=shell.replace('</head>','<meta name="robots" content="noindex"></head>');
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  return res.status(event?200:404).send(req.method==='HEAD'?'':html);
 }catch{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.status(503).send(req.method==='HEAD'?'':'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event temporarily unavailable | TicketBunker</title><main><h1>Event details are temporarily unavailable</h1><p>Please refresh in a moment.</p><a href="/">Find events</a></main></html>');}
}
