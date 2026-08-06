#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
shared_env_file="${SUYA_SHARED_ENV_FILE:-$HOME/.secrets/shared.env}"
export LEDGER_PRIVATE_ROOT="${LEDGER_PRIVATE_ROOT:-$HOME/.secrets/suya-market-regime-ledger}"

if [[ ! -f "$shared_env_file" ]]; then
  echo "Shared environment file is unavailable" >&2
  exit 1
fi

set -a
source "$shared_env_file"
set +a

cd "$ledger_repo"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Publisher clone must remain on main" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Publisher clone has uncommitted changes" >&2
  exit 1
fi

git pull --ff-only
if [[ ! -d node_modules/pg ]]; then
  npm ci --ignore-scripts
fi

as_of_date="$(TZ=Asia/Shanghai date +%F)"
committed_at="$(TZ=Asia/Shanghai date '+%Y-%m-%dT%H:%M:%S+08:00')"

node bin/publish-from-database.mjs \
  --expected-as-of-date "$as_of_date" \
  --committed-at "$committed_at"
node bin/reveal-due-from-database.mjs

git add commitments reveals
if git diff --cached --quiet; then
  echo "No public ledger evidence to publish"
  exit 0
fi

git commit -m "Publish ledger evidence for $as_of_date"
git push git@github.com:sowelswl/suya-market-regime-ledger.git HEAD:main
