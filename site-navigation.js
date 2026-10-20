(() => {
 const header=document.querySelector('.unified-header'),nav=header?.querySelector('#site-nav'),toggle=header?.querySelector('.menu-toggle');
 if(!header||!nav||!toggle)return;
 const narrow=matchMedia('(max-width:1100px)');
 const groups=[...nav.querySelectorAll('.navigation-group')];
 const setGroup=(group,open)=>{group.classList.toggle('is-open',open);group.querySelector('.navigation-group-toggle').setAttribute('aria-expanded',String(open));};
 const closeGroups=()=>groups.forEach(group=>setGroup(group,false));
 function setOpen(open,{restoreFocus=false}={}){
  header.classList.toggle('menu-is-open',open);nav.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close menu':'Open menu');document.documentElement.classList.toggle('navigation-open',open);
  if(!open){closeGroups();if(restoreFocus)toggle.focus();}
 }
 toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
 groups.forEach(group=>group.querySelector('.navigation-group-toggle').addEventListener('click',()=>{const open=!group.classList.contains('is-open');closeGroups();setGroup(group,open);}));
 nav.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
 document.addEventListener('click',event=>{if(!header.contains(event.target)){setOpen(false);}});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){const open=toggle.getAttribute('aria-expanded')==='true';const group=groups.find(group=>group.classList.contains('is-open'));if(open){event.preventDefault();setOpen(false,{restoreFocus:true});}else if(group){event.preventDefault();setGroup(group,false);group.querySelector('button').focus();}return;}
  if(event.key==='Tab'&&narrow.matches&&toggle.getAttribute('aria-expanded')==='true'){
   const items=[toggle,...nav.querySelectorAll('a,button')].filter(node=>node.getClientRects().length&&!node.disabled);const first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 });
 narrow.addEventListener('change',()=>setOpen(false));
 // Keep the navigation labels consistent with the existing page translator.
 const labels={en:{home:'Home',services:'Services',academy:'Academy',shop:'Shop',more:'More',client:'Client area',book:'Book now'},pt:{home:'Início',services:'Serviços',academy:'Academia',shop:'Loja',more:'Mais',client:'Área de cliente',book:'Reservar'},fr:{home:'Accueil',services:'Services',academy:'Académie',shop:'Boutique',more:'Plus',client:'Espace client',book:'Réserver'},de:{home:'Start',services:'Leistungen',academy:'Akademie',shop:'Shop',more:'Mehr',client:'Kundenbereich',book:'Buchen'}};
 function localise(){const copy=labels[document.documentElement.lang]||labels.en;header.querySelectorAll('[data-nav-label]').forEach(node=>{node.textContent=copy[node.dataset.navLabel]||node.textContent;});}
 new MutationObserver(localise).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});localise();
 const current=location.pathname.replace(/\/$/,'/index.html').split('/').pop();nav.querySelectorAll('a').forEach(link=>{const destination=new URL(link.href,location.href);if(destination.pathname.split('/').pop()===current&&!destination.hash)link.setAttribute('aria-current','page');});
})();
