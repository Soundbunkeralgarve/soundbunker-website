// Shared wire protocol. Crypto implementation is injected by Node / the native app.
export const HUB_PROTOCOL=1;
const HEX=/^[a-f0-9]+$/i;
export function fromHex(s,length){
 if(typeof s!=='string'||s.length!==length*2||!HEX.test(s))throw Error('Invalid hub key or envelope');
 return Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
}
export const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const utf8=s=>Uint8Array.from(unescape(encodeURIComponent(s)),c=>c.charCodeAt(0));
const text=bytes=>decodeURIComponent(escape(Array.from(bytes,b=>String.fromCharCode(b)).join('')));
export function privateHubOrigin(raw){
 const u=new URL(raw);const parts=u.hostname.split('.').map(Number);
 const privateIP=parts.length===4&&parts.every((p,i)=>Number.isInteger(p)&&p>=0&&p<=255&&String(p)===u.hostname.split('.')[i])&&
  (parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31);
 if(!privateIP||u.protocol!=='http:'||u.port!=='8787'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Pair with a hub on your private Wi-Fi network (port 8787).');
 return u.origin;
}
export function parseHubPairing(raw){
 const u=new URL(raw);
 if(u.protocol!=='ticketbunker-hub:'||u.hostname!=='pair')throw Error('Not a TicketBunker hub pairing QR.');
 const origin=privateHubOrigin(u.searchParams.get('url'));
 const hubId=u.searchParams.get('hub'),inviteId=u.searchParams.get('invite'),key=u.searchParams.get('key');
 if(!/^[a-f0-9-]{36}$/.test(hubId||'')||!/^[a-f0-9-]{36}$/.test(inviteId||''))throw Error('Invalid hub invitation.');
 fromHex(key,32);return {origin,hubId,inviteId,key};
}
export function createHubProtocol(nacl,randomBytes){
 return {
  seal(payload,key){
   const nonce=randomBytes(24);const box=nacl.secretbox(utf8(JSON.stringify(payload)),nonce,fromHex(key,32));
   return {v:HUB_PROTOCOL,nonce:toHex(nonce),box:toHex(box)};
  },
  open(envelope,key){
   if(envelope?.v!==HUB_PROTOCOL||typeof envelope.box!=='string'||envelope.box.length>100000||envelope.box.length<32||envelope.box.length%2||!HEX.test(envelope.box))throw Error('Invalid hub envelope.');
   const decoded=nacl.secretbox.open(fromHex(envelope.box,envelope.box.length/2),fromHex(envelope.nonce,24),fromHex(key,32));
   if(!decoded)throw Error('Hub message authentication failed.');
   return JSON.parse(text(decoded));
  }
 };
}
