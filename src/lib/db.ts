// Sandlot data layer — fidget trading, other toys, and playdates.
// All calls run on the browser anon client
// under RLS, so a parent can only ever read/write their own family + sessions
// they attend. Types mirror the swaparound_* schema on the shared LPL Supabase.

import { getSupabase } from "@/lib/supabase";

export const CONSENT_VERSION = "2026-07-11.v1";

export type AgeBand = {
  code: string;
  label: string;
  sort_order: number;
  agency_level: "none" | "wishlist" | "propose" | "full";
  supervision: "parent_present" | "caregiver_present" | "drop_off_eligible";
  small_parts_allowed: boolean;
};

export type Parent = {
  id: string;
  display_name: string;
  area_label: string | null;
  zip: string | null;
  onboarded_at: string | null;
};

export type Child = {
  id: string;
  parent_id: string;
  nickname: string;
  avatar: string | null;
  age_band_code: string;
  interested_bands: string[];
  band_confirmed_at: string;
  active: boolean;
};

export type MeetupMode = "event" | "playground" | "group" | "one_on_one";

export const MEETUP_MODES: { code: MeetupMode; label: string; emoji: string; blurb: string }[] = [
  { code: "event", label: "Facility event", emoji: "🏟️", blurb: "At a verified place with other families" },
  { code: "playground", label: "Playground / park", emoji: "🌳", blurb: "Open outdoor playdate" },
  { code: "group", label: "Your circle", emoji: "💚", blurb: "Invite a whole circle at once" },
  { code: "one_on_one", label: "One-on-one", emoji: "🤝", blurb: "Just your family + one other" },
];

export type SessionRow = {
  id: string;
  venue_id: string;
  host_id: string | null;
  title: string;
  theme: string | null;
  target_bands: string[];
  starts_at: string;
  ends_at: string;
  capacity_kids: number;
  ratio_kids_per_adult: number;
  cost_note: string | null;
  status: string;
  meetup_mode?: MeetupMode | string;
  swaparound_venues?: {
    name: string;
    neighborhood: string | null;
    venue_type: string;
    perk: string | null;
    services_discount?: string | null;
    status: string;
  } | null;
};

export type Listing = {
  id: string;
  session_id: string | null;
  child_id: string;
  parent_id: string;
  toy_name: string;
  category: string;
  condition: string;
  wants: string | null;
  emoji: string | null;
  status: string;
  area_label?: string | null;
  color?: string | null;
  toy_type?: string | null;
  photo_url?: string | null;
  photo_path?: string | null;
  /** Extra gallery URLs (cover is also photo_url). */
  photo_urls?: string[] | null;
  photo_status?: "none" | "ok" | "under_review" | "removed" | string;
  created_at?: string;
};

export type MarketListing = Listing & {
  seller_name: string;
  seller_area: string | null;
  kid_nickname: string;
  kid_avatar: string | null;
  is_favorite?: boolean;
  area_match?: number;
};

export type MyListing = Listing & {
  kid_nickname: string;
  kid_avatar: string | null;
};

export type MarketFilters = {
  colors: string[];
  types: string[];
  categories: string[];
};

export type TradeRow = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  message: string | null;
  playdate_session_id: string | null;
  created_at: string;
  updated_at: string;
  from_parent_id: string;
  to_parent_id: string;
  direction: "outgoing" | "incoming";
  from_name: string;
  to_name: string;
  target_id: string;
  target_name: string;
  target_emoji: string | null;
  target_category: string;
  offer_id: string;
  offer_name: string;
  offer_emoji: string | null;
  offer_category: string;
};

export const TOY_CONDITIONS: { code: string; label: string }[] = [
  { code: "like_new", label: "Like new" },
  { code: "great", label: "Great" },
  { code: "loved", label: "Loved" },
];

export const KID_AVATARS = ["🦊", "🐢", "🦄", "🐼", "🐶", "🐱", "🦁", "🐨", "🐸", "🐹", "🐵", "🐧"];

export const TOY_CATEGORIES: { code: string; label: string }[] = [
  { code: "fidget", label: "🌀 Fidget" },
  { code: "plush", label: "🧸 Plush" },
  { code: "toy", label: "🚙 Toy" },
  { code: "book", label: "📚 Book" },
  { code: "building", label: "🧱 Building" },
  { code: "game", label: "🎲 Game" },
  { code: "outdoor", label: "🪁 Outdoor" },
];

export const TOY_EMOJI = ["🧸", "🫧", "🌀", "🐙", "🧲", "🪀", "🚙", "🦖", "🐳", "🃏", "🌈", "🎨", "⚽", "🪁", "🧱", "🎯", "📚", "🎲"];

/** Common colors for browse filters (free text also allowed). */
export const TOY_COLORS = [
  "red", "orange", "yellow", "green", "blue", "purple", "pink",
  "black", "white", "gray", "brown", "multicolor", "clear",
];

/** Suggested types by category (users can type their own). */
export const TOY_TYPES_BY_CATEGORY: Record<string, string[]> = {
  fidget: ["pop-it", "spinner", "infinity cube", "squishy", "marble mesh", "clicker", "snake cube", "other fidget"],
  plush: ["animal", "character", "pillow pet", "keychain plush", "other plush"],
  toy: ["car", "figure", "doll", "robot", "other toy"],
  book: ["picture book", "chapter book", "comic", "other book"],
  building: ["lego/blocks", "magnetic tiles", "other building"],
  game: ["card game", "board game", "puzzle", "other game"],
  outdoor: ["ball", "bubbles", "sidewalk chalk", "other outdoor"],
};

export const PHOTO_REPORT_REASONS = [
  "Photo shows a child or face (not allowed)",
  "Photo is sexual, nude, or sexually suggestive",
  "Photo is violent, graphic, or scary",
  "Photo is not a toy / spam / scam",
  "Photo is otherwise inappropriate for a kids app",
];

