import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org='dddddddd-dddd-4ddd-8ddd-dddddddddddd',bundle='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ev=n=>'eeeeeeee-eeee-4eee-8eee-'+String(n).padStart(12,'0');
const schema=`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);
create function auth.role() returns text language sql as $$select current_user::text$$;
create table public.sb_event_organisers(id uuid primary key,owner_user_id uuid,status text);
create table public.sb_events(id uuid primary key,organiser_profile_id uuid,status text,currency text,internal_free_test boolean default false,public_beta_test boolean default false);
create table public.sb_event_tiers(id uuid primary key default gen_random_uuid(),event_id uuid,quantity_total integer);
create table public.tb_event_prebookings(id uuid primary key,owner_user_id uuid not null,plan text not null,currency text not null,event_count integer not null,total_cents integer not null,status text not null default 'requested',quote_valid_until timestamptz default now()+interval '30 days',
 constraint tb_event_prebookings_status_check check(status in ('requested','approved','cancelled')));
create table public.sb_event_listing_fees(id uuid primary key default gen_random_uuid(),event_id uuid not null,organiser_profile_id uuid not null,tier_code text not null,amount_cents integer not null check(amount_cents>0),currency text not null,status text not null default 'pending',stripe_session_id text unique,paid_at timestamptz,created_at timestamptz not null default now());
create table public.tb_organiser_billing(organiser_profile_id uuid,vat_number text);
create table public.tb_organiser_invoices(source_key text unique,organiser_id uuid not null,event_id uuid not null,category text,description text,amount_cents bigint,currency text,paid boolean,document_type text,stripe_session_id text);
create table public.tb_invoice_brands(brand text,enabled_at timestamptz);
create table public.sb_capacity_changes(id uuid,event_id uuid,applied_at timestamptz,amount_cents integer,currency text,stripe_session_id text);
create table public.sb_event_showcase_requests(id uuid,event_id uuid,paid_at timestamptz,proposed_amount_cents integer,currency text,stripe_session_id text);
create table public.tb_event_cancellations(event_id uuid,paid_at timestamptz,fee_cents integer,fee_currency text,stripe_session_id text);
create table public.tb_event_postponements(id uuid,event_id uuid,paid_at timestamptz,fee_refunded_at timestamptz,stripe_session_id text);
create table public.tb_event_settlements(event_id uuid,reconciled_at timestamptz,payout_status text,usage_fee_cents integer,processing_fee_cents integer);
create table public.tb_cancellation_refunds(order_id uuid,event_id uuid,updated_at timestamptz,refund_status text,fee_cents integer,recovered_fee_cents integer,fee_currency text);
grant usage on schema auth to service_role;grant all on all tables in schema public to service_role;grant select on auth.users to service_role;`;

