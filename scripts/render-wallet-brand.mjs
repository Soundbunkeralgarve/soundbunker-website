import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const assets=new URL('../assets/ticketbunker/',import.meta.url);
await mkdir(assets,{recursive:true});
const brand=await sharp(new URL('../ticketbunker-site/brand-compact.png',import.meta.url).pathname).resize(1200,193).png().toBuffer();
const powered=await sharp(new URL('../ticketbunker-site/soundbunker-logo-white.png',import.meta.url).pathname).resize(420,62,{fit:'contain',background:'#00000000'}).png().toBuffer();
const label=Buffer.from('<svg width="1280" height="400"><text x="215" y="320" font-family="Arial,sans-serif" font-size="30" letter-spacing="3" fill="#b8c8c3">POWERED BY</text></svg>');
await sharp({create:{width:1280,height:400,channels:4,background:'#000000'}})
 .composite([{input:brand,left:40,top:45},{input:label,left:0,top:0},{input:powered,left:475,top:276}])
 .png().toFile(new URL('wallet-brand-lockup.png',assets).pathname);
console.log('Wallet header: original TicketBunker and SoundBunker logos.');
