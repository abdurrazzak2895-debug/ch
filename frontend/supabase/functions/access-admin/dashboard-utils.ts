export type DashboardAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  agency_id?: string | null;
  created_at?: string | null;
};

export type SvpIdentity = {
  id: string;
  login: string;
  email?: string | null;
  full_name?: string | null;
  created_at?: string | null;
  sessionExpiresAt?: string | null;
  sessionActive?: boolean;
};

const text = (value: unknown) => String(value ?? "").trim();
const normalizedEmail = (value: unknown) => text(value).toLowerCase();
type JsonObject = Record<string, unknown>;
const objectValue = (value: unknown): JsonObject => value && typeof value === "object" ? value as JsonObject : {};

function firstValue(item: unknown, keys: string[]): unknown {
  const object = objectValue(item);
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function extractSvpCollection(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const object = objectValue(payload);
  for (const key of keys) {
    if (Array.isArray(object[key])) return object[key];
  }
  if (Array.isArray(object.data)) return object.data;
  if (object.data && typeof object.data === "object") {
    return extractSvpCollection(object.data, keys);
  }
  return [];
}

export function reservationStatus(item: unknown): string {
  return text(firstValue(item, ["reservation_status", "status", "cbt_exam_status", "state"])) || "unknown";
}

export function paymentStatus(item: unknown): string {
  const object = objectValue(item);
  return text(
    firstValue(item, ["payment_status", "status", "state"]) ??
      firstValue(object.result, ["description", "code"]) ??
      firstValue(objectValue(object.response).result, ["description", "code"]),
  ) || "unknown";
}

export function isCompletedReservation(item: unknown): boolean {
  const object = objectValue(item);
  const status = reservationStatus(item).toLowerCase();
  if (/cancel|expire|reject|fail|draft/.test(status)) return false;
  if (/complete|confirm|book|schedule|paid|success|active|ready/.test(status)) return true;
  return object.ticket_id != null || object.exam_session_id != null;
}

export function isPaidPayment(item: unknown): boolean {
  const object = objectValue(item);
  const status = paymentStatus(item).toLowerCase();
  if (/fail|cancel|reject|declin|expire|pending|initiated|processing|unpaid/.test(status)) return false;
  return /paid|success|complete|captur|approv|settled/.test(status) || object.paid === true || object.is_paid === true;
}

export function normalizeReservation(item: unknown, svpUser: SvpIdentity) {
  return {
    id: text(firstValue(item, ["id", "reservation_id", "exam_reservation_id"])) || "unknown",
    svpUserId: svpUser.id,
    svpLogin: svpUser.login,
    svpEmail: normalizedEmail(svpUser.email || svpUser.login),
    status: reservationStatus(item),
    completed: isCompletedReservation(item),
    createdAt: text(firstValue(item, ["created_at", "reservation_date", "booked_at", "updated_at"])) || null,
  };
}

export function normalizePayment(item: unknown, svpUser: SvpIdentity) {
  const numericAmount = Number(firstValue(item, ["amount", "total_amount", "paid_amount", "payment_amount"]));
  return {
    id: text(firstValue(item, ["id", "payment_id", "transaction_id", "checkout_id"])) || "unknown",
    reservationId: text(firstValue(item, ["reservation_id", "exam_reservation_id", "payable_id"])) || null,
    svpUserId: svpUser.id,
    svpLogin: svpUser.login,
    svpEmail: normalizedEmail(svpUser.email || svpUser.login),
    status: paymentStatus(item),
    paid: isPaidPayment(item),
    amount: Number.isFinite(numericAmount) ? numericAmount : null,
    currency: text(firstValue(item, ["currency", "currency_code"])) || null,
    createdAt: text(firstValue(item, ["paid_at", "completed_at", "created_at", "updated_at"])) || null,
  };
}

export function buildAgencyDashboard(
  accounts: DashboardAccount[],
  svpUsers: SvpIdentity[],
  reservations: ReturnType<typeof normalizeReservation>[],
  payments: ReturnType<typeof normalizePayment>[],
  walletBalances?: Map<string, number>,
) {
  const svpByEmail = new Map<string, SvpIdentity[]>();
  for (const svpUser of svpUsers) {
    const email = normalizedEmail(svpUser.email || svpUser.login);
    if (!email) continue;
    svpByEmail.set(email, [...(svpByEmail.get(email) || []), svpUser]);
  }
  const reservationsByEmail = new Map<string, typeof reservations>();
  for (const item of reservations) reservationsByEmail.set(item.svpEmail, [...(reservationsByEmail.get(item.svpEmail) || []), item]);
  const paymentsByEmail = new Map<string, typeof payments>();
  for (const item of payments) paymentsByEmail.set(item.svpEmail, [...(paymentsByEmail.get(item.svpEmail) || []), item]);

  const agencies = accounts.filter((item) => item.role === "AGENCY");
  const users = accounts.filter((item) => item.role === "USER");
  const now = Date.now();
  return agencies.map((agency) => {
    const agencyUsers = users.filter((item) => item.agency_id === agency.id).map((user) => {
      const email = normalizedEmail(user.email);
      const userReservations = reservationsByEmail.get(email) || [];
      const userPayments = paymentsByEmail.get(email) || [];
      const svpAccounts = svpByEmail.get(email) || [];
      const completedBookings = userReservations.filter((item) => item.completed).length;
      const pendingBookings = userReservations.filter((item) => !item.completed).length;
      const activeReservations = userReservations.filter((item) => {
        const s = item.status.toLowerCase();
        return /active|pending|reserved|hold|scheduled|booked/.test(s);
      });
      const failedReservations = userReservations.filter((item) => {
        const s = item.status.toLowerCase();
        return /fail|error|cancel|expire|reject|void/.test(s);
      });
      const activeSvpAccounts = svpAccounts.filter((s) => {
        if (s.sessionActive === false) return false;
        if (s.sessionExpiresAt) {
          const exp = new Date(s.sessionExpiresAt).getTime();
          return exp > now;
        }
        return true;
      });
      const expiredSvpAccounts = svpAccounts.filter((s) => {
        if (s.sessionActive === false) return true;
        if (s.sessionExpiresAt) {
          const exp = new Date(s.sessionExpiresAt).getTime();
          return exp <= now;
        }
        return false;
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        status: user.status,
        createdAt: user.created_at || null,
        svpAccountCount: svpAccounts.length,
        activeSvpCount: activeSvpAccounts.length,
        expiredSvpCount: expiredSvpAccounts.length,
        svpLogins: svpAccounts.map((s) => ({
          login: s.login,
          active: s.sessionActive !== false && (!s.sessionExpiresAt || new Date(s.sessionExpiresAt).getTime() > now),
          expiresAt: s.sessionExpiresAt || null,
        })),
        completedBookings,
        pendingBookings,
        failedBookings: failedReservations.length,
        paidPayments: userPayments.filter((item) => item.paid).length,
        totalPayments: userPayments.length,
        walletBalance: walletBalances?.get(user.id) ?? null,
        recentReservations: userReservations.slice(-5).map((r) => ({
          id: r.id,
          status: r.status,
          completed: r.completed,
          createdAt: r.createdAt,
        })),
      };
    });
    return {
      id: agency.id,
      name: agency.name,
      email: agency.email,
      status: agency.status,
      createdAt: agency.created_at || null,
      userCount: agencyUsers.length,
      svpAccountCount: agencyUsers.reduce((sum, item) => sum + item.svpAccountCount, 0),
      activeSvpCount: agencyUsers.reduce((sum, item) => sum + item.activeSvpCount, 0),
      completedBookings: agencyUsers.reduce((sum, item) => sum + item.completedBookings, 0),
      pendingBookings: agencyUsers.reduce((sum, item) => sum + item.pendingBookings, 0),
      failedBookings: agencyUsers.reduce((sum, item) => sum + item.failedBookings, 0),
      paidPayments: agencyUsers.reduce((sum, item) => sum + item.paidPayments, 0),
      totalWalletBalance: agencyUsers.reduce((sum, item) => sum + (item.walletBalance ?? 0), 0),
      users: agencyUsers,
    };
  });
}
