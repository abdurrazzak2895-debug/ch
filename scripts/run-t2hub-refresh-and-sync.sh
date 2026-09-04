#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/t2hub-refresh.log" 2>&1
printf '\n[%s] starting T2Hub refresh\n' "$(date -Is)"
node scripts/auto-refresh-t2hub.mjs
if [[ -f .secrets/t2hub-session.env && -f .secrets/supabase-access-token ]]; then
  export SUPABASE_ACCESS_TOKEN="$(cat .secrets/supabase-access-token)"
  npx --yes supabase secrets set \
    --env-file .secrets/t2hub-session.env \
    --project-ref xklwzkraobxetxdcysun
  printf '[%s] Supabase sync completed\n' "$(date -Is)"
else
  printf '[%s] Supabase sync skipped: required secret files missing\n' "$(date -Is)"
  exit 1
fi