function db() {
  const s = getSupabase();
  if (!s) throw new Error("Supabase is not configured.");
  return s;
}

export async function fetchAgeBands(): Promise<AgeBand[]> {
  const { data, error } = await db().from("swaparound_age_bands").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data || []) as AgeBand[];
}

export async function fetchParent(uid: string): Promise<Parent | null> {
  const { data, error } = await db().from("swaparound_parents").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  return (data as Parent) || null;
}

export async function onboardParent(display_name: string, zip: string, invite: string): Promise<void> {
  // Open signup: an invite code is OPTIONAL. A valid personal code connects you
  // to the family who shared it; a missing/unknown code no longer blocks you.
  // Resilient to a transient network hiccup: one silent retry before surfacing a friendly error.
  const call = () => db().rpc("swaparound_onboard", { p_name: display_name, p_area: zip, p_invite: invite });
  let error: { message?: string; details?: string; hint?: string } | null = null;
  try {
    ({ error } = await call());
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    try { ({ error } = await call()); }
    catch { throw new Error("We couldn't reach the server — check your connection and tap Continue again."); }
  }
  if (error) {
    const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
    if (/name_required/.test(msg)) throw new Error("Please enter your name.");
    if (/fetch|network|load failed/i.test(msg)) throw new Error("We couldn't reach the server — check your connection and tap Continue again.");
    throw new Error(error.message || "Couldn't save your profile.");
  }
}

export async function fetchChildren(uid: string): Promise<Child[]> {
  const { data, error } = await db().from("swaparound_children").select("*").eq("parent_id", uid).eq("active", true).order("created_at");
  if (error) throw error;
  return (data || []) as Child[];
}

export async function addChild(uid: string, nickname: string, ageBand: string, avatar: string, interestedBands: string[] = []): Promise<Child> {
  const { data, error } = await db()
    .from("swaparound_children")
    .insert({ parent_id: uid, nickname, age_band_code: ageBand, avatar, interested_bands: interestedBands })
    .select("*")
    .single();
  if (error) throw error;
  // COPPA consent ledger — one record per child added.
  await db().from("swaparound_consent_records").insert({
    parent_id: uid,
    child_id: (data as Child).id,
    consent_version: CONSENT_VERSION,
    method: "email_plus",
  });
  return data as Child;
}

// Update which age groups a child is happy to play with (versatile kids).
export async function updateChildInterests(childId: string, interestedBands: string[]): Promise<void> {
  const { error } = await db().from("swaparound_children").update({ interested_bands: interestedBands }).eq("id", childId);
  if (error) throw error;
}

export async function fetchSessions(): Promise<SessionRow[]> {
  const { data, error } = await db()
    .from("swaparound_sessions")
    .select("*, swaparound_venues(name,neighborhood,venue_type,perk,services_discount,status)")
    .in("status", ["published", "full"])
    .order("starts_at");
  if (error) throw error;
  return (data || []) as SessionRow[];
}

// ---- parent hosting: parents create meetups at verified OR community venues ----
export type HostVenue = { id: string; name: string; neighborhood: string | null; status: string };

export async function fetchHostVenues(): Promise<HostVenue[]> {
  const { data, error } = await db()
    .from("swaparound_venues")
    .select("id,name,neighborhood,status")
    .in("status", ["verified", "community"])
    .order("name");
  if (error) throw error;
  return (data || []) as HostVenue[];
}

// A parent adds a public, supervised facility (status 'community'). It's usable
// for hosting immediately, labeled distinctly from admin-verified places, and an
// admin can pause it.
export async function addFacility(uid: string, v: { name: string; venue_type: string; neighborhood: string; address: string; perk: string }): Promise<HostVenue> {
  const { data, error } = await db()
    .from("swaparound_venues")
    .insert({ name: v.name.trim(), venue_type: v.venue_type, neighborhood: v.neighborhood.trim() || null, address: v.address.trim() || null, perk: v.perk.trim() || null, status: "community", added_by: uid })
    .select("id,name,neighborhood,status")
    .single();
  if (error) {
    if (/venue_rate_limit|venue_total_limit/.test(error.message || "")) throw new Error("You've added several places recently — please try again later or ask the owner to verify one.");
    throw error;
  }
  return data as HostVenue;
}

export async function hostCreateSession(uid: string, s: {
  venue_id: string; theme: string; starts_at: string; ends_at: string; target_bands: string[]; capacity_kids: number; cost_note: string; groupIds?: string[];
  meetupMode?: MeetupMode;
}): Promise<void> {
  const { data, error } = await db().from("swaparound_sessions").insert({
    venue_id: s.venue_id, host_id: uid, title: s.theme || "Meetup", theme: s.theme || null,
    target_bands: s.target_bands, starts_at: s.starts_at, ends_at: s.ends_at,
    capacity_kids: s.capacity_kids, cost_note: s.cost_note || null, status: "published",
    meetup_mode: s.meetupMode || "event",
  }).select("id").single();
  if (error) {
    if (/meetup_rate_limit/.test(error.message || "")) throw new Error("You've posted several meetups today — please try again tomorrow.");
    throw error;
  }
  // Invite selected circles (soft targeting → "invited" highlight for members).
  const sessionId = (data as { id: string }).id;
  if (s.groupIds && s.groupIds.length) {
    const rows = s.groupIds.map((group_id) => ({ session_id: sessionId, group_id }));
    const { error: gErr } = await db().from("swaparound_session_groups").insert(rows);
    if (gErr) throw gErr;
  }
}

export type RsvpInfo = {
  rsvp_id: string; child_ids: string[]; attendance_mode: string;
  ticket_code: string | null; checked_in_at: string | null;
} | null;

