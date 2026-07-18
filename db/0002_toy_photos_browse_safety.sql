-- Sandlot: toy photos, richer browse filters, photo-safety moderation.
-- Additive. Safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Listing fields: photo + color + type
-- ---------------------------------------------------------------------------
ALTER TABLE public.swaparound_swap_listings
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS toy_type text,
  ADD COLUMN IF NOT EXISTS photo_status text NOT NULL DEFAULT 'none';

-- photo_status: none | ok | under_review | removed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_listings_photo_status_check'
  ) THEN
    ALTER TABLE public.swaparound_swap_listings
      ADD CONSTRAINT swaparound_listings_photo_status_check
      CHECK (photo_status = ANY (ARRAY['none'::text, 'ok'::text, 'under_review'::text, 'removed'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_listings_color_len'
  ) THEN
    ALTER TABLE public.swaparound_swap_listings
      ADD CONSTRAINT swaparound_listings_color_len
      CHECK (color IS NULL OR (char_length(color) >= 1 AND char_length(color) <= 40));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_listings_toy_type_len'
  ) THEN
    ALTER TABLE public.swaparound_swap_listings
      ADD CONSTRAINT swaparound_listings_toy_type_len
      CHECK (toy_type IS NULL OR (char_length(toy_type) >= 1 AND char_length(toy_type) <= 40));
  END IF;
END $$;

COMMENT ON COLUMN public.swaparound_swap_listings.photo_path IS 'Storage path in swaparound-toys bucket';
COMMENT ON COLUMN public.swaparound_swap_listings.photo_url IS 'Public URL for display; null when photo_status=removed';
COMMENT ON COLUMN public.swaparound_swap_listings.color IS 'Primary color label for browse/filter';
COMMENT ON COLUMN public.swaparound_swap_listings.toy_type IS 'Specific type (pop-it, spinner, plush animal…) under category';
COMMENT ON COLUMN public.swaparound_swap_listings.photo_status IS 'none|ok|under_review|removed — under_review hides photo from public browse';

CREATE INDEX IF NOT EXISTS swaparound_listings_color_idx
  ON public.swaparound_swap_listings (color) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS swaparound_listings_toy_type_idx
  ON public.swaparound_swap_listings (toy_type) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS swaparound_listings_photo_status_idx
  ON public.swaparound_swap_listings (photo_status);

-- ---------------------------------------------------------------------------
-- 2. Reports: severity + legal escalation
-- ---------------------------------------------------------------------------
ALTER TABLE public.swaparound_reports
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS photo_url_snapshot text,
  ADD COLUMN IF NOT EXISTS legal_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_taken text;

-- Expand target_type
ALTER TABLE public.swaparound_reports DROP CONSTRAINT IF EXISTS swaparound_reports_target_type_check;
ALTER TABLE public.swaparound_reports
  ADD CONSTRAINT swaparound_reports_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'session'::text, 'listing'::text, 'listing_photo'::text, 'venue'::text, 'parent'::text, 'general'::text
  ]));

