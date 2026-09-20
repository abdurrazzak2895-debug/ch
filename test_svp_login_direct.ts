const base = Deno.env.get("SVP_BASE_URL") || "https://svp-international-api.pacc.sa";
const login = Deno.env.get("SVP_TEST_LOGIN") || "";
const password = Deno.env.get("SVP_TEST_PASSWORD") || "";
const url = `${base.replace(/\/$/, "")}/api/v1/sessions/login?locale=en`;
const sensitiveKey = /password|token|authorization|cookie|email|phone|mobile|national.?id|passport|secret|otp|code/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (typeof value === "string") return value.slice(0, 500).replace(/\S+@\S+/g, "[REDACTED_EMAIL]");
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = sensitiveKey.test(key) ? "[REDACTED]" : sanitize(item, depth + 1);
    return result;
  }
  return value == null ? null : String(value).slice(0, 500);
}

if (!login || !password) throw new Error("Set SVP_TEST_LOGIN and SVP_TEST_PASSWORD in the environment");
const response = await fetch(url, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json;charset=UTF-8",
    Origin: "https://svp-international.pacc.sa",
    Referer: "https://svp-international.pacc.sa/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    "X-Tenant-Name": "svp-international",
  },
  body: JSON.stringify({ user: { login, password, otp_method: "email", fe_app: "legislator" } }),
});
const text = await response.text();
let body: unknown;
try { body = text ? JSON.parse(text) : null; } catch { body = { raw_text: text.slice(0, 500) }; }
const headers: Record<string, string> = {};
for (const [key, value] of response.headers.entries()) {
  headers[key.toLowerCase()] = /set-cookie|authorization|cookie/i.test(key) ? "[REDACTED]" : value.slice(0, 240);
}
console.log(JSON.stringify({ url: url.replace(/\/api\/v1\/.*$/, "/api/v1/..."), status: response.status, headers, body: sanitize(body) }, null, 2));
