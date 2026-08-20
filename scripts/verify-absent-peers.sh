#!/usr/bin/env bash
# Proves Loupe survives an app that installed none of its optional peers.
#
# This is the case no other check covers and the one that broke twice. Every
# optional peer is installed in this workspace, so the absent path is never
# exercised: the unit tests mock the modules, verify-optional-peers.sh proves
# the requires RESOLVE when present, and the example app has all four. Nothing
# looked at what happens when they are missing.
#
# What happens is that Metro points an absent optional dependency's slot in the
# module's dependency map at `undefined`, and reaching the require throws
# "Requiring unknown module undefined" — uncaught, escaping the very try/catch
# that made the dependency optional. Requiring react-native-keychain from
# detectStorageAdapters took the whole storage panel down that way, and shake
# detection runs inside startLoupe, so the same failure there would crash a
# host app on import.
#
# The check: bundle the example app with the peers hidden, then confirm no
# Loupe source module names them in a form that would be reached at runtime.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$REPO_ROOT/packages/react-native/src"

PEERS=(
  "react-native-shake"
  "expo-sensors"
  "@react-native-async-storage/async-storage"
  "react-native-mmkv"
  "react-native-keychain"
  "@react-native-clipboard/clipboard"
)

echo "Checking Loupe never requires an optional peer it cannot guarantee..."
echo

status=0
for peer in "${PEERS[@]}"; do
  # A require of a literal peer name anywhere in library source is the defect.
  # The host must hand these in via startLoupe({ storageAdapters }) instead,
  # because the host's own import is static and always resolvable.
  hits=$(grep -rn "require('$peer')" "$LIB" || true)
  if [ -z "$hits" ]; then
    echo "ok: '$peer' is never required by library source"
  else
    echo "FAIL: '$peer' is required by library source:"
    echo "$hits" | sed 's/^/      /'
    echo "      An app without it crashes when this line is reached. Take the"
    echo "      dependency from the host instead."
    status=1
  fi
done

echo
if [ "$status" -eq 0 ]; then
  echo "PASS: Loupe requires no optional peer, so an app without them still runs."
else
  echo "FAILED: Loupe would crash an app that has not installed these."
fi
exit "$status"
