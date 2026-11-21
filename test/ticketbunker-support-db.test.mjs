import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync(new URL('../docs/ticketbunker-support-schema.sql',import.meta.url),'utf8');
const cancellationSql=readFileSync(new URL('../docs/ticketbunker-cancellation-schema.sql',import.meta.url),'utf8');
const releaseSql=cancellationSql.slice(cancellationSql.indexOf('CREATE OR REPLACE FUNCTION public.tb_claim_event_release'));
const buyer='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333',inactive='44444444-4444-4444-8444-444444444444';
const event='55555555-5555-4555-8555-555555555555',order='66666666-6666-4666-8666-666666666666',ticket='77777777-7777-4777-8777-777777777777';
const email=id=>id===buyer?'buyer@example.invalid':id===other?'other@example.invalid':id===staff?'staff@example.invalid':'inactive@example.invalid';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.role()returns text language sql as $$select 'service_role'::text$$;
 create table public.tb_platform_admins(email text primary key,active boolean not null);
 create table public.sb_events(id uuid primary key,title text,status text,starts_at timestamptz,ends_at timestamptz,internal_free_test boolean default false,public_beta_test boolean default false);
 create table public.sb_event_orders(id uuid primary key,event_id uuid,status text,customer_email text,beta_test_order boolean default false,total_cents integer,currency text);
 create table public.sb_event_tickets(id uuid primary key,order_id uuid,holder_email text);
 create table public.tb_refund_requests(id uuid primary key default gen_random_uuid(),order_id uuid,event_id uuid,requested_by uuid,reason text,status text default 'requested',amount_cents integer,stripe_refund_id text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(order_id,requested_by));
 create table public.tb_ticket_payments(order_id uuid primary key,refunded_cents integer default 0,stripe_transfer_id text);
 create table public.tb_event_settlements(event_id uuid primary key,payout_status text,release_token uuid,release_started_at timestamptz);
 create table public.tb_event_reports(event_id uuid);
 create table public.tb_event_cancellations(event_id uuid,cancelled_at timestamptz,attempt_started_at timestamptz);
 create table public.tb_postponement_choices(event_id uuid,choice text);
 create table public.tb_cancellation_refunds(event_id uuid,refund_status text);
 grant select on public.tb_platform_admins,public.sb_events,public.sb_event_orders,public.sb_event_tickets to service_role;
 grant select,insert on public.tb_refund_requests to service_role;`);
 await db.exec(sql);
 await db.exec(releaseSql);
 await db.query('insert into auth.users values($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,now())',[buyer,email(buyer),other,email(other),staff,email(staff),inactive,email(inactive)]);
 await db.query('insert into tb_platform_admins values($1,true),($2,false)',[email(staff),email(inactive)]);
 await db.query("insert into sb_events values($1,'Support fixture','published',now()+interval '2 hours',now()+interval '5 hours',false,false)",[event]);
 await db.query("insert into sb_event_orders values($1,$2,'paid',$3,false,3000,'eur')",[order,event,email(buyer)]);
 await db.query('insert into sb_event_tickets values($1,$2,$3)',[ticket,order,email(other)]);
 await db.query('insert into tb_ticket_payments(order_id) values($1)',[order]);
 return db;
}
async function write(db,actor,action,data,id=randomUUID(),ownerEmail=null){return (await db.query('select tb_support_write($1,$2,$3,$4,$5::jsonb,$6) result',[actor,email(actor),id,action,JSON.stringify(data),ownerEmail])).rows[0].result;}
const general={category:'general',subject:'A booking question',body:'Please help me with this booking.'};
async function scalar(db,query,args=[]){return Object.values((await db.query(query,args)).rows[0])[0];}

test('support migration is private, invoker-only and works without granting auth.users access',async()=>{
 const db=await fixture();try{
  assert.equal(await scalar(db,"select has_table_privilege('service_role','auth.users','SELECT')"),false);
  assert.equal(await scalar(db,"select bool_and(relrowsecurity) from pg_class where relname in('tb_support_cases','tb_support_messages','tb_support_events','tb_support_actions','tb_support_outbox')"),true);
  assert.equal(await scalar(db,"select bool_or(prosecdef) from pg_proc where proname in('tb_support_write','tb_support_claim_notifications')"),false);
  for(const role of ['anon','authenticated']){
   assert.equal(await scalar(db,'select has_function_privilege($1,\'public.tb_support_write(uuid,text,uuid,text,jsonb,text)\',\'EXECUTE\')',[role]),false);
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from tb_support_cases'),/permission denied/);
   await assert.rejects(write(db,buyer,'create',general),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const result=await write(db,buyer,'create',general);
  assert.ok(result.caseId);assert.ok(result.messageId);
  assert.equal(await scalar(db,'select count(*)::int from tb_support_cases'),1);
 }finally{await db.close();}
});

test('create is atomic and idempotent; ticket/order ownership blocks unrelated purchasers and transferred holders',async()=>{
 const db=await fixture();try{
  const request=randomUUID(),data={...general,category:'refund',ticketId:ticket};
  const result=await write(db,buyer,'create',data,request);
  assert.deepEqual(await write(db,buyer,'create',data,request),result);
  await assert.rejects(write(db,buyer,'create',{...data,body:'A changed request body must be rejected.'},request),/SUPPORT_CONFLICT/);
  assert.equal(await scalar(db,'select count(*)::int from tb_support_cases'),1);
  assert.equal(await scalar(db,'select count(*)::int from tb_support_messages'),1);
  assert.equal(await scalar(db,'select count(*)::int from tb_support_outbox'),2);
  assert.equal(await scalar(db,'select count(*)::int from tb_refund_requests'),1);
  const second=await write(db,buyer,'create',data);
  assert.equal(second.refundRequestId,result.refundRequestId);
  assert.equal(await scalar(db,'select count(*)::int from tb_refund_requests'),1);
  await assert.rejects(write(db,other,'create',data),/SUPPORT_ORDER/);
  await assert.rejects(write(db,other,'create',{...general,orderId:order}),/SUPPORT_ORDER/);
  await assert.rejects(write(db,buyer,'create',{...data,orderId:randomUUID()}),/SUPPORT_ORDER/);
  assert.equal(await scalar(db,'select count(*)::int from tb_support_cases'),2);
  assert.equal(await scalar(db,'select status from sb_event_orders where id=$1',[order]),'paid');
  assert.equal(await scalar(db,'select refunded_cents from tb_ticket_payments where order_id=$1',[order]),0);
  assert.equal(await scalar(db,'select stripe_refund_id from tb_refund_requests limit 1'),null);
  await db.query("update sb_events set ends_at=now()-interval '1 hour' where id=$1",[event]);
  await db.query('insert into tb_event_reports values($1)',[event]);
  assert.equal(await scalar(db,'select tb_claim_event_release($1,$2)',[event,randomUUID()]),false);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(o\.event_id::text,202\)\)/);
 }finally{await db.close();}
});

test('customer ownership and active staff authority protect notes, decisions and status notifications',async()=>{
 const db=await fixture();try{
  const c=await write(db,buyer,'create',general);
  await assert.rejects(write(db,other,'reply',{caseId:c.caseId,body:'I should not be able to reply.'}),/SUPPORT_NOT_FOUND/);
  await assert.rejects(write(db,buyer,'reply',{caseId:c.caseId,body:'Private attempt',internal:true}),/SUPPORT_FORBIDDEN/);
  await assert.rejects(write(db,inactive,'reply',{caseId:c.caseId,body:'Private attempt',internal:true}),/SUPPORT_NOT_FOUND/);
  await assert.rejects(write(db,buyer,'update',{caseId:c.caseId,status:'resolved',priority:'normal',note:'I cannot set staff status.'}),/SUPPORT_FORBIDDEN/);
  const notices=await scalar(db,'select count(*)::int from tb_support_outbox');
  await write(db,staff,'reply',{caseId:c.caseId,body:'Private investigation detail.',internal:true},randomUUID(),email(buyer));
  assert.equal(await scalar(db,'select count(*)::int from tb_support_outbox'),notices);
  await assert.rejects(write(db,staff,'update',{caseId:c.caseId,status:'resolved',priority:'normal',note:'A public explanation is required.'},randomUUID(),email(buyer)),/public decision/);
  await write(db,staff,'reply',{caseId:c.caseId,body:'We checked the booking and here is our decision.'},randomUUID(),email(buyer));
  await write(db,staff,'update',{caseId:c.caseId,status:'resolved',priority:'normal',note:'Private reason should not be mailed.'},randomUUID(),email(buyer));
  assert.equal(await scalar(db,'select status from tb_support_cases where id=$1',[c.caseId]),'resolved');
  const status=(await db.query("select m.body,o.body email_body from tb_support_messages m join tb_support_outbox o on o.message_id=m.id where m.case_id=$1 and m.kind='status'",[c.caseId])).rows[0];
  assert.match(status.body,/does not confirm refund approval or payment/);
  assert.doesNotMatch(status.email_body,/Private reason/);
  await write(db,buyer,'reply',{caseId:c.caseId,body:'I still need help.'});
  assert.equal(await scalar(db,'select status from tb_support_cases where id=$1',[c.caseId]),'open');
  await assert.rejects(write(db,staff,'update',{caseId:c.caseId,status:'resolved',priority:'normal',note:'A stale reply should not resolve a new issue.'},randomUUID(),email(buyer)),/public decision/);
 }finally{await db.close();}
});

test('notification leases prevent concurrent claims and creation limits reject spam without partial writes',async()=>{
 const db=await fixture();try{
  for(let n=0;n<5;n++)await write(db,buyer,'create',{...general,subject:'Case number '+n});
  await assert.rejects(write(db,buyer,'create',general),/SUPPORT_RATE/);
  assert.equal(await scalar(db,'select count(*)::int from tb_support_cases'),5);
  const token=randomUUID(),first=await db.query('select id,lease_token,attempts from tb_support_claim_notifications($1,null,3)',[token]);
  assert.equal(first.rows.length,3);assert.ok(first.rows.every(x=>x.lease_token===token&&x.attempts===1));
  const second=await db.query('select id from tb_support_claim_notifications($1,null,20)',[randomUUID()]);
  assert.equal(second.rows.length,7);assert.ok(second.rows.every(x=>!first.rows.some(y=>y.id===x.id)));
  assert.equal((await db.query('select id from tb_support_claim_notifications($1,null,20)',[randomUUID()])).rows.length,0);
  await db.query("update tb_support_outbox set lease_until=now()-interval '1 second' where id=$1",[first.rows[0].id]);
  const retry=await db.query('select id,attempts from tb_support_claim_notifications($1,null,20)',[randomUUID()]);
  assert.equal(retry.rows.length,1);assert.equal(retry.rows[0].id,first.rows[0].id);assert.equal(retry.rows[0].attempts,2);
 }finally{await db.close();}
});
