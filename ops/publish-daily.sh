#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
shared_env_file="${SUYA_SHARED_ENV_FILE:-$HOME/.secrets/shared.env}"
export LEDGER_PRIVATE_ROOT="${LEDGER_PRIVATE_ROOT:-$HOME/.secrets/suya-market-regime-ledger}"
node_bin="${SUYA_NODE_BIN:-/opt/homebrew/opt/node@24/bin/node}"
npm_bin="${SUYA_NPM_BIN:-/opt/homebrew/opt/node@24/bin/npm}"
source "$ledger_repo/ops/notify.sh"

failure_stage="启动"
handle_failure() {
  local exit_code="$1"
  trap - ERR
  echo "Publisher failed during $failure_stage" >&2
  if [[ "${SUYA_DEFER_FAILURE_NOTIFICATION:-0}" != "1" ]]; then
    notify_ledger "发布失败（${failure_stage}），请查看 publisher.error.log"
  fi
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

failure_stage="Node 运行时检查"
if [[ ! -x "$node_bin" ]] || ! "$node_bin" --version >/dev/null 2>&1; then
  echo "Configured Node runtime is unavailable: $node_bin" >&2
  false
fi
if [[ ! -x "$npm_bin" ]]; then
  echo "Configured npm runtime is unavailable: $npm_bin" >&2
  false
fi
export PATH="${node_bin:h}:$PATH"

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
  "$npm_bin" ci --ignore-scripts
fi

as_of_date="$(TZ=Asia/Shanghai date +%F)"
committed_at="$(TZ=Asia/Shanghai date '+%Y-%m-%dT%H:%M:%S+08:00')"

failure_stage="数据库新鲜度检查与承诺生成"
"$node_bin" bin/publish-from-database.mjs \
  --expected-as-of-date "$as_of_date" \
  --committed-at "$committed_at"
failure_stage="到期揭示"
"$node_bin" bin/reveal-due-from-database.mjs
failure_stage="历史聚合评价"
"$node_bin" bin/build-historical-evaluation-from-database.mjs
failure_stage="公开信号窗口更新"
"$node_bin" bin/prune-public-reveals.mjs
failure_stage="已揭示记录的次日市场结果"
"$node_bin" bin/build-revealed-outcomes-from-database.mjs
failure_stage="公开快照生成"
"$npm_bin" run build:pages

git add commitments reveals evaluation/public/history.json evaluation/public/revealed-outcomes.json docs
if git diff --cached --quiet; then
  echo "No public ledger evidence to publish"
  notify_ledger "发布检查完成：${as_of_date} 的公开证据已存在"
  trap - ERR
  exit 0
fi

failure_stage="Git 提交"
git commit -m "Publish ledger evidence for $as_of_date"
failure_stage="GitHub push"
git push git@github.com:sowelswl/suya-market-regime-ledger.git HEAD:main
notify_ledger "发布成功：${as_of_date} 的公开账本已更新"
trap - ERR
