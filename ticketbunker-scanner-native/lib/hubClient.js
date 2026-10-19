import {parseHubPairing,privateHubOrigin} from './hubProtocol.js';
export function createHubClient({storage,protocol,request,randomId,deviceIdentity,digest}){
 const key=user=>'hub-connection-'+user,pairKey=user=>'hub-pairing-'+user,pendingKey=user=>'hub-pending-'+user;
 const read=async k=>{const v=await storage.getItem(k);return v?JSON.parse(v):null;};
 async function connection(user){const c=await read(key(user));if(c&&c.binding!==await deviceIdentity())throw Error('Hub pairing belongs to another device. Pair this phone again.');return c;}
 async function exchange(c,payload){
  privateHubOrigin(c.origin);
  const envelope=protocol.seal({...payload,hubId:c.hubId,deviceId:c.deviceId},c.key);
  const response=await request(c.origin+'/v1/message',{...envelope,id:c.deviceId});
  const result=protocol.open(response,c.key);
  if(result.requestId!==payload.requestId||result.hubId!==c.hubId||result.deviceId!==c.deviceId)throw Error('Hub response does not match this scan. Do not admit.');
  return result;
 }
 return {
  connection,
  async pair(user,raw){
   const p=parseHubPairing(raw);const binding=await deviceIdentity();let pending=await read(pairKey(user));
   if(!pending||pending.inviteId!==p.inviteId){pending={...p,requestId:randomId(),binding};await storage.setItem(pairKey(user),JSON.stringify(pending));}
   if(pending.binding!==binding)throw Error('Start pairing again on this device.');
   const payload={requestId:pending.requestId,hubId:p.hubId,staffId:user,deviceBinding:binding};
   const response=await request(p.origin+'/v1/pair',{...protocol.seal(payload,p.key),id:p.inviteId});
   const c=protocol.open(response,p.key);
   if(c.requestId!==pending.requestId||c.hubId!==p.hubId||c.staffId!==user||!c.deviceId||!c.key||!c.eventId)throw Error('Pairing response does not match this phone.');
   const value={...c,origin:p.origin,binding};
   await storage.setItem(key(user),JSON.stringify(value));await storage.removeItem(pairKey(user));return value;
  },
  async ping(user){const c=await connection(user);if(!c)throw Error('Connect to the local hub first.');return exchange(c,{action:'ping',requestId:randomId()});},
  async scan(user,eventId,code){
   const c=await connection(user);if(!c||c.eventId!==eventId)throw Error('Use the event paired to this local hub.');
   let pending=await read(pendingKey(user));const fingerprint=await digest(code);
   if(pending&&pending.fingerprint!==fingerprint)throw Error('The previous ticket has no confirmed result. Rescan that same ticket before continuing.');
   if(!pending){pending={requestId:randomId(),fingerprint};await storage.setItem(pendingKey(user),JSON.stringify(pending));}
   const result=await exchange(c,{action:'scan',requestId:pending.requestId,code});
   // Forget the request durably before showing approval; a new scan gets a new ID.
   await storage.removeItem(pendingKey(user));return result;
  },
  async forget(user){await storage.removeItem(key(user));await storage.removeItem(pairKey(user));await storage.removeItem(pendingKey(user));}
 };
}
