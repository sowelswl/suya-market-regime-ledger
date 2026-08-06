#!/bin/zsh

notify_ledger() {
  /usr/bin/osascript \
    -e 'on run argv' \
    -e 'display notification (item 1 of argv) with title "苏牙择时账本"' \
    -e 'end run' \
    "$1" >/dev/null 2>&1 || true
}
