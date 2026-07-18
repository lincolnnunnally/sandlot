"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminFetchLeads,
  adminGrowthDashboard,
  adminSetLeadStage,
  adminSetTipStatus,
  adminTipToLead,
  adminUpsertLead,
  type GrowthDashboard,
  type GrowthLead,
} from "@/lib/db";

const STAGES = ["lead", "contacted", "interested", "partner", "paused", "declined"] as const;
const STAGE_LABEL: Record<string, string> = {
  lead: "New lead", contacted: "Contacted", interested: "Interested",
  partner: "Partner", paused: "Paused", declined: "Declined",
};

export function AdminGrowthPanel({ flash }: { flash: (m: string) => void }) {
  const [view, setView] = useState<"dashboard" | "crm" | "tips">("dashboard");
  const [d, setD] = useState<GrowthDashboard | null>(null);
  const [leads, setLeads] = useState<GrowthLead[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<"areas" | "inviters" | "funnel" | "viral" | null>("funnel");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [dash, l] = await Promise.all([adminGrowthDashboard(), adminFetchLeads()]);
      setD(dash); setLeads(l);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load growth data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !d) return <p className="muted small">Loading growth dashboard…</p>;
  if (err && !d) return <p className="note note-sun">{err}</p>;
  if (!d) return null;

  const k = d.kpis;
  const o = d.opportunities;

  return (
    <>
      <div className="eyebrow first">Growth &amp; expansion</div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={view === "dashboard" ? "on" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
        <button type="button" className={view === "crm" ? "on" : ""} onClick={() => setView("crm")}>
          CRM{k.crm_open ? ` (${k.crm_open})` : ""}
        </button>
        <button type="button" className={view === "tips" ? "on" : ""} onClick={() => setView("tips")}>
          Facility tips{k.tips_new ? ` (${k.tips_new})` : ""}
        </button>
      </div>

      {view === "dashboard" && (
        <>
          {/* KPI grid */}
          <div className="kpi-grid">
            <Kpi n={k.parents} l="Parents" delta={k.parents_7d ? `+${k.parents_7d} /7d` : undefined} onClick={() => setDrill("funnel")} />
            <Kpi n={k.kids} l="Kids" onClick={() => setDrill("funnel")} />
            <Kpi n={k.connections} l="Connections" onClick={() => setDrill("funnel")} />
            <Kpi n={k.listings_available} l="Toys listed" delta={k.listings_7d ? `+${k.listings_7d} /7d` : undefined} onClick={() => setDrill("funnel")} />
            <Kpi n={k.meetups_upcoming} l="Upcoming meetups" onClick={() => setDrill("areas")} />
            <Kpi n={k.rsvps_7d} l="RSVPs /7d" onClick={() => setDrill("funnel")} />
            <Kpi n={k.shares_7d} l="Shares /7d" onClick={() => setDrill("viral")} hot />
            <Kpi n={k.invite_redemptions} l="Invite joins" onClick={() => setDrill("inviters")} />
            <Kpi n={k.venues_verified} l="Verified places" onClick={() => setView("tips")} />
            <Kpi n={k.venues_community} l="Community places" onClick={() => setView("tips")} />
            <Kpi n={k.crm_open} l="CRM open" onClick={() => setView("crm")} hot={k.crm_open > 0} />
            <Kpi n={k.crm_partners} l="Partners" onClick={() => setView("crm")} />
          </div>
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>All KPI cards are tappable — they open funnel, areas, viral, CRM, or tips detail below.</p>

          {/* 30-day trend */}
          <div className="eyebrow">30-day trend</div>
          <div className="card">
            <TrendChart series={d.series_30d} />
            <p className="tiny muted" style={{ margin: "10px 0 0" }}>
              Tap a metric chip below the chart to highlight it. Bars = relative daily volume.
            </p>
          </div>

          {/* Interactive drill */}
          <div className="eyebrow">Dive in</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {([
              ["funnel", "Adoption funnel"],
              ["areas", "Areas"],
              ["inviters", "Top inviters"],
              ["viral", "Viral loop"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" className={`chip ${drill === id ? "on" : ""}`} onClick={() => setDrill(id)}>{label}</button>
            ))}
          </div>

          {drill === "funnel" && <FunnelCard funnel={d.funnel} />}
          {drill === "areas" && <AreasCard areas={d.areas} />}
          {drill === "inviters" && <InvitersCard inviters={d.top_inviters} />}
          {drill === "viral" && <ViralCard viral={d.viral} />}

          {/* Opportunities */}
          <div className="eyebrow">Facilitate next opportunities</div>
          <div className="card">
            <OppRow
              icon="🤝"
              title={`${o.unconnected_parents} families not connected yet`}
              sub="Nudge invite sharing — connections unlock who is at meetups"
              action="Open CRM"
              onClick={() => setView("crm")}
            />
            <OppRow
              icon="🧒"
              title={`${o.parents_no_kids} parents with no kids yet`}
              sub="Onboarding incomplete — they can't list or RSVP fully"
            />
            <OppRow
              icon="🌀"
              title={`${o.parents_no_listing} families with kids but no toy listed`}
              sub="Prompt marketplace listing to seed the browse grid"
            />
            {o.empty_meetups.length > 0 && (
              <OppRow
                icon="📅"
                title={`${o.empty_meetups.length} upcoming meetups with zero RSVPs`}
                sub={o.empty_meetups.slice(0, 2).map((m) => m.theme || m.title).join(" · ")}
              />
            )}
            {o.new_tips.length > 0 && (
              <OppRow
                icon="🏢"
                title={`${o.new_tips.length} facility tips from parents`}
                sub="Convert tips into CRM outreach for meetup locations"
                action="Review tips →"
                onClick={() => setView("tips")}
              />
            )}
            {o.crm_due.length > 0 && (
              <OppRow
                icon="☎️"
                title={`${o.crm_due.length} CRM follow-ups due soon`}
                sub={o.crm_due.slice(0, 2).map((c) => c.name).join(" · ")}
                action="Open CRM →"
                onClick={() => setView("crm")}
              />
            )}
            {o.community_venues.length > 0 && (
              <OppRow
                icon="📍"
                title={`${o.community_venues.length} community places need verify`}
                sub={o.community_venues.slice(0, 2).map((v) => v.name).join(" · ")}
              />
            )}
          </div>

          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={load}>Refresh data</button>
        </>
      )}

      {view === "crm" && (
        <CrmBoard
          leads={leads}
          byStage={d.crm_by_stage}
          flash={flash}
          onChanged={async () => { await load(); flash("CRM updated."); }}
        />
      )}

      {view === "tips" && (
        <TipsBoard
          tips={o.new_tips}
          flash={flash}
          onChanged={async () => { await load(); }}
        />
      )}
    </>
  );
}

function Kpi({ n, l, delta, onClick, hot }: { n: number; l: string; delta?: string; onClick?: () => void; hot?: boolean }) {
  return (
    <button
      type="button"
      className="kpi"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        borderColor: hot ? "var(--coral)" : undefined,
      }}
    >
      <div className="kpi-n">{n}</div>
      <div className="kpi-l">{l}</div>
      {delta && <div className="kpi-d">{delta}</div>}
    </button>
  );
}

