import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('owner review records evidenced UK business reverse charge without requiring a VAT number, and rejects private/unknown cases',async()=>{
 const db=new PGlite(),actor='00000000-0000-4000-8000-000000000001',gb='00000000-0000-4000-8000-000000000002',pt='00000000-0000-4000-8000-000000000003';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table tb_organiser_billing(organiser_profile_id uuid,country_code text,postal_code text,vat_number text);
   create table tb_invoice_brands(brand text,checked_at timestamptz,taxes jsonb);
   create table tb_invoice_tax_rules(organiser_id uuid,category text,tax_name text,percent numeric,exemption_code text,approved_by uuid,approved_at timestamptz,primary key(organiser_id,category),check(percent<>0 or exemption_code is not null));
   create table review_audit(actor uuid,organiser_id uuid,confirmed boolean,reason text);
   create function tb_review_organiser_tax(p_actor uuid,p_organiser uuid,p_confirm boolean,p_reason text) returns boolean language plpgsql as $$begin if p_actor<>'${actor}'::uuid then raise exception 'Admin access required';end if;insert into public.review_audit values(p_actor,p_organiser,p_confirm,p_reason);return true;end$$;
   insert into tb_invoice_brands values('ticketbunker',now(),'[{"name":"IVA23","value":"23.0"},{"name":"Isento","value":"0.0"}]');`);
  await db.query('insert into tb_organiser_billing values($1,\'GB\',\'SW1A 1AA\',null),($2,\'PT\',\'8100-269\',\'123456789\')',[gb,pt]);
  await db.exec(await readFile(new URL('../SUPABASE_TICKETBUNKER_INVOICE_TAX_REVIEW.sql',import.meta.url),'utf8'));
  const sql='select tb_review_organiser_invoice_tax($1,$2,$3,$4,$5,$6)';
  await assert.rejects(db.query(sql,[actor,gb,true,'Verified business evidence on file','uk_business_reverse_charge',false]),/requires further review/);
  await assert.rejects(db.query(sql,[actor,gb,true,'Private customer under review','review_required',false]),/requires further review/);
  await assert.rejects(db.query(sql,[pt,gb,true,'Verified business evidence on file','uk_business_reverse_charge',true]),/Admin access/);
  assert.equal((await db.query('select * from tb_invoice_tax_rules')).rows.length,0);
  await db.query(sql,[actor,gb,true,'Verified UK trading activity and business use','uk_business_reverse_charge',true]);
  const rules=(await db.query('select * from tb_invoice_tax_rules where organiser_id=$1',[gb])).rows;assert.equal(rules.length,2);for(const r of rules){assert.equal(Number(r.percent),0);assert.equal(r.exemption_code,'M40');assert.equal(r.approved_by,actor);}
  await db.query(sql,[actor,pt,true,'Mainland Portugal service billing checked','pt_standard',false]);assert.equal(Number((await db.query('select percent from tb_invoice_tax_rules where organiser_id=$1 limit 1',[pt])).rows[0].percent),23);
  await db.query(sql,[actor,gb,false,'Further business evidence has been requested','review_required',false]);const audit=(await db.query('select * from review_audit where organiser_id=$1',[gb])).rows;assert.equal(audit.at(-1).confirmed,false);assert.match(audit[0].reason,/UK business evidence confirmed: true/);
  await db.exec('set role anon');await assert.rejects(db.query(sql,[actor,gb,true,'Verified UK trading activity and business use','uk_business_reverse_charge',true]),/permission denied/);
 }finally{await db.close();}
});
