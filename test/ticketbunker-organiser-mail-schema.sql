create table public.tb_organiser_mail (
 id uuid primary key default gen_random_uuid(),
 organiser_id uuid not null references public.sb_event_organisers(id) on delete cascade,
 kind text not null check(kind in ('registered','verified','ready')),
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','review')),
 payload jsonb, provider_id text, attempts integer not null default 0,
 first_attempt_at timestamptz, last_attempt_at timestamptz, accepted_at timestamptz,
 next_attempt_at timestamptz not null default now(), lease_token uuid, last_error text,
 created_at timestamptz not null default now(), unique(organiser_id,kind)
);
alter table public.tb_organiser_mail enable row level security;
revoke all on public.tb_organiser_mail from anon,authenticated;
grant select,insert,update on public.tb_organiser_mail to service_role;
create index tb_organiser_mail_due on public.tb_organiser_mail(next_attempt_at) where status in ('pending','sending');

create or replace function public.tb_queue_organiser_mail() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
  insert into tb_organiser_mail(organiser_id,kind) values(new.id,'registered') on conflict do nothing;
 else
  if new.stripe_capabilities_ready and not old.stripe_capabilities_ready then
   insert into tb_organiser_mail(organiser_id,kind) values(new.id,'verified') on conflict do nothing;
  end if;
  if new.tax_review_complete and not old.tax_review_complete and new.stripe_capabilities_ready and old.stripe_capabilities_ready then
   insert into tb_organiser_mail(organiser_id,kind) values(new.id,'ready') on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.tb_queue_organiser_mail() from public,anon,authenticated;
create trigger tb_organiser_mail_registration after insert or update on public.sb_event_organisers for each row execute function public.tb_queue_organiser_mail();

create or replace function public.tb_claim_organiser_mail(p_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare job tb_organiser_mail%rowtype;
begin
 select * into job from tb_organiser_mail where id=p_id for update;
 if not found or job.status not in ('pending','sending') or job.next_attempt_at>now() or (job.status='sending' and job.last_attempt_at>now()-interval '5 minutes') then return null;end if;
 -- Never resend an ambiguous attempt after the provider's idempotency window.
 if job.first_attempt_at<now()-interval '23 hours' then update tb_organiser_mail set status='review',last_error='idempotency_window_elapsed',lease_token=null where id=p_id;return null;end if;
 update tb_organiser_mail set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),lease_token=gen_random_uuid() where id=p_id returning * into job;
 return to_jsonb(job);
end $$;
revoke all on function public.tb_claim_organiser_mail(uuid) from public,anon,authenticated;
grant execute on function public.tb_claim_organiser_mail(uuid) to service_role;

-- Registration just completed for these verified owners; do not bulk-email unverified profiles.
insert into public.tb_organiser_mail(organiser_id,kind) select id,'verified' from public.sb_event_organisers where stripe_capabilities_ready and status='approved' on conflict do nothing;
