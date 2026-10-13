import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import sharp from 'sharp';
const base=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(join(base,'assets/scanner-icon.svg'));
const mark=await sharp(source,{density:288}).resize(1024,1024,{fit:'contain'}).png().toBuffer();
await mkdir(join(base,'assets'),{recursive:true});
await sharp({create:{width:1024,height:1024,channels:4,background:'#20162d'}})
 .composite([{input:mark,top:0,left:0}])
 .flatten({background:'#20162d'})
 .png({compressionLevel:9})
 .toFile(join(base,'assets/icon.png'));
console.log('TicketBunker native icon generated (1024 × 1024).');
