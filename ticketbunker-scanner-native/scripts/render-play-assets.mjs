import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
const root=new URL('../',import.meta.url),out=new URL('store-assets/',root);
await mkdir(out,{recursive:true});
const mark=await readFile(new URL('assets/brand-icon.svg',root),'utf8');
const shapes=mark.slice(mark.indexOf('>')+1,mark.lastIndexOf('</svg>'));
const icon=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#080e12"/><g transform="translate(72 127) scale(1.614)">${shapes}</g></svg>`;
const feature=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><rect width="1024" height="500" fill="#080e12"/><circle cx="1000" cy="60" r="300" fill="#102a29"/><g transform="translate(62 48) scale(.35)">${shapes}</g><g font-family="DejaVu Sans, sans-serif"><text x="158" y="75" fill="white" font-size="26" font-weight="bold">TicketBunker Scanner</text><text x="62" y="205" fill="white" font-size="64" font-weight="bold">Your door crew.</text><text x="62" y="280" fill="#00d6a5" font-size="64" font-weight="bold">Connected.</text><text x="64" y="340" fill="#c1d2d0" font-size="25">Online · Local Hub · Prepared offline lanes</text><path d="M748 187h130v90H748zM773 295h80M813 278v17M766 212h20m8 0h20m8 0h20" fill="none" stroke="#00d6a5" stroke-width="7" stroke-linecap="round"/><path d="M729 176q84-70 168 0M754 150q58-48 116 0" fill="none" stroke="#5b8982" stroke-width="6" stroke-linecap="round"/><text x="62" y="435" fill="#b9c9c7" font-size="18">Sync before doors open. Shared offline checks require local Wi-Fi and a Hub.</text></g></svg>`;
for(const [name,svg] of [['play-icon',icon],['play-feature',feature]]){
 await writeFile(new URL(name+'.svg',out),svg);
 await sharp(Buffer.from(svg)).removeAlpha().png().toFile(new URL(name+'.png',out).pathname);
}
console.log('Rendered Play icon 512×512 and feature graphic 1024×500 from vector brand master.');
