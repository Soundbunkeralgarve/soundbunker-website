import {escapeHtml as esc} from './shared.js';
export const eventKind = kind => ({show:'Live music',club:'Club night',comedy:'Comedy',festival:'Festival',sports:'Sport',workshop:'Workshop',community:'Community',other:'Event'}[kind] || 'Event');
// Plain text only: organisers can use short headings and bullet points safely.
export function descriptionHtml(text='') {
 return String(text).split(/\n\s*\n/).filter(x=>x.trim()).map(block=>{
  const lines=block.trim().split('\n');
  if(lines.every(l=>/^\s*[-•]\s+/.test(l)))return '<ul>'+lines.map(l=>'<li>'+esc(l.replace(/^\s*[-•]\s+/,''))+'</li>').join('')+'</ul>';
  return lines.map((l,i)=>i===0&&/^[^:]{2,70}:$/.test(l.trim())?'<h3>'+esc(l.trim().slice(0,-1))+'</h3>':'<p>'+esc(l)+'</p>').join('');
 }).join('');
}
export function calendarFile(event,url,now=new Date()) {
 const clean=v=>String(v||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 const stamp=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TicketBunker//Events//EN','BEGIN:VEVENT',`UID:${clean(event.id||event.slug)}@theticketbunker.com`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(event.starts_at)}`];
 if(event.ends_at)lines.push(`DTEND:${stamp(event.ends_at)}`);
 lines.push(`SUMMARY:${clean(event.title)}`,`LOCATION:${clean([event.venue,event.venue_city].filter(Boolean).join(', '))}`,`DESCRIPTION:${clean(event.description)}`,`URL:${url}`,'END:VEVENT','END:VCALENDAR');
 // Fold on UTF-8 byte boundaries, including the continuation space (RFC 5545).
 return lines.map(line=>{let out='',part='',size=0;for(const ch of line){const n=new TextEncoder().encode(ch).length;if(size+n>75){out+=part+'\r\n';part=' ';size=1;}part+=ch;size+=n;}return out+part;}).join('\r\n')+'\r\n';
}
