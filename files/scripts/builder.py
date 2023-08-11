import json, os, platform, shutil, zipfile

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
		if key == platform.system().lower():
			print("{} not present; this is problem if you are hoping to test locally!".format(value))
		else:
			print("Skipping build for {} ({} not present)".format(key, value))
		continue

	# make build directory
	build_dir = "scripts/dist/nibbler-{}-{}".format(version, key)
	os.makedirs(build_dir)

	# copy files
	build_res_dir = os.path.join(build_dir, "resources")
	shutil.copytree("res", build_res_dir)
	shutil.copytree("src", os.path.join(build_res_dir, "app"))
	
	# extract electron
	print("Extracting for {}...".format(key), end='')
	z = zipfile.ZipFile(value, "r")
	z.extractall(build_dir)
	z.close()

	# rename executable
	if os.path.exists(os.path.join(build_dir, "electron.exe")):
		os.rename(os.path.join(build_dir, "electron.exe"), os.path.join(build_dir, "nibbler.exe"))
		print('OK')
	if os.path.exists(os.path.join(build_dir, "electron")):
		os.rename(os.path.join(build_dir, "electron"), os.path.join(build_dir, "nibbler"))
		print('OK')
