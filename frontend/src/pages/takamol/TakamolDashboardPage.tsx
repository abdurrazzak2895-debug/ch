import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, CalendarCheck, ListChecks, Ticket, BarChart3, LogIn, Package } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import { getCategories, searchTakamol, type TakamolCategory } from "@/lib/takamol-api";

const QUICK_LINKS = [
  { to: "/takamol/booking", label: "Book an Exam", desc: "Category → center → date → session → reservation", icon: CalendarCheck },
  { to: "/takamol/reservations", label: "My Reservations", desc: "Current booking & exam ticket", icon: ListChecks },
  { to: "/takamol/sessions", label: "Exam Sessions", desc: "Live session lookup & management", icon: Ticket },
  { to: "/takamol/results", label: "Exam Results", desc: "Published results from the portal", icon: BarChart3 },
];

export default function TakamolDashboardPage() {
  const { loggedIn, loading, profile, refresh } = useTakamolAuth();
  const [categories, setCategories] = useState<TakamolCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      setCategoriesError(null);
      const res = await getCategories();
      const list = Array.isArray(res) ? res : (res?.categories || []);
      setCategories(list);
    } catch (err: any) {
      setCategoriesError(err?.message || "Failed to load categories");
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await searchTakamol(query);
      const data = res?.data ?? res;
      // Flatten common shapes: { categories: [] } | { results: [] } | { items: [] } | []
      const list = Array.isArray(data)
        ? data
        : data?.categories || data?.results || data?.items || data?.occupations || [];
      setSearchResults(list);
    } catch (err: any) {
      setSearchError(err?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }, [q]);

  return (
    <div className="tk-container" style={{ padding: 0 }}>
      {!loggedIn && !loading && (
        <div className="tk-msg tk-msg--info">
          <strong>Not logged in.</strong> Categories below are public, but booking, reservations, sessions and
          results need a live portal session.{" "}
          <Link to="/takamol/login" style={{ color: "var(--tk-gold)", fontWeight: 700 }}>
            Start the Playwright login →
          </Link>
        </div>
      )}

      <div className="tk-hero">
        <div className="tk-card-header" style={{ marginBottom: 6 }}>
          <div>
            <h1>Takamol Exam Console</h1>
            <p>
              Live dashboard backed by{" "}
              <code style={{ color: "var(--tk-gold)" }}>takamol-api.up.railway.app</code>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
              {loggedIn ? "Logged in" : "Logged out"}
            </span>
            <button type="button" className="tk-btn tk-btn--sm tk-btn--ghost" onClick={() => refresh()}>
              Refresh
            </button>
          </div>
        </div>
        {profile && (
          <p className="tk-muted" style={{ marginBottom: 0 }}>
            Signed in as <strong className="tk-gold">{profile.name || profile.login || profile.email || "User"}</strong>
            {profile.role ? ` · ${profile.role}` : ""}
          </p>
        )}
        <div className="tk-hero-actions" style={{ marginTop: 14 }}>
          {!loggedIn && (
            <Link to="/takamol/login" className="tk-btn tk-btn--gold">
              <LogIn size={16} />
              Login (noVNC)
            </Link>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="tk-grid tk-grid-2">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.to} to={link.to} style={{ textDecoration: "none" }}>
              <div className="tk-card" style={{ height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--tk-panel-strong)",
                      border: "1px solid var(--tk-panel-border)",
                      color: "var(--tk-gold)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--tk-text)" }}>{link.label}</div>
                    <div className="tk-muted" style={{ fontSize: "0.82rem" }}>{link.desc}</div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <div className="tk-card">
        <h2>
          <Search size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />
          General search
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search categories, occupations…"
            style={{
              flex: 1,
              minWidth: 220,
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--tk-glass-border)",
              borderRadius: 10,
              padding: "11px 13px",
              color: "var(--tk-text)",
              outline: "none",
            }}
          />
          <button type="button" className="tk-btn tk-btn--teal" onClick={runSearch} disabled={searching || !q.trim()}>
            {searching ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <Search size={15} />}
            Search
          </button>
        </div>
        {searchError && <div className="tk-msg tk-msg--error" style={{ marginTop: 12 }}>{searchError}</div>}
        {searchResults.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {searchResults.slice(0, 30).map((item, i) => (
              <div key={`${item?.id ?? i}`} className="tk-row">
                <div className="tk-row-main">
                  <div className="tk-row-title">{item?.name || item?.english_name || item?.label || item?.title || "—"}</div>
                  {item?.occupation_key && <div className="tk-row-sub">Key: {item.occupation_key}</div>}
                  {item?.category && <div className="tk-row-sub">Category: {item.category}</div>}
                </div>
                {item?.id !== undefined && <span className="tk-badge">ID {item.id}</span>}
              </div>
            ))}
          </div>
        )}
        {searching && <div className="tk-loading" style={{ marginTop: 12 }}><span className="tk-spinner" /> Searching…</div>}
      </div>

      {/* Categories */}
      <div className="tk-card">
        <div className="tk-card-header">
          <h2>
            <Package size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />
            Exam categories
          </h2>
          <span className="tk-badge">{categories.length} available</span>
        </div>

        {categoriesLoading ? (
          <div className="tk-loading"><span className="tk-spinner" /> Loading categories…</div>
        ) : categoriesError ? (
          <div className="tk-msg tk-msg--error">{categoriesError}</div>
        ) : categories.length === 0 ? (
          <div className="tk-empty">No categories returned.</div>
        ) : (
          <div className="tk-grid tk-grid-3">
            {categories.slice(0, 60).map((cat) => (
              <Link
                key={cat.id}
                to={`/takamol/booking?category_id=${cat.id}`}
                style={{ textDecoration: "none" }}
              >
                <div className="tk-card" style={{ padding: "14px 16px", height: "100%" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--tk-text)" }}>{cat.name}</div>
                  <div className="tk-muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>ID {cat.id} · Book now →</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

