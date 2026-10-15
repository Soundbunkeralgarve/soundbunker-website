import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import sharp from 'sharp';
const base=join(dirname(fileURLToPath(import.meta.url)),'..');
// Render the vector master directly at each size. Never upscale the header PNG:
// the previous raster source had a black matte and clipped the bottom of the mark.
const source=await readFile(join(base,'assets/brand-icon.svg'));
const background='#080e12';
const renderMark=width=>sharp(source,{density:600}).resize({width}).png().toBuffer();
const centered=async(mark,size,canvasBackground)=>{
 const {width,height}=await sharp(mark).metadata();
 return sharp({create:{width:size,height:size,channels:4,background:canvasBackground}})
  .composite([{input:mark,left:Math.round((size-width)/2),top:Math.round((size-height)/2)}]);
};
await mkdir(join(base,'assets'),{recursive:true});
await (await centered(await renderMark(736),1024,background))
 .flatten({background})
 .removeAlpha()
 .png({compressionLevel:9})
 .toFile(join(base,'assets/icon.png'));
// Keep the entire Android foreground inside the adaptive icon's safe circle.
// Android enlarges this layer when applying the launcher's chosen icon mask.
await (await centered(await renderMark(512),1024,'#00000000'))
 .png({compressionLevel:9})
 .toFile(join(base,'assets/adaptive-icon.png'));
await (await centered(await renderMark(256),256,'#00000000'))
 .png({compressionLevel:9})
 .toFile(join(base,'assets/brand-icon.png'));
console.log('TicketBunker native icon generated (1024 × 1024).');
