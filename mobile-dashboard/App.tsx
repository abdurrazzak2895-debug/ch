import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const API_BASE = "https://xklwzkraobxetxdcysun.supabase.co/functions/v1";

type EventRow = {
  id: string;
  accountName: string;
  operation: string;
  outcome: "success" | "failure";
  reservationId?: string | null;
  createdAt?: string;
};

type Dashboard = {
  stats: {
    totalAccounts: number;
    lifetimeBookingSuccesses?: number;
    lifetimeBookingFailures?: number;
  };
  live: {
    sessionAccounts: number;
    syncedAccounts: number;
    syncFailures: number;
    reauthRequired?: number;
    expiredRefreshSessions?: number;
    refreshedAt?: string;
  };
  bookingEvents: EventRow[];
};

async function api(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem("access_token");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function formatUpdated(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem("access_token");
    setDashboard(null);
    setPassword("");
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      setDashboard(await api("/access-admin/dashboard"));
    } catch (requestError) {
      setError((requestError as Error).message);
      await signOut();
    }
  }, [signOut]);

  useEffect(() => {
    AsyncStorage.getItem("access_token").then((token) => {
      if (token) void load();
    });
  }, [load]);

  async function signIn() {
    if (!email.trim() || !password) {
      setError("Enter your admin email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api("/access-auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      await AsyncStorage.setItem("access_token", result.accessToken);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!dashboard) {
    return (
      <SafeAreaView style={styles.authScreen}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authInner}>
          <View style={styles.logoMark}><Text style={styles.logoLetter}>S</Text></View>
          <Text style={styles.authEyebrow}>SVP BOOKING · BANGLADESH</Text>
          <Text style={styles.authTitle}>Operations, clearly.</Text>
          <Text style={styles.authDescription}>Secure mobile access to live bookings, session health and the lifetime portal ledger.</Text>
          <View style={styles.authCard}>
            <Text style={styles.fieldLabel}>ADMIN EMAIL</Text>
            <TextInput
              style={styles.authInput}
              placeholder="admin@example.com"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <TextInput
              style={styles.authInput}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={signIn}
              returnKeyType="done"
            />
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={signIn} disabled={loading}>
              {loading ? <ActivityIndicator color={COLORS.navy} /> : <Text style={styles.primaryButtonText}>Sign in securely</Text>}
            </Pressable>
            {error ? <Text style={styles.authError}>{error}</Text> : null}
          </View>
          <Text style={styles.authFoot}>Protected admin and agency operations</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const eventRows = useMemo(() => dashboard.bookingEvents?.slice(0, 12) || [], [dashboard.bookingEvents]);
  const needsAttention = (dashboard.live.reauthRequired || 0) > 0 || dashboard.live.syncFailures > 0;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.blue} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarTitle}>
            <Text style={styles.eyebrow}>LIVE OPERATIONS</Text>
            <Text style={styles.heading}>Control centre</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]} onPress={signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTopLine}><Text style={styles.heroEyebrow}>SVP BOOKING BANGLADESH</Text><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>LIVE</Text></View></View>
          <Text style={styles.heroTitle}>Booking system health</Text>
          <Text style={styles.heroText}>Authoritative data from the protected admin API.</Text>
          <Text style={styles.heroUpdated}>Last sync {formatUpdated(dashboard.live.refreshedAt)}</Text>
        </View>

        <View style={styles.metricRow}>
          <Metric label="ACCOUNTS" value={dashboard.stats.totalAccounts} />
          <Metric label="LIFETIME SUCCESS" value={dashboard.stats.lifetimeBookingSuccesses || 0} tone="success" />
        </View>
        <View style={styles.metricRow}>
          <Metric label="LIFETIME FAILED" value={dashboard.stats.lifetimeBookingFailures || 0} tone="danger" />
          <Metric label="RE-AUTH NEEDED" value={dashboard.live.reauthRequired || 0} tone={dashboard.live.reauthRequired ? "danger" : "success"} />
        </View>

        <View style={[styles.statusCard, needsAttention ? styles.statusCardWarning : styles.statusCardGood]}>
          <View style={styles.statusIcon}><Text style={styles.statusIconText}>{needsAttention ? "!" : "✓"}</Text></View>
          <View style={styles.statusCopy}>
            <Text style={styles.sectionLabel}>SESSION HEALTH</Text>
            <Text style={styles.statusTitle}>{needsAttention ? `${dashboard.live.syncFailures} sessions need attention` : "All systems healthy"}</Text>
            <Text style={styles.statusText}>{dashboard.live.expiredRefreshSessions || 0} expired refresh tokens · {dashboard.live.syncedAccounts} accounts synced</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}><View><Text style={styles.sectionLabel}>PORTAL ACTIVITY</Text><Text style={styles.panelTitle}>Lifetime booking ledger</Text></View><Text style={styles.panelCount}>{eventRows.length} recent</Text></View>
          {eventRows.length ? eventRows.map((event, index) => (
            <View style={[styles.eventRow, index === eventRows.length - 1 && styles.eventRowLast]} key={event.id}>
              <View style={[styles.eventIcon, event.outcome === "success" ? styles.eventIconSuccess : styles.eventIconFailure]}><Text style={styles.eventIconText}>{event.outcome === "success" ? "✓" : "!"}</Text></View>
              <View style={styles.eventMain}><Text style={styles.eventAccount} numberOfLines={1}>{event.accountName}</Text><Text style={styles.eventMeta} numberOfLines={1}>{event.operation}{event.reservationId ? ` · #${event.reservationId}` : ""}</Text></View>
              <View style={styles.eventRight}><Text style={event.outcome === "success" ? styles.success : styles.failure}>{event.outcome === "success" ? "SUCCESS" : "FAILED"}</Text><Text style={styles.eventTime}>{formatUpdated(event.createdAt)}</Text></View>
            </View>
          )) : <Text style={styles.emptyText}>No portal booking events recorded yet.</Text>}
        </View>

        {error ? <Text style={styles.dashboardError}>{error}</Text> : null}
        <Text style={styles.footerText}>Pull down to refresh live operations data</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "danger" }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, tone === "success" && styles.success, tone === "danger" && styles.failure]}>{value}</Text></View>;
}

