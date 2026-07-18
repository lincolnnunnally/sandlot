-- Venue org invites, full venue profile, service discounts, venue manager portal.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Venue profile fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.swaparound_venues
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS hours_note text,
  ADD COLUMN IF NOT EXISTS services_discount text,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.swaparound_venues.perk IS 'Meetup-day promo for Sandlot families (shown on playdate cards).';
COMMENT ON COLUMN public.swaparound_venues.services_discount IS 'Discount on the venue''s other services (skating, gym, rentals…) for Sandlot families.';
COMMENT ON COLUMN public.swaparound_venues.manager_user_id IS 'Org user who can edit this venue via /venue portal.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_venues_description_len') THEN
    ALTER TABLE public.swaparound_venues ADD CONSTRAINT swaparound_venues_description_len
      CHECK (description IS NULL OR char_length(description) <= 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_venues_services_discount_len') THEN
    ALTER TABLE public.swaparound_venues ADD CONSTRAINT swaparound_venues_services_discount_len
      CHECK (services_discount IS NULL OR char_length(services_discount) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_venues_perk_len') THEN
    ALTER TABLE public.swaparound_venues ADD CONSTRAINT swaparound_venues_perk_len
      CHECK (perk IS NULL OR char_length(perk) <= 200);
  END IF;
END $$;

-- Allow invited status
ALTER TABLE public.swaparound_venues DROP CONSTRAINT IF EXISTS swaparound_venues_status_check;
ALTER TABLE public.swaparound_venues
  ADD CONSTRAINT swaparound_venues_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'paused'::text, 'community'::text, 'invited'::text]));

-- Managers can update their venues (not only community status)
DROP POLICY IF EXISTS swaparound_venues_owner_manage ON public.swaparound_venues;
CREATE POLICY swaparound_venues_owner_manage ON public.swaparound_venues
  FOR UPDATE TO authenticated
  USING (
    added_by = (SELECT auth.uid())
    OR manager_user_id = (SELECT auth.uid())
    OR public.swaparound_is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.swaparound_is_admin((SELECT auth.uid()))
    OR manager_user_id = (SELECT auth.uid())
    OR added_by = (SELECT auth.uid())
  );

-- Managers can read their own even if paused
DROP POLICY IF EXISTS swaparound_venues_read ON public.swaparound_venues;
CREATE POLICY swaparound_venues_read ON public.swaparound_venues
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['verified'::text, 'community'::text])
    OR public.swaparound_is_admin((SELECT auth.uid()))
    OR manager_user_id = (SELECT auth.uid())
    OR added_by = (SELECT auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. Venue org invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_venue_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  org_name text NOT NULL,
  contact_email text,
  contact_name text,
  venue_type text NOT NULL DEFAULT 'other',
  neighborhood text,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'claimed'::text, 'revoked'::text, 'expired'::text])),
  venue_id uuid REFERENCES public.swaparound_venues(id) ON DELETE SET NULL,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swaparound_venue_invites_code_idx ON public.swaparound_venue_invites (lower(code));
CREATE INDEX IF NOT EXISTS swaparound_venue_invites_status_idx ON public.swaparound_venue_invites (status);

ALTER TABLE public.swaparound_venue_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swaparound_venue_invites_admin ON public.swaparound_venue_invites;
CREATE POLICY swaparound_venue_invites_admin ON public.swaparound_venue_invites
  FOR ALL TO authenticated
  USING (public.swaparound_is_admin((SELECT auth.uid())))
  WITH CHECK (public.swaparound_is_admin((SELECT auth.uid())));

