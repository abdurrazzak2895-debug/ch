import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { BANGLADESH_PHONE_ERROR, normalizeBangladeshPhone } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET_RAW = Deno.env.get("JWT_ACCESS_SECRET");
if (!JWT_SECRET_RAW) throw new Error("JWT_ACCESS_SECRET is required");
const PERMISSION_KEYS = ["booking.create", "reservation.manage", "payment.create", "wallet.deposit", "users.create"];

// Create crypto key for JWT
async function getJwtKey() {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET_RAW),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function publicAccount(account: any) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone,
    role: account.role,
    status: account.status,
    agency_id: account.agency_id,
    created_by_id: account.created_by_id,
    permission_mode: account.permission_mode || "LEGACY",
    self_registered: Boolean(account.self_registered),
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

async function permissionsFor(supabase: ReturnType<typeof getSupabase>, account: any) {
  if (account.role === "ADMIN") return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true]));
  const permissions: Record<string, boolean> = account.permission_mode === "MANAGED"
    ? Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false]))
    : {
      "booking.create": account.role === "USER",
      "reservation.manage": account.role === "USER",
      "payment.create": account.role === "USER",
      "wallet.deposit": false,
      "users.create": account.role === "AGENCY",
    };
  const { data } = await supabase.from("account_permissions").select("permission_key,allowed").eq("account_id", account.id);
  for (const row of data || []) if (PERMISSION_KEYS.includes(row.permission_key)) permissions[row.permission_key] = Boolean(row.allowed);
  return permissions;
}

async function signToken(payload: { sub: string; role: string }) {
  const key = await getJwtKey();
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp: getNumericDate(7 * 24 * 60 * 60) },
    key
  );
}

