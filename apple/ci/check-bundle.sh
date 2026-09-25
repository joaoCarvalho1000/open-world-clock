#!/usr/bin/env bash
# Checks what ends up inside the Release build of the app and the widget extension, so a missing language,
# privacy manifest, core resource bundle or App Intents metadata fails CI instead of showing up on a device.
# Usage: bash apple/ci/check-bundle.sh [products dir]
# The products dir defaults to the Release device build of .github/workflows/ios.yml:
#   $RUNNER_TEMP/DerivedData/Build/Products/Release-iphoneos
# Every problem prints a ::error:: line; the script exits 1 at the end if there was any.
set -euo pipefail

products="${1:-${RUNNER_TEMP:-}/DerivedData/Build/Products/Release-iphoneos}"
app="$products/WorldClock.app"
appex="$app/PlugIns/WorldClockWidgets.appex"
failures=0

fail() {
  echo "::error::$1"
  failures=$((failures + 1))
}

# Prints one Info.plist value, or nothing if it cannot be read.
plist_value() {
  plutil -extract "$2" raw -o - "$1" 2>/dev/null || true
}

# check_target <bundle dir> <label>
check_target() {
  local dir="$1" label="$2"
  if [ ! -d "$dir" ]; then
    fail "$label: $dir not found"
    return
  fi

  local lang
  for lang in en pt-BR es; do
    [ -d "$dir/$lang.lproj" ] || fail "$label: $lang.lproj missing (String Catalogs not compiled into this target)"
  done

  [ -f "$dir/PrivacyInfo.xcprivacy" ] || fail "$label: PrivacyInfo.xcprivacy missing"

  # The SwiftPM resource bundle name depends on the Xcode version, so match it loosely. The app's own search
  # skips PlugIns, so the extension's copy cannot stand in for the app's.
  local bundle
  bundle="$(find "$dir" -path "$dir/PlugIns" -prune -o -type d -name '*WorldClockCore*.bundle' -print -quit)"
  if [ -z "$bundle" ]; then
    fail "$label: WorldClockCore resource bundle (*WorldClockCore*.bundle) missing"
  else
    local resource
    for resource in zones.json world-land.json; do
      if [ -z "$(find "$bundle" -type f -name "$resource" -print -quit)" ]; then
        fail "$label: $resource missing from $(basename "$bundle")"
      fi
    done
  fi

  if [ ! -f "$dir/Info.plist" ]; then
    fail "$label: Info.plist missing"
  elif ! plutil -lint "$dir/Info.plist" >/dev/null; then
    fail "$label: Info.plist does not pass plutil -lint"
  fi
}

echo "Checking $products"
check_target "$app" "WorldClock.app"
check_target "$appex" "WorldClockWidgets.appex"

# The widget intents (ShiftTimeIntent, SelectCityIntent, SelectCitiesIntent) live in the extension only.
[ -e "$appex/Metadata.appintents" ] || fail "WorldClockWidgets.appex: Metadata.appintents missing (App Intents metadata not extracted)"

# App Store Connect rejects an extension whose versions differ from the app's.
if [ -f "$app/Info.plist" ] && [ -f "$appex/Info.plist" ]; then
  for key in CFBundleShortVersionString CFBundleVersion; do
    app_value="$(plist_value "$app/Info.plist" "$key")"
    appex_value="$(plist_value "$appex/Info.plist" "$key")"
    if [ -z "$app_value" ] || [ -z "$appex_value" ]; then
      fail "$key: cannot read it from both Info.plist files (app '$app_value', extension '$appex_value')"
    elif [ "$app_value" != "$appex_value" ]; then
      fail "$key differs: app $app_value, extension $appex_value"
    fi
  done
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures problem(s) in the app bundle"
  exit 1
fi
echo "App bundle OK: languages, privacy manifests, core resources, App Intents metadata, versions"