const COLORS = {
  navy: "#13264a",
  navyDeep: "#09182f",
  blue: "#4078d8",
  blueSoft: "#edf4ff",
  text: "#17243f",
  muted: "#8290a8",
  border: "#e6ebf3",
  surface: "#ffffff",
  background: "#f5f7fb",
  success: "#0d9165",
  successBg: "#eaf9f2",
  danger: "#c94c5a",
  dangerBg: "#fff0f1",
};

const styles = StyleSheet.create({
  authScreen: { flex: 1, backgroundColor: COLORS.navyDeep },
  authInner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logoMark: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#69a9ff", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  logoLetter: { color: COLORS.navyDeep, fontSize: 26, fontWeight: "900" },
  authEyebrow: { color: "#72b0ff", fontSize: 11, fontWeight: "800", letterSpacing: 1.7, marginBottom: 10 },
  authTitle: { color: "#f7faff", fontSize: 38, lineHeight: 44, fontWeight: "800", letterSpacing: -1 },
  authDescription: { color: "#9aaaca", fontSize: 14, lineHeight: 22, marginTop: 12, marginBottom: 28 },
  authCard: { backgroundColor: "#132747", borderRadius: 20, padding: 18, gap: 9 },
  fieldLabel: { color: "#9db4d8", fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 4 },
  authInput: { minHeight: 50, borderRadius: 12, backgroundColor: "#1a3359", paddingHorizontal: 14, color: "#f7faff", fontSize: 15, borderWidth: 1, borderColor: "#27456e" },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: "#69a9ff", alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryButtonText: { color: COLORS.navyDeep, fontSize: 15, fontWeight: "800" },
  authError: { color: "#ffadb5", fontSize: 13, lineHeight: 19, marginTop: 2 },
  authFoot: { color: "#637999", fontSize: 11, textAlign: "center", marginTop: 22 },
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  topBarTitle: { flex: 1 },
  eyebrow: { color: "#4e6eae", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 3 },
  heading: { color: COLORS.text, fontSize: 29, lineHeight: 34, fontWeight: "800", letterSpacing: -0.5 },
  signOutButton: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  signOutText: { color: COLORS.blue, fontSize: 12, fontWeight: "800" },
  heroCard: { backgroundColor: COLORS.navy, borderRadius: 22, padding: 20, marginBottom: 14, shadowColor: "#0b1b37", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  heroTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  heroEyebrow: { color: "#9bc7ff", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  livePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(93, 217, 158, .14)" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#5dd99e", marginRight: 5 },
  livePillText: { color: "#8af0bd", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: "#ffffff", fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.4 },
  heroText: { color: "#b7c9e8", fontSize: 13, lineHeight: 19, marginTop: 6 },
  heroUpdated: { color: "#7592ba", fontSize: 11, marginTop: 16 },
  metricRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  metric: { flex: 1, minHeight: 91, backgroundColor: COLORS.surface, borderRadius: 16, padding: 15, justifyContent: "space-between", borderWidth: 1, borderColor: "#edf0f5" },
  metricLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8, lineHeight: 13 },
  metricValue: { color: COLORS.text, fontSize: 27, fontWeight: "800", lineHeight: 31 },
  statusCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 15, marginTop: 4, marginBottom: 14, borderWidth: 1 },
  statusCardGood: { backgroundColor: COLORS.successBg, borderColor: "#c9efdc" },
  statusCardWarning: { backgroundColor: COLORS.dangerBg, borderColor: "#ffd1d5" },
  statusIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", marginRight: 12 },
  statusIconText: { color: COLORS.success, fontSize: 19, fontWeight: "900" },
  statusCopy: { flex: 1 },
  sectionLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1, marginBottom: 4 },
  statusTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  statusText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  panel: { backgroundColor: COLORS.surface, borderRadius: 18, paddingHorizontal: 16, paddingTop: 17, paddingBottom: 4, borderWidth: 1, borderColor: "#edf0f5", marginBottom: 14 },
  panelHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 11 },
  panelTitle: { color: COLORS.text, fontSize: 18, lineHeight: 23, fontWeight: "800" },
  panelCount: { color: COLORS.blue, fontSize: 11, fontWeight: "800", paddingBottom: 2 },
  eventRow: { minHeight: 66, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#eff2f7", paddingVertical: 11 },
  eventRowLast: { borderBottomWidth: 0 },
  eventIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 11 },
  eventIconSuccess: { backgroundColor: COLORS.successBg },
  eventIconFailure: { backgroundColor: COLORS.dangerBg },
  eventIconText: { color: COLORS.success, fontSize: 16, fontWeight: "900" },
  eventMain: { flex: 1, minWidth: 0, paddingRight: 8 },
  eventAccount: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  eventMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  eventRight: { alignItems: "flex-end", minWidth: 69 },
  eventTime: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  success: { color: COLORS.success, fontWeight: "900", fontSize: 11 },
  failure: { color: COLORS.danger, fontWeight: "900", fontSize: 11 },
  emptyText: { color: COLORS.muted, fontSize: 13, paddingVertical: 18 },
  dashboardError: { color: COLORS.danger, backgroundColor: COLORS.dangerBg, padding: 12, borderRadius: 12, fontSize: 12, lineHeight: 18 },
  footerText: { color: COLORS.muted, fontSize: 11, textAlign: "center", marginTop: 2 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
