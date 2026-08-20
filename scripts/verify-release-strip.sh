#!/usr/bin/env bash
# Proves release builds ship no Loupe code. Builds a real production Metro
# bundle of the example app (--dev false) and greps it for marker strings
# that exist only inside the overlay/shake modules — code that is only
# reachable from `startLoupe()` behind `if (__DEV__)`. Zero hits means Metro
# actually stripped that code out of the bundle it will ship to users.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${TMPDIR:-/tmp}/loupe-release.jsbundle"
# Markers must be Loupe-SPECIFIC — a string that also occurs in React Native or
# a common dependency would read "present" in every release bundle and prove
# nothing. (We tried network capture's "Network request failed": it is React
# Native's own transport-error string, so it collides and is unusable as a
# marker.) These cover two independent subgraphs, so a future refactor that
# statically pulls either into the release graph is caught:
#   loupe-bubble / No tools registered / Open Loupe -> overlay + shake
#   not JSON-serializable                           -> @loupe/core event bus
#   myapp://path                                    -> deeplink panel
# Network/log capture depend on @loupe/core, so the core marker's absence is a
# sound proxy that the capture layer stripped too.
MARKERS=("loupe-bubble" "No tools registered" "Open Loupe" "not JSON-serializable" "myapp://path")

# react-native-loupe is linked into the example app as a pnpm "injected"
# dependency (dependenciesMeta.injected in example/package.json) rather than
# the usual workspace symlink. Injecting copies the package's real files into
# node_modules/react-native-loupe, so the example resolves it exactly the way
# a consumer who installed it from a registry would.
#
# (This comment used to explain that the injection existed to satisfy Metro's
# dynamic-require check, which tolerates `require(name)` with a variable name
# only under a literal node_modules path. That is no longer the reason, and
# repeating it would be actively harmful: a variable module name resolves to
# an unconditional throw at runtime wherever it lives. Loupe hit exactly that
# bug — every optional peer was undetectable on device while the unit tests
# stayed green. Use a literal string inside a try block; scripts/
# verify-optional-peers.sh enforces it.)
#
# Because it's a copy, not a symlink, pnpm does not always notice source
# edits under packages/react-native/src on a plain `pnpm install`. Removing
# the copy first forces a fresh one, so this script never greps stale
# content and silently passes against yesterday's code.
echo "Refreshing the injected react-native-loupe copy so the bundle reflects current source..."
#
# Removing the copy is necessary but not sufficient: `pnpm install` places the
# fresh copy BEFORE it runs the root prepare script that rebuilds lib/, so a
# plain remove-then-install re-injects the PREVIOUS build and this script would
# grade stale output — passing against code that no longer exists. Build first,
# so the copy install makes is already current.
(cd "$REPO_ROOT" && pnpm --filter react-native-loupe build >/dev/null)
rm -rf "$REPO_ROOT/node_modules/react-native-loupe"
(cd "$REPO_ROOT" && pnpm install >/dev/null)

echo "Building a release bundle..."
pnpm --filter LoupeExample exec react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output "$BUNDLE" \
  --reset-cache

if [ ! -s "$BUNDLE" ]; then
  echo "FAIL: no bundle was produced at $BUNDLE"
  exit 1
fi

echo
echo "Bundle: $BUNDLE ($(wc -c < "$BUNDLE" | tr -d ' ') bytes)"
echo

failed=0
for marker in "${MARKERS[@]}"; do
  count=$(grep -o -- "$marker" "$BUNDLE" | wc -l | tr -d ' ' || true)
  if [ "$count" -ne 0 ]; then
    echo "FAIL: marker '$marker' appears $count time(s) in the release bundle"
    failed=1
  else
    echo "ok: '$marker' absent"
  fi
done

if [ "$failed" -ne 0 ]; then
  echo
  echo "Release stripping is broken — Loupe code is reaching production builds."
  exit 1
fi

echo
echo "PASS: no Loupe markers in the release bundle."
