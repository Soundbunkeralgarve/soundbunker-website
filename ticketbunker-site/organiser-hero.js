const hero=document.querySelector('.organiser-event-hero');
if(hero){
 const scenes=[...hero.querySelectorAll('.organiser-event-scenes img')],button=document.getElementById('organiser-hero-pause'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 let current=0,paused=motion.matches,timer;
 function play(){clearInterval(timer);hero.classList.toggle('motion-paused',paused||document.hidden);button.textContent=paused?'Play':'Pause';button.setAttribute('aria-label',paused?'Play organiser hero animation':'Pause organiser hero animation');if(!paused&&!document.hidden)timer=setInterval(()=>{current=(current+1)%scenes.length;scenes.forEach((s,i)=>s.classList.toggle('active',i===current));},6500);}
 button.addEventListener('click',()=>{paused=!paused;play();});
 document.addEventListener('visibilitychange',play);motion.addEventListener('change',()=>{paused=motion.matches;play();});play();
}
