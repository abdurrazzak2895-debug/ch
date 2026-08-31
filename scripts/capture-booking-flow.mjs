import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'captured', 't2hub-session');
const JS_DIR = path.join(OUT_DIR, 'js');
const LOG_FILE = path.join(OUT_DIR, 'log.txt');
const RESPONSES_FILE = path.join(OUT_DIR, 'responses.jsonl');

const TARGET = 'https://t2hub.app/';
const LOGIN_URL = 'https://t2hub.app/takamol/agent/login';
const TAKAMOL_URL = 'https://t2hub.app/takamol';
const EMAIL = '01778300054';
const PASSWORD = 'aRrazzak90';

let respCount = 0;
let apiCount = 0;

function log(line) {
  const ts = new Date().toISOString();
  const out = `[${ts}] ${line}`;
  console.log(out);
  fs.appendFileSync(LOG_FILE, out + '\n');
}

function looksEncrypted(obj) {
  return obj && typeof obj === 'object' && (obj.p !== undefined || obj.iv !== undefined);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadEnv() {
  const env = {};
  const envPath = path.join(ROOT, '.env.t2hub');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

async function main() {
  fs.mkdirSync(JS_DIR, { recursive: true });
  // Clear old files
  [RESPONSES_FILE, LOG_FILE].forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });

  const env = loadEnv();
  const email = env.T2HUB_EMAIL || EMAIL;
  const password = env.T2HUB_PASSWORD || PASSWORD;
  log(`Using credentials: ${email}`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const responseMap = new Map();

  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      const line = JSON.stringify({
        t: new Date().toISOString(),
        method: res.request().method(),
        url,
        status: res.status(),
        body: parsed !== null ? parsed : text.substring(0, 2000)
      });
      fs.appendFileSync(RESPONSES_FILE, line + '\n');
      apiCount++;
      if (parsed !== null && looksEncrypted(parsed)) {
        log(`ENCRYPTED ${res.request().method()} ${url} -> status ${res.status()}`);
      } else if (parsed !== null) {
        const shortUrl = url.replace('https://t2hub.app', '').replace('https://takamol-api.up.railway.app', 'railway');
        log(`API ${res.request().method()} ${shortUrl} -> ${JSON.stringify(parsed).substring(0, 150)}`);
      }
    } catch (e) {}
    respCount++;
  });

  page.on('console', (msg) => {
    const t = msg.text();
    if (t && t.length < 2000) log(`[console.${msg.type()}] ${t}`);
  });

  // STEP 1: Navigate to login page
  log('STEP 1: Navigating to login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await delay(2000);

  // STEP 2: Auto-fill credentials and login
  log('STEP 2: Auto-filling credentials...');
  await page.fill('input[type="email"], input[type="text"][name="email"], input[name="email"], input[name="username"], input[placeholder*="email"], input[placeholder*="Email"], input[placeholder*="user"], input[placeholder*="login"], input[placeholder*="number"]', email);
  await delay(500);
  await page.fill('input[type="password"], input[name="password"]', password);
  await delay(500);
  await Promise.race([
    page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Login"), input[type="submit"]'),
    page.keyboard.press('Enter'),
  ]);
  await delay(8000);
  log('Auto-login completed!');

  // Verify login
  const currentUrl = page.url();
  log(`Current URL after login: ${currentUrl}`);

  // STEP 3: Navigate to https://t2hub.app/takamol
  log('STEP 3: Navigating to https://t2hub.app/takamol...');
  try {
    await page.goto(TAKAMOL_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(3000);
    log('Takamol page loaded: ' + page.url());
  } catch (e) {
    log('Could not load takamol page: ' + e.message);
    log('Trying with domcontentloaded...');
    try {
      await page.goto(TAKAMOL_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await delay(2000);
    } catch (e2) {
      log('Also failed: ' + e2.message);
    }
  }

  // Take initial snapshot
  await delay(3000);
  const pageState = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').substring(0, 1000),
    elements: [...document.querySelectorAll('select, input, button, a')].map(el => ({
      tag: el.tagName,
      name: el.name,
      id: el.id,
      type: el.type,
      text: (el.textContent || '').replace(/\s+/g, ' ').substring(0, 60),
      href: el.href || '',
      className: el.className
    }))
  })).catch(() => ({}));
  log(`Page state: ${JSON.stringify(pageState).substring(0, 1000)}`);
  fs.writeFileSync(path.join(OUT_DIR, 'page.txt'), JSON.stringify(pageState, null, 2));

  // Live capture loop
  log('Live capture started. Browser is open at https://t2hub.app/takamol');
  log('Navigate through the admin panel to capture all API calls.');
  log('Press Ctrl+C in this terminal to stop.');

  const start = Date.now();
  const TIMEOUT_MS = 30 * 60 * 1000;
  const POLL_MS = 3000;
  let lastDump = 0;

  while (Date.now() - start < TIMEOUT_MS) {
    await page.waitForTimeout(POLL_MS);
    try {
      if (Date.now() - lastDump > 8000) {
        lastDump = Date.now();
        const storage = await page.evaluate(() => {
          const out = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            out[k] = localStorage.getItem(k);
          }
          return out;
        }).catch(() => ({}));
        const tokenKeys = Object.entries(storage).filter(([k, v]) =>
          /token|auth|session|key|sk/i.test(k) && typeof v === 'string' && v.length > 10
        ).map(([k]) => k);
        if (tokenKeys.length > 0) {
          log(`Token keys in localStorage: ${tokenKeys.join(', ')}`);
        }
      }

      // Update page.txt every 10 seconds
      if (Date.now() - start - (parseInt(String(fs.readFileSync(path.join(OUT_DIR, 'log.txt')), 'utf8').match(/\[.*?\] (\d+) /g)?.length || 0)) > 10000) {
        const pv = await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          text: (document.body?.innerText || '').replace(/\s+/g, ' ').substring(0, 800),
          selects: [...document.querySelectorAll('select')].map(sel => ({
            name: sel.name,
            options: [...sel.options].map(o => o.value + ':' + o.text).slice(0, 20)
          }))
        })).catch(() => ({}));
        fs.writeFileSync(path.join(OUT_DIR, 'page.txt'), JSON.stringify(pv, null, 2));
      }
    } catch (e) {}
  }

  log('Capture window finished.');
  await browser.close();
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  console.error(e);
  process.exit(1);
});