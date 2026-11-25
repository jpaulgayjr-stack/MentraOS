#!/usr/bin/env bash
# AD Glass: boot the built app in an iOS Simulator with every Mentra hostname
# sinkholed, and prove it reaches Home with no sign-in and contacts none of them.
#
#   mobile/scripts/ad-glass-sim/boot.sh <path to Mentra.app> <evidence dir>
#
# Runs on a macOS GitHub runner (needs sudo for /etc/hosts and ports 80/443).
# Writes screenshots, the text read from them, the sinkhole log and a
# summary into the evidence directory. Exits non-zero if any check fails.
# See docs/ad-glass/spec-phase2.md, section 7.
set -euo pipefail

APP="${1:?path to the built .app}"
OUT="${2:?evidence directory}"
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTS_FILE="$HERE/../ad-glass-blocked-hosts.txt"
BUNDLE_ID="com.domingueandco.adglass"
SCHEME="adglass"
SETTLE_SECONDS="${ADGLASS_SETTLE_SECONDS:-75}"
# Words that only the sign-in, sign-up, update and start-error screens show.
# Whole words only, so "designing" or "catalog in" do not count as "sign in" or "log in".
UNWANTED="(^|[^a-z])(sign up with email|continue with (google|apple)|log ?in|sign ?in|create account|password|update required|connection error|could not start)([^a-z]|\$)"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
SINK_LOG="$OUT/sinkhole.jsonl"
SUMMARY="$OUT/summary.md"
: > "$SINK_LOG"
: > "$SUMMARY"
chmod a+rw "$SINK_LOG"
failures=0

note() { echo "$*" | tee -a "$SUMMARY"; }
pass() { note "- PASS: $*"; }
fail() {
  note "- FAIL: $*"
  echo "::error::$*"
  failures=$((failures + 1))
}
sink_has() { grep -q "\"host\": \"$1\"" "$SINK_LOG" 2>/dev/null; }
sink_reset() { : > "$SINK_LOG"; }

note "# AD Glass simulator boot with Mentra hosts sinkholed"
note ""
if [ ! -d "$APP" ]; then
  fail "the app bundle $APP does not exist"
  exit 1
fi
actual_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
if [ "$actual_id" != "$BUNDLE_ID" ]; then
  fail "bundle id is $actual_id, expected $BUNDLE_ID"
  exit 1
fi

# ── 1. Sinkhole every blocked hostname ──────────────────────────────────────
blocked="$(sed -e 's/#.*//' -e 's/[[:space:]]//g' "$HOSTS_FILE" | grep . | sort -u)"
count="$(echo "$blocked" | wc -l | tr -d ' ')"
{
  echo ""
  echo "# AD Glass sinkhole (ad-glass-sim/boot.sh)"
  for host in $blocked; do
    echo "127.0.0.1 $host"
    echo "::1 $host"
  done
} | sudo tee -a /etc/hosts > /dev/null
sudo dscacheutil -flushcache || true
sudo killall -HUP mDNSResponder || true
note "Blocked hostnames: $count (from \`mobile/scripts/ad-glass-blocked-hosts.txt\`)"

sudo python3 "$HERE/sinkhole.py" --log "$SINK_LOG" > "$OUT/sinkhole.stdout" 2>&1 &
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if nc -z 127.0.0.1 443 2> /dev/null; then break; fi
  sleep 1
done
sink_reset

note ""
note "## Checks"

# The Mac resolves a blocked name to the sinkhole, and the sinkhole sees the attempt.
resolved="$(dscacheutil -q host -a name core.mentraglass.com | awk '/^ip_address:/ {print $2}' | head -1)"
if [ "$resolved" = "127.0.0.1" ]; then
  pass "the build machine resolves core.mentraglass.com to the sinkhole"
else
  fail "core.mentraglass.com resolves to '${resolved:-nothing}', not the sinkhole"
fi
curl -sk --max-time 5 https://core.mentraglass.com/adglass-selftest > /dev/null 2>&1 || true
curl -s --max-time 5 http://ota.mentraglass.com/adglass-selftest > /dev/null 2>&1 || true
sleep 2
if sink_has core.mentraglass.com && sink_has ota.mentraglass.com; then
  pass "the sinkhole records an HTTPS and an HTTP attempt made from the build machine (self-test)"
