-- Ticket Bunker event-scoped mobile staff access. No public grants, no buyer payments.
CREATE TABLE IF NOT EXISTS public.sb_event_staff_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.sb_events(id) ON DELETE CASCADE,
 invited_email text NOT NULL CHECK (invited_email=lower(invited_email) AND char_length(invited_email) BETWEEN 6 AND 254),
 token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
 invited_by uuid NOT NULL REFERENCES auth.users(id),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
 accepted_by uuid REFERENCES auth.users(id),
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((accepted_at IS NULL AND accepted_by IS NULL) OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sb_staff_invites_event_idx ON public.sb_event_staff_invites(event_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sb_staff_invites_expiry_idx ON public.sb_event_staff_invites(expires_at);
ALTER TABLE public.sb_event_staff_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sb_event_staff_invites FROM public,anon,authenticated;
GRANT ALL ON TABLE public.sb_event_staff_invites TO service_role;

CREATE TABLE IF NOT EXISTS public.sb_event_staff_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.sb_events(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL DEFAULT 'scanner' CHECK (role='scanner'),
 granted_by uuid NOT NULL REFERENCES auth.users(id),
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 UNIQUE(event_id,user_id)
);
CREATE INDEX IF NOT EXISTS sb_staff_access_user_idx ON public.sb_event_staff_access(user_id,revoked_at);
ALTER TABLE public.sb_event_staff_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sb_event_staff_access FROM public,anon,authenticated;
GRANT ALL ON TABLE public.sb_event_staff_access TO service_role;

-- Atomic claim: invitation link alone never grants entry, verified login/email is required.
CREATE OR REPLACE FUNCTION public.sb_claim_staff_invite(
 p_digest text,p_user uuid,p_email text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE rec public.sb_event_staff_invites; 
BEGIN
 SELECT * INTO rec FROM public.sb_event_staff_invites
 WHERE token_digest=p_digest FOR UPDATE;
 IF NOT FOUND OR rec.accepted_at IS NOT NULL OR rec.revoked_at IS NOT NULL OR
    rec.expires_at <= now() OR rec.invited_email <> lower(p_email) THEN
   RAISE EXCEPTION 'Invitation is invalid, expired, or belongs to another email';
 END IF;
 INSERT INTO public.sb_event_staff_access(event_id,user_id,granted_by,role,revoked_at)
 VALUES(rec.event_id,p_user,rec.invited_by,'scanner',null)
 ON CONFLICT(event_id,user_id) DO UPDATE SET revoked_at=null, granted_at=now(),granted_by=excluded.granted_by;
 UPDATE public.sb_event_staff_invites SET accepted_at=now(),accepted_by=p_user WHERE id=rec.id;
 RETURN rec.event_id;
END $$;
REVOKE ALL ON FUNCTION public.sb_claim_staff_invite(text,uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_claim_staff_invite(text,uuid,text) TO service_role;
