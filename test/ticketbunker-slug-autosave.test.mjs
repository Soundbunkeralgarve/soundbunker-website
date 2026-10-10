import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eventSlug,eventSlugCandidate} from '../api/lib/event-slug.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('original titles remain unchanged and links are generated without manual URL field',()=>{
 assert.equal(eventSlug('MAISIE SMELLS'),'maisie-smells');
 assert.equal(eventSlug('Café in Loulé!'),'cafe-in-loule');
 assert.equal(eventSlug('⚡️🎉'),'event');
 assert.equal(eventSlugCandidate('My Party',0),'my-party');
 assert.equal(eventSlugCandidate('My Party',1,'abc123'),'my-party-abc123');
 assert.throws(()=>eventSlugCandidate('My Party',1,'abc'),/Invalid event URL suffix/);
 const page=file('organiser.html'),api=file('api/organiser.js');
 assert.doesNotMatch(page,/name="slug"/);
 assert.match(page,/Your event link is created automatically/);
 assert.match(api,/eventSlugCandidate\(title,attempt/);
 assert.match(api,/randomBytes\(3\)/);
 assert.match(api,/title,venue,organiser:organisation.display_name/);
 assert.match(api,/saved.error.code==='23505'/);
});
test('failed image upload cannot erase saved event or force duplicate entry',()=>{
 const js=file('organiser.js');
 assert.match(js,/Event saved\. Uploading your artwork/);
 assert.match(js,/let uploadError=null/);
 assert.match(js,/Use "Update event artwork" below to retry/);
 assert.match(js,/Event not saved:/);
 assert.doesNotMatch(js,/Your event draft may have saved/);
});
