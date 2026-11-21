import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerSteps, saveNight, tidyTrip, tourLink} from '../night-planner.js';

const gig = {id: 'skiddle:1', title: 'Gig', startsAt: '2026-12-05T20:00:00Z', city: 'London', countryCode: 'GB', venue: 'O2', seller: 'Skiddle', url: 'https://www.skiddle.com/x', external: true};

test('the plan runs tickets, travel, stay, food, then things to do', () => {
  const steps = plannerSteps(gig);
  assert.deepEqual(steps.map(s => s.kind), ['tickets', 'travel', 'stay', 'eat', 'tours']);
  assert.equal(steps[0].links[0].url, gig.url);
  assert.match(steps[2].blurb, /O2/);
});

test('partners that have not approved us stay as Coming soon (no links)', () => {
  const steps = plannerSteps(gig);
  for (const kind of ['travel', 'stay', 'eat']) assert.equal(steps.find(s => s.kind === kind).links.length, 0);
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