else
  fail "the sinkhole did not record the self-test connections: its evidence would be worthless"
fi
cp "$SINK_LOG" "$OUT/sinkhole-selftest-host.jsonl"
sink_reset

# ── 2. Simulator ────────────────────────────────────────────────────────────
xcrun simctl list devices available -j > "$OUT/devices.json"
udid="$(python3 "$HERE/pick-simulator.py" "$OUT/devices.json" 2> "$OUT/simulator.txt")"
note "Simulator: $(cat "$OUT/simulator.txt")"
xcrun simctl boot "$udid" 2> /dev/null || true
xcrun simctl bootstatus "$udid" -b > "$OUT/bootstatus.txt" 2>&1

shot() { # name
  xcrun simctl io "$udid" screenshot "$OUT/$1.png" > /dev/null 2>&1 || return 1
  swift "$HERE/ocr.swift" "$OUT/$1.png" > "$OUT/$1.txt" 2> "$OUT/$1.ocr-errors.txt" || true
}

# The simulator uses the Mac's resolver. Prove it: have the simulator's own
# browser open a blocked address and find the attempt in the sinkhole.
xcrun simctl openurl "$udid" "https://core.mentraglass.com/adglass-selftest-from-simulator" || true
for _ in $(seq 1 30); do
  if sink_has core.mentraglass.com; then break; fi
  sleep 2
done
if sink_has core.mentraglass.com; then
  pass "a connection made from inside the simulator to core.mentraglass.com lands in the sinkhole (self-test)"
else
  fail "the simulator's connections do not reach the sinkhole: blocking is not proven for the app"
fi
xcrun simctl terminate "$udid" com.apple.mobilesafari > /dev/null 2>&1 || true
sleep 5
cp "$SINK_LOG" "$OUT/sinkhole-selftest-simulator.jsonl"
sink_reset

# ── 3. Install and launch AD Glass ──────────────────────────────────────────
xcrun simctl install "$udid" "$APP"
# Pre-answer the permission prompts simctl can answer, so they do not cover Home.
xcrun simctl privacy "$udid" grant all "$BUNDLE_ID" > /dev/null 2>&1 || true
xcrun simctl spawn "$udid" log stream --level debug --style compact \
  --predicate 'processImagePath CONTAINS "Mentra.app"' > "$OUT/app-log.txt" 2>&1 &
log_pid=$!

app_pid=""
if launch_output="$(xcrun simctl launch "$udid" "$BUNDLE_ID" 2>&1)"; then
  app_pid="$(echo "$launch_output" | awk -F': ' '{print $2}' | tr -d ' ')"
  note "Launched: \`$launch_output\`"
else
  fail "the app did not launch: $launch_output"
fi

alive() { [ -n "$app_pid" ] && ps -p "$app_pid" > /dev/null 2>&1; }
connections() { # label
  {
    echo "== $1"
    lsof -a -i -n -P -p "${app_pid:-0}" 2> /dev/null || echo "(no open network sockets)"
  } >> "$OUT/app-connections.txt"
}

reached_home=""
elapsed=0
for step in 10 20 30 45 60 "$SETTLE_SECONDS"; do
  if [ "$step" -gt "$elapsed" ]; then sleep $((step - elapsed)); fi
  elapsed=$step
  shot "boot-${step}s" || true
  connections "${step}s after launch"
  if [ -z "$reached_home" ] && grep -qi "pair glasses" "$OUT/boot-${step}s.txt" 2> /dev/null; then
    reached_home="$step"
  fi
done

if alive; then
  pass "the app is still running ${SETTLE_SECONDS}s after launch (pid $app_pid)"
else
  fail "the app is not running ${SETTLE_SECONDS}s after launch (it crashed or exited)"
fi

cat "$OUT"/boot-*s.txt > "$OUT/boot-all-text.txt" 2> /dev/null || true
if [ -n "$reached_home" ]; then
  pass "the home screen's \"Pair glasses\" card is on screen ${reached_home}s after launch"
else
  fail "the home screen's \"Pair glasses\" text was not found in any screenshot (see boot-*.png and boot-*.txt)"
fi

if grep -n -i -E "$UNWANTED" "$OUT/boot-all-text.txt" > "$OUT/unwanted-text.txt"; then
  fail "a screenshot shows sign-in, update or error wording: $(head -3 "$OUT/unwanted-text.txt" | tr '\n' ' ')"
