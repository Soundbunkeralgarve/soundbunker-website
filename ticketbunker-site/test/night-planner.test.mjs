import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerSteps, saveNight, tidyTrip, tourLink} from '../night-planner.js';

const gig = {id: 'skiddle:1', title: 'Gig', startsAt: '2026-12-05T20:00:00Z', city: 'London', countryCode: 'GB', venue: 'O2', seller: 'Skiddle', url: 'https://www.skiddle.com/x', external: true};

test('the plan runs tickets, travel, stay, food, then things to do', () => {
  const steps = plannerSteps(gig);
  assert.deepEqual(steps.map(s => s.kind), ['tickets', 'route', 'travel', 'car', 'stay', 'transfer', 'eat', 'tours']);
  assert.equal(steps[0].links[0].url, gig.url);
  assert.match(steps.find(s=>s.kind==='stay').blurb, /O2/);
  assert.match(steps[1].blurb, /O2/);
});

test('travel planning has usable public searches without unapproved tracking', () => {
  const steps = plannerSteps(gig);
  for (const kind of ['travel', 'car', 'stay', 'eat', 'transfer']) {
    const links=steps.find(s => s.kind === kind).links;
    assert.ok(links.length>0);
    for (const link of links) {
      const u = new URL(link.url);
      assert.notEqual(u.hostname, 'www.awin1.com', 'pending routes stay hidden');
      if (link.commercial === 'affiliate') {
        assert.equal(kind, 'transfer');
        assert.equal(u.hostname, 'www.viator.com');
        assert.equal(u.searchParams.get('pid'), 'P00333211');
      } else assert.equal(link.commercial, 'direct');
    }
  }
});

test('things to do links to GetYourGuide with our partner id, by place or by search', () => {
  assert.match(tourLink('London', 'GB'), /^https:\/\/www\.getyourguide\.com\/london-l57\/\?partner_id=KNICMG4/);
  assert.match(tourLink('Wigan', 'GB'), /^https:\/\/www\.getyourguide\.com\/s\/\?q=Wigan&partner_id=KNICMG4/);
  assert.equal(tourLink('', 'GB'), '');
});

test('My trip keeps one entry per event, ticks tickets, and drops past nights', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  let list = saveNight([], gig, now);
  list = saveNight([{...list[0], done: {tickets: true, travel: true}}], gig, now);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].done, {tickets: true, travel: true});
  const old = {...gig, id: 'old', startsAt: '2026-11-01T20:00:00Z'};
  assert.equal(tidyTrip([old, list[0]], now).length, 1);
});
