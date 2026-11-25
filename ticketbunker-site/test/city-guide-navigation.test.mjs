import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function navigationRuntime() {
  const scrolls=[];
  const track={scrollLeft:80,clientWidth:343,scrollWidth:900,getBoundingClientRect:()=>({left:16,right:359}),scrollTo:options=>scrolls.push(options)};
  const link=(id,left,width)=>{
    const attrs=new Map([['href','#'+id]]), classes=new Set(), handlers={};
    return {id,attrs,classes,handlers,classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},
      getAttribute:name=>attrs.get(name),setAttribute:(name,value)=>attrs.set(name,value),removeAttribute:name=>attrs.delete(name),
      closest:()=>track,getBoundingClientRect:()=>({left,right:left+width,width}),
      addEventListener:(event,fn)=>{handlers[event]=fn;},scrollIntoView(){throw Error('Section tracking must not scroll the document');}};
  };
  const links=[link('food',30,100),link('nightlife',500,120)];
  let observer;
  class IntersectionObserver {constructor(fn){observer=fn;}observe(){}}
  const document={querySelector:()=>null,querySelectorAll:selector=>selector.startsWith('.cg-jumps')?links:[],getElementById:id=>({id})};
  vm.runInNewContext(readFileSync(new URL('../city-guide.js',import.meta.url),'utf8'),{document,window:{IntersectionObserver},IntersectionObserver,location:{href:'https://theticketbunker.com/guides/lisbon'}});
  return {links,scrolls,observe:entries=>observer(entries)};
}

test('guide scroll tracking reveals an offscreen section link using only horizontal menu scrolling',()=>{
  const {links,scrolls,observe}=navigationRuntime();
  observe([{isIntersecting:true,target:{id:'nightlife'}}]);
  assert.equal(links[1].attrs.get('aria-current'),'location');
  assert.ok(links[1].classes.has('active'));
  assert.equal(scrolls.length,1);
  assert.equal(scrolls[0].left,452.5,'centering uses the menu rectangle and its current scroll offset');
  assert.equal(scrolls[0].top,undefined,'document position must remain untouched');
});

test('visible guide links stay still and a clicked section becomes current immediately',()=>{
  const {links,scrolls,observe}=navigationRuntime();
  observe([{isIntersecting:true,target:{id:'food'}}]);
  assert.equal(scrolls.length,0,'a visible current link needs no horizontal movement');
  links[1].handlers.click();
  assert.equal(links[0].attrs.has('aria-current'),false);
  assert.equal(links[1].attrs.get('aria-current'),'location');
});