else
  pass "no screenshot shows a sign-in, sign-up, update-required or error screen"
fi

# ── 4. Links ────────────────────────────────────────────────────────────────
# The app answers its own scheme, and a link to an account screen does not open one.
if xcrun simctl openurl "$udid" "${SCHEME}://auth/start" > "$OUT/openurl.txt" 2>&1; then
  pass "iOS hands ${SCHEME}:// links to the app (the scheme is registered)"
else
  fail "iOS could not open a ${SCHEME}:// link: $(cat "$OUT/openurl.txt")"
fi
sleep 15
shot "after-auth-link" || true
connections "after the ${SCHEME}://auth/start link"
if grep -qi -E "$UNWANTED" "$OUT/after-auth-link.txt" 2> /dev/null; then
  fail "the ${SCHEME}://auth/start link opened a sign-in or error screen (see after-auth-link.png)"
elif grep -qi "pair glasses" "$OUT/after-auth-link.txt" 2> /dev/null; then
  pass "after a ${SCHEME}://auth/start link the app is on Home, not on a sign-in screen"
else
  fail "after a ${SCHEME}://auth/start link the home screen was not found (see after-auth-link.png)"
fi
if xcrun simctl openurl "$udid" "com.mentra://home" > "$OUT/openurl-mentra.txt" 2>&1; then
  fail "iOS opened a com.mentra:// link: something on the simulator still answers Mentra's scheme"
else
  pass "the app does not answer Mentra's com.mentra:// scheme"
fi
if alive; then
  pass "the app is still running after the links"
else
  fail "the app stopped after the links"
fi

# ── 5. The verdict on the network ───────────────────────────────────────────
sleep 5
cp "$SINK_LOG" "$OUT/sinkhole-during-app.jsonl"
attempts="$(grep -c . "$SINK_LOG" 2> /dev/null || true)"
if [ "${attempts:-0}" = "0" ]; then
  pass "nothing on the build machine, the app included, connected to any of the $count blocked hostnames while the app ran"
else
  fail "$attempts connection(s) reached blocked hostnames while the app ran: $(python3 "$HERE/sinkhole-hosts.py" "$SINK_LOG")"
fi
# An empty log only counts if the sinkhole was still listening at the end, on both ports.
curl -sk --max-time 5 https://runtime.mentraglass.com/adglass-selftest-after > /dev/null 2>&1 || true
curl -s --max-time 5 http://miniapps.mentraglass.com/adglass-selftest-after > /dev/null 2>&1 || true
sleep 2
if sink_has runtime.mentraglass.com && sink_has miniapps.mentraglass.com; then
  pass "the sinkhole was still recording on both ports after the app ran (self-test)"
else
  fail "the sinkhole had stopped recording by the end of the run: the empty log proves nothing"
fi
cp "$SINK_LOG" "$OUT/sinkhole-selftest-after.jsonl"

kill "$log_pid" > /dev/null 2>&1 || true
reports="$HOME/Library/Logs/DiagnosticReports"
ls "$reports" 2> /dev/null | grep -i -E "mentra|adglass" > "$OUT/crash-reports.txt" || true
if [ -s "$OUT/crash-reports.txt" ]; then
  fail "crash reports were written: $(tr '\n' ' ' < "$OUT/crash-reports.txt")"
  while read -r report; do cp "$reports/$report" "$OUT/" 2> /dev/null || true; done < "$OUT/crash-reports.txt"
fi
xcrun simctl shutdown "$udid" > /dev/null 2>&1 || true

note ""
note "## What this does not show"
note ""
note "Bluetooth does not exist in the simulator: pairing, the glasses display, the ring, the microphone and"
note "on-device speech with real audio are unverified here. Only boot, about ${SETTLE_SECONDS}s on the home"
note "screen and two links were observed. Only connections to the listed hostnames over TCP ports 80 and 443"
note "are counted: a host that is not on the list, another port, or UDP would not show. The app's open sockets"
note "(app-connections.txt) are recorded for reading, not checked."
note ""
if [ "$failures" -eq 0 ]; then
  note "**Result: all checks passed.**"
else
  note "**Result: $failures check(s) failed.**"
fi
exit "$failures"
