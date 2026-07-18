"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  childFavoriteIds,
  childFavorites,
  marketBrowse,
  toggleFavorite,
  TOY_CATEGORIES,
  TOY_COLORS,
  type Child,
  type MarketListing,
  type Parent,
} from "@/lib/db";

type Props = {
  parent: Parent;
  kids: Child[];
  onFlash: (m: string) => void;
  onBackToParent: () => void;
};

/** Big simple toy browser for kids (parent account, kid mode). */
export function KidsToysDashboard({ parent, kids, onFlash, onBackToParent }: Props) {
  const [childId, setChildId] = useState(kids[0]?.id || "");
  const [tab, setTab] = useState<"all" | "favs">("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [onlyArea, setOnlyArea] = useState(false);
  const [items, setItems] = useState<MarketListing[]>([]);
  const [favs, setFavs] = useState<MarketListing[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const area = parent.area_label || parent.zip || "";
  const child = kids.find((k) => k.id === childId) || kids[0];

  const load = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const [browse, ids, favorites] = await Promise.all([
        marketBrowse({
          q: q || undefined,
          category: category || undefined,
          color: color || undefined,
          area: area || undefined,
          onlyMyArea: onlyArea,
          childId,
          kidsMode: true,
        }),
        childFavoriteIds(childId),
        childFavorites(childId),
      ]);
      setItems(browse);
      setFavIds(new Set(ids));
      setFavs(favorites);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Couldn't load toys.");
    } finally {
      setLoading(false);
    }
  }, [childId, q, category, color, area, onlyArea, onFlash]);

  // Auto-show available toys; refilter live as criteria change
  useEffect(() => {
    const t = window.setTimeout(() => { load(); }, 180);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (kids.length && !kids.find((k) => k.id === childId)) setChildId(kids[0].id);
  }, [kids, childId]);

  async function heart(listingId: string) {
    if (!childId) return;
    try {
      const res = await toggleFavorite(childId, listingId);
      setFavIds((prev) => {
        const n = new Set(prev);
        if (res === "added") n.add(listingId); else n.delete(listingId);
        return n;
      });
      if (tab === "favs") await load();
      onFlash(res === "added" ? "Saved to favorites! ❤️" : "Removed from favorites");
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Couldn't save favorite.");
    }
  }

  const shown = tab === "favs" ? favs : items;
  const nearCount = useMemo(() => items.filter((i) => i.area_match).length, [items]);

  if (!kids.length) {
    return (
      <div className="pad">
        <button className="btn btn-ghost btn-block" onClick={onBackToParent}>← Parent dashboard</button>
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Add a kid first</h3>
          <p className="small muted">Parents set up kid nicknames, then kids can browse toys here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kids-shell">
      <div className="kids-top">
        <button type="button" className="kids-parent-btn" onClick={onBackToParent}>👨‍👩‍👧 Parent</button>
        <div className="kids-title">Toy browser</div>
        <div className="kids-who">
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`kids-avatar ${childId === k.id ? "on" : ""}`}
              onClick={() => setChildId(k.id)}
            >
              <span>{k.avatar || "🧒"}</span>
              <span className="kids-avatar-name">{k.nickname}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pad">
        <div className="kids-seg">
          <button type="button" className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All toys</button>
          <button type="button" className={tab === "favs" ? "on" : ""} onClick={() => setTab("favs")}>❤️ Favorites</button>
        </div>

        {tab === "all" && (
          <div className="kids-filters card">
            <input
              className="kids-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a toy by name…"
              aria-label="Search toys"
            />
            <div className="chips" style={{ marginTop: 10 }}>
              <button type="button" className={`chip ${!category ? "on" : ""}`} onClick={() => setCategory("")}>All kinds</button>
              {TOY_CATEGORIES.map((c) => (
                <button key={c.code} type="button" className={`chip ${category === c.code ? "on" : ""}`} onClick={() => setCategory(c.code)}>{c.label}</button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <button type="button" className={`chip ${!color ? "on" : ""}`} onClick={() => setColor("")}>Any color</button>
              {TOY_COLORS.slice(0, 10).map((c) => (
                <button key={c} type="button" className={`chip ${color === c ? "on" : ""}`} onClick={() => setColor(c)} style={{ textTransform: "capitalize" }}>{c}</button>
              ))}
            </div>
            {area && (
              <label className="kids-area-toggle">
                <input type="checkbox" checked={onlyArea} onChange={(e) => setOnlyArea(e.target.checked)} />
                <span>Only near {area}{nearCount && !onlyArea ? ` · ${nearCount} close now` : ""}</span>
              </label>
            )}
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              Showing available toys{area && !onlyArea ? ` (closest to ${area} first)` : ""}. Tap ❤️ to save for {child?.nickname || "you"}.
            </p>
          </div>
        )}

        {loading ? (
          <p className="kids-loading">Finding toys…</p>
        ) : shown.length === 0 ? (
          <div className="card" style={{ marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem" }}>{tab === "favs" ? "🤍" : "🔍"}</div>
            <p className="small muted">{tab === "favs" ? "No favorites yet — tap hearts on toys you like!" : "No toys match. Try clearing filters."}</p>
            {tab === "all" && (q || category || color || onlyArea) && (
              <button type="button" className="btn btn-ghost btn-block" onClick={() => { setQ(""); setCategory(""); setColor(""); setOnlyArea(false); }}>Show all toys</button>
            )}
          </div>
        ) : (
          <div className="kids-grid">
            {shown.map((l) => {
              const loved = favIds.has(l.id) || !!l.is_favorite;
              return (
                <div key={l.id} className="kids-toy">
                  <div className="kids-toy-ph">
                    {l.photo_url ? <img src={l.photo_url} alt={l.toy_name} /> : <span className="kids-emoji">{l.emoji || "🧸"}</span>}
                    <button type="button" className={`kids-heart ${loved ? "on" : ""}`} onClick={() => heart(l.id)} aria-label="Favorite">
                      {loved ? "❤️" : "🤍"}
                    </button>
                    {!!l.area_match && <span className="kids-near">Near you</span>}
                  </div>
                  <div className="kids-toy-name">{l.toy_name}</div>
                  <div className="kids-toy-meta">
                    {[l.color, catShort(l.category)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="tiny muted" style={{ textAlign: "center", marginTop: 20 }}>
          Ask a grown-up to set up a swap or playdate. Toys stay with families until you meet in person.
        </p>
      </div>
    </div>
  );
}

function catShort(code: string) {
  return TOY_CATEGORIES.find((c) => c.code === code)?.label?.replace(/^[^\s]+\s/, "") || code;
}
