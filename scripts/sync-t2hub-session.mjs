#!/usr/bin/env node
/**
 * Sync captured t2hub session to Supabase edge function env vars.
 *
 * After running refresh-t2hub-session.mjs (which updates session.json),
 * run this script to push the session key + cookies to the svp-proxy
 * so it can make t2hub API calls without caller-provided headers.
 *
 * Usage:
 *   node scripts/sync-t2hub-session.mjs              # show env vars to set
 *   node scripts/sync-t2hub-session.mjs --write       # write to .secrets/t2hub-session.env
 */
import { getCookieHeader, getSessionStatus, loadSession } from '../src/lib/t2hub-session.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const doWrite = process.argv.includes('--write');

const status = getSessionStatus();
console.log('Session status:', JSON.stringify(status, null, 2));

if (!status.loggedIn) {
  console.error('\nNo valid session found. Run refresh-t2hub-session.mjs first.');
  process.exit(1);
}

const session = loadSession();
const cookieHeader = getCookieHeader();
const key = session.encryptionKey || '';

// Extract CSRF from XSRF-TOKEN cookie
const xsrfCookie = session.cookies?.find(c => c.name === 'XSRF-TOKEN');
const csrf = xsrfCookie?.value || '';

const envVars = {
  T2HUB_SESSION_KEY: key,
  T2HUB_SESSION_COOKIE: cookieHeader,
  T2HUB_SESSION_CSRF: csrf,
};

console.log('\nEnv vars for svp-proxy:');
for (const [k, v] of Object.entries(envVars)) {
  const display = v.length > 60 ? v.substring(0, 30) + '...' + v.substring(v.length - 20) : v;
  console.log(`  ${k} = ${display} (${v.length} chars)`);
}

if (!doWrite) {
  console.log('\nRun with --write to save to .secrets/t2hub-session.env');
  console.log('Then set in Supabase: Dashboard > Edge Functions > Secrets');
  process.exit(0);
}

// Write secrets file
const secretsFile = path.join(ROOT, '.secrets', 't2hub-session.env');
fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
const lines = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
fs.writeFileSync(secretsFile, lines.join('\n') + '\n');
console.log(`\nSecrets written to ${secretsFile}`);
console.log('Set in Supabase via: Dashboard > Edge Functions > Secrets');
console.log('Or run: powershell -File scripts/set-supabase-secret.ps1');
