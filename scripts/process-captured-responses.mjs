/**
 * Process captured t2hub API responses:
 *  1. Fetch the landing page with session cookies to extract window.__sk
 *  2. Decrypt encrypted API responses (AES-256-GCM)
 *  3. Verify t2hub API endpoints
 *  4. Update session.json and save decrypted cache
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CAPTURED_DIR = path.join(ROOT, 'captured', 't2hub-session');
const RESPONSES_FILE = path.join(CAPTURED_DIR, 'responses.jsonl');
const SESSION_FILE = path.join(CAPTURED_DIR, 'session.json');
const CACHE_FILE = path.join(CAPTURED_DIR, 'cache.json');
const ENV_FILE = path.join(ROOT, '.env.t2hub');

const T2HUB_BASE = 'https://t2hub.app';
const T2HUB_APP_PATH = '/takamol';

function loadEnv() {
  const env = {};
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        env[trimmed.substring(0, eq).trim()] = trimmed.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch { return null; }
}

function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function loadResponses() {
  if (!fs.existsSync(RESPONSES_FILE)) return [];
  return fs.readFileSync(RESPONSES_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function buildCookieHeader(cookies) {
  return cookies
    .filter(c => c.domain === 't2hub.app' || c.domain.endsWith('.t2hub.app'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// Decrypt AES-256-GCM envelope {p, iv} using base64 key
async function decryptEnvelope(envelope, keyRaw) {
  if (!envelope?.p || !envelope?.iv) return envelope;
  const keyBytes = Uint8Array.from(atob(keyRaw), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = Uint8Array.from(atob(envelope.iv), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(envelope.p), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function main() {
  console.log('=== Processing captured t2hub responses ===\n');

  const session = loadSession();
  if (!session?.cookies?.length) {
    console.error('No session cookies found in session.json');
    process.exit(1);
  }

  const cookieHeader = buildCookieHeader(session.cookies);
  console.log(`Session cookies: ${session.cookies.length} total, ${cookieHeader.split(';').length} for t2hub.app`);
  console.log(`Session logged at: ${session.loggedAt}`);

  // Step 1: Fetch landing page to extract window.__sk
  console.log('\n--- Step 1: Fetching landing page for __sk key ---');
  let sk = null;
  try {
    const res = await fetch(`${T2HUB_BASE}${T2HUB_APP_PATH}`, {
      headers: {
        Accept: 'text/html',
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    console.log(`Landing page status: ${res.status}`);

    // Extract __sk from window.__sk = '...'
    const skMatch = html.match(/window\.__sk\s*=\s*['"]([^'"]+)['"]/);
    if (skMatch) {
      sk = skMatch[1];
      console.log(`Found window.__sk: ${sk.substring(0, 20)}... (${sk.length} chars)`);
    } else {
      console.log('window.__sk not found in landing page HTML');
      // Try alternative: look in JS source
      const altMatch = html.match(/__sk['"]*\s*[:=]\s*['"]([^'"]+)['"]/);
      if (altMatch) {
        sk = altMatch[1];
        console.log(`Found __sk via alt pattern: ${sk.substring(0, 20)}...`);
      }
    }

    // Also update cookies from response
    const setCookies = res.headers.getSetCookie?.() || [];
    if (setCookies.length) {
      console.log(`Got ${setCookies.length} Set-Cookie headers from landing page`);
      for (const sc of setCookies) {
        const name = sc.split('=')[0].trim();
        const value = sc.split(';')[0].split('=').slice(1).join('=');
        const existing = session.cookies.find(c => c.name === name);
        if (existing) {
          existing.value = value;
        } else {
          session.cookies.push({ name, value, domain: 't2hub.app', path: '/' });
        }
      }
    }
  } catch (err) {
    console.error(`Failed to fetch landing page: ${err.message}`);
  }

  // Step 2: Load and decrypt captured responses
  console.log('\n--- Step 2: Decrypting captured API responses ---');
  const responses = loadResponses();
  console.log(`Found ${responses.length} captured responses`);

  const decrypted = [];
  for (const resp of responses) {
    const url = resp.url || '';
    const body = resp.body;
    const isEncrypted = body && typeof body === 'object' && body.p && body.iv;

    if (isEncrypted && sk) {
      try {
        const decryptedBody = await decryptEnvelope(body, sk);
        console.log(`✓ Decrypted: ${resp.method} ${url.replace(T2HUB_BASE, '')} -> ${JSON.stringify(decryptedBody).substring(0, 120)}`);
        decrypted.push({ ...resp, body: decryptedBody, decrypted: true });
      } catch (err) {
        console.log(`✗ Failed to decrypt: ${url} - ${err.message}`);
        decrypted.push({ ...resp, decrypted: false, error: err.message });
      }
    } else if (isEncrypted && !sk) {
      console.log(`⊘ Encrypted but no key: ${url.replace(T2HUB_BASE, '')}`);
      decrypted.push({ ...resp, decrypted: false, error: 'No __sk key' });
    } else {
      console.log(`  Plain text: ${resp.method} ${url.replace(T2HUB_BASE, '')}`);
      decrypted.push(resp);
    }
  }

  // Step 3: Verify t2hub API endpoints
  console.log('\n--- Step 3: Verifying t2hub API endpoints ---');

  const endpoints = [
    { name: 'Token Status', path: '/api/token-status', method: 'GET' },
    { name: 'Occupations', path: '/api/pacc/occupations?exclude_ignored=1', method: 'GET' },
    { name: 'Test Centers (Rajshahi)', path: '/api/test-centers?city=Rajshahi', method: 'GET' },
    { name: 'PACC Exam Sessions', path: '/api/pacc-exam-sessions?category_id=159&city=Rajshahi&exam_date=2026-09-12', method: 'GET' },
    { name: 'Exam Available Dates', path: '/api/exam-available-dates?category_id=159&city=Rajshahi', method: 'GET' },
  ];

  const currentCookieHeader = buildCookieHeader(session.cookies);
  const results = [];

  for (const ep of endpoints) {
    const fullUrl = `${T2HUB_BASE}${T2HUB_APP_PATH}${ep.path}`;
    console.log(`\n  Testing: ${ep.name}`);
    console.log(`  URL: ${fullUrl}`);

    try {
      const res = await fetch(fullUrl, {
        method: ep.method,
        headers: {
          Accept: 'application/json, */*',
          Cookie: currentCookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        },
      });

      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text.substring(0, 200) }; }

      const isEncrypted = body && typeof body === 'object' && body.p && body.iv;
      let decryptedBody = body;

      if (isEncrypted && sk) {
        try {
          decryptedBody = await decryptEnvelope(body, sk);
        } catch {
          decryptedBody = { encrypted: true, failedToDecrypt: true };
        }
      }

      const status = res.status;
      const isOk = status >= 200 && status < 400;
      const summary = JSON.stringify(decryptedBody).substring(0, 150);

      console.log(`  Status: ${status} ${isOk ? '✓' : '✗'}`);
      console.log(`  Encrypted: ${isEncrypted}`);
      if (isEncrypted && sk) console.log(`  Decrypted: ${JSON.stringify(decryptedBody).substring(0, 150)}`);

      results.push({
        name: ep.name,
        url: fullUrl,
        status,
        ok: isOk,
        encrypted: isEncrypted,
        body: decryptedBody,
      });

      // Update cookies from response
      const setCookies = res.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const name = sc.split('=')[0].trim();
        const value = sc.split(';')[0].split('=').slice(1).join('=');
        const existing = session.cookies.find(c => c.name === name);
        if (existing) existing.value = value;
        else session.cookies.push({ name, value, domain: 't2hub.app', path: '/' });
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
      results.push({ name: ep.name, url: fullUrl, status: 0, ok: false, error: err.message });
    }
  }

  // Step 4: Update session.json with __sk and fresh cookies
  console.log('\n--- Step 4: Updating session.json ---');
  if (sk) {
    session.encryptionKey = sk;
  }
  session.lastVerified = new Date().toISOString();
  session.apiVerificationResults = results.map(r => ({
    name: r.name,
    status: r.status,
    ok: r.ok,
    encrypted: r.encrypted,
  }));
  saveSession(session);
  console.log('Session updated with __sk key and verification results');

  // Step 5: Save decrypted cache
  console.log('\n--- Step 5: Saving decrypted cache ---');
  const cache = {
    generatedAt: new Date().toISOString(),
    encryptionKey: sk,
    responses: decrypted.filter(r => r.decrypted !== false),
    apiVerification: results,
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`Cache saved to ${CACHE_FILE}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Encryption key: ${sk ? '✓ Found' : '✗ Not found'}`);
  console.log(`Decrypted responses: ${decrypted.filter(r => r.decrypted === true).length}/${decrypted.filter(r => r.body?.p).length} encrypted`);
  console.log(`API endpoints verified: ${results.filter(r => r.ok).length}/${results.length} OK`);
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}: ${r.status}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
