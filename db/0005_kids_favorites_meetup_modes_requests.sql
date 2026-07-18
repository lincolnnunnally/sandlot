-- Kid favorites, meetup orchestration modes, venue day requests.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Toy favorites (kid-scoped, parent-owned account)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_toy_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.swaparound_parents(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.swaparound_children(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.swaparound_swap_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, listing_id)
);
CREATE INDEX IF NOT EXISTS swaparound_toy_favorites_child_idx ON public.swaparound_toy_favorites (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS swaparound_toy_favorites_parent_idx ON public.swaparound_toy_favorites (parent_id);

ALTER TABLE public.swaparound_toy_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swaparound_favorites_own ON public.swaparound_toy_favorites;
CREATE POLICY swaparound_favorites_own ON public.swaparound_toy_favorites
  FOR ALL TO authenticated
  USING (parent_id = (SELECT auth.uid()) OR public.swaparound_is_admin((SELECT auth.uid())))
  WITH CHECK (
    parent_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.swaparound_children c
      WHERE c.id = child_id AND c.parent_id = (SELECT auth.uid()) AND c.active
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Meetup mode on sessions (orchestration style)
-- ---------------------------------------------------------------------------
ALTER TABLE public.swaparound_sessions
  ADD COLUMN IF NOT EXISTS meetup_mode text NOT NULL DEFAULT 'event';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_sessions_meetup_mode_check') THEN
    ALTER TABLE public.swaparound_sessions
      ADD CONSTRAINT swaparound_sessions_meetup_mode_check
      CHECK (meetup_mode = ANY (ARRAY[
        'event'::text, 'playground'::text, 'group'::text, 'one_on_one'::text
      ]));
  END IF;
END $$;

COMMENT ON COLUMN public.swaparound_sessions.meetup_mode IS
  'event=facility meetup; playground=park/open; group=circle invite; one_on_one=two families';

-- ---------------------------------------------------------------------------
-- 3. Venue day requests (parent asks venue for a Sandlot day)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_venue_day_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.swaparound_venues(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.swaparound_parents(id) ON DELETE CASCADE,
  preferred_date date NOT NULL,
  preferred_time text,
  meetup_mode text NOT NULL DEFAULT 'event'
    CHECK (meetup_mode = ANY (ARRAY['event'::text, 'playground'::text, 'group'::text, 'one_on_one'::text])),
  notes text CHECK (char_length(COALESCE(notes, '')) <= 1000),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status = ANY (ARRAY[
      'requested'::text, 'reviewing'::text, 'approved'::text, 'declined'::text, 'scheduled'::text
    ])),
  venue_reply text,
  session_id uuid REFERENCES public.swaparound_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swaparound_venue_day_requests_venue_idx
  ON public.swaparound_venue_day_requests (venue_id, status, preferred_date);
CREATE INDEX IF NOT EXISTS swaparound_venue_day_requests_parent_idx
  ON public.swaparound_venue_day_requests (parent_id, created_at DESC);

ALTER TABLE public.swaparound_venue_day_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swaparound_vdr_parent ON public.swaparound_venue_day_requests;
CREATE POLICY swaparound_vdr_parent ON public.swaparound_venue_day_requests
  FOR ALL TO authenticated
  USING (
    parent_id = (SELECT auth.uid())
    OR public.swaparound_is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.swaparound_venues v
      WHERE v.id = venue_id
        AND (v.manager_user_id = (SELECT auth.uid()) OR v.added_by = (SELECT auth.uid()))
    )
  )
  WITH CHECK (parent_id = (SELECT auth.uid()) OR public.swaparound_is_admin((SELECT auth.uid())));

DROP TRIGGER IF EXISTS swaparound_vdr_updated ON public.swaparound_venue_day_requests;
CREATE TRIGGER swaparound_vdr_updated
  BEFORE UPDATE ON public.swaparound_venue_day_requests
  FOR EACH ROW EXECUTE FUNCTION public.swaparound_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RPCs: favorites
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_toggle_favorite(p_child uuid, p_listing uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  exists_row uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_children c WHERE c.id = p_child AND c.parent_id = uid AND c.active) THEN
    RAISE EXCEPTION 'not_your_child';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_swap_listings l WHERE l.id = p_listing AND l.status = 'available') THEN
    RAISE EXCEPTION 'listing_not_available';
  END IF;

  SELECT id INTO exists_row FROM public.swaparound_toy_favorites
    WHERE child_id = p_child AND listing_id = p_listing;
  IF exists_row IS NOT NULL THEN
    DELETE FROM public.swaparound_toy_favorites WHERE id = exists_row;
    RETURN 'removed';
  END IF;

  INSERT INTO public.swaparound_toy_favorites (parent_id, child_id, listing_id)
  VALUES (uid, p_child, p_listing);
  RETURN 'added';
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_toggle_favorite(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_toggle_favorite(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_child_favorites(p_child uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_children c WHERE c.id = p_child AND c.parent_id = uid) THEN
    RAISE EXCEPTION 'not_your_child';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.fav_at DESC)
    FROM (
      SELECT
        l.id, l.toy_name, l.category, l.color, l.toy_type, l.emoji, l.condition, l.wants,
        CASE WHEN l.photo_status = 'ok' THEN l.photo_url ELSE NULL END AS photo_url,
        l.status, l.area_label, l.parent_id,
        p.display_name AS seller_name,
        COALESCE(l.area_label, p.area_label) AS seller_area,
        f.created_at AS fav_at
      FROM public.swaparound_toy_favorites f
      JOIN public.swaparound_swap_listings l ON l.id = f.listing_id
      JOIN public.swaparound_parents p ON p.id = l.parent_id
      WHERE f.child_id = p_child
        AND l.status = 'available'
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
      ORDER BY f.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_child_favorites(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_child_favorites(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_child_favorite_ids(p_child uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_children c WHERE c.id = p_child AND c.parent_id = uid) THEN
    RAISE EXCEPTION 'not_your_child';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(listing_id)
    FROM public.swaparound_toy_favorites
    WHERE child_id = p_child
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_child_favorite_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_child_favorite_ids(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Kid-friendly market browse (always returns available; area soft-rank)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_market_browse_kids(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_toy_type text DEFAULT NULL,
  p_child uuid DEFAULT NULL
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
  col text := nullif(trim(COALESCE(p_color, '')), '');
  ttype text := nullif(trim(COALESCE(p_toy_type, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_child IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.swaparound_children c WHERE c.id = p_child AND c.parent_id = uid AND c.active
  ) THEN
    RAISE EXCEPTION 'not_your_child';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.area_match DESC, x.created_at DESC)
    FROM (
      SELECT
        l.id, l.session_id, l.child_id, l.parent_id, l.toy_name, l.category, l.condition,
        l.wants, l.emoji, l.status, l.area_label, l.color, l.toy_type,
        CASE WHEN l.photo_status = 'ok' THEN l.photo_url ELSE NULL END AS photo_url,
        l.photo_status, l.created_at,
        p.display_name AS seller_name,
        COALESCE(l.area_label, p.area_label) AS seller_area,
        c.nickname AS kid_nickname,
        c.avatar AS kid_avatar,
        CASE
          WHEN area IS NULL THEN 0
          WHEN COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' || area || '%' THEN 1
          ELSE 0
        END AS area_match,
        CASE WHEN p_child IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.swaparound_toy_favorites f
          WHERE f.child_id = p_child AND f.listing_id = l.id
        ) THEN true ELSE false END AS is_favorite
      FROM public.swaparound_swap_listings l
      JOIN public.swaparound_parents p ON p.id = l.parent_id
      JOIN public.swaparound_children c ON c.id = l.child_id
      WHERE l.status = 'available'
        AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
        AND (cat IS NULL OR l.category = cat)
        AND (col IS NULL OR lower(COALESCE(l.color, '')) = lower(col))
        AND (ttype IS NULL OR lower(COALESCE(l.toy_type, '')) = lower(ttype))
        AND (
          q IS NULL
          OR l.toy_name ILIKE '%' || q || '%'
          OR COALESCE(l.wants, '') ILIKE '%' || q || '%'
          OR COALESCE(l.toy_type, '') ILIKE '%' || q || '%'
          OR COALESCE(l.color, '') ILIKE '%' || q || '%'
          OR l.category ILIKE '%' || q || '%'
        )
        -- Soft area filter: if area set, prefer matches but still show nearby-first all available
        -- Strict filter only when user pins "only my area" via p_area with special prefix 'only:'
        AND (
          area IS NULL
          OR area LIKE 'only:%' AND COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' || substr(area, 6) || '%'
          OR area NOT LIKE 'only:%'
        )
      ORDER BY
        CASE
          WHEN area IS NULL THEN 0
          WHEN area LIKE 'only:%' THEN 0
          WHEN COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' || CASE WHEN area LIKE 'only:%' THEN substr(area,6) ELSE area END || '%' THEN 0
          ELSE 1
        END,
        l.created_at DESC
      LIMIT 120
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_market_browse_kids(text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_market_browse_kids(text, text, text, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Venue day request RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_request_venue_day(
  p_venue uuid,
  p_date date,
  p_time text DEFAULT NULL,
  p_mode text DEFAULT 'event',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_venues v WHERE v.id = p_venue AND v.status = 'verified') THEN
    RAISE EXCEPTION 'venue_not_available';
  END IF;
  IF p_date < current_date THEN RAISE EXCEPTION 'date_past'; END IF;

  INSERT INTO public.swaparound_venue_day_requests (
    venue_id, parent_id, preferred_date, preferred_time, meetup_mode, notes
  ) VALUES (
    p_venue, uid, p_date,
    nullif(trim(COALESCE(p_time, '')), ''),
    COALESCE(nullif(trim(p_mode), ''), 'event'),
    nullif(trim(COALESCE(p_notes, '')), '')
  ) RETURNING id INTO rid;
  RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_request_venue_day(uuid, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_request_venue_day(uuid, date, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_venue_day_requests_for_me()
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
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.preferred_date)
    FROM (
      SELECT r.*, v.name AS venue_name, v.neighborhood AS venue_area,
        p.display_name AS parent_name
      FROM public.swaparound_venue_day_requests r
      JOIN public.swaparound_venues v ON v.id = r.venue_id
      JOIN public.swaparound_parents p ON p.id = r.parent_id
      WHERE r.parent_id = uid
         OR v.manager_user_id = uid
         OR v.added_by = uid
         OR public.swaparound_is_admin(uid)
      ORDER BY r.preferred_date DESC
      LIMIT 80
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_venue_day_requests_for_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_venue_day_requests_for_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_respond_venue_day(
  p_id uuid,
  p_status text,
  p_reply text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.swaparound_venue_day_requests%ROWTYPE;
  v public.swaparound_venues%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM public.swaparound_venue_day_requests WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v FROM public.swaparound_venues WHERE id = r.venue_id;
  IF NOT public.swaparound_is_admin(uid)
     AND v.manager_user_id IS DISTINCT FROM uid
     AND v.added_by IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'not_manager';
  END IF;
  IF p_status NOT IN ('reviewing', 'approved', 'declined', 'scheduled') THEN
    RAISE EXCEPTION 'bad_status';
  END IF;

  UPDATE public.swaparound_venue_day_requests
    SET status = p_status,
        venue_reply = COALESCE(nullif(trim(COALESCE(p_reply, '')), ''), venue_reply),
        updated_at = now()
    WHERE id = r.id;
  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_respond_venue_day(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_respond_venue_day(uuid, text, text) TO authenticated;

-- Venues for map (verified + coords-ish: address/neighborhood only)
CREATE OR REPLACE FUNCTION public.swaparound_venues_map()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(v)::jsonb ORDER BY v.name)
    FROM (
      SELECT id, name, venue_type, neighborhood, address, status, perk, services_discount,
        contact_name, hours_note, description
      FROM public.swaparound_venues
      WHERE status IN ('verified', 'community')
         OR public.swaparound_is_admin(auth.uid())
         OR manager_user_id = auth.uid()
         OR added_by = auth.uid()
      ORDER BY name
      LIMIT 200
    ) v
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_venues_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_venues_map() TO authenticated;

COMMIT;
