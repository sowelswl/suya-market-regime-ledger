#!/bin/zsh
set -euo pipefail

ledger_repo="${SUYA_LEDGER_REPO:-$HOME/.local/share/suya-market-regime-ledger/repo}"
state_dir="${SUYA_LEDGER_STATE_DIR:-$HOME/.local/state/suya-market-regime-ledger}"
launch_agents_dir="$HOME/Library/LaunchAgents"
node_bin="${SUYA_NODE_BIN:-/opt/homebrew/opt/node@24/bin/node}"
npm_bin="${SUYA_NPM_BIN:-/opt/homebrew/opt/node@24/bin/npm}"
runtime_path="${node_bin:h}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
domain="gui/$(id -u)"

if [[ ! -x "$node_bin" ]] || ! "$node_bin" --version >/dev/null 2>&1; then
  echo "Node runtime is unavailable: $node_bin" >&2
  exit 1
fi
if [[ ! -x "$npm_bin" ]]; then
  echo "npm runtime is unavailable: $npm_bin" >&2
  exit 1
fi
if [[ ! -x "$ledger_repo/ops/publish-daily.sh" ]] || [[ ! -x "$ledger_repo/ops/verify-daily-publication.sh" ]]; then
  echo "Ledger runtime scripts are unavailable in $ledger_repo" >&2
  exit 1
fi

mkdir -p "$state_dir" "$launch_agents_dir"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

build_plist() {
  local label="$1"
  local script_path="$2"
  local stdout_path="$3"
  local stderr_path="$4"
  shift 4
  local target="$temporary_dir/$label.plist"
  local index=0

  plutil -create xml1 "$target"
  /usr/libexec/PlistBuddy -c "Add :Label string $label" "$target"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments array" "$target"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments:0 string /bin/zsh" "$target"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments:1 string $script_path" "$target"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables dict" "$target"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:HOME string $HOME" "$target"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:PATH string $runtime_path" "$target"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:SUYA_LEDGER_REPO string $ledger_repo" "$target"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:SUYA_NODE_BIN string $node_bin" "$target"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:SUYA_NPM_BIN string $npm_bin" "$target"
  /usr/libexec/PlistBuddy -c "Add :RunAtLoad bool false" "$target"
  /usr/libexec/PlistBuddy -c "Add :StandardOutPath string $stdout_path" "$target"
  /usr/libexec/PlistBuddy -c "Add :StandardErrorPath string $stderr_path" "$target"
  /usr/libexec/PlistBuddy -c "Add :StartCalendarInterval array" "$target"

  for weekday in 1 2 3 4 5; do
    local minute
    for minute in "$@"; do
      /usr/libexec/PlistBuddy -c "Add :StartCalendarInterval:$index dict" "$target"
      /usr/libexec/PlistBuddy -c "Add :StartCalendarInterval:$index:Weekday integer $weekday" "$target"
      /usr/libexec/PlistBuddy -c "Add :StartCalendarInterval:$index:Hour integer 20" "$target"
      /usr/libexec/PlistBuddy -c "Add :StartCalendarInterval:$index:Minute integer $minute" "$target"
      index=$((index + 1))
    done
  done

  plutil -lint "$target" >/dev/null
  echo "$target"
}

install_plist() {
  local label="$1"
  local generated="$2"
  local destination="$launch_agents_dir/$label.plist"
  local backup="$destination.ledger-original"

  if [[ -f "$destination" ]] && [[ ! -f "$backup" ]]; then
    cp -p "$destination" "$backup"
  fi
  install -m 644 "$generated" "$destination"
  launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
  if ! launchctl bootstrap "$domain" "$destination"; then
    echo "Failed to load $label; restoring the previous plist" >&2
    if [[ -f "$backup" ]]; then
      cp -p "$backup" "$destination"
      launchctl bootstrap "$domain" "$destination" >/dev/null 2>&1 || true
    fi
    exit 1
  fi
  launchctl enable "$domain/$label"
  launchctl print "$domain/$label" >/dev/null
}

publisher_plist="$(build_plist \
  com.suya.market-regime-ledger \
  "$ledger_repo/ops/publish-daily.sh" \
  "$state_dir/publisher.log" \
  "$state_dir/publisher.error.log" \
  5)"
watchdog_plist="$(build_plist \
  com.suya.market-regime-ledger-watchdog \
  "$ledger_repo/ops/verify-daily-publication.sh" \
  "$state_dir/watchdog.log" \
  "$state_dir/watchdog.error.log" \
  20 40)"

install_plist com.suya.market-regime-ledger "$publisher_plist"
install_plist com.suya.market-regime-ledger-watchdog "$watchdog_plist"
echo "Installed weekday ledger jobs with pinned Node runtime"
