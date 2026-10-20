#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
shared_env_file="${SUYA_SHARED_ENV_FILE:-$HOME/.secrets/shared.env}"
private_root="${LEDGER_PRIVATE_ROOT:-$HOME/.secrets/suya-market-regime-ledger}"
export LEDGER_PRIVATE_ROOT="$private_root"
node_bin="${SUYA_NODE_BIN:-/opt/homebrew/opt/node@24/bin/node}"
npm_bin="${SUYA_NPM_BIN:-/opt/homebrew/opt/node@24/bin/npm}"
source "$ledger_repo/ops/notify.sh"

failure_stage="启动"
publication_stage=""
handle_failure() {
  local exit_code="$1"
  trap - ERR
  echo "Publisher failed during $failure_stage" >&2
  if [[ -n "$publication_stage" ]]; then
    echo "Incomplete publication retained privately at $publication_stage" >&2
  fi
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

failure_stage="隔离发布准备"
umask 077
publication_stage="$(mktemp -d "${TMPDIR:-/tmp}/suya-ledger-publish.XXXXXX")"
git clone --quiet --no-hardlinks --local "$ledger_repo" "$publication_stage/repo"
mkdir -p "$publication_stage/private"
if [[ -d "$private_root/pending" ]]; then
  cp -Rp "$private_root/pending" "$publication_stage/private/"
fi
export LEDGER_PRIVATE_ROOT="$publication_stage/private"
cd "$publication_stage/repo"
if [[ -d "$ledger_repo/node_modules/pg" ]]; then
  ln -s "$ledger_repo/node_modules" node_modules
else
  "$npm_bin" ci --ignore-scripts
fi

as_of_date="$(TZ=Asia/Shanghai date +%F)"
committed_at="$(TZ=Asia/Shanghai date '+%Y-%m-%dT%H:%M:%S+08:00')"

failure_stage="数据库新鲜度检查与承诺生成"
if [[ ! -f "commitments/${as_of_date[1,4]}/${as_of_date[6,7]}/$as_of_date.json" ]]; then
  "$node_bin" bin/publish-from-database.mjs \
    --expected-as-of-date "$as_of_date" \
    --committed-at "$committed_at"
fi
failure_stage="到期揭示"
"$node_bin" bin/reveal-due-from-database.mjs
failure_stage="历史聚合评价"
"$node_bin" bin/build-historical-evaluation-from-database.mjs
failure_stage="公开信号窗口更新"
"$node_bin" bin/prune-public-reveals.mjs
failure_stage="已揭示记录的次日市场结果"
"$node_bin" bin/build-revealed-outcomes-from-database.mjs
failure_stage="事后补录窗口更新"
"$node_bin" bin/build-retrospective-signals-from-database.mjs
failure_stage="公开快照生成"
"$npm_bin" run build:pages

git add commitments reveals evaluation/public/history.json evaluation/public/revealed-outcomes.json docs
if [[ -f evaluation/public/retrospective-signals.json ]]; then
  git add evaluation/public/retrospective-signals.json
fi
if git diff --cached --quiet; then
  echo "No public ledger evidence to publish"
  cd "$ledger_repo"
  failure_stage="GitHub push"
  git push git@github.com:sowelswl/suya-market-regime-ledger.git HEAD:main
  notify_ledger "发布检查完成：${as_of_date} 的公开证据已存在"
  trap - ERR
  cd "$ledger_repo"
  rm -r -- "$publication_stage"
  exit 0
fi

failure_stage="Git 提交"
git commit -m "Publish ledger evidence for $as_of_date"
failure_stage="保存私有揭示与合入完整快照"
mkdir -p "$private_root/pending"
chmod 700 "$private_root" "$private_root/pending"
pending_file="$LEDGER_PRIVATE_ROOT/pending/$as_of_date.json"
if [[ -f "$pending_file" ]]; then
  if [[ -f "$private_root/pending/$as_of_date.json" ]]; then
    cmp -s "$pending_file" "$private_root/pending/$as_of_date.json"
  else
    cp -p "$pending_file" "$private_root/pending/$as_of_date.json"
  fi
fi
cd "$ledger_repo"
git fetch --quiet "$publication_stage/repo" main
git merge --ff-only FETCH_HEAD
failure_stage="GitHub push"
git push git@github.com:sowelswl/suya-market-regime-ledger.git HEAD:main
notify_ledger "发布成功：${as_of_date} 的公开账本已更新"
trap - ERR
rm -r -- "$publication_stage"
