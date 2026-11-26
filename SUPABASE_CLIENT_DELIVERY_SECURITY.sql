-- Private music is served only by the authenticated, payment-checked API.
-- Prevent customers from altering the trusted role, identity, or Dropbox paths.
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
-- Cancel any historical column-specific grants as well as table grants.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns where table_schema='public' and table_name='profiles';
  execute 'revoke insert (' || cols || '), update (' || cols || '), references (' || cols || ') on public.profiles from anon, authenticated';
end $$;
revoke insert, update, delete, truncate, references, trigger on public.bookings from anon, authenticated;
-- Clients use the server project/file endpoints, which check the balance first.
-- Direct table reads must not expose historical raw delivery URLs.
revoke all on public.projects, public.project_files from anon, authenticated;
grant all on public.profiles, public.bookings, public.projects, public.project_files to service_role;
update public.profiles set dropbox_shared_url=null, dropbox_music_url=null,
  dropbox_masters_url=null, dropbox_backing_url=null
where dropbox_shared_url is not null or dropbox_music_url is not null
  or dropbox_masters_url is not null or dropbox_backing_url is not null;
