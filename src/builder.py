import json, os, shutil, zipfile

# https://electronjs.org/docs/tutorial/application-distribution

with open("package.json") as f:
    version = json.load(f)["version"]

# Location of zipped electron distributions...

linux_electron = "electron_zipped/electron-v5.0.13-linux-x64.zip"
windows_electron = "electron_zipped/electron-v5.0.13-win32-x64.zip"

# Setup directories...

linux_dir = "dist/nibbler-{}-linux".format(version)
windows_dir = "dist/nibbler-{}-windows".format(version)

linux_app_dir = os.path.join(linux_dir, "resources/app")
windows_app_dir = os.path.join(windows_dir, "resources/app")

os.makedirs(linux_app_dir)
os.makedirs(windows_app_dir)

# Source and other technical files...

useful_files = [file for file in os.listdir() if file.endswith(".js") or file.endswith(".html") or file.endswith(".css") or file == "package.json"]

for file in useful_files:
	shutil.copy(file, linux_app_dir)
	shutil.copy(file, windows_app_dir)

# Folders...

folders = ["modules", "pieces"]

for folder in folders:
	shutil.copytree(folder, os.path.join(linux_app_dir, folder))
	shutil.copytree(folder, os.path.join(windows_app_dir, folder))

# Extract Electron...

print("Extracting for Linux...")
z = zipfile.ZipFile(linux_electron, "r")
z.extractall(linux_dir)
z.close()

print("Extracting for Windows...")
z = zipfile.ZipFile(windows_electron, "r")
z.extractall(windows_dir)
z.close()

# Rename Electron...

os.rename(os.path.join(linux_dir, "electron"), os.path.join(linux_dir, "nibbler"))
os.rename(os.path.join(windows_dir, "electron.exe"), os.path.join(windows_dir, "nibbler.exe"))
