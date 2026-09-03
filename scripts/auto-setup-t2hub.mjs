#!/usr/bin/env node
/**
 * AUTO SETUP: T2Hub session → local env → Supabase secrets
 *
 * One command does everything:
 *   1. Login to T2Hub via Playwright (headless)
 *   2. Extract session cookies + encryption key
 *   3. Write to .secrets/t2hub-session.env
 *   4. Push all 3 secrets to Supabase via `supabase secrets set`
 *
 * Usage:
 *   node scripts/auto-setup-t2hub.mjs
 *   node scripts/auto-setup-t2hub.mjs --interactive   # visible browser
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.t2hub');
const SESSION_FILE = path.join(ROOT, 'captured', 't2hub-session', 'session.json');
const SECRETS_FILE = path.join(ROOT, '.secrets', 't2hub-session.env');
const PROJECT_REF = 'xklwzkraobxetxdcysun';
const interactive = process.argv.includes('--interactive') || process.argv.includes('-i');

function loadEnv() {
  const env = {};
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq > 0) env[t.substring(0, eq).trim()] = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const name of ['T2HUB_EMAIL', 'T2HUB_PASSWORD', 'T2HUB_LOGIN_URL', 'T2HUB_URL']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Step 1: Login to T2Hub ─────────────────────────────────────────────────
async function loginT2Hub(env) {
  console.log('\n[1/4] Logging into T2Hub...');
  const email = env.T2HUB_EMAIL;
  const password = env.T2HUB_PASSWORD;
  const loginUrl = env.T2HUB_LOGIN_URL || 'https://t2hub.app/takamol/agent/login';
  const baseUrl = env.T2HUB_URL || 'https://takamol.t2hub.app';

  if (!email || !password) {
    throw new Error('T2HUB_EMAIL and T2HUB_PASSWORD required in .env.t2hub');
  }

  const browser = await chromium.launch({
    headless: !interactive,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  try {
    console.log(`  → Navigating to ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

    const emailSelectors = 'input[type="email"], input[type="text"][name="email"], input[name="email"], input[name="username"], input[name="login"], input[name="number"], input[placeholder*="email"], input[placeholder*="Email"], input[placeholder*="user"], input[placeholder*="login"], input[placeholder*="number"]';
    const emailFilled = await page.fill(emailSelectors, email).catch(() => null);
    if (emailFilled === null) await page.type(emailSelectors, email, { delay: 50 });
    await page.waitForTimeout(500);

    await page.fill('input[type="password"], input[name="password"]', password);
    await page.waitForTimeout(500);

    console.log('  → Submitting login...');
    await Promise.race([
      page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Login"), input[type="submit"]'),
      page.keyboard.press('Enter'),
    ]);
    await page.waitForTimeout(5000);

    const cookies = await context.cookies();
    console.log(`  → Captured ${cookies.length} cookies`);

    // Get encryption key from page
    let finalKey = await page.evaluate(() => {
      try { return window.__sk || null; } catch { return null; }
    }).catch(() => null);

    if (finalKey) {
      console.log(`  → Encryption key found (${finalKey.length} chars)`);
    } else {
      console.log('  ⚠ No encryption key found, trying landing page...');
      // Try to navigate to landing page to get __sk
      for (const url of ['https://t2hub.app/takamol/', 'https://takamol.t2hub.app/']) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000);
          const key = await page.evaluate(() => {
            try { return window.__sk || null; } catch { return null; }
          }).catch(() => null);
          if (key) {
            finalKey = key;
            console.log(`  → Encryption key found on ${url} (${finalKey.length} chars)`);
            break;
          }
        } catch {}
      }
    }

    await browser.close();

    return { cookies, encryptionKey: finalKey, loginUrl, baseUrl };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

// ── Step 2: Save session locally ───────────────────────────────────────────
function saveSession(sessionData) {
  console.log('\n[2/4] Saving session locally...');
  ensureDir(SESSION_FILE);
  const session = {
    cookies: sessionData.cookies,
    encryptionKey: sessionData.encryptionKey,
    loginUrl: sessionData.loginUrl,
    baseUrl: sessionData.baseUrl,
    loggedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  console.log(`  → Saved to ${SESSION_FILE}`);
  return session;
}

// ── Step 3: Write secrets file ─────────────────────────────────────────────
function writeSecretsFile(session) {
  console.log('\n[3/4] Writing secrets file...');
  ensureDir(SECRETS_FILE);

  const cookieHeader = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const xsrfCookie = session.cookies.find(c => c.name === 'XSRF-TOKEN');
  const csrf = xsrfCookie?.value || '';

  const envVars = {
    T2HUB_SESSION_KEY: session.encryptionKey || '',
    T2HUB_SESSION_COOKIE: cookieHeader,
    T2HUB_SESSION_CSRF: csrf,
  };

  const lines = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(SECRETS_FILE, lines.join('\n') + '\n');

  for (const [k, v] of Object.entries(envVars)) {
    const display = v.length > 50 ? v.substring(0, 25) + '...' + v.substring(v.length - 15) : v;
    console.log(`  → ${k} (${v.length} chars): ${display}`);
  }

  return envVars;
}

// ── Step 4: Push to Supabase ───────────────────────────────────────────────
function pushToSupabase(envVars) {
  console.log('\n[4/4] Pushing to Supabase secrets...');
  const failures = [];

  for (const [name, value] of Object.entries(envVars)) {
    if (!value) {
      failures.push(`${name} is empty`);
      console.error(`  ✗ ${name} is empty`);
      continue;
    }

    const tempEnv = path.join(process.env.TEMP || '/tmp', `supabase-${name}-${Date.now()}.env`);
    try {
      fs.writeFileSync(tempEnv, `${name}=${value}`, { mode: 0o600 });
      execSync(`supabase secrets set --env-file "${tempEnv}" --project-ref ${PROJECT_REF}`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log(`  ✓ ${name} set (${value.length} chars)`);
    } catch (e) {
      const stderr = e.stderr?.toString() || e.message;
      failures.push(`${name}: ${stderr.substring(0, 160)}`);
      console.error(`  ✗ ${name} failed: ${stderr.substring(0, 160)}`);
    } finally {
      try { fs.unlinkSync(tempEnv); } catch {}
    }
  }

  if (failures.length) throw new Error(`Supabase secret update failed: ${failures.join('; ')}`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== AUTO SETUP: T2Hub → Supabase ===');
  console.log(`Mode: ${interactive ? 'interactive (visible browser)' : 'headless'}`);

  const env = loadEnv();
  console.log(`Credentials: ${env.T2HUB_EMAIL ? '✓ loaded' : '✗ missing'} from .env.t2hub`);

  // Step 1: Login
  const sessionData = await loginT2Hub(env);

  // Step 2: Save locally
  const session = saveSession(sessionData);

  // Step 3: Write secrets
  const envVars = writeSecretsFile(session);
  if (!envVars.T2HUB_SESSION_KEY) {
    throw new Error('T2HUB_SESSION_KEY was not captured; refusing to publish an incomplete session');
  }

  // Step 4: Push to Supabase
  pushToSupabase(envVars);

  console.log('\n=== DONE ===');
  console.log('T2Hub session is now live on Supabase.');
}

main().catch(e => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