export async function fetchMyRsvp(sessionId: string, uid: string): Promise<RsvpInfo> {
  const { data, error } = await db()
    .from("swaparound_session_rsvps")
    .select("id, attendance_mode, ticket_code, checked_in_at, swaparound_rsvp_children(child_id)")
    .eq("session_id", sessionId)
    .eq("parent_id", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    id: string; attendance_mode: string; ticket_code: string | null; checked_in_at: string | null;
    swaparound_rsvp_children?: { child_id: string }[];
  };
  return {
    rsvp_id: d.id,
    child_ids: (d.swaparound_rsvp_children || []).map((r) => r.child_id),
    attendance_mode: d.attendance_mode,
    ticket_code: d.ticket_code,
    checked_in_at: d.checked_in_at,
  };
}

export async function saveRsvp(sessionId: string, uid: string, childIds: string[], mode: string): Promise<void> {
  const client = db();
  const { data, error } = await client
    .from("swaparound_session_rsvps")
    .upsert({ session_id: sessionId, parent_id: uid, attendance_mode: mode }, { onConflict: "session_id,parent_id" })
    .select("id")
    .single();
  if (error) throw error;
  const rsvpId = (data as { id: string }).id;
  // reset the kid roster for this RSVP, then set the chosen kids
  await client.from("swaparound_rsvp_children").delete().eq("rsvp_id", rsvpId);
  if (childIds.length) {
    const rows = childIds.map((child_id) => ({ rsvp_id: rsvpId, child_id }));
    const { error: e2 } = await client.from("swaparound_rsvp_children").insert(rows);
    if (e2) throw e2;
  }
}

export async function fetchListings(sessionId: string): Promise<Listing[]> {
  const { data, error } = await db().from("swaparound_swap_listings").select("*").eq("session_id", sessionId).order("created_at");
  if (error) throw error;
  return (data || []) as Listing[];
}

/* ==================== CONNECTIONS · ROSTER · TICKETS ==================== */
// Tiered visibility: strangers see aggregate COUNTS only; connected families
// (personal invite link, or an accepted request between co-attendees) see who's
// going + which kids. All enforced server-side in SECURITY DEFINER RPCs.

export type SessionCounts = { families: number; kids: number; bands: Record<string, number> };
export type RosterFamily = {
  parent_id: string; name: string; area: string | null; connected: boolean;
  kids: { nickname: string; avatar: string | null; band: string }[];
};
export type Attendee = { parent_id: string; name: string; state: "none" | "outgoing" | "incoming" | "connected" };
export type FamilyLink = { parent_id: string; name: string; status: "active" | "pending"; direction: "connected" | "incoming" | "outgoing" };

export async function sessionCounts(sessionId: string): Promise<SessionCounts> {
  const { data, error } = await db().rpc("swaparound_session_counts", { p_session: sessionId });
  if (error) throw error;
  return (data as SessionCounts) || { families: 0, kids: 0, bands: {} };
}

export async function sessionAttendees(sessionId: string): Promise<Attendee[]> {
  const { data, error } = await db().rpc("swaparound_session_attendees", { p_session: sessionId });
  if (error) throw error;
  return (data as Attendee[]) || [];
}

export async function sessionRoster(sessionId: string): Promise<RosterFamily[]> {
  const { data, error } = await db().rpc("swaparound_session_roster", { p_session: sessionId });
  if (error) throw error;
  return (data as RosterFamily[]) || [];
}

export async function ensureMyCode(): Promise<string> {
  const { data, error } = await db().rpc("swaparound_ensure_my_code");
  if (error) throw error;
  return data as string;
}

export async function redeemCode(code: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_redeem_code", { p_code: code.trim() });
  if (error) {
    const m = error.message || "";
    if (/invalid_code|bad_code/.test(m)) throw new Error("That family code isn't valid or is full.");
    if (/self/.test(m)) throw new Error("That's your own code 🙂");
    throw new Error("Couldn't use that code.");
  }
  return data as string;
}

export async function requestConnection(other: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_request_connection", { p_other: other });
  if (error) {
    const m = error.message || "";
    if (/no_shared_meetup/.test(m)) throw new Error("You can connect with a family once you're both going to the same meetup.");
    if (/blocked/.test(m)) throw new Error("You can't connect with a family you've blocked.");
    throw new Error("Couldn't send the request.");
  }
  return data as string;
}

export async function acceptConnection(other: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_accept_connection", { p_other: other });
  if (error) throw new Error("Couldn't accept the request.");
  return data as string;
}

export async function dismissConnection(other: string): Promise<void> {
  const { error } = await db().rpc("swaparound_dismiss_connection", { p_other: other });
  if (error) throw error;
}

export async function myFamilies(): Promise<FamilyLink[]> {
  const { data, error } = await db().rpc("swaparound_my_families");
  if (error) throw error;
  return (data as FamilyLink[]) || [];
}

export type CheckinResult = {
  ok: boolean; family: string; mode: string;
  kids: { nickname: string; band: string; avatar: string | null }[];
  already: boolean; checked_in_at: string;
};

export async function checkinTicket(sessionId: string, ticket: string): Promise<CheckinResult> {
  const { data, error } = await db().rpc("swaparound_checkin", { p_session: sessionId, p_ticket: ticket.trim() });
  if (error) {
    const m = error.message || "";
    if (/ticket_not_found/.test(m)) throw new Error("No ticket like that for this meetup. Double-check the code.");
    if (/not_host/.test(m)) throw new Error("Only the meetup's host can check families in.");
    throw new Error("Couldn't check that ticket.");
  }
  return data as CheckinResult;
}

/* ============================== CIRCLES ============================== */
// A circle is a named group of the families you're connected to, so you can
// invite a whole circle (or several) to a meetup at once.

export type Circle = { id: string; name: string; members: { parent_id: string; name: string }[] };

export async function myCircles(): Promise<Circle[]> {
  const { data, error } = await db().rpc("swaparound_my_groups");
  if (error) throw error;
  return (data as Circle[]) || [];
}

