import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('private music browsing and playback use only the signed-in client folder',async()=>{
 const calls=[];
 const context=vm.createContext({URL,process:{env:{SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public-test',SUPABASE_SECRET_KEY:'private-test'}}});
 const source=new vm.SourceTextModule(await readFile(new URL('../api/client-music.js',import.meta.url),'utf8'),{context});
 const deps={
 '@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>token==='valid'?{data:{user:{id:'client-one'}}}:{error:true}},from:()=>({select:()=>({eq:(key,id)=>{assert.equal(id,'client-one');return {maybeSingle:async()=>({data:{dropbox_music_path:'/Clients/One/My Music'}})};}})})})},
 './lib/http.js':{json:(res,data,status=200)=>{res.status=status;res.data=data;}},
 './lib/dropbox.js':{listDropboxFolder:async path=>{calls.push(path);return [{type:'file',name:'demo.mp3'},{type:'file',name:'master.wav'},{type:'file',name:'notes.pdf'},{type:'folder',name:'Album'}];},dropboxEntryLink:async path=>{calls.push(path);return 'https://example.test/temporary-audio';}}
 };
 await source.link(spec=>new vm.SyntheticModule(Object.keys(deps[spec]),function(){for(const [k,v] of Object.entries(deps[spec]))this.setExport(k,v);},{context}));await source.evaluate();
 async function request(query='',token='valid'){const res={};await source.namespace.default({method:'GET',url:'/api/client-music'+query,headers:token?{authorization:'Bearer '+token}:{}},res);return res;}
 assert.equal((await request('',null)).status,401);assert.equal((await request('','invalid')).status,401);assert.equal(calls.length,0);
 const listing=await request();assert.equal(listing.status,200);assert.deepEqual(Array.from(listing.data.entries,x=>x.name),['Album','demo.mp3','master.wav']);
 const playback=await request('?action=play&path=Album%2Fmaster.wav');assert.equal(playback.status,200);assert.equal(playback.data.url,'https://example.test/temporary-audio');assert.equal(calls.at(-1),'/Clients/One/My Music/Album/master.wav');
 for(const path of ['../Other/demo.mp3','/Other/demo.mp3','Album/../../Other/demo.mp3','Album\\demo.mp3'])assert.equal((await request('?action=play&path='+encodeURIComponent(path))).status,400);
 assert.equal((await request('?action=play&path=notes.pdf')).status,400);
});
