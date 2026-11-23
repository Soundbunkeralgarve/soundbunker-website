import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseDraft, openDraft, persistDraft, switchDestination, updateDetails, chooseOption, stepProgress,
  matchingNights, ticketBrowseHref, draftQuery, destinationKey, reconcileSelections, applyTripDetails} from '../trip-builder-model.js';
import {tripOptions, TRIP_PARTNERS} from '../trip-partners.js';

test('a saved trip resumes its step, dates and choices and destination plans remain separate',()=>{
  let london=normaliseDraft({city:'London',from:'2026-12-10',to:'2026-12-13',party:'couples',step:'stay'});
  london=chooseOption(london,'tickets','feed:skiddle:123');
  let store=persistDraft({},london,100);
  assert.equal(openDraft(store).step,'stay');
  const paris=switchDestination(store,london,'FR','Paris');
  assert.deepEqual(paris.selected.tickets,[]);
  assert.equal(paris.progress.tickets,'unplanned');
  assert.equal(paris.from,'2026-12-10');
  store=persistDraft(store,{...paris,step:'travel'},200);
  assert.equal(openDraft(store).city,'Paris');
  assert.deepEqual(openDraft(store,'?city=London&country=GB').selected.tickets,['feed:skiddle:123']);
  assert.equal(openDraft(store,'?city=London&country=GB').step,'stay');
});

test('a city handoff infers its country and keeps explicit trip preferences',()=>{
  const old=persistDraft({},normaliseDraft({city:'London',country:'GB'}));
  const next=openDraft(old,'?city=Lisbon&from=2026-12-20&to=2026-12-23&party=kids&adults=2&children=1&step=food');
  assert.equal(next.country,'PT');
  assert.equal(next.city,'Lisbon');
  assert.equal(next.step,'food');
  assert.equal(next.party,'kids');
  assert.equal(next.children,1);
  assert.equal(new URLSearchParams(draftQuery(next)).get('to'),'2026-12-23');
});

test('saving or opening an option never confirms a booking and confirmation requires an explicit visitor action',()=>{
  let draft=chooseOption(normaliseDraft({city:'London'}),'travel','transfer:viator-limos');
  assert.equal(draft.progress.travel,'planned');
  assert.equal(stepProgress(draft,'travel','confirmed').progress.travel,'planned');
  draft=stepProgress(draft,'travel','confirmed',{visitorConfirmed:true});
  assert.equal(draft.progress.travel,'confirmed');
  assert.equal(updateDetails(draft,{from:'2026-12-15'}).progress.travel,'planned');
  assert.equal(openDraft(persistDraft({},draft),'?city=London&country=GB&from=2026-12-15').progress.travel,'planned');
  assert.equal(chooseOption(draft,'travel','car:expedia-cars').progress.travel,'planned');
  assert.deepEqual(stepProgress(draft,'travel','skipped').selected.travel,[]);
});

test('only current provider choices can be restored; pending suppliers cannot reappear from saved state',()=>{
  let draft=normaliseDraft({city:'London',country:'GB',selected:{stay:['stay:Pending','stay:expedia-hotels'],travel:['transfer:viator-limos']},progress:{stay:'confirmed'}});
  const options=Object.fromEntries(tripOptions('GB','London').map(o=>[o.kind,o.partners]));
  draft=reconcileSelections(draft,{tickets:[],stay:options.stay.map(p=>'stay:'+(p.id||p.name)),travel:options.transfer.map(p=>'transfer:'+(p.id||p.name)),food:[]});
  assert.deepEqual(draft.selected.stay,['stay:expedia-hotels']);
  assert.equal(draft.progress.stay,'planned');
  assert.ok(TRIP_PARTNERS.every(p=>p[3]===false),'existing pending applications remain pending');
  const viator=options.transfer.find(p=>p.id==='viator-limos');
  assert.equal(viator.commercial,'affiliate');
  assert.equal(new URL(viator.url).searchParams.get('pid'),'P00333211');
});

