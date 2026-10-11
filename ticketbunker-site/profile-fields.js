export function normalizeBusinessWebsite(value){
 let text=String(value||'').trim();if(!text)return '';
 text=text.replace(/^https?:[\\/|]*/i,'https://');
 if(!/^[a-z][a-z\d+.-]*:/i.test(text))text='https://'+text;
 let url;try{url=new URL(text);}catch{throw Error('Enter a website such as www.soundbunker.pt.');}
 if(!['https:','http:'].includes(url.protocol)||!url.hostname.includes('.')||url.username||url.password)throw Error('Enter a public website such as www.soundbunker.pt.');
 url.protocol='https:';return url.href;
}
