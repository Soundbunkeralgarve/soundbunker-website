-- Correct literal plus matching for international E.164 WhatsApp numbers.
alter table public.sb_event_staff_invites drop constraint if exists sb_staff_invite_phone_format;
alter table public.sb_event_staff_invites add constraint sb_staff_invite_phone_format
check (invited_phone is null or invited_phone ~ '^\+[1-9][0-9]{7,14}$');