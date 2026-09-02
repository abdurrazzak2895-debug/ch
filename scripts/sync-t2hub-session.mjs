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
  console.log('Or run: npm run refresh-t2hub-sync (refresh + sync in one command)');
  process.exit(0);
}

// Write secrets file
const secretsDir = path.join(ROOT, '.secrets');
fs.mkdirSync(secretsDir, { recursive: true });
const secretsFile = path.join(secretsDir, 't2hub-session.env');
const lines = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
fs.writeFileSync(secretsFile, lines.join('\n') + '\n');
console.log(`\nSecrets written to ${secretsFile}`);

// Write individual secret files for the PowerShell script
for (const [k, v] of Object.entries(envVars)) {
  const secretFile = path.join(secretsDir, `${k.toLowerCase().replace(/_/g, '-')}.txt`);
  fs.writeFileSync(secretFile, v);
}

console.log('Set in Supabase via:');
console.log('  Dashboard > Edge Functions > Secrets');
console.log('Or run:');
console.log('  powershell -File scripts/set-supabase-secret.ps1 -Name T2HUB_SESSION_KEY -ValueFile .secrets/t2hub-session-key.txt -ProjectRef <PROJECT_ID>');
console.log('  powershell -File scripts/set-supabase-secret.ps1 -Name T2HUB_SESSION_COOKIE -ValueFile .secrets/t2hub-session-cookie.txt -ProjectRef <PROJECT_ID>');
console.log('  powershell -File scripts/set-supabase-secret.ps1 -Name T2HUB_SESSION_CSRF -ValueFile .secrets/t2hub-session-csrf.txt -ProjectRef <PROJECT_ID>');
