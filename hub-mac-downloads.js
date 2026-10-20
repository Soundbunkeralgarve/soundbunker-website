(()=>{
 'use strict';
 const version='1.0.3',base='https://github.com/Soundbunkeralgarve/soundbunker-website/releases/download/ticketbunker-mac-v'+version+'/';
 let ready=false,busy=false,timer;
 async function refresh(){
  if(ready||busy||document.hidden||navigator.onLine===false)return;
  busy=true;clearTimeout(timer);
  try{
   const response=await fetch('/api/hub-release?channel=mac-testing',{credentials:'omit',signal:AbortSignal.timeout(18000)});
   if(!response.ok)return;
   const release=await response.json();
   if(!release.available||release.testing!==true||release.version!==version||!Array.isArray(release.downloads)||release.downloads.length!==2)return;
   const cards=[...document.querySelectorAll('[data-hub-mac-arch]')];
   if(cards.length!==2)return;
   for(const card of cards){const arch=card.dataset.hubMacArch;if(!['arm64','x64'].includes(arch)||!release.downloads.some(x=>x.arch===arch&&x.url===base+'TicketBunker-Hub-'+version+'-mac-'+arch+'.dmg'))return;}
   for(const card of cards){
    const link=document.createElement('a');link.className='hub-test-link';link.href=release.downloads.find(x=>x.arch===card.dataset.hubMacArch).url;link.target='_blank';link.rel='noopener';link.textContent='Download Mac hub ↓';
    card.querySelector('.hub-test-link').replaceWith(link);card.querySelector('p').textContent=version+' · signed & notarised DMG';
   }
   document.querySelector('[data-hub-mac-status]').textContent='Mac '+version+' is Apple-signed and notarised, with downloaded-app Gatekeeper checks passed.';
   const help=document.querySelector('[data-hub-mac-help]');help.querySelector('strong').textContent='Installing on Mac';help.querySelector('p').textContent='Choose Apple silicon for an M-series Mac or Intel for an Intel Mac. Open the DMG, drag TicketBunker Check-in Hub to Applications, then launch it from Applications. Replace your previous test copy. If macOS reports damage, stop and report the warning.';
   ready=true;
  }catch{ /* Keep the unavailable state when the release cannot be verified. */ }
  finally{busy=false;if(!ready)timer=setTimeout(refresh,60000);}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 window.addEventListener('online',()=>void refresh());
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void refresh(),{once:true});else void refresh();
})();
