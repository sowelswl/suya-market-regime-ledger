#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
repo_slug="sowelswl/suya-market-regime-ledger"
public_data_url="https://weilisong.com/suya-market-regime-ledger/data/index.json"
as_of_date="$(TZ=Asia/Shanghai date +%F)"
year="${as_of_date%%-*}"
month_and_day="${as_of_date#*-}"
month="${month_and_day%%-*}"
commitment_path="commitments/${year}/${month}/${as_of_date}.json"

notify() {
  /usr/bin/osascript \
    -e 'on run argv' \
    -e 'display notification (item 1 of argv) with title "苏牙择时账本"' \
    -e 'end run' \
    "$1" >/dev/null 2>&1 || true
}

request_pages_build() {
  gh api --method POST "repos/$repo_slug/pages/builds" --silent
}

cd "$ledger_repo"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Watchdog clone must remain on main" >&2
  notify "巡检失败：运行副本不在 main 分支"
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Watchdog clone has uncommitted changes" >&2
  notify "巡检失败：运行副本存在未提交改动"
  exit 1
fi

git pull --ff-only

if [[ ! -f "$commitment_path" ]]; then
  echo "Missing local commitment for $as_of_date" >&2
  notify "巡检失败：今天的承诺文件不存在"
  exit 1
fi

if ! gh api "repos/$repo_slug/contents/$commitment_path?ref=main" --silent; then
  echo "Missing remote commitment for $as_of_date" >&2
  notify "巡检失败：今天的承诺尚未到达 GitHub"
  exit 1
fi

evidence_sha="$(git log -1 --format=%H -- "$commitment_path")"
attestation_line="$(gh run list \
  --repo "$repo_slug" \
  --workflow "Attest public ledger evidence" \
  --commit "$evidence_sha" \
  --limit 1 \
  --json databaseId,status,conclusion \
  --jq 'if length == 0 then "" else .[0] | [.databaseId, .status, (.conclusion // "none")] | map(tostring) | join("|") end')"

if [[ -z "$attestation_line" ]]; then
  echo "No attestation run found for $evidence_sha" >&2
  notify "巡检提醒：今天的外部存证尚未生成"
else
  IFS='|' read -r attestation_id attestation_status attestation_conclusion <<< "$attestation_line"
  if [[ "$attestation_status" == "completed" && "$attestation_conclusion" != "success" ]]; then
    gh run rerun "$attestation_id" --repo "$repo_slug"
    echo "Re-ran failed attestation workflow $attestation_id"
    notify "外部存证失败，已自动申请重试"
  elif [[ "$attestation_status" != "completed" ]]; then
    echo "Attestation workflow is still $attestation_status"
  fi
fi

temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT
cache_buster="$(date +%s)"
if curl -fsS --retry 2 --connect-timeout 10 \
  -H "Cache-Control: no-cache" \
  -o "$temporary_dir/index.json" \
  "${public_data_url}?check=${cache_buster}" && \
  node -e '
    const fs = require("node:fs")
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    const date = process.argv[2]
    process.exit(data.records?.some((record) => record.commitment?.as_of_trade_date === date) ? 0 : 1)
  ' "$temporary_dir/index.json" "$as_of_date"; then
  echo "Public page includes the $as_of_date commitment"
  exit 0
fi

main_sha="$(gh api "repos/$repo_slug/commits/main" --jq '.sha')"
pages_line="$(gh api "repos/$repo_slug/pages/builds/latest" \
  --jq '[.status, .commit] | map(tostring) | join("|")')"

if [[ -z "$pages_line" ]]; then
  request_pages_build
  echo "Requested Pages because no legacy build was found"
  notify "公开页面未更新，已启动 Pages 部署"
  exit 0
fi

IFS='|' read -r pages_status pages_sha <<< "$pages_line"
if [[ "$pages_sha" != "$main_sha" ]]; then
  request_pages_build
  echo "Requested Pages for the current main commit"
  notify "公开页面未更新，已启动最新版本部署"
elif [[ "$pages_status" == "queued" || "$pages_status" == "building" ]]; then
  echo "Pages build is still $pages_status"
  notify "公开页面仍在 GitHub 部署队列中"
elif [[ "$pages_status" != "built" ]]; then
  request_pages_build
  echo "Re-requested failed legacy Pages build"
  notify "公开页面部署失败，已自动申请重试"
else
  request_pages_build
  echo "Re-requested Pages because the successful build is still stale"
  notify "公开页面缓存未更新，已重新部署"
fi
