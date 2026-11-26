-- Durable direct-Dropbox upload detection and transactional notification outbox.
-- Server-only: clients cannot queue messages, advance cursors, or alter suppression.
create table if not exists public.sb_delivery_watchers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 root_path text not null, cursor text,
 lease_token uuid,lease_until timestamptz,
 last_polled_at timestamptz,links_secured_at timestamptz,next_attempt_at timestamptz not null default now(),last_error text
);
create table if not exists public.sb_delivery_self_uploads (
 user_id uuid not null references auth.users(id) on delete cascade,
 path text not null,expires_at timestamptz not null,
 primary key(user_id,path)
);
create table if not exists public.sb_delivery_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 file_id text not null,revision text not null,file_name text not null,path text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','suppressed','review')),
 portal_notification_id uuid references public.portal_notifications(id) on delete set null,
 created_at timestamptz not null default now(),first_attempt_at timestamptz,sent_at timestamptz,email_payload jsonb,
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,last_error text,
 unique(user_id,file_id,revision)
);
create index if not exists sb_delivery_notifications_due on public.sb_delivery_notifications(next_attempt_at) where status in ('pending','sending');
alter table public.sb_delivery_watchers enable row level security;
alter table public.sb_delivery_self_uploads enable row level security;
alter table public.sb_delivery_notifications enable row level security;
revoke all on public.sb_delivery_watchers,public.sb_delivery_self_uploads,public.sb_delivery_notifications from anon,authenticated;
grant select,insert,update,delete on public.sb_delivery_watchers,public.sb_delivery_self_uploads,public.sb_delivery_notifications to service_role;

create or replace function public.sb_claim_client_delivery_watchers(p_token uuid)
returns setof public.sb_delivery_watchers language plpgsql set search_path='' as $$
begin
 insert into public.sb_delivery_watchers(user_id,root_path)
 select id,coalesce(nullif(dropbox_music_path,''),rtrim(dropbox_folder_path,'/')||'/My Music')
 from public.profiles where nullif(dropbox_folder_path,'') is not null
 on conflict(user_id) do update set root_path=excluded.root_path,cursor=null,last_polled_at=null,next_attempt_at=now()
 where public.sb_delivery_watchers.root_path<>excluded.root_path and (public.sb_delivery_watchers.lease_until is null or public.sb_delivery_watchers.lease_until<now());
 return query with due as (
  select w.user_id from public.sb_delivery_watchers w
  join public.profiles p on p.id=w.user_id where w.next_attempt_at<=now()
  and nullif(p.dropbox_folder_path,'') is not null and (w.lease_until is null or w.lease_until<now())
  order by w.last_polled_at nulls first,w.user_id limit 12 for update of w skip locked
 ) update public.sb_delivery_watchers w set lease_token=p_token,lease_until=now()+interval '4 minutes',last_polled_at=now()
 from due where w.user_id=due.user_id returning w.*;
end $$;

create or replace function public.sb_queue_client_delivery_revision(p_user_id uuid,p_file jsonb,p_suppressed boolean default false)
returns setof public.sb_delivery_notifications language plpgsql set search_path='' as $$
declare suppressed boolean;
begin
 if coalesce(p_file->>'file_id','') !~ '^id:[^[:space:]]{1,200}$' or
 coalesce(p_file->>'revision','') !~ '^[a-zA-Z0-9]{1,100}$' or
 coalesce(p_file->>'path','') not like '/%' or length(p_file->>'file_name')>255 then raise exception 'Invalid delivery revision';end if;
 suppressed:=p_suppressed or exists(select 1 from public.sb_delivery_self_uploads s where s.user_id=p_user_id and s.path=lower(p_file->>'path') and s.expires_at>now());
 insert into public.sb_delivery_notifications(user_id,file_id,revision,file_name,path,status)
 values(p_user_id,p_file->>'file_id',p_file->>'revision',p_file->>'file_name',lower(p_file->>'path'),case when suppressed then 'suppressed' else 'pending' end)
 on conflict(user_id,file_id,revision) do update set status=case when suppressed and public.sb_delivery_notifications.status<>'sent' then 'suppressed' else public.sb_delivery_notifications.status end;
 return query select * from public.sb_delivery_notifications where user_id=p_user_id and file_id=p_file->>'file_id' and revision=p_file->>'revision';
