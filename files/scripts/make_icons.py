import io, os

import cairosvg
from PIL import Image

# Regenerates res/nibbler.png and res/nibbler.ico from the SVG sources.
# Needs: pip install cairosvg pillow
#
# nibbler-small.svg is a simplified drawing that stays legible at 16-32 px,
# so the small .ico frames are rendered from it and the rest from nibbler.svg.

os.chdir(os.path.dirname(os.path.realpath(__file__)))		# Ensure we're in make_icons.py's directory.
os.chdir("..")												# Then come up one level.

SMALL_MAX = 32

def render(svg_path, size):
	png = cairosvg.svg2png(url = svg_path, output_width = size, output_height = size)
	return Image.open(io.BytesIO(png)).convert("RGBA")

def frame(size):
	return render("res/nibbler-small.svg" if size <= SMALL_MAX else "res/nibbler.svg", size)

render("res/nibbler.svg", 512).save("res/nibbler.png", optimize = True)

sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
frames = [frame(n) for n in sizes]
frames[-1].save("res/nibbler.ico", format = "ICO", sizes = [(n, n) for n in sizes], append_images = frames[:-1])

print("Wrote res/nibbler.png and res/nibbler.ico")