export async function createCircle(uid: string, name: string): Promise<string> {
  const { data, error } = await db()
    .from("swaparound_groups")
    .insert({ owner_id: uid, name: name.trim() })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function addToCircle(groupId: string, parentId: string): Promise<void> {
  const { error } = await db().from("swaparound_group_members").insert({ group_id: groupId, parent_id: parentId });
  if (error) throw error;
}

export async function removeFromCircle(groupId: string, parentId: string): Promise<void> {
  const { error } = await db().from("swaparound_group_members").delete().eq("group_id", groupId).eq("parent_id", parentId);
  if (error) throw error;
}

export async function deleteCircle(groupId: string): Promise<void> {
  const { error } = await db().from("swaparound_groups").delete().eq("id", groupId);
  if (error) throw error;
}

export async function myInvitedSessionIds(): Promise<string[]> {
  const { data, error } = await db().rpc("swaparound_my_invited_session_ids");
  if (error) throw error;
  // rpc returns setof uuid → array of strings
  return (data as string[]) || [];
}

/* ============================== ADMIN ============================== */
export type InviteCode = { code: string; label: string | null; active: boolean; max_uses: number | null; used_count: number; created_at: string };
export type AdminVenue = {
  id: string;
  name: string;
  venue_type: string;
  neighborhood: string | null;
  address: string | null;
  perk: string | null;
  services_discount?: string | null;
  status: string;
  added_by: string | null;
  created_at: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  description?: string | null;
  hours_note?: string | null;
  manager_user_id?: string | null;
  updated_at?: string;
};

export type VenueInvite = {
  id: string;
  code: string;
  org_name: string;
  contact_email: string | null;
  contact_name: string | null;
  venue_type: string;
  neighborhood: string | null;
  message: string | null;
  status: string;
  venue_id: string | null;
  expires_at: string;
  created_at: string;
};
export type AdminSession = SessionRow & { rsvp_count?: number };

export const VENUE_TYPES: { code: string; label: string }[] = [
  { code: "church_hall", label: "Church hall" }, { code: "roller_rink", label: "Roller rink" },
  { code: "gym", label: "Gym" }, { code: "library", label: "Library" }, { code: "community_hall", label: "Community hall" },
  { code: "ymca", label: "YMCA" }, { code: "rec_center", label: "Rec center" }, { code: "park_pavilion", label: "Park pavilion" },
  { code: "trampoline_park", label: "Trampoline park" }, { code: "other", label: "Other" },
];

export async function isAdmin(uid: string): Promise<boolean> {
  const { data } = await db().from("swaparound_admin_users").select("role").eq("user_id", uid).maybeSingle();
  return !!data;
}

export async function adminOverview(): Promise<{ parents: number; kids: number; rsvps: number; venues: number; sessions: number }> {
  const c = async (t: string) => (await db().from(t).select("*", { count: "exact", head: true })).count || 0;
  const [parents, kids, rsvps, venues, sessions] = await Promise.all([
    c("swaparound_parents"), c("swaparound_children"), c("swaparound_session_rsvps"), c("swaparound_venues"), c("swaparound_sessions"),
  ]);
  return { parents, kids, rsvps, venues, sessions };
}

export type AdminInsights = {
  totals: { parents: number; kids: number; meetups_published: number; meetups_upcoming: number; rsvps: number; checkins: number; venues_verified: number; venues_community: number; connections: number; circles: number; host_parents: number };
  growth: { parents_7d: number; parents_30d: number; kids_7d: number; rsvps_7d: number; connections_7d: number };
  engagement: { parents_with_connection: number; avg_rsvps_per_meetup: number };
  safety: { open_reports: number; blocks: number };
  attention: {
    empty_upcoming_meetups: { id: string; title: string; starts_at: string }[];
    community_venues: { id: string; name: string; neighborhood: string | null; created_at: string }[];
    unconnected_parents: number;
    meetups_next_3d: { id: string; title: string; starts_at: string }[];
  };
};

export async function adminInsights(): Promise<AdminInsights> {
  const { data, error } = await db().rpc("swaparound_admin_insights");
  if (error) throw error;
  return data as AdminInsights;
}

/* ==================== GROWTH · VIRAL · CRM ==================== */

export async function trackShare(channel: "native_share" | "copy_link" | "sms" | "facility_pitch" | "qr" | "other", context: "invite" | "playdate" | "marketplace" | "facility" | "general", meta?: Record<string, unknown>): Promise<void> {
  const { error } = await db().rpc("swaparound_track_share", {
    p_channel: channel,
    p_context: context,
    p_meta: meta || {},
  });
  if (error) throw error;
}

export async function suggestFacility(input: {
  name: string;
  venueType?: string;
  neighborhood?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await db().rpc("swaparound_suggest_facility", {
    p_name: input.name,
    p_venue_type: input.venueType || "other",
    p_neighborhood: input.neighborhood || null,
    p_contact_name: input.contactName || null,
    p_contact_email: input.contactEmail || null,
    p_contact_phone: input.contactPhone || null,
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return data as string;
}

export type GrowthDashboard = {
  kpis: {
    parents: number; parents_7d: number; parents_30d: number; kids: number;
    connections: number; listings_available: number; listings_7d: number;
    meetups_upcoming: number; rsvps_7d: number; shares_7d: number;
    family_invites_active: number; invite_redemptions: number;
    venues_verified: number; venues_community: number;
    tips_new: number; crm_open: number; crm_partners: number;
  };
  funnel: {
    parents: number; with_kids: number; with_listing: number;
    with_rsvp: number; with_connection: number; with_share: number;
  };
  series_30d: { day: string; parents: number; rsvps: number; listings: number; connections: number; shares: number }[];
  areas: { area: string; parents: number; parents_30d: number }[];
  top_inviters: { parent_id: string; display_name: string; area_label: string | null; code: string; used_count: number; shares: number }[];
  opportunities: {
    unconnected_parents: number;
    parents_no_kids: number;
    parents_no_listing: number;
    community_venues: { id: string; name: string; neighborhood: string | null; venue_type: string; created_at: string }[];
    empty_meetups: { id: string; title: string; theme: string | null; starts_at: string; rsvp_count: number }[];
    new_tips: {
      id: string; name: string; venue_type: string; neighborhood: string | null;
      contact_name: string | null; contact_email: string | null; contact_phone: string | null;
      notes: string | null; status: string; created_at: string; parent_name: string; parent_area: string | null;
    }[];
    crm_due: GrowthLead[];
  };
  crm_by_stage: Record<string, number>;
  viral: {
    shares_7d: number; shares_30d: number; invite_uses_total: number;
    active_inviters: number; share_by_channel: Record<string, number>;
  };
};

export type GrowthLead = {
  id: string;
  kind: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  stage: string;
  priority: string;
  source: string;
  next_action: string | null;
  next_action_at: string | null;
  notes: string | null;
  venue_id?: string | null;
  tip_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function adminGrowthDashboard(): Promise<GrowthDashboard> {
  const { data, error } = await db().rpc("swaparound_admin_growth_dashboard");
  if (error) throw error;
  return data as GrowthDashboard;
}

export async function adminFetchLeads(): Promise<GrowthLead[]> {
  const { data, error } = await db().from("swaparound_growth_leads")
    .select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as GrowthLead[];
}

export async function adminUpsertLead(lead: Partial<GrowthLead> & { name: string; kind?: string; stage?: string }): Promise<void> {
  const row = {
    kind: lead.kind || "facility",
    name: lead.name.trim(),
    contact_name: lead.contact_name?.trim() || null,
    email: lead.email?.trim() || null,
    phone: lead.phone?.trim() || null,
    area: lead.area?.trim() || null,
    stage: lead.stage || "lead",
    priority: lead.priority || "normal",
    source: lead.source || "admin",
    next_action: lead.next_action?.trim() || null,
    next_action_at: lead.next_action_at || null,
    notes: lead.notes?.trim() || null,
    venue_id: lead.venue_id || null,
  };
  if (lead.id) {
    const { error } = await db().from("swaparound_growth_leads").update(row).eq("id", lead.id);
    if (error) throw error;
  } else {
    const { error } = await db().from("swaparound_growth_leads").insert(row);
    if (error) throw error;
  }
}

export async function adminSetLeadStage(id: string, stage: string, nextAction?: string): Promise<void> {
  const patch: Record<string, unknown> = { stage };
  if (nextAction !== undefined) patch.next_action = nextAction.trim() || null;
  const { error } = await db().from("swaparound_growth_leads").update(patch).eq("id", id);
  if (error) throw error;
}

export async function adminTipToLead(tipId: string, notes?: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_admin_tip_to_lead", {
    p_tip_id: tipId,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function adminSetTipStatus(id: string, status: "new" | "reviewing" | "converted" | "declined"): Promise<void> {
  const { error } = await db().from("swaparound_facility_tips").update({ status }).eq("id", id);
  if (error) throw error;
}

// Facility promo: the perk shown to families on meetups at this venue.
export async function adminUpdateVenuePerk(id: string, perk: string): Promise<void> {
  const { error } = await db().from("swaparound_venues").update({ perk: perk.trim() || null }).eq("id", id);
  if (error) throw error;
}

export async function adminFetchVenues(): Promise<AdminVenue[]> {
  const { data, error } = await db().from("swaparound_venues").select("*").order("created_at", { ascending: false });
  if (error) throw error; return (data || []) as AdminVenue[];
}
export async function adminAddVenue(v: {
  name: string; venue_type: string; neighborhood: string; perk: string;
  address?: string; services_discount?: string; contact_name?: string; contact_email?: string;
  contact_phone?: string; description?: string; hours_note?: string;
}): Promise<void> {
  const { error } = await db().from("swaparound_venues").insert({
    name: v.name,
    venue_type: v.venue_type,
    neighborhood: v.neighborhood || null,
    address: v.address || null,
    perk: v.perk || null,
    services_discount: v.services_discount || null,
    contact_name: v.contact_name || null,
    contact_email: v.contact_email || null,
    contact_phone: v.contact_phone || null,
    description: v.description || null,
    hours_note: v.hours_note || null,
    status: "verified",
  });
  if (error) throw error;
}
export async function adminSetVenueStatus(id: string, status: string): Promise<void> {
  const { error } = await db().from("swaparound_venues").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updateVenue(id: string, patch: Record<string, string | null | undefined>): Promise<void> {
  const { error } = await db().rpc("swaparound_update_venue", {
    p_id: id,
    p_patch: patch,
  });
  if (error) throw error;
}

export async function adminCreateVenueInvite(input: {
  orgName: string;
  contactEmail?: string;
  contactName?: string;
  venueType?: string;
  neighborhood?: string;
  message?: string;
}): Promise<{ id: string; code: string }> {
  const { data, error } = await db().rpc("swaparound_admin_create_venue_invite", {
    p_org_name: input.orgName,
    p_contact_email: input.contactEmail || null,
    p_contact_name: input.contactName || null,
    p_venue_type: input.venueType || "other",
    p_neighborhood: input.neighborhood || null,
    p_message: input.message || null,
  });
  if (error) throw error;
  return data as { id: string; code: string };
}

export async function adminListVenueInvites(): Promise<VenueInvite[]> {
  const { data, error } = await db().rpc("swaparound_admin_list_venue_invites");
  if (error) throw error;
  return (data as VenueInvite[]) || [];
}

export async function peekVenueInvite(code: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db().rpc("swaparound_peek_venue_invite", { p_code: code });
  if (error) throw error;
  return (data as Record<string, unknown>) || null;
}

export async function claimVenueInvite(code: string, profile: {
  name?: string;
  neighborhood?: string;
  address?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  hoursNote?: string;
  perk?: string;
  servicesDiscount?: string;
}): Promise<string> {
  const { data, error } = await db().rpc("swaparound_claim_venue_invite", {
    p_code: code,
    p_name: profile.name || null,
    p_neighborhood: profile.neighborhood || null,
    p_address: profile.address || null,
    p_contact_name: profile.contactName || null,
    p_contact_email: profile.contactEmail || null,
    p_contact_phone: profile.contactPhone || null,
    p_description: profile.description || null,
    p_hours_note: profile.hoursNote || null,
    p_perk: profile.perk || null,
    p_services_discount: profile.servicesDiscount || null,
  });
  if (error) throw error;
  return data as string;
}

export async function myManagedVenues(): Promise<AdminVenue[]> {
  const { data, error } = await db().rpc("swaparound_my_managed_venues");
  if (error) throw error;
  return (data as AdminVenue[]) || [];
}

export async function adminCardDetail(card: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await db().rpc("swaparound_admin_card_detail", { p_card: card });
  if (error) throw error;
  return (data as Record<string, unknown>[]) || [];
}

export async function adminFetchSessions(): Promise<AdminSession[]> {
  const { data, error } = await db().from("swaparound_sessions").select("*, swaparound_venues(name,neighborhood,venue_type,perk,services_discount,status)").order("starts_at", { ascending: false });
  if (error) throw error; return (data || []) as AdminSession[];
}
export async function adminCreateSession(s: {
  venue_id: string; title: string; theme: string; target_bands: string[]; starts_at: string; ends_at: string; capacity_kids: number; cost_note: string; status: string;
}): Promise<void> {
  const { error } = await db().from("swaparound_sessions").insert({
    venue_id: s.venue_id, title: s.title, theme: s.theme || null, target_bands: s.target_bands,
    starts_at: s.starts_at, ends_at: s.ends_at, capacity_kids: s.capacity_kids, cost_note: s.cost_note || null, status: s.status,
  });
  if (error) throw error;
}
export async function adminSetSessionStatus(id: string, status: string): Promise<void> {
  const { error } = await db().from("swaparound_sessions").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function adminFetchInvites(): Promise<InviteCode[]> {
  const { data, error } = await db().from("swaparound_invite_codes").select("*").order("created_at", { ascending: false });
  if (error) throw error; return (data || []) as InviteCode[];
}
export async function adminAddInvite(code: string, label: string, max_uses: number | null): Promise<void> {
  const { error } = await db().from("swaparound_invite_codes").insert({ code: code.trim(), label: label || null, max_uses });
  if (error) throw error;
}
export async function adminSetInviteActive(code: string, active: boolean): Promise<void> {
  const { error } = await db().from("swaparound_invite_codes").update({ active }).eq("code", code);
  if (error) throw error;
}

export async function addListing(input: {
  sessionId?: string | null;
  childId: string;
  uid: string;
  toyName: string;
  category: string;
  condition: string;
  wants: string;
  emoji: string;
  areaLabel?: string | null;
  color?: string | null;
  toyType?: string | null;
  photoPath?: string | null;
  photoUrl?: string | null;
  /** All gallery URLs (first = cover). */
  photoUrls?: string[] | null;
  photoPaths?: string[] | null;
}): Promise<string> {
  const urls = (input.photoUrls || []).filter(Boolean);
  const paths = (input.photoPaths || []).filter(Boolean);
  const coverUrl = input.photoUrl || urls[0] || null;
  const coverPath = input.photoPath || paths[0] || null;
  const hasPhoto = !!(coverUrl && coverPath);
  const { data, error } = await db().from("swaparound_swap_listings").insert({
    session_id: input.sessionId || null,
    child_id: input.childId,
    parent_id: input.uid,
    toy_name: input.toyName,
    category: input.category,
    condition: input.condition,
    wants: input.wants || null,
    emoji: input.emoji,
    area_label: input.areaLabel || null,
    color: input.color?.trim() || null,
    toy_type: input.toyType?.trim() || null,
    photo_path: coverPath,
    photo_url: coverUrl,
    photo_urls: urls.length ? urls : (coverUrl ? [coverUrl] : []),
    photo_status: hasPhoto ? "ok" : "none",
    status: "available",
  }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Normalize photo gallery from a listing row. */
export function listingPhotoUrls(l: { photo_url?: string | null; photo_urls?: string[] | null }): string[] {
  const extra = Array.isArray(l.photo_urls) ? l.photo_urls.filter(Boolean) : [];
  if (extra.length) return extra;
  return l.photo_url ? [l.photo_url] : [];
}

/** Upload a compressed toy photo to the swaparound-toys bucket. Path: {uid}/{uuid}.jpg */
export async function uploadToyPhoto(uid: string, file: Blob, ext = "jpg"): Promise<{ path: string; url: string }> {
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${uid}/${id}.${ext}`;
  const { error } = await db().storage.from("swaparound-toys").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message || "Couldn't upload the photo.");
  const { data } = db().storage.from("swaparound-toys").getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/* ==================== MARKETPLACE · SEARCH · TRADES ==================== */

function rpcErr(error: { message?: string }, fallback: string): Error {
  const m = error.message || "";
  if (/not_authenticated/.test(m)) return new Error("Please sign in again.");
  if (/listing_not_found/.test(m)) return new Error("That listing is gone.");
  if (/not_your_offer|not_yours/.test(m)) return new Error("That's not your toy to offer.");
  if (/self_trade/.test(m)) return new Error("You can't trade with yourself.");
  if (/not_available/.test(m)) return new Error("One of those toys isn't available anymore.");
  if (/blocked/.test(m)) return new Error("You can't trade with that family.");
  if (/not_your_inbox/.test(m)) return new Error("That offer isn't for you.");
  if (/not_pending|not_accepted|not_cancellable/.test(m)) return new Error("That trade can't be changed right now.");
  if (/not_a_party/.test(m)) return new Error("You're not part of that trade.");
  if (/not_withdrawable/.test(m)) return new Error("That listing can't be withdrawn.");
  if (/message_too_long/.test(m)) return new Error("Message is too long.");
  return new Error(fallback);
}

export async function marketBrowse(opts?: {
  q?: string;
  category?: string;
  area?: string;
  color?: string;
  toyType?: string;
  childId?: string | null;
  onlyMyArea?: boolean;
  kidsMode?: boolean;
}): Promise<MarketListing[]> {
  const areaRaw = opts?.area?.trim() || "";
  const area = opts?.onlyMyArea && areaRaw ? `only:${areaRaw}` : (areaRaw || null);
  if (opts?.kidsMode || opts?.childId) {
    const { data, error } = await db().rpc("swaparound_market_browse_kids", {
      p_q: opts?.q?.trim() || null,
      p_category: opts?.category || null,
      p_area: area,
      p_color: opts?.color?.trim() || null,
      p_toy_type: opts?.toyType?.trim() || null,
      p_child: opts?.childId || null,
    });
    if (error) throw rpcErr(error, "Couldn't load toys.");
    return (data as MarketListing[]) || [];
  }
  const { data, error } = await db().rpc("swaparound_market_browse", {
    p_q: opts?.q?.trim() || null,
    p_category: opts?.category || null,
    p_area: areaRaw || null,
    p_color: opts?.color?.trim() || null,
    p_toy_type: opts?.toyType?.trim() || null,
  });
  if (error) throw rpcErr(error, "Couldn't load the marketplace.");
  return (data as MarketListing[]) || [];
}

export async function toggleFavorite(childId: string, listingId: string): Promise<"added" | "removed"> {
  const { data, error } = await db().rpc("swaparound_toggle_favorite", {
    p_child: childId,
    p_listing: listingId,
  });
  if (error) throw rpcErr(error, "Couldn't update favorites.");
  return data as "added" | "removed";
}

export async function childFavorites(childId: string): Promise<MarketListing[]> {
  const { data, error } = await db().rpc("swaparound_child_favorites", { p_child: childId });
  if (error) throw rpcErr(error, "Couldn't load favorites.");
  return (data as MarketListing[]) || [];
}

export async function childFavoriteIds(childId: string): Promise<string[]> {
  const { data, error } = await db().rpc("swaparound_child_favorite_ids", { p_child: childId });
  if (error) throw rpcErr(error, "Couldn't load favorites.");
  return (data as string[]) || [];
}

export async function requestVenueDay(input: {
  venueId: string;
  date: string;
  time?: string;
  mode?: MeetupMode;
  notes?: string;
}): Promise<string> {
  const { data, error } = await db().rpc("swaparound_request_venue_day", {
    p_venue: input.venueId,
    p_date: input.date,
    p_time: input.time || null,
    p_mode: input.mode || "event",
    p_notes: input.notes || null,
  });
  if (error) throw rpcErr(error, "Couldn't request that day.");
  return data as string;
}

export type VenueDayRequest = {
  id: string;
  venue_id: string;
  parent_id: string;
  preferred_date: string;
  preferred_time: string | null;
  meetup_mode: string;
  notes: string | null;
  status: string;
  venue_reply: string | null;
  venue_name?: string;
  venue_area?: string | null;
  parent_name?: string;
  created_at: string;
};

export async function venueDayRequests(): Promise<VenueDayRequest[]> {
  const { data, error } = await db().rpc("swaparound_venue_day_requests_for_me");
  if (error) throw rpcErr(error, "Couldn't load day requests.");
  return (data as VenueDayRequest[]) || [];
}

export async function respondVenueDay(id: string, status: string, reply?: string): Promise<void> {
  const { error } = await db().rpc("swaparound_respond_venue_day", {
    p_id: id,
    p_status: status,
    p_reply: reply || null,
  });
  if (error) throw rpcErr(error, "Couldn't update request.");
}

export async function venuesMap(): Promise<AdminVenue[]> {
  const { data, error } = await db().rpc("swaparound_venues_map");
  if (error) throw rpcErr(error, "Couldn't load venue map.");
  return (data as AdminVenue[]) || [];
}

export async function marketFilters(): Promise<MarketFilters> {
  const { data, error } = await db().rpc("swaparound_market_filters");
  if (error) throw rpcErr(error, "Couldn't load filters.");
  const d = (data || {}) as { colors?: string[]; types?: string[]; categories?: string[] };
  return {
    colors: (d.colors || []).filter(Boolean),
    types: (d.types || []).filter(Boolean),
    categories: (d.categories || []).filter(Boolean),
  };
}

export async function reportListingPhoto(input: {
  listingId: string;
  reason: string;
  details?: string;
  legal?: boolean;
}): Promise<string> {
  const { data, error } = await db().rpc("swaparound_report_listing_photo", {
    p_listing: input.listingId,
    p_reason: input.reason,
    p_details: input.details?.trim() || null,
    p_legal: !!input.legal,
  });
  if (error) throw rpcErr(error, "Couldn't send the photo report.");
  return data as string;
}

export async function adminModPhoto(reportId: string, action: "remove_photo" | "remove_listing" | "restore_photo" | "dismiss" | "legal", notes?: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_admin_mod_photo", {
    p_report_id: reportId,
    p_action: action,
    p_notes: notes?.trim() || null,
  });
  if (error) throw rpcErr(error, "Couldn't apply that moderation action.");
  return data as string;
}

export type SafetyQueueItem = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string | null;
  subject_parent_id: string | null;
  target_label: string | null;
  reason: string;
  details: string | null;
  status: string;
  admin_notes: string | null;
  severity: string;
  photo_url_snapshot: string | null;
  legal_flag: boolean;
  action_taken: string | null;
  created_at: string;
  updated_at: string;
  toy_name?: string | null;
  category?: string | null;
  color?: string | null;
  toy_type?: string | null;
  listing_photo_status?: string | null;
  listing_status?: string | null;
  emoji?: string | null;
  photo_path?: string | null;
  reporter_name?: string | null;
  subject_name?: string | null;
};

export async function adminSafetyQueue(): Promise<SafetyQueueItem[]> {
  const { data, error } = await db().rpc("swaparound_admin_safety_queue");
  if (error) throw rpcErr(error, "Couldn't load the safety queue.");
  return (data as SafetyQueueItem[]) || [];
}

export async function myListings(): Promise<MyListing[]> {
  const { data, error } = await db().rpc("swaparound_my_listings");
  if (error) throw rpcErr(error, "Couldn't load your listings.");
  return (data as MyListing[]) || [];
}

export async function myTrades(): Promise<TradeRow[]> {
  const { data, error } = await db().rpc("swaparound_my_trades");
  if (error) throw rpcErr(error, "Couldn't load your trades.");
  return (data as TradeRow[]) || [];
}

export async function proposeTrade(input: {
  targetListingId: string;
  offerListingId: string;
  message?: string;
  sessionId?: string | null;
}): Promise<string> {
  const { data, error } = await db().rpc("swaparound_propose_trade", {
    p_target: input.targetListingId,
    p_offer: input.offerListingId,
    p_message: input.message?.trim() || null,
    p_session: input.sessionId || null,
  });
  if (error) throw rpcErr(error, "Couldn't send the trade offer.");
  return data as string;
}

export async function respondTrade(offerId: string, accept: boolean): Promise<string> {
  const { data, error } = await db().rpc("swaparound_respond_trade", {
    p_offer_id: offerId,
    p_accept: accept,
  });
  if (error) throw rpcErr(error, "Couldn't respond to that trade.");
  return data as string;
}

export async function completeTrade(offerId: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_complete_trade", { p_offer_id: offerId });
  if (error) throw rpcErr(error, "Couldn't complete that trade.");
  return data as string;
}

export async function cancelTrade(offerId: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_cancel_trade", { p_offer_id: offerId });
  if (error) throw rpcErr(error, "Couldn't cancel that trade.");
  return data as string;
}

export async function withdrawListing(listingId: string): Promise<string> {
  const { data, error } = await db().rpc("swaparound_withdraw_listing", { p_listing: listingId });
  if (error) throw rpcErr(error, "Couldn't withdraw that listing.");
  return data as string;
}

/* ============================ SAFETY: REPORTS & BLOCKS ============================ */
// Reports land in swaparound_reports — an admin-readable moderation queue (see /admin).
// Blocks are enforced server-side by RLS (restrictive SELECT policies + a SECURITY
// DEFINER helper): a blocked family's meetups and toys disappear for the blocker, and
// vice-versa. Nothing here relies on client-side hiding.

export const REPORT_REASONS = [
  "Safety concern for a child",
  "Inappropriate or unsafe content",
  "Inappropriate toy photo",
  "This meetup doesn't seem real or safe",
  "Harassment or bad behavior",
  "Spam or a scam",
  "Something else",
];

export type ReportTargetType = "session" | "listing" | "listing_photo" | "venue" | "parent" | "general";

export type ReportInput = {
  targetType: ReportTargetType;
  targetId?: string | null;
  subjectParentId?: string | null;
  targetLabel?: string | null;
  reason: string;
  details?: string;
  severity?: "standard" | "photo_safety" | "child_safety" | "legal_escalation";
  photoUrlSnapshot?: string | null;
  legalFlag?: boolean;
};

export async function submitReport(uid: string, r: ReportInput): Promise<void> {
  const { error } = await db().from("swaparound_reports").insert({
    reporter_id: uid,
    target_type: r.targetType,
    target_id: r.targetId ?? null,
    subject_parent_id: r.subjectParentId ?? null,
    target_label: r.targetLabel ?? null,
    reason: r.reason,
    details: r.details?.trim() ? r.details.trim() : null,
    severity: r.severity || "standard",
    photo_url_snapshot: r.photoUrlSnapshot ?? null,
    legal_flag: !!r.legalFlag,
    status: r.legalFlag || r.severity === "legal_escalation" ? "legal_escalation" : "open",
  });
  if (error) throw error;
}

export type Block = { id: string; blocked_id: string; label: string | null; created_at: string };

export async function fetchBlocks(uid: string): Promise<Block[]> {
  const { data, error } = await db()
    .from("swaparound_blocks")
    .select("id,blocked_id,label,created_at")
    .eq("blocker_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Block[];
}

export async function blockParent(uid: string, blockedId: string, label: string): Promise<void> {
  const { error } = await db()
    .from("swaparound_blocks")
    .upsert({ blocker_id: uid, blocked_id: blockedId, label: label || null }, { onConflict: "blocker_id,blocked_id" });
  if (error) throw error;
}

export async function unblockParent(uid: string, blockedId: string): Promise<void> {
  const { error } = await db().from("swaparound_blocks").delete().eq("blocker_id", uid).eq("blocked_id", blockedId);
  if (error) throw error;
}

/* ---- admin moderation queue ---- */
export type AdminReport = {
  id: string; reporter_id: string; target_type: string; target_id: string | null;
  subject_parent_id: string | null; target_label: string | null; reason: string;
  details: string | null; status: string; admin_notes: string | null; created_at: string; updated_at: string;
  severity?: string; photo_url_snapshot?: string | null; legal_flag?: boolean; action_taken?: string | null;
};

export async function adminFetchReports(): Promise<AdminReport[]> {
  const { data, error } = await db().from("swaparound_reports").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as AdminReport[];
}

export async function adminSetReportStatus(id: string, status: string, notes?: string): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.admin_notes = notes.trim() ? notes.trim() : null;
  const { error } = await db().from("swaparound_reports").update(patch).eq("id", id);
  if (error) throw error;
}

// Admin-only: resolve parent uuids to friendly names (admin RLS allows reading any parent row).
export async function adminFetchParentNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return {};
  const { data } = await db().from("swaparound_parents").select("id,display_name,area_label").in("id", uniq);
  const map: Record<string, string> = {};
  (data || []).forEach((p) => {
    const row = p as { id: string; display_name: string; area_label: string | null };
    map[row.id] = row.display_name + (row.area_label ? ` · ${row.area_label}` : "");
  });
  return map;
}
