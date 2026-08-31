import { useState, useEffect } from "react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi, accessAgencyApi } from "@/lib/access-api";
import "@/styles/access-dashboard-premium.css";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Building2, WalletCards, Megaphone,
  Server, FileSliders, SearchCheck, LogOut, Plus, Key, Shield, Wallet,
  CheckCircle, XCircle, ChevronDown,
} from "lucide-react";

const AGENCY_USER_PERMISSIONS = [
  ["booking.create", "Create bookings", "Create new exam reservations."],
  ["reservation.manage", "Manage reservations", "Open My bookings, download tickets, cancel and reschedule."],
  ["payment.create", "Create payments", "Start or retry reservation payments."],
  ["wallet.deposit", "Request deposits", "Submit wallet deposit requests for admin approval."],
] as const;

interface AgencyWalletTransaction {
  id: string;
  direction: "credit" | "debit";
  transaction_type: string;
  amount: number | string;
  balance_after: number | string;
  description?: string | null;
  created_at: string;
}

interface AgencyDepositRequest {
  id: string;
  amount: number | string;
  status: string;
  payment_method: string;
  payment_reference?: string | null;
  receiver_account?: string | null;
  billing_owner_id?: string | null;
  created_at: string;
}

interface AgencyWalletData {
  wallet: { balance: number | string; currency: string };
  transactions: AgencyWalletTransaction[];
  deposits: AgencyDepositRequest[];
}

interface AgencyBillingSettings {
  booking_credit_cost: number | string;
  bkash_enabled: boolean;
  bkash_number?: string | null;
  bkash_instructions?: string | null;
  nagad_enabled: boolean;
  nagad_number?: string | null;
  nagad_instructions?: string | null;
}

