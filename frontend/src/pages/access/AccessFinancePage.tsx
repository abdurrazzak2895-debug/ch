import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, LayoutDashboard, LogOut, Megaphone, ShieldCheck, Users, WalletCards } from "lucide-react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";
import "@/styles/access-dashboard-premium.css";
import "@/styles/access-admin-analytics.css";

const PERMISSIONS = [
  ["booking.create", "Create bookings", "Allows candidate reservation creation; successful bookings use the Admin-configured credit cost."],
  ["reservation.manage", "Reservation access", "Allows My bookings access, ticket downloads, cancellation and rescheduling."],
  ["payment.create", "Create payments", "Allows starting or retrying a reservation payment."],
  ["wallet.deposit", "Request deposits", "Allows the user to submit deposit requests for admin approval."],
  ["users.create", "Create users", "Allows an agency to create managed candidate accounts."],
] as const;

interface Account { id: string; name: string; email: string; role: string; status: string; permission_mode?: string }
interface PermissionRow { permission_key: string; allowed: boolean }
interface WalletTransaction {
  id: string;
  direction: "credit" | "debit";
  transaction_type: string;
  amount: number | string;
  balance_after: number | string;
  description?: string | null;
  created_at: string;
}
interface AccountAccess {
  account: Account;
  permissions: PermissionRow[];
  wallet: { balance: number | string; currency: string };
  transactions: WalletTransaction[];
}
interface DepositRequest {
  id: string;
  account_id: string;
  amount: number | string;
  status: string;
  payment_method: string;
  payment_reference?: string | null;
  receiver_account?: string | null;
  accounts?: { name?: string; email?: string } | null;
}
interface BillingSettings {
  booking_credit_cost: number | string;
  bkash_enabled: boolean;
  bkash_number?: string | null;
  bkash_instructions?: string | null;
  nagad_enabled: boolean;
  nagad_number?: string | null;
  nagad_instructions?: string | null;
}

function errorMessage(error: unknown, fallback = "Request failed") {
  const value = error as { message?: string; data?: { message?: string } };
  return value.data?.message || value.message || fallback;
}

