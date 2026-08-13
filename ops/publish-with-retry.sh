#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:?SUYA_LEDGER_REPO is required}"
publisher_script="${SUYA_PUBLISH_SCRIPT:-$ledger_repo/ops/publish-daily.sh}"
retry_interval_seconds="${SUYA_RETRY_INTERVAL_SECONDS:-300}"
deadline_hhmm="${SUYA_PUBLISH_DEADLINE_HHMM:-2040}"
source "$ledger_repo/ops/notify.sh"

if [[ ! -x "$publisher_script" ]]; then
  echo "Publisher script is unavailable: $publisher_script" >&2
  notify_ledger "发布失败：本机发布脚本不可用"
  exit 1
fi

temporary_output="$(mktemp)"
trap 'rm -f "$temporary_output"' EXIT

while true; do
  if SUYA_DEFER_FAILURE_NOTIFICATION=1 /bin/zsh "$publisher_script" >"$temporary_output" 2>&1; then
    cat "$temporary_output"
    exit 0
  else
    exit_code="$?"
  fi

  cat "$temporary_output" >&2
  if ! /usr/bin/grep -q "No fresh signal for expected as-of date" "$temporary_output"; then
    notify_ledger "发布失败：非数据新鲜度错误，请查看 publisher.error.log"
    exit "$exit_code"
  fi

  now_hhmm="$(TZ=Asia/Shanghai date +%H%M)"
  if (( 10#$now_hhmm >= 10#$deadline_hhmm )); then
    notify_ledger "发布失败：截至 20:40 数据库仍未产生当天信号"
    exit "$exit_code"
  fi

  echo "Fresh signal is not available yet; retrying in $retry_interval_seconds seconds"
  sleep "$retry_interval_seconds"
done
