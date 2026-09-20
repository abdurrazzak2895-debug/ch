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
const PROJECT_REF = process.env.SUPABASE_PROJECT_ID || 'xklwzkraobxetxdcysun';
const interactive = process.argv.includes('--interactive') || process.argv.includes('-i');

function loadEnv() {
  // GitHub Actions supplies secrets through process.env. The local file is
  // only a developer fallback and must never override CI secrets.
  const env = {
    T2HUB_EMAIL: process.env.T2HUB_EMAIL || '',
    T2HUB_PASSWORD: process.env.T2HUB_PASSWORD || '',
    T2HUB_LOGIN_URL: process.env.T2HUB_LOGIN_URL || '',
    T2HUB_URL: process.env.T2HUB_URL || '',
  };
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq > 0) {
        const key = t.substring(0, eq).trim();
        const value = t.substring(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!env[key]) env[key] = value;
      }
    }
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
  const loginUrl = env.T2HUB_LOGIN_URL || 'https://takamol.t2hub.app/takamol/agent/login';
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

    const emailSelectors = '#form\\.mobile, #form\\.email, input[type="email"], input[type="text"][name="email"], input[name="email"], input[name="username"], input[name="login"], input[name="number"], input[placeholder*="email"], input[placeholder*="Email"], input[placeholder*="user"], input[placeholder*="login"], input[placeholder*="number"], input[placeholder*="mobile"], input[placeholder*="Mobile"]';
    const emailFilled = await page.fill(emailSelectors, email).catch(() => null);
    if (emailFilled === null) await page.type(emailSelectors, email, { delay: 50 });
    await page.waitForTimeout(500);

    await page.fill('#form\\.password, input[type="password"], input[name="password"]', password);
    await page.waitForTimeout(500);

    console.log('  → Submitting login...');
    await Promise.race([
      page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Login"), input[type="submit"]'),
      page.keyboard.press('Enter'),
    ]);
    await page.waitForTimeout(5000);

    const loginError = await page.locator('body').innerText().catch(() => '');
    if (/no agent or staff account found|invalid credentials|incorrect password|login failed/i.test(loginError)) {
      throw new Error('T2Hub login failed: the supplied mobile number is not an agent/staff account or the credentials were rejected');
    }

    const cookies = await context.cookies();
    console.log(`  → Captured ${cookies.length} cookies`);

    // Get encryption key from page
    const encryptionKey = await page.evaluate(() => {
      try { return window.__sk || null; } catch { return null; }
    }).catch(() => null);

    if (encryptionKey) {
      console.log(`  → Encryption key found (${encryptionKey.length} chars)`);
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
            console.log(`  → Encryption key found on ${url} (${key.length} chars)`);
            break;
          }
        } catch {}
      }
    }

    const finalKey = await page.evaluate(() => {
      try { return window.__sk || null; } catch { return null; }
    }).catch(() => null);

    if (!finalKey) {
      throw new Error('T2Hub encryption key was not captured; refusing to publish cookies without a matching key');
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

  for (const [name, value] of Object.entries(envVars)) {
    if (!value) {
      console.log(`  ⚠ Skipping ${name} (empty)`);
      continue;
    }

    const tempEnv = path.join(process.env.TEMP || '/tmp', `supabase-${name}-${Date.now()}.env`);
    try {
      fs.writeFileSync(tempEnv, `${name}=${value}`);
      execSync(`npx --yes supabase secrets set --env-file "${tempEnv}" --project-ref ${PROJECT_REF}`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log(`  ✓ ${name} set (${value.length} chars)`);
    } catch (e) {
      const stderr = e.stderr?.toString() || e.message;
      if (stderr.includes('Already set') || stderr.includes('already')) {
        console.log(`  ✓ ${name} already set`);
      } else {
        throw new Error(`${name} failed: ${stderr.substring(0, 300)}`);
      }
    } finally {
      try { fs.unlinkSync(tempEnv); } catch {}
    }
  }
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

  // Step 4: Push to Supabase
  pushToSupabase(envVars);

  console.log('\n=== DONE ===');
  console.log('T2Hub session is now live on Supabase.');
}

main().catch(e => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
