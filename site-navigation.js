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
 nav.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);else if(event.target.closest('.lang'))closeGroups();});
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
 const labels = {
  pt: {
   services: 'Serviços', mixing: 'Mistura e masterização online', tuition: 'Aulas individuais online', production: 'Produção musical', remixes: 'Remixes',
   relocation: 'Mudança de instalações', photography: 'Fotografia', retreats: 'Retiros', bookPhoto: 'Marcar sessão fotográfica', shop: 'Loja', plugins: 'Plug-ins', more: 'Mais', label: 'Editora', journal: 'Diário do estúdio',
   redeem: 'Usar um vale', contact: 'Contacto', client: 'Área de cliente', order: 'Encomendar online', online: 'Serviços online',
  },
  fr: {
   services: 'Services', mixing: 'Mixage et mastering en ligne', tuition: 'Cours individuels en ligne', production: 'Production musicale', remixes: 'Remixes',
   relocation: 'Déménagement du studio', photography: 'Photographie', retreats: 'Séjours', bookPhoto: 'Réserver une séance photo', shop: 'Boutique', plugins: 'Plug-ins', more: 'Plus', label: 'Label', journal: 'Journal du studio',
   redeem: 'Utiliser un bon', contact: 'Contact', client: 'Espace client', order: 'Commander en ligne', online: 'Services en ligne',
  },
  de: {
   services: 'Leistungen', mixing: 'Online-Mixing und Mastering', tuition: 'Online-Einzelunterricht', production: 'Musikproduktion', remixes: 'Remixe',
   relocation: 'Studioumzug', photography: 'Fotografie', retreats: 'Retreats', bookPhoto: 'Fotoshooting buchen', shop: 'Shop', plugins: 'Plug-ins', more: 'Mehr', label: 'Plattenlabel', journal: 'Studio-Blog',
   redeem: 'Gutschein einlösen', contact: 'Kontakt', client: 'Kundenbereich', order: 'Online bestellen', online: 'Online-Angebote',
  },
 };
 const labelNodes = [...header.querySelectorAll('[data-nav-label]')].map(node => [node, node.textContent]);
 function localise() {
  const language = document.documentElement.lang.slice(0, 2);
  const copy = labels[language];
  for (const [node, initialText] of labelNodes) node.textContent = copy?.[node.dataset.navLabel] || initialText;
  const code = header.querySelector('.nav-language-code');
  if (code) code.textContent = (language || 'en').toUpperCase();
 }
 new MutationObserver(localise).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});localise();
 const current=location.pathname.replace(/\/$/,'/index.html').split('/').pop();nav.querySelectorAll('a').forEach(link=>{const destination=new URL(link.href,location.href);if(destination.pathname.split('/').pop()===current&&!destination.hash)link.setAttribute('aria-current','page');});
})();
