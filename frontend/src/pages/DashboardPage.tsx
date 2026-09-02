import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiAuth, clearSession, getSession } from "@/lib/api";
import {
  fetchPaymentHistory,
  summarizePayments,
  classifyPaymentStatus,
  type PaymentRecord,
} from "@/lib/payments";
import "@/styles/dashboard-premium.css";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessWalletApi } from "@/lib/access-api";

interface DashboardWalletTransaction {
  id: string;
  direction: "credit" | "debit";
  transaction_type: string;
  description?: string | null;
  amount: number | string;
  balance_after: number | string;
  created_at: string;
}

interface DashboardDepositRequest {
  id: string;
  payment_method: string;
  amount: number | string;
  status: string;
  created_at: string;
}

interface DashboardWalletData {
  account: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    agency_id?: string | null;
    self_registered?: boolean;
  };
  permissions: Record<string, boolean>;
  billingSettings?: {
    booking_credit_cost: number | string;
    source?: string;
    payment_methods?: Array<{ code: string; label: string; receiver_account: string; instructions?: string | null }>;
  };
  wallet: { balance: number | string; currency: string };
  transactions: DashboardWalletTransaction[];
  deposits: DashboardDepositRequest[];
  notice?: { enabled: boolean; message: string } | null;
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

function formatTimestamp(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function initialsFrom(text: string | undefined | null) {
  if (!text) return "U";
  const clean = String(text).trim();
  if (!clean) return "U";
  const parts = clean.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.charAt(0) || "U";
  const second = parts[1]?.charAt(0) || "";
  return (first + second).toUpperCase();
}

const BADGE_LABEL: Record<PaymentRecord["status"], string> = {
  success: "Successful",
  failed: "Failed",
  pending: "Pending",
  unknown: "Unknown",
};

function pickReservationArray(payload: any): any[] {
  const singleHints = ["reservation_id", "reservation_status", "final_result", "labor", "test_center", "prometric_data"];
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && singleHints.some((key) => key in payload)) return [payload];
  const candidates = [
    payload?.data, payload?.items, payload?.result, payload?.payload,
    payload?.exam_reservations, payload?.reservations,
    payload?.data?.items, payload?.data?.result, payload?.data?.payload,
    payload?.data?.exam_reservations, payload?.data?.reservations,
    payload?.result?.items, payload?.result?.exam_reservations,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item;
    if (item && typeof item === "object" && singleHints.some((key) => key in item)) return [item];
  }
  return [];
}

function reservationValue(item: any, keys: string[]) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== "") return item[key];
    if (item?.data?.[key] !== undefined && item?.data?.[key] !== null && item?.data?.[key] !== "") return item.data[key];
    if (item?.exam_session?.[key] !== undefined && item?.exam_session?.[key] !== null && item.exam_session[key] !== "") return item.exam_session[key];
  }
  return "";
}

function reservationId(item: any) {
  return String(reservationValue(item, ["id", "reservation_id", "exam_reservation_id"]) || "-");
}

function reservationOccupation(item: any) {
  return String(
    item?.occupation?.english_name || item?.occupation?.name ||
    item?.exam_session?.occupation?.english_name || item?.exam_session?.occupation?.name ||
    reservationValue(item, ["occupation_name", "occupation_english_name", "occupation_id"]) || "-"
  );
}

function reservationDate(item: any) {
  return String(
    item?.exam_session?.test_date || item?.exam_session?.start_at_in_browser_time_zone ||
    reservationValue(item, ["exam_date", "scheduled_at", "date", "test_date", "start_at_in_browser_time_zone", "start_at"]) || ""
  );
}

function reservationCenter(item: any) {
  return String(
    item?.exam_session?.test_center?.test_center_name || item?.exam_session?.test_center?.name ||
    item?.test_center?.test_center_name || item?.test_center?.name ||
    reservationValue(item, ["test_center_name", "site_city", "city"]) || "-"
  );
}

