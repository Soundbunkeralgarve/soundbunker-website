create table public.tb_password_reset_limits(key text primary key,window_start timestamptz not null default now(),attempts integer not null default 0);
alter table public.tb_password_reset_limits enable row level security;
revoke all on public.tb_password_reset_limits from public,anon,authenticated;
grant all on public.tb_password_reset_limits to service_role;
create function public.tb_allow_password_reset(p_email text,p_ip text) returns boolean language plpgsql security invoker set search_path='' as $$
declare k text;n integer;allowed boolean:=true;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 if p_email!~'^[a-f0-9]{64}$' or p_ip!~'^[a-f0-9]{64}$' then return false;end if;
 foreach k in array array['email:'||p_email,'ip:'||p_ip] loop
  insert into public.tb_password_reset_limits(key,attempts) values(k,1) on conflict(key) do update set
  attempts=case when tb_password_reset_limits.window_start<now()-interval '1 hour' then 1 else tb_password_reset_limits.attempts+1 end,
  window_start=case when tb_password_reset_limits.window_start<now()-interval '1 hour' then now() else tb_password_reset_limits.window_start end returning attempts into n;
  if n>(case when k like 'email:%' then 3 else 10 end) then allowed:=false;end if;
 end loop;
 delete from public.tb_password_reset_limits where window_start<now()-interval '2 days';
 return allowed;
end;$$;
revoke all on function public.tb_allow_password_reset(text,text) from public,anon,authenticated;
grant execute on function public.tb_allow_password_reset(text,text) to service_role;
