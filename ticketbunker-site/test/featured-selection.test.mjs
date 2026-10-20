import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFeaturedEvents} from '../featured-selection.js';
const now=Date.parse('2026-10-20T12:00:00Z');
const event={slug:'live-featured',status:'published',featured:true,starts_at:'2026-11-01T21:00:00Z',tiers:[{remaining:10}]};
test('placements show only server-featured, published, future, available events',()=>{
 const invalid=[{featured:false},{featured:'true'},{status:'draft'},{status:'cancelled'},{status:'postponed'},{preview:true},{public_beta_test:true},{internal_free_test:true},{starts_at:'2026-10-01T20:00:00Z'},{starts_at:'invalid'},{tiers:[{remaining:0}]},{tiers:[]},{slug:'../bad'}];
 assert.deepEqual(selectFeaturedEvents([event,...invalid.map((v,i)=>({...event,slug:'invalid-'+i,...v}))],{now}),[event]);
});
test('placements deduplicate, exclude the current event and sort by event date',()=>{
 const later={...event,slug:'later',starts_at:'2026-12-01T20:00:00Z'},sooner={...event,slug:'sooner',starts_at:'2026-10-30T20:00:00Z'};
 assert.deepEqual(selectFeaturedEvents([later,event,event,sooner],{now,excludeSlug:event.slug}),[sooner,later]);
 assert.deepEqual(selectFeaturedEvents(null,{now}),[]);
});
