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

with open("src/package.json") as f:
	version = json.load(f)["version"]

for key, value in zips.items():
	# check if electron archives exist
	if not os.path.exists(value):
		print("{} not present!".format(value))
		continue

	# make build directory
	build_dir = "scripts/dist/nibbler-{}-{}".format(version, key)
	build_res_dir = os.path.join(build_dir, "resources")
	os.makedirs(build_res_dir)

	# copy files
	shutil.copytree("src", os.path.join(build_res_dir, "app"))
	shutil.copy("res/nibbler.png", os.path.join(build_res_dir, "nibbler.png"))
	shutil.copytree("res/linux", os.path.join(build_res_dir, "linux"))

	# extract electron
	print("Extracting for {}...".format(key))
	z = zipfile.ZipFile(value, "r")
	z.extractall(build_dir)
	z.close()

	# rename executable
	if os.path.exists(os.path.join(build_dir, "electron.exe")):
		os.rename(os.path.join(build_dir, "electron.exe"), os.path.join(build_dir, "nibbler.exe"))
	if os.path.exists(os.path.join(build_dir, "electron")):
		os.rename(os.path.join(build_dir, "electron"), os.path.join(build_dir, "nibbler"))
