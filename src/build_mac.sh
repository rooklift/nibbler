#!/bin/sh

# Create your own Nibbler App
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD=$(tput bold)
NORM=$(tput sgr0)

ArmPrefix="/opt"
IntelPrefix="/usr/local/bin"

# If brew is installed exit else brew install
if [ "$(ls ${ArmPrefix} | grep homebrew )" = "homebrew" ] || [ "$(ls ${IntelPrefix} | grep brew)" = "brew" ] ; then
    
    # Install npm if not installed
    brew install node

    # Get to the correct directory 
    cd ..

    # Install requirement electron
    npm install -g electron
    
    # Create App
    npx create-electron-app Nibbler
    
    # Get inside the app
    cd Nibbler
    
    # Remove the useless src
    rm -r src
    
    cd ..
    
    # cp everything into the new src
    cp -r src Nibbler/
    
    cd Nibbler/src
    
    # Change the name
    mv main.js index.js
    
    # Get into the preview directory
    cd ..
    
    # Create your final version
    npm run make
    
    # Move the Nibbler App checking the computer architecture
    if [ "$(uname -m)" = "arm64" ] ; then
        cd out/nibbler-darwin-arm64
        mv nibbler.app /Applications/Nibbler.app
    else
        cd out/nibbler-darwin-x64
        mv nibbler.app /Applications/Nibbler.app
    fi
    
    # Get back
    cd ../../../
    
    # Change icon
    cp Nibbler/src/misc/nibbler.icns /Applications/Nibbler.app/Contents/Resources/electron.icns
    
else
    echo "${RED}You have to install brew follow the instruction -> ${NC}${BOLD}https://docs.brew.sh/Installation${NORM}"
fi
