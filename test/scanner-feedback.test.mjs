import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../ticketbunker-site/event-scanner.js',import.meta.url),'utf8');
function scanner(fetchImpl){
 const elements=new Map(),timers=new Map();let next=0,now=10000;
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,dataset:{},style:{},value:id==='#scanEvent'?'chosen-event':'',textContent:'',addEventListener(){}});return elements.get(id);};
 const clock=class extends Date{static now(){return now;}};
 const ctx=vm.createContext({document:{querySelector:element},window:{addEventListener(){}},navigator:{vibrate(){}},fetch:fetchImpl,Date:clock,URL,URLSearchParams,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source+';globalThis.runScan=scan;',ctx);
 return {scan:ctx.runScan,element,advance(ms=2000){now+=ms;for(const[id,fn]of [...timers]){timers.delete(id);fn();}}};
}
test('approval is never displayed until the server confirms; results appear in the fixed overlay',async()=>{
 let finish;const app=scanner(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=app.scan('private-ticket');
 assert.equal(app.element('#scanFeedback').hidden,false);
 assert.equal(app.element('#feedbackHeading').textContent,'CHECKING…');
 assert.equal(app.element('#scanFeedback').dataset.kind,'pending');
 finish({ok:true,json:async()=>({status:'valid',event:'Door test',tier:'Guest'})});await pending;
 assert.equal(app.element('#feedbackHeading').textContent,'ENTRY APPROVED');
 assert.equal(app.element('#scanFeedback').dataset.kind,'valid');
 assert.match(app.element('#feedbackDetail').textContent,/Door test/);
});
test('held QR cannot overwrite approval; deliberate manual repeat shows already used',async()=>{
 let calls=0;const app=scanner(async()=>({ok:true,json:async()=>({status:++calls===1?'valid':'used'})}));
 await app.scan('one-ticket');app.advance(700);
 await app.scan('one-ticket');
 assert.equal(calls,1);
 await app.scan('one-ticket','manual');
 assert.equal(calls,2);
 assert.equal(app.element('#feedbackHeading').textContent,'ALREADY USED');
 assert.equal(app.element('#scanFeedback').dataset.kind,'used');
});
test('test admission and network failures cannot be displayed as a real approval',async()=>{
 const rehearsal=scanner(async()=>({ok:true,json:async()=>({status:'valid',test:true})}));
 await rehearsal.scan('rehearsal');assert.equal(rehearsal.element('#feedbackHeading').textContent,'TEST QR VALID');
 const offline=scanner(async()=>{throw Error('Network unavailable');});
 await offline.scan('ticket');
 assert.equal(offline.element('#feedbackHeading').textContent,'NOT VERIFIED');
 assert.equal(offline.element('#scanFeedback').dataset.kind,'error');
});
