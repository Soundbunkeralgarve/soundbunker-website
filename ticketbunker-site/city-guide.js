const status=document.querySelector('[data-guide-share-status]');
const url=document.querySelector('link[rel="canonical"]')?.href || location.href;
const copy=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Guide link copied.';}catch{status.textContent='Copy this guide link: '+url;}};
const print=document.querySelector('[data-guide-print]');if(print)print.onclick=()=>window.print();
const copyButton=document.querySelector('[data-guide-copy]');if(copyButton)copyButton.onclick=copy;
const share=document.querySelector('[data-guide-share]');if(share)share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,text:'Plan your next city trip with TicketBunker',url});else await copy();}catch(e){if(e.name!=='AbortError')await copy();}};
const finder=document.querySelector('[data-guide-finder]');
if(finder)finder.oninput=()=>{const term=finder.value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();for(const a of document.querySelectorAll('[data-city-guide]'))a.hidden=!a.textContent.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().includes(term);};