export default function AccessFinancePage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<AccountAccess | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [adjustment, setAdjustment] = useState({ amount: "", direction: "credit", description: "" });
  const [bookingCreditCost, setBookingCreditCost] = useState("1.00");
  const [paymentSettings, setPaymentSettings] = useState({ bkashEnabled: false, bkashNumber: "", bkashInstructions: "", nagadEnabled: false, nagadNumber: "", nagadInstructions: "" });
  const [savingBookingCost, setSavingBookingCost] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAccounts() {
    const response = await accessAdminApi<{ accounts: Account[] }>("/accounts");
    const candidates = (response.accounts || []).filter((item) => item.role !== "ADMIN");
    setAccounts(candidates);
    setSelectedId((current) => {
      const requestedId = searchParams.get("account");
      return requestedId && candidates.some((item) => item.id === requestedId)
        ? requestedId
        : current || candidates[0]?.id || "";
    });
  }
  async function loadDeposits() {
    const response = await accessAdminApi<{ deposits: DepositRequest[] }>("/deposits");
    setDeposits(response.deposits || []);
  }
  async function loadBillingSettings() {
    const response = await accessAdminApi<{ settings: BillingSettings }>("/billing-settings");
    setBookingCreditCost(Number(response.settings?.booking_credit_cost || 0).toFixed(2));
    setPaymentSettings({
      bkashEnabled: response.settings?.bkash_enabled === true,
      bkashNumber: response.settings?.bkash_number || "",
      bkashInstructions: response.settings?.bkash_instructions || "",
      nagadEnabled: response.settings?.nagad_enabled === true,
      nagadNumber: response.settings?.nagad_number || "",
      nagadInstructions: response.settings?.nagad_instructions || "",
    });
  }
  async function loadDetail(id: string) {
    if (!id) return;
    const response = await accessAdminApi<AccountAccess>(`/accounts/${id}/access`);
    setDetail(response);
    setPermissions(Object.fromEntries(PERMISSIONS.map(([key]) => [key, response.permissions?.find((item) => item.permission_key === key)?.allowed === true])));
  }
  useEffect(() => { void Promise.all([loadAccounts(), loadDeposits(), loadBillingSettings()]).catch((error) => setMessage(error.message)); }, []);
  useEffect(() => { void loadDetail(selectedId).catch((error) => setMessage(error.message)); }, [selectedId]);

  const selected = useMemo(() => accounts.find((item) => item.id === selectedId), [accounts, selectedId]);

  async function savePermissions() {
    if (!selectedId) return;
    setMessage(""); setSavingPermissions(true);
    try { await accessAdminApi(`/accounts/${selectedId}/access`, { method: "PUT", body: { permissions } }); setMessage("Permissions saved in managed mode."); await loadDetail(selectedId); }
    catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setSavingPermissions(false); }
  }
  async function postAdjustment(event: React.FormEvent) {
    event.preventDefault(); setMessage("");
    try {
      await accessAdminApi(`/accounts/${selectedId}/wallet-adjustments`, { body: { ...adjustment, amount: Number(adjustment.amount) } });
      setAdjustment({ amount: "", direction: "credit", description: "" }); setMessage("Wallet adjustment posted."); await loadDetail(selectedId);
    } catch (error: unknown) { setMessage(errorMessage(error)); }
  }
  async function processDeposit(id: string, action: "approve" | "reject") {
    const note = window.prompt(`${action === "approve" ? "Approval" : "Rejection"} note (optional)`) || "";
    try { await accessAdminApi(`/deposits/${id}`, { method: "PATCH", body: { action, note } }); setMessage(`Deposit ${action}d.`); await Promise.all([loadDeposits(), selectedId ? loadDetail(selectedId) : Promise.resolve()]); }
    catch (error: unknown) { setMessage(errorMessage(error)); }
  }
  async function saveBookingCreditCost(event: React.FormEvent) {
    event.preventDefault(); setMessage(""); setSavingBookingCost(true);
    try {
      const response = await accessAdminApi<{ settings: BillingSettings }>("/billing-settings", {
        method: "PUT", body: { bookingCreditCost: Number(bookingCreditCost), ...paymentSettings },
      });
      setBookingCreditCost(Number(response.settings.booking_credit_cost).toFixed(2));
      setMessage("Per-booking credit cost updated. New successful reservations will use this amount.");
    } catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setSavingBookingCost(false); }
  }

  return <div className="ap-shell ap-admin-controls"><aside className="ap-sidebar"><div className="ap-brand"><span className="ap-brand__mark">A</span><div><strong>Access</strong><small>ADMIN CONSOLE</small></div></div><nav className="ap-nav"><small>CONTROL</small><Link className="ap-nav__link" to="/access/dashboard"><LayoutDashboard />Dashboard</Link><Link className="ap-nav__link" to="/access/accounts"><Users />User Management</Link><Link className="ap-nav__link" to="/access/users"><Users />Create User</Link><Link className="ap-nav__link ap-nav__link--active" to="/access/finance"><WalletCards />Permissions & Wallets</Link><Link className="ap-nav__link" to="/access/notice"><Megaphone />Notice</Link></nav><div className="ap-sidebar__foot">Secure ledger · v1</div></aside>
    <main className="ap-main"><header className="ap-topbar"><div><small>ACCESS POLICIES</small><strong>Permissions, deposits and credit ledger</strong></div><div className="ap-account"><span className="ap-role ap-role--admin">ADMIN</span><div><strong>{user?.name}</strong><small>{user?.email}</small></div><button onClick={() => { logout(); navigate("/access/login"); }}><LogOut />Logout</button></div></header>
      <section className="af-head"><ShieldCheck /><div><small>SECURITY & FINANCE</small><h1>Account controls</h1><p>Only explicitly enabled capabilities are available to managed accounts.</p></div></section>
      {message && <div className="ap-error af-message">{message}</div>}
      <section className="ap-panel af-booking-cost"><div><small>GLOBAL BILLING DEFAULT</small><h2>Booking cost & payment receivers</h2><p>These settings apply to users without an Agency override. Credit is debited only after SVP confirms a successful reservation.</p></div><form onSubmit={saveBookingCreditCost} style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
        <label>Credits per booking<input type="number" min="0" max="1000000" step="0.01" value={bookingCreditCost} onChange={(event) => setBookingCreditCost(event.target.value)} required /></label>
        <label className="af-method-toggle" style={{ display: "flex", flexDirection: "row", alignItems: "center" }}><input style={{ width: "18px", minHeight: "18px" }} type="checkbox" checked={paymentSettings.bkashEnabled} onChange={(event) => setPaymentSettings({ ...paymentSettings, bkashEnabled: event.target.checked })} /> Enable bKash</label>
        <label>bKash receiver number<input value={paymentSettings.bkashNumber} onChange={(event) => setPaymentSettings({ ...paymentSettings, bkashNumber: event.target.value })} required={paymentSettings.bkashEnabled} /></label>
        <label>bKash instructions<input value={paymentSettings.bkashInstructions} maxLength={500} onChange={(event) => setPaymentSettings({ ...paymentSettings, bkashInstructions: event.target.value })} placeholder="Send Money and enter transaction ID" /></label>
        <label className="af-method-toggle" style={{ display: "flex", flexDirection: "row", alignItems: "center" }}><input style={{ width: "18px", minHeight: "18px" }} type="checkbox" checked={paymentSettings.nagadEnabled} onChange={(event) => setPaymentSettings({ ...paymentSettings, nagadEnabled: event.target.checked })} /> Enable Nagad</label>
        <label>Nagad receiver number<input value={paymentSettings.nagadNumber} onChange={(event) => setPaymentSettings({ ...paymentSettings, nagadNumber: event.target.value })} required={paymentSettings.nagadEnabled} /></label>
        <label>Nagad instructions<input value={paymentSettings.nagadInstructions} maxLength={500} onChange={(event) => setPaymentSettings({ ...paymentSettings, nagadInstructions: event.target.value })} placeholder="Send Money and enter transaction ID" /></label>
        <button className="ap-btn ap-btn--gold" style={{ alignSelf: "end" }} disabled={savingBookingCost}>{savingBookingCost ? "Saving…" : "Save global billing"}</button>
      </form></section>
      <section className="af-layout"><article className="ap-panel af-control"><label>Account</label><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role} · {item.email}</option>)}</select>
        {selected && <div className="af-account"><strong>{selected.name}</strong><span>{selected.role} · {selected.status} · {detail?.account?.permission_mode || selected.permission_mode || "LEGACY"}</span></div>}
        <h2>Page & action permissions</h2><p className="af-helper">Choose exactly which portal capabilities this account can use. Changes apply in managed mode.</p><div className="af-permissions">{PERMISSIONS.map(([key, label, note]) => <label key={key} className="af-permission"><input type="checkbox" checked={permissions[key] || false} onChange={(e) => setPermissions({ ...permissions, [key]: e.target.checked })}/><span><strong>{label}</strong><small>{note}</small></span></label>)}</div><button className="ap-btn ap-btn--gold" onClick={savePermissions} disabled={savingPermissions || !selectedId}>{savingPermissions ? "Saving permissions…" : "Save permissions"}</button>
        </article>
        <aside className="ap-panel af-wallet"><CreditCard /><small>CURRENT BALANCE</small><strong>{Number(detail?.wallet?.balance || 0).toFixed(2)}</strong><span>{detail?.wallet?.currency || "CREDIT"}</span><form onSubmit={postAdjustment}><h2>Manual adjustment</h2><input type="number" min="0.01" step="0.01" placeholder="Amount" value={adjustment.amount} onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })} required/><select value={adjustment.direction} onChange={(e) => setAdjustment({ ...adjustment, direction: e.target.value })}><option value="credit">Credit</option><option value="debit">Debit</option></select><input placeholder="Reason" value={adjustment.description} onChange={(e) => setAdjustment({ ...adjustment, description: e.target.value })}/><button className="ap-btn ap-btn--gold">Post adjustment</button></form></aside></section>
      <section className="ap-panel af-table"><header><div><small>IMMUTABLE CREDIT HISTORY</small><h2>Selected account ledger</h2></div></header><div className="af-rows">{detail?.transactions?.map((item) => <div className="af-row" key={item.id}><div><strong>{item.description || item.transaction_type}</strong><small>{new Date(item.created_at).toLocaleString()} · Balance after {Number(item.balance_after).toFixed(2)}</small></div><b>{item.direction === "credit" ? "+" : "−"}{Number(item.amount).toFixed(2)}</b><span className={`ap-status ap-status--${item.direction === "credit" ? "active" : "inactive"}`}>{item.direction}</span></div>)}{detail && !detail.transactions?.length && <p>No wallet transactions for this account.</p>}</div></section>
      <section className="ap-panel af-table"><header><div><small>PENDING & HISTORICAL</small><h2>Deposit requests</h2></div></header><div className="af-rows">{deposits.map((item) => <div className="af-row" key={item.id}><div><strong>{item.accounts?.name || item.account_id}</strong><small>{item.accounts?.email} · {item.payment_method} to {item.receiver_account || "configured receiver"} · Txn {item.payment_reference || "No reference"}</small></div><b>{Number(item.amount).toFixed(2)}</b><span className={`ap-status ap-status--${item.status === "APPROVED" ? "active" : "inactive"}`}>{item.status}</span>{item.status === "PENDING" && <div><button onClick={() => processDeposit(item.id, "approve")}>Approve</button><button onClick={() => processDeposit(item.id, "reject")}>Reject</button></div>}</div>)}</div></section>
    </main></div>;
}