function reservationState(item: any) {
  const raw = String(reservationValue(item, ["reservation_status", "status", "cbt_exam_status", "final_result"]) || "").trim();
  const normalized = raw.toLowerCase();
  const type = /fail|declin|reject|cancel|expired|void|error|unsuccessful/.test(normalized)
    ? "failed"
    : /pending|processing|hold|initiated|created|payment_required/.test(normalized)
      ? "pending"
      : /pass|success|successful|booked|confirm|complete|settled|captured|paid/.test(normalized)
        ? "success"
        : "unknown";
  return { type, label: raw ? raw.replace(/[_-]+/g, " ") : "Unknown" } as const;
}

function dashboardPaymentStatus(item: any, payments: PaymentRecord[]) {
  const id = reservationId(item);
  const local = localStorage.getItem(`paymentStatus:${id}`);
  if (local === "success" || local === "failed" || local === "pending") return local as PaymentRecord["status"];
  const matching = payments.find((payment) => payment.reservationId === id);
  if (matching) return matching.status;
  const raw = reservationValue(item, ["payment_status", "paymentStatus", "pay_status", "paid_status"]);
  return classifyPaymentStatus(String(raw || ""));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user: accessUser, hasPermission } = useAccessAuth();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsSource, setPaymentsSource] = useState<string>("");
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [reservationsError, setReservationsError] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState("");
  const [walletData, setWalletData] = useState<DashboardWalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState("");
  const [depositForm, setDepositForm] = useState({ amount: "", paymentMethod: "", paymentReference: "", note: "" });
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositMessage, setDepositMessage] = useState("");
  const [depositError, setDepositError] = useState("");

  useEffect(() => {
    const { accessToken } = getSession();
    if (!accessToken) { navigate("/auth/login"); return; }
    const payload = decodeJwtPayload(accessToken);
    setMe(payload ? { login: payload.login || "User", name: payload.name, role: payload.role } : { login: "User" });
    setLoading(false);
    void loadPayments();
    void loadReservations();
    void loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function loadPayments() {
    setPaymentsLoading(true);
    setPaymentsError("");
    try {
      const { records, source } = await fetchPaymentHistory();
      setPayments(records);
      setPaymentsSource(source);
    } catch (err: any) {
      setPayments([]);
      setPaymentsError(err?.message || "Failed to load payment history");
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function loadReservations() {
    setReservationsLoading(true);
    setReservationsError("");
    try {
      const data = await api("/exam-reservations?locale=en");
      setReservations(pickReservationArray(data).slice(0, 8));
    } catch (err: any) {
      setReservations([]);
      setReservationsError(err?.message || "Failed to load booking status");
    } finally {
      setReservationsLoading(false);
    }
  }

  async function loadWallet() {
    setWalletLoading(true);
    setWalletError("");
    try {
      setWalletData(await accessWalletApi<DashboardWalletData>("/me"));
    } catch (err: any) {
      setWalletData(null);
      setWalletError(err?.data?.message || err?.message || "Failed to load wallet");
    } finally {
      setWalletLoading(false);
    }
  }

  async function submitDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDepositMessage("");
    setDepositError("");
    setDepositSubmitting(true);
    try {
      await accessWalletApi("/deposits", {
        body: {
          amount: Number(depositForm.amount),
          paymentMethod: depositForm.paymentMethod,
          paymentReference: depositForm.paymentReference,
          note: depositForm.note,
        },
      });
      setDepositForm({ amount: "", paymentMethod: "", paymentReference: "", note: "" });
      setDepositMessage("Deposit request submitted successfully. Your agency or administrator can now review it.");
      await loadWallet();
    } catch (err: any) {
      setDepositError(err?.data?.message || err?.message || "Deposit request failed");
    } finally {
      setDepositSubmitting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    try {
      const { sessionId } = getSession();
      await apiAuth("/logout", { sessionId });
    } catch (err: any) {
      setError(err?.message || "Logout failed");
    } finally {
      clearSession();
      setLoggingOut(false);
      navigate("/auth/login");
    }
  }

  const summary = summarizePayments(payments);
  const account = walletData?.account || accessUser;
  const selectedDepositMethod = walletData?.billingSettings?.payment_methods?.find((item) => item.code === depositForm.paymentMethod);
  const displayName = account?.name || me?.name || me?.login || "User";
  const initials = useMemo(() => initialsFrom(displayName), [displayName]);

  return (
    <div className={`dp-shell${menuOpen ? " dp-shell--menu-open" : ""}`}>
      <div className="dp-backdrop" onClick={() => setMenuOpen(false)} />

      <aside className={`dp-sidebar${menuOpen ? " dp-sidebar--open" : ""}`}>
        <div className="dp-brand">
          <div className="dp-brand-mark">S</div>
          <div>
            <strong>Professional</strong>
            <span>Accreditation</span>
          </div>
        </div>

        <nav className="dp-nav">
          <div className="dp-nav-label">Overview</div>
          <Link className="dp-nav-item dp-nav-item--active" to="/dashboard" onClick={() => setMenuOpen(false)}>
            <span className="dp-nav-ico">◈</span> Account Dashboard
          </Link>

          <div className="dp-nav-label" style={{ marginTop: 12 }}>Exams</div>
          {hasPermission("reservation.manage") && <Link className="dp-nav-item" to="/exam/reservations" onClick={() => setMenuOpen(false)}>
            <span className="dp-nav-ico">☰</span> My bookings
          </Link>}
          <Link className="dp-nav-item" to="/exam/booking" onClick={() => setMenuOpen(false)}>
            <span className="dp-nav-ico">+</span> New booking
          </Link>
          <Link className="dp-nav-item" to="/wallet" onClick={() => setMenuOpen(false)}>
            <span className="dp-nav-ico">¤</span> Wallet & credits
          </Link>
        </nav>

        <div className="dp-side-foot">
          <strong>Need a hand?</strong>
          Every payment attempt is tracked below. Failed or pending payments can be retried from the booking page.
        </div>
      </aside>

      <main className="dp-main">
        <header className="dp-topbar">
          <div className="dp-topbar-left">
            <button className="dp-menu-btn" type="button" aria-label="Toggle menu" onClick={() => setMenuOpen((v) => !v)}>
              ☰
            </button>
            <div className="dp-page-title">
              <small>Overview</small>
              Account dashboard
            </div>
          </div>

          <div className="dp-topbar-right">
            <div className="dp-user">
              <div className="dp-avatar">{initials}</div>
              <div className="dp-user-copy">
                <strong>{loading ? "Loading…" : displayName}</strong>
                <span>{me?.role || "Labor"}</span>
              </div>
            </div>
            <button className="dp-logout" type="button" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "Logging out…" : "Logout"}
            </button>
          </div>
        </header>

        <section className="dp-hero">
          <div className="dp-hero-content">
            <div>
              <span className="dp-hero-eyebrow">Command centre</span>
              <h1>Advance your career through <em>professional</em> accreditation</h1>
              <p>Manage bookings, review reservations and track every payment attempt from one premium workspace — always in sync with the official SVP platform.</p>
              <div className="dp-hero-actions">
                <Link className="dp-hero-cta" to="/exam/booking">Start Verification →</Link>
                {hasPermission("reservation.manage") && <Link className="dp-hero-cta dp-hero-cta--ghost" to="/exam/reservations">View bookings</Link>}
              </div>
            </div>
            <div className="dp-hero-aside">
              <div className="dp-hero-aside-title">Snapshot</div>
              <div className="dp-hero-mini-stats">
                <div className="dp-hero-mini-stat">
                  <span>Total payments</span>
                  <strong>{paymentsLoading ? "…" : summary.total}</strong>
                </div>
                <div className="dp-hero-mini-stat">
                  <span>Successful</span>
                  <strong style={{ color: "var(--dp-green)" }}>{paymentsLoading ? "…" : summary.success}</strong>
                </div>
                <div className="dp-hero-mini-stat">
                  <span>Pending</span>
                  <strong style={{ color: "var(--dp-amber)" }}>{paymentsLoading ? "…" : summary.pending}</strong>
                </div>
                <div className="dp-hero-mini-stat">
                  <span>Failed</span>
                  <strong style={{ color: "var(--dp-red)" }}>{paymentsLoading ? "…" : summary.failed}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error ? <div className="dp-error">{error}</div> : null}

        {walletData?.notice?.enabled && walletData.notice.message ? (
          <div
            style={{
              background: "#fff4e0",
              border: "1px solid #f0c674",
              borderRadius: 10,
              padding: "14px 18px",
              margin: "0 0 20px",
              color: "#5a4200",
              fontSize: 14.5,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {walletData.notice.message}
          </div>
        ) : null}

        <section className="dp-panel dp-account-panel">
          <div className="dp-panel-head">
            <div><h2>My account</h2><span className="dp-sub">Your candidate identity and account access details.</span></div>
            <span className="dp-badge dp-badge--success">{account?.status || "ACTIVE"}</span>
          </div>
          <div className="dp-account-grid">
            <div><span>Full name</span><strong>{account?.name || displayName}</strong></div>
            <div><span>Email address</span><strong>{account?.email || "Not available"}</strong></div>
            <div><span>Account role</span><strong>{account?.role || "USER"}</strong></div>
            <div><span>Account ID</span><strong className="dp-account-id">{account?.id || "Loading…"}</strong></div>
          </div>
        </section>

        <section className="dp-stats">
          <div className="dp-stat dp-stat--gold">
            <div className="dp-stat-head"><div className="dp-stat-ico">¤</div></div>
            <span className="dp-stat-label">Available credits</span>
            <strong>{walletLoading ? "…" : Number(walletData?.wallet?.balance || 0).toFixed(2)}</strong>
          </div>
          <div className="dp-stat dp-stat--gold">
            <div className="dp-stat-head">
              <div className="dp-stat-ico">◈</div>
            </div>
            <span className="dp-stat-label">Total payments</span>
            <strong>{paymentsLoading ? "…" : summary.total}</strong>
          </div>
          <div className="dp-stat dp-stat--green">
            <div className="dp-stat-head">
              <div className="dp-stat-ico">✓</div>
            </div>
            <span className="dp-stat-label">Successful</span>
            <strong>{paymentsLoading ? "…" : summary.success}</strong>
          </div>
          <div className="dp-stat dp-stat--red">
            <div className="dp-stat-head">
              <div className="dp-stat-ico">×</div>
            </div>
            <span className="dp-stat-label">Failed</span>
            <strong>{paymentsLoading ? "…" : summary.failed}</strong>
          </div>
          <div className="dp-stat dp-stat--amber">
            <div className="dp-stat-head">
              <div className="dp-stat-ico">⌛</div>
            </div>
            <span className="dp-stat-label">Pending</span>
            <strong>{paymentsLoading ? "…" : summary.pending}</strong>
          </div>
        </section>

        <section className="dp-panel dp-bookings-panel">
          <div className="dp-panel-head">
            <div><h2>Booking status</h2><span className="dp-sub">Every reservation is listed with its current booking and payment outcome.</span></div>
            <div style={{ display: "flex", gap: "10px" }}><button className="dp-btn" type="button" onClick={loadReservations} disabled={reservationsLoading}>{reservationsLoading ? "Refreshing…" : "↻ Refresh"}</button><Link className="dp-btn" to="/exam/reservations">Open My bookings →</Link></div>
          </div>
          {reservationsError && <div className="dp-error">{reservationsError}</div>}
          {reservationsLoading ? <div className="dp-empty">Loading booking status…</div> : !reservations.length && !reservationsError ? <div className="dp-empty">No bookings found yet. Completed and failed attempts will appear here.</div> : null}
          {!reservationsLoading && reservations.length ? (
            <div className="dp-table-wrap">
              <table className="dp-table">
                <thead><tr><th>Booking</th><th>Occupation</th><th>Exam date</th><th>Booking status</th><th>Payment status</th></tr></thead>
                <tbody>{reservations.map((item, index) => {
                  const bookingState = reservationState(item);
                  const paymentState = dashboardPaymentStatus(item, payments);
                  return <tr key={`${reservationId(item)}-${index}`}>
                    <td><strong>#{reservationId(item)}</strong><small>{reservationCenter(item)}</small></td>
                    <td>{reservationOccupation(item)}</td>
                    <td>{reservationDate(item) ? formatTimestamp(reservationDate(item)) : "-"}</td>
                    <td><span className={`dp-badge dp-badge--${bookingState.type}`}>{bookingState.label}</span></td>
                    <td><span className={`dp-badge dp-badge--${paymentState}`}>{BADGE_LABEL[paymentState]}</span></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="dp-panel">
          <div className="dp-panel-head">
            <div><h2>Wallet & credit history</h2><span className="dp-sub">Your live balance, deposits, manual credits and booking debits.</span></div>
            <div style={{ display: "flex", gap: "10px" }}><button className="dp-btn" type="button" onClick={loadWallet} disabled={walletLoading}>{walletLoading ? "Refreshing…" : "↻ Refresh"}</button><Link className="dp-btn" to="/wallet">Open wallet →</Link></div>
          </div>
          {walletError && <div className="dp-error">{walletError}</div>}
          {!walletError && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px", marginBottom: "18px" }}>
            <div className="dp-stat dp-stat--green"><span className="dp-stat-label">Current balance</span><strong>{walletLoading ? "…" : Number(walletData?.wallet?.balance || 0).toFixed(2)}</strong><small>{walletData?.wallet?.currency || "CREDIT"}</small></div>
            <div className="dp-stat dp-stat--amber"><span className="dp-stat-label">Deposit requests</span><strong>{walletLoading ? "…" : walletData?.deposits?.length || 0}</strong><small>{walletData?.deposits?.filter((item) => item.status === "PENDING").length || 0} pending</small></div>
            <div className="dp-stat dp-stat--gold"><span className="dp-stat-label">Booking credit cost</span><strong>{walletLoading ? "…" : Number(walletData?.billingSettings?.booking_credit_cost || 0).toFixed(2)}</strong><small>Set by {walletData?.billingSettings?.source === "AGENCY" ? "your Agency" : "administrator"}</small></div>
          </div>}

          <div className="dp-deposit-box">
            <div className="dp-deposit-copy">
              <span className="dp-deposit-eyebrow">ADD CREDIT</span>
              <h3>Request a deposit</h3>
              <p>Submit your payment details here. Your balance updates only after your agency or administrator approves the request.</p>
            </div>
            {walletLoading && !walletData ? (
              <div className="dp-permission-note">Loading your deposit permission…</div>
            ) : walletData?.permissions?.["wallet.deposit"] ? (
              <form className="dp-deposit-form" onSubmit={submitDeposit}>
                <label><span>Amount *</span><input type="number" min="0.01" max="1000000" step="0.01" placeholder="0.00" value={depositForm.amount} onChange={(event) => setDepositForm({ ...depositForm, amount: event.target.value })} required /></label>
                <label><span>Payment method *</span><select value={depositForm.paymentMethod} onChange={(event) => setDepositForm({ ...depositForm, paymentMethod: event.target.value })} required><option value="">Select payment method</option>{walletData?.billingSettings?.payment_methods?.map((method) => <option key={method.code} value={method.code}>{method.label} · {method.receiver_account}</option>)}</select></label>
                <label><span>Payment reference</span><input maxLength={160} placeholder="Transaction/reference ID" value={depositForm.paymentReference} onChange={(event) => setDepositForm({ ...depositForm, paymentReference: event.target.value })} /></label>
                <label><span>Note</span><input maxLength={500} placeholder="Optional note" value={depositForm.note} onChange={(event) => setDepositForm({ ...depositForm, note: event.target.value })} /></label>
                <button className="dp-btn dp-btn--primary" type="submit" disabled={depositSubmitting || walletLoading}>{depositSubmitting ? "Submitting…" : "Submit deposit request"}</button>
                {selectedDepositMethod && <div className="dp-permission-note" style={{ gridColumn: "1 / -1" }}>Send payment to <strong>{selectedDepositMethod.label} {selectedDepositMethod.receiver_account}</strong>. {selectedDepositMethod.instructions || "Enter the transaction ID as your payment reference."}</div>}
              </form>
            ) : (
              <div className="dp-permission-note">Deposit requests are not enabled for this account. Contact your agency or administrator to enable the wallet deposit permission.</div>
            )}
            {depositMessage && <div className="dp-success">{depositMessage}</div>}
            {depositError && <div className="dp-error dp-form-message">{depositError}</div>}
          </div>

          <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>Recent credit & debit history</h3>
          <div className="dp-table-wrap"><table className="dp-table"><thead><tr><th>Description</th><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead><tbody>
            {walletData?.transactions?.slice(0, 8).map((item) => <tr key={item.id}><td>{item.description || item.transaction_type}</td><td>{formatTimestamp(item.created_at)}</td><td><span className={`dp-badge dp-badge--${item.direction === "credit" ? "success" : "failed"}`}>{item.direction}</span></td><td style={{ color: item.direction === "credit" ? "var(--dp-green)" : "var(--dp-red)", fontWeight: 800 }}>{item.direction === "credit" ? "+" : "−"}{Number(item.amount).toFixed(2)}</td><td>{Number(item.balance_after).toFixed(2)}</td></tr>)}
            {!walletLoading && !walletData?.transactions?.length && <tr><td colSpan={5}>No credit or debit history yet.</td></tr>}
          </tbody></table></div>

          <h3 style={{ margin: "20px 0 10px", fontSize: "15px" }}>Recent deposits</h3>
          <div className="dp-table-wrap"><table className="dp-table"><thead><tr><th>Method</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
            {walletData?.deposits?.slice(0, 5).map((item) => <tr key={item.id}><td>{item.payment_method}</td><td>{formatTimestamp(item.created_at)}</td><td>{Number(item.amount).toFixed(2)}</td><td><span className={`dp-badge dp-badge--${item.status === "APPROVED" ? "success" : item.status === "REJECTED" ? "failed" : "pending"}`}>{item.status}</span></td></tr>)}
            {!walletLoading && !walletData?.deposits?.length && <tr><td colSpan={4}>No deposit requests yet.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="dp-panel">
          <div className="dp-panel-head">
            <div>
              <h2>Payment History</h2>
              <span className="dp-sub">
                Every payment attempt — successful, failed and pending.
                {paymentsSource === "reservation-embedded" ? " (derived from your reservations)" : ""}
              </span>
            </div>
            <button className="dp-btn" type="button" onClick={loadPayments} disabled={paymentsLoading}>
              {paymentsLoading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {paymentsError ? <div className="dp-error">{paymentsError}</div> : null}
          {paymentsLoading ? <div className="dp-empty">Loading payment history…</div> : null}
          {!paymentsLoading && !payments.length && !paymentsError ? (
            <div className="dp-empty">No payment attempts found yet. They will appear here after your first booking payment.</div>
          ) : null}

          {!paymentsLoading && payments.length ? (
            <div className="dp-table-wrap">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Payment ID</th>
                    <th>Reservation</th>
                    <th>Occupation</th>
                    <th>Date &amp; time</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={`${p.paymentId}-${p.reservationId}-${idx}`}>
                      <td>{p.paymentId}</td>
                      <td>#{p.reservationId}</td>
                      <td>{p.occupation}</td>
                      <td>{formatTimestamp(p.createdAt)}</td>
                      <td>{p.amount === "-" ? "-" : `${p.amount} ${p.currency}`}</td>
                      <td>{p.method}</td>
                      <td><span className={`dp-badge dp-badge--${p.status}`}>{BADGE_LABEL[p.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="dp-note">Need to complete a failed or pending payment? Open the Booking page — a retry banner appears there automatically.</p>
        </section>

        <section className="dp-panel">
          <div className="dp-panel-head">
            <div>
              <h2>Manage your exam bookings</h2>
              <span className="dp-sub">Book, review, reschedule or cancel from these quick actions.</span>
            </div>
          </div>

          <div className="dp-quick">
            <Link to="/exam/booking" className="dp-quick-card">
              <div className="dp-quick-ico">+</div>
              <h3>New booking</h3>
              <p>Search occupations, pick a centre and reserve a seat in a few taps.</p>
              <em>Book now →</em>
            </Link>
            {hasPermission("reservation.manage") && <Link to="/exam/reservations" className="dp-quick-card">
              <div className="dp-quick-ico">☰</div>
              <h3>My bookings</h3>
              <p>Review upcoming exams, download tickets and reschedule when needed.</p>
              <em>View bookings →</em>
            </Link>}
            <Link to="/exam/booking" className="dp-quick-card">
              <div className="dp-quick-ico">↻</div>
              <h3>Retry payment</h3>
              <p>Failed or pending payment? Reopen the booking to complete it in seconds.</p>
              <em>Complete payment →</em>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
