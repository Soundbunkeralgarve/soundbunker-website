import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../ticketbunker-site/organiser-v2.js',import.meta.url),'utf8');
function portal(release){
 const nodes=new Map();const element=()=>({value:'',children:[],addEventListener(){},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},classList:{toggle(){},add(){},remove(){}}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const document={addEventListener(){},querySelector:node,querySelectorAll:()=>[],createElement:element,createTextNode:text=>({textContent:text})};
 const context={document,URL,URLSearchParams,AbortSignal,location:{search:'?hub=1',hash:''},window:{addEventListener(){}},fetch:async()=>({ok:true,json:async()=>release})};
 vm.runInNewContext(source.replace('boot();\n})();','globalThis.testHub={load:loadHubPage,page:currentPage,setEvents:list=>events=list};\n})();'),context);
 return {hub:context.testHub,node};
}
test('organiser hub setup executes inside the real portal scope and opens the chosen event',async()=>{
 const {hub,node}=portal({available:false});assert.equal(hub.page,'hub');
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';hub.setEvents([{id,title:'Door event',status:'published',starts_at:new Date().toISOString(),created_at:new Date().toISOString()}]);
 node('#hub-event').value=id;await hub.load();assert.match(node('#hub-event').innerHTML,/Door event/);
 assert.equal(node('#hub-open').href,'ticketbunkerhub://open?event='+id);assert.match(node('#hub-downloads').textContent,/being prepared/);
});
test('organiser download links use validated release assets only',async()=>{
 const base='https://github.com/Soundbunkeralgarve/soundbunker-website/releases/download/ticketbunker-hub-v1.0.0/';
 const {hub,node}=portal({available:true,downloads:[{label:'Windows',url:base+'app.exe'},{label:'Bad download',url:'https://evil.test/app.exe'}]});
 await hub.load();const links=node('#hub-downloads').children.filter(x=>x.href);assert.equal(links.length,1);assert.equal(links[0].href,base+'app.exe');
});
