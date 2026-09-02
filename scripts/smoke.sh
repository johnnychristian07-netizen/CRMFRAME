#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
TOKEN=$(curl -sf "$BASE/auth/dev-token" -H 'content-type: application/json' -d '{}' | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")
curl -sf "$BASE/health"; echo
curl -sf "$BASE/pipelines" -H "authorization: Bearer $TOKEN"; echo
curl -sf "$BASE/companies" -H "authorization: Bearer $TOKEN"; echo
