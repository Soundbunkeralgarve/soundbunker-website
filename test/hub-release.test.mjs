import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupHubRelease} from '../ticketbunker-site/api/hub-release.js';
const tag='ticketbunker-hub-v1.0.0',base='https://github.com/Soundbunkeralgarve/soundbunker-website/releases/download/'+tag+'/';
function data(){return {tag_name:tag,assets:['TicketBunker-Hub-1.0.0-mac-arm64.dmg','TicketBunker-Hub-1.0.0-mac-x64.dmg','TicketBunker-Hub-1.0.0-win-x64.exe','SIGNED-RELEASE.txt'].map(name=>({name,state:'uploaded',size:100,browser_download_url:base+name}))};}
const fetcher=d=>async()=>({ok:true,json:async()=>d});
test('downloads appear only for a complete published signed release',async()=>{
 const good=data();assert.equal((await lookupHubRelease(fetcher(good))).downloads.length,3);
 for(const change of [d=>d.prerelease=true,d=>d.draft=true,d=>d.assets.pop(),d=>d.assets.shift(),d=>d.assets[0].browser_download_url='https://evil.test/app.dmg',d=>d.assets[0].size=0]){const d=data();change(d);assert.equal((await lookupHubRelease(fetcher(d))).available,false);}
});
test('unavailable release never creates a broken download',async()=>{assert.equal((await lookupHubRelease(async()=>{throw Error('offline');})).available,false);});
