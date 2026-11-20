import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',crew='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',stranger='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const org='dddddddd-dddd-4ddd-8ddd-dddddddddddd',event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',rehearsal='ffffffff-ffff-4fff-8fff-ffffffffffff';
const tier='11111111-1111-4111-8111-111111111111',freeTier='22222222-2222-4222-8222-222222222222';
const req=n=>'99999999-9999-4999-8999-'+String(n).padStart(12,'0');

async function database(){
 const db=new PGlite();
 await db.exec(readFileSync(new URL('./fixtures/door-sales-schema.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../SUPABASE_TICKETBUNKER_DOOR_SALES.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2),($3)',[owner,crew,stranger]);
 await db.query("insert into profiles(id,role) values($1,'user'),($2,'user'),($3,'user')",[owner,crew,stranger]);
 await db.query('insert into sb_event_organisers values($1,$2)',[org,owner]);
 await db.query("insert into sb_events(id,organiser_profile_id,title,status,starts_at) values($1,$2,'Door Night','published',now()-interval '1 hour')",[event,org]);
 await db.query("insert into sb_events(id,organiser_profile_id,title,status,starts_at,internal_free_test,test_expires_at) values($1,$2,'Rehearsal','published',now()+interval '30 days',true,now()+interval '1 day')",[rehearsal,org]);
 await db.query("insert into sb_event_tiers values($1,$2,'GA',1000,5),($3,$4,'Test',0,20)",[tier,event,freeTier,rehearsal]);
 await db.query('insert into sb_event_staff_access(event_id,user_id) values($1,$2)',[event,crew]);
 await db.exec('set role service_role');
 return db;
}
const one=async(db,sql,args)=>Object.values((await db.query(sql,args)).rows[0])[0];

test('cash door sales are idempotent, admitted and kept out of Stripe refunds',async()=>{
 const db=await database();
 const sale=await one(db,'select tb_door_cash_sale($1,$2,$3,2,$4)',[req(1),event,tier,crew]);
 assert.equal(sale.status,'paid');assert.equal(sale.totalCents,2000);assert.equal(sale.quantity,2);
 assert.deepEqual(await one(db,'select tb_door_cash_sale($1,$2,$3,2,$4)',[req(1),event,tier,crew]),sale,'retrying the same request records nothing new');
 await assert.rejects(db.query('select tb_door_cash_sale($1,$2,$3,3,$4)',[req(1),event,tier,crew]),/Start a new door sale/);
 const tickets=(await db.query('select checked_in_at,checked_in_by from sb_event_tickets where order_id=$1',[sale.orderId])).rows;
 assert.equal(tickets.length,2);assert.ok(tickets.every(t=>t.checked_in_at&&t.checked_in_by===crew));
 await assert.rejects(db.query('select tb_door_cash_sale($1,$2,$3,4,$4)',[req(2),event,tier,owner]),/Not enough GA tickets left/);
 await assert.rejects(db.query('select tb_door_cash_sale($1,$2,$3,1,$4)',[req(3),event,tier,stranger]),/Door access denied/);
 const summary=await one(db,'select tb_door_summary($1,$2)',[event,owner]);
 assert.equal(summary.inside,2);assert.equal(summary.sold,2);assert.equal(summary.capacity,5);
 assert.deepEqual(summary.doorCash,{tickets:2,cents:2000});assert.deepEqual(summary.doorCard,{tickets:0,cents:0});
 assert.equal(summary.tiers[0].remaining,3);
 await db.exec('reset role');
 await db.query('insert into tb_event_cancellations values($1,now())',[event]);await db.query("update sb_events set status='cancelled' where id=$1",[event]);
 await db.exec('set role service_role');
 assert.equal(await one(db,'select tb_queue_cancelled_order($1)',[sale.orderId]),true);
 assert.equal(await one(db,'select count(*)::int from tb_cancellation_refunds',[]),0,'cash is never queued for a Stripe refund');
});

test('card door sales reserve capacity and are admitted once paid',async()=>{
 const db=await database();
 const order=(await db.query('select * from tb_door_card_reserve($1,$2,$3,3,$4)',[req(10),event,tier,crew])).rows[0];
 assert.equal(order.door_sale,'card');assert.equal(order.tb_payment_flow,'separate_v1');assert.equal(order.status,'reserved');assert.equal(order.total_cents,3000);
 assert.equal((await db.query('select * from tb_door_card_reserve($1,$2,$3,3,$4)',[req(10),event,tier,crew])).rows[0].id,order.id);
 await assert.rejects(db.query('select tb_door_cash_sale($1,$2,$3,3,$4)',[req(11),event,tier,crew]),/Not enough GA tickets left/,'a pending card sale holds its tickets');
 assert.equal(await one(db,'select tb_door_admit_order($1)',[order.id]),0,'unpaid orders are not admitted');
 await db.exec('reset role');
 await db.query("update sb_event_orders set status='paid',paid_at=now() where id=$1",[order.id]);
 await db.query('insert into sb_event_tickets(order_id,event_id,tier_id,sequence_number) select $1,$2,$3,n from generate_series(1,3) n',[order.id,event,tier]);
 await db.exec('set role service_role');
 assert.equal(await one(db,'select tb_door_admit_order($1)',[order.id]),3);
 assert.equal(await one(db,'select tb_door_admit_order($1)',[order.id]),0);
 const summary=await one(db,'select tb_door_summary($1,$2)',[event,crew]);
 assert.equal(summary.inside,3);assert.deepEqual(summary.doorCard,{tickets:3,cents:3000});
 await assert.rejects(db.query('select * from tb_door_card_reserve($1,$2,$3,1,$4)',[req(12),rehearsal,freeTier,owner]),/rehearsal/);
});

test('manual clicker adjusts the shared count but never below zero',async()=>{
 const db=await database();
 await assert.rejects(db.query('select tb_door_adjust($1,$2,-1)',[event,crew]),/already at zero/);
 assert.equal((await one(db,'select tb_door_adjust($1,$2,1)',[event,crew])).inside,1);
 assert.equal((await one(db,'select tb_door_adjust($1,$2,1)',[event,owner])).inside,2);
 assert.equal((await one(db,'select tb_door_adjust($1,$2,-1)',[event,crew])).inside,1);
 await assert.rejects(db.query('select tb_door_adjust($1,$2,5)',[event,crew]),/one at a time/);
 await assert.rejects(db.query('select tb_door_adjust($1,$2,1)',[event,stranger]),/Door access denied/);
 const free=await one(db,'select tb_door_cash_sale($1,$2,$3,1,$4)',[req(20),rehearsal,freeTier,owner]);
 assert.equal(free.totalCents,0,'rehearsal door sales record no money');
});
