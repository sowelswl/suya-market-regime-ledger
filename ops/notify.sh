#!/bin/zsh

notify_ledger() {
  local notification_error
  if ! notification_error="$(/usr/bin/osascript \
    -e 'on run argv' \
    -e 'display notification (item 1 of argv) with title "苏牙择时账本"' \
    -e 'end run' \
    "$1" 2>&1)"; then
    echo "Notification delivery failed" >&2
  fi
}
