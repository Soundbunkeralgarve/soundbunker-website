import {createRequire} from 'node:module';const sharp=createRequire('/Users/lofty/Desktop/WEBSITES/TicketBunker-Entradas/ticketbunker-site/../package.json')('sharp');
import {readFileSync} from 'node:fs';
const [,, out, events] = process.argv;
const W=1200,H=630;
const logo=readFileSync('assets/ticketbunker/ticketbunker-logo.svg','utf8');
const bg=await sharp('assets/hero/festival.jpg').resize(W,H,{fit:'cover',position:'attention'}).modulate({saturation:1.1}).toBuffer();
const overlay=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#07070b" stop-opacity=".96"/><stop offset=".55" stop-color="#07070b" stop-opacity=".78"/><stop offset="1" stop-color="#07070b" stop-opacity=".25"/></linearGradient>
<radialGradient id="t" cx="1" cy="0" r="1"><stop offset="0" stop-color="#00e0a6" stop-opacity=".45"/><stop offset=".6" stop-color="#00e0a6" stop-opacity="0"/></radialGradient>
<radialGradient id="p" cx="0" cy="1" r=".9"><stop offset="0" stop-color="#ff4f9a" stop-opacity=".35"/><stop offset=".6" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#t)"/><rect width="100%" height="100%" fill="url(#p)"/>
<rect x="64" y="438" width="120" height="6" rx="3" fill="#00e0a6"/>
<text x="64" y="232" font-family="Avenir Next Condensed" font-weight="800" font-size="100" fill="#ffffff" letter-spacing="-1">PREMIUM EVENT TICKETS.</text>
<text x="64" y="330" font-family="Avenir Next Condensed" font-weight="800" font-size="100" fill="#00e0a6" letter-spacing="-1">NO BOOKING FEES.</text>
<text x="64" y="400" font-family="Avenir Next" font-weight="600" font-size="30" fill="#e6e9ec">Plus the best travel deals on hotels, flights, trains &amp; tours.</text>
<text x="64" y="500" font-family="Avenir Next" font-weight="600" font-size="24" fill="#ffffff">${events}+ gigs, shows, festivals &amp; days out  ·  UK &amp; Europe</text>
<text x="64" y="574" font-family="Avenir Next Condensed" font-weight="600" font-size="30" fill="#00e0a6" letter-spacing="3">THETICKETBUNKER.COM</text>
</svg>`;
const logoPng=await sharp(Buffer.from(logo)).resize({width:560}).png().toBuffer();
await sharp(bg).composite([{input:Buffer.from(overlay)},{input:logoPng,left:64,top:64}]).jpeg({quality:86,mozjpeg:true}).toFile(out);
console.log('ok');
