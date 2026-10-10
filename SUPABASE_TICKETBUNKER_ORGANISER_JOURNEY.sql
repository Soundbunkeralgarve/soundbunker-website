-- ticketBunker organiser setup wizard: publication review and additional event categories.
-- Additive, no ticket-money or checkout changes.
ALTER TABLE public.sb_events
  ADD COLUMN IF NOT EXISTS publish_requested_at timestamptz;
ALTER TABLE public.sb_events DROP CONSTRAINT IF EXISTS sb_event_kind_check;
ALTER TABLE public.sb_events ADD CONSTRAINT sb_event_kind_check
 CHECK(event_kind IN ('show','festival','workshop','club','community','comedy','sports','other'));

CREATE INDEX IF NOT EXISTS sb_event_publication_review_idx
 ON public.sb_events(publish_requested_at DESC)
 WHERE publish_requested_at IS NOT NULL AND status='draft';

-- Keep a review request from changing ticket inventory or publication status.
-- The established server-side publication gate still controls all paid sales.
