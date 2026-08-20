#!/usr/bin/env bash
# Proves react-native-loupe/release actually ships the overlay.
#
# The inverse of verify-release-strip.sh, and needed for the same reason that
# one is: both properties are invisible to unit tests and both fail silently.
#
# The failure this guards is specific. The overlay reaches the screen through
# AppRegistry.setWrapperComponentProvider. If that call stays behind a __DEV__
# gate while the rest of the implementation moves to the release entry, a
# release build installs capture, registers panels, and renders no bubble —
# working internals behind an invisible UI, with nothing that looks like an
# error. A tester just reports "I don't see anything".
#
# It also catches the packaging half: if the "exports" map or the resolution
# shim breaks, the bundle step fails here rather than in TestFlight, and if
# bundle-workspace-deps.mjs misses the new entry the bare @loupe/core specifier
# survives and throws "Cannot find module" at runtime in the release build.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${TMPDIR:-/tmp}/loupe-release-entry.jsbundle"
PROBE="$REPO_ROOT/example/__release-entry-probe.js"

cleanup() { rm -f "$PROBE"; }
trap cleanup EXIT

echo "Rebuilding react-native-loupe and refreshing its injected copy..."
(cd "$REPO_ROOT" && pnpm --filter react-native-loupe build >/dev/null)
rm -rf "$REPO_ROOT/node_modules/react-native-loupe"
(cd "$REPO_ROOT" && pnpm install --silent >/dev/null)

cat > "$PROBE" <<'PROBE_EOF'
import { startLoupe } from 'react-native-loupe/release'
import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'

startLoupe({ shake: false })
AppRegistry.registerComponent(appName, () => App)
PROBE_EOF

echo "Building a release bundle that imports the release entry..."
(cd "$REPO_ROOT/example" && npx react-native bundle \
  --entry-file "$(basename "$PROBE")" \
  --platform ios \
  --dev false \
  --reset-cache \
  --bundle-output "$BUNDLE" \
  >/dev/null 2>&1)

echo
echo "Bundle: $BUNDLE ($(wc -c <"$BUNDLE" | tr -d ' ') bytes)"
echo

status=0

# Must be PRESENT. setWrapperComponentProvider is the one that matters most:
# without it the overlay has no way onto the screen.
for needle in "setWrapperComponentProvider" "OverlayRoot" "loupe-bubble" "registerBuiltIns"; do
  if grep -q "$needle" "$BUNDLE"; then
    echo "ok: '$needle' is present"
  else
    echo "FAIL: '$needle' is missing from a release-entry bundle."
    echo "      The release entry must reach the whole implementation. If this is"
    echo "      setWrapperComponentProvider, the overlay will never render."
    status=1
  fi
done

# Must be ABSENT. A surviving workspace specifier resolves to nothing in the
# consumer's app and throws at runtime, in a build that is hard to debug.
if grep -q "@loupe/core" "$BUNDLE"; then
  echo "FAIL: a bare '@loupe/core' specifier survived into the bundle."
  echo "      bundle-workspace-deps.mjs did not rewrite every entry point."
  status=1
else
  echo "ok: no bare @loupe/* specifier survived"
fi

echo
if [ "$status" -eq 0 ]; then
  echo "PASS: the release entry ships a complete, self-contained overlay."
else
  echo "FAILED: the release entry would not work in a release build."
fi
exit "$status"
