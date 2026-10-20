import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const baseSchema=`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.role()returns text language sql as $$select 'service_role'::text$$;
 create table sb_event_organisers(id uuid primary key,owner_user_id uuid,status text);
 create table sb_events(id uuid primary key,organiser_profile_id uuid,status text,title text,starts_at timestamptz,ends_at timestamptz,internal_free_test boolean default false,public_beta_test boolean default false);
 create table sb_event_orders(id uuid primary key,event_id uuid,status text,customer_email text,beta_test_order boolean default false);
 create table sb_event_tickets(id uuid primary key,order_id uuid,holder_email text,checked_in_at timestamptz);
 create table tb_ticket_payments(order_id uuid primary key,event_id uuid,stripe_transfer_id text,processing_fee_cents bigint);
 create table tb_event_settlements(event_id uuid primary key,payout_status text,payout_message text,stripe_payout_id text,release_token uuid,release_started_at timestamptz,updated_at timestamptz,reconciled_at timestamptz);
 create table tb_event_reports(event_id uuid);create table tb_refund_requests(event_id uuid,status text);`;

test('paid cancellation is atomic, owner-scoped, idempotent and blocks release; late payments and notice batches remain durable',async()=>{
 const db=new PGlite();
 try{
 await db.exec(baseSchema);
 await db.exec(readFileSync(new URL('../docs/ticketbunker-cancellation-schema.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../docs/ticketbunker-postponement-schema.sql',import.meta.url),'utf8'));
 const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',org='33333333-3333-4333-8333-333333333333',event='44444444-4444-4444-8444-444444444444',order='55555555-5555-4555-8555-555555555555',late='66666666-6666-4666-8666-666666666666',token='77777777-7777-4777-8777-777777777777';
 await db.query('insert into auth.users(id)values($1),($2)',[actor,other]);await db.query("insert into sb_event_organisers values($1,$2,'approved')",[org,actor]);
 await db.query("insert into sb_events(id,organiser_profile_id,status,title,ends_at)values($1,$2,'published','Cancellation fixture',now()+interval '1 day')",[event,org]);
 await db.query("insert into sb_event_orders(id,event_id,status,customer_email)values($1,$2,'paid','buyer@example.invalid'),($3,$2,'reserved','late@example.invalid')",[order,event,late]);
 const prepare=(owner=actor)=>db.query('select tb_prepare_event_cancellation($1,$2,$3) c',[owner,event,'The venue is unexpectedly unavailable.']);
 await assert.rejects(prepare(other),/owned by this organiser/);const c=(await prepare()).rows[0].c;assert.equal(c.fee_cents,2500);assert.equal(c.fee_currency,'gbp');
 assert.equal((await db.query('select status from sb_events')).rows[0].status,'published');assert.equal((await db.query('select count(*)::int n from tb_cancellation_refunds')).rows[0].n,0);
 assert.equal((await db.query('select tb_claim_event_release($1,$2) allowed',[event,token])).rows[0].allowed,false);
 await db.query("update tb_event_cancellations set stripe_session_id='cs_expected' where event_id=$1",[event]);
 await assert.rejects(db.query("select tb_confirm_event_cancellation($1,'cs_wrong','pi_fee',1)",[event]),/payment mismatch/);
 await db.query("select tb_confirm_event_cancellation($1,'cs_expected','pi_fee',1)",[event]);await db.query("select tb_confirm_event_cancellation($1,'cs_expected','pi_fee',1)",[event]);
 assert.equal((await db.query('select status from sb_events')).rows[0].status,'cancelled');assert.equal((await db.query('select payout_status from tb_event_settlements')).rows[0].payout_status,'blocked');
 assert.equal((await db.query('select count(*)::int n from tb_cancellation_refunds')).rows[0].n,1);
 await db.query('insert into tb_ticket_payments(order_id,event_id)values($1,$2)',[late,event]);assert.equal((await db.query('select tb_queue_cancelled_order($1) queued',[late])).rows[0].queued,true);
 assert.equal((await db.query('select count(*)::int n from tb_cancellation_refunds')).rows[0].n,2);
 const batch=(await db.query('select tb_claim_cancel_notice_batch($1) b',[token])).rows[0].b;assert.equal(batch.order_ids.length,2);
 assert.equal((await db.query('select tb_claim_cancel_notice_batch($1) b',[token])).rows[0].b,null);
 assert.equal((await db.query('select tb_finish_cancel_notice_batch($1,$2) done',[batch.id,token])).rows[0].done,true);
 assert.equal((await db.query('select count(*)::int n from tb_cancellation_refunds where notice_sent_at is not null')).rows[0].n,2);
 const claim=await db.query('select order_id from tb_claim_cancellation_refunds($1,20)',[token]);assert.equal(claim.rows.length,2);assert.equal((await db.query('select order_id from tb_claim_cancellation_refunds($1,20)',[token])).rows.length,0);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from tb_event_cancellations'),/permission denied/);await assert.rejects(prepare(),/permission denied/);
 }finally{await db.close();}
});
test('£10 postponement preserves event and QR identities, offers purchaser choices, and reposts one linked history',async()=>{
 const db=new PGlite();try{
 await db.exec(baseSchema);await db.exec(readFileSync(new URL('../docs/ticketbunker-cancellation-schema.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../docs/ticketbunker-postponement-schema.sql',import.meta.url),'utf8'));
 const actor='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',org='33333333-3333-4333-8333-333333333333',event='44444444-4444-4444-8444-444444444444',order='55555555-5555-4555-8555-555555555555',ticket='66666666-6666-4666-8666-666666666666',token='77777777-7777-4777-8777-777777777777';
 await db.query("insert into auth.users values($1,'owner@example.invalid',now()),($2,'buyer@example.invalid',now())",[actor,buyer]);await db.query("insert into sb_event_organisers values($1,$2,'approved')",[org,actor]);
 await db.query("insert into sb_events(id,organiser_profile_id,status,title,starts_at,ends_at)values($1,$2,'published','Reschedule fixture',now()+interval '5 days',now()+interval '5 days 3 hours')",[event,org]);
 await db.query("insert into sb_event_orders(id,event_id,status,customer_email)values($1,$2,'paid','buyer@example.invalid')",[order,event]);await db.query('insert into sb_event_tickets(id,order_id)values($1,$2)',[ticket,order]);
 const prepare=()=>db.query('select tb_prepare_postponement($1,$2,$3) p',[actor,event,'The venue needs a new date.']);
 const p=(await prepare()).rows[0].p;assert.equal((await db.query('select status from sb_events')).rows[0].status,'published');
 await db.query("select tb_apply_postponement($1,'cs_postpone','pi_postpone',1)",[p.id]);await db.query("select tb_apply_postponement($1,'cs_postpone','pi_postpone',1)",[p.id]);
 assert.equal((await db.query('select status from sb_events')).rows[0].status,'draft');assert.equal((await db.query('select status from sb_event_orders')).rows[0].status,'needs_attention');assert.equal((await db.query('select count(*)::int n from tb_postponement_choices')).rows[0].n,1);
 await assert.rejects(db.query("select tb_choose_postponement($1,$2,$3,'rollover')",[actor,p.id,order]),/Original verified purchaser/);
 await db.query("select tb_choose_postponement($1,$2,$3,'rollover')",[buyer,p.id,order]);assert.equal((await db.query('select status from sb_event_orders')).rows[0].status,'paid');
 await assert.rejects(db.query("update sb_events set status='published' where id=$1",[event]),/later start/);
 await db.query("update sb_events set title='Updated show',starts_at=starts_at+interval '5 days',ends_at=ends_at+interval '5 days',status='published' where id=$1",[event]);
 const history=(await db.query('select * from tb_event_postponements')).rows[0];assert.ok(history.published_at);assert.ok(Date.parse(history.new_starts_at)>Date.parse(history.original_starts_at));
 assert.equal((await db.query('select id,order_id from sb_event_tickets')).rows[0].id,ticket);assert.equal((await db.query('select event_id from sb_event_orders')).rows[0].event_id,event);assert.equal((await db.query('select notice_stage from tb_postponement_choices')).rows[0].notice_stage,'rescheduled');
 await db.query("select tb_choose_postponement($1,$2,$3,'refund')",[buyer,p.id,order]);await db.query("select tb_choose_postponement($1,$2,$3,'refund')",[buyer,p.id,order]);assert.equal((await db.query('select count(*)::int n from tb_cancellation_refunds')).rows[0].n,1);assert.equal((await db.query('select status from sb_event_orders')).rows[0].status,'needs_attention');
 await assert.rejects(db.query("select tb_choose_postponement($1,$2,$3,'rollover')",[buyer,p.id,order]),/cannot be changed/);
 assert.equal((await db.query('select tb_claim_event_release($1,$2) allowed',[event,token])).rows[0].allowed,false);
 await db.query("update sb_events set starts_at=now()+interval '47 hours' where id=$1",[event]);await assert.rejects(prepare(),/48 hours/);
 }finally{await db.close();}
});
