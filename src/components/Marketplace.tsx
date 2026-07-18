"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addListing,
  cancelTrade,
  completeTrade,
  listingPhotoUrls,
  marketBrowse,
  marketFilters,
  myListings,
  myTrades,
  proposeTrade,
  reportListingPhoto,
  respondTrade,
  uploadToyPhoto,
  withdrawListing,
  PHOTO_REPORT_REASONS,
  TOY_CATEGORIES,
  TOY_COLORS,
  TOY_CONDITIONS,
  TOY_EMOJI,
  TOY_TYPES_BY_CATEGORY,
  type Child,
  type MarketFilters,
  type MarketListing,
  type MyListing,
  type Parent,
  type SessionRow,
  type TradeRow,
} from "@/lib/db";
import { compressToyPhoto, validateToyImageFile } from "@/lib/photos";

const MAX_TOY_PHOTOS = 6;

type Props = {
  uid: string;
  parent: Parent;
  children: Child[];
  sessions: SessionRow[];
  onFlash: (m: string) => void;
  /** Default tab when parent opens Swaps — trades first, browse is optional. */
  initialTab?: "browse" | "mine" | "trades";
  /** Hide the long marketplace intro (used inside the sectioned parent portal). */
  compact?: boolean;
};

export function MarketplaceSection({ uid, parent, children: kids, sessions, onFlash, initialTab = "trades", compact }: Props) {
  const [tab, setTab] = useState<"browse" | "mine" | "trades">(initialTab);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [toyType, setToyType] = useState("");
  const [area, setArea] = useState(parent.area_label || parent.zip || "");
  const [onlyArea, setOnlyArea] = useState(false);
  const [filters, setFilters] = useState<MarketFilters>({ colors: [], types: [], categories: [] });
  const [items, setItems] = useState<MarketListing[]>([]);
  const [mine, setMine] = useState<MyListing[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [offerFor, setOfferFor] = useState<MarketListing | null>(null);
  const [reportFor, setReportFor] = useState<MarketListing | null>(null);
  const [detail, setDetail] = useState<MarketListing | null>(null);

  // Keep area in sync if parent profile loads/changes
  useEffect(() => {
    if (!area && (parent.area_label || parent.zip)) setArea(parent.area_label || parent.zip || "");
  }, [parent.area_label, parent.zip, area]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [b, m, t, f] = await Promise.all([
        marketBrowse({
          q: q || undefined,
          category: category || undefined,
          area: area || undefined,
          color: color || undefined,
          toyType: toyType || undefined,
          onlyMyArea: onlyArea,
          kidsMode: true, // always rank by area when available; empty filters = all available toys
        }),
        myListings(),
        myTrades(),
        marketFilters().catch(() => ({ colors: [], types: [], categories: [] })),
      ]);
      setItems(b);
      setMine(m);
      setTrades(t);
      setFilters(f);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Couldn't load marketplace.");
    } finally {
      setLoading(false);
    }
  }, [q, category, area, color, toyType, onlyArea, onFlash]);

  // Auto-show available toys on load; live refilter as criteria change (no search button)
  useEffect(() => {
    const t = window.setTimeout(() => { refresh(); }, tab === "browse" ? 160 : 0);
    return () => window.clearTimeout(t);
  }, [refresh, tab]);

  const pendingIn = useMemo(() => trades.filter((t) => t.direction === "incoming" && t.status === "pending").length, [trades]);
  const availableMine = useMemo(() => mine.filter((l) => l.status === "available"), [mine]);

  const colorOptions = useMemo(() => {
    const set = new Set([...TOY_COLORS, ...filters.colors.map((c) => c.toLowerCase())]);
    return [...set];
  }, [filters.colors]);

  const typeOptions = useMemo(() => {
    const fromCat = category ? (TOY_TYPES_BY_CATEGORY[category] || []) : Object.values(TOY_TYPES_BY_CATEGORY).flat();
    const set = new Set([...fromCat.map((t) => t.toLowerCase()), ...filters.types.map((t) => t.toLowerCase())]);
    return [...set];
  }, [category, filters.types]);

  function clearFilters() {
    setQ(""); setCategory(""); setColor(""); setToyType("");
    setArea(parent.area_label || parent.zip || "");
    setOnlyArea(false);
  }

  const activeFilterCount = [q, category, color, toyType, onlyArea].filter(Boolean).length;

  // If parent portal opens Swaps focused on trades/listings, honor initialTab when it changes
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div>
      {!compact && <div className="eyebrow first">Toy marketplace</div>}
      <div className="card" style={{ marginBottom: 10 }}>
        {!compact ? (
          <p className="small" style={{ margin: "0 0 10px" }}>
            <b>Swap requests first</b> — then your listings. Browse nearby toys only when you need ideas.
            Photos must be <b>toys only</b>.
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: "0 0 10px" }}>
            Handle swap offers, list toys for trade, or browse nearby when you want.
          </p>
        )}
        <div className="seg">
          <button type="button" className={tab === "trades" ? "on" : ""} onClick={() => setTab("trades")}>
            Swaps{pendingIn ? <span className="badge">{pendingIn}</span> : null}
          </button>
          <button type="button" className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>
            My toys{mine.length ? ` (${mine.length})` : ""}
          </button>
          <button type="button" className={tab === "browse" ? "on" : ""} onClick={() => setTab("browse")}>Browse</button>
        </div>
      </div>

      {tab === "browse" && (
        <>
          <div className="card">
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="mq">Filter by name (live)</label>
              <input id="mq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing… toys update as you type" />
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label>Category</label>
              <div className="chips">
                <button type="button" className={`chip ${!category ? "on" : ""}`} onClick={() => { setCategory(""); setToyType(""); }}>All</button>
                {TOY_CATEGORIES.map((c) => (
                  <button key={c.code} type="button" className={`chip ${category === c.code ? "on" : ""}`}
                    onClick={() => { setCategory(c.code); setToyType(""); }}>{c.label}</button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label>Type</label>
              <div className="chips">
                <button type="button" className={`chip ${!toyType ? "on" : ""}`} onClick={() => setToyType("")}>Any type</button>
                {typeOptions.slice(0, 16).map((t) => (
                  <button key={t} type="button" className={`chip ${toyType === t ? "on" : ""}`}
                    onClick={() => setToyType(toyType === t ? "" : t)} style={{ textTransform: "capitalize" }}>{t}</button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label>Color</label>
              <div className="chips">
                <button type="button" className={`chip ${!color ? "on" : ""}`} onClick={() => setColor("")}>Any color</button>
                {colorOptions.map((c) => (
                  <button key={c} type="button" className={`chip ${color === c ? "on" : ""}`}
                    onClick={() => setColor(color === c ? "" : c)} style={{ textTransform: "capitalize" }}>{c}</button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="ma">Area (defaults to yours — toys nearby sort first)</label>
              <input id="ma" value={area} onChange={(e) => setArea(e.target.value)} placeholder={parent.area_label || parent.zip || "e.g. 30000"} />
            </div>
            <label className="note note-clover" style={{ alignItems: "center", cursor: "pointer", marginBottom: 8 }}>
              <input type="checkbox" checked={onlyArea} onChange={(e) => setOnlyArea(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span>Only show toys in this area</span>
            </label>

            {activeFilterCount > 0 && (
              <button type="button" className="linkish" onClick={clearFilters}>Reset filters</button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 2px 8px" }}>
            <span className="tiny muted">{loading ? "Updating…" : `${items.length} available toy${items.length === 1 ? "" : "s"}`}</span>
            <button type="button" className="linkish" onClick={() => refresh()}>Refresh</button>
          </div>

          {loading && items.length === 0 ? <p className="muted small pad">Loading available toys…</p>
            : items.length === 0 ? (
              <div className="card"><p className="muted small" style={{ margin: 0 }}>
                No available toys yet. Be the first under <b>My listings</b>, or widen filters.
              </p></div>
            ) : (
              <div className="grid2">
                {items.map((l) => (
                  <button type="button" className="toy toy-btn" key={l.id} onClick={() => setDetail(l)}>
                    <div className="ph">
                      {l.photo_url
                        ? <img src={l.photo_url} alt={l.toy_name} className="toy-photo" />
                        : <span className="toy-emoji">{l.emoji || "🧸"}</span>}
                      <span className="to">{catLabel(l.category)}</span>
                    </div>
                    <div className="bd2" style={{ textAlign: "left" }}>
                      <div className="nm2">{l.toy_name}</div>
                      <div className="wt">
                        {[l.color, l.toy_type, condLabel(l.condition)].filter(Boolean).join(" · ")}
                      </div>
                      {l.wants && <div className="wt">wants: {l.wants}</div>}
                      <div className="ow">{l.seller_name}{l.seller_area ? ` · ${l.seller_area}` : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </>
      )}

      {tab === "mine" && (
        <>
          {!adding ? (
            <button className="btn btn-primary btn-block" style={{ marginBottom: 10 }} onClick={() => setAdding(true)} disabled={kids.length === 0}>
              + List a toy with photo
            </button>
          ) : (
            <ListToyForm
              uid={uid}
              kids={kids}
              parent={parent}
              areaLabel={parent.area_label || parent.zip}
              onCancel={() => setAdding(false)}
              onDone={async (created) => {
                setAdding(false);
                await refresh();
                onFlash("Listed! Review your photos below. 🌀");
                if (created) {
                  setTab("mine");
                  setDetail(created);
                }
              }}
              onFlash={onFlash}
            />
          )}
          {kids.length === 0 && (
            <p className="note note-sun small">Add a child profile above before listing a toy.</p>
          )}
          {loading ? <p className="muted small">Loading…</p>
            : mine.length === 0 ? <div className="card"><p className="muted small" style={{ margin: 0 }}>You haven&apos;t listed anything yet.</p></div>
            : mine.map((l) => (
              <div className="kidrow" key={l.id} style={{ marginBottom: 8, alignItems: "flex-start" }}>
                <button
                  type="button"
                  className="av"
                  style={{ fontSize: "1.2rem", overflow: "hidden", padding: 0, cursor: "pointer", border: "none" }}
                  onClick={() => setDetail(mineToMarket(l, parent))}
                  aria-label={`Open ${l.toy_name}`}
                >
                  {l.photo_url
                    ? <img src={l.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (l.emoji || "🧸")}
                </button>
                <button
                  type="button"
                  style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  onClick={() => setDetail(mineToMarket(l, parent))}
                >
                  <div className="nm">{l.toy_name}</div>
                  <div className="bd">
                    {catLabel(l.category)}
                    {l.toy_type ? ` · ${l.toy_type}` : ""}
                    {l.color ? ` · ${l.color}` : ""}
                    {" · "}{statusLabel(l.status)}
                    {listingPhotoUrls(l).length > 1 ? ` · ${listingPhotoUrls(l).length} photos` : ""}
                    {l.photo_status === "under_review" ? " · photo under review" : ""}
                    {l.photo_status === "removed" ? " · photo removed" : ""}
                  </div>
                  <div className="tiny" style={{ color: "var(--clover-deep)", marginTop: 2 }}>Tap to review listing →</div>
                </button>
                {l.status === "available" && (
                  <button className="mini-btn" onClick={async (e) => {
                    e.stopPropagation();
                    try { await withdrawListing(l.id); await refresh(); onFlash("Listing withdrawn."); }
                    catch (err) { onFlash(err instanceof Error ? err.message : "Couldn't withdraw."); }
                  }}>Withdraw</button>
                )}
              </div>
            ))}
        </>
      )}

      {tab === "trades" && (
        <>
          {loading ? <p className="muted small">Loading…</p>
            : trades.length === 0 ? (
              <div className="card"><p className="muted small" style={{ margin: 0 }}>
                No open trades. Browse toys and propose a trade with one of yours.
              </p></div>
            ) : trades.map((t) => (
              <TradeCard key={t.id} trade={t} sessions={sessions} onFlash={onFlash} onChanged={refresh} />
            ))}
        </>
      )}

      {detail && (
        <ListingDetailModal
          listing={detail}
          canOffer={availableMine.length > 0}
          onClose={() => setDetail(null)}
          onOffer={() => { setOfferFor(detail); setDetail(null); }}
          onReport={() => { setReportFor(detail); setDetail(null); }}
        />
      )}

      {offerFor && (
        <ProposeTradeModal
          target={offerFor}
          myAvailable={availableMine}
          sessions={sessions}
          onClose={() => setOfferFor(null)}
          onFlash={onFlash}
          onDone={async () => { setOfferFor(null); setTab("trades"); await refresh(); }}
        />
      )}

      {reportFor && (
        <ReportPhotoModal
          listing={reportFor}
          onClose={() => setReportFor(null)}
          onFlash={onFlash}
          onDone={async () => { setReportFor(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function mineToMarket(l: MyListing, parent: Parent): MarketListing {
  return {
    ...l,
    seller_name: parent.display_name || "You",
    seller_area: l.area_label || parent.area_label || parent.zip || null,
    kid_nickname: l.kid_nickname,
    kid_avatar: l.kid_avatar,
  };
}

function ListingDetailModal({
  listing, canOffer, onClose, onOffer, onReport,
}: {
  listing: MarketListing;
  canOffer: boolean;
  onClose: () => void;
  onOffer: () => void;
  onReport: () => void;
}) {
  const photos = listingPhotoUrls(listing);
  const [photoIdx, setPhotoIdx] = useState(0);
  const current = photos[photoIdx] || photos[0] || null;

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="card modal-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <b>Toy details</b>
          <button type="button" className="linkish" onClick={onClose}>Close</button>
        </div>
        <div className="detail-photo">
          {current
            ? <img src={current} alt={listing.toy_name} />
            : <div className="detail-emoji">{listing.emoji || "🧸"}</div>}
        </div>
        {photos.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
            {photos.map((url, i) => (
              <button
                key={url + i}
                type="button"
                onClick={() => setPhotoIdx(i)}
                style={{
                  width: 56, height: 56, borderRadius: 8, overflow: "hidden", padding: 0,
                  border: i === photoIdx ? "2px solid var(--clover)" : "1px solid var(--line)",
                  flexShrink: 0, cursor: "pointer",
                }}
              >
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        )}
        <h3 style={{ fontSize: "1.15rem", margin: "12px 0 4px" }}>{listing.toy_name}</h3>
        <p className="small muted" style={{ margin: "0 0 8px" }}>
          {[catLabel(listing.category), listing.toy_type, listing.color, condLabel(listing.condition)].filter(Boolean).join(" · ")}
        </p>
        {listing.wants && <p className="small" style={{ margin: "0 0 8px" }}>Looking for: <b>{listing.wants}</b></p>}
        <p className="tiny muted" style={{ margin: "0 0 12px" }}>
          {listing.seller_name}{listing.seller_area ? ` · ${listing.seller_area}` : ""} · for {listing.kid_avatar || "🧒"} {listing.kid_nickname}
          {photos.length ? ` · ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}
        </p>
        {listing.seller_name !== "You" && (
          <>
            <button className="btn btn-coral btn-block" disabled={!canOffer} onClick={onOffer} style={{ marginBottom: 8 }}>
              {canOffer ? "Propose trade" : "List one of your toys first"}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={onReport} style={{ borderColor: "var(--coral)", color: "var(--coral-ink)" }}>
              ⚐ Report inappropriate photo
            </button>
            <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Reports go to Sandlot admins immediately. If a photo shows a child, face, or anything illegal, report it — we can remove it and escalate for legal action.
            </p>
          </>
        )}
        {listing.seller_name === "You" && (
          <p className="note note-clover small" style={{ margin: 0 }}>
            This is your listing. Families nearby can browse it and propose a trade.
          </p>
        )}
      </div>
    </div>
  );
}

function ReportPhotoModal({
  listing, onClose, onFlash, onDone,
}: {
  listing: MarketListing;
  onClose: () => void;
  onFlash: (m: string) => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState(PHOTO_REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [legal, setLegal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await reportListingPhoto({
        listingId: listing.id,
        reason,
        details,
        legal,
      });
      onFlash(legal
        ? "Reported & escalated. Photo hidden. Admin will review for removal and possible legal action."
        : "Photo reported. It's hidden from browse while admins review.");
      await onDone();
    } catch (err) {
      onFlash(err instanceof Error ? err.message : "Couldn't report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="card modal-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <b style={{ color: "var(--coral-ink)" }}>Report toy photo</b>
          <button type="button" className="linkish" onClick={onClose}>Close</button>
        </div>
        <div className="note note-sun small" style={{ marginBottom: 12 }}>
          <b>Kids-app safety:</b> photos must be toys only. Faces, children, sexual content, violence, or illegal material will be removed and may be escalated for legal action.
        </div>
        {listing.photo_url && (
          <div className="detail-photo" style={{ maxHeight: 160, marginBottom: 12 }}>
            <img src={listing.photo_url} alt="" />
          </div>
        )}
        <form onSubmit={submit}>
          <div className="field"><label>Why are you reporting this?</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {PHOTO_REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field"><label>Details (optional)</label>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={3} placeholder="What did you see?" /></div>
          <label className="note note-sun" style={{ alignItems: "flex-start", cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
            <span>
              <b>Escalate for legal review</b> — I believe this may involve child exploitation, illegal content, or other serious harm. Sandlot admins will preserve evidence, remove the listing, and may involve law enforcement.
            </span>
          </label>
          <div className="grid2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-coral" disabled={busy}>{busy ? "Sending…" : "Submit report"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ListToyForm({
  uid, kids, parent, areaLabel, onCancel, onDone, onFlash,
}: {
  uid: string; kids: Child[]; parent: Parent; areaLabel: string | null | undefined;
  onCancel: () => void;
  onDone: (created: MarketListing | null) => Promise<void>;
  onFlash: (m: string) => void;
}) {
  const [childId, setChildId] = useState(kids[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("fidget");
  const [toyType, setToyType] = useState("pop-it");
  const [colors, setColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [condition, setCondition] = useState("great");
  const [emoji, setEmoji] = useState("🌀");
  const [wants, setWants] = useState("");
  const [photos, setPhotos] = useState<{ blob: Blob; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agree, setAgree] = useState(false);

  const typeSuggestions = TOY_TYPES_BY_CATEGORY[category] || [];

  useEffect(() => {
    setToyType(typeSuggestions[0] || "");
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleColor(c: string) {
    setColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  function addCustomColor() {
    const c = customColor.trim().toLowerCase();
    if (!c) return;
    if (!colors.includes(c)) setColors((prev) => [...prev, c]);
    setCustomColor("");
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setErr("");
    const room = MAX_TOY_PHOTOS - photos.length;
    if (room <= 0) {
      setErr(`You can add up to ${MAX_TOY_PHOTOS} photos.`);
      return;
    }
    const next: { blob: Blob; preview: string }[] = [];
    for (const file of Array.from(fileList).slice(0, room)) {
      const v = validateToyImageFile(file);
      if (v) { setErr(v); continue; }
      try {
        const blob = await compressToyPhoto(file);
        next.push({ blob, preview: URL.createObjectURL(blob) });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't process photo.");
      }
    }
    if (next.length) setPhotos((p) => [...p, ...next].slice(0, MAX_TOY_PHOTOS));
  }

  function removePhoto(idx: number) {
    setPhotos((p) => {
      const copy = [...p];
      const [gone] = copy.splice(idx, 1);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return copy;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) { setErr("Confirm photos are of the toy only — no faces or kids."); return; }
    if (!photos.length) { setErr("Add at least one photo of the toy so others can browse it."); return; }
    setErr(""); setBusy(true);
    try {
      const uploaded: { path: string; url: string }[] = [];
      for (const ph of photos) {
        uploaded.push(await uploadToyPhoto(uid, ph.blob, "jpg"));
      }
      const colorStr = colors.join(", ").slice(0, 120) || null;
      const id = await addListing({
        sessionId: null,
        childId,
        uid,
        toyName: name.trim(),
        category,
        condition,
        wants: wants.trim(),
        emoji,
        areaLabel: areaLabel || null,
        color: colorStr,
        toyType: toyType.trim() || null,
        photoPath: uploaded[0].path,
        photoUrl: uploaded[0].url,
        photoPaths: uploaded.map((u) => u.path),
        photoUrls: uploaded.map((u) => u.url),
      });
      const kid = kids.find((c) => c.id === childId);
      const created: MarketListing = {
        id,
        session_id: null,
        child_id: childId,
        parent_id: uid,
        toy_name: name.trim(),
        category,
        condition,
        wants: wants.trim() || null,
        emoji,
        status: "available",
        area_label: areaLabel || null,
        color: colorStr,
        toy_type: toyType.trim() || null,
        photo_url: uploaded[0].url,
        photo_urls: uploaded.map((u) => u.url),
        photo_status: "ok",
        seller_name: "You",
        seller_area: areaLabel || null,
        kid_nickname: kid?.nickname || "kid",
        kid_avatar: kid?.avatar || null,
      };
      await onDone(created);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't list the toy.");
      onFlash(e2 instanceof Error ? e2.message : "Couldn't list the toy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 12 }}>
      <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>List a toy with photos</h3>
      <div className="note note-sun small" style={{ marginBottom: 12 }}>
        <b>Photo rules (required):</b> clear pictures of the <b>toy only</b> — up to {MAX_TOY_PHOTOS} photos. No kids, faces, or people. Violations can be removed and may lead to legal escalation.
      </div>

      <div className="field">
        <label>Toy photos ({photos.length}/{MAX_TOY_PHOTOS})</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="tiny muted" style={{ margin: "6px 0 0" }}>
          Add several angles if you like. First photo is the cover.
        </p>
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {photos.map((ph, i) => (
              <div key={ph.preview} style={{ position: "relative", width: 88, height: 88 }}>
                <img
                  src={ph.preview}
                  alt={`Toy ${i + 1}`}
                  style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 10, border: i === 0 ? "2px solid var(--clover)" : "1px solid var(--line)" }}
                />
                {i === 0 && (
                  <span className="tiny" style={{ position: "absolute", left: 4, bottom: 4, background: "var(--clover)", color: "#fff", padding: "1px 5px", borderRadius: 4 }}>Cover</span>
                )}
                <button
                  type="button"
                  className="mini-btn"
                  style={{ position: "absolute", top: 2, right: 2, padding: "2px 6px", fontSize: ".7rem" }}
                  onClick={() => removePhoto(i)}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field"><label>Whose toy?</label>
        <select value={childId} onChange={(e) => setChildId(e.target.value)}>
          {kids.map((c) => <option key={c.id} value={c.id}>{c.nickname}</option>)}
        </select>
      </div>
      <div className="field"><label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="e.g. Blue galaxy pop-it" /></div>
      <div className="field"><label>Category</label>
        <div className="chips">{TOY_CATEGORIES.map((c) => (
          <button key={c.code} type="button" className={`chip ${category === c.code ? "on" : ""}`} onClick={() => setCategory(c.code)}>{c.label}</button>
        ))}</div>
      </div>
      <div className="field"><label>Type</label>
        <div className="chips" style={{ marginBottom: 8 }}>
          {typeSuggestions.map((t) => (
            <button key={t} type="button" className={`chip ${toyType === t ? "on" : ""}`} onClick={() => setToyType(t)}>{t}</button>
          ))}
        </div>
        <input value={toyType} onChange={(e) => setToyType(e.target.value)} maxLength={40} placeholder="or type a type…" />
      </div>
      <div className="field">
        <label>Colors (tap all that apply)</label>
        <div className="chips" style={{ marginBottom: 8 }}>
          {TOY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${colors.includes(c) ? "on" : ""}`}
              onClick={() => toggleColor(c)}
              style={{ textTransform: "capitalize" }}
            >{c}</button>
          ))}
        </div>
        {colors.length > 0 && (
          <p className="tiny" style={{ margin: "0 0 6px" }}>
            Selected: <b>{colors.join(", ")}</b>
            {" · "}
            <button type="button" className="linkish" onClick={() => setColors([])}>Clear</button>
          </p>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            maxLength={30}
            placeholder="add another color…"
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomColor(); } }}
          />
          <button type="button" className="btn btn-ghost" style={{ padding: "10px 12px" }} onClick={addCustomColor}>Add</button>
        </div>
      </div>
      <div className="field"><label>Condition</label>
        <div className="chips">{TOY_CONDITIONS.map((c) => (
          <button key={c.code} type="button" className={`chip ${condition === c.code ? "on" : ""}`} onClick={() => setCondition(c.code)}>{c.label}</button>
        ))}</div>
      </div>
      <div className="field"><label>Icon (fallback if photos are hidden)</label>
        <div className="chips">{TOY_EMOJI.map((x) => (
          <button key={x} type="button" className={`chip ${emoji === x ? "on" : ""}`} style={{ fontSize: "1.1rem", padding: "6px 10px" }} onClick={() => setEmoji(x)}>{x}</button>
        ))}</div>
      </div>
      <div className="field"><label>Looking for in return? (optional)</label>
        <input value={wants} onChange={(e) => setWants(e.target.value)} maxLength={80} placeholder="mini cube, surprise me…" /></div>

      <label className="note note-clover" style={{ alignItems: "flex-start", cursor: "pointer", marginBottom: 12 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
        <span>I confirm these photos show <b>only the toy</b> — no people, no faces, no children. I understand violations can be removed and may be reported for legal action.</span>
      </label>

      {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
      <div className="grid2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-coral" disabled={busy || !name.trim() || !childId || !photos.length || !agree}>
          {busy ? "Uploading…" : `List toy${photos.length > 1 ? ` (${photos.length} photos)` : ""}`}
        </button>
      </div>
    </form>
  );
}

function ProposeTradeModal({
  target, myAvailable, sessions, onClose, onFlash, onDone,
}: {
  target: MarketListing;
  myAvailable: MyListing[];
  sessions: SessionRow[];
  onClose: () => void;
  onFlash: (m: string) => void;
  onDone: () => Promise<void>;
}) {
  const [offerId, setOfferId] = useState(myAvailable[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const upcoming = sessions.filter((s) => new Date(s.starts_at).getTime() > Date.now() - 3600_000).slice(0, 12);

  async function send() {
    if (!offerId) return;
    setBusy(true);
    try {
      await proposeTrade({
        targetListingId: target.id,
        offerListingId: offerId,
        message,
        sessionId: sessionId || null,
      });
      onFlash("Trade offer sent! 🤝");
      await onDone();
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Couldn't send offer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="card modal-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <b>Propose a trade</b>
          <button type="button" className="linkish" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {target.photo_url
            ? <img src={target.photo_url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
            : <div className="av" style={{ width: 72, height: 72, fontSize: "2rem" }}>{target.emoji || "🧸"}</div>}
          <div>
            <div className="nm">{target.toy_name}</div>
            <div className="bd">{target.seller_name}</div>
          </div>
        </div>
        <div className="field"><label>Your toy to offer</label>
          <select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            {myAvailable.map((l) => (
              <option key={l.id} value={l.id}>{l.emoji || "🧸"} {l.toy_name} ({catLabel(l.category)})</option>
            ))}
          </select>
        </div>
        <div className="field"><label>Message (optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="We can swap at Saturday's playdate…" rows={3} /></div>
        {upcoming.length > 0 && (
          <div className="field"><label>Suggest a playdate (optional)</label>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Decide later</option>
              {upcoming.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.theme || s.title} · {new Date(s.starts_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy || !offerId} onClick={send}>{busy ? "Sending…" : "Send offer"}</button>
        </div>
      </div>
    </div>
  );
}

function TradeCard({
  trade, sessions, onFlash, onChanged,
}: {
  trade: TradeRow;
  sessions: SessionRow[];
  onFlash: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const session = trade.playdate_session_id
    ? sessions.find((s) => s.id === trade.playdate_session_id)
    : null;

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); onFlash(ok); await onChanged(); }
    catch (e) { onFlash(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span className="chip-sky chip" style={{ padding: "4px 10px" }}>
          {trade.direction === "incoming" ? "Incoming" : "Outgoing"} · {statusLabel(trade.status)}
        </span>
        <span className="tiny muted">{new Date(trade.created_at).toLocaleDateString()}</span>
      </div>
      <div className="small" style={{ marginBottom: 8 }}>
        <b>{trade.target_emoji || "🧸"} {trade.target_name}</b>
        <span className="muted"> ←→ </span>
        <b>{trade.offer_emoji || "🧸"} {trade.offer_name}</b>
      </div>
      <p className="tiny muted" style={{ margin: "0 0 8px" }}>
        {trade.direction === "incoming"
          ? `${trade.from_name} offered their toy for yours.`
          : `You offered your toy to ${trade.to_name}.`}
        {trade.message ? ` “${trade.message}”` : ""}
      </p>
      {session && (
        <div className="note note-clover small" style={{ marginBottom: 8 }}>
          Suggested meet-up: <b>{session.theme || session.title}</b> · {new Date(session.starts_at).toLocaleString()}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {trade.direction === "incoming" && trade.status === "pending" && (
          <>
            <button className="btn btn-primary" style={{ padding: "8px 12px", fontSize: ".82rem" }} disabled={busy}
              onClick={() => act(() => respondTrade(trade.id, true), "Trade accepted — plan the in-person swap! 🎉")}>Accept</button>
            <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} disabled={busy}
              onClick={() => act(() => respondTrade(trade.id, false), "Offer declined.")}>Decline</button>
          </>
        )}
        {trade.status === "accepted" && (
          <button className="btn btn-primary" style={{ padding: "8px 12px", fontSize: ".82rem" }} disabled={busy}
            onClick={() => act(() => completeTrade(trade.id), "Trade marked complete! ✅")}>We swapped — mark done</button>
        )}
        {(trade.status === "pending" || trade.status === "accepted") && (
          <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} disabled={busy}
            onClick={() => act(() => cancelTrade(trade.id), "Trade cancelled.")}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function catLabel(code: string) {
  return TOY_CATEGORIES.find((c) => c.code === code)?.label || code;
}
function condLabel(code: string) {
  return TOY_CONDITIONS.find((c) => c.code === code)?.label || code;
}
function statusLabel(s: string) {
  if (s === "available") return "Available";
  if (s === "swap_planned") return "Trade planned";
  if (s === "claimed") return "Claimed";
  if (s === "swapped") return "Swapped";
  if (s === "withdrawn") return "Withdrawn";
  if (s === "pending") return "Pending";
  if (s === "accepted") return "Accepted";
  if (s === "declined") return "Declined";
  if (s === "cancelled") return "Cancelled";
  if (s === "completed") return "Completed";
  return s;
}
