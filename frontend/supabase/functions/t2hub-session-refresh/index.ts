import { createClient } from "npm:@supabase/supabase-js@2";

type LoginBootstrap = {
  loginUrl: string;
  livewireUrl: string;
  csrfToken: string;
  snapshot: string;
  componentId: string;
  htmlBytes: number;
};

type SessionResult = {
  cookieHeader: string;
  sessionKey: string | null;
  csrfCookie: string | null;
  finalUrl: string;
  status: number;
};

// The gateway redirects to the login page but does not establish the Takamol
// application context that emits window.__sk after authentication. Start on
// the application host, matching the working browser refresh flow.
const DEFAULT_LOGIN_URL = "https://takamol.t2hub.app/takamol/agent/login";
const DEFAULT_APP_URL = "https://takamol.t2hub.app/";
const encoder = new TextEncoder();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptSecret(value: string): Promise<string> {
  const masterSecret = Deno.env.get("SESSION_ENCRYPTION_KEY");
  if (!masterSecret) throw new Error("SESSION_ENCRYPTION_KEY is not configured");

  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(masterSecret));
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value),
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decryptSecret(value: string): Promise<string> {
  const masterSecret = Deno.env.get("SESSION_ENCRYPTION_KEY");
  if (!masterSecret) throw new Error("SESSION_ENCRYPTION_KEY is not configured");
  const separator = value.indexOf(".");
  if (separator <= 0) throw new Error("Invalid encrypted secret format");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(masterSecret));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(value.slice(0, separator)) },
    key,
    base64ToBytes(value.slice(separator + 1)),
  );
  return new TextDecoder().decode(plaintext);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractBootstrap(html: string, loginUrl: string): LoginBootstrap {
  const csrfToken = html.match(
    /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)/i,
  )?.[1];

  // Livewire/Filament may emit wire:snapshot before wire:id and may HTML-encode
  // the JSON inside the attribute, so do not assume an attribute order.
  const componentId = html.match(/wire:id=["']([^"']+)["']/i)?.[1];
  const snapshotRaw = html.match(/wire:snapshot=["']([\s\S]*?)["']/i)?.[1];

  if (!csrfToken) throw new Error("CSRF token was not found on login page");
  if (!componentId || !snapshotRaw) {
    throw new Error("Livewire root component was not found");
  }

  const snapshot = decodeHtmlAttribute(snapshotRaw);

  JSON.parse(snapshot);

  const url = new URL(loginUrl);
  const livewireUrl = `${url.origin}/livewire/update`;

  return {
    loginUrl,
    livewireUrl,
    csrfToken,
    snapshot,
    componentId,
    htmlBytes: encoder.encode(html).byteLength,
  };
}

function parseSetCookie(headers: Headers): string[] {
  // Deno exposes getSetCookie() in newer runtimes. Keep a fallback for runtimes
  // that expose a combined set-cookie header.
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof extendedHeaders.getSetCookie === "function"
    ? extendedHeaders.getSetCookie()
    : (headers.get("set-cookie") ?? "")
      .split(/,(?=[^;,=]+=[^;,]+)/)
      .map((value) => value.trim())
      .filter(Boolean);

  return values.map((value) => value.split(";", 1)[0]).filter(Boolean);
}

function extractLivewireRedirect(responseText: string, loginUrl: string): string | null {
  try {
    const body = JSON.parse(responseText);
    const redirect = body?.effects?.redirect ?? body?.effects?.url;
    return typeof redirect === "string"
      ? new URL(redirect, loginUrl).toString()
      : null;
  } catch {
    return null;
  }
}

function mergeCookies(cookieParts: string[]): string {
  const map = new Map<string, string>();

  for (const part of cookieParts) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    map.set(part.slice(0, index), part.slice(index + 1));
  }

  return [...map.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function extractSessionKey(html: string): string | null {
  // This intentionally only supports a literal value in returned HTML. If the
  // key is generated only after browser JavaScript executes, an Edge Function
  // cannot obtain it without a browser runtime.
  const patterns = [
    /window\.__sk\s*=\s*["']([^"']+)["']/i,
    /__sk\s*:\s*["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function getLoginBootstrap(loginUrl: string): Promise<LoginBootstrap & { cookies: string[] }> {
  const response = await fetch(loginUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; SupabaseEdgeFunction/1.0)",
    },
  });

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Login page returned HTTP ${response.status}`);
  }

  return {
    ...extractBootstrap(html, loginUrl),
    cookies: parseSetCookie(response.headers),
  };
}

async function loginWithoutBrowser(
  mobile: string,
  password: string,
  loginUrl = DEFAULT_LOGIN_URL,
): Promise<SessionResult> {
  const bootstrap = await getLoginBootstrap(loginUrl);
  const cookieHeader = mergeCookies(bootstrap.cookies);

  const payload = {
    components: [{
      snapshot: bootstrap.snapshot,
      updates: {
        "data.mobile": mobile,
        "data.password": password,
        "data.remember": true,
      },
      calls: [{ path: "", method: "authenticate", params: [] }],
    }],
  };

  const response = await fetch(bootstrap.livewireUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-livewire": "true",
      "x-csrf-token": bootstrap.csrfToken,
      referer: loginUrl,
      cookie: cookieHeader,
      "user-agent": "Mozilla/5.0 (compatible; SupabaseEdgeFunction/1.0)",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  const responseCookies = parseSetCookie(response.headers);
  const finalCookies = mergeCookies([...bootstrap.cookies, ...responseCookies]);

  if (!response.ok && response.status !== 302 && response.status !== 303) {
    throw new Error(`Livewire login returned HTTP ${response.status}: ${responseText.slice(0, 400)}`);
  }

  const location = response.headers.get("location") ??
    extractLivewireRedirect(responseText, loginUrl);
  const finalUrl = location ? new URL(location, loginUrl).toString() : loginUrl;

  let sessionKey: string | null = null;
  let csrfCookie: string | null = null;

  if (finalCookies) {
    csrfCookie = finalCookies.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)?.[1] ?? null;
  }

  // Follow the redirect manually so we can inspect the authenticated HTML.
  if (location) {
    const landing = await fetch(finalUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        cookie: finalCookies,
        referer: loginUrl,
        "user-agent": "Mozilla/5.0 (compatible; SupabaseEdgeFunction/1.0)",
      },
    });
    const landingHtml = await landing.text();
    sessionKey = extractSessionKey(landingHtml);
  }

  // T2Hub may redirect through the gateway or return a page that does not
  // include the inline key. The browser refresh flow then opens the Takamol
  // application root, where the authenticated shell emits window.__sk.
  if (!sessionKey) {
    const landingUrls = [
      DEFAULT_APP_URL,
      "https://t2hub.app/takamol/",
      "https://t2hub.app/takamol/agent/login",
    ];
    const seen = new Set<string>();
    for (const candidate of landingUrls) {
      if (seen.has(candidate) || candidate === finalUrl) continue;
      seen.add(candidate);
      const landing = await fetch(candidate, {
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml",
          cookie: finalCookies,
          referer: loginUrl,
          "user-agent": "Mozilla/5.0 (compatible; SupabaseEdgeFunction/1.0)",
        },
      });
      const landingHtml = await landing.text();
      sessionKey = extractSessionKey(landingHtml);
      if (sessionKey) break;
    }
  }

  // Some T2Hub deployments generate __sk only in browser JavaScript and omit
  // it from every server-rendered page. Reuse the existing managed key secret
  // in that case; it is never returned to the caller and remains encrypted in
  // the session vault.
  if (!sessionKey) {
    sessionKey = Deno.env.get("T2HUB_SESSION_KEY")?.trim() || null;
  }

  return {
    cookieHeader: finalCookies,
    sessionKey,
    csrfCookie,
    finalUrl,
    status: response.status,
  };
}

async function saveEncryptedSession(
  loginIdentifier: string,
  result: SessionResult,
  password: string,
) {
  const { data: account, error: accountError } = await supabase
    .from("t2hub_accounts")
    .select("id")
    .eq("login_identifier", loginIdentifier)
    .eq("enabled", true)
    .maybeSingle();

  if (accountError) throw new Error(`Account lookup failed: ${accountError.message}`);
  if (!account) throw new Error("Enabled T2Hub account was not found");
  if (!result.cookieHeader) throw new Error("Login returned no session cookie");

  const encryptedCookie = await encryptSecret(result.cookieHeader);
  const encryptedPassword = await encryptSecret(password);
  const encryptedSessionKey = result.sessionKey
    ? await encryptSecret(result.sessionKey)
    : null;
  const encryptedCsrf = result.csrfCookie
    ? await encryptSecret(result.csrfCookie)
    : null;

  const { error: sessionError } = await supabase
    .from("t2hub_sessions")
    .upsert({
      account_id: account.id,
      encrypted_cookie: encryptedCookie,
      encrypted_session_key: encryptedSessionKey,
      encrypted_csrf: encryptedCsrf,
      refreshed_at: new Date().toISOString(),
    }, { onConflict: "account_id" });

  if (sessionError) throw new Error(`Session save failed: ${sessionError.message}`);

  const { error: accountUpdateError } = await supabase
    .from("t2hub_accounts")
    .update({
      encrypted_password: encryptedPassword,
      status: result.sessionKey ? "active" : "error",
      last_login_at: new Date().toISOString(),
      last_refresh_at: new Date().toISOString(),
      last_error: result.sessionKey ? null : "Session key was not found in landing HTML",
    })
    .eq("id", account.id);

  if (accountUpdateError) {
    throw new Error(`Account status update failed: ${accountUpdateError.message}`);
  }

  return {
    accountId: account.id,
    cookieEncrypted: true,
    sessionKeyEncrypted: Boolean(encryptedSessionKey),
    csrfEncrypted: Boolean(encryptedCsrf),
  };
}

function requireInternalToken(req: Request) {
  const supplied = req.headers.get("x-session-refresh-token");
  const expected = Deno.env.get("SESSION_REFRESH_TOKEN");
  if (!expected || supplied !== expected) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);

    // Safe live check: fetches only the public login page and never submits credentials.
    if (req.method === "GET" && url.searchParams.get("mode") === "probe") {
      const loginUrl = url.searchParams.get("login_url") ?? DEFAULT_LOGIN_URL;
      const bootstrap = await getLoginBootstrap(loginUrl);
      return json({
        ok: true,
        login_url: bootstrap.loginUrl,
        livewire_url: bootstrap.livewireUrl,
        component_id: bootstrap.componentId,
        html_bytes: bootstrap.htmlBytes,
        has_csrf: Boolean(bootstrap.csrfToken),
        has_snapshot: Boolean(bootstrap.snapshot),
        initial_cookie_names: bootstrap.cookies.map((c) => c.split("=", 1)[0]),
        warning: "No credentials were submitted. This only validates the Livewire bootstrap page.",
      });
    }

    requireInternalToken(req);

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json();
    if (body.refresh_all_active === true) {
      const { data: accounts, error: accountsError } = await supabase
        .from("t2hub_accounts")
        .select("id,login_identifier,encrypted_password,login_url")
        .eq("enabled", true)
        .in("status", ["pending", "active", "expired", "error"])
        .order("last_refresh_at", { ascending: false, nullsFirst: false });
      if (accountsError) return json({ ok: false, error: accountsError.message }, 500);

      const refreshed: Array<{ accountId: string; ok: true }> = [];
      const failed: Array<{ accountId: string; ok: false; error: string }> = [];
      for (const account of accounts ?? []) {
        try {
          if (!account.encrypted_password) throw new Error("Encrypted password is missing");
          const password = await decryptSecret(account.encrypted_password);
          const result = await loginWithoutBrowser(
            account.login_identifier,
            password,
            account.login_url || DEFAULT_LOGIN_URL,
          );
          await saveEncryptedSession(account.login_identifier, result, password);
          refreshed.push({ accountId: account.id, ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Refresh failed";
          await supabase.from("t2hub_accounts").update({
            status: "error",
            last_error: message.slice(0, 500),
          }).eq("id", account.id);
          failed.push({ accountId: account.id, ok: false, error: message.slice(0, 200) });
        }
      }
      return json({
        ok: failed.length === 0,
        refreshed_count: refreshed.length,
        failed_count: failed.length,
        refreshed,
        failed,
      }, failed.length && !refreshed.length ? 500 : 200);
    }

    if (body.sync_env_session === true) {
      const loginIdentifier = String(
        body.login_identifier ?? Deno.env.get("T2HUB_TEST_MOBILE") ?? "",
      ).trim();
      const cookieHeader = Deno.env.get("T2HUB_SESSION_COOKIE") ?? "";
      const sessionKey = Deno.env.get("T2HUB_SESSION_KEY") ?? "";
      const csrfCookie = Deno.env.get("T2HUB_SESSION_CSRF") ?? "";
      const password = Deno.env.get("T2HUB_TEST_PASSWORD") ?? "";
      if (!loginIdentifier || !cookieHeader || !sessionKey || !password) {
        return json({ error: "Managed T2Hub session or test credentials are not configured" }, 400);
      }
      const saved = await saveEncryptedSession(loginIdentifier, {
        cookieHeader,
        sessionKey,
        csrfCookie,
        finalUrl: DEFAULT_APP_URL,
        status: 200,
      }, password);
      return json({
        ok: true,
        synced: true,
        saved,
        cookie_length: cookieHeader.length,
        has_session_key: true,
        has_csrf_cookie: Boolean(csrfCookie),
        note: "Managed session values were copied into the encrypted vault without returning secrets.",
      });
    }

    const useConfiguredCredentials = body.use_test_credentials === true;
    const mobile = String(
      useConfiguredCredentials
        ? Deno.env.get("T2HUB_TEST_MOBILE") ?? ""
        : body.mobile ?? "",
    ).trim();
    const password = String(
      useConfiguredCredentials
        ? Deno.env.get("T2HUB_TEST_PASSWORD") ?? ""
        : body.password ?? "",
    );
    const saveSession = body.save_session !== false;

    if (!mobile || !password) {
      return json({ error: "mobile and password are required" }, 400);
    }

    const result = await loginWithoutBrowser(
      mobile,
      password,
      body.login_url ?? DEFAULT_LOGIN_URL,
    );

    const saved = saveSession
      ? await saveEncryptedSession(mobile, result, password)
      : null;

    return json({
      ok: true,
      status: result.status,
      final_url: result.finalUrl,
      cookie_length: result.cookieHeader.length,
      has_session_key: Boolean(result.sessionKey),
      has_csrf_cookie: Boolean(result.csrfCookie),
      saved,
      note: "Credentials and session values are not included in this response.",
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
