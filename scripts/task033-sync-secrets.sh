#!/usr/bin/env bash
# TASK033 — push App/encryption secrets from local .env to Vercel (+ optional Fly).
# Usage (from repo root): ./scripts/task033-sync-secrets.sh
# Never prints secret values. Does not commit anything.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
# Load KEY=value lines only (ignore comments / blanks)
eval "$(
  awk -F= '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      key=$1
      sub(/^[^=]*=/, "")
      val=$0
      gsub(/\\/, "\\\\", val)
      gsub(/"/, "\\\"", val)
      printf "export %s=\"%s\"\n", key, val
    }
  ' .env
)"
set +a

KEYS=(
  CREDENTIALS_ENCRYPTION_KEY
  GITHUB_APP_ID
  GITHUB_APP_SLUG
  GITHUB_APP_PRIVATE_KEY
  GITHUB_WEBHOOK_SECRET
)

for key in "${KEYS[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing $key in .env" >&2
    exit 1
  fi
done

for key in "${KEYS[@]}"; do
  for environment in production preview; do
    vercel env rm "$key" "$environment" -y >/dev/null 2>&1 || true
    printf '%s' "${!key}" | vercel env add "$key" "$environment" >/dev/null
    echo "vercel: $key@$environment OK"
  done
done

if fly auth whoami >/dev/null 2>&1; then
  APP="${FLY_APP:-coppergate-worker}"
  if ! fly apps list 2>/dev/null | grep -q "$APP"; then
    fly apps create "$APP" --org personal 2>/dev/null || fly apps create "$APP" || true
  fi
  # Shared DB must match Vercel — pull into temp if not already exported
  if [[ -z "${DATABASE_URL:-}" ]] || [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DATABASE_URL" == *"127.0.0.1"* ]]; then
    echo "Pulling production DATABASE_URL from Vercel for Fly (temp)…"
    TMP="$(mktemp)"
    vercel env pull "$TMP" --environment=production --yes >/dev/null
    # shellcheck disable=SC1090
    set -a; source "$TMP"; set +a
    rm -f "$TMP"
  fi
  if [[ -z "${DATABASE_URL:-}" ]] || [[ "$DATABASE_URL" == *"localhost"* ]]; then
    echo "DATABASE_URL must be the remote Vercel DB for Fly worker" >&2
    exit 1
  fi
  fly secrets set \
    DATABASE_URL="$DATABASE_URL" \
    CREDENTIALS_ENCRYPTION_KEY="$CREDENTIALS_ENCRYPTION_KEY" \
    SESSION_SECRET="${SESSION_SECRET:-}" \
    GITHUB_APP_ID="$GITHUB_APP_ID" \
    GITHUB_APP_SLUG="$GITHUB_APP_SLUG" \
    GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
    GITHUB_WEBHOOK_SECRET="$GITHUB_WEBHOOK_SECRET" \
    GITHUB_DELIVERY_MODE=http \
    APP_URL=https://www.coppergate.ai \
    NODE_ENV=production \
    -a "$APP"
  echo "fly: secrets set on $APP"
else
  echo "fly: not logged in — skipped Fly secrets (run: fly auth login)"
fi

echo "task033-sync-secrets: done"
