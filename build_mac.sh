#!/bin/sh

# Create your own Nibbler App

## If you do not have npm install it with brew with the command : "brew install npm"
## If you do not have brew search for the installation guide online

# Install requirement electron
npm install -g electron

# Copy the repository of the current version
git clone https://github.com/rooklift/nibbler.git

# Get into the new github direcotry
cd nibbler

# Create App
npx create-electron-app Nibbler

# Get inside the app
cd Nibbler

# Remove the useless srrc
rm -r src

cd ..

# move everything into the new src
mv src Nibbler/

cd Nibbler/src

# Change the name
mv main.js index.js

# Get into the preview directory
cd ..

# Create your final version
npm run make

# Get the output
cd nibbler/

# Move the Nibbler App checking the computer architecture
if [ "$(uname - m)" = "arm64" ] ; then
    cd nibbler-darwin-arm64
    mv nibbler.app /Applications/Nibbler.app
else
    cd nibbler-darwin-x86_64
    mv nibbler.app /Applications/Nibbler.app
fi

# Get back
cd ..

# Change icon
mv assets/nibbler.icns /Applications/Nibbler.app/Contents/Resource/electron.icns
