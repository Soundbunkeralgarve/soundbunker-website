import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {deliveryLinkMustBeRevoked, isPrivateClientDeliveryPath, sharedLink} from '../api/lib/dropbox.js';

test('music sharing revokes ancestor and descendant links while keeping separate photos private to their workflow', async () => {
 const music='/SoundBunker Clients/Dave/My Music';
 for(const path of ['/SoundBunker Clients','/SoundBunker Clients/Dave',music,music+'/Master.wav',music+'/Album'])
  assert.equal(deliveryLinkMustBeRevoked(path,music),true,path);
 for(const path of ['/SoundBunker Clients/Dave/My Photos','/SoundBunker Clients/Other','/SoundBunker Clients/Dave/My Musical'])
  assert.equal(deliveryLinkMustBeRevoked(path,music),false,path);
 assert.equal(isPrivateClientDeliveryPath('/SoundBunker Clients/Dave'),true);
 assert.equal(isPrivateClientDeliveryPath(music+'/Album'),true);
 assert.equal(isPrivateClientDeliveryPath('/SoundBunker Clients/Dave/My Photos/Album'),false);
 // This returns a portal route without ever creating a public Dropbox link.
 assert.equal(await sharedLink(music+'/Album'),'/client#my-files');
 assert.equal(await sharedLink('/SoundBunker Clients/Dave'),'/client#my-files');
});

test('client SQL privileges cannot change trusted paths, roles or paid amounts or read raw delivery URLs', async () => {
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table profiles(id text,role text,dropbox_folder_path text,dropbox_shared_url text,dropbox_music_url text,dropbox_masters_url text,dropbox_backing_url text);
   create table bookings(id text,paid_eur numeric);create table projects(id text,delivery_url text);create table project_files(id text,download_url text);
   grant all on profiles,bookings,projects,project_files to anon,authenticated;
   grant update(role,dropbox_folder_path) on profiles to authenticated;
   insert into profiles values('dave','client','/Clients/Dave','old-root','old-music','old-master','old-backing');`);
  await db.exec(await readFile(new URL('../SUPABASE_CLIENT_DELIVERY_SECURITY.sql',import.meta.url),'utf8'));
  const {rows:[permissions]}=await db.query(`select has_table_privilege('authenticated','profiles','UPDATE') as profile_update,
   has_column_privilege('authenticated','profiles','role','UPDATE') as role_update,
   has_column_privilege('authenticated','profiles','dropbox_folder_path','UPDATE') as path_update,
   has_table_privilege('authenticated','bookings','UPDATE') as booking_update,
   has_table_privilege('authenticated','projects','SELECT') as project_read,
   has_table_privilege('authenticated','project_files','SELECT') as file_read,
   has_table_privilege('service_role','profiles','UPDATE') as server_update`);
  assert.deepEqual(permissions,{profile_update:false,role_update:false,path_update:false,booking_update:false,project_read:false,file_read:false,server_update:true});
  const {rows:[profile]}=await db.query('select * from profiles');
  assert.equal(profile.dropbox_shared_url,null);assert.equal(profile.dropbox_music_url,null);assert.equal(profile.dropbox_folder_path,'/Clients/Dave');
 } finally {await db.close();}
});