test('saved nights are destination-scoped public references and legacy done flags are never confirmation',()=>{
  const base={id:'feed:viator:one',title:'A real private transfer',city:'London',countryCode:'GB',url:'https://www.viator.com/tours/London/x?pid=P00333211',done:{tickets:true,stay:true},userMarked:{tickets:true},external:true};
  const draft=normaliseDraft({city:'London',country:'GB'});
  const nights=matchingNights([base,{...base,id:'other',city:'Paris',countryCode:'FR'},{...base,id:'bad',url:'javascript:alert(1)'},{...base,id:'foreign',url:'https://example.com/phish'}],draft);
  assert.equal(nights.length,1);
  assert.equal(nights[0].done,undefined);
  assert.equal(nights[0].userMarked,undefined);
  assert.equal(chooseOption(draft,'tickets',nights[0].id).progress.tickets,'planned');
  assert.equal(matchingNights([{...base,city:'Lagos',countryCode:'PT'}],normaliseDraft({city:'Algarve',country:'PT'})).length,1);
});

test('date and party links preserve search intent without fabricating ticket availability',()=>{
  const draft=normaliseDraft({city:'London',country:'GB',from:'2026-12-10',to:'2026-12-12',party:'families'});
  const q=new URL(ticketBrowseHref(draft),'https://theticketbunker.com').searchParams;
  assert.equal(q.get('cat'),'family');
  assert.equal(q.get('when'),'dates');
  assert.equal(q.get('from'),'2026-12-10');
  assert.equal(q.get('to'),'2026-12-12');
  assert.equal(q.get('party'),'families');
  assert.equal(new URL(ticketBrowseHref({...draft,party:'couples'}),'https://theticketbunker.com').searchParams.get('party'),'couples');
  const malformed=normaliseDraft({from:'2026-99-99',to:'2026-02-30',party:'fake',adults:900,children:-3,step:'paid'});
  assert.equal(malformed.from,'');assert.equal(malformed.to,'');
  assert.equal(malformed.party,'weekend');assert.equal(malformed.adults,30);assert.equal(malformed.children,0);assert.equal(malformed.step,'tickets');
  assert.doesNotThrow(()=>openDraft(null,'?from=2026-99-99'));
});

test('applying pending destination fields before navigation changes provider context and rejects invalid cities',()=>{
  let london=chooseOption(normaliseDraft({city:'London',country:'GB',from:'2026-12-10',to:'2026-12-13',party:'couples',step:'stay'}),'stay','stay:expedia-hotels');
  const store=persistDraft({},london,100);
  const result=applyTripDetails(store,london,{country:'FR',city:'Paris',from:'2026-12-10',to:'2026-12-13',party:'couples',adults:'2',children:'0'});
  assert.equal(result.draft.city,'Paris');assert.equal(result.draft.country,'FR');
  assert.equal(result.draft.party,'couples');assert.equal(result.draft.from,'2026-12-10');
  assert.deepEqual(result.draft.selected.stay,[],'London provider selections cannot leak into the Paris plan');
  assert.match(tripOptions(result.draft.country,result.draft.city).find(o=>o.kind==='stay').partners[0].url,/Paris/);
  assert.deepEqual(openDraft(store,'?city=London&country=GB').selected.stay,['stay:expedia-hotels']);
  assert.equal(applyTripDetails(store,london,{country:'FR',city:'London'}).field,'city');
  assert.equal(applyTripDetails(store,london,{country:'FR',city:'Paris',from:'2026-12-12',to:'2026-12-10'}).field,'to');
  assert.equal(london.city,'London','validation does not mutate the current plan');
});

test('draft storage is bounded and restores city keys without carrying ticket selections into another city',()=>{
  let store={};
  for(let n=0;n<12;n++)store=persistDraft(store,normaliseDraft({city:'City '+n,country:'GB'}),n+1);
  assert.equal(Object.keys(store.drafts).length,8);
  assert.equal(store.active,destinationKey('GB','City 11'));
  assert.equal(store.drafts[destinationKey('GB','City 0')],undefined);
});
