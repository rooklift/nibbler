#!/usr/bin/env bash
set -e

BASE_URL="https://github.com/rooklift/nibbler"

# check curl
if ! which curl 1>/dev/null 2>&1 ; then
    echo "Please install curl and make sure it's added to \$PATH"
    echo "Aborting"
    exit 1
fi

# start
echo "You are installing Nibbler"

# get the latest release version
VERSION=$(curl -fs -o /dev/null -w "%{redirect_url}" "${BASE_URL}/releases/latest" | xargs basename)
echo "Latest release is ${VERSION}"
ZIP_NAME="nibbler-${VERSION#v}-linux.zip"
ZIP_URL="${BASE_URL}/releases/download/${VERSION}/${ZIP_NAME}"

# create and enter temp dir
TEMP_DIR=$(mktemp -d)
cd "${TEMP_DIR}"

# download
echo "Downloading release from ${ZIP_URL}"
if curl -fOL "${ZIP_URL}"; then
    echo "Successfully downloaded ${ZIP_NAME}"
else
    echo "Failed to download ${ZIP_NAME}"
    echo "Exiting"
    exit 1
fi

# extract
echo "Extracting..."
unzip -q "${ZIP_NAME}"
echo "Successfully extracted Nibbler"
UNZIPPED_NAME="${ZIP_NAME%.zip}"

# prepare
chmod +x "${UNZIPPED_NAME}/nibbler"
mv "${UNZIPPED_NAME}/resources/"{nibbler.png,nibbler.svg,linux} ./

# check if already installed
INSTALL_DIR="/opt/nibbler"
if [[ -d "${INSTALL_DIR}" ]]; then
    echo "${INSTALL_DIR} already exists!"
    echo "It looks like there is an existing installation of Nibbler on your system"
    read -p "Would you like to overwrite it? [y/n]" -n 1 CONFIRM_INSTALL
    echo
    if ! [[ "$CONFIRM_INSTALL" =~ ^[Yy]$ ]]; then
        echo "Aborting"
        exit 1
    fi
fi

# start install
BIN_SYMLINK_PATH="/usr/local/bin/nibbler"
DESKTOP_ENTRY_PATH="/usr/local/share/applications/nibbler.desktop"
ICON_PNG_PATH="/usr/local/share/icons/hicolor/512x512/apps/nibbler.png"
ICON_SVG_PATH="/usr/local/share/icons/hicolor/scalable/apps/nibbler.svg"
echo "Installing Nibbler to ${INSTALL_DIR}"
echo "Creating binary symlink at ${BIN_SYMLINK_PATH}"
echo "Installing desktop entry to ${DESKTOP_ENTRY_PATH}"
echo "Installing icons to ${ICON_PNG_PATH} and ${ICON_SVG_PATH}"
echo "This will require sudo privilege."

# remove old and make sure directories are created
for FILE in "${INSTALL_DIR}" "${BIN_SYMLINK_PATH}" "${DESKTOP_ENTRY_PATH}" \
    "${ICON_PNG_PATH}" "${ICON_SVG_PATH}"; do
    sudo rm -rf "$FILE"
    sudo mkdir -p $(dirname "$FILE")
done

# install new
sudo mv "${UNZIPPED_NAME}" "${INSTALL_DIR}"
sudo ln -s "${INSTALL_DIR}/nibbler" "${BIN_SYMLINK_PATH}"
sed -i "s|^Exec=.*|Exec=nibbler --no-sandbox|" "linux/nibbler.desktop"
sudo mv "linux/nibbler.desktop" "${DESKTOP_ENTRY_PATH}"
sudo mv "nibbler.png" "${ICON_PNG_PATH}"
sudo mv "nibbler.svg" "${ICON_SVG_PATH}"

# done
echo "Successfully installed Nibbler ${VERSION}"
echo "You will be able to find Nibbler in your launcher shortly"
