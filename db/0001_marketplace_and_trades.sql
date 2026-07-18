-- Sandlot marketplace + trade offers
-- Additive: open listings beyond playdates, browse/search, propose/accept/complete trades.
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Listings: allow marketplace (no session) + searchable area snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.swaparound_swap_listings
  ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE public.swaparound_swap_listings
  ADD COLUMN IF NOT EXISTS area_label text;

COMMENT ON COLUMN public.swaparound_swap_listings.session_id IS
  'Optional playdate this listing is tied to. NULL = open marketplace listing.';
COMMENT ON COLUMN public.swaparound_swap_listings.area_label IS
  'Zip/area snapshot from parent at list time (search/filter; never a street address).';

-- Marketplace browse: signed-in parents can see AVAILABLE listings (block filter still applies).
DROP POLICY IF EXISTS swaparound_listings_market_read ON public.swaparound_swap_listings;
CREATE POLICY swaparound_listings_market_read ON public.swaparound_swap_listings
  FOR SELECT
  TO authenticated
  USING (
    status = 'available'
    AND (SELECT auth.uid()) IS NOT NULL
  );

-- Own-policy already covers INSERT for own children, but with_check required RSVP was only on attendee read.
-- Insert still needs parent_id = auth.uid() and child ownership (swaparound_listings_own ALL).
-- Drop any session-RSVP requirement from insert — own policy already enforces parent + child ownership.
-- Ensure INSERT works when session_id IS NULL:
DROP POLICY IF EXISTS swaparound_listings_own ON public.swaparound_swap_listings;
CREATE POLICY swaparound_listings_own ON public.swaparound_swap_listings
  FOR ALL
  TO authenticated
  USING (
    parent_id = (SELECT auth.uid())
    OR public.swaparound_is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    parent_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.swaparound_children c
      WHERE c.id = swaparound_swap_listings.child_id
        AND c.parent_id = (SELECT auth.uid())
    )
    AND (
      session_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.swaparound_session_rsvps r
        WHERE r.session_id = swaparound_swap_listings.session_id
          AND r.parent_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.swaparound_sessions s
        WHERE s.id = swaparound_swap_listings.session_id
          AND s.host_id = (SELECT auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Trade offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_trade_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_listing_id uuid NOT NULL REFERENCES public.swaparound_swap_listings(id) ON DELETE CASCADE,
  offer_listing_id uuid NOT NULL REFERENCES public.swaparound_swap_listings(id) ON DELETE CASCADE,
  from_parent_id uuid NOT NULL REFERENCES public.swaparound_parents(id) ON DELETE CASCADE,
  to_parent_id uuid NOT NULL REFERENCES public.swaparound_parents(id) ON DELETE CASCADE,
  message text CHECK (char_length(COALESCE(message, '')) <= 200),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text, 'completed'::text])),
  playdate_session_id uuid REFERENCES public.swaparound_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swaparound_trade_offers_distinct_listings CHECK (target_listing_id <> offer_listing_id),
  CONSTRAINT swaparound_trade_offers_distinct_parents CHECK (from_parent_id <> to_parent_id)
);

CREATE INDEX IF NOT EXISTS swaparound_trade_offers_from_idx ON public.swaparound_trade_offers (from_parent_id, status);
CREATE INDEX IF NOT EXISTS swaparound_trade_offers_to_idx ON public.swaparound_trade_offers (to_parent_id, status);
CREATE INDEX IF NOT EXISTS swaparound_trade_offers_target_idx ON public.swaparound_trade_offers (target_listing_id);
CREATE INDEX IF NOT EXISTS swaparound_listings_status_cat_idx ON public.swaparound_swap_listings (status, category);
CREATE INDEX IF NOT EXISTS swaparound_listings_toy_name_trgm_idx ON public.swaparound_swap_listings (toy_name);

DROP TRIGGER IF EXISTS swaparound_trade_offers_updated ON public.swaparound_trade_offers;
CREATE TRIGGER swaparound_trade_offers_updated
  BEFORE UPDATE ON public.swaparound_trade_offers
  FOR EACH ROW EXECUTE FUNCTION public.swaparound_set_updated_at();

ALTER TABLE public.swaparound_trade_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swaparound_trade_offers_parties ON public.swaparound_trade_offers;
CREATE POLICY swaparound_trade_offers_parties ON public.swaparound_trade_offers
  FOR SELECT
  TO authenticated
  USING (
    from_parent_id = (SELECT auth.uid())
    OR to_parent_id = (SELECT auth.uid())
    OR public.swaparound_is_admin((SELECT auth.uid()))
  );

-- Writes go through SECURITY DEFINER RPCs only
DROP POLICY IF EXISTS swaparound_trade_offers_no_direct_write ON public.swaparound_trade_offers;
-- (no INSERT/UPDATE/DELETE policies for authenticated → RPC only with service/definer)

