import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {blend, filterByQuery, filterItems, readState, searchQuery, stateQuery} from '../discovery-model.js';
import {loadAwinSnapshots, matchingListings, pickListings} from '../api/partner-feed.js';

test('keyword search ignores accents and requires every word across public listing fields', () => {
  const item = {title:'Les Misérables at the Café', venue:'Théâtre Royal', city:'Portimão', organiser:'João & Sons'};
  const items = [item, {title:'Other show', city:'London'}];
  assert.deepEqual(filterByQuery(items, '  CAFE\nportimao JOAO  '), [item]);
  assert.deepEqual(filterByQuery(items, 'les royal'), [item]);
  assert.deepEqual(filterByQuery(items, 'cafe london'), []);
  assert.deepEqual(filterByQuery(items, ''), items);
});

test('punctuation and regular-expression characters are matched literally', () => {
  const items = [{title:'A+B [.*] festival'}, {title:'AB normal festival'}, {title:'Another event'}];
  assert.deepEqual(filterByQuery(items, 'a+b [.*]'), [items[0]]);
  assert.deepEqual(filterByQuery(items, '.*'), [items[0]]);
  assert.deepEqual(filterByQuery(items, '(a+)+$'), []);
  assert.deepEqual(filterByQuery(items, '^|$'), []);
});

test('verified transport search terms remain searchable without matching unrelated transport modes', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  const raw = {provider:'viator',seller:'Viator',countryCode:'PT',category:'transfer',startsAt:'',url:'https://www.viator.com/tours/Exact/1?pid=P00333211'};
  const pool = blend([], [], now, [
    {...raw,id:'viator:Hola',title:'Hola Barcelona Travel Card',city:'Barcelona',countryCode:'ES',searchTerms:'metro bus tram'},
    {...raw,id:'viator:Lisboa',title:'Lisbon City Card',city:'Lisbon',searchTerms:'metro bus tram train'},
    {...raw,id:'viator:Heathrow',title:'Heathrow Express Ticket',city:'London',countryCode:'GB',searchTerms:'train rail'}
  ]);
  assert.deepEqual(filterItems(pool, {q:'metro'}, now).map(i => i.key), ['feed:viator:Hola','feed:viator:Lisboa']);
  assert.deepEqual(filterItems(pool, {q:'metro lisbon'}, now).map(i => i.key), ['feed:viator:Lisboa']);
  assert.equal(pool[1].searchTerms, 'metro bus tram train');
  assert.equal(pool[1].url, raw.url);
  assert.equal(blend([], [], now, [{...raw,id:'viator:long',title:'Transport',searchTerms:'x'.repeat(500)}])[0].searchTerms.length, 200);
});

test('keyword filtering preserves native approval, location, category, dates and booking links', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  const native = {id:'1', slug:'cafe-show', title:'Café night', organiser:'João Events', status:'published', event_kind:'show', country_code:'PT', venue_city:'Faro', venue:'Marina', starts_at:'2026-11-24T20:00:00Z', tiers:[{remaining:5, price_cents:1000}]};
  const offer = {id:'viator:1', provider:'viator', seller:'Viator', title:'Café walking tour', organiser:'João Tours', city:'Faro', countryCode:'PT', category:'daysout', startsAt:'', url:'https://www.viator.com/tours/Faro/1?pid=P00333211'};
  const pool = blend([native, {...native,id:'draft',slug:'draft',status:'draft'}, {...native,id:'test',slug:'test',public_beta_test:true}], [], now, [offer]);
  assert.equal(pool.length, 2, 'matching words never admit unpublished or test inventory');
  assert.deepEqual(filterItems(pool, {q:'cafe joao',country:'PT',city:'Faro',category:'music',when:'week'}, now).map(i => i.key), ['tb:1']);
  assert.equal(filterItems(pool, {q:'cafe joao',country:'GB'}, now).length, 0);
  const [tour] = filterItems(pool, {q:'cafe joao',category:'daysout'}, now);
  assert.equal(tour.url, offer.url, 'supplier tracking is unchanged');
  assert.equal(filterItems(pool, {q:'cafe joao',category:'daysout',when:'week'}, now).length, 0, 'keyword matches do not invent availability for open-dated products');
});

test('bounded keyword state round-trips with destination and explicit dates', () => {
  const state = readState('?country=pt&city=Portim%C3%A3o&cat=music&when=dates&from=2026-12-01&to=2026-12-02&q=+Caf%C3%A9+++Jo%C3%A3o+');
  assert.equal(state.q, 'Café João');
  assert.deepEqual(readState(stateQuery(state)), state);
  assert.equal(searchQuery('x'.repeat(500)).length, 160);
  assert.equal(readState('?q=' + 'x'.repeat(500)).q.length, 160);
  assert.equal(new URLSearchParams(stateQuery({...state,q:'x'.repeat(500)})).get('q').length, 160);
  assert.ok(!stateQuery({...state,q:'   '}).includes('q='));
  const literal = readState('?q=' + encodeURIComponent('"><script>+&[.*]'));
  assert.equal(readState(stateQuery(literal)).q, literal.q);
});

test('national keyword search reaches the actual Wicked snapshot before per-town sampling', async () => {
  const snapshot = await loadAwinSnapshots(), wicked = snapshot.find(i => i.title === 'Wicked');
  assert.ok(wicked);
  assert.ok(!pickListings(snapshot).some(i => i.id === wicked.id), 'the national sample alone does not contain Wicked');
  assert.deepEqual(pickListings(snapshot, {q:'wicked london'}), [wicked]);
  assert.equal(matchingListings(snapshot, {q:'wicked',country:'PT'}).length, 0);
  assert.equal(pickListings(snapshot, {q:'wicked'})[0].url, wicked.url);
});

test('the public feed reports full, matched and returned totals without making provider requests', () => {
  const script = `
    import assert from 'node:assert/strict';
    import handler, {loadAwinSnapshots, pickListings} from ${JSON.stringify(new URL('../api/partner-feed.js', import.meta.url).href)};
    globalThis.fetch = async () => {throw Error('unexpected provider request');};
    console.log = () => {};
    const snapshot = await loadAwinSnapshots();
    const read = async query => {
      let body;
      const res = {setHeader() {}, status(code) {assert.equal(code, 200); return this;}, json(value) {body = value;}};
      await handler({method:'GET',query},res);
      return body;
    };
    const result = await read({q:'Wicked'});
    assert.deepEqual(result.events.map(i => i.title), ['Wicked']);
    assert.equal(result.total, snapshot.length);
    assert.equal(result.matched, 1);
    assert.equal(result.count, 1);
    assert.equal(result.events[0].url, snapshot.find(i => i.title === 'Wicked').url);
    const outside = await read({q:'Wicked',country:'PT'});
    assert.equal(outside.total, snapshot.length);
    assert.equal(outside.matched, 0);
    assert.equal(outside.count, 0);
    const cleared = await read({q:''});
    assert.equal(cleared.matched, snapshot.length);
    assert.equal(cleared.count, pickListings(snapshot).length);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module','-e',script], {
    encoding:'utf8', timeout:10000, env:{SKIDDLE_FEED_OFF:'1'}
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
