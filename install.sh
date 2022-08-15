#!/bin/bash

BASE_URL="https://github.com/rooklift/nibbler/"

# compute the latest release number dynamically
VERSION_NR=$(basename $(curl -fs -o/dev/null -w %{redirect_url} ${BASE_URL}/releases/latest))
VERSION_NR_ONLY_DIGIT="${VERSION_NR:1}"
URL="${BASE_URL}releases/download/${VERSION_NR}/nibbler-${VERSION_NR_ONLY_DIGIT}-linux.zip"

cd ~/Downloads
echo "Downloading the latest release from the github release page:"
echo ${URL}
wget -q -c "${URL}"
if [ $? -eq 0 ]; then
    echo "Successfully Downloaded Nibbler ${VERSION_NR_ONLY_DIGIT} "
else
    echo "Failed to Download Nibbler ${VERSION_NR_ONLY_DIGIT}. Exiting ..."
    exit 1
fi

ZIP_NAME="nibbler-${VERSION_NR_ONLY_DIGIT}-linux.zip"
FILE_NAME="nibbler-${VERSION_NR_ONLY_DIGIT}-linux"
LOCATION="/opt/${ZIP_NAME}"
echo "Unzipping to $LOCATION"
sudo unzip -qq ${ZIP_NAME} -d /opt/
sudo chmod +x /opt/${FILE_NAME}/nibbler

read -p "Do you want to create a Desktop Shortcut? (y/n)" -n 1 -r
if [[ $REPLY =~ ^[Yy]$ ]]
then

   sudo mkdir -p /usr/local/share/applications

cat <<EOF | sudo tee -a /usr/local/share/applications/nibbler.desktop >/dev/null
[Desktop Entry]
Type=Application
Version=1.0
Name=Nibbler
Icon=/opt/${FILE_NAME}/resources/app/pieces/K.png
Exec=/opt/${FILE_NAME}/nibbler
Terminal=false
StartupNotify=false
Categories=Game;BoardGame;
EOF
  printf "\n"
  echo "Desktop Shortcut created"
fi
printf "\n"
echo "Successfully installed Nibbler ${VERSION_NR} to /opt/${FILE_NAME}"