function initials(name?: string) {
  return String(name || "U").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function AccessUsersPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [agencyId, setAgencyId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [pwModalId, setPwModalId] = useState<string | null>(null);
  const [pwModalName, setPwModalName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const [permissionModalId, setPermissionModalId] = useState<string | null>(null);
  const [permissionModalName, setPermissionModalName] = useState("");
  const [permissionMode, setPermissionMode] = useState("LEGACY");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionMsg, setPermissionMsg] = useState("");

  const [walletModalId, setWalletModalId] = useState<string | null>(null);
  const [walletModalName, setWalletModalName] = useState("");
  const [walletData, setWalletData] = useState<AgencyWalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletMsg, setWalletMsg] = useState("");
  const [walletAdjustment, setWalletAdjustment] = useState({ amount: "", direction: "credit", description: "" });
  const [billingSource, setBillingSource] = useState("ADMIN_DEFAULT");
  const [billingSaving, setBillingSaving] = useState(false);
  const [billing, setBilling] = useState({ bookingCreditCost: "1.00", bkashEnabled: false, bkashNumber: "", bkashInstructions: "", nagadEnabled: false, nagadNumber: "", nagadInstructions: "" });
  const [showBilling, setShowBilling] = useState(false);

  useEffect(() => {
    if (user?.role === "AGENCY") { fetchUsers(); void loadAgencyBilling(); }
  }, [user]);

  async function loadAgencyBilling() {
    try {
      const response = await accessAgencyApi<{ settings: AgencyBillingSettings; source: string }>("/billing-settings");
      const item = response.settings;
      setBillingSource(response.source || "ADMIN_DEFAULT");
      setBilling({
        bookingCreditCost: Number(item?.booking_credit_cost || 0).toFixed(2),
        bkashEnabled: item?.bkash_enabled === true,
        bkashNumber: item?.bkash_number || "",
        bkashInstructions: item?.bkash_instructions || "",
        nagadEnabled: item?.nagad_enabled === true,
        nagadNumber: item?.nagad_number || "",
        nagadInstructions: item?.nagad_instructions || "",
      });
    } catch (err: any) { setMsg(err?.data?.message || err?.message || "Failed to load billing"); }
  }

  async function saveAgencyBilling(e: React.FormEvent) {
    e.preventDefault(); setBillingSaving(true); setMsg("");
    try {
      await accessAgencyApi("/billing-settings", { method: "PUT", body: { ...billing, bookingCreditCost: Number(billing.bookingCreditCost) } });
      setBillingSource("AGENCY");
      setMsg("Billing settings saved!");
      await loadAgencyBilling();
    } catch (err: any) { setMsg(err?.data?.message || err?.message || "Failed to save"); }
    finally { setBillingSaving(false); }
  }

  async function fetchUsers() {
    setListLoading(true);
    try { const res = await accessAgencyApi("/users"); setUsers(res.users || []); } catch { }
    finally { setListLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      if (isAdmin) {
        await accessAdminApi("/users", { body: { name, email, phone, password, status, agencyId: agencyId || undefined } });
      } else {
        await accessAgencyApi("/users", { body: { name, email, phone, password, status } });
      }
      setMsg("User created!"); setName(""); setEmail(""); setPhone(""); setPassword(""); setAgencyId("");
      if (!isAdmin) fetchUsers();
    } catch (err: any) { setMsg(err?.data?.message || err?.message || "Failed"); }
    finally { setLoading(false); }
  }

  async function toggleUserStatus(u: any) {
    const newStatus = u.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await accessAgencyApi(`/users/${u.id}/status`, { method: "PATCH", body: { status: newStatus } });
      setMsg(`${u.name} is now ${newStatus}`);
      fetchUsers();
    } catch (err: any) { setMsg(err?.message || "Failed"); }
  }

  async function changeUserPassword(e: React.FormEvent) {
    e.preventDefault(); if (!pwModalId) return;
    setPwLoading(true); setPwMsg("");
    try {
      await accessAgencyApi(`/users/${pwModalId}/password`, { method: "PATCH", body: { password: newPassword } });
      setPwMsg("Password updated!"); setNewPassword("");
      setTimeout(() => { setPwModalId(null); setPwMsg(""); }, 1200);
    } catch (err: any) { setPwMsg(err?.message || "Failed"); }
    finally { setPwLoading(false); }
  }

  async function openUserPermissions(u: any) {
    setPermissionModalId(u.id); setPermissionModalName(u.name);
    setPermissionMode(u.permission_mode || "LEGACY"); setPermissions({});
    setPermissionMsg(""); setPermissionLoading(true);
    try {
      const res = await accessAgencyApi(`/users/${u.id}/permissions`);
      setPermissionMode(res.user?.permission_mode || "LEGACY");
      setPermissions(res.permissions || {});
    } catch (err: any) { setPermissionMsg(err?.data?.message || err?.message || "Failed"); }
    finally { setPermissionLoading(false); }
  }

  async function saveUserPermissions(e: React.FormEvent) {
    e.preventDefault(); if (!permissionModalId) return;
    setPermissionSaving(true); setPermissionMsg("");
    try {
      await accessAgencyApi(`/users/${permissionModalId}/permissions`, { method: "PUT", body: { permissions } });
      setPermissionMode("MANAGED"); setPermissionMsg("Permissions saved!");
      await fetchUsers();
    } catch (err: any) { setPermissionMsg(err?.data?.message || err?.message || "Failed"); }
    finally { setPermissionSaving(false); }
  }

  async function loadUserWallet(accountId: string) {
    setWalletLoading(true);
    try { setWalletData(await accessAgencyApi<AgencyWalletData>(`/users/${accountId}/wallet`)); }
    catch (err: any) { setWalletMsg(err?.data?.message || err?.message || "Failed"); }
    finally { setWalletLoading(false); }
  }

  async function openUserWallet(u: any) {
    setWalletModalId(u.id); setWalletModalName(u.name); setWalletData(null); setWalletMsg("");
    setWalletAdjustment({ amount: "", direction: "credit", description: "" });
    await loadUserWallet(u.id);
  }

  async function submitWalletAdjustment(e: React.FormEvent) {
    e.preventDefault(); if (!walletModalId) return;
    setWalletSaving(true); setWalletMsg("");
    try {
      await accessAgencyApi(`/users/${walletModalId}/wallet-adjustments`, { body: { ...walletAdjustment, amount: Number(walletAdjustment.amount) } });
      setWalletAdjustment({ amount: "", direction: "credit", description: "" });
      setWalletMsg(`Balance ${walletAdjustment.direction === "credit" ? "credited" : "debited"}!`);
      await loadUserWallet(walletModalId);
    } catch (err: any) { setWalletMsg(err?.data?.message || err?.message || "Failed"); }
    finally { setWalletSaving(false); }
  }

  async function processUserDeposit(depositId: string, action: "approve" | "reject") {
    if (!walletModalId) return;
    const note = window.prompt(`${action} note (optional)`) || "";
    setWalletSaving(true); setWalletMsg("");
    try {
      await accessAgencyApi(`/users/${walletModalId}/deposits/${depositId}`, { method: "PATCH", body: { action, note } });
      setWalletMsg(`Deposit ${action}d!`);
      await loadUserWallet(walletModalId);
    } catch (err: any) { setWalletMsg(err?.data?.message || err?.message || "Failed"); }
    finally { setWalletSaving(false); }
  }

  function handleLogout() { logout(); navigate("/access/login"); }

  return (
    <div className="ap-shell">
      <aside className="ap-sidebar">
        <div className="ap-brand"><span className="ap-brand__mark">A</span><div><strong>Access</strong><small>{isAdmin ? "ADMIN" : "AGENCY"}</small></div></div>
        <nav className="ap-nav">
          <small>Overview</small>
          <Link className={`ap-nav__link ${location.pathname === "/access/dashboard" ? "ap-nav__link--active" : ""}`} to="/access/dashboard"><LayoutDashboard />Dashboard</Link>
          {isAdmin && <><small>Access Control</small>
            <Link className={`ap-nav__link ${location.pathname === "/access/accounts" ? "ap-nav__link--active" : ""}`} to="/access/accounts"><Users />All Accounts</Link>
            <Link className={`ap-nav__link ${location.pathname === "/access/finance" ? "ap-nav__link--active" : ""}`} to="/access/finance"><WalletCards />Permissions & Wallets</Link>
            <Link className={`ap-nav__link ${location.pathname === "/access/notice" ? "ap-nav__link--active" : ""}`} to="/access/notice"><Megaphone />Notice</Link>
            <Link className={`ap-nav__link ${location.pathname === "/access/agencies" ? "ap-nav__link--active" : ""}`} to="/access/agencies"><Building2 />Create Agency</Link>
            <small>Infrastructure</small>
            <Link className={`ap-nav__link ${location.pathname === "/access/session-centers" ? "ap-nav__link--active" : ""}`} to="/access/session-centers"><Server />Session Centers</Link>
            <Link className={`ap-nav__link ${location.pathname === "/access/section-rules" ? "ap-nav__link--active" : ""}`} to="/access/section-rules"><FileSliders />Section Rules</Link>
            <Link className={`ap-nav__link ${location.pathname === "/access/result-verification" ? "ap-nav__link--active" : ""}`} to="/access/result-verification"><SearchCheck />Result Verification</Link>
          </>}
          {!isAdmin && <><small>Agency</small><Link className={`ap-nav__link ${location.pathname === "/access/users" ? "ap-nav__link--active" : ""}`} to="/access/users"><Users />My Users</Link></>}
        </nav>
        <div className="ap-sidebar__foot">Access Control v2</div>
      </aside>

      <main className="ap-main">
        <header className="ap-topbar">
          <div><small>{isAdmin ? "ADMIN" : "AGENCY"} CONSOLE</small><strong>{isAdmin ? "User Management" : "Your Users"}</strong></div>
          <div className="ap-account">
            <span className={`ap-role ap-role--${isAdmin ? "admin" : "agency"}`}>{user?.role}</span>
            <span className="ap-avatar">{initials(user?.name)}</span>
            <div><strong>{user?.name}</strong><small>{user?.email}</small></div>
            <button onClick={handleLogout}><LogOut />Logout</button>
          </div>
        </header>

        {msg && <div className={`ap-error${/success|created|saved|credited|debited|now/i.test(msg) ? " ap-error--ok" : ""}`}>{msg}</div>}

        {/* Create User Form */}
        <section className="ap-panel">
          <header><div><small>{isAdmin ? "CREATE USER" : "ADD USER"}</small><h2>New user account</h2></div></header>
          <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", maxWidth: "800px" }}>
            <label className="ap-field"><span>Full Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required /></label>
            <label className="ap-field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" required /></label>
            <label className="ap-field"><span>Phone</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801712345678" required pattern="\+[1-9][0-9 ()-]{7,20}" /></label>
            <label className="ap-field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} /></label>
            <label className="ap-field"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Pending</option><option value="ACTIVE">Active</option></select></label>
            {isAdmin && <label className="ap-field"><span>Agency ID</span><input value={agencyId} onChange={(e) => setAgencyId(e.target.value)} placeholder="Optional" /></label>}
            <div style={{ display: "flex", alignItems: "end" }}><button type="submit" className="ap-btn ap-btn--gold" disabled={loading}>{loading ? "Creating..." : <><Plus />Create User</>}</button></div>
          </form>
        </section>

        {/* Agency Billing */}
        {!isAdmin && (
          <section className="ap-panel">
            <header>
              <div><small>AGENCY BILLING</small><h2>Booking cost & payment receivers</h2></div>
              <button className="ap-btn" onClick={() => setShowBilling(!showBilling)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--text)", cursor: "pointer" }}>
                <ChevronDown />{showBilling ? "Hide" : "Configure"}
              </button>
            </header>
            {showBilling && (
              <form onSubmit={saveAgencyBilling} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
                <label className="ap-field"><span>Credits per booking</span><input type="number" min="0" max="1000000" step="0.01" required value={billing.bookingCreditCost} onChange={(e) => setBilling({ ...billing, bookingCreditCost: e.target.value })} /></label>
                <label className="ap-field ap-field--check"><input type="checkbox" checked={billing.bkashEnabled} onChange={(e) => setBilling({ ...billing, bkashEnabled: e.target.checked })} /><span>Enable bKash</span></label>
                <label className="ap-field"><span>bKash number</span><input required={billing.bkashEnabled} value={billing.bkashNumber} onChange={(e) => setBilling({ ...billing, bkashNumber: e.target.value })} /></label>
                <label className="ap-field"><span>bKash instructions</span><input maxLength={500} value={billing.bkashInstructions} onChange={(e) => setBilling({ ...billing, bkashInstructions: e.target.value })} /></label>
                <label className="ap-field ap-field--check"><input type="checkbox" checked={billing.nagadEnabled} onChange={(e) => setBilling({ ...billing, nagadEnabled: e.target.checked })} /><span>Enable Nagad</span></label>
                <label className="ap-field"><span>Nagad number</span><input required={billing.nagadEnabled} value={billing.nagadNumber} onChange={(e) => setBilling({ ...billing, nagadNumber: e.target.value })} /></label>
                <label className="ap-field"><span>Nagad instructions</span><input maxLength={500} value={billing.nagadInstructions} onChange={(e) => setBilling({ ...billing, nagadInstructions: e.target.value })} /></label>
                <div style={{ display: "flex", alignItems: "end" }}><button type="submit" className="ap-btn ap-btn--gold" disabled={billingSaving}>{billingSaving ? "Saving..." : "Save Billing"}</button></div>
              </form>
            )}
          </section>
        )}

        {/* Users Table */}
        {!isAdmin && (
          <section className="ap-panel">
            <header><div><small>YOUR TEAM</small><h2>Users ({users.length})</h2></div></header>
            {listLoading ? <p className="ap-muted">Loading users...</p> : (
              <div style={{ overflowX: "auto" }}>
                <table className="ap-table">
                  <thead>
                    <tr><th>User</th><th>Phone</th><th>Status</th><th>Active</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td><div style={{ display: "flex", alignItems: "center", gap: "10px" }}><span className="ap-row__avatar">{initials(u.name)}</span><div><strong>{u.name}</strong><small>{u.email}</small></div></div></td>
                        <td>{u.phone || "-"}</td>
                        <td><span className={`ap-status ap-status--${u.status === "ACTIVE" ? "active" : "inactive"}`}>{u.status}</span></td>
                        <td>
                          <button className="ap-toggle" onClick={() => toggleUserStatus(u)} data-active={u.status === "ACTIVE"}>
                            <span />
                          </button>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <button className="ap-action-btn ap-action-btn--green" onClick={() => openUserWallet(u)}><Wallet />Wallet</button>
                            <button className="ap-action-btn ap-action-btn--gold" onClick={() => openUserPermissions(u)}><Shield />Perms</button>
                            <button className="ap-action-btn ap-action-btn--blue" onClick={() => { setPwModalId(u.id); setPwModalName(u.name); setNewPassword(""); setPwMsg(""); }}><Key />Password</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!users.length && <tr><td colSpan={5} className="ap-muted">No users yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Password Modal */}
        {pwModalId && (
          <div className="ap-modal-overlay" onClick={() => setPwModalId(null)}>
            <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ap-modal__head"><h3>Change Password</h3><small>{pwModalName}</small></div>
              <form onSubmit={changeUserPassword}>
                <label className="ap-field"><span>New Password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} /></label>
                {pwMsg && <p className={pwMsg.includes("success") ? "ap-msg--ok" : "ap-msg--err"}>{pwMsg}</p>}
                <div className="ap-modal__actions">
                  <button type="button" className="ap-btn" onClick={() => setPwModalId(null)}>Cancel</button>
                  <button type="submit" className="ap-btn ap-btn--gold" disabled={pwLoading}>{pwLoading ? "Updating..." : "Update Password"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Permissions Modal */}
        {permissionModalId && (
          <div className="ap-modal-overlay" onClick={() => !permissionSaving && setPermissionModalId(null)}>
            <div className="ap-modal ap-modal--wide" onClick={(e) => e.stopPropagation()}>
              <div className="ap-modal__head"><h3>User Permissions</h3><small>{permissionModalName} - {permissionMode}</small></div>
              {permissionLoading ? <p className="ap-muted">Loading...</p> : (
                <form onSubmit={saveUserPermissions}>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {AGENCY_USER_PERMISSIONS.map(([key, label, note]) => (
                      <label key={key} className={`ap-perm-card${permissions[key] ? " ap-perm-card--active" : ""}`}>
                        <input type="checkbox" checked={permissions[key] === true} onChange={(e) => setPermissions((c) => ({ ...c, [key]: e.target.checked }))} />
                        <span><strong>{label}</strong><small>{note}</small></span>
                      </label>
                    ))}
                  </div>
                  {permissionMsg && <p className={permissionMsg.includes("success") ? "ap-msg--ok" : "ap-msg--err"}>{permissionMsg}</p>}
                  <div className="ap-modal__actions">
                    <button type="button" className="ap-btn" onClick={() => setPermissionModalId(null)} disabled={permissionSaving}>Cancel</button>
                    <button type="submit" className="ap-btn ap-btn--gold" disabled={permissionSaving}>{permissionSaving ? "Saving..." : "Save Permissions"}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Wallet Modal */}
        {walletModalId && (
          <div className="ap-modal-overlay" onClick={() => !walletSaving && setWalletModalId(null)}>
            <div className="ap-modal ap-modal--xl" onClick={(e) => e.stopPropagation()}>
              <div className="ap-modal__head"><h3>User Wallet</h3><small>{walletModalName}</small></div>
              {walletLoading && !walletData ? <p className="ap-muted">Loading wallet...</p> : <>
                <div className="ap-wallet-banner">
                  <div><small>AVAILABLE BALANCE</small><strong>{Number(walletData?.wallet?.balance || 0).toFixed(2)}</strong></div>
                  <b>{walletData?.wallet?.currency || "CREDIT"}</b>
                </div>
                <form onSubmit={submitWalletAdjustment} className="ap-wallet-form">
                  <label className="ap-field"><span>Amount</span><input type="number" min="0.01" max="1000000" step="0.01" required value={walletAdjustment.amount} onChange={(e) => setWalletAdjustment({ ...walletAdjustment, amount: e.target.value })} /></label>
                  <label className="ap-field"><span>Action</span><select value={walletAdjustment.direction} onChange={(e) => setWalletAdjustment({ ...walletAdjustment, direction: e.target.value })}><option value="credit">Credit</option><option value="debit">Debit</option></select></label>
                  <label className="ap-field"><span>Reason</span><input value={walletAdjustment.description} placeholder="Reason" onChange={(e) => setWalletAdjustment({ ...walletAdjustment, description: e.target.value })} /></label>
                  <div style={{ display: "flex", alignItems: "end" }}><button type="submit" className="ap-btn ap-btn--gold" disabled={walletSaving}>{walletSaving ? "Saving..." : "Update Balance"}</button></div>
                </form>
                {walletMsg && <p className={/success/i.test(walletMsg) ? "ap-msg--ok" : "ap-msg--err"}>{walletMsg}</p>}

                <h4 className="ap-section-title">Deposit Requests</h4>
                <div style={{ display: "grid", gap: "8px" }}>
                  {walletData?.deposits?.map((d) => (
                    <div key={d.id} className="ap-deposit-row">
                      <div><strong>{Number(d.amount).toFixed(2)} CREDIT</strong><small>{d.payment_method} - {d.payment_reference || "No ref"} - {new Date(d.created_at).toLocaleString()}</small></div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span className={`ap-status ap-status--${d.status === "APPROVED" ? "active" : d.status === "REJECTED" ? "inactive" : "pending"}`}>{d.status}</span>
                        {d.status === "PENDING" && d.billing_owner_id === user?.id && (
                          <><button className="ap-action-btn ap-action-btn--green" disabled={walletSaving} onClick={() => processUserDeposit(d.id, "approve")}>Approve</button>
                          <button className="ap-action-btn ap-action-btn--red" disabled={walletSaving} onClick={() => processUserDeposit(d.id, "reject")}>Reject</button></>
                        )}
                      </div>
                    </div>
                  ))}
                  {!walletData?.deposits?.length && <p className="ap-muted">No deposits.</p>}
                </div>

                <h4 className="ap-section-title">Transaction History</h4>
                <div style={{ display: "grid", gap: "6px" }}>
                  {walletData?.transactions?.map((t) => (
                    <div key={t.id} className="ap-tx-row">
                      <div><strong>{t.description || t.transaction_type}</strong><small>{new Date(t.created_at).toLocaleString()}</small></div>
                      <b className={t.direction === "credit" ? "ap-tone--green" : "ap-tone--red"}>{t.direction === "credit" ? "+" : "-"}{Number(t.amount).toFixed(2)}</b>
                      <span className="ap-muted">Bal {Number(t.balance_after).toFixed(2)}</span>
                    </div>
                  ))}
                  {!walletData?.transactions?.length && <p className="ap-muted">No transactions.</p>}
                </div>
              </>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
