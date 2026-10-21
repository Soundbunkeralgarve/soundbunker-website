import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('the organiser fee queue excludes own-company and test events, and remains server-only and idempotent',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table sb_events(id uuid primary key,organiser_profile_id uuid,internal_free_test boolean default false,public_beta_test boolean default false);
   create table tb_organiser_billing(organiser_profile_id uuid,vat_number text);
   create table tb_organiser_invoices(source_key text unique,organiser_id uuid,event_id uuid,category text,description text,amount_cents bigint,currency text,paid boolean,document_type text,stripe_session_id text);`);
  await db.exec(await readFile(new URL('../SUPABASE_TICKETBUNKER_INVOICE_ACTIVATION.sql',import.meta.url),'utf8'));
  const org='00000000-0000-4000-8000-000000000001',own='00000000-0000-4000-8000-000000000002';
  await db.query('insert into tb_organiser_billing values($1,\'PT 517757478\')',[own]);
  for(const [n,owner,internal,beta] of [[3,org,false,false],[4,own,false,false],[5,org,true,false],[6,org,false,true]]){
   const event='00000000-0000-4000-8000-'+String(n).padStart(12,'0');await db.query('insert into sb_events values($1,$2,$3,$4)',[event,owner,internal,beta]);
   for(let repeat=0;repeat<2;repeat++)await db.query("select tb_queue_organiser_invoice($1,$2,12300,'eur','Event listing',true,'cs_live_fee','service')",['listing:'+n,event]);
  }
  const rows=(await db.query('select * from tb_organiser_invoices')).rows;assert.equal(rows.length,1);assert.equal(rows[0].source_key,'listing:3');assert.equal(rows[0].document_type,'invoice_receipts');
  await db.exec('set role anon');await assert.rejects(db.query("select tb_queue_organiser_invoice('fake','00000000-0000-4000-8000-000000000003',12300,'eur','Event listing',true,'cs_live_fee','service')"),/permission denied/);
 }finally{await db.close();}
});
