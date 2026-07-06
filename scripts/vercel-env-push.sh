#!/usr/bin/env bash
# Push env vars from .env to Vercel (production + preview).
# Skips comments, blank lines, VERCEL_* keys, and LINEAR_* (local scripts only).
# Usage: ./scripts/vercel-env-push.sh [--force]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-$ROOT/.env}"
FORCE="${1:-}"
FORCE_FLAG=""
if [[ "$FORCE" == "--force" ]]; then
  FORCE_FLAG="--force"
fi

# Vercel default production hostname until TRU-A-07 DNS cutover to truffe.ai
VERCEL_HOST="truffe.vercel.app"

DATABASE_PUSHED=0
CRON_FROM_FILE=""

add_env() {
  local name="$1"
  local value="$2"
  echo "  → $name"
  for env in production preview; do
    pnpm dlx vercel env add "$name" "$env" \
      --value "$value" \
      --sensitive \
      --yes \
      $FORCE_FLAG < /dev/null 2>/dev/null || \
    pnpm dlx vercel env add "$name" "$env" \
      --value "$value" \
      --sensitive \
      --yes \
      --force < /dev/null
  done
}

echo "Pushing env vars to Vercel (truffe/truffe) from ${ENV_FILE}..."

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
  name="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  value="${value%\"}"
  value="${value#\"}"

  case "$name" in
    VERCEL_*|LINEAR_*) continue ;;
    RP_ID) value="$VERCEL_HOST" ;;
    ORIGIN) value="https://$VERCEL_HOST" ;;
    CRON_SECRET) CRON_FROM_FILE=1 ;;
    DATABASE_URL|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SUPABASE_DB_DIRECT_URL)
      if [[ "$value" == *"127.0.0.1"* || "$value" == *"localhost"* || "$value" == *"supabase-demo"* ]]; then
        echo "  ⊘ skip $name (local dev — set EU cloud values in Vercel dashboard)"
        continue
      fi
      ;;
  esac

  if [[ "$name" == "DATABASE_URL" ]]; then DATABASE_PUSHED=1; fi
  add_env "$name" "$value"
done < "$ENV_FILE"

if [[ "$DATABASE_PUSHED" -eq 0 ]]; then
  echo "  ⊘ no DATABASE_URL in env file — add Supabase pooler URL before deploy"
fi

if [[ -z "$CRON_FROM_FILE" ]]; then
  echo "  → CRON_SECRET (generated)"
  add_env "CRON_SECRET" "$(openssl rand -hex 24)"
fi

# Production HTTPS cookie names (not in .env)
if ! grep -q '^SESSION_COOKIE_NAME=' "$ENV_FILE" 2>/dev/null; then
add_env "SESSION_COOKIE_NAME" "__Host-session"
fi

echo "Done. Run: pnpm dlx vercel env ls"
