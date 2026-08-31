import { useCallback, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import { getExamResults, getTakamolBaseUrl } from "@/lib/takamol-api";
import { api } from "@/lib/api";

function pretty(data: any): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

interface VerifyResult {
  reservation_id: string;
  status: string;
  action: string;
  amount?: number;
}

export default function TakamolResultsPage() {
  const { loggedIn } = useTakamolAuth();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerifyResult[] | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const baseUrl = getTakamolBaseUrl();

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await getExamResults();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load exam results");
    } finally {
      setBusy(false);
    }
  }, []);

  const autoVerify = useCallback(async () => {
    setVerifyBusy(true);
    setVerifyError(null);
    setVerifyResults(null);
    try {
      const res: any = await api("/auto-verify-reservations", { method: "POST" });
      setVerifyResults(res?.results || []);
    } catch (err: any) {
      setVerifyError(err?.message || "Failed to auto-verify reservations");
    } finally {
      setVerifyBusy(false);
    }
  }, []);

  const resultsList = Array.isArray(data) ? data : data?.results || data?.data || null;

  return (
    <div className="tk-container" style={{ padding: 0 }}>
      <div className="tk-hero">
        <div className="tk-card-header" style={{ marginBottom: 6 }}>
          <div>
            <h1>Exam Results</h1>
            <p>
              <code>GET /api/exam/results</code> — requires a logged-in portal session.
            </p>
          </div>
          <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
            {loggedIn ? "Logged in" : "Needs login"}
          </span>
        </div>
        <div className="tk-hero-actions">
          <button type="button" className="tk-btn tk-btn--teal" onClick={load} disabled={busy}>
            {busy ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={15} />}
            {busy ? "Loading…" : "Fetch results"}
          </button>
          <button type="button" className="tk-btn tk-btn--gold" onClick={autoVerify} disabled={verifyBusy}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {verifyBusy ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <ShieldCheck size={15} />}
            {verifyBusy ? "Verifying…" : "Auto-verify & Refund"}
          </button>
          {!loggedIn && (
            <a className="tk-btn tk-btn--sm tk-btn--gold" href="/takamol/login">
              <ExternalLink size={14} /> Login first
            </a>
          )}
        </div>
      </div>

      {error && <div className="tk-msg tk-msg--error">{error}</div>}
      {verifyError && <div className="tk-msg tk-msg--error">{verifyError}</div>}

      {verifyResults && (
        <div className="tk-card" style={{ marginTop: 12 }}>
          <div className="tk-card-header">
            <strong>Auto-verify results</strong>
            <span className="tk-badge tk-badge--ok">{verifyResults.length} checked</span>
          </div>
          {verifyResults.length === 0 ? (
            <div style={{ padding: 16, color: "var(--tk-muted)" }}>All reservations are active. No refunds needed.</div>
          ) : (
            <table className="tk-table">
              <thead>
                <tr>
                  <th>Reservation</th>
                  <th>Status</th>
                  <th>Action</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {verifyResults.map((r) => (
                  <tr key={r.reservation_id}>
                    <td>#{r.reservation_id}</td>
                    <td>
                      <span className="tk-badge tk-badge--warn">{r.status}</span>
                    </td>
                    <td>
                      <span className={
                        r.action === "refunded" ? "tk-badge tk-badge--ok" :
                          r.action === "already_refunded" ? "tk-badge tk-badge--teal" :
                            "tk-badge tk-badge--danger"
                      }>
                        {r.action === "refunded" ? "Refunded" :
                          r.action === "already_refunded" ? "Already refunded" :
                            r.action === "no_debit_found" ? "No debit found" :
                              r.action === "refund_failed" ? "Refund failed" :
                                r.action}
                      </span>
                    </td>
                    <td>{r.amount != null ? r.amount.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {data === null && !error ? (
        <div className="tk-empty">
          <BarChart3 size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>No results loaded yet. Press "Fetch results".</div>
        </div>
      ) : resultsList && Array.isArray(resultsList) && resultsList.length > 0 ? (
        <div className="tk-card">
          <table className="tk-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Category</th>
                <th>Result</th>
                <th>Date</th>
                <th>Center</th>
              </tr>
            </thead>
            <tbody>
              {resultsList.slice(0, 100).map((r: any, i: number) => {
                const result = String(
                  r?.result || r?.exam_result || r?.final_result || r?.status || "—"
                ).toLowerCase();
                return (
                  <tr key={r?.id ?? r?.session_id ?? i}>
                    <td>{r?.full_name || r?.name || r?.applicant_name || "—"}</td>
                    <td>{r?.category?.name || r?.category || r?.category_id || "—"}</td>
                    <td>
                      <span className={result === "passed" || result === "pass" ? "tk-badge tk-badge--ok" : result === "failed" || result === "fail" ? "tk-badge tk-badge--danger" : "tk-badge"}>
                        {result || "—"}
                      </span>
                    </td>
                    <td>{r?.exam_date || r?.test_date || r?.date || "—"}</td>
                    <td>{r?.center_name || r?.test_center_name || r?.test_center?.name || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : data !== null ? (
        <div className="tk-card">
          <div className="tk-card-header">
            <strong>Raw response</strong>
            <span className="tk-badge tk-badge--ok">Received</span>
          </div>
          <pre style={{ margin: 0, fontSize: "0.8rem", overflowX: "auto", color: "var(--tk-muted)" }}>{pretty(data)}</pre>
        </div>
      ) : null}
    </div>
  );
}
