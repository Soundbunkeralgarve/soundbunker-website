import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPreferences} from '../promo-options.js';
import {weeklyEmail} from '../weekly-email.js';
import handler from '../api/[endpoint].js';
test('event targeting requires one real region and subscriber interests are explicit',()=>{
 assert.throws(()=>cleanPreferences({country:'PT',regions:[],genres:['house']},{event:true}));
 assert.throws(()=>cleanPreferences({country:'PT',regions:['london'],genres:['house']}));
 assert.throws(()=>cleanPreferences({country:'PT',regions:['algarve'],genres:[]}));
 assert.throws(()=>cleanPreferences({country:'GB',genres:['__proto__']}));
 assert.deepEqual(cleanPreferences({country:'PT',regions:['algarve','algarve'],genres:['house']}),{country:'PT',regions:['algarve'],genres:['house']});
});
test('weekly email escapes event content, rejects unsafe images and retains opt-out',()=>{
 const result=weeklyEmail([{title:'<script>test</script>',description:'<img onerror=bad>',slug:'demo?x=1',starts_at:'2027-01-01T20:00:00Z',venue:'Club',image_url:'javascript:bad',featured:true}]);
 assert.ok(result.html.includes('&lt;script&gt;'));assert.ok(!result.html.includes('src="javascript:'));assert.ok(result.html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));assert.ok(result.text.includes('FEATURED'));assert.ok(result.html.includes('/event/demo%3Fx%3D1'));assert.throws(()=>weeklyEmail([]));
});
test('preference and promotion gateway rejects missing auth without any upstream write',async()=>{
 for(const endpoint of ['promo-preferences','event-promotion']){
 const r={setHeader(){},status(c){this.code=c;return this;},json(d){this.body=d;}};
 await handler({method:'POST',headers:{},query:{endpoint}},r);assert.equal(r.code,401);
 }
});
