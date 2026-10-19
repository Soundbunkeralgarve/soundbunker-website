import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
test('offline lane reservations enforce ownership and safe reconciliation in isolated Postgres',async()=>{
const db=new PGlite();
await db.exec(readFileSync(new URL('./fixtures/offline-scanner-schema.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../SUPABASE_TICKETBUNKER_OFFLINE_SCANNER.sql',import.meta.url),'utf8'));
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',event='cccccccc-cccc-4ccc-8ccc-cccccccccccc',tier='dddddddd-dddd-4ddd-8ddd-dddddddddddd',order='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
await db.query('insert into auth.users values($1),($2)',[actor,other]);
await db.query("insert into profiles(id,role) values($1,'admin'),($2,'user')",[actor,other]);
await db.query("insert into sb_events(id,title,venue,status,starts_at) values($1,'Offline Lane Test','Test Venue','published',now()+interval '1 hour')",[event]);
await db.query("insert into sb_event_tiers values($1,'GA')",[tier]);
await db.query("insert into sb_event_orders(id,status,beta_test_order) values($1,'paid',false)",[order]);
const tickets=[];for(let n=0;n<8;n++){let id=n.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000001';tickets.push(id);await db.query('insert into sb_event_tickets(id,event_id,order_id,tier_id) values($1,$2,$3,$4)',[id,event,order,tier]);}
await db.exec('set role service_role');
const prep=async(device,resume=null,lanes=4)=>(await db.query('select tb_prepare_offline_scanner($1,$2,$3,$4,$5) as m',[event,actor,device.repeat(64),resume,lanes])).rows[0].m;
const sync=async(m,device,entries,release=false)=>(await db.query('select tb_sync_offline_scanner($1,$2,$3,$4::jsonb,$5) as m',[m.claimId,actor,device.repeat(64),JSON.stringify(entries),release])).rows[0].m;
const claims=[];for(let i=0;i<4;i++)claims.push(await prep(String(i+1)));
assert.deepEqual(claims.map(x=>x.lane),[1,2,3,4]);
assert.equal(new Set(claims.flatMap(x=>x.tickets.map(t=>t.id))).size,8);
for(const c of claims)assert.equal(c.tickets.length,2);
await assert.rejects(prep('5'),/All offline lanes/);
await assert.rejects(prep('1'),/original saved download/);
await assert.rejects(prep('1',claims[0].claimId,3),/configured for 4/);
await assert.rejects(db.query('select tb_prepare_offline_scanner($1,$2,$3,null,4)',[event,other,'f'.repeat(64)]),/Staff access denied/);
const ticket=claims[0].tickets[0].id;
await assert.rejects(db.query('update sb_event_tickets set checked_in_at=now() where id=$1',[ticket]),/offline lane 1/);
await assert.rejects(db.query('update sb_event_tickets set transfer_version=1 where id=$1',[ticket]),/assigned to an offline scanner/);
await assert.rejects(sync(claims[1],'2',[{id:ticket,at:new Date().toISOString()}]),/not reserved/);
// PGlite server time uses actual time, so use server permit timestamps for receipts.
const at=claims[0].createdAt;
const result=await sync(claims[0],'1',[{id:ticket,at}]);assert.equal(result.accepted[0],ticket);
assert.equal((await sync(claims[0],'1',[{id:ticket,at}])).accepted[0],ticket);
const used=(await db.query('select checked_in_at from sb_event_tickets where id=$1',[ticket])).rows[0];assert.ok(used.checked_in_at);
await assert.rejects(sync(claims[0],'2',[]),/identity mismatch/);
await assert.rejects(sync(claims[0],'1',[{id:claims[0].tickets[1].id,at:'2000-01-01T00:00:00Z'}]),/outside the offline permit/);
await sync(claims[0],'1',[],true);
// Used entries remain used, unused tickets can now be scanned online.
await db.query('update sb_event_tickets set checked_in_at=now() where id=$1',[claims[0].tickets[1].id]);
const replacement=await prep('5');assert.equal(replacement.lane,1);assert.equal(replacement.tickets.length,0);
assert.equal((await sync(claims[0],'1',[{id:ticket,at}],true)).released,true);
for(const c of claims.slice(1))await sync(c,String(c.lane),[],true);
await sync(replacement,'5',[],true);
// A hub reserves all remaining tickets and records the actual staff member.
await db.query('insert into sb_event_staff_access values($1,$2,$3,null)',[other,event,other]);
await assert.rejects(db.query('select tb_prepare_offline_scanner($1,$2,$3,null,1,true)',[event,other,'f'.repeat(64)]),/Only the organiser/);
const hubId='99999999-9999-4999-8999-999999999999';
const hub=(await db.query('select tb_prepare_offline_scanner($1,$2,$3,$4,1,true) as m',[event,actor,'f'.repeat(64),hubId])).rows[0].m;
await db.query('insert into tb_event_reports(event_id) values($1)',[event]);
assert.equal((await db.query('select checkin_status from tb_event_reports where event_id=$1',[event])).rows[0].checkin_status,'pending_offline_sync');
assert.equal(hub.claimId,hubId);assert.equal(hub.mode,'hub');assert.equal(hub.staff.length,2);
await assert.rejects(db.query('update sb_event_tickets set checked_in_at=now() where id=$1',[hub.tickets[0].id]),/local check-in hub/);
await assert.rejects(db.query('select tb_prepare_offline_scanner($1,$2,$3,null,1,true)',[event,actor,'e'.repeat(64)]),/All offline lanes/);
// Refresh revokes new entry for a staff member, but still accepts their earlier receipts.
await db.query('update sb_event_staff_access set revoked_at=now() where user_id=$1',[other]);
const refreshed=(await db.query('select tb_prepare_offline_scanner($1,$2,$3,$4,1,true) as m',[event,actor,'f'.repeat(64),hubId])).rows[0].m;assert.equal(refreshed.staff.length,1);
await db.query('select tb_sync_offline_scanner($1,$2,$3,$4::jsonb,false)',[hubId,actor,'f'.repeat(64),JSON.stringify([{id:hub.tickets[0].id,at:hub.createdAt,staffId:other}])]);
assert.equal((await db.query('select checked_in_by from sb_event_tickets where id=$1',[hub.tickets[0].id])).rows[0].checked_in_by,other);
await assert.rejects(db.query('select tb_sync_offline_scanner($1,$2,$3,$4::jsonb,false)',[hubId,actor,'f'.repeat(64),JSON.stringify([{id:hub.tickets[1].id,at:hub.createdAt,staffId:'12345678-1234-4234-8234-123456789abc'}])]),/not in the hub download/);
await db.query('select tb_sync_offline_scanner($1,$2,$3,$4::jsonb,true)',[hubId,actor,'f'.repeat(64),'[]']);
const report=(await db.query('select checked_in,checkin_status,offline_scanners_pending from tb_event_reports where event_id=$1',[event])).rows[0];assert.equal(report.checked_in,3);assert.equal(report.checkin_status,'reconciled');assert.equal(report.offline_scanners_pending,0);
await db.exec('reset role');
const privileges=(await db.query("select has_function_privilege('authenticated','public.tb_prepare_offline_scanner(uuid,uuid,text,uuid,integer,boolean)','execute') as auth,has_table_privilege('anon','public.tb_scanner_reservations','select') as anon")).rows[0];assert.equal(privileges.auth,false);assert.equal(privileges.anon,false);

await db.close();
});
