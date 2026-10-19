import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {PUBLIC_CONFIG} from '../ticketbunker-scanner-native/lib/publicConfig.js';
const BASE='https://www.soundbunker.pt';
export class HubCloud{
 constructor(store,{fetcher=fetch}={}){this.store=store;this.fetcher=fetcher;this.queue=Promise.resolve();this.message='';}
 serial(fn){const p=this.queue.then(fn,fn);this.queue=p.catch(()=>{});return p;}
 async login(email,password){
  const client=createClient(PUBLIC_CONFIG.url,PUBLIC_CONFIG.key,{global:{fetch:(url,opts)=>this.fetcher(url,{...opts,signal:AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error||!data.user?.email_confirmed_at)throw Error('Sign in with a verified organiser account.');
  const owner=this.store.get('claimUserId');if(this.store.get('manifest')&&owner&&owner!==data.user.id)throw Error('Reconnect the original organiser account while this event is active.');
  this.store.set('session',data.session);return {email:data.user.email};
 }
 async api(body,path='/api/event-scanner-offline'){
  let session=this.store.get('session');if(!session)throw Error('Sign in on this laptop before downloading or syncing.');
  if(session.expires_at*1000<Date.now()+60000){
   const client=createClient(PUBLIC_CONFIG.url,PUBLIC_CONFIG.key,{global:{fetch:(url,opts)=>this.fetcher(url,{...opts,signal:AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await client.auth.refreshSession({refresh_token:session.refresh_token});if(error||!data.session)throw Error('Reconnect your organiser account to sync. Local entries remain safe.');
   session=data.session;this.store.set('session',session);
  }
  const response=await this.fetcher(BASE+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+session.access_token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Cloud sync unavailable.');return data;
 }
 events(){return this.api(null,'/api/event-staff?mode=my');}
 async upload(){
  const m=this.store.get('manifest');if(!m)return;
  for(;;){const entries=this.store.pending();if(!entries.length)break;
   const result=await this.api({action:'sync',claimId:m.claimId,deviceKey:this.store.get('deviceKey'),entries});
   if(!Array.isArray(result.accepted)||entries.some(e=>!result.accepted.includes(e.id)))throw Error('Some entries were not acknowledged. They remain saved on this laptop.');
   this.store.ack(result.accepted);
  }
  if(this.store.get('stopped')){
   const result=await this.api({action:'sync',claimId:m.claimId,deviceKey:this.store.get('deviceKey'),entries:[],release:true});
   if(!result.released)throw Error('Cloud ownership is still reserved. Try finishing again.');
   this.store.finish();
  }
 }
 prepare(eventId){return this.serial(async()=>{
  await this.upload();const old=this.store.get('manifest');
  if(old&&old.eventId!==eventId)throw Error('Finish the current event before downloading another.');
  let pending=this.store.get('pendingClaimId');if(!old&&!pending){pending={id:randomUUID(),eventId};this.store.set('pendingClaimId',pending);}
  if(pending&&pending.eventId!==eventId)throw Error('Complete the previous event download first.');
  this.store.set('claimUserId',this.store.get('session')?.user?.id||null);
  const m=await this.api({action:'prepare',mode:'hub',eventId,laneCount:1,deviceKey:this.store.get('deviceKey'),claimId:old?.claimId||pending.id});
  this.store.install(m);this.store.set('lastRefresh',Date.now());this.message='Cloud connected · event download refreshed';return this.store.status();
 });}
 sync(){return this.serial(async()=>{try{await this.upload();const m=this.store.get('manifest');if(m&&!this.store.get('stopped')&&Date.now()-(this.store.get('lastRefresh')||0)>60000){const fresh=await this.api({action:'prepare',mode:'hub',eventId:m.eventId,laneCount:1,deviceKey:this.store.get('deviceKey'),claimId:m.claimId});this.store.install(fresh);this.store.set('lastRefresh',Date.now());}this.message='Saved entries synced';}catch(e){this.message='Cloud unavailable · entries saved locally';throw e;}});}
 finish(){this.store.stop();return this.serial(async()=>{await this.upload();this.message='All entries synced. Offline ownership released.';});}
}
