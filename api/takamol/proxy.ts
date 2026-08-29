const LIVE_API_BASE = (process.env.TAKAMOL_LIVE_API_URL || "https://t2hub.app/takamol/api").replace(/\/$/, "");
const ENCRYPTION_KEY_B64 = process.env.TAKAMOL_ENCRYPTION_KEY_B64 || "";
const STATIC_COOKIE = process.env.TAKAMOL_SESSION_COOKIE || "";
const STATIC_XSRF = process.env.TAKAMOL_XSRF_TOKEN || "";

function json(res: any, status: number, body: unknown) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

async function decryptEnvelope(envelope: any): Promise<any> {
  if (!envelope || typeof envelope !== "object" || !envelope.p || !envelope.iv) return envelope;
  const keyBytes = decodeBase64(ENCRYPTION_KEY_B64);
  const iv = decodeBase64(String(envelope.iv));
  const ciphertext = decodeBase64(String(envelope.p));
  if (keyBytes.byteLength !== 32) throw new Error("Invalid Takamol encryption key");
  if (iv.byteLength < 12) throw new Error("Invalid Takamol IV");
  if (ciphertext.byteLength <= 16) throw new Error("Invalid Takamol ciphertext");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function bodyValue(body: any, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body?.[key];
    if (value !== undefined && value !== null && String(value).length > 0) return String(value);
  }
  return undefined;
}

function normalize(path: string, payload: any): any {
  if (path === "/pacc/occupations") {
    const values = Array.isArray(payload?.occupations) ? payload.occupations : Array.isArray(payload) ? payload : [];
    return { categories: values.map((item: any) => ({ id: item.id ?? item.category_id, name: item.name ?? item.title ?? item.english_name ?? String(item) })) };
  }
  if (path === "/exam-available-dates") {
    return { dates: Array.isArray(payload?.available_dates) ? payload.available_dates : [], cities: [], sessions: [], source: "t2hub-live" };
  }
  if (path === "/test-centers") {
    const values = Array.isArray(payload?.sites) ? payload.sites : Array.isArray(payload) ? payload : [];
    return { centers: values };
  }
  if (path === "/pacc-exam-sessions") {
    const values = Array.isArray(payload?.sessions) ? payload.sessions : Array.isArray(payload) ? payload : [];
    return { sessions: values };
  }
  return payload;
}

async function liveGet(path: string, query: URLSearchParams, req: any): Promise<{ status: number; payload: any }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": String(req.headers["user-agent"] || "T2-Takamol-Same-Origin-Proxy/1.0"),
  };
  const cookie = String(req.headers.cookie || STATIC_COOKIE || "");
  if (cookie) headers.Cookie = cookie;
  const authorization = req.headers.authorization;
  if (authorization) headers.Authorization = String(authorization);
  const xsrf = String(req.headers["x-xsrf-token"] || STATIC_XSRF || "");
  if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
  const referer = String(req.headers.referer || "");
  if (referer) headers.Referer = referer;

  const url = `${LIVE_API_BASE}${path}${query.toString() ? `?${query.toString()}` : ""}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TAKAMOL_HTTP_TIMEOUT || 60000));
  try {
    const upstream = await fetch(url, { headers, signal: controller.signal });
    const text = await upstream.text();
    let payload: any;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!upstream.ok) return { status: upstream.status, payload };
    return { status: upstream.status, payload: await decryptEnvelope(payload) };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "https://t2hub.app");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-XSRF-TOKEN, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.status(204).end();
  }
  try {
    if (!['GET', 'POST'].includes(req.method || '')) return json(res, 405, { success: false, error: "Method not allowed" });
    const suffix = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path || "");
    const incoming = `/${suffix.replace(/^\/+/, "")}`;
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== "path" && typeof value === "string") query.set(key, value);
    }
    let path = incoming;
    if (incoming === "/categories") {
      path = "/pacc/occupations";
      query.set("exclude_ignored", "1");
    } else if (incoming === "/dates") {
      path = "/exam-available-dates";
      const category = bodyValue(body, "category_id", "categoryId");
      const city = bodyValue(body, "city", "city_name");
      if (category) query.set("category_id", category);
      if (city) query.set("city", city);
    } else if (incoming === "/centers") {
      path = "/test-centers";
      const city = bodyValue(body, "city", "city_name");
      if (city) query.set("city", city);
    } else if (incoming === "/sessions") {
      path = "/pacc-exam-sessions";
      for (const [key, keys] of Object.entries({ category_id: ["category_id", "categoryId"], city: ["city", "city_name"], exam_date: ["exam_date", "examDate", "date"] })) {
        const value = bodyValue(body, ...keys);
        if (value) query.set(key, value);
      }
      if (query.get("category_id") && query.get("city") && query.get("exam_date")) {
        await liveGet("/fix-search-mode", query, req).catch(() => undefined);
      }
    }
    const result = await liveGet(path, query, req);
    if (result.status >= 400) return json(res, result.status >= 500 ? 502 : result.status, result.payload);
    return json(res, result.status, { success: true, data: normalize(path, result.payload) });
  } catch (error: any) {
    return json(res, 502, { success: false, error: error?.message || "Takamol proxy request failed" });
  }
}
