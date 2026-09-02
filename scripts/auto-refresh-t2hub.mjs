#!/usr/bin/env node
/**
 * Auto-refresh and sync t2hub session in one command.
 *
 * This script:
 * 1. Refreshes the session (headless login)
 * 2. Writes secrets to .secrets/t2hub-session.env
 * 3. Optionally sets secrets in Supabase (if SUPABASE_PROJECT_ID is set)
 *
 * Usage:
 *   node scripts/auto-refresh-t2hub.mjs
 *   node scripts/auto-refresh-t2hub.mjs --sync    # Also sync to Supabase
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const doSync = process.argv.includes('--sync');

console.log('=== Auto-refresh t2hub session ===\n');

// Step 1: Refresh session
console.log('1. Refreshing session...');
try {
  execSync('node scripts/refresh-t2hub-session.mjs', { 
    cwd: ROOT, 
    stdio: 'inherit' 
  });
} catch (e) {
  console.error('Failed to refresh session');
  process.exit(1);
}

// Step 2: Sync to .secrets
console.log('\n2. Writing secrets...');
try {
  execSync('node scripts/sync-t2hub-session.mjs --write', { 
    cwd: ROOT, 
    stdio: 'inherit' 
  });
} catch (e) {
  console.error('Failed to write secrets');
  process.exit(1);
}

// Step 3: Optionally sync to Supabase
if (doSync) {
  const projectId = process.env.SUPABASE_PROJECT_ID;
  if (!projectId) {
    console.log('\n3. Skipping Supabase sync (SUPABASE_PROJECT_ID not set)');
    console.log('   Set SUPABASE_PROJECT_ID environment variable to enable sync');
  } else {
    console.log(`\n3. Syncing to Supabase project: ${projectId}`);
    const secretsDir = path.join(ROOT, '.secrets');
    
    for (const name of ['T2HUB_SESSION_KEY', 'T2HUB_SESSION_COOKIE', 'T2HUB_SESSION_CSRF']) {
      const valueFile = path.join(secretsDir, `${name.toLowerCase().replace(/_/g, '-')}.txt`);
      if (fs.existsSync(valueFile)) {
        try {
          execSync(
            `powershell -File scripts/set-supabase-secret.ps1 -Name ${name} -ValueFile "${valueFile}" -ProjectRef ${projectId}`,
            { cwd: ROOT, stdio: 'inherit' }
          );
        } catch (e) {
          console.error(`Failed to set ${name}`);
        }
      }
    }
  }
}

console.log('\n=== Done ===');
