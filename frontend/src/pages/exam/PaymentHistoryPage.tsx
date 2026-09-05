import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchPaymentHistory, summarizePayments, classifyPaymentStatus, type PaymentRecord } from "@/lib/payments";
import "@/styles/dashboard-premium.css";

function formatTimestamp(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const BADGE_LABEL: Record<PaymentRecord["status"], string> = { success: "Successful", failed: "Failed", pending: "Pending", unknown: "Unknown" };

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [source, setSource] = useState("");
  const pageSize = 10;

  useEffect(() => { loadPayments(); }, []);

  async function loadPayments() {
    setLoading(true);
    setError("");
    try {
      const { records, source: src } = await fetchPaymentHistory();
      setPayments(records);
      setSource(src);
      setPage(0);
    } catch (err: any) {
      setPayments([]);
      setError(err?.message || "Failed to load payment history");
    } finally {
      setLoading(false);
    }
  }

  const summary = summarizePayments(payments);
  const pageCount = Math.max(1, Math.ceil(payments.length / pageSize));
  const visible = payments.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="dp-shell">
      <main className="dp-main">
        <header className="dp-topbar">
          <div className="dp-topbar-left">
            <Link className="dp-menu-btn" to="/dashboard">← Back</Link>
            <div className="dp-page-title"><small>Payments</small>Payment History</div>
          </div>
          <button className="dp-btn" type="button" onClick={loadPayments} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
        </header>

        <section className="dp-stats">
          <div className="dp-stat dp-stat--gold"><span className="dp-stat-label">Total</span><strong>{loading ? "…" : summary.total}</strong></div>
          <div className="dp-stat dp-stat--green"><span className="dp-stat-label">Successful</span><strong>{loading ? "…" : summary.success}</strong></div>
          <div className="dp-stat dp-stat--amber"><span className="dp-stat-label">Pending</span><strong>{loading ? "…" : summary.pending}</strong></div>
          <div className="dp-stat dp-stat--red"><span className="dp-stat-label">Failed</span><strong>{loading ? "…" : summary.failed}</strong></div>
        </section>

        {source === "reservation-embedded" && <div className="dp-note" style={{ marginBottom: 14 }}>Showing payments derived from your reservations.</div>}
        {error && <div className="dp-error">{error}</div>}
        {loading && <div className="dp-empty">Loading payment history…</div>}
        {!loading && !payments.length && !error && <div className="dp-empty">No payment attempts found yet.</div>}

        {!loading && payments.length ? (
          <section className="dp-panel">
            <div className="dp-table-wrap">
              <table className="dp-table">
                <thead><tr><th>Payment ID</th><th>Reservation</th><th>Occupation</th><th>Date & time</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
                <tbody>{visible.map((p, idx) => (
                  <tr key={`${p.paymentId}-${p.reservationId}-${idx}`}>
                    <td>{p.paymentId}</td>
                    <td>#{p.reservationId}</td>
                    <td>{p.occupation}</td>
                    <td>{formatTimestamp(p.createdAt)}</td>
                    <td>{p.amount === "-" ? "-" : `${p.amount} ${p.currency}`}</td>
                    <td>{p.method}</td>
                    <td><span className={`dp-badge dp-badge--${p.status}`}>{BADGE_LABEL[p.status]}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {payments.length > pageSize && (
              <div className="dp-pagination">
                <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, payments.length)} of {payments.length}</span>
                <div>
                  <button className="dp-btn" type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
                  <span className="dp-page-count">Page {page + 1} of {pageCount}</span>
                  <button className="dp-btn" type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</button>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
