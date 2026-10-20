import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../hub-mac-downloads.js',import.meta.url),'utf8');
const base='https://github.com/Soundbunkeralgarve/soundbunker-website/releases/download/ticketbunker-mac-v1.0.3/';
async function page(release){
 const cards=['arm64','x64'].map(arch=>{const card={dataset:{hubMacArch:arch},paragraph:{},link:{disabled:true}};card.link.replaceWith=value=>{card.link=value;};card.querySelector=selector=>selector==='p'?card.paragraph:card.link;return card;});
 const status={},heading={},paragraph={},help={querySelector:selector=>selector==='strong'?heading:paragraph};
 const document={readyState:'complete',hidden:false,addEventListener(){},querySelectorAll:()=>cards,querySelector:selector=>selector==='[data-hub-mac-status]'?status:help,createElement:tag=>({tagName:tag})};
 vm.runInNewContext(source,{document,navigator:{onLine:true},window:{addEventListener(){}},AbortSignal,clearTimeout(){},setTimeout(){},fetch:async()=>({ok:true,json:async()=>release})});
 await new Promise(resolve=>setImmediate(resolve));return {cards,status,heading};
}
test('pending or incomplete Mac release keeps both portal download buttons disabled',async()=>{
 for(const release of [{available:false},{available:true,testing:true,version:'1.0.3',downloads:[]}]){const result=await page(release);assert.ok(result.cards.every(card=>card.link.disabled));}
});
test('verified Mac release activates the actual portal cards and installation guidance',async()=>{
 assert.equal(readFileSync(new URL('../ticketbunker-site/hub-mac-downloads.js',import.meta.url),'utf8'),source);
 const release={available:true,testing:true,version:'1.0.3',downloads:['arm64','x64'].map(arch=>({arch,url:base+'TicketBunker-Hub-1.0.3-mac-'+arch+'.dmg'}))};
 const good=await page(release);assert.ok(good.cards.every(card=>card.link.tagName==='a'&&card.link.href.startsWith(base)));assert.match(good.status.textContent,/Gatekeeper checks passed/);assert.equal(good.heading.textContent,'Installing on Mac');
 release.downloads[1].url='https://evil.test/hub.dmg';const bad=await page(release);assert.ok(bad.cards.every(card=>card.link.disabled));
});
