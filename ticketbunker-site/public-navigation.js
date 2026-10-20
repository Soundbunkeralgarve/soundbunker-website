const nav=document.getElementById('navigation'),toggle=document.getElementById('menu-toggle');
if(nav&&toggle){
 toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});
 const close=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');};
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus();}});
 const path=location.pathname.replace(/\.html$/,'');
 const route=path==='/for-organisers'?'organisers':path==='/about'?'about':'tickets';
 nav.querySelector(`[data-route="${route}"]`)?.setAttribute('aria-current','page');
}
