import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { authorisedDeliveryCron, clientDeliveryMessage, deliveryRevision,
  reconcileClientDeliveryFolders, dispatchClientDeliveryNotifications,
  enqueueClientDeliveryRevision, suppressClientDeliveryRevision, markClientDeliveryUpload,
  finishClientDeliveryUpload, ensureClientDeliveryWatcher
} from '../api/lib/client-delivery-notifications.js';

const userId = '00000000-0000-4000-8000-000000000001';
const root = '/Clients/Dave/My Music';
const file = (rev='abc123',name='Song.wav') => ({'.tag':'file',id:'id:track-one',rev,name,path_lower:(root+'/'+name).toLowerCase()});

async function storage() {
  const sql = new PGlite();
  await sql.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,email text,full_name text,dropbox_folder_path text,dropbox_music_path text,dropbox_photos_path text);
    create table public.portal_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,title text,body text,target_url text);
    insert into auth.users values('${userId}');
    insert into public.profiles values('${userId}','dave@example.test','Dave','/Clients/Dave','${root}','/Clients/Dave/My Photos');`);
  await sql.exec(await readFile(new URL('../SUPABASE_CLIENT_DELIVERY_NOTIFICATIONS.sql',import.meta.url),'utf8'));
  const scalar = new Set(['sb_advance_client_delivery_watcher']);
  const db = { sql,
    async rpc(name,args) {
      try {
        const values=Object.values(args).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v);
        const params=Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',');
        const result=await sql.query(`select ${scalar.has(name)?'public.'+name+'('+params+') as value':'* from public.'+name+'('+params+')'}`,values);
        return {data:scalar.has(name)?result.rows[0].value:result.rows};
      } catch(error) { return {error}; }
    },
    from(table) {
      let kind='select',columns='*',values,filters=[],single=false,conflict;
      const q={select(v='*'){columns=v;return q;},update(v){kind='update';values=v;return q;},
        upsert(v,options){kind='upsert';values=v;conflict=options;return q;},delete(){kind='delete';return q;},
        eq(k,v){filters.push([k,v,'=']);return q;},is(k,v){filters.push([k,v,'is']);return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},
        async then(resolve,reject) {
          try {
            const params=[];let statement;
            if(kind==='upsert'){
              const keys=Object.keys(values);params.push(...Object.values(values));
              statement=`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(${conflict.onConflict}) ${conflict.ignoreDuplicates?'do nothing':'do update set expires_at=excluded.expires_at'} returning *`;
            } else {
              const where=()=>filters.length?' where '+filters.map(([k,v,operator])=>{if(operator==='is'&&v===null)return k+' is null';params.push(v);return k+'=$'+params.length;}).join(' and '):'';
              if(kind==='select') statement=`select ${columns} from public.${table}`+where();
              else if(kind==='delete')statement=`delete from public.${table}`+where()+' returning *';
              else {const set=Object.entries(values).map(([k,v])=>{params.push(v);return k+'=$'+params.length;}).join(',');statement=`update public.${table} set ${set}`+where()+' returning *';}
            }
            const result=await sql.query(statement,params);
            return resolve({data:single?result.rows[0]:result.rows});
          }catch(error){return resolve({error});}
        }};return q;
    }
  };
  return db;
}
const secured=async()=>({secured:true,revoked:0});
const paid=async()=>({balanceCents:0,canDownload:true});

test('delivery emails state the exact balance and authenticated unlock route; invalid payment state fails closed',()=>{
  const due=clientDeliveryMessage('Song.wav',{balanceCents:15000,canDownload:false},'Dave');
  assert.match(due.text,/€150\.00/);assert.match(due.text,/Pay balance/);assert.match(due.text,/locked until payment is confirmed/);
  assert.match(due.text,/https:\/\/www\.soundbunker\.pt\/client#my-files/);
  assert.doesNotMatch(due.text,/dropbox\.com|api\/client-delivery-payment/);
  assert.match(clientDeliveryMessage('Song.wav',{balanceCents:0,canDownload:true}).text,/balance is paid/);
  const review=clientDeliveryMessage('Song.wav',{balanceCents:0,canDownload:false,requiresReview:true});
  assert.match(review.text,/studio confirms your balance/);assert.doesNotMatch(review.text,/Pay balance|balance is paid/);
  for(const access of [{balanceCents:15000,canDownload:true},{balanceCents:-1,canDownload:false},{canDownload:false}])assert.throws(()=>clientDeliveryMessage('Song.wav',access));
  assert.equal(deliveryRevision({...file(),'.tag':'deleted'}),null);assert.equal(deliveryRevision(file('abc','notes.pdf')),null);
  assert.equal(authorisedDeliveryCron('Bearer test-only','test-only'),true);
  for(const [header,secret] of [['Bearer wrong','test-only'],['Bearer ',undefined],[undefined,'test-only']])assert.equal(authorisedDeliveryCron(header,secret),false);
});

test('first scan baselines without historical messages; direct Dropbox changes queue once per revision and cursor commit is atomic',async()=>{
  const db=await storage();
  try {
    let continues=0,securedCalls=0;
    const secure=async()=>{securedCalls++;return {secured:true};};
    const baseline=await reconcileClientDeliveryFolders({admin:db,secure,latestCursor:async path=>{assert.equal(path,root);return {cursor:'cursor-0'};},continueCursor:async()=>{throw Error('Baseline must not list historical tracks');}});
    assert.equal(baseline.baselined,1);assert.equal((await db.sql.query('select count(*)::int as n from sb_delivery_notifications')).rows[0].n,0);
    const scan=await reconcileClientDeliveryFolders({admin:db,secure,continueCursor:async cursor=>{continues++;assert.equal(cursor,'cursor-0');return {cursor:'cursor-1',entries:[file(),file(),file('abc','notes.pdf')],has_more:false};}});
    assert.equal(scan.queued,1);assert.equal(continues,1);assert.equal(securedCalls,2);
    const row=(await db.sql.query('select * from sb_delivery_watchers')).rows[0];assert.equal(row.cursor,'cursor-1');assert.ok(row.links_secured_at);
    await enqueueClientDeliveryRevision(db,userId,file());
    assert.equal((await db.sql.query('select count(*)::int as n from sb_delivery_notifications')).rows[0].n,1);
    await enqueueClientDeliveryRevision(db,userId,file('abc124'));
    assert.equal((await db.sql.query('select count(*)::int as n from sb_delivery_notifications')).rows[0].n,2);
    const bad=await db.rpc('sb_advance_client_delivery_watcher',{p_user_id:userId,p_token:'00000000-0000-4000-8000-000000000099',p_previous_cursor:'cursor-1',p_cursor:'evil',p_files:[]});
    assert.ok(bad.error);assert.equal((await db.sql.query('select cursor from sb_delivery_watchers')).rows[0].cursor,'cursor-1');
  } finally {await db.sql.close();}
});

test('folder provisioning creates the cursor before it becomes ready and never replaces an existing baseline',async()=>{
  const db=await storage();
  try {
    const baseline=await ensureClientDeliveryWatcher(db,userId,root,async()=>({cursor:'before-first-song'}));
    assert.equal(baseline.cursor,'before-first-song');
    await ensureClientDeliveryWatcher(db,userId,root,async()=>{throw Error('A ready folder must not rebaseline');});
    const scan=await reconcileClientDeliveryFolders({admin:db,secure:secured,continueCursor:async cursor=>{
      assert.equal(cursor,'before-first-song');return {cursor:'after-first-song',entries:[file()],has_more:false};
    }});
    assert.equal(scan.queued,1);assert.equal(scan.baselined,0);
  }finally{await db.sql.close();}
});

test('a missing legacy My Music root is repaired before baselining; transient scans retain HTTP status and retry in one minute',async()=>{
  const db=await storage();
  try {
    const created=[];let cursors=0;
    const result=await reconcileClientDeliveryFolders({admin:db,secure:secured,
      latestCursor:async path=>{assert.equal(path,root);if(cursors++===0){const error=Error('path/not_found/...');error.status=409;throw error;}return {cursor:'repaired-baseline'};},
      createFolder:async path=>created.push(path)});
    assert.equal(result.baselined,1);assert.deepEqual(created,[root]);
    const failed=await reconcileClientDeliveryFolders({admin:db,secure:secured,continueCursor:async()=>{const error=Error('Dropbox request failed');error.status=429;throw error;}});
    assert.equal(failed.pending,1);
    const row=(await db.sql.query('select * from sb_delivery_watchers')).rows[0];
    assert.equal(row.cursor,'repaired-baseline');assert.match(row.last_error,/HTTP 429/);
    assert.ok(Date.parse(row.next_attempt_at)-Date.now()<65000);assert.ok(Date.parse(row.next_attempt_at)-Date.now()>45000);
  }finally{await db.sql.close();}
});

test('admin upload plus polling produces one email and portal notification; client self uploads never send readiness messages',async()=>{
  const db=await storage();
  try {
    const job=await enqueueClientDeliveryRevision(db,userId,file());
    await enqueueClientDeliveryRevision(db,userId,file());
    const sent=[];
    const options={admin:db,secure:secured,accessForClient:async()=>({balanceCents:15000,canDownload:false}),send:async message=>sent.push(message)};
    const results=await Promise.all([dispatchClientDeliveryNotifications(options),dispatchClientDeliveryNotifications(options)]);
    assert.equal(results.reduce((n,r)=>n+r.sent,0),1);assert.equal(sent.length,1);assert.equal(sent[0].key,'client-delivery-'+job.id);
    assert.match(sent[0].text,/€150\.00/);assert.equal((await db.sql.query('select count(*)::int as n from portal_notifications')).rows[0].n,1);
    await markClientDeliveryUpload(db,userId,root+'/Self.wav');
    await enqueueClientDeliveryRevision(db,userId,{...file('abc125','Self.wav'),id:'id:self'});
    await suppressClientDeliveryRevision(db,userId,{...file('abc126','Renamed.wav'),id:'id:self-renamed'});
    assert.equal((await dispatchClientDeliveryNotifications(options)).sent,0);assert.equal(sent.length,1);
    assert.equal((await db.sql.query("select count(*)::int as n from sb_delivery_notifications where status='suppressed'")).rows[0].n,2);
    await finishClientDeliveryUpload(db,userId,root+'/Self.wav',{...file('abc125','Self.wav'),id:'id:self'});
    const studio=await enqueueClientDeliveryRevision(db,userId,{...file('abc129','Self.wav'),id:'id:self'});
    assert.equal(studio.status,'pending');
    assert.equal((await dispatchClientDeliveryNotifications(options)).sent,1);assert.equal(sent.length,2);
  } finally {await db.sql.close();}
});

test('uncertain sends reuse the same idempotency key; sends older than 23h require review; failed link protection sends nothing',async()=>{
  const db=await storage();
  try {
    const job=await enqueueClientDeliveryRevision(db,userId,file());const keys=[],payloads=[];
    const options={admin:db,secure:secured,accessForClient:paid,send:async message=>{keys.push(message.key);payloads.push(message);throw Error('Network timeout after provider accepted message');}};
    assert.equal((await dispatchClientDeliveryNotifications(options)).pending,1);
    await db.sql.query("update sb_delivery_notifications set next_attempt_at=now()-interval '1 minute' where id=$1",[job.id]);
    assert.equal((await dispatchClientDeliveryNotifications({...options,accessForClient:async()=>{throw Error('Retry must use the exact recorded payload');},send:async message=>{keys.push(message.key);payloads.push(message);}})).sent,1);
    assert.deepEqual(keys,['client-delivery-'+job.id,'client-delivery-'+job.id]);
    assert.deepEqual(payloads[0],payloads[1]);
    const old=await enqueueClientDeliveryRevision(db,userId,file('abc127'));
    await db.sql.query("update sb_delivery_notifications set status='sending',first_attempt_at=now()-interval '24 hours' where id=$1",[old.id]);
    const reviewed=await dispatchClientDeliveryNotifications({...options,send:async()=>{throw Error('Must not send after idempotency window');}});
    assert.equal(reviewed.review,1);assert.equal(reviewed.sent,0);
    await enqueueClientDeliveryRevision(db,userId,file('abc128'));
    let sends=0;assert.equal((await dispatchClientDeliveryNotifications({...options,secure:async()=>{throw Error('Dropbox unavailable');},send:async()=>sends++})).pending,1);assert.equal(sends,0);
  } finally {await db.sql.close();}
});
