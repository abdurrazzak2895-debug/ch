#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/set-takamol-supabase-secrets.sh [--project-ref <ref>] [--env-file <path>]

Set the Takamol live-proxy secrets on the Supabase project.

Examples:
  export SUPABASE_PROJECT_ID=xklwzkraobxetxdcysun
  export TAKAMOL_LIVE_API_URL=https://t2hub.app/takamol/api
  export TAKAMOL_ENCRYPTION_KEY_B64=...
  export TAKAMOL_SESSION_COOKIE='...'
  export TAKAMOL_XSRF_TOKEN='...'
  scripts/set-takamol-supabase-secrets.sh

  scripts/set-takamol-supabase-secrets.sh --project-ref xklwzkraobxetxdcysun --env-file .secrets/takamol.env
EOF
}

PROJECT_REF="${SUPABASE_PROJECT_ID:-${SUPABASE_PROJECT_REF:-xklwzkraobxetxdcysun}}"
ENV_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      PROJECT_REF="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi
  echo "Setting Takamol secrets from $ENV_FILE to Supabase project $PROJECT_REF"
  npx --yes supabase secrets set --env-file "$ENV_FILE" --project-ref "$PROJECT_REF"
  exit 0
fi

required_vars=(
  TAKAMOL_LIVE_API_URL
  TAKAMOL_ENCRYPTION_KEY_B64
  TAKAMOL_SESSION_COOKIE
  TAKAMOL_XSRF_TOKEN
)
missing=0
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Set the required variables in your shell or provide --env-file." >&2
  exit 1
fi

tmp_env="$(mktemp)"
trap 'rm -f "$tmp_env"' EXIT

{
  printf 'TAKAMOL_LIVE_API_URL=%s\n' "$TAKAMOL_LIVE_API_URL"
  printf 'TAKAMOL_ENCRYPTION_KEY_B64=%s\n' "$TAKAMOL_ENCRYPTION_KEY_B64"
  printf 'TAKAMOL_SESSION_COOKIE=%s\n' "$TAKAMOL_SESSION_COOKIE"
  printf 'TAKAMOL_XSRF_TOKEN=%s\n' "$TAKAMOL_XSRF_TOKEN"
} > "$tmp_env"

echo "Setting Takamol secrets on Supabase project $PROJECT_REF"
npx --yes supabase secrets set --env-file "$tmp_env" --project-ref "$PROJECT_REF"

echo "Takamol Supabase secrets updated successfully."
