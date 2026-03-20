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

# electron packager fails without name, version, main fields in package.json
# this uses simple js script to ensure correct fields
ensure_package_json_defaults() {
	local package_json_path="$1"
	local package_name="$2"
	local package_version="$3"
	local package_main="$4"

	"$NODE" - "$package_json_path" "$package_name" "$package_version" "$package_main" <<'EOF'
const fs = require("fs");

const [packageJsonPath, packageName, packageVersion, packageMain] = process.argv.slice(2);
let pkg = {};

if (fs.existsSync(packageJsonPath)) {
	const raw = fs.readFileSync(packageJsonPath, "utf8").trim();

	if (raw !== "") {
		try {
			pkg = JSON.parse(raw);
		} catch (error) {
			console.error(`Invalid JSON in ${packageJsonPath}: ${error.message}`);
			process.exit(1);
		}
	}
}

if (pkg === null || Array.isArray(pkg) || typeof pkg !== "object") {
	console.error(`${packageJsonPath} must contain a JSON object.`);
	process.exit(1);
}

if (typeof pkg.name !== "string" || pkg.name.trim() === "") {
	pkg.name = packageName;
}

if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
	pkg.version = packageVersion;
}

if (typeof pkg.main !== "string" || pkg.main.trim() === "") {
	pkg.main = packageMain;
}

fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
EOF
}

mkdir -p "$WORKDIR"
cd "$WORKDIR"

msg "Downloading nibbler archive..."
curl -fL -O "https://github.com/rooklift/nibbler/archive/refs/tags/v${VERSION}.zip"

msg "Unzipping nibbler archive..."
unzip -q "v${VERSION}.zip"

NIBBLER="nibbler-${VERSION}"
ls "$NIBBLER" && ok "Fetched nibbler!"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) msg "Unsupported architecture: x86" >&2; exit 1;;
  *) msg "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

NODE_DIR="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
NODE_TGZ="${NODE_DIR}.tar.gz"

msg "Downloading node archive..."
curl -fL -O "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TGZ}"

msg "Unpacking node archive..."
tar -xzf "$NODE_TGZ"

ls "$NODE_DIR" && ok "Fetched node!"

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

msg "Ensuring package.json has required Electron entry fields..."
ensure_package_json_defaults "package.json" "$PACKAGE_NAME" "$VERSION" "$PACKAGE_MAIN"
ok "Prepared package.json!"

msg "Running electron-packager..."
"$NPX" @electron/packager . Nibbler --platform=darwin --arch="$NODE_ARCH" --out=dist
ok "Built app!"

msg "Nice, here you go!"
open "$WORKDIR/$NIBBLER/dist/Nibbler-darwin-arm64/"

msg "IMPORTANT: Make sure to move app under Applications/ or ~/Applications!"