function TrendChart({ series }: { series: GrowthDashboard["series_30d"] }) {
  const [metric, setMetric] = useState<"parents" | "rsvps" | "listings" | "connections" | "shares">("parents");
  const max = Math.max(1, ...series.map((s) => Number(s[metric]) || 0));

  return (
    <>
      <div className="chips" style={{ marginBottom: 10 }}>
        {(["parents", "rsvps", "listings", "connections", "shares"] as const).map((m) => (
          <button key={m} type="button" className={`chip ${metric === m ? "on" : ""}`} onClick={() => setMetric(m)} style={{ textTransform: "capitalize" }}>{m}</button>
        ))}
      </div>
      <div className="spark">
        {series.map((s) => {
          const v = Number(s[metric]) || 0;
          const h = Math.max(4, Math.round((v / max) * 72));
          const day = typeof s.day === "string" ? s.day.slice(5) : "";
          return (
            <div key={String(s.day)} className="spark-col" title={`${s.day}: ${v} ${metric}`}>
              <div className="spark-bar" style={{ height: h }} />
              <div className="spark-lab">{day}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function FunnelCard({ funnel }: { funnel: GrowthDashboard["funnel"] }) {
  const steps: { key: keyof GrowthDashboard["funnel"]; label: string }[] = [
    { key: "parents", label: "Signed up" },
    { key: "with_kids", label: "Added kids" },
    { key: "with_listing", label: "Listed a toy" },
    { key: "with_rsvp", label: "RSVP'd a playdate" },
    { key: "with_connection", label: "Connected family" },
    { key: "with_share", label: "Shared invite" },
  ];
  const max = Math.max(1, funnel.parents);

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b className="small">Adoption funnel</b>
      <p className="tiny muted" style={{ margin: "4px 0 12px" }}>Where parents drop off — target the biggest cliff with product nudges or outreach.</p>
      {steps.map((s, i) => {
        const n = funnel[s.key] || 0;
        const prev = i === 0 ? n : funnel[steps[i - 1].key] || 0;
        const pct = max ? Math.round((n / max) * 100) : 0;
        const drop = prev ? Math.round((1 - n / prev) * 100) : 0;
        return (
          <div key={s.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", marginBottom: 4 }}>
              <span>{s.label}</span>
              <span><b>{n}</b> <span className="muted">({pct}% of signups){i > 0 && drop > 0 ? ` · −${drop}% step` : ""}</span></span>
            </div>
            <div className="funnel-track"><div className="funnel-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function AreasCard({ areas }: { areas: GrowthDashboard["areas"] }) {
  const max = Math.max(1, ...areas.map((a) => a.parents));
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b className="small">Where families are</b>
      <p className="tiny muted" style={{ margin: "4px 0 12px" }}>Target facility outreach in high-parent / low-venue areas.</p>
      {areas.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No area data yet.</p>
        : areas.map((a) => (
          <div key={a.area} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", marginBottom: 4 }}>
              <span>{a.area}</span>
              <span><b>{a.parents}</b> <span className="muted">(+{a.parents_30d} /30d)</span></span>
            </div>
            <div className="funnel-track"><div className="funnel-fill" style={{ width: `${Math.round((a.parents / max) * 100)}%`, background: "var(--sky)" }} /></div>
          </div>
        ))}
    </div>
  );
}

function InvitersCard({ inviters }: { inviters: GrowthDashboard["top_inviters"] }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b className="small">Top parent inviters</b>
      <p className="tiny muted" style={{ margin: "4px 0 12px" }}>Ambassadors — thank them, give facility leads, or turn into formal partners.</p>
      {inviters.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No invite redemptions yet — push the Grow Sandlot card.</p>
        : inviters.map((i) => (
          <div key={i.parent_id} className="kidrow" style={{ marginBottom: 8 }}>
            <div className="av">🌟</div>
            <div style={{ flex: 1 }}>
              <div className="nm">{i.display_name}</div>
              <div className="bd">{i.area_label || "—"} · code {i.code} · {i.used_count} joins · {i.shares} shares</div>
            </div>
          </div>
        ))}
    </div>
  );
}

function ViralCard({ viral }: { viral: GrowthDashboard["viral"] }) {
  const channels = Object.entries(viral.share_by_channel || {});
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <b className="small">Viral loop health</b>
      <div className="kpi-grid" style={{ marginTop: 10 }}>
        <Kpi n={viral.shares_7d} l="Shares /7d" />
        <Kpi n={viral.shares_30d} l="Shares /30d" />
        <Kpi n={viral.invite_uses_total} l="Total invite joins" />
        <Kpi n={viral.active_inviters} l="Active inviters" />
      </div>
      <p className="tiny muted" style={{ margin: "12px 0 6px" }}>Share channels (30d)</p>
      {channels.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No share events yet — they start when parents hit Share/Copy/Text.</p>
        : channels.map(([ch, n]) => (
          <div key={ch} style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "4px 0" }}>
            <span style={{ textTransform: "capitalize" }}>{ch.replace(/_/g, " ")}</span>
            <b>{n}</b>
          </div>
        ))}
      <p className="note note-clover small" style={{ marginTop: 12, marginBottom: 0 }}>
        Loop: list toy / host playdate → share invite → friend joins → connected → more trades &amp; meetups → more shares.
      </p>
    </div>
  );
}

function OppRow({ icon, title, sub, action, onClick }: {
  icon: string; title: string; sub?: string; action?: string; onClick?: () => void;
}) {
  const inner = (
    <>
      <span style={{ fontSize: "1.15rem" }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left" }}>
        <span className="small" style={{ display: "block", fontWeight: 600 }}>{title}</span>
        {sub && <span className="tiny muted" style={{ display: "block", marginTop: 2 }}>{sub}</span>}
      </span>
      {action && <span className="tiny" style={{ color: "var(--clover-deep)", whiteSpace: "nowrap" }}>{action}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--line)", padding: "10px 0", cursor: "pointer" }}>
        {inner}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
      {inner}
    </div>
  );
}

function CrmBoard({
  leads, byStage, flash, onChanged,
}: {
  leads: GrowthLead[];
  byStage: Record<string, number>;
  flash: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [stageFilter, setStageFilter] = useState<string>("open");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<GrowthLead | null>(null);

  const shown = useMemo(() => {
    if (stageFilter === "open") return leads.filter((l) => ["lead", "contacted", "interested"].includes(l.stage));
    if (stageFilter === "all") return leads;
    return leads.filter((l) => l.stage === stageFilter);
  }, [leads, stageFilter]);

  return (
    <>
      <p className="small muted" style={{ margin: "0 0 10px" }}>
        Targeted expansion CRM — facilities, churches, schools, parent ambassadors. Move stages as you outreach.
      </p>
      <div className="chips" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className={`chip ${stageFilter === "open" ? "on" : ""}`} onClick={() => setStageFilter("open")}>Open pipeline</button>
        <button type="button" className={`chip ${stageFilter === "all" ? "on" : ""}`} onClick={() => setStageFilter("all")}>All</button>
        {STAGES.map((s) => (
          <button key={s} type="button" className={`chip ${stageFilter === s ? "on" : ""}`} onClick={() => setStageFilter(s)}>
            {STAGE_LABEL[s]}{byStage[s] ? ` (${byStage[s]})` : ""}
          </button>
        ))}
      </div>

      {!adding ? (
        <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }} onClick={() => setAdding(true)}>+ Add CRM lead</button>
      ) : (
        <LeadForm
          onCancel={() => setAdding(false)}
          onSave={async (lead) => {
            await adminUpsertLead(lead);
            setAdding(false);
            await onChanged();
            flash("Lead saved.");
          }}
        />
      )}

      {shown.length === 0 ? <div className="card"><p className="muted small" style={{ margin: 0 }}>No leads in this view.</p></div>
        : shown.map((l) => (
          <button
            type="button"
            key={l.id}
            className="card"
            style={{ width: "100%", textAlign: "left", marginBottom: 8, cursor: "pointer", borderColor: l.priority === "urgent" || l.priority === "high" ? "var(--sunshine)" : undefined }}
            onClick={() => setSelected(l)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <b className="small">{l.name}</b>
              <span className="chip-sky chip" style={{ padding: "2px 8px", fontSize: ".68rem" }}>{STAGE_LABEL[l.stage] || l.stage}</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {l.kind} · {l.priority} · {l.area || "no area"}
              {l.next_action ? ` · next: ${l.next_action}` : ""}
              {l.next_action_at ? ` by ${l.next_action_at}` : ""}
            </div>
          </button>
        ))}

      {selected && (
        <LeadDetail
          lead={selected}
          onClose={() => setSelected(null)}
          flash={flash}
          onChanged={async () => { setSelected(null); await onChanged(); }}
        />
      )}
    </>
  );
}

function LeadForm({
  initial, onCancel, onSave,
}: {
  initial?: GrowthLead;
  onCancel: () => void;
  onSave: (lead: Partial<GrowthLead> & { name: string }) => Promise<void>;
}) {
  const [f, setF] = useState({
    name: initial?.name || "",
    kind: initial?.kind || "facility",
    stage: initial?.stage || "lead",
    priority: initial?.priority || "normal",
    contact_name: initial?.contact_name || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    area: initial?.area || "",
    next_action: initial?.next_action || "",
    next_action_at: initial?.next_action_at || "",
    notes: initial?.notes || "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        id: initial?.id,
        ...f,
        contact_name: f.contact_name || null,
        email: f.email || null,
        phone: f.phone || null,
        area: f.area || null,
        next_action: f.next_action || null,
        next_action_at: f.next_action_at || null,
        notes: f.notes || null,
        source: initial?.source || "admin",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 12 }}>
      <div className="field"><label>Name</label>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Facility or person" /></div>
      <div className="grid2">
        <div className="field"><label>Kind</label>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {["facility", "church", "school", "org", "parent_ambassador", "other"].map((k) => (
              <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label>Stage</label>
          <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field"><label>Area</label>
          <input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></div>
      </div>
      <div className="field"><label>Contact</label>
        <input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></div>
      <div className="grid2">
        <div className="field"><label>Email</label>
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>Phone</label>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      <div className="field"><label>Next action</label>
        <input value={f.next_action} onChange={(e) => setF({ ...f, next_action: e.target.value })} placeholder="Call director about Saturday playdates" /></div>
      <div className="field"><label>Due date</label>
        <input type="date" value={f.next_action_at || ""} onChange={(e) => setF({ ...f, next_action_at: e.target.value })} /></div>
      <div className="field"><label>Notes</label>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} maxLength={4000} /></div>
      <div className="grid2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.name.trim()}>{busy ? "…" : "Save"}</button>
      </div>
    </form>
  );
}

function LeadDetail({
  lead, onClose, flash, onChanged,
}: {
  lead: GrowthLead; onClose: () => void; flash: (m: string) => void; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function move(stage: string) {
    setBusy(true);
    try {
      await adminSetLeadStage(lead.id, stage);
      flash(`Moved to ${STAGE_LABEL[stage] || stage}`);
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="modal-scrim">
        <div className="modal-card" style={{ maxHeight: "90vh", overflow: "auto" }}>
          <LeadForm
            initial={lead}
            onCancel={() => setEditing(false)}
            onSave={async (l) => {
              await adminUpsertLead({ ...l, id: lead.id });
              flash("Lead updated.");
              await onChanged();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="card modal-card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <b>{lead.name}</b>
          <button type="button" className="linkish" onClick={onClose}>Close</button>
        </div>
        <p className="tiny muted" style={{ margin: "0 0 10px" }}>
          {lead.kind} · {STAGE_LABEL[lead.stage]} · {lead.priority} · {lead.source}
        </p>
        <p className="small" style={{ margin: "0 0 6px" }}>{lead.contact_name || "No contact"} · {lead.email || "—"} · {lead.phone || "—"}</p>
        <p className="small muted" style={{ margin: "0 0 6px" }}>Area: {lead.area || "—"}</p>
        {lead.next_action && <div className="note note-sky small" style={{ marginBottom: 10 }}>Next: <b>{lead.next_action}</b>{lead.next_action_at ? ` by ${lead.next_action_at}` : ""}</div>}
        {lead.notes && <p className="small" style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>{lead.notes}</p>}
        <div className="chips" style={{ marginBottom: 12 }}>
          {STAGES.map((s) => (
            <button key={s} type="button" className={`chip ${lead.stage === s ? "on" : ""}`} disabled={busy} onClick={() => move(s)}>{STAGE_LABEL[s]}</button>
          ))}
        </div>
        <div className="grid2">
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Edit details</button>
          {lead.email && (
            <a className="btn btn-primary" href={`mailto:${lead.email}?subject=${encodeURIComponent("Sandlot playdate partnership")}&body=${encodeURIComponent(`Hi${lead.contact_name ? " " + lead.contact_name : ""},\n\nWe run Sandlot — free fidget/toy trading and supervised playdates for families. Would ${lead.name} be open to hosting?\n\n`)}`}>
              Email…
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function TipsBoard({
  tips, flash, onChanged,
}: {
  tips: GrowthDashboard["opportunities"]["new_tips"];
  flash: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toLead(id: string) {
    setBusyId(id);
    try {
      await adminTipToLead(id);
      flash("Tip converted to CRM lead — open CRM to outreach.");
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't convert.");
    } finally {
      setBusyId(null);
    }
  }

  async function decline(id: string) {
    setBusyId(id);
    try {
      await adminSetTipStatus(id, "declined");
      flash("Tip declined.");
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <p className="small muted" style={{ margin: "0 0 10px" }}>
        Parents suggest facilities. Convert good ones into CRM leads for targeted expansion.
      </p>
      {tips.length === 0 ? <div className="card"><p className="muted small" style={{ margin: 0 }}>No open facility tips. Parents use Grow Sandlot → Suggest a facility.</p></div>
        : tips.map((t) => (
          <div key={t.id} className="card" style={{ marginBottom: 10 }}>
            <b className="small">{t.name}</b>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {t.venue_type} · {t.neighborhood || "—"} · from {t.parent_name}{t.parent_area ? ` (${t.parent_area})` : ""}
            </div>
            {(t.contact_name || t.contact_email || t.contact_phone) && (
              <p className="small" style={{ margin: "8px 0 0" }}>
                {t.contact_name || "Contact"} · {t.contact_email || "—"} · {t.contact_phone || "—"}
              </p>
            )}
            {t.notes && <p className="small muted" style={{ margin: "6px 0 0" }}>{t.notes}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busyId === t.id} onClick={() => toLead(t.id)}>
                → CRM lead
              </button>
              <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busyId === t.id} onClick={() => decline(t.id)}>
                Decline
              </button>
            </div>
          </div>
        ))}
    </>
  );
}