async function verifyToken(token: string) {
  const key = await getJwtKey();
  return await verify(token, key);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/access-auth/, "");
  const supabase = getSupabase();

  try {
    // POST /login
    if (path === "/login" && req.method === "POST") {
      const { email, password } = await req.json();
      if (!email || !password) {
        return new Response(JSON.stringify({ message: "Email and password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("email", email.toLowerCase())
        .single();

      if (error || !account) {
        return new Response(JSON.stringify({ message: "Invalid credentials" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const matches = bcrypt.compareSync(password, account.password);
      if (!matches) {
        return new Response(JSON.stringify({ message: "Invalid credentials" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (account.status !== "ACTIVE") {
        return new Response(JSON.stringify({ message: `Account is ${account.status.toLowerCase()}` }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = await signToken({ sub: account.id, role: account.role });
      const permissions = await permissionsFor(supabase, account);

      return new Response(JSON.stringify({
        message: "Login successful",
        accessToken: token,
        user: { ...publicAccount(account), permissions },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /logout
    if (path === "/logout" && req.method === "POST") {
      return new Response(JSON.stringify({ message: "Logout successful" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /me
    if (path === "/me" && req.method === "GET") {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let payload;
      try {
        payload = await verifyToken(token);
      } catch {
        return new Response(JSON.stringify({ message: "Token expired or invalid" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: account, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", payload.sub as string)
        .single();

      if (error || !account) {
        return new Response(JSON.stringify({ message: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (account.status !== "ACTIVE") {
        return new Response(JSON.stringify({ message: "Account is not active" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const permissions = await permissionsFor(supabase, account);
      return new Response(JSON.stringify({ user: { ...publicAccount(account), permissions } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /refresh
    if (path === "/refresh" && req.method === "POST") {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let payload;
      try {
        payload = await verifyToken(token);
      } catch {
        return new Response(JSON.stringify({ message: "Token expired or invalid" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: account } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", payload.sub as string)
        .single();

      if (!account || account.status !== "ACTIVE") {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newToken = await signToken({ sub: account.id, role: account.role });
      const permissions = await permissionsFor(supabase, account);
      return new Response(JSON.stringify({
        message: "Token refreshed",
        accessToken: newToken,
        user: { ...publicAccount(account), permissions },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /register — public Access Portal registration. The role is always
    // USER and managed permissions start disabled until an admin grants them.
    if (path === "/register" && req.method === "POST") {
      const { name, email, phone: phoneInput, password } = await req.json();
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const phone = normalizeBangladeshPhone(phoneInput);
      if (!String(name || "").trim() || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        return new Response(JSON.stringify({ message: "Valid name and email are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof password !== "string" || password.length < 8) {
        return new Response(JSON.stringify({ message: "Password must be at least 8 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!phone) {
        return new Response(JSON.stringify({ message: BANGLADESH_PHONE_ERROR }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existing } = await supabase.from("accounts").select("id").eq("email", normalizedEmail).single();
      if (existing) {
        return new Response(JSON.stringify({ message: "Email already in use" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existingPhone } = await supabase.from("accounts").select("id").eq("phone", phone).maybeSingle();
      if (existingPhone) {
        return new Response(JSON.stringify({ message: "Phone number already in use" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: account, error } = await supabase.from("accounts").insert({
        name: String(name).trim().slice(0, 160),
        email: normalizedEmail,
        phone,
        password: bcrypt.hashSync(password),
        role: "USER",
        status: "ACTIVE",
        permission_mode: "MANAGED",
        self_registered: true,
      }).select().single();
      if (error) throw error;
      await supabase.from("access_audit_log").insert({
        actor_account_id: account.id, target_account_id: account.id,
        action: "account.self_registered", details: { email: normalizedEmail },
      });
      return new Response(JSON.stringify({
        message: "Account created. An administrator must grant booking, reservation, payment, or deposit permissions.",
        user: { ...publicAccount(account), permissions: await permissionsFor(supabase, account) },
      }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // POST /bootstrap - create default admin
    if (path === "/bootstrap" && req.method === "POST") {
      const { name, email, password } = await req.json();
      const adminEmail = (email || "admin@example.com").toLowerCase();
      const adminName = name || "Super Admin";
      const adminPassword = password || "12345678";

      const { data: existing } = await supabase
        .from("accounts")
        .select("id")
        .eq("email", adminEmail)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ message: "Admin already exists" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hash = bcrypt.hashSync(adminPassword);
      const { data: admin, error } = await supabase
        .from("accounts")
        .insert({
          name: adminName,
          email: adminEmail,
          password: hash,
          role: "ADMIN",
          status: "ACTIVE",
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ message: "Failed to create admin", error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Admin created", admin: publicAccount(admin) }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /forgot-password
    if (path === "/forgot-password" && req.method === "POST") {
      const { email } = await req.json();
      if (!email) {
        return new Response(JSON.stringify({ message: "Email is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account } = await supabase
        .from("accounts")
        .select("id, name, email, status")
        .eq("email", email.toLowerCase())
        .single();

      // Always return success to avoid email enumeration
      if (!account || account.status !== "ACTIVE") {
        return new Response(JSON.stringify({ message: "If an account with that email exists, a reset code has been generated." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a 6-digit OTP code
      const resetCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

      // Invalidate old tokens
      await supabase
        .from("password_reset_tokens")
        .delete()
        .eq("account_id", account.id);

      await supabase
        .from("password_reset_tokens")
        .insert({
          account_id: account.id,
          token: resetCode,
          expires_at: expiresAt,
        });

      // Return the code in response (in production, send via email)
      return new Response(JSON.stringify({
        message: "If an account with that email exists, a reset code has been generated.",
        // Include code for now since no email service is configured
        resetCode,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /reset-password
    if (path === "/reset-password" && req.method === "POST") {
      const { email, code, newPassword } = await req.json();
      if (!email || !code || !newPassword) {
        return new Response(JSON.stringify({ message: "Email, code, and new password are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ message: "Password must be at least 6 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the account
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .eq("email", email.toLowerCase())
        .single();

      if (!account) {
        return new Response(JSON.stringify({ message: "Invalid reset code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify reset token
      const { data: tokenRecord } = await supabase
        .from("password_reset_tokens")
        .select("*")
        .eq("account_id", account.id)
        .eq("token", code)
        .is("used_at", null)
        .single();

      if (!tokenRecord) {
        return new Response(JSON.stringify({ message: "Invalid reset code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        return new Response(JSON.stringify({ message: "Reset code has expired" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update password
      const hash = bcrypt.hashSync(newPassword);
      await supabase
        .from("accounts")
        .update({ password: hash })
        .eq("id", account.id);

      // Mark token as used
      await supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenRecord.id);

      return new Response(JSON.stringify({ message: "Password reset successfully" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
