import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import sharp from 'sharp';
const base=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(join(base,'assets/brand-icon.png'));
const mark=await sharp(source).resize(600,600,{fit:'contain',background:'#00000000'}).png().toBuffer();
await mkdir(join(base,'assets'),{recursive:true});
await sharp({create:{width:1024,height:1024,channels:4,background:'#080e12'}})
 .composite([{input:mark,top:212,left:212}])
 .flatten({background:'#080e12'})
 .png({compressionLevel:9})
 .toFile(join(base,'assets/icon.png'));
await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}})
 .composite([{input:mark,top:212,left:212}]).png({compressionLevel:9})
 .toFile(join(base,'assets/adaptive-icon.png'));
console.log('TicketBunker native icon generated (1024 × 1024).');