-- Expand status for legal pipeline
ALTER TABLE public.swaparound_reports DROP CONSTRAINT IF EXISTS swaparound_reports_status_check;
ALTER TABLE public.swaparound_reports
  ADD CONSTRAINT swaparound_reports_status_check
  CHECK (status = ANY (ARRAY[
    'open'::text, 'reviewing'::text, 'actioned'::text, 'dismissed'::text, 'legal_escalation'::text
  ]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_reports_severity_check'
  ) THEN
    ALTER TABLE public.swaparound_reports
      ADD CONSTRAINT swaparound_reports_severity_check
      CHECK (severity = ANY (ARRAY[
        'standard'::text, 'photo_safety'::text, 'child_safety'::text, 'legal_escalation'::text
      ]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS swaparound_reports_severity_status_idx
  ON public.swaparound_reports (severity, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Storage bucket for toy photos only
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'swaparound-toys',
  'swaparound-toys',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: path must start with auth.uid()/...
DROP POLICY IF EXISTS "swaparound_toys_public_read" ON storage.objects;
CREATE POLICY "swaparound_toys_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'swaparound-toys');

DROP POLICY IF EXISTS "swaparound_toys_owner_insert" ON storage.objects;
CREATE POLICY "swaparound_toys_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'swaparound-toys'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

DROP POLICY IF EXISTS "swaparound_toys_owner_update" ON storage.objects;
CREATE POLICY "swaparound_toys_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'swaparound-toys'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      OR public.swaparound_is_admin((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "swaparound_toys_owner_delete" ON storage.objects;
CREATE POLICY "swaparound_toys_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'swaparound-toys'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      OR public.swaparound_is_admin((SELECT auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Market browse with filters (name/q, category, type, color, area)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_market_browse(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_toy_type text DEFAULT NULL
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
        l.color,
        l.toy_type,
        CASE
          WHEN l.photo_status IN ('ok', 'under_review') AND l.photo_url IS NOT NULL
            THEN CASE WHEN l.photo_status = 'under_review' AND l.parent_id <> uid THEN NULL ELSE l.photo_url END
          WHEN l.photo_status = 'ok' THEN l.photo_url
          ELSE NULL
        END AS photo_url,
        l.photo_status,
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
        AND (
          area IS NULL
          OR COALESCE(l.area_label, p.area_label, '') ILIKE '%' || area || '%'
        )
      ORDER BY l.created_at DESC
      LIMIT 120
    ) x
  ), '[]'::jsonb);
END;
$$;

-- Hide photos under_review from strangers in browse (fixed logic):
CREATE OR REPLACE FUNCTION public.swaparound_market_browse(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_toy_type text DEFAULT NULL
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
        l.color,
        l.toy_type,
        CASE
          WHEN l.photo_status = 'ok' AND l.photo_url IS NOT NULL THEN l.photo_url
          ELSE NULL
        END AS photo_url,
        l.photo_status,
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
        AND (
          area IS NULL
          OR COALESCE(l.area_label, p.area_label, '') ILIKE '%' || area || '%'
        )
      ORDER BY l.created_at DESC
      LIMIT 120
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_market_browse(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_market_browse(text, text, text, text, text) TO authenticated;

-- Keep 3-arg overload working by wrapping
CREATE OR REPLACE FUNCTION public.swaparound_market_browse(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_area text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.swaparound_market_browse(p_q, p_category, p_area, NULL, NULL);
$$;

REVOKE ALL ON FUNCTION public.swaparound_market_browse(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_market_browse(text, text, text) TO authenticated;

-- Distinct filter values for browse chips
CREATE OR REPLACE FUNCTION public.swaparound_market_filters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN jsonb_build_object(
    'colors', COALESCE((
      SELECT jsonb_agg(DISTINCT lower(l.color) ORDER BY lower(l.color))
      FROM public.swaparound_swap_listings l
      WHERE l.status = 'available' AND l.color IS NOT NULL AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
    ), '[]'::jsonb),
    'types', COALESCE((
      SELECT jsonb_agg(DISTINCT lower(l.toy_type) ORDER BY lower(l.toy_type))
      FROM public.swaparound_swap_listings l
      WHERE l.status = 'available' AND l.toy_type IS NOT NULL AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(DISTINCT l.category ORDER BY l.category)
      FROM public.swaparound_swap_listings l
      WHERE l.status = 'available' AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_market_filters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_market_filters() TO authenticated;

-- Update my_listings to include photo fields
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
      SELECT
        l.id, l.session_id, l.child_id, l.parent_id, l.toy_name, l.category, l.condition,
        l.wants, l.emoji, l.status, l.area_label, l.color, l.toy_type,
        CASE WHEN l.photo_status = 'removed' THEN NULL ELSE l.photo_url END AS photo_url,
        l.photo_status, l.photo_path, l.created_at,
        c.nickname AS kid_nickname, c.avatar AS kid_avatar
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

-- ---------------------------------------------------------------------------
-- 5. Report photo (auto-hides photo, escalates severity)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_report_listing_photo(
  p_listing uuid,
  p_reason text,
  p_details text DEFAULT NULL,
  p_legal boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  l public.swaparound_swap_listings%ROWTYPE;
  rid uuid;
  reason text := trim(COALESCE(p_reason, ''));
  details text := nullif(trim(COALESCE(p_details, '')), '');
  sev text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF char_length(reason) < 1 OR char_length(reason) > 200 THEN RAISE EXCEPTION 'bad_reason'; END IF;
  IF details IS NOT NULL AND char_length(details) > 2000 THEN RAISE EXCEPTION 'details_too_long'; END IF;

  SELECT * INTO l FROM public.swaparound_swap_listings WHERE id = p_listing FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'listing_not_found'; END IF;
  IF l.parent_id = uid THEN RAISE EXCEPTION 'self_report'; END IF;
  IF public.swaparound_is_blocked_between(uid, l.parent_id) THEN RAISE EXCEPTION 'blocked'; END IF;

  sev := CASE
    WHEN p_legal THEN 'legal_escalation'
    WHEN reason ILIKE '%child%' OR reason ILIKE '%face%' OR reason ILIKE '%minor%' OR reason ILIKE '%nude%' OR reason ILIKE '%sexual%'
      THEN 'child_safety'
    ELSE 'photo_safety'
  END;

  -- Immediately hide the photo from public browse while admin reviews
  IF l.photo_status IN ('ok', 'none') OR l.photo_url IS NOT NULL THEN
    UPDATE public.swaparound_swap_listings
      SET photo_status = 'under_review', updated_at = now()
      WHERE id = l.id AND photo_status <> 'removed';
  END IF;

  INSERT INTO public.swaparound_reports (
    reporter_id, target_type, target_id, subject_parent_id, target_label,
    reason, details, status, severity, photo_url_snapshot, legal_flag
  ) VALUES (
    uid,
    'listing_photo',
    l.id,
    l.parent_id,
    'Toy photo: ' || l.toy_name,
    reason,
    details,
    CASE WHEN p_legal OR sev = 'legal_escalation' THEN 'legal_escalation' ELSE 'open' END,
    sev,
    l.photo_url,
    COALESCE(p_legal, false) OR sev = 'legal_escalation'
  ) RETURNING id INTO rid;

  RETURN rid;
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_report_listing_photo(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_report_listing_photo(uuid, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin moderation actions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_admin_mod_photo(
  p_report_id uuid,
  p_action text, -- remove_photo | remove_listing | restore_photo | dismiss | legal
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.swaparound_reports%ROWTYPE;
  l public.swaparound_swap_listings%ROWTYPE;
  act text := lower(trim(p_action));
  notes text := nullif(trim(COALESCE(p_notes, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.swaparound_is_admin(uid) THEN RAISE EXCEPTION 'not_admin'; END IF;

  SELECT * INTO r FROM public.swaparound_reports WHERE id = p_report_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'report_not_found'; END IF;

  IF r.target_id IS NOT NULL THEN
    SELECT * INTO l FROM public.swaparound_swap_listings WHERE id = r.target_id FOR UPDATE;
  END IF;

  IF act = 'remove_photo' THEN
    IF l.id IS NOT NULL THEN
      UPDATE public.swaparound_swap_listings
        SET photo_status = 'removed', photo_url = NULL, updated_at = now()
        WHERE id = l.id;
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'actioned', action_taken = 'photo_removed',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'photo_removed';

  ELSIF act = 'remove_listing' THEN
    IF l.id IS NOT NULL THEN
      UPDATE public.swaparound_swap_listings
        SET status = 'withdrawn', photo_status = 'removed', photo_url = NULL, updated_at = now()
        WHERE id = l.id;
      -- cancel pending trades involving it
      UPDATE public.swaparound_trade_offers
        SET status = 'cancelled', updated_at = now()
        WHERE status IN ('pending', 'accepted')
          AND (target_listing_id = l.id OR offer_listing_id = l.id);
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'actioned', action_taken = 'listing_removed',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'listing_removed';

  ELSIF act = 'restore_photo' THEN
    IF l.id IS NOT NULL THEN
      UPDATE public.swaparound_swap_listings
        SET photo_status = CASE WHEN photo_path IS NOT NULL THEN 'ok' ELSE 'none' END,
            photo_url = CASE
              WHEN photo_path IS NOT NULL THEN
                COALESCE(
                  photo_url,
                  -- rebuild public URL pattern if snapshot exists
                  r.photo_url_snapshot
                )
              ELSE NULL
            END,
            updated_at = now()
        WHERE id = l.id;
      -- if photo_url still null but we have snapshot, use it
      UPDATE public.swaparound_swap_listings
        SET photo_url = r.photo_url_snapshot
        WHERE id = l.id AND photo_url IS NULL AND r.photo_url_snapshot IS NOT NULL AND photo_status = 'ok';
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'dismissed', action_taken = 'photo_restored',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'photo_restored';

  ELSIF act = 'dismiss' THEN
    IF l.id IS NOT NULL AND l.photo_status = 'under_review' THEN
      UPDATE public.swaparound_swap_listings
        SET photo_status = CASE WHEN photo_path IS NOT NULL THEN 'ok' ELSE 'none' END,
            photo_url = COALESCE(photo_url, r.photo_url_snapshot),
            updated_at = now()
        WHERE id = l.id;
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'dismissed', action_taken = 'dismissed',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'dismissed';

  ELSIF act = 'legal' THEN
    -- Keep photo hidden; flag for legal review / possible charges. Does not delete evidence URL snapshot.
    IF l.id IS NOT NULL THEN
      UPDATE public.swaparound_swap_listings
        SET photo_status = 'removed', photo_url = NULL, status = 'withdrawn', updated_at = now()
        WHERE id = l.id;
      UPDATE public.swaparound_trade_offers
        SET status = 'cancelled', updated_at = now()
        WHERE status IN ('pending', 'accepted')
          AND (target_listing_id = l.id OR offer_listing_id = l.id);
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'legal_escalation', severity = 'legal_escalation', legal_flag = true,
          action_taken = 'legal_escalation',
          admin_notes = COALESCE(
            notes,
            'Escalated for legal review. Photo snapshot retained on report. Listing removed from app.'
          ),
          updated_at = now()
      WHERE id = r.id;
    RETURN 'legal_escalation';

  ELSE
    RAISE EXCEPTION 'bad_action';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_admin_mod_photo(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_mod_photo(uuid, text, text) TO authenticated;

-- Admin list open safety reports with listing context
CREATE OR REPLACE FUNCTION public.swaparound_admin_safety_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.swaparound_is_admin(uid) THEN RAISE EXCEPTION 'not_admin'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY
      CASE x.severity
        WHEN 'legal_escalation' THEN 0
        WHEN 'child_safety' THEN 1
        WHEN 'photo_safety' THEN 2
        ELSE 3
      END,
      x.created_at DESC
    )
    FROM (
      SELECT
        r.id, r.reporter_id, r.target_type, r.target_id, r.subject_parent_id,
        r.target_label, r.reason, r.details, r.status, r.admin_notes,
        r.severity, r.photo_url_snapshot, r.legal_flag, r.action_taken,
        r.created_at, r.updated_at,
        l.toy_name, l.category, l.color, l.toy_type, l.photo_status AS listing_photo_status,
        l.status AS listing_status, l.emoji, l.photo_path,
        rp.display_name AS reporter_name,
        sp.display_name AS subject_name
      FROM public.swaparound_reports r
      LEFT JOIN public.swaparound_swap_listings l ON l.id = r.target_id
      LEFT JOIN public.swaparound_parents rp ON rp.id = r.reporter_id
      LEFT JOIN public.swaparound_parents sp ON sp.id = r.subject_parent_id
      WHERE r.status IN ('open', 'reviewing', 'legal_escalation')
         OR r.severity IN ('photo_safety', 'child_safety', 'legal_escalation')
      ORDER BY r.created_at DESC
      LIMIT 200
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_admin_safety_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_safety_queue() TO authenticated;

COMMIT;
