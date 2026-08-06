#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
repo_slug="sowelswl/suya-market-regime-ledger"
public_data_url="https://raw.githubusercontent.com/sowelswl/suya-market-regime-ledger/main/docs/data/index.json"
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

echo "Raw public snapshot does not include $as_of_date" >&2
notify "巡检失败：公开 JSON 尚未包含今天的承诺"
exit 1
