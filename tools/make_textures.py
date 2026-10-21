"""Generate the grain texture the site's masks use.

noise.png  64×64 grain: black and white specks with low alpha, tiled over masks.

Usage: python3 make_textures.py assets/img   (needs Pillow)
"""
import random
import sys
from PIL import Image

out = sys.argv[1]
rng = random.Random(7)

noise = Image.new("RGBA", (64, 64))
px = noise.load()
for y in range(64):
    for x in range(64):
        v = 255 if rng.random() < 0.5 else 0
        a = int(rng.random() ** 1.6 * 90)
        px[x, y] = (v, v, v, a)
noise.save(f"{out}/noise.png", optimize=True)
print("ok")
