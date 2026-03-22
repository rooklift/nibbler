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
VERSION="2.5.7"
NODE_VERSION="25.8.1"
PACKAGE_NAME="nibbler"
PACKAGE_MAIN="files/src/main.js"
NODE_ARCH="arm64"
SOURCE_DIR="files/src"


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

msg "Downloading nibbler archive..."
curl -fL -O "https://github.com/rooklift/nibbler/archive/refs/tags/v${VERSION}.zip"

msg "Unzipping nibbler archive..."
unzip -q "v${VERSION}.zip"

NIBBLER="nibbler-${VERSION}"
[[ -d "$NIBBLER" ]] && ok "Fetched nibbler!"

ARCH="$(uname -m)"
if [[ "$ARCH" != "$NODE_ARCH" ]]; then
	msg "Unsupported architecture: $ARCH (this installer requires ${NODE_ARCH})" >&2
	exit 1
fi

NODE_DIR="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
NODE_TGZ="${NODE_DIR}.tar.gz"

msg "Downloading node archive..."
curl -fL -O "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TGZ}"

msg "Unpacking node archive..."
tar -xzf "$NODE_TGZ"

[[ -d "$NODE_DIR" ]] && ok "Fetched node!"

msg "Verifying npm, npx..."
NODE="$WORKDIR/$NODE_DIR/bin/node"
NPM="$WORKDIR/$NODE_DIR/bin/npm"
NPX="$WORKDIR/$NODE_DIR/bin/npx"

"$NODE" --version
"$NPM" --version
"$NPX" --version

cd "$WORKDIR/$NIBBLER"

msg "Installing electron and electron-packager..."
"$NPM" install --save-dev electron @electron/packager
ok "Installed packages!"

cd "$WORKDIR/$NIBBLER/$SOURCE_DIR"

msg "Running electron-packager..."
"$NPX" @electron/packager . Nibbler --platform=darwin --arch="$NODE_ARCH" --out=dist
ok "Built app!"


cd "$WORKDIR/$NIBBLER"
APP_DIR="$WORKDIR/$NIBBLER/$SOURCE_DIR/dist/Nibbler-darwin-${NODE_ARCH}"
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
