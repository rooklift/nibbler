#!/bin/bash
set -euo pipefail

msg() {
	printf "=======================\n"
	printf "\033[93m%s\033[0m\n" "$1"
}

ok() {
	printf "\033[92m \u2714 %s\033[0m\n" "$1"
}

WORKDIR="/tmp/nibbler-install"
VERSION="2.5.8"
ELECTRON_VERSION="41.0.3"

ARCH="$(uname -m)"
case "$ARCH" in
	arm64) ELECTRON_ARCH="arm64" ;;
	x86_64) ELECTRON_ARCH="x64" ;;
	*) msg "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# robustness fix... clean exit
cleanup_on_failure() {
	local exit_code="$1"
	if [[ "$exit_code" -ne 0 ]]; then
		rm -rf "$WORKDIR"
	fi
}
trap 'cleanup_on_failure "$?"' EXIT

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

msg "Downloading nibbler v${VERSION}..."
curl -# -fL -O "https://github.com/rooklift/nibbler/archive/refs/tags/v${VERSION}.zip"
unzip -q "v${VERSION}.zip"
NIBBLER="nibbler-${VERSION}"
[[ -d "$NIBBLER" ]] || { msg "Failed to fetch nibbler..."; exit 1; }
ok "Fetched nibbler!"

msg "Downloading electron v${ELECTRON_VERSION}..."
ELECTRON_ZIP="electron-v${ELECTRON_VERSION}-darwin-${ELECTRON_ARCH}.zip"
curl -# -fL -O "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${ELECTRON_ZIP}"

mkdir -p electron
cd electron
unzip -q "../${ELECTRON_ZIP}"
[[ -d "$WORKDIR/electron/Electron.app" ]] || { msg "Failed to fetch electron..."; exit 1; }
ok "Fetched electron!"

msg "Assembling Nibbler.app..."
APP="$WORKDIR/electron/Electron.app"
APP_ROOT="$APP/Contents/Resources/app"

rm -f "$APP/Contents/Resources/default_app.asar"
rm -rf "$APP_ROOT"
cp -R "$WORKDIR/nibbler-${VERSION}/files/src" "$APP_ROOT"

PLIST="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Nibbler" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Nibbler" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.rooklift.nibbler" "$PLIST"

mv "$APP" "$WORKDIR/electron/Nibbler.app"
ok "Built Nibbler.app!"

APP_DIR="$WORKDIR/electron"
APP="$APP_DIR/Nibbler.app"
APPS_DIR="$HOME/Applications"
APPS_APP="$APPS_DIR/Nibbler.app"

read -r -p "Move Nibbler.app to ~/Applications and overwrite any existing copy? [Y/n] " MOVE_APP

msg "Nice, here you go!"
if [[ -z "$MOVE_APP" || "$MOVE_APP" =~ ^[Yy]$ ]]; then
	msg "Installing Nibbler.app to ~/Applications..."
	mkdir -p "$APPS_DIR"
	rm -rf "$APPS_APP"
	mv "$APP" "$APPS_DIR/"
	ok "Installed Nibbler.app to ${APPS_APP}!"
	open -R "$APPS_APP"
else
	open "$APP_DIR"
	msg "IMPORTANT: Make sure to move app under Applications/ or ~/Applications!"
fi
