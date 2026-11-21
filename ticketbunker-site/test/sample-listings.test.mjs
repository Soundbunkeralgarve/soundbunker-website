import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sampleListings,homeRails} from '../sample-listings.js';
import {blend,filterItems} from '../discovery-model.js';

test('every sample is labelled, unbookable and has no link or seller of its own',()=>{
 for(const s of sampleListings){
  assert.equal(s.sample,true,s.key);assert.equal(s.bookable,false,s.key);assert.equal(s.url,'',s.key);
  assert.ok(s.key.startsWith('sample:'),s.key);assert.equal(s.source,'sample');
 }
});

test('samples can never enter the real catalogue',()=>{
 assert.equal(blend(sampleListings,[],Date.now()).length,0);
});

test('each homepage rail has varied sample artwork that exists on disk',()=>{
 for(const [category] of homeRails){
  const items=sampleListings.filter(s=>s.category===category);
  assert.ok(items.length>=3,category);
  assert.equal(new Set(items.map(i=>i.image)).size,items.length,category+' repeats an image');
 }
 for(const s of sampleListings)assert.ok(fs.existsSync(new URL('..'+s.image,import.meta.url)),s.image);
});

test('samples follow the chosen destination',()=>{
 const lagos=filterItems(sampleListings,{country:'PT',city:'Lagos'});
 assert.ok(lagos.length>0);assert.ok(lagos.every(s=>s.city==='Lagos'));
 assert.ok(filterItems(sampleListings,{country:'GB',city:'Algarve'}).length===0);
});