-- ---------------------------------------------------------------------------
-- 3. Marketplace browse RPC (search + category + area; includes seller label)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_market_browse(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_area text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  q text := nullif(trim(COALESCE(p_q, '')), '');
  cat text := nullif(trim(COALESCE(p_category, '')), '');
  area text := nullif(trim(COALESCE(p_area, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
    FROM (
      SELECT
        l.id,
        l.session_id,
        l.child_id,
        l.parent_id,
        l.toy_name,
        l.category,
        l.condition,
        l.wants,
        l.emoji,
        l.status,
        l.area_label,
        l.created_at,
        p.display_name AS seller_name,
        COALESCE(l.area_label, p.area_label) AS seller_area,
        c.nickname AS kid_nickname,
        c.avatar AS kid_avatar
      FROM public.swaparound_swap_listings l
      JOIN public.swaparound_parents p ON p.id = l.parent_id
      JOIN public.swaparound_children c ON c.id = l.child_id
      WHERE l.status = 'available'
        AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
        AND (cat IS NULL OR l.category = cat)
        AND (
          q IS NULL
          OR l.toy_name ILIKE '%' || q || '%'
          OR COALESCE(l.wants, '') ILIKE '%' || q || '%'
          OR l.category ILIKE '%' || q || '%'
        )
        AND (
          area IS NULL
          OR COALESCE(l.area_label, p.area_label, '') ILIKE '%' || area || '%'
        )
      ORDER BY l.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_market_browse(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_market_browse(text, text, text) TO authenticated;

-- My marketplace listings (including non-available)
CREATE OR REPLACE FUNCTION public.swaparound_my_listings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
    FROM (
      SELECT l.*, c.nickname AS kid_nickname, c.avatar AS kid_avatar
      FROM public.swaparound_swap_listings l
      JOIN public.swaparound_children c ON c.id = l.child_id
      WHERE l.parent_id = uid
        AND l.status IN ('available', 'swap_planned', 'claimed')
      ORDER BY l.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_my_listings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_my_listings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trade lifecycle RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_propose_trade(
  p_target uuid,
  p_offer uuid,
  p_message text DEFAULT NULL,
  p_session uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.swaparound_swap_listings%ROWTYPE;
  offer public.swaparound_swap_listings%ROWTYPE;
  msg text := nullif(trim(COALESCE(p_message, '')), '');
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO target FROM public.swaparound_swap_listings WHERE id = p_target FOR UPDATE;
  SELECT * INTO offer FROM public.swaparound_swap_listings WHERE id = p_offer FOR UPDATE;

  IF target.id IS NULL OR offer.id IS NULL THEN RAISE EXCEPTION 'listing_not_found'; END IF;
  IF offer.parent_id <> uid THEN RAISE EXCEPTION 'not_your_offer'; END IF;
  IF target.parent_id = uid THEN RAISE EXCEPTION 'self_trade'; END IF;
  IF target.status <> 'available' OR offer.status <> 'available' THEN RAISE EXCEPTION 'not_available'; END IF;
  IF public.swaparound_is_blocked_between(uid, target.parent_id) THEN RAISE EXCEPTION 'blocked'; END IF;
  IF msg IS NOT NULL AND char_length(msg) > 200 THEN RAISE EXCEPTION 'message_too_long'; END IF;

  -- optional playdate must exist
  IF p_session IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.swaparound_sessions s WHERE s.id = p_session AND s.status IN ('scheduled', 'open', 'published', 'live')
  ) THEN
    -- soft: allow any non-cancelled session
    IF NOT EXISTS (SELECT 1 FROM public.swaparound_sessions s WHERE s.id = p_session) THEN
      RAISE EXCEPTION 'session_not_found';
    END IF;
  END IF;

  INSERT INTO public.swaparound_trade_offers (
    target_listing_id, offer_listing_id, from_parent_id, to_parent_id, message, playdate_session_id
  ) VALUES (
    p_target, p_offer, uid, target.parent_id, msg, p_session
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_propose_trade(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_propose_trade(uuid, uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_respond_trade(p_offer_id uuid, p_accept boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.swaparound_trade_offers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO o FROM public.swaparound_trade_offers WHERE id = p_offer_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF o.to_parent_id <> uid THEN RAISE EXCEPTION 'not_your_inbox'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  IF NOT p_accept THEN
    UPDATE public.swaparound_trade_offers SET status = 'declined', updated_at = now() WHERE id = o.id;
    RETURN 'declined';
  END IF;

  -- Both listings must still be available
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_swap_listings WHERE id = o.target_listing_id AND status = 'available')
     OR NOT EXISTS (SELECT 1 FROM public.swaparound_swap_listings WHERE id = o.offer_listing_id AND status = 'available')
  THEN
    UPDATE public.swaparound_trade_offers SET status = 'cancelled', updated_at = now() WHERE id = o.id;
    RAISE EXCEPTION 'not_available';
  END IF;

  UPDATE public.swaparound_swap_listings SET status = 'swap_planned', updated_at = now()
    WHERE id IN (o.target_listing_id, o.offer_listing_id);

  -- Cancel other pending offers that involve either listing
  UPDATE public.swaparound_trade_offers
    SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending'
      AND id <> o.id
      AND (
        target_listing_id IN (o.target_listing_id, o.offer_listing_id)
        OR offer_listing_id IN (o.target_listing_id, o.offer_listing_id)
      );

  UPDATE public.swaparound_trade_offers SET status = 'accepted', updated_at = now() WHERE id = o.id;
  RETURN 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_respond_trade(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_respond_trade(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_complete_trade(p_offer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.swaparound_trade_offers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO o FROM public.swaparound_trade_offers WHERE id = p_offer_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF o.from_parent_id <> uid AND o.to_parent_id <> uid THEN RAISE EXCEPTION 'not_a_party'; END IF;
  IF o.status <> 'accepted' THEN RAISE EXCEPTION 'not_accepted'; END IF;

  UPDATE public.swaparound_swap_listings SET status = 'swapped', updated_at = now()
    WHERE id IN (o.target_listing_id, o.offer_listing_id);

  UPDATE public.swaparound_trade_offers SET status = 'completed', updated_at = now() WHERE id = o.id;
  RETURN 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_complete_trade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_complete_trade(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_cancel_trade(p_offer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.swaparound_trade_offers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO o FROM public.swaparound_trade_offers WHERE id = p_offer_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF o.from_parent_id <> uid AND o.to_parent_id <> uid THEN RAISE EXCEPTION 'not_a_party'; END IF;
  IF o.status NOT IN ('pending', 'accepted') THEN RAISE EXCEPTION 'not_cancellable'; END IF;

  IF o.status = 'accepted' THEN
    -- reopen listings if still planned
    UPDATE public.swaparound_swap_listings SET status = 'available', updated_at = now()
      WHERE id IN (o.target_listing_id, o.offer_listing_id) AND status = 'swap_planned';
  END IF;

  UPDATE public.swaparound_trade_offers SET status = 'cancelled', updated_at = now() WHERE id = o.id;
  RETURN 'cancelled';
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_cancel_trade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_cancel_trade(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_withdraw_listing(p_listing uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  l public.swaparound_swap_listings%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO l FROM public.swaparound_swap_listings WHERE id = p_listing FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'listing_not_found'; END IF;
  IF l.parent_id <> uid AND NOT public.swaparound_is_admin(uid) THEN RAISE EXCEPTION 'not_yours'; END IF;
  IF l.status NOT IN ('available', 'swap_planned', 'claimed') THEN RAISE EXCEPTION 'not_withdrawable'; END IF;

  UPDATE public.swaparound_swap_listings SET status = 'withdrawn', updated_at = now() WHERE id = l.id;

  UPDATE public.swaparound_trade_offers SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending'
      AND (target_listing_id = l.id OR offer_listing_id = l.id);

  -- If planned trade, reopen the other side
  UPDATE public.swaparound_swap_listings SET status = 'available', updated_at = now()
    WHERE status = 'swap_planned'
      AND id IN (
        SELECT CASE WHEN target_listing_id = l.id THEN offer_listing_id ELSE target_listing_id END
        FROM public.swaparound_trade_offers
        WHERE status = 'accepted'
          AND (target_listing_id = l.id OR offer_listing_id = l.id)
      );

  UPDATE public.swaparound_trade_offers SET status = 'cancelled', updated_at = now()
    WHERE status = 'accepted'
      AND (target_listing_id = l.id OR offer_listing_id = l.id);

  RETURN 'withdrawn';
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_withdraw_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_withdraw_listing(uuid) TO authenticated;

-- Trade inbox for current parent
CREATE OR REPLACE FUNCTION public.swaparound_my_trades()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
    FROM (
      SELECT
        o.id,
        o.status,
        o.message,
        o.playdate_session_id,
        o.created_at,
        o.updated_at,
        o.from_parent_id,
        o.to_parent_id,
        CASE WHEN o.from_parent_id = uid THEN 'outgoing' ELSE 'incoming' END AS direction,
        fp.display_name AS from_name,
        tp.display_name AS to_name,
        tl.id AS target_id,
        tl.toy_name AS target_name,
        tl.emoji AS target_emoji,
        tl.category AS target_category,
        ol.id AS offer_id,
        ol.toy_name AS offer_name,
        ol.emoji AS offer_emoji,
        ol.category AS offer_category
      FROM public.swaparound_trade_offers o
      JOIN public.swaparound_parents fp ON fp.id = o.from_parent_id
      JOIN public.swaparound_parents tp ON tp.id = o.to_parent_id
      JOIN public.swaparound_swap_listings tl ON tl.id = o.target_listing_id
      JOIN public.swaparound_swap_listings ol ON ol.id = o.offer_listing_id
      WHERE (o.from_parent_id = uid OR o.to_parent_id = uid)
        AND o.status IN ('pending', 'accepted')
      ORDER BY o.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_my_trades() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_my_trades() TO authenticated;

COMMIT;
