-- Sandlot 0007 — child-safety hardening (COPPA-minded)
-- Fixes for:
--  1. Public listable toy-photo bucket → private + authenticated object access only
--  2. Takedown must DELETE storage objects, not only null DB photo_url
--  3. Browse RPCs must NOT expose kid nickname / avatar to strangers
--  4. Signup rate-limit ledger for the service-role signup route
--
-- Apply on LPL Supabase after 0001–0006. Safe to re-run (idempotent patterns).

-- ---------------------------------------------------------------------------
-- 1. Private toy-photo bucket (not public, not anonymously listable)
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'swaparound-toys';

DROP POLICY IF EXISTS "swaparound_toys_public_read" ON storage.objects;

-- Owners and admins can always read their own paths.
-- Other authenticated parents may read only when the listing is still available
-- with photo_status = 'ok' (so under_review / removed objects are not downloadable).
DROP POLICY IF EXISTS "swaparound_toys_auth_read" ON storage.objects;
CREATE POLICY "swaparound_toys_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'swaparound-toys'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      OR public.swaparound_is_admin((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.swaparound_swap_listings l
        WHERE l.photo_status = 'ok'
          AND l.status IN ('available', 'swap_planned', 'claimed')
          AND NOT public.swaparound_is_blocked_between((SELECT auth.uid()), l.parent_id)
          AND (
            l.photo_path = name
            OR (
              l.photo_urls IS NOT NULL
              AND l.photo_urls::text LIKE '%' || name || '%'
            )
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Purge storage objects when a photo is taken down
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_purge_listing_photos(p_listing uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  l public.swaparound_swap_listings%ROWTYPE;
  path text;
  paths text[] := ARRAY[]::text[];
  elem jsonb;
BEGIN
  SELECT * INTO l FROM public.swaparound_swap_listings WHERE id = p_listing FOR UPDATE;
  IF l.id IS NULL THEN
    RETURN;
  END IF;

  IF l.photo_path IS NOT NULL AND length(trim(l.photo_path)) > 0 THEN
    paths := array_append(paths, l.photo_path);
  END IF;

  -- photo_urls may be jsonb array of public URLs or paths; extract storage object names when possible.
  IF l.photo_urls IS NOT NULL AND jsonb_typeof(l.photo_urls) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(l.photo_urls)
    LOOP
      path := elem #>> '{}';
      IF path IS NULL THEN
        CONTINUE;
      END IF;
      -- Full public URL → strip to object path after /swaparound-toys/
      IF position('/swaparound-toys/' in path) > 0 THEN
        path := split_part(path, '/swaparound-toys/', 2);
        path := split_part(path, '?', 1);
      END IF;
      -- Path form uid/uuid.jpg
      IF path ~ '^[0-9a-fA-F-]{8,}/.+' THEN
        paths := array_append(paths, path);
      END IF;
    END LOOP;
  END IF;

  IF array_length(paths, 1) IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'swaparound-toys'
      AND name = ANY (paths);
  END IF;

  UPDATE public.swaparound_swap_listings
  SET photo_status = 'removed',
      photo_url = NULL,
      photo_urls = '[]'::jsonb,
      photo_path = NULL,
      updated_at = now()
  WHERE id = p_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.swaparound_purge_listing_photos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_purge_listing_photos(uuid) TO authenticated;

-- Wire purge into report (child_safety / photo_safety immediate hide still uses under_review;
-- admin remove + legal call purge so files are gone from storage).
CREATE OR REPLACE FUNCTION public.swaparound_admin_mod_photo(
  p_report_id uuid,
  p_action text,
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
      PERFORM public.swaparound_purge_listing_photos(l.id);
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'actioned', action_taken = 'photo_removed_and_purged',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'photo_removed';

  ELSIF act = 'remove_listing' THEN
    IF l.id IS NOT NULL THEN
      PERFORM public.swaparound_purge_listing_photos(l.id);
      UPDATE public.swaparound_swap_listings
        SET status = 'withdrawn', updated_at = now()
        WHERE id = l.id;
      UPDATE public.swaparound_trade_offers
        SET status = 'cancelled', updated_at = now()
        WHERE status IN ('pending', 'accepted')
          AND (target_listing_id = l.id OR offer_listing_id = l.id);
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'actioned', action_taken = 'listing_removed_and_purged',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'listing_removed';

  ELSIF act = 'restore_photo' THEN
    -- Cannot restore purged files; only allow if photo_path still present.
    IF l.id IS NOT NULL AND l.photo_path IS NOT NULL THEN
      UPDATE public.swaparound_swap_listings
        SET photo_status = 'ok',
            photo_url = COALESCE(photo_url, r.photo_url_snapshot),
            updated_at = now()
        WHERE id = l.id;
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'dismissed', action_taken = 'photo_restored',
          admin_notes = COALESCE(notes, admin_notes), updated_at = now()
      WHERE id = r.id;
    RETURN 'photo_restored';

  ELSIF act = 'dismiss' THEN
    IF l.id IS NOT NULL AND l.photo_status = 'under_review' AND l.photo_path IS NOT NULL THEN
      UPDATE public.swaparound_swap_listings
        SET photo_status = 'ok',
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
    IF l.id IS NOT NULL THEN
      -- Purge from app storage; report keeps photo_url_snapshot for evidence only (not public).
      PERFORM public.swaparound_purge_listing_photos(l.id);
      UPDATE public.swaparound_swap_listings
        SET status = 'withdrawn', updated_at = now()
        WHERE id = l.id;
      UPDATE public.swaparound_trade_offers
        SET status = 'cancelled', updated_at = now()
        WHERE status IN ('pending', 'accepted')
          AND (target_listing_id = l.id OR offer_listing_id = l.id);
    END IF;
    UPDATE public.swaparound_reports
      SET status = 'legal_escalation', severity = 'legal_escalation', legal_flag = true,
          action_taken = 'legal_escalation_purged_storage',
          admin_notes = COALESCE(
            notes,
            'Escalated for legal review. Storage object purged from public bucket. Snapshot retained on report only.'
          ),
          updated_at = now()
      WHERE id = r.id;
    RETURN 'legal_escalation';

  ELSE
    RAISE EXCEPTION 'bad_action';
  END IF;
END;
$$;

-- Immediate hard purge on child_safety photo reports (not only under_review hide)
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
    WHEN reason ILIKE '%child%' OR reason ILIKE '%face%' OR reason ILIKE '%minor%'
      OR reason ILIKE '%nude%' OR reason ILIKE '%sexual%'
      THEN 'child_safety'
    ELSE 'photo_safety'
  END;

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
    CASE WHEN p_legal OR sev IN ('legal_escalation', 'child_safety') THEN 'legal_escalation' ELSE 'open' END,
    sev,
    l.photo_url,
    COALESCE(p_legal, false) OR sev IN ('legal_escalation', 'child_safety')
  ) RETURNING id INTO rid;

  -- Child-safety / legal: purge storage immediately so the file is not downloadable.
  -- Other photo reports: hide via under_review until admin acts.
  IF sev IN ('child_safety', 'legal_escalation') THEN
    PERFORM public.swaparound_purge_listing_photos(l.id);
  ELSIF l.photo_status IN ('ok', 'none') OR l.photo_url IS NOT NULL THEN
    UPDATE public.swaparound_swap_listings
      SET photo_status = 'under_review', updated_at = now()
      WHERE id = l.id AND photo_status <> 'removed';
  END IF;

  RETURN rid;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Browse RPCs: no kid nickname / avatar for strangers
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
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
    FROM (
      SELECT
        l.id, l.session_id, l.child_id, l.parent_id, l.toy_name, l.category, l.condition,
        l.wants, l.emoji, l.status, l.area_label, l.color, l.toy_type,
        CASE WHEN l.photo_status = 'ok' THEN l.photo_path ELSE NULL END AS photo_path,
        CASE WHEN l.photo_status = 'ok' THEN l.photo_url ELSE NULL END AS photo_url,
        CASE
          WHEN l.photo_status = 'ok' THEN COALESCE(l.photo_urls, '[]'::jsonb)
          ELSE '[]'::jsonb
        END AS photo_urls,
        l.photo_status, l.created_at,
        p.display_name AS seller_name,
        COALESCE(l.area_label, p.area_label) AS seller_area
        -- Intentionally NO kid_nickname / kid_avatar — strangers must not see child identifiers.
      FROM public.swaparound_swap_listings l
      JOIN public.swaparound_parents p ON p.id = l.parent_id
      WHERE l.status = 'available'
        AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
        AND (cat IS NULL OR l.category = cat)
        AND (
          col IS NULL
          OR lower(COALESCE(l.color, '')) = lower(col)
          OR lower(COALESCE(l.color, '')) LIKE '%' || lower(col) || '%'
        )
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
          OR COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' ||
            CASE WHEN area LIKE 'only:%' THEN substr(area, 6) ELSE area END || '%'
        )
      ORDER BY l.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

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
        CASE WHEN l.photo_status = 'ok' THEN l.photo_path ELSE NULL END AS photo_path,
        CASE WHEN l.photo_status = 'ok' THEN l.photo_url ELSE NULL END AS photo_url,
        CASE
          WHEN l.photo_status = 'ok' THEN COALESCE(l.photo_urls, '[]'::jsonb)
          ELSE '[]'::jsonb
        END AS photo_urls,
        l.photo_status, l.created_at,
        p.display_name AS seller_name,
        COALESCE(l.area_label, p.area_label) AS seller_area,
        CASE
          WHEN area IS NULL THEN 0
          WHEN COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' ||
            CASE WHEN area LIKE 'only:%' THEN substr(area, 6) ELSE area END || '%' THEN 1
          ELSE 0
        END AS area_match,
        CASE WHEN p_child IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.swaparound_toy_favorites f
          WHERE f.child_id = p_child AND f.listing_id = l.id
        ) THEN true ELSE false END AS is_favorite
        -- No kid_nickname / kid_avatar on stranger-facing browse.
      FROM public.swaparound_swap_listings l
      JOIN public.swaparound_parents p ON p.id = l.parent_id
      WHERE l.status = 'available'
        AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
        AND (cat IS NULL OR l.category = cat)
        AND (
          col IS NULL
          OR lower(COALESCE(l.color, '')) = lower(col)
          OR lower(COALESCE(l.color, '')) LIKE '%' || lower(col) || '%'
        )
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
          OR area LIKE 'only:%' AND COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' || substr(area, 6) || '%'
          OR area NOT LIKE 'only:%' AND COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' || area || '%'
        )
      ORDER BY area_match DESC, l.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Signup rate-limit ledger (service-role route checks this)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_signup_attempts (
  id bigserial PRIMARY KEY,
  email_hash text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS swaparound_signup_attempts_email_created_idx
  ON public.swaparound_signup_attempts (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS swaparound_signup_attempts_ip_created_idx
  ON public.swaparound_signup_attempts (ip_hash, created_at DESC);

ALTER TABLE public.swaparound_signup_attempts ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated — only service role (bypasses RLS) writes/reads.

CREATE OR REPLACE FUNCTION public.swaparound_signup_rate_check(
  p_email text,
  p_ip text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_norm text := lower(trim(COALESCE(p_email, '')));
  ip_norm text := left(trim(COALESCE(p_ip, '')), 64);
  ehash text;
  ihash text;
  email_count int;
  ip_count int;
BEGIN
  IF email_norm = '' OR position('@' in email_norm) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_email');
  END IF;

  ehash := encode(extensions.digest(email_norm, 'sha256'), 'hex');
  ihash := encode(extensions.digest(COALESCE(nullif(ip_norm, ''), 'unknown'), 'sha256'), 'hex');

  SELECT count(*) INTO email_count
  FROM public.swaparound_signup_attempts
  WHERE email_hash = ehash AND created_at > now() - interval '1 hour';

  SELECT count(*) INTO ip_count
  FROM public.swaparound_signup_attempts
  WHERE ip_hash = ihash AND created_at > now() - interval '1 hour';

  IF email_count >= 5 OR ip_count >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.swaparound_signup_attempts (email_hash, ip_hash) VALUES (ehash, ihash);

  -- Retention: drop attempts older than 7 days
  DELETE FROM public.swaparound_signup_attempts WHERE created_at < now() - interval '7 days';

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- digest may live in extensions or pgcrypto — fallback if extensions.digest missing
DO $$
BEGIN
  PERFORM extensions.digest('test', 'sha256');
EXCEPTION
  WHEN undefined_function OR undefined_schema THEN
    CREATE OR REPLACE FUNCTION public.swaparound_signup_rate_check(
      p_email text,
      p_ip text DEFAULT ''
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      email_norm text := lower(trim(COALESCE(p_email, '')));
      ip_norm text := left(trim(COALESCE(p_ip, '')), 64);
      ehash text;
      ihash text;
      email_count int;
      ip_count int;
    BEGIN
      IF email_norm = '' OR position('@' in email_norm) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'bad_email');
      END IF;
      ehash := md5(email_norm);
      ihash := md5(COALESCE(nullif(ip_norm, ''), 'unknown'));
      SELECT count(*) INTO email_count
      FROM public.swaparound_signup_attempts
      WHERE email_hash = ehash AND created_at > now() - interval '1 hour';
      SELECT count(*) INTO ip_count
      FROM public.swaparound_signup_attempts
      WHERE ip_hash = ihash AND created_at > now() - interval '1 hour';
      IF email_count >= 5 OR ip_count >= 20 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
      END IF;
      INSERT INTO public.swaparound_signup_attempts (email_hash, ip_hash) VALUES (ehash, ihash);
      DELETE FROM public.swaparound_signup_attempts WHERE created_at < now() - interval '7 days';
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
END $$;

REVOKE ALL ON FUNCTION public.swaparound_signup_rate_check(text, text) FROM PUBLIC;
-- Callable only via service role from the Next.js signup route (or postgres).

COMMENT ON FUNCTION public.swaparound_purge_listing_photos(uuid) IS
  'Hard-deletes toy photo objects from private storage and clears listing photo fields.';
COMMENT ON FUNCTION public.swaparound_market_browse IS
  'Marketplace browse for parents. Never returns child nickname/avatar to other parents.';
COMMENT ON TABLE public.swaparound_signup_attempts IS
  'Hashed signup attempt ledger for rate limiting; no raw emails/IPs stored.';
