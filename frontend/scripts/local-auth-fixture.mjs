#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

const base = (process.env.LOCAL_FIXTURE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const portalEmail = process.env.LOCAL_FIXTURE_PORTAL_EMAIL || "";
const portalPassword = process.env.LOCAL_FIXTURE_PORTAL_PASSWORD || "";
const candidateLogin = process.env.LOCAL_FIXTURE_CANDIDATE_LOGIN || "";
const candidateToken = process.env.LOCAL_FIXTURE_CANDIDATE_TOKEN || "";
const output = process.env.LOCAL_FIXTURE_OUTPUT || "/tmp/svp-local-auth-storage.json";

if (!base || !portalEmail || !portalPassword || !candidateLogin || !candidateToken) {
  console.error("Required environment variables: LOCAL_FIXTURE_SUPABASE_URL, LOCAL_FIXTURE_PORTAL_EMAIL, LOCAL_FIXTURE_PORTAL_PASSWORD, LOCAL_FIXTURE_CANDIDATE_LOGIN, LOCAL_FIXTURE_CANDIDATE_TOKEN");
  process.exit(2);
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${data?.message || data?.error || text || "request failed"}`);
  }
  return data;
}

const portal = await post("/functions/v1/access-auth/login", {
  email: portalEmail,
  password: portalPassword,
});

const candidate = await post("/functions/v1/svp-auth/token-login", {
  login: candidateLogin,
  token: candidateToken,
});

if (!portal.accessToken || !portal.user) throw new Error("Portal login did not return accessToken and user");
if (!candidate.accessToken) throw new Error("Candidate token login did not return accessToken");

const user = portal.user;
const permissions = user.permissions || {};
if (user.role !== "USER" || user.status !== "ACTIVE" || permissions["booking.create"] !== true) {
  throw new Error("Portal account is not an ACTIVE USER with booking.create permission; use the official access-admin permission flow first");
}

const storage = [
  { name: "access_token", value: portal.accessToken },
  { name: "access_user", value: JSON.stringify(user) },
  { name: "access_login_time", value: String(Date.now()) },
  { name: "accessToken", value: candidate.accessToken },
];
if (candidate.refreshToken) storage.push({ name: "refreshToken", value: candidate.refreshToken });
if (candidate.sessionId) storage.push({ name: "sessionId", value: candidate.sessionId });

await fs.writeFile(output, JSON.stringify({ origin: "LOCAL_ONLY", storage }, null, 2), { mode: 0o600 });
console.log(`Wrote local browser storage state to ${output}`);
console.log("No cookies or production data were created; both sessions were obtained from official login endpoints.");
