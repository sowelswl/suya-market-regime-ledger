#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
shared_env_file="${SUYA_SHARED_ENV_FILE:-$HOME/.secrets/shared.env}"
export LEDGER_PRIVATE_ROOT="${LEDGER_PRIVATE_ROOT:-$HOME/.secrets/suya-market-regime-ledger}"
source "$ledger_repo/ops/notify.sh"

failure_stage="启动"
handle_failure() {
  local exit_code="$1"
  trap - ERR
  echo "Publisher failed during $failure_stage" >&2
  notify_ledger "发布失败（${failure_stage}），请查看 publisher.error.log"
  exit "$exit_code"
}
trap 'handle_failure $?' ERR

failure_stage="读取本地环境"
if [[ ! -f "$shared_env_file" ]]; then
  echo "Shared environment file is unavailable" >&2
  false
fi

set -a
source "$shared_env_file"
set +a

failure_stage="同步运行副本"
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

failure_stage="数据库新鲜度检查与承诺生成"
node bin/publish-from-database.mjs \
  --expected-as-of-date "$as_of_date" \
  --committed-at "$committed_at"
failure_stage="到期揭示"
node bin/reveal-due-from-database.mjs
failure_stage="公开快照生成"
npm run build:pages

git add commitments reveals docs
if git diff --cached --quiet; then
  echo "No public ledger evidence to publish"
  exit 0
fi

failure_stage="Git 提交"
git commit -m "Publish ledger evidence for $as_of_date"
failure_stage="GitHub push"
git push git@github.com:sowelswl/suya-market-regime-ledger.git HEAD:main
trap - ERR
