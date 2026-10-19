import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {chmodSync} from 'node:fs';
import {ticketUrl} from '../ticketbunker-scanner-native/lib/scanLogic.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
export class HubStore{
 constructor(path,{clock=Date.now,uptime=()=>performance.now()}={}){
  this.clock=clock;this.uptime=uptime;this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,digest TEXT NOT NULL,tier TEXT,used INTEGER NOT NULL,at TEXT,staff_id TEXT,device_id TEXT,synced INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,key TEXT NOT NULL,staff_id TEXT NOT NULL,label TEXT NOT NULL,expires INTEGER NOT NULL,request_id TEXT,device_binding TEXT,device_id TEXT);
   CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,key TEXT NOT NULL,staff_id TEXT NOT NULL,label TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,last_seen INTEGER);
   CREATE TABLE IF NOT EXISTS requests(device_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(device_id,id));`);
  if(!this.get('hubId'))this.set('hubId',randomUUID());
  if(!this.get('deviceKey'))this.set('deviceKey',randomBytes(32).toString('hex'));
  this.anchor=null;
 }
 get(key){const r=this.db.prepare('SELECT value FROM state WHERE key=?').get(key);return r?JSON.parse(r.value):null;}
 set(key,v){this.db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(v));}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 install(manifest){
  if(manifest.mode!=='hub'||manifest.laneCount!==1||!Array.isArray(manifest.staff)||!Array.isArray(manifest.tickets)||!['createdAt','serverTime','expiresAt'].every(k=>Number.isFinite(Date.parse(manifest[k])))||manifest.tickets.some(t=>!/^[a-f0-9-]{36}$/.test(t.id||'')||!/^[a-f0-9]{64}$/.test(t.digest||'')))throw Error('A verified shared-hub download is required.');
  this.transaction(()=>{
   const old=this.get('manifest');if(old&&old.claimId!==manifest.claimId)throw Error('Finish and sync the previous event first.');
   if(old&&this.get('stopped'))throw Error('This hub is finishing. Complete cloud sync before starting again.');
   const {tickets,...meta}=manifest;meta.offset=Date.parse(manifest.serverTime)-this.clock();meta.lastWall=this.clock();
   this.set('manifest',meta);this.set('stopped',false);this.set('pendingClaimId',null);
   this.db.prepare('DELETE FROM tickets WHERE used=0').run();
   const put=this.db.prepare('INSERT INTO tickets(id,digest,tier,used,synced) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest,tier=excluded.tier,used=max(tickets.used,excluded.used)');
   for(const t of tickets)put.run(t.id,t.digest,t.tier||'',t.used?1:0,t.used?1:0);
   // A refreshed staff list revokes local devices whose access no longer exists.
   for(const d of this.devices())if(!manifest.staff.some(s=>s.id===d.staff_id))this.revoke(d.id);
  });this.anchor=null;
 }
 serverNow(){
  const m=this.get('manifest');if(!m||this.get('stopped'))throw Error('Hub entry is not active.');
  const wall=this.clock();if(!this.anchor){if(wall<m.lastWall-2000)throw Error('Hub clock moved backwards. Reconnect to refresh.');this.anchor={wall,mono:this.uptime(),server:wall+m.offset};}
  const elapsed=this.uptime()-this.anchor.mono;
  if(Math.abs(wall-this.anchor.wall-elapsed)>5000)throw Error('Hub clock changed. Reconnect to refresh.');
  const now=this.anchor.server+elapsed;if(now>=Date.parse(m.expiresAt))throw Error('Hub entry permit expired. Reconnect to renew.');return now;
 }
 invitation(staffId,label){
  const m=this.get('manifest');this.serverNow();if(!m.staff.some(s=>s.id===staffId))throw Error('Select an authorised staff member.');
  const id=randomUUID(),key=randomBytes(32).toString('hex');
  this.db.prepare('INSERT INTO invitations(id,key,staff_id,label,expires) VALUES(?,?,?,?,?)').run(id,key,staffId,String(label).slice(0,80),this.clock()+300000);
  return {id,key};
 }
 invite(id){return this.db.prepare('SELECT * FROM invitations WHERE id=?').get(id);}
 pair(inviteId,{requestId,staffId,deviceBinding}){
  return this.transaction(()=>{
   const i=this.invite(inviteId);this.serverNow();
   if(!i||i.expires<this.clock()||i.staff_id!==staffId||!/^[a-f0-9]{64}$/.test(deviceBinding||''))throw Error('Pairing invitation expired or does not match this staff account.');
   if(i.device_id){if(i.request_id!==requestId||i.device_binding!==deviceBinding)throw Error('Pairing invitation already used.');return this.connection(this.device(i.device_id));}
   const id=randomUUID(),key=randomBytes(32).toString('hex');
   this.db.prepare('INSERT INTO devices(id,key,staff_id,label,last_seen) VALUES(?,?,?,?,?)').run(id,key,staffId,i.label,this.clock());
   this.db.prepare('UPDATE invitations SET request_id=?,device_binding=?,device_id=? WHERE id=?').run(requestId,deviceBinding,id,inviteId);
   return this.connection(this.device(id));
  });
 }
 connection(device){const m=this.get('manifest');return {hubId:this.get('hubId'),eventId:m.eventId,event:m.event,venue:m.venue,deviceId:device.id,key:device.key,staffId:device.staff_id,label:device.label};}
 device(id){return this.db.prepare('SELECT * FROM devices WHERE id=?').get(id);}
 devices(){return this.db.prepare('SELECT id,staff_id,label,revoked,last_seen FROM devices ORDER BY label').all();}
 revoke(id){this.db.prepare('UPDATE devices SET revoked=1 WHERE id=?').run(id);}
 scan(deviceId,requestId,raw){
  return this.transaction(()=>{
   const d=this.device(deviceId);if(!d||d.revoked)throw Error('Scanner access revoked.');
   const fingerprint=hash(String(raw));const old=this.db.prepare('SELECT * FROM requests WHERE device_id=? AND id=?').get(deviceId,requestId);
   if(old){if(old.fingerprint!==fingerprint)throw Error('Request ID reused for a different ticket.');return JSON.parse(old.response);}
   const now=this.serverNow();const m=this.get('manifest');let result;
   let u;try{u=new URL(ticketUrl(raw));}catch{result={status:'invalid',message:'Not a valid TicketBunker ticket QR.'};}
   if(u){
    const id=u.searchParams.get('id'),sig=u.searchParams.get('sig');
    const t=this.db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if(!t||t.digest!==hash(id+':'+sig))result={status:'invalid',message:'Ticket not in this event download. Refresh the hub if it was purchased recently.'};
    else if(t.used)result={status:'used',message:'Already admitted at this event.',checked_in_at:t.at};
    else{
     const at=new Date(Math.max(now,Date.parse(m.createdAt)+1)).toISOString();
     this.db.prepare('UPDATE tickets SET used=1,at=?,staff_id=?,device_id=?,synced=0 WHERE id=? AND used=0').run(at,d.staff_id,d.id,id);
     result={status:'valid',event:m.event,tier:t.tier,test:m.test,hub:true};
     m.lastWall=this.clock();this.set('manifest',m);
    }
   }
   this.db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(deviceId,requestId,fingerprint,JSON.stringify(result));
   this.db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(this.clock(),deviceId);
   return result;
  });
 }
 pending(){return this.db.prepare('SELECT id,at,staff_id AS staffId FROM tickets WHERE used=1 AND synced=0 AND at IS NOT NULL ORDER BY at LIMIT 200').all();}
 ack(ids){this.transaction(()=>{const q=this.db.prepare('UPDATE tickets SET synced=1 WHERE id=?');for(const id of ids)q.run(id);});}
 stop(){this.set('stopped',true);}
 finish(){if(this.pending().length)throw Error('Saved entries still need syncing.');this.transaction(()=>{this.set('manifest',null);this.set('stopped',true);this.db.exec('DELETE FROM tickets; DELETE FROM invitations; DELETE FROM devices; DELETE FROM requests;');});}
 status(){const m=this.get('manifest');const counts=this.db.prepare('SELECT count(*) AS total,coalesce(sum(used),0) AS admitted,coalesce(sum(CASE WHEN at IS NOT NULL AND synced=0 THEN 1 ELSE 0 END),0) AS pending FROM tickets').get();let ready=false,error='';try{this.serverNow();ready=true;}catch(e){error=e.message;}
  return {hubId:this.get('hubId'),event:m?.event,eventId:m?.eventId,expiresAt:m?.expiresAt,staff:m?.staff||[],...counts,ready,error,stopped:!!this.get('stopped'),devices:this.devices()};
 }
 close(){this.db.close();}
}
