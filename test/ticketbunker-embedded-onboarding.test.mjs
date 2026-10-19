import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function harness(){
 let settings,initializations=0;
 const components=[],container={replaceChildren(c){this.child=c}};
 const context=vm.createContext({});
 const module=new vm.SourceTextModule(readFileSync(new URL('../ticketbunker-site/embedded-onboarding.js',import.meta.url),'utf8'),{context});
 await module.link(()=>new vm.SyntheticModule(['loadConnectAndInitialize'],function(){this.setExport('loadConnectAndInitialize',opts=>{settings=opts;initializations++;return {create(type){const c={type,setOnExit(fn){this.exit=fn},setOnLoadError(fn){this.error=fn}};components.push(c);return c}}})},{context}));
 await module.evaluate();
 return {mount:module.namespace.mountStripeOnboarding,container,components,get settings(){return settings},get initializations(){return initializations}};
}
test('embedded form mounts in the portal, preserves Stripe authentication and verifies again on exit',async()=>{
 const h=await harness();let sessions=0,exits=0,errors=0;
 const options={container:h.container,fetchSession:async()=>({publishableKey:'pk_live_testPublic',clientSecret:'session_'+(++sessions)}),onExit:()=>exits++,onError:()=>errors++};
 const c=await h.mount(options);assert.equal(c.type,'account-onboarding');assert.equal(h.container.child,c);assert.equal(h.initializations,1);
 assert.equal(await h.settings.fetchClientSecret(),'session_1');assert.equal(await h.settings.fetchClientSecret(),'session_2');
 assert.equal(h.settings.disableStripeUserAuthentication,undefined);
 c.exit();assert.equal(exits,1);c.error({error:{message:'private Stripe detail'}});assert.equal(errors,1);
 await h.mount(options);assert.equal(h.initializations,1);assert.equal(sessions,2);
});
test('missing session and test publishable keys cannot initialize embedded verification',async()=>{
 for(const session of [{publishableKey:'pk_test_other',clientSecret:'secret'},{publishableKey:'pk_live_public'}]){
  const h=await harness();await assert.rejects(h.mount({container:h.container,fetchSession:async()=>session}));assert.equal(h.initializations,0);assert.equal(h.container.child,undefined);
 }
});
