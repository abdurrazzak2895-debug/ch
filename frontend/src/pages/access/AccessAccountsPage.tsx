import { useState, useEffect } from "react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";
import "@/styles/access-dashboard-premium.css";
import { useNavigate, Link, useLocation } from "react-router-dom";

interface Account {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  agency_id?: string;
  created_at: string;
}

export default function AccessAccountsPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Password change modal
  const [pwModalId, setPwModalId] = useState<string | null>(null);
  const [pwModalName, setPwModalName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  async function fetchAccounts() {
    setLoading(true);
    try {
      let query = "/accounts";
      const params: string[] = [];
      if (filterRole) params.push(`role=${filterRole}`);
      if (filterStatus) params.push(`status=${filterStatus}`);
      if (params.length) query += `?${params.join("&")}`;
      const res = await accessAdminApi(query);
      setAccounts(res.accounts || []);
    } catch (err: any) {
      setMsg(err?.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();
  }, [filterRole, filterStatus]);

  async function toggleStatus(acc: Account) {
    const newStatus = acc.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await accessAdminApi(`/accounts/${acc.id}/status`, { method: "PATCH", body: { status: newStatus } });
      setMsg(`${acc.name} is now ${newStatus}`);
      fetchAccounts();
    } catch (err: any) {
      setMsg(err?.message || "Failed to update status");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwModalId) return;
    setPwLoading(true);
    setPwMsg("");
    try {
      await accessAdminApi(`/accounts/${pwModalId}/password`, { method: "PATCH", body: { password: newPassword } });
      setPwMsg("Password updated successfully!");
      setNewPassword("");
      setTimeout(() => { setPwModalId(null); setPwMsg(""); }, 1500);
    } catch (err: any) {
      setPwMsg(err?.message || "Failed to update password");
    } finally {
      setPwLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/access/login");
  }

  const thStyle: React.CSSProperties = { padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 };
  const tdStyle: React.CSSProperties = { padding: "12px 16px" };

  return (
    <div className="dashboard-shell ap-console">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div><strong>Access</strong><span>Control Panel</span></div>
        </div>
        <nav className="sidebar-nav">
          <Link className={`nav-item ${location.pathname === "/access/dashboard" ? "nav-item--active" : ""}`} to="/access/dashboard">Dashboard</Link>
          <Link className={`nav-item ${location.pathname === "/access/accounts" ? "nav-item--active" : ""}`} to="/access/accounts">User Management</Link>
          <Link className={`nav-item ${location.pathname === "/access/users" ? "nav-item--active" : ""}`} to="/access/users">Create Users</Link>
          <Link className={`nav-item ${location.pathname === "/access/finance" ? "nav-item--active" : ""}`} to="/access/finance">Permissions & Wallets</Link>
          <Link className={`nav-item ${location.pathname === "/access/agencies" ? "nav-item--active" : ""}`} to="/access/agencies">Create Agency</Link>
          <Link className={`nav-item ${location.pathname === "/access/test-centers" ? "nav-item--active" : ""}`} to="/access/test-centers">Test Centers</Link>
          <Link className={`nav-item ${location.pathname === "/access/session-centers" ? "nav-item--active" : ""}`} to="/access/session-centers">Session Centers</Link>
          <Link className={`nav-item ${location.pathname === "/access/section-rules" ? "nav-item--active" : ""}`} to="/access/section-rules">Section Rules</Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__user">
            <div className="avatar" />
            <div><strong>{user?.name || "Admin"}</strong><span>{user?.role}</span></div>
            <button className="logout-btn" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section style={{ padding: "24px 40px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
            <h1 style={{ margin: 0 }}>User Management</h1>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Link to="/access/users" style={{ padding: "8px 14px", borderRadius: "8px", background: "#4f5fff", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 700 }}>Create User</Link>
              <Link to="/access/finance" style={{ padding: "8px 14px", borderRadius: "8px", background: "#eef0ff", color: "#4f5fff", textDecoration: "none", fontSize: "13px", fontWeight: 700 }}>Permissions & Wallets</Link>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #ccc" }}>
              <option value="">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="AGENCY">Agency</option>
              <option value="USER">User</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #ccc" }}>
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>

          {msg && <div style={{ background: "#e8f5e9", color: "#2e7d32", padding: "10px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px" }}>{msg}</div>}

          {loading ? (
            <p>Loading...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: "12px", overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f5f7fa", textAlign: "left" }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Phone</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id} style={{ borderTop: "1px solid #e8ecf0" }}>
                      <td style={tdStyle}>{acc.name}</td>
                      <td style={tdStyle}>{acc.email}</td>
                      <td style={tdStyle}>{acc.phone || "-"}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700,
                          background: acc.role === "ADMIN" ? "#ede7f6" : acc.role === "AGENCY" ? "#e3f2fd" : "#f1f8e9",
                          color: acc.role === "ADMIN" ? "#6a1b9a" : acc.role === "AGENCY" ? "#1565c0" : "#33691e",
                        }}>
                          {acc.role}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700,
                          background: acc.status === "ACTIVE" ? "#e8f5e9" : acc.status === "BLOCKED" ? "#ffebee" : "#fff3e0",
                          color: acc.status === "ACTIVE" ? "#2e7d32" : acc.status === "BLOCKED" ? "#c62828" : "#e65100",
                        }}>
                          {acc.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {acc.id !== user?.id && (
                          <button
                            onClick={() => toggleStatus(acc)}
                            style={{
                              width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer",
                              background: acc.status === "ACTIVE" ? "#4caf50" : "#ccc",
                              position: "relative", transition: "background 0.2s",
                            }}
                          >
                            <span style={{
                              display: "block", width: "18px", height: "18px", borderRadius: "50%", background: "#fff",
                              position: "absolute", top: "3px",
                              left: acc.status === "ACTIVE" ? "23px" : "3px",
                              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                            }} />
                          </button>
                        )}
                      </td>
                      <td style={tdStyle}>
                          <Link
                            to={`/access/finance?account=${encodeURIComponent(acc.id)}`}
                            style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #f59e0b", background: "#fff7e6", color: "#a16207", textDecoration: "none", fontSize: "12px", fontWeight: 600 }}
                          >
                            Permissions
                          </Link>
                          <button
                            onClick={() => { setPwModalId(acc.id); setPwModalName(acc.name); setNewPassword(""); setPwMsg(""); }}
                            style={{
                              padding: "4px 10px", borderRadius: "6px", border: "1px solid #1976d2",
                              background: "#e3f2fd", color: "#1565c0", cursor: "pointer", fontSize: "12px", fontWeight: 600,
                            }}
                          >
                            Change Password
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {accounts.length === 0 && <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>No accounts found</p>}
            </div>
          )}
        </section>
      </main>

      {/* Password Change Modal */}
      {pwModalId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => setPwModalId(null)}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "28px", width: "min(420px,90vw)",
            boxShadow: "0 8px 32px rgba(0,0,0,.15)",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px" }}>Change Password</h3>
            <p style={{ color: "#666", fontSize: "14px", margin: "0 0 20px" }}>for <strong>{pwModalName}</strong></p>
            <form onSubmit={changePassword}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>New Password</label>
              <input
                type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters" required minLength={8}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box", marginBottom: "16px" }}
              />
              {pwMsg && <p style={{ color: pwMsg.includes("success") ? "#2e7d32" : "#c62828", fontSize: "14px", margin: "0 0 12px" }}>{pwMsg}</p>}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setPwModalId(null)}
                  style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer", fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={pwLoading}
                  style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#1976d2", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                  {pwLoading ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
