// The same real tickets are a desktop deck and a native scrolling phone rail.
export function mountHeroTickets({box,deck,dots,reduceMotion}){
 const cards=[...deck.children],buttons=[...dots.children];
 const mobile=matchMedia('(max-width:760px)');
 let front=0,timer,frame;
 deck.setAttribute('role','region');deck.setAttribute('aria-label','Featured tickets');deck.tabIndex=0;
 function active(index){front=Math.max(0,Math.min(cards.length-1,index));buttons.forEach((button,n)=>{if(n===front)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});}
 function show(index){
  active((index+cards.length)%cards.length);
  cards.forEach((card,n)=>{
   const position=(n-front+cards.length)%cards.length;card.dataset.pos=position;
   card.tabIndex=mobile.matches||position===0?0:-1;
   if(mobile.matches)card.removeAttribute('aria-hidden');else card.setAttribute('aria-hidden',String(position!==0));
  });
 }
 function scrollTo(index){
  const next=Math.max(0,Math.min(cards.length-1,index));
  const padding=parseFloat(getComputedStyle(deck).paddingLeft)||0;
  deck.scrollTo({left:cards[next].offsetLeft-padding,behavior:reduceMotion()?'auto':'smooth'});
  active(next);
 }
 function restart(){
  clearInterval(timer);
  if(!mobile.matches&&cards.length>1&&!reduceMotion())timer=setInterval(()=>{if(!document.hidden&&!box.matches(':hover,:focus-within'))show(front+1);},3800);
 }
 function layout(){show(0);deck.scrollLeft=0;restart();}
 function onScroll(){
  if(!mobile.matches)return;
  cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const padding=parseFloat(getComputedStyle(deck).paddingLeft)||0;
   let nearest=0,distance=Infinity;
   cards.forEach((card,index)=>{const delta=Math.abs(card.offsetLeft-padding-deck.scrollLeft);if(delta<distance){distance=delta;nearest=index;}});
   active(nearest);
  });
 }
 function onClick(event){const button=event.target.closest('[data-hs]');if(!button)return;
  const index=Number(button.dataset.hs);mobile.matches?scrollTo(index):show(index);restart();
 }
 function onKey(event){
  if(!mobile.matches||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const fromTicket=event.target.closest('.hs-ticket'),current=fromTicket?cards.indexOf(fromTicket):front;scrollTo(event.key==='Home'?0:event.key==='End'?cards.length-1:current+(event.key==='ArrowRight'?1:-1));if(fromTicket)cards[front].focus({preventScroll:true});
 }
 mobile.addEventListener('change',layout);deck.addEventListener('scroll',onScroll,{passive:true});deck.addEventListener('keydown',onKey);dots.addEventListener('click',onClick);
 layout();
 return()=>{clearInterval(timer);cancelAnimationFrame(frame);mobile.removeEventListener('change',layout);deck.removeEventListener('scroll',onScroll);deck.removeEventListener('keydown',onKey);dots.removeEventListener('click',onClick);};
}
