#!/usr/bin/env bash
# Private preview in a GitHub Codespace: rehearsal mode (fictional guests only).
#   bash scripts/codespace-preview.sh
# Keeps the forwarded port Private (the Codespaces default). Never prints keys.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"

echo "Branch: $(git status -sb | head -1)"
echo "Node:   $(node -v)"
[ -n "${CODESPACES:-}" ] || echo "Note: not inside a Codespace; using localhost."

[ -d node_modules/next ] || npm ci

if ! grep -q '^HOST_KEY=' .env.local 2>/dev/null; then
  echo "HOST_KEY=$(openssl rand -base64 24 | tr -d '/+=')" >> .env.local
  chmod 600 .env.local
  echo "Created a strong HOST_KEY in .env.local. Show it with:  grep HOST_KEY .env.local"
fi

if [ -n "${CODESPACE_NAME:-}" ]; then
  BASE="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  BASE="http://localhost:${PORT}"
fi
cat <<MSG

=== Preview links (open once the server says "Ready") ===
Hub (all screens):        ${BASE}/hub
Guest invitation:         ${BASE}/invite
Host control panel:       ${BASE}/admin/show      (key: grep HOST_KEY .env.local)
TV display:               ${BASE}/display
Guest phone controller:   ${BASE}/play
Keep port ${PORT} Private in the Ports tab. Private links work only in browsers signed in to your GitHub account.

MSG
exec node scripts/rehearsal.mjs --build --port "$PORT"