end $$;

create or replace function public.sb_advance_client_delivery_watcher(p_user_id uuid,p_token uuid,p_previous_cursor text,p_cursor text,p_files jsonb)
returns integer language plpgsql set search_path='' as $$
declare current_watch public.sb_delivery_watchers; entry jsonb; added integer:=0; existed boolean;
begin
 select * into current_watch from public.sb_delivery_watchers where user_id=p_user_id for update;
 if not found or current_watch.lease_token is distinct from p_token or current_watch.cursor is distinct from p_previous_cursor then raise exception 'Delivery watcher lease changed';end if;
 if nullif(p_cursor,'') is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>2000 then raise exception 'Invalid delivery changes';end if;
 for entry in select value from jsonb_array_elements(p_files) loop
  if lower(entry->>'path') not like lower(rtrim(current_watch.root_path,'/'))||'/%' then raise exception 'Delivery is outside the client folder';end if;
  select exists(select 1 from public.sb_delivery_notifications where user_id=p_user_id and file_id=entry->>'file_id' and revision=entry->>'revision') into existed;
  perform public.sb_queue_client_delivery_revision(p_user_id,entry,false);
  if not existed then added:=added+1;end if;
 end loop;
 update public.sb_delivery_watchers set cursor=p_cursor,last_error=null,next_attempt_at=now() where user_id=p_user_id and lease_token=p_token;
 return added;
end $$;

create or replace function public.sb_claim_client_delivery_notifications(p_token uuid,p_id uuid default null)
returns setof public.sb_delivery_notifications language plpgsql set search_path='' as $$
begin
 return query with due as (
  select id from public.sb_delivery_notifications where status in ('pending','sending') and next_attempt_at<=now()
  and (p_id is null or id=p_id) and (lease_until is null or lease_until<now()) order by created_at limit 12 for update skip locked
 ) update public.sb_delivery_notifications n set lease_token=p_token,lease_until=now()+interval '4 minutes',attempts=attempts+1
 from due where n.id=due.id returning n.*;
end $$;

create or replace function public.sb_prepare_client_delivery_notification(p_id uuid,p_token uuid,p_title text,p_body text,p_email_payload jsonb)
returns setof public.sb_delivery_notifications language plpgsql set search_path='' as $$
declare job public.sb_delivery_notifications; notification_id uuid;
begin
 select * into job from public.sb_delivery_notifications where id=p_id and lease_token=p_token for update;
 if not found or job.status not in ('pending','sending') then return;end if;
 notification_id:=job.portal_notification_id;
 if notification_id is null then
  insert into public.portal_notifications(user_id,title,body,target_url) values(job.user_id,p_title,p_body,'/client#my-files') returning id into notification_id;
 end if;
 return query update public.sb_delivery_notifications set portal_notification_id=notification_id,status='sending',first_attempt_at=coalesce(first_attempt_at,now()),email_payload=coalesce(email_payload,p_email_payload)
 where id=p_id and lease_token=p_token returning *;
end $$;

revoke all on function public.sb_claim_client_delivery_watchers(uuid),public.sb_queue_client_delivery_revision(uuid,jsonb,boolean),public.sb_advance_client_delivery_watcher(uuid,uuid,text,text,jsonb),public.sb_claim_client_delivery_notifications(uuid,uuid),public.sb_prepare_client_delivery_notification(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sb_claim_client_delivery_watchers(uuid),public.sb_queue_client_delivery_revision(uuid,jsonb,boolean),public.sb_advance_client_delivery_watcher(uuid,uuid,text,text,jsonb),public.sb_claim_client_delivery_notifications(uuid,uuid),public.sb_prepare_client_delivery_notification(uuid,uuid,text,text,jsonb) to service_role;