-- Public can read a single pending invite by code via RPC only (no open SELECT)

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_admin_create_venue_invite(
  p_org_name text,
  p_contact_email text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_venue_type text DEFAULT 'other',
  p_neighborhood text DEFAULT NULL,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_code text;
  v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.swaparound_is_admin(uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF char_length(trim(COALESCE(p_org_name, ''))) < 2 THEN RAISE EXCEPTION 'bad_name'; END IF;

  LOOP
    v_code := 'venue-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.swaparound_venue_invites WHERE lower(code) = lower(v_code));
  END LOOP;

  INSERT INTO public.swaparound_venue_invites (
    code, org_name, contact_email, contact_name, venue_type, neighborhood, message, created_by
  ) VALUES (
    v_code,
    trim(p_org_name),
    nullif(trim(COALESCE(p_contact_email, '')), ''),
    nullif(trim(COALESCE(p_contact_name, '')), ''),
    COALESCE(nullif(trim(p_venue_type), ''), 'other'),
    nullif(trim(COALESCE(p_neighborhood, '')), ''),
    nullif(trim(COALESCE(p_message, '')), ''),
    uid
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_admin_create_venue_invite(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_create_venue_invite(text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_peek_venue_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.swaparound_venue_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.swaparound_venue_invites WHERE lower(code) = lower(trim(p_code));
  IF inv.id IS NULL THEN RETURN NULL; END IF;
  IF inv.status <> 'pending' OR inv.expires_at < now() THEN
    RETURN jsonb_build_object(
      'status', CASE WHEN inv.expires_at < now() AND inv.status = 'pending' THEN 'expired' ELSE inv.status END,
      'org_name', inv.org_name
    );
  END IF;
  RETURN jsonb_build_object(
    'status', 'pending',
    'org_name', inv.org_name,
    'contact_email', inv.contact_email,
    'contact_name', inv.contact_name,
    'venue_type', inv.venue_type,
    'neighborhood', inv.neighborhood,
    'message', inv.message,
    'expires_at', inv.expires_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_peek_venue_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_peek_venue_invite(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_claim_venue_invite(
  p_code text,
  p_name text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_hours_note text DEFAULT NULL,
  p_perk text DEFAULT NULL,
  p_services_discount text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  inv public.swaparound_venue_invites%ROWTYPE;
  vid uuid;
  vname text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO inv FROM public.swaparound_venue_invites WHERE lower(code) = lower(trim(p_code)) FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.swaparound_venue_invites SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- Ensure parent row exists for this user (venue managers can also be parents later)
  IF NOT EXISTS (SELECT 1 FROM public.swaparound_parents WHERE id = uid) THEN
    INSERT INTO public.swaparound_parents (id, display_name, area_label, zip, onboarded_at)
    VALUES (
      uid,
      COALESCE(nullif(trim(COALESCE(p_contact_name, '')), ''), inv.contact_name, split_part(COALESCE(inv.contact_email, 'Venue partner'), '@', 1)),
      inv.neighborhood,
      NULL,
      now()
    );
  END IF;

  vname := COALESCE(nullif(trim(COALESCE(p_name, '')), ''), inv.org_name);

  INSERT INTO public.swaparound_venues (
    name, venue_type, neighborhood, address, status, added_by, manager_user_id,
    contact_name, contact_email, contact_phone, description, hours_note, perk, services_discount
  ) VALUES (
    vname,
    inv.venue_type,
    COALESCE(nullif(trim(COALESCE(p_neighborhood, '')), ''), inv.neighborhood),
    nullif(trim(COALESCE(p_address, '')), ''),
    'verified',
    uid,
    uid,
    COALESCE(nullif(trim(COALESCE(p_contact_name, '')), ''), inv.contact_name),
    COALESCE(nullif(trim(COALESCE(p_contact_email, '')), ''), inv.contact_email),
    nullif(trim(COALESCE(p_contact_phone, '')), ''),
    nullif(trim(COALESCE(p_description, '')), ''),
    nullif(trim(COALESCE(p_hours_note, '')), ''),
    nullif(trim(COALESCE(p_perk, '')), ''),
    nullif(trim(COALESCE(p_services_discount, '')), '')
  ) RETURNING id INTO vid;

  UPDATE public.swaparound_venue_invites
    SET status = 'claimed', venue_id = vid, claimed_by = uid, claimed_at = now()
    WHERE id = inv.id;

  RETURN vid;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_claim_venue_invite(text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_claim_venue_invite(text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_my_managed_venues()
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
    SELECT jsonb_agg(row_to_json(v)::jsonb ORDER BY v.updated_at DESC)
    FROM (
      SELECT * FROM public.swaparound_venues
      WHERE manager_user_id = uid OR added_by = uid
      ORDER BY updated_at DESC
      LIMIT 50
    ) v
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_my_managed_venues() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_my_managed_venues() TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_update_venue(
  p_id uuid,
  p_patch jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v public.swaparound_venues%ROWTYPE;
  is_admin boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  is_admin := public.swaparound_is_admin(uid);
  SELECT * INTO v FROM public.swaparound_venues WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'venue_not_found'; END IF;
  IF NOT is_admin AND v.manager_user_id IS DISTINCT FROM uid AND v.added_by IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'not_manager';
  END IF;

  UPDATE public.swaparound_venues SET
    name = COALESCE(nullif(trim(p_patch->>'name'), ''), name),
    venue_type = COALESCE(nullif(trim(p_patch->>'venue_type'), ''), venue_type),
    neighborhood = CASE WHEN p_patch ? 'neighborhood' THEN nullif(trim(p_patch->>'neighborhood'), '') ELSE neighborhood END,
    address = CASE WHEN p_patch ? 'address' THEN nullif(trim(p_patch->>'address'), '') ELSE address END,
    contact_name = CASE WHEN p_patch ? 'contact_name' THEN nullif(trim(p_patch->>'contact_name'), '') ELSE contact_name END,
    contact_email = CASE WHEN p_patch ? 'contact_email' THEN nullif(trim(p_patch->>'contact_email'), '') ELSE contact_email END,
    contact_phone = CASE WHEN p_patch ? 'contact_phone' THEN nullif(trim(p_patch->>'contact_phone'), '') ELSE contact_phone END,
    description = CASE WHEN p_patch ? 'description' THEN nullif(trim(p_patch->>'description'), '') ELSE description END,
    hours_note = CASE WHEN p_patch ? 'hours_note' THEN nullif(trim(p_patch->>'hours_note'), '') ELSE hours_note END,
    perk = CASE WHEN p_patch ? 'perk' THEN nullif(trim(p_patch->>'perk'), '') ELSE perk END,
    services_discount = CASE WHEN p_patch ? 'services_discount' THEN nullif(trim(p_patch->>'services_discount'), '') ELSE services_discount END,
    status = CASE
      WHEN is_admin AND p_patch ? 'status' AND nullif(trim(p_patch->>'status'), '') IS NOT NULL
        THEN trim(p_patch->>'status')
      ELSE status
    END,
    updated_at = now()
  WHERE id = p_id;

  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_update_venue(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_update_venue(uuid, jsonb) TO authenticated;

-- Admin list venue invites
CREATE OR REPLACE FUNCTION public.swaparound_admin_list_venue_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.swaparound_is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at DESC)
    FROM (
      SELECT * FROM public.swaparound_venue_invites
      ORDER BY created_at DESC LIMIT 100
    ) i
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_admin_list_venue_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_list_venue_invites() TO authenticated;

-- Detail lists for clickable owner cards
CREATE OR REPLACE FUNCTION public.swaparound_admin_card_detail(p_card text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  card text := lower(trim(p_card));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.swaparound_is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_admin'; END IF;

  IF card = 'parents' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT id, display_name, area_label, zip, created_at, onboarded_at
        FROM swaparound_parents ORDER BY created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'kids' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT c.id, c.nickname, c.avatar, c.age_band_code, c.created_at, p.display_name AS parent_name
        FROM swaparound_children c
        JOIN swaparound_parents p ON p.id = c.parent_id
        WHERE c.active
        ORDER BY c.created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'connections' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT c.parent_a, c.parent_b, c.status, c.source, c.created_at,
          pa.display_name AS name_a, pb.display_name AS name_b
        FROM swaparound_connections c
        JOIN swaparound_parents pa ON pa.id = c.parent_a
        JOIN swaparound_parents pb ON pb.id = c.parent_b
        WHERE c.status = 'active'
        ORDER BY c.created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'meetups' OR card = 'upcoming meetups' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.starts_at)
      FROM (
        SELECT s.id, s.title, s.theme, s.starts_at, s.status, s.capacity_kids,
          v.name AS venue_name,
          (SELECT count(*) FROM swaparound_session_rsvps r WHERE r.session_id = s.id) AS rsvps
        FROM swaparound_sessions s
        LEFT JOIN swaparound_venues v ON v.id = s.venue_id
        WHERE s.starts_at > now() - interval '1 day'
        ORDER BY s.starts_at LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'rsvps' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT r.id, r.created_at, r.attendance_mode, r.checked_in_at,
          p.display_name AS parent_name, s.title AS meetup, s.starts_at
        FROM swaparound_session_rsvps r
        JOIN swaparound_parents p ON p.id = r.parent_id
        JOIN swaparound_sessions s ON s.id = r.session_id
        ORDER BY r.created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'check-ins' OR card = 'checkins' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.checked_in_at DESC)
      FROM (
        SELECT r.id, r.checked_in_at, p.display_name AS parent_name, s.title AS meetup
        FROM swaparound_session_rsvps r
        JOIN swaparound_parents p ON p.id = r.parent_id
        JOIN swaparound_sessions s ON s.id = r.session_id
        WHERE r.checked_in_at IS NOT NULL
        ORDER BY r.checked_in_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'venues' OR card = 'verified places' OR card = 'community places' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT id, name, venue_type, neighborhood, status, perk, services_discount, created_at
        FROM swaparound_venues
        ORDER BY created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'circles' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT g.id, g.name, g.created_at, p.display_name AS owner_name,
          (SELECT count(*) FROM swaparound_group_members m WHERE m.group_id = g.id) AS members
        FROM swaparound_groups g
        LEFT JOIN swaparound_parents p ON p.id = g.owner_id
        ORDER BY g.created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'host_parents' OR card = 'parent hosts' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.hosted DESC)
      FROM (
        SELECT p.id, p.display_name, p.area_label, count(*)::int AS hosted
        FROM swaparound_sessions s
        JOIN swaparound_parents p ON p.id = s.host_id
        GROUP BY p.id, p.display_name, p.area_label
        ORDER BY hosted DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSIF card = 'listings' OR card = 'toys' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT l.id, l.toy_name, l.category, l.color, l.status, l.created_at, p.display_name AS parent_name
        FROM swaparound_swap_listings l
        JOIN swaparound_parents p ON p.id = l.parent_id
        ORDER BY l.created_at DESC LIMIT 40
      ) x
    ), '[]'::jsonb);
  ELSE
    RETURN '[]'::jsonb;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_admin_card_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_card_detail(text) TO authenticated;

COMMIT;
