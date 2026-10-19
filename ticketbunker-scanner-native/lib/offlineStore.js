import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {createOfflineEngine} from './offlineEngine';
let database;
async function db(){
 if(!database)database=SQLite.openDatabaseAsync('ticketbunker-offline.db').then(async d=>{
  await d.execAsync(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS manifests (claim TEXT PRIMARY KEY,user_id TEXT NOT NULL,event_id TEXT NOT NULL,active INTEGER NOT NULL,payload TEXT NOT NULL);
   CREATE UNIQUE INDEX IF NOT EXISTS offline_user_event ON manifests(user_id,event_id);
   CREATE TABLE IF NOT EXISTS tickets (claim TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,tier TEXT,used INTEGER NOT NULL DEFAULT 0,at TEXT,synced INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(claim,id));`);
  return d;
 });
 return database;
}
export const sqliteStore={
 async install(userId,m){
  const d=await db();
  const {tickets:download,...meta}=m;meta.ticketCount=download.length;
  await d.withExclusiveTransactionAsync(async tx=>{
   const old=await tx.getFirstAsync('SELECT claim FROM manifests WHERE user_id=? AND event_id=?',userId,m.eventId);
   if(old&&old.claim!==m.claimId)throw Error('Finish syncing the previous offline download first.');
   await tx.runAsync('INSERT INTO manifests VALUES(?,?,?,?,?) ON CONFLICT(claim) DO UPDATE SET active=1,payload=excluded.payload',m.claimId,userId,m.eventId,1,JSON.stringify(meta));
   await tx.runAsync('DELETE FROM tickets WHERE claim=? AND used=0',m.claimId);
   for(const t of download)await tx.runAsync('INSERT INTO tickets(claim,id,digest,tier,used,synced) VALUES(?,?,?,?,?,?) ON CONFLICT(claim,id) DO UPDATE SET digest=excluded.digest,tier=excluded.tier,used=max(tickets.used,excluded.used)',m.claimId,t.id,t.digest,t.tier||'',t.used?1:0,t.used?1:0);
  });
 },
 async manifest(user,event){const row=await (await db()).getFirstAsync('SELECT * FROM manifests WHERE user_id=? AND event_id=?',user,event);return row?{...JSON.parse(row.payload),active:!!row.active}:null;},
 async ticket(claim,id){return (await db()).getFirstAsync('SELECT * FROM tickets WHERE claim=? AND id=?',claim,id);},
 async consume(claim,id,at,wall){
  const d=await db();let changed=false;
  await d.withExclusiveTransactionAsync(async tx=>{
   const row=await tx.getFirstAsync('SELECT payload,active FROM manifests WHERE claim=?',claim);
   if(!row?.active)throw Error('Offline mode is closing.');
   const result=await tx.runAsync('UPDATE tickets SET used=1,at=?,synced=0 WHERE claim=? AND id=? AND used=0',at,claim,id);
   if(result.changes){const m=JSON.parse(row.payload);m.lastWall=wall;await tx.runAsync('UPDATE manifests SET payload=? WHERE claim=?',JSON.stringify(m),claim);changed=true;}
  });return changed;
 },
 async close(user,event){await (await db()).runAsync('UPDATE manifests SET active=0 WHERE user_id=? AND event_id=?',user,event);},
 async events(user){return (await (await db()).getAllAsync('SELECT event_id,payload,active FROM manifests WHERE user_id=?',user)).map(r=>{const m=JSON.parse(r.payload);return {id:r.event_id,title:m.event,venue:m.venue,offlineActive:!!r.active};});},
 async pending(claim){return (await db()).getAllAsync('SELECT id,at FROM tickets WHERE claim=? AND used=1 AND synced=0 AND at IS NOT NULL LIMIT 200',claim);},
 async acknowledge(claim,ids){const d=await db();await d.withExclusiveTransactionAsync(async tx=>{for(const id of ids)await tx.runAsync('UPDATE tickets SET synced=1 WHERE claim=? AND id=?',claim,id);});},
 async remove(claim){const d=await db();await d.withExclusiveTransactionAsync(async tx=>{
  const pending=await tx.getFirstAsync('SELECT count(*) AS n FROM tickets WHERE claim=? AND used=1 AND synced=0 AND at IS NOT NULL',claim);
  if(pending.n)throw Error('Saved scans still need syncing.');
  await tx.runAsync('DELETE FROM tickets WHERE claim=?',claim);await tx.runAsync('DELETE FROM manifests WHERE claim=?',claim);
 });}
};
export const offline=createOfflineEngine({store:sqliteStore,digest:value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value),deviceIdentity:async()=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,await deviceKey())});
export async function deviceKey(){
 let value=await SecureStore.getItemAsync('tbsc.offline.device');
 if(!value){value=Array.from(await Crypto.getRandomBytesAsync(32),b=>b.toString(16).padStart(2,'0')).join('');await SecureStore.setItemAsync('tbsc.offline.device',value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
 return value;
}
