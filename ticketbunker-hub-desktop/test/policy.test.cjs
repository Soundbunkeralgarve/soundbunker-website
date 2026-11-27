const test=require('node:test'),assert=require('node:assert/strict');
const {localWindowUrl,eventFromLink,desktopDataDirectory}=require('../policy.cjs');
test('desktop window accepts only the local organiser screen',()=>{
 assert.equal(localWindowUrl('http://127.0.0.1:8788/#private-token'),true);
 for(const url of ['https://evil.test','http://127.0.0.1:8788.evil.test/','http://127.0.0.1:8787/','file:///tmp/x','javascript:alert(1)','http://user@127.0.0.1:8788/'])assert.equal(localWindowUrl(url),false,url);
});
test('portal links carry only a valid event ID, never commands or credentials',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';assert.equal(eventFromLink('ticketbunkerhub://open?event='+id),id);
 for(const value of ['https://evil.test/?event='+id,'ticketbunkerhub://execute?event='+id,'ticketbunkerhub://open?event=../../db','ticketbunkerhub://open'])assert.equal(eventFromLink(value),null);
});

test('App Store ledgers remain inside the container and never reopen direct-download data implicitly',()=>{
 const base={home:'/Users/promoter',userData:'/Users/promoter/Library/Containers/pt.soundbunker.ticketbunkerhub/Data/Library/Application Support/TicketBunker Check-in Hub'};
 assert.equal(desktopDataDirectory(base),'/Users/promoter/.ticketbunker-hub');
 assert.equal(desktopDataDirectory({...base,override:'/tmp/hub-rehearsal'}),'/tmp/hub-rehearsal');
 assert.equal(desktopDataDirectory({...base,mas:true}),base.userData+'/ledger');
 assert.equal(desktopDataDirectory({...base,mas:true,override:base.userData+'/rehearsal'}),base.userData+'/rehearsal');
 for(const override of ['/Users/promoter/.ticketbunker-hub',base.userData+'/../old-ledger','/tmp/rehearsal'])
  assert.throws(()=>desktopDataDirectory({...base,mas:true,override}),/inside its app container/);
 assert.throws(()=>desktopDataDirectory({mas:true,home:base.home}),/container path is unavailable/);
});
