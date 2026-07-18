-- Sandlot growth: viral share tracking, facility tips, admin CRM, growth dashboard.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Share events (viral loop telemetry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.swaparound_parents(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel = ANY (ARRAY[
    'native_share'::text, 'copy_link'::text, 'sms'::text, 'facility_pitch'::text, 'qr'::text, 'other'::text
  ])),
  context text NOT NULL CHECK (context = ANY (ARRAY[
    'invite'::text, 'playdate'::text, 'marketplace'::text, 'facility'::text, 'general'::text
  ])),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swaparound_share_events_parent_idx ON public.swaparound_share_events (parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS swaparound_share_events_day_idx ON public.swaparound_share_events (created_at);

ALTER TABLE public.swaparound_share_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swaparound_share_events_insert ON public.swaparound_share_events;
CREATE POLICY swaparound_share_events_insert ON public.swaparound_share_events
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS swaparound_share_events_admin_read ON public.swaparound_share_events;
CREATE POLICY swaparound_share_events_admin_read ON public.swaparound_share_events
  FOR SELECT TO authenticated
  USING (parent_id = (SELECT auth.uid()) OR public.swaparound_is_admin((SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. Parent facility tips → CRM intake
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_facility_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.swaparound_parents(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  venue_type text NOT NULL DEFAULT 'other',
  neighborhood text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text CHECK (char_length(COALESCE(notes, '')) <= 2000),
  status text NOT NULL DEFAULT 'new'
    CHECK (status = ANY (ARRAY['new'::text, 'reviewing'::text, 'converted'::text, 'declined'::text])),
  converted_venue_id uuid REFERENCES public.swaparound_venues(id) ON DELETE SET NULL,
  converted_lead_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swaparound_facility_tips_status_idx ON public.swaparound_facility_tips (status, created_at DESC);

ALTER TABLE public.swaparound_facility_tips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swaparound_facility_tips_insert ON public.swaparound_facility_tips;
CREATE POLICY swaparound_facility_tips_insert ON public.swaparound_facility_tips
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS swaparound_facility_tips_own_read ON public.swaparound_facility_tips;
CREATE POLICY swaparound_facility_tips_own_read ON public.swaparound_facility_tips
  FOR SELECT TO authenticated
  USING (parent_id = (SELECT auth.uid()) OR public.swaparound_is_admin((SELECT auth.uid())));
DROP POLICY IF EXISTS swaparound_facility_tips_admin_write ON public.swaparound_facility_tips;
CREATE POLICY swaparound_facility_tips_admin_write ON public.swaparound_facility_tips
  FOR UPDATE TO authenticated
  USING (public.swaparound_is_admin((SELECT auth.uid())))
  WITH CHECK (public.swaparound_is_admin((SELECT auth.uid())));

DROP TRIGGER IF EXISTS swaparound_facility_tips_updated ON public.swaparound_facility_tips;
CREATE TRIGGER swaparound_facility_tips_updated
  BEFORE UPDATE ON public.swaparound_facility_tips
  FOR EACH ROW EXECUTE FUNCTION public.swaparound_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Admin CRM leads (facilities, ambassadors, orgs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swaparound_growth_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'facility'
    CHECK (kind = ANY (ARRAY['facility'::text, 'parent_ambassador'::text, 'org'::text, 'school'::text, 'church'::text, 'other'::text])),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  contact_name text,
  email text,
  phone text,
  area text,
  stage text NOT NULL DEFAULT 'lead'
    CHECK (stage = ANY (ARRAY[
      'lead'::text, 'contacted'::text, 'interested'::text, 'partner'::text, 'declined'::text, 'paused'::text
    ])),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])),
  source text NOT NULL DEFAULT 'admin'
    CHECK (source = ANY (ARRAY[
      'admin'::text, 'parent_tip'::text, 'outreach'::text, 'event'::text, 'referral'::text, 'inbound'::text
    ])),
  next_action text,
  next_action_at date,
  notes text CHECK (char_length(COALESCE(notes, '')) <= 4000),
  venue_id uuid REFERENCES public.swaparound_venues(id) ON DELETE SET NULL,
  tip_id uuid REFERENCES public.swaparound_facility_tips(id) ON DELETE SET NULL,
  owner_admin uuid REFERENCES public.swaparound_parents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swaparound_growth_leads_stage_idx ON public.swaparound_growth_leads (stage, priority, next_action_at);
CREATE INDEX IF NOT EXISTS swaparound_growth_leads_area_idx ON public.swaparound_growth_leads (area);

ALTER TABLE public.swaparound_growth_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swaparound_growth_leads_admin ON public.swaparound_growth_leads;
CREATE POLICY swaparound_growth_leads_admin ON public.swaparound_growth_leads
  FOR ALL TO authenticated
  USING (public.swaparound_is_admin((SELECT auth.uid())))
  WITH CHECK (public.swaparound_is_admin((SELECT auth.uid())));

DROP TRIGGER IF EXISTS swaparound_growth_leads_updated ON public.swaparound_growth_leads;
CREATE TRIGGER swaparound_growth_leads_updated
  BEFORE UPDATE ON public.swaparound_growth_leads
  FOR EACH ROW EXECUTE FUNCTION public.swaparound_set_updated_at();

-- FK from tips after leads table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaparound_facility_tips_converted_lead_id_fkey'
  ) THEN
    ALTER TABLE public.swaparound_facility_tips
      ADD CONSTRAINT swaparound_facility_tips_converted_lead_id_fkey
      FOREIGN KEY (converted_lead_id) REFERENCES public.swaparound_growth_leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Parent RPCs: track share + suggest facility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_track_share(
  p_channel text,
  p_context text,
  p_meta jsonb DEFAULT '{}'::jsonb
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
  INSERT INTO public.swaparound_share_events (parent_id, channel, context, meta)
  VALUES (uid, p_channel, p_context, COALESCE(p_meta, '{}'::jsonb))
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_track_share(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_track_share(text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.swaparound_suggest_facility(
  p_name text,
  p_venue_type text DEFAULT 'other',
  p_neighborhood text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
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
  nm text := trim(COALESCE(p_name, ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF char_length(nm) < 2 THEN RAISE EXCEPTION 'bad_name'; END IF;
  INSERT INTO public.swaparound_facility_tips (
    parent_id, name, venue_type, neighborhood, contact_name, contact_email, contact_phone, notes
  ) VALUES (
    uid, nm,
    COALESCE(nullif(trim(p_venue_type), ''), 'other'),
    nullif(trim(COALESCE(p_neighborhood, '')), ''),
    nullif(trim(COALESCE(p_contact_name, '')), ''),
    nullif(trim(COALESCE(p_contact_email, '')), ''),
    nullif(trim(COALESCE(p_contact_phone, '')), ''),
    nullif(trim(COALESCE(p_notes, '')), '')
  ) RETURNING id INTO rid;
  RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_suggest_facility(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_suggest_facility(text, text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin growth dashboard (trends, funnel, opportunities, CRM rollup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swaparound_admin_growth_dashboard()
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

  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'parents', (SELECT count(*) FROM swaparound_parents),
      'parents_7d', (SELECT count(*) FROM swaparound_parents WHERE created_at > now() - interval '7 days'),
      'parents_30d', (SELECT count(*) FROM swaparound_parents WHERE created_at > now() - interval '30 days'),
      'kids', (SELECT count(*) FROM swaparound_children WHERE active),
      'connections', (SELECT count(*) FROM swaparound_connections WHERE status = 'active'),
      'listings_available', (SELECT count(*) FROM swaparound_swap_listings WHERE status = 'available'),
      'listings_7d', (SELECT count(*) FROM swaparound_swap_listings WHERE created_at > now() - interval '7 days'),
      'meetups_upcoming', (SELECT count(*) FROM swaparound_sessions WHERE starts_at > now() AND status IN ('published','full','scheduled','open')),
      'rsvps_7d', (SELECT count(*) FROM swaparound_session_rsvps WHERE created_at > now() - interval '7 days'),
      'shares_7d', (SELECT count(*) FROM swaparound_share_events WHERE created_at > now() - interval '7 days'),
      'family_invites_active', (SELECT count(*) FROM swaparound_invite_codes WHERE kind = 'family' AND active),
      'invite_redemptions', (SELECT coalesce(sum(used_count),0) FROM swaparound_invite_codes WHERE kind = 'family'),
      'venues_verified', (SELECT count(*) FROM swaparound_venues WHERE status = 'verified'),
      'venues_community', (SELECT count(*) FROM swaparound_venues WHERE status = 'community'),
      'tips_new', (SELECT count(*) FROM swaparound_facility_tips WHERE status = 'new'),
      'crm_open', (SELECT count(*) FROM swaparound_growth_leads WHERE stage IN ('lead','contacted','interested')),
      'crm_partners', (SELECT count(*) FROM swaparound_growth_leads WHERE stage = 'partner')
    ),
    'funnel', jsonb_build_object(
      'parents', (SELECT count(*) FROM swaparound_parents),
      'with_kids', (SELECT count(DISTINCT parent_id) FROM swaparound_children WHERE active),
      'with_listing', (SELECT count(DISTINCT parent_id) FROM swaparound_swap_listings WHERE status IN ('available','swap_planned','swapped')),
      'with_rsvp', (SELECT count(DISTINCT parent_id) FROM swaparound_session_rsvps),
      'with_connection', (SELECT count(DISTINCT p.id) FROM swaparound_parents p
        WHERE EXISTS (SELECT 1 FROM swaparound_connections c WHERE c.status='active' AND (c.parent_a=p.id OR c.parent_b=p.id))),
      'with_share', (SELECT count(DISTINCT parent_id) FROM swaparound_share_events)
    ),
    'series_30d', (
      SELECT COALESCE(jsonb_agg(row_to_json(d)::jsonb ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT
          gs::date AS day,
          (SELECT count(*) FROM swaparound_parents p WHERE p.created_at::date = gs::date) AS parents,
          (SELECT count(*) FROM swaparound_session_rsvps r WHERE r.created_at::date = gs::date) AS rsvps,
          (SELECT count(*) FROM swaparound_swap_listings l WHERE l.created_at::date = gs::date) AS listings,
          (SELECT count(*) FROM swaparound_connections c WHERE c.status='active' AND c.created_at::date = gs::date) AS connections,
          (SELECT count(*) FROM swaparound_share_events s WHERE s.created_at::date = gs::date) AS shares
        FROM generate_series((now() - interval '29 days')::date, now()::date, '1 day') gs
      ) d
    ),
    'areas', (
      SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.parents DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(nullif(trim(area_label), ''), nullif(trim(zip), ''), 'Unknown') AS area,
          count(*) AS parents,
          count(*) FILTER (WHERE created_at > now() - interval '30 days') AS parents_30d
        FROM swaparound_parents
        GROUP BY 1
        ORDER BY parents DESC
        LIMIT 15
      ) a
    ),
    'top_inviters', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      FROM (
        SELECT
          p.id AS parent_id,
          p.display_name,
          p.area_label,
          i.code,
          i.used_count,
          (SELECT count(*) FROM swaparound_share_events se WHERE se.parent_id = p.id) AS shares
        FROM swaparound_invite_codes i
        JOIN swaparound_parents p ON p.id = i.owner_parent_id
        WHERE i.kind = 'family' AND i.used_count > 0
        ORDER BY i.used_count DESC, shares DESC
        LIMIT 12
      ) t
    ),
    'opportunities', jsonb_build_object(
      'unconnected_parents', (SELECT count(*) FROM swaparound_parents p
        WHERE NOT EXISTS (
          SELECT 1 FROM swaparound_connections c WHERE c.status='active' AND (c.parent_a=p.id OR c.parent_b=p.id)
        )),
      'parents_no_kids', (SELECT count(*) FROM swaparound_parents p
        WHERE NOT EXISTS (SELECT 1 FROM swaparound_children c WHERE c.parent_id=p.id AND c.active)),
      'parents_no_listing', (SELECT count(*) FROM swaparound_parents p
        WHERE EXISTS (SELECT 1 FROM swaparound_children c WHERE c.parent_id=p.id AND c.active)
          AND NOT EXISTS (SELECT 1 FROM swaparound_swap_listings l WHERE l.parent_id=p.id)),
      'community_venues', (
        SELECT COALESCE(jsonb_agg(row_to_json(v)::jsonb ORDER BY v.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT id, name, neighborhood, venue_type, created_at
          FROM swaparound_venues WHERE status = 'community'
          ORDER BY created_at DESC LIMIT 12
        ) v
      ),
      'empty_meetups', (
        SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb), '[]'::jsonb)
        FROM (
          SELECT s.id, s.title, s.theme, s.starts_at,
            (SELECT count(*) FROM swaparound_session_rsvps r WHERE r.session_id = s.id) AS rsvp_count
          FROM swaparound_sessions s
          WHERE s.starts_at > now()
            AND s.status IN ('published','full','scheduled','open')
            AND NOT EXISTS (SELECT 1 FROM swaparound_session_rsvps r WHERE r.session_id = s.id)
          ORDER BY s.starts_at
          LIMIT 12
        ) m
      ),
      'new_tips', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT ft.id, ft.name, ft.venue_type, ft.neighborhood, ft.contact_name, ft.contact_email,
                 ft.contact_phone, ft.notes, ft.status, ft.created_at,
                 p.display_name AS parent_name, p.area_label AS parent_area
          FROM swaparound_facility_tips ft
          JOIN swaparound_parents p ON p.id = ft.parent_id
          WHERE ft.status IN ('new','reviewing')
          ORDER BY ft.created_at DESC
          LIMIT 20
        ) t
      ),
      'crm_due', (
        SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
        FROM (
          SELECT id, kind, name, stage, priority, area, next_action, next_action_at, contact_name, email, phone
          FROM swaparound_growth_leads
          WHERE stage IN ('lead','contacted','interested')
            AND (next_action_at IS NULL OR next_action_at <= (now() + interval '7 days')::date)
          ORDER BY
            CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
            next_action_at NULLS FIRST
          LIMIT 20
        ) c
      )
    ),
    'crm_by_stage', (
      SELECT COALESCE(jsonb_object_agg(stage, cnt), '{}'::jsonb)
      FROM (
        SELECT stage, count(*)::int AS cnt FROM swaparound_growth_leads GROUP BY stage
      ) s
    ),
    'viral', jsonb_build_object(
      'shares_7d', (SELECT count(*) FROM swaparound_share_events WHERE created_at > now() - interval '7 days'),
      'shares_30d', (SELECT count(*) FROM swaparound_share_events WHERE created_at > now() - interval '30 days'),
      'invite_uses_total', (SELECT coalesce(sum(used_count),0) FROM swaparound_invite_codes WHERE kind='family'),
      'active_inviters', (SELECT count(*) FROM swaparound_invite_codes WHERE kind='family' AND used_count > 0),
      'share_by_channel', (
        SELECT COALESCE(jsonb_object_agg(channel, cnt), '{}'::jsonb)
        FROM (
          SELECT channel, count(*)::int AS cnt FROM swaparound_share_events
          WHERE created_at > now() - interval '30 days' GROUP BY channel
        ) c
      )
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_admin_growth_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_growth_dashboard() TO authenticated;

-- Convert a facility tip into a CRM lead (and optionally mark reviewing)
CREATE OR REPLACE FUNCTION public.swaparound_admin_tip_to_lead(p_tip_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  t public.swaparound_facility_tips%ROWTYPE;
  lid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.swaparound_is_admin(uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT * INTO t FROM public.swaparound_facility_tips WHERE id = p_tip_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'tip_not_found'; END IF;

  INSERT INTO public.swaparound_growth_leads (
    kind, name, contact_name, email, phone, area, stage, priority, source, notes, tip_id, owner_admin, next_action
  ) VALUES (
    'facility',
    t.name,
    t.contact_name,
    t.contact_email,
    t.contact_phone,
    t.neighborhood,
    'lead',
    'high',
    'parent_tip',
    COALESCE(nullif(trim(COALESCE(p_notes,'')), ''), t.notes),
    t.id,
    uid,
    'Call / email facility about hosting Sandlot playdates'
  ) RETURNING id INTO lid;

  UPDATE public.swaparound_facility_tips
    SET status = 'converted', converted_lead_id = lid, updated_at = now()
    WHERE id = t.id;

  RETURN lid;
END;
$$;
REVOKE ALL ON FUNCTION public.swaparound_admin_tip_to_lead(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swaparound_admin_tip_to_lead(uuid, text) TO authenticated;

COMMIT;
