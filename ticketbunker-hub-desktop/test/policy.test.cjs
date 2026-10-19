const test=require('node:test'),assert=require('node:assert/strict');
const {localWindowUrl,eventFromLink}=require('../policy.cjs');
test('desktop window accepts only the local organiser screen',()=>{
 assert.equal(localWindowUrl('http://127.0.0.1:8788/#private-token'),true);
 for(const url of ['https://evil.test','http://127.0.0.1:8788.evil.test/','http://127.0.0.1:8787/','file:///tmp/x','javascript:alert(1)','http://user@127.0.0.1:8788/'])assert.equal(localWindowUrl(url),false,url);
});
test('portal links carry only a valid event ID, never commands or credentials',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';assert.equal(eventFromLink('ticketbunkerhub://open?event='+id),id);
 for(const value of ['https://evil.test/?event='+id,'ticketbunkerhub://execute?event='+id,'ticketbunkerhub://open?event=../../db','ticketbunkerhub://open'])assert.equal(eventFromLink(value),null);
});
