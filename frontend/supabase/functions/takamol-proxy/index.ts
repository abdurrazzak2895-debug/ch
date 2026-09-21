/**
 * Secure Takamol live-system proxy.
 *
 * The live Laravel API returns { p, iv } where p and iv are base64 strings and
 * the ciphertext is AES-GCM encrypted. The encryption key is read only from
 * the Supabase function secret TAKAMOL_ENCRYPTION_KEY_B64; it is never sent to
 * the browser or committed to the repository.
 *
 * Frontend routes are normalized to the live system:
 *   /api/takamol/categories -> /pacc/occupations?exclude_ignored=1
 *   /api/takamol/dates      -> /exam-available-dates
 *   /api/takamol/centers    -> /test-centers
 *   /api/takamol/sessions   -> /pacc-exam-sessions
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cookie",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const LIVE_API_BASE = (Deno.env.get("TAKAMOL_LIVE_API_URL") || "https://t2hub.app/takamol/api").replace(/\/$/, "");
const ENCRYPTION_KEY_B64 = (Deno.env.get("TAKAMOL_ENCRYPTION_KEY_B64") || "").trim();

type Json = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function decryptLiveEnvelope(envelope: Json): Promise<any> {
  if (!envelope.p || !envelope.iv) return envelope;
  if (!ENCRYPTION_KEY_B64) throw new Error("TAKAMOL_ENCRYPTION_KEY_B64 is not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(ENCRYPTION_KEY_B64),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(String(envelope.iv)) },
    key,
    fromBase64(String(envelope.p)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function queryFromBody(body: Json): URLSearchParams {
  const query = new URLSearchParams();
  const categoryId = body.category_id ?? body.categoryId;
  const city = body.city ?? body.city_name;
  const examDate = body.exam_date ?? body.examDate ?? body.date;
  if (categoryId !== undefined && categoryId !== null && String(categoryId)) query.set("category_id", String(categoryId));
  if (city !== undefined && city !== null && String(city)) query.set("city", String(city));
  if (examDate !== undefined && examDate !== null && String(examDate)) query.set("exam_date", String(examDate));
  return query;
}

function normalize(path: string, payload: any): any {
  if (path === "/pacc/occupations") {
    const occupations = Array.isArray(payload?.occupations) ? payload.occupations : Array.isArray(payload) ? payload : [];
    return { categories: occupations.map((item: any) => ({ id: item.id ?? item.category_id, name: item.name ?? item.title ?? item.english_name ?? String(item) })) };
  }
  if (path === "/exam-available-dates") {
    return { dates: Array.isArray(payload?.available_dates) ? payload.available_dates : [], cities: [], sessions: [], source: "svp-live" };
  }
  if (path === "/test-centers") {
    const sites = Array.isArray(payload?.sites) ? payload.sites : Array.isArray(payload) ? payload : [];
    return { centers: sites };
  }
  if (path === "/pacc-exam-sessions") {
    return { sessions: Array.isArray(payload?.sessions) ? payload.sessions : Array.isArray(payload) ? payload : [] };
  }
  return payload;
}

/** Resolve frontend and raw API paths relative to the live API base. */
function resolveRoute(incomingPath: string): { path: string; kind?: string } {
  const routes: Record<string, { path: string; kind?: string }> = {
    "/api/takamol/categories": { path: "/pacc/occupations", kind: "categories" },
    "/api/pacc/occupations": { path: "/pacc/occupations", kind: "categories" },
    "/api/takamol/dates": { path: "/exam-available-dates", kind: "dates" },
    "/api/exam-available-dates": { path: "/exam-available-dates", kind: "dates" },
    "/api/takamol/centers": { path: "/test-centers", kind: "centers" },
    "/api/test-centers": { path: "/test-centers", kind: "centers" },
    "/api/takamol/sessions": { path: "/pacc-exam-sessions", kind: "sessions" },
    "/api/pacc-exam-sessions": { path: "/pacc-exam-sessions", kind: "sessions" },
    "/api/fix-search-mode": { path: "/fix-search-mode", kind: "fix-search-mode" },
  };
  return routes[incomingPath] || { path: incomingPath };
}

async function fetchLive(path: string, query: URLSearchParams, req: Request): Promise<{ status: number; payload: any }> {
  const upstreamUrl = `${LIVE_API_BASE}${path}${query.toString() ? `?${query.toString()}` : ""}`;
  const headers = new Headers({ Accept: "application/json" });
  const authorization = req.headers.get("authorization");
  const requestCookie = req.headers.get("cookie");
  const configuredCookie = Deno.env.get("TAKAMOL_SESSION_COOKIE");
  const cookie = requestCookie || configuredCookie;
  const xsrfToken = Deno.env.get("TAKAMOL_XSRF_TOKEN");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);
  if (xsrfToken && !headers.has("x-xsrf-token")) headers.set("x-xsrf-token", xsrfToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(upstreamUrl, { headers, signal: controller.signal });
    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok) return { status: response.status, payload };
    return { status: response.status, payload: await decryptLiveEnvelope(payload) };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const incomingPath = url.pathname.replace(/^\/takamol-proxy/, "") || "/";
    let body: Json = {};
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      try { body = await req.json(); } catch { body = {}; }
    }

    const resolved = resolveRoute(incomingPath);
    let path = resolved.path;
    const query = new URLSearchParams(url.search);
    if (resolved.kind === "categories") {
      query.set("exclude_ignored", "1");
    } else if (resolved.kind === "dates") {
      for (const [key, value] of queryFromBody(body)) query.set(key, value);
    } else if (resolved.kind === "centers") {
      for (const [key, value] of queryFromBody(body)) query.set(key, value);
    } else if (resolved.kind === "sessions") {
      for (const [key, value] of queryFromBody(body)) query.set(key, value);
      // The live system prepares search mode before the session lookup.
      if (query.get("category_id") && query.get("city") && query.get("exam_date")) {
        await fetchLive("/fix-search-mode", query, req).catch(() => undefined);
      }
    } else if (incomingPath === "/api/auth/status") {
      // Auth status check - return session info from environment
      const sessionCookie = Deno.env.get("TAKAMOL_SESSION_COOKIE") || "";
      const xsrfToken = Deno.env.get("TAKAMOL_XSRF_TOKEN") || "";
      return json({
        success: true,
        data: {
          authenticated: Boolean(sessionCookie),
          hasCookie: Boolean(sessionCookie),
          hasXsrf: Boolean(xsrfToken),
          cookieLength: sessionCookie.length,
        },
      });
    }

    const result = await fetchLive(path, query, req);
    if (result.status >= 400) return json(result.payload, result.status);
    return json({ success: true, data: normalize(path, result.payload) }, result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Takamol proxy request failed";
    return json({ success: false, error: message }, 502);
  }
});
