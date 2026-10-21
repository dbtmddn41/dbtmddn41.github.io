"""Generate the two small textures the site uses.

noise.png     64×64 grain: black and white specks with low alpha, tiled over masks.
dissolve.png  10-frame sprite (stacked vertically) for the theme switch. Each frame is a
              24×14 grid of cells; a cell is opaque once its random rank falls under the
              cosine-schedule threshold for that frame, so the new theme appears tile by
              tile the way a masked diffusion model unmasks tokens.
dissolve-portrait.png  the same with a 12×24 grid, so cells stay near square on phones.

Usage: python3 -I make_textures.py <out_dir>
"""
import math
import random
import sys
from PIL import Image

out = sys.argv[1]
rng = random.Random(7)

# Grain
noise = Image.new("RGBA", (64, 64))
px = noise.load()
for y in range(64):
    for x in range(64):
        v = 255 if rng.random() < 0.5 else 0
        a = int(rng.random() ** 1.6 * 90)
        px[x, y] = (v, v, v, a)
noise.save(f"{out}/noise.png", optimize=True)

# Dissolve sprites
def dissolve(cols, rows, name, cell=20, frames=10):
    n = cols * rows
    ranks = list(range(n))
    rng.shuffle(ranks)
    w, h = cols * cell, rows * cell
    sprite = Image.new("L", (w, h * frames), 0)
    for f in range(frames):
        shown = round(n * (1 - math.cos(math.pi / 2 * f / (frames - 1))))
        frame = Image.new("L", (w, h), 0)
        for i, r in enumerate(ranks):
            if r < shown:
                cx, cy = (i % cols) * cell, (i // cols) * cell
                frame.paste(255, (cx, cy, cx + cell, cy + cell))
        sprite.paste(frame, (0, f * h))
    rgba = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    rgba.putalpha(sprite)
    rgba.save(f"{out}/{name}", optimize=True)


dissolve(24, 14, "dissolve.png")
dissolve(12, 24, "dissolve-portrait.png")
print("ok")