async function database(){
 const db=new PGlite();
 await db.exec(schema);
 await db.exec(readFileSync(new URL('../SUPABASE_TICKETBUNKER_INVOICE_ACTIVATION.sql',import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../SUPABASE_TICKETBUNKER_BUNDLE_PAYMENTS.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query("insert into sb_event_organisers values($1,$2,'approved')",[org,owner]);
 await db.query("insert into tb_invoice_brands values('ticketbunker',now()-interval '1 day')");
 await db.query("insert into tb_event_prebookings(id,owner_user_id,plan,currency,event_count,total_cents) values($1,$2,'club','eur',5,44550)",[bundle,owner]);
 for(const [n,capacity,currency] of [[1,200,'eur'],[2,40,'eur'],[3,400,'eur'],[4,100,'gbp']]){
  await db.query("insert into sb_events(id,organiser_profile_id,status,currency) values($1,$2,'draft',$3)",[ev(n),org,currency]);
  await db.query('insert into sb_event_tiers(event_id,quantity_total) values($1,$2)',[ev(n),capacity]);
 }
 await db.exec('set role service_role');
 return db;
}
const one=async(db,sql,args)=>Object.values((await db.query(sql,args)).rows[0])[0];

test('a bundle activates only from its own paid checkout amount',async()=>{
 const db=await database();
 await db.exec('reset role');await db.query("update tb_event_prebookings set stripe_session_id='cs_live_bundle',organiser_id=$1 where id=$2",[org,bundle]);await db.exec('set role service_role');
 await assert.rejects(db.query("select tb_mark_bundle_paid($1,'cs_live_other',44550,'eur')",[bundle]),/Bundle payment mismatch/);
 await assert.rejects(db.query("select tb_mark_bundle_paid($1,'cs_live_bundle',100,'eur')",[bundle]),/Bundle payment mismatch/);
 assert.equal(await one(db,"select tb_mark_bundle_paid($1,'cs_live_bundle',44550,'eur')",[bundle]),'paid');
 assert.equal(await one(db,"select tb_mark_bundle_paid($1,'cs_live_bundle',44550,'eur')",[bundle]),'paid','webhook retries are harmless');
 const row=(await db.query('select * from tb_event_prebookings where id=$1',[bundle])).rows[0];
 assert.equal(row.status,'paid');assert.ok(row.valid_until>new Date(Date.now()+175*86400000)&&row.valid_until<new Date(Date.now()+190*86400000),'5-event bundles last 6 months');
 await db.exec('set role anon');await assert.rejects(db.query("select tb_mark_bundle_paid($1,'cs_live_bundle',44550,'eur')",[bundle]),/permission denied/);
});

test('prepaid events cover listings of the bundle size or smaller and are invoiced once',async()=>{
 const db=await database();
 assert.equal(await one(db,'select tb_use_listing_bundle($1,$2)',[ev(1),owner]),null,'an unpaid bundle cannot be used');
 await db.exec('reset role');await db.query("update tb_event_prebookings set stripe_session_id='cs_live_bundle',organiser_id=$1 where id=$2",[org,bundle]);await db.exec('set role service_role');
 await db.query("select tb_mark_bundle_paid($1,'cs_live_bundle',44550,'eur')",[bundle]);
 const used=await one(db,'select tb_use_listing_bundle($1,$2)',[ev(1),owner]);
 assert.equal(used.remaining,4);assert.equal(used.plan,'club');
 await assert.rejects(db.query('select tb_use_listing_bundle($1,$2)',[ev(1),owner]),/already been paid/);
 assert.equal((await one(db,'select tb_use_listing_bundle($1,$2)',[ev(2),owner])).remaining,3,'smaller events fit');
 assert.equal(await one(db,'select tb_use_listing_bundle($1,$2)',[ev(3),owner]),null,'a larger event pays normally');
 assert.equal(await one(db,'select tb_use_listing_bundle($1,$2)',[ev(4),owner]),null,'a different currency pays normally');
 const fees=(await db.query('select tier_code,amount_cents,status,prebooking_id from sb_event_listing_fees order by event_id')).rows;
 assert.deepEqual(fees.map(f=>[f.tier_code,f.amount_cents,f.status,f.prebooking_id]),[['club',8910,'paid',bundle],['club',8910,'paid',bundle]]);
 await db.query('select tb_scan_organiser_invoices()');await db.query('select tb_scan_organiser_invoices()');
 const invoices=(await db.query('select source_key,event_id,amount_cents,paid,document_type,description from tb_organiser_invoices')).rows;
 assert.equal(invoices.length,1,'one invoice for the bundle, none per event');
 assert.equal(invoices[0].source_key,'bundle:'+bundle);assert.equal(invoices[0].event_id,null);assert.equal(Number(invoices[0].amount_cents),44550);
 assert.equal(invoices[0].document_type,'invoice_receipts');assert.match(invoices[0].description,/5 prepaid Club events, valid 6 months/);
});

test('a bundle cannot be overused, and expired bundles are ignored',async()=>{
 const db=await database();
 await db.exec('reset role');
 await db.query("update tb_event_prebookings set status='paid',paid_at=now(),valid_until=now()+interval '1 year',stripe_session_id='cs_live_bundle',organiser_id=$1,events_used=5 where id=$2",[org,bundle]);
 await assert.rejects(db.query('update tb_event_prebookings set events_used=6 where id=$1',[bundle]),/events_used_check/);
 await db.exec('set role service_role');
 assert.equal(await one(db,'select tb_use_listing_bundle($1,$2)',[ev(1),owner]),null);
 await db.exec('reset role');await db.query("update tb_event_prebookings set events_used=0,valid_until=now()-interval '1 day' where id=$1",[bundle]);await db.exec('set role service_role');
 assert.equal(await one(db,'select tb_use_listing_bundle($1,$2)',[ev(1),owner]),null);
});

test('the webhook only accepts a paid bundle checkout that names its own reservation',async()=>{
 const {verifyBundlePayment}=await import('../api/lib/event-listings.js');
 const good={id:'cs_live_bundle',client_reference_id:bundle,payment_status:'paid',amount_total:44550,currency:'eur',metadata:{purchase_type:'listing_bundle',prebooking_id:bundle}};
 assert.equal(verifyBundlePayment(good),bundle);
 for(const bad of [{payment_status:'unpaid'},{client_reference_id:ev(1)},{metadata:{purchase_type:'event_listing_fee',prebooking_id:bundle}},{currency:'usd'}])
  assert.throws(()=>verifyBundlePayment({...good,...bad}),/Bundle payment mismatch/);
});

test('10-event bundles last 12 months',async()=>{
 const db=await database();
 await db.exec('reset role');await db.query("update tb_event_prebookings set event_count=10,total_cents=84150,stripe_session_id='cs_live_ten',organiser_id=$1 where id=$2",[org,bundle]);await db.exec('set role service_role');
 await db.query("select tb_mark_bundle_paid($1,'cs_live_ten',84150,'eur')",[bundle]);
 const until=await one(db,'select valid_until from tb_event_prebookings where id=$1',[bundle]);
 assert.ok(until>new Date(Date.now()+360*86400000));
});
