-- Sandlot: multi-photo listings + multi-color labels
-- Additive. Safe to re-run.

BEGIN;

-- Extra photo gallery (photo_url remains the cover / first photo)
ALTER TABLE public.swaparound_swap_listings
  ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.swaparound_swap_listings.photo_urls IS
  'JSON array of public photo URLs (cover is also photo_url). Toy photos only.';

-- Allow several colors joined with ", " (e.g. "red, blue, yellow")
ALTER TABLE public.swaparound_swap_listings
  DROP CONSTRAINT IF EXISTS swaparound_listings_color_len;

ALTER TABLE public.swaparound_swap_listings
  ADD CONSTRAINT swaparound_listings_color_len
  CHECK (color IS NULL OR (char_length(color) >= 1 AND char_length(color) <= 120));

-- ---------------------------------------------------------------------------
-- my listings: include photo_urls
-- ---------------------------------------------------------------------------
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
        CASE
          WHEN l.photo_status = 'removed' THEN '[]'::jsonb
          ELSE COALESCE(l.photo_urls, '[]'::jsonb)
        END AS photo_urls,
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
-- Market browse kids: multi-color contains match + photo_urls
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
        CASE
          WHEN l.photo_status = 'ok' THEN COALESCE(l.photo_urls, '[]'::jsonb)
          ELSE '[]'::jsonb
        END AS photo_urls,
        l.photo_status, l.created_at,
        p.display_name AS seller_name,
        COALESCE(l.area_label, p.area_label) AS seller_area,
        c.nickname AS kid_nickname,
        c.avatar AS kid_avatar,
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
      FROM public.swaparound_swap_listings l
      JOIN public.swaparound_parents p ON p.id = l.parent_id
      JOIN public.swaparound_children c ON c.id = l.child_id
      WHERE l.status = 'available'
        AND l.parent_id <> uid
        AND NOT public.swaparound_is_blocked_between(uid, l.parent_id)
        AND (cat IS NULL OR l.category = cat)
        -- multi-color: "red, blue" matches filter red or blue
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

-- Adult market browse (same multi-color + photo_urls)
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
        CASE
          WHEN l.photo_status = 'ok' THEN COALESCE(l.photo_urls, '[]'::jsonb)
          ELSE '[]'::jsonb
        END AS photo_urls,
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
          OR COALESCE(l.area_label, p.area_label, p.zip, '') ILIKE '%' || area || '%'
        )
      ORDER BY l.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

-- market filters: split multi-color strings into distinct color tokens
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
      SELECT jsonb_agg(DISTINCT c ORDER BY c)
      FROM (
        SELECT lower(trim(tok)) AS c
        FROM public.swaparound_swap_listings l,
          LATERAL unnest(string_to_array(COALESCE(l.color, ''), ',')) AS tok
        WHERE l.status = 'available'
          AND l.color IS NOT NULL
          AND l.parent_id <> uid
          AND length(trim(tok)) > 0
      ) s
      WHERE c <> ''
    ), '[]'::jsonb),
    'types', COALESCE((
      SELECT jsonb_agg(DISTINCT lower(l.toy_type) ORDER BY lower(l.toy_type))
      FROM public.swaparound_swap_listings l
      WHERE l.status = 'available' AND l.toy_type IS NOT NULL AND l.parent_id <> uid
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(DISTINCT l.category ORDER BY l.category)
      FROM public.swaparound_swap_listings l
      WHERE l.status = 'available' AND l.parent_id <> uid
    ), '[]'::jsonb)
  );
END;
$$;

COMMIT;
