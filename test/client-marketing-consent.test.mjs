import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../api/client-marketing-consent.js';
const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=get('client.html'),front=get('client.js'),api=get('api/client-marketing-consent.js');
const fakeResponse=()=>({
 statusCode:200,headers:{},
 setHeader(name,value){this.headers[name]=value},
 end(body){this.data=JSON.parse(body)}
});
test('client account shows a genuinely optional, unchecked marketing checkbox on login and signup',()=>{
 assert.match(html,/<input id="authMarketingConsent" type="checkbox" name="marketingConsent" value="yes">/);
 assert.doesNotMatch(html,/id="authMarketingConsent"[^>]*checked/);
 assert.doesNotMatch(html,/id="authMarketingConsent"[^>]*required/);
 assert.match(html,/Yes, email me about new events and promotions/);
 assert.match(html,/TicketBunker events, SoundBunker news and special offers/);
 assert.match(html,/unsubscribe anytime/);
 assert.match(html,/href="\/privacy"/);
 assert.match(front,/const marketingOptIn=\$\('#authMarketingConsent'\)\.checked===true/);
 assert.match(front,/ticketbunker_marketing_signup_pending: marketingOptIn/);
});
test('unchecked sign-in never overwrites previously saved subscription preferences',()=>{
 assert.match(front,/if\(mode==='login'&&marketingOptIn\)/);
 assert.match(front,/source:'account',consent:true/);
 assert.match(front,/await applyPendingSignupMarketing\(session\)/);
 assert.match(front,/source:'signup'/);
 assert.match(api,/user\.user_metadata\?\.ticketbunker_marketing_signup_pending!==true/);
});
test('account preferences include explicit unsubscribe control with persisted verified identity',()=>{
 for(const id of ['accountEmailPreferences','marketingPreferencesForm','accountMarketingConsent','saveMarketingPreferences','marketingPreferencesStatus']){
  assert.ok(html.includes('id="'+id+'"'),'missing '+id);
 }
 assert.match(front,/marketingConsentRequest\(session,\{source:'account',consent\}\)/);
 assert.match(front,/loadMarketingPreferences\(session\)/);
 assert.match(api,/requireUser\(req\)/);
 assert.match(api,/email_confirmed_at/);
 assert.match(api,/marketing_opt_in:consent/);
 assert.match(api,/marketing_opt_in_at:when/);
 assert.match(api,/method:'PATCH'/);
 assert.match(api,/unsubscribed:true/);
 assert.match(api,/unsubscribed:false/);
});
test('marketing endpoint rejects unauthenticated requests and never lists subscribers publicly',async()=>{
 for(const method of ['GET','POST']){
  const response=fakeResponse();
  await handler({method,headers:{}},response);
  assert.equal(response.statusCode,401);
 }
 assert.doesNotMatch(api,/select\('\*'\)/);
 assert.doesNotMatch(api,/apikey|RESEND_API_KEY\s*=\s*['"]/);
});
