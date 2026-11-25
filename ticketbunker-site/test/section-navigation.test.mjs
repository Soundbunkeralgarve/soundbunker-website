import test from 'node:test';
import assert from 'node:assert/strict';
import {keepChipVisible, mountSectionNavigation, scrollToSection} from '../section-navigation.js';

function globals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable:true, writable:true});
    t.after(() => before ? Object.defineProperty(globalThis, key, before) : delete globalThis[key]);
  }
}

test('revealing an active chip scrolls only its horizontal track and leaves visible chips alone', t => {
  const calls = [];
  globals(t, {window:{scrollY:412, scrollTo(){ assert.fail('chip reveal must not move the page'); }}});
  const track = {
    scrollLeft:90,
    getBoundingClientRect:() => ({left:16,right:196}),
    scrollTo: options => calls.push(options),
    scrollIntoView(){ assert.fail('track must not scroll its ancestors'); }
  };
  const chip = (left, right) => ({getBoundingClientRect:() => ({left,right}), scrollIntoView(){ assert.fail('chip must not scroll its ancestors'); }});
  keepChipVisible(track, chip(155,230));
  assert.deepEqual(calls, [{left:132,behavior:'auto'}]);
  calls.length = 0;
  keepChipVisible(track, chip(8,88));
  assert.deepEqual(calls, [{left:74,behavior:'auto'}]);
  calls.length = 0;
  keepChipVisible(track, chip(30,180));
  assert.deepEqual(calls, []);
  assert.equal(window.scrollY,412);
});

test('a narrow track reveals a partly clipped chip and never requests a negative horizontal offset', () => {
  const calls = [];
  const track = {scrollLeft:4,getBoundingClientRect:() => ({left:12,right:112}),scrollTo: options => calls.push(options)};
  keepChipVisible(track, {getBoundingClientRect:() => ({left:55,right:118})});
  keepChipVisible(track, {getBoundingClientRect:() => ({left:8,right:70})});
  assert.deepEqual(calls,[{left:18,behavior:'auto'},{left:0,behavior:'auto'}]);
});

test('section targets below the bar clear the measured header and full bar, including a resized bar', t => {
  const calls = [];
  let barHeight = 96.5;
  const target = {getBoundingClientRect:() => ({top:280})};
  const bar = {compareDocumentPosition: el => el === target ? 4 : 0,getBoundingClientRect:() => ({height:barHeight})};
  globals(t, {
    document:{querySelector:() => ({getBoundingClientRect:() => ({height:67.5})}),getElementById:() => bar},
    window:{scrollY:620,scrollTo: options => calls.push(options)},
    matchMedia:() => ({matches:false})
  });
  scrollToSection(target);
  barHeight = 142.5;
  scrollToSection(target);
  assert.deepEqual(calls,[{top:720,behavior:'smooth'},{top:674,behavior:'smooth'}]);
});

test('returning to the search above the bar clears only the header and focuses without a second scroll', t => {
  const calls = [];
  const target = {
    getBoundingClientRect:() => ({top:-220}),
    hasAttribute:() => false,
    focus: options => calls.push({focus:options})
  };
  globals(t, {
    document:{querySelector:() => ({getBoundingClientRect:() => ({height:68})}),getElementById:() => ({compareDocumentPosition:() => 2,getBoundingClientRect:() => ({height:130})})},
    window:{scrollY:720,scrollTo: options => calls.push({scroll:options})},
    matchMedia:() => ({matches:true})
  });
  scrollToSection(target,{focus:true});
  assert.equal(target.tabIndex,-1);
  assert.deepEqual(calls,[{scroll:{top:416,behavior:'auto'}},{focus:{preventScroll:true}}]);
});

test('following a page scroll updates and reveals the active section without moving the page vertically', t => {
  const listeners = {}, frames = [], horizontal = [], measure = [];
  const sections = [
    {id:'discover',getBoundingClientRect:() => ({bottom:100}),closest:() => null},
    {id:'rail-music',getBoundingClientRect:() => ({bottom:700}),closest:() => null},
    {id:'rail-club',getBoundingClientRect:() => ({bottom:1200}),closest:() => null}
  ];
  const view = {
    addEventListener:(type, fn) => { listeners[type] = fn; },
    requestAnimationFrame:fn => { frames.push(fn); return frames.length; },
    scrollTo(){ assert.fail('active-section tracking must not move the page'); }
  };
  const track = {
    children:[],scrollLeft:0,
    addEventListener(){},
    replaceChildren(...children){ this.children = children; },
    querySelectorAll(){ return this.children; },
    getBoundingClientRect:() => ({left:0,right:160}),
    scrollTo: options => horizontal.push(options)
  };
  const bar = {getBoundingClientRect:() => ({height:120})}, nav = {hidden:true};
  const root = {
    defaultView:view,
    documentElement:{style:{setProperty:(...args) => measure.push(args)}},
    querySelector:() => ({getBoundingClientRect:() => ({height:70})}),
    querySelectorAll:() => sections,
    createElement:() => {
      const attrs = new Map(), classes = new Set();
      return {
        dataset:{},attrs,classes,
        setAttribute:(k,v) => attrs.set(k,v),removeAttribute:k => attrs.delete(k),
        classList:{toggle:(k,on) => on ? classes.add(k) : classes.delete(k)},
        getBoundingClientRect(){ return this.dataset.tab === 'rail-music' ? {left:300,right:380} : {left:0,right:80}; },
        scrollIntoView(){ assert.fail('active chips must not scroll the document'); }
      };
    }
  };
  globals(t,{document:root,window:view});
  const navigation = mountSectionNavigation({bar,nav,track,root});
  navigation.refresh();
  assert.equal(nav.hidden,false);
  assert.deepEqual(measure,[['--tb-section-nav-height','120px']]);
  listeners.scroll(); listeners.scroll();
  assert.equal(frames.length,1,'scroll events share one animation frame');
  frames.shift()();
  const active = track.children.find(el => el.dataset.tab === 'rail-music');
  assert.equal(active.attrs.get('aria-current'),'location');
  assert.equal(active.classes.has('active'),true);
  assert.equal(track.children[0].attrs.has('aria-current'),false);
  assert.deepEqual(horizontal,[{left:228,behavior:'auto'}]);
});
