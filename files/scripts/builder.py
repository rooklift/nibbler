import json, os, shutil, zipfile

zips = {
	"windows": "scripts/electron_zipped/electron-v9.4.4-win32-x64.zip",
	"linux": "scripts/electron_zipped/electron-v9.4.4-linux-x64.zip",
}

# To build Nibbler: (for info see https://electronjs.org/docs/tutorial/application-distribution)
#
# Obtain the appropriate Electron asset named above, from https://github.com/electron/electron/releases
# Create a folder at scripts/electron_zipped and place the Electron asset in it
# Run ./builder.py

os.chdir(os.path.dirname(os.path.realpath(__file__)))		# Ensure we're in builder.py's directory.
os.chdir("..")												# Then come up one level.

with open("package.json") as f:
	version = json.load(f)["version"]

useful_root_files = [file for file in os.listdir() if file.endswith(".js") or file.endswith(".html") or file.endswith(".css") or file == "package.json"]
folders = ["js_modules", "js_renderer", "pieces", "res"]

for key, value in zips.items():
	if not os.path.exists(value):
		print("{} not present!".format(value))
		continue
	build_dir = "scripts/dist/nibbler-{}-{}".format(version, key)
	build_app_dir = os.path.join(build_dir, "resources/app")
	os.makedirs(build_app_dir)
	for file in useful_root_files:
		shutil.copy(file, build_app_dir)
	for folder in folders:
		shutil.copytree(folder, os.path.join(build_app_dir, folder))
	print("Extracting for {}...".format(key))
	z = zipfile.ZipFile(value, "r")
	z.extractall(build_dir)
	z.close()
	if os.path.exists(os.path.join(build_dir, "electron.exe")):
		os.rename(os.path.join(build_dir, "electron.exe"), os.path.join(build_dir, "nibbler.exe"))
	if os.path.exists(os.path.join(build_dir, "electron")):
		os.rename(os.path.join(build_dir, "electron"), os.path.join(build_dir, "nibbler"))
