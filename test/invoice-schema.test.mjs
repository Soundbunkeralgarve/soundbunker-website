import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('invoice storage accepts deposits, scopes claims and denies browser roles',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  await db.exec(await readFile(new URL('../SUPABASE_WEBSITE_INVOICE_RETRY.sql',import.meta.url),'utf8'));
  await db.exec("insert into sb_website_invoice_jobs(brand,source_key,document_reference,stripe_session_id,amount_cents,currency,recipient,description,document_type) values('soundbunker','payment-1','payment-1','cs_live_1',1230,'eur','{}','Studio','invoices');");
  const claimed=await db.query("select id,lease_token from sb_claim_website_invoices('00000000-0000-4000-8000-000000000001');");
  assert.equal(claimed.rows.length,1);
  assert.equal((await db.query("select id from sb_claim_website_invoices('00000000-0000-4000-8000-000000000002');")).rows.length,0);
  await db.exec('set role anon;');
  await assert.rejects(db.query('select * from sb_website_invoice_jobs'),/permission denied/);
  await assert.rejects(db.query("select * from sb_claim_website_invoices('00000000-0000-4000-8000-000000000003')"),/permission denied/);
  await db.exec('reset role;');
 }finally{await db.close();}
});
