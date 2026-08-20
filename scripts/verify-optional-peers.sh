#!/usr/bin/env bash
# Proves no module name reaches Metro as a variable.
#
# Loupe once resolved its optional peers with a `tryRequire(name)` helper that
# took the module name as a variable. That compiles and unit-tests perfectly
# under Node, and is silently dead in a Metro bundle: Metro cannot resolve a
# require() whose argument is not a literal, so it replaces the call with a
# function that throws
#
#     Dynamic require defined at line N; not supported by Metro
#
# which the surrounding catch swallows into "not installed". Shake detection and
# the whole storage panel were broken that way while every unit test passed,
# because jest runs on Node's require and never sees the bundled output.
#
# Loupe no longer requires any optional peer at all — that is checked by
# scripts/verify-absent-peers.sh — but this check still earns its place. It
# catches the dynamic-require shape anywhere in the bundle, including in the
# host app and in any future Loupe code that reaches for a module by name.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${TMPDIR:-/tmp}/loupe-dev.jsbundle"

# Detection only ever runs inside `if (__DEV__)`, so a release bundle (which is
# what verify-release-strip.sh checks, for the opposite reason) has nothing to
# say here. This must be a dev bundle.
# Order matters. react-native-loupe is an injected (copied) dependency, and
# `pnpm install` places that copy BEFORE it runs the root prepare script that
# rebuilds lib/ — so a plain install re-injects the PREVIOUS build and this
# script would grade stale output. Build first, then force a fresh copy of it.
echo "Rebuilding react-native-loupe and refreshing its injected copy..."
(cd "$REPO_ROOT" && pnpm --filter react-native-loupe build >/dev/null)
rm -rf "$REPO_ROOT/node_modules/react-native-loupe"
(cd "$REPO_ROOT" && pnpm install --silent >/dev/null)

echo "Building a dev bundle..."
(cd "$REPO_ROOT/example" && npx react-native bundle \
  --entry-file index.js \
  --platform ios \
  --dev true \
  --reset-cache \
  --bundle-output "$BUNDLE" \
  >/dev/null 2>&1)

echo
echo "Bundle: $BUNDLE ($(wc -c <"$BUNDLE" | tr -d ' ') bytes)"
echo

status=0

# 1. No dynamic requires anywhere. Any hit means some optional-peer lookup
#    compiled down to an unconditional throw and is dead on device.
throwers=$(grep -c "not supported by Metro" "$BUNDLE" || true)
if [ "$throwers" -eq 0 ]; then
  echo "ok: no unresolvable dynamic require() in the bundle"
else
  echo "FAIL: $throwers dynamic require() call(s) compiled to a runtime throw."
  echo "      A module name reached Metro as a variable. Use a literal string."
  status=1
fi

# The positive canary that used to live here — asserting react-native-shake and
# expo-sensors resolved as literals — has been removed, not weakened. Loupe no
# longer requires any optional peer at all: doing so throws uncaught when the
# package is absent, which crashed the storage panel and would have crashed a
# host app on import from shake detection. That property is now checked by
# scripts/verify-absent-peers.sh, and asserting the opposite here would have
# demanded the bug back.

echo
if [ "$status" -eq 0 ]; then
  echo "PASS: no module name reaches Metro as a variable."
else
  echo "FAILED: a dynamic require() would be dead code on device."
fi
exit "$status"
