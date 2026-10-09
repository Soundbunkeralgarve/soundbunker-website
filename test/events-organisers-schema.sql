-- Run on disposable postgres with stub auth schema and roles.
do $$
declare u uuid:=gen_random_uuid(); org uuid; evt uuid; err text;
begin
 insert into auth.users(id) values(u);
 insert into public.sb_event_organisers(owner_user_id,display_name,country_code) values(u,'UK Festival Test','GB') returning id into org;
 insert into public.sb_events(slug,title,organiser,organiser_profile_id,venue,country_code,venue_timezone,currency,starts_at)
 values('festival-uk-check','UK Festival','UK Festival Test',org,'Bristol, England','GB','Europe/London','gbp',now()+interval '30 days') returning id into evt;
 begin
   update public.sb_events set status='published' where id=evt;
   raise exception 'Publish without verification should be blocked';
 exception when others then
   get stacked diagnostics err=message_text;
   if err='Publish without verification should be blocked' then raise; end if;
 end;
 if (select currency from public.sb_events where id=evt)<>'gbp' then raise exception 'Wrong UK currency'; end if;
 if (select status from public.sb_events where id=evt)<>'draft' then raise exception 'Draft unexpectedly published'; end if;
end $$;
