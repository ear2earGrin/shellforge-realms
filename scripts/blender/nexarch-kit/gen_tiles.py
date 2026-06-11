"""Slice the baked backdrop into a 3-level tile pyramid for zoom streaming.

Output: images/3d/tiles/L0.jpg              (1536-wide overview, single file)
        images/3d/tiles/L1/{col}_{row}.jpg  (3072-wide, 512px tiles)
        images/3d/tiles/L2/{col}_{row}.jpg  (full res,  512px tiles)
Plus tiles/meta.json with pixel sizes the viewer needs.
"""
import json
import os
import sys

from PIL import Image

SRC = "/tmp/citybuild/nexarch-bake.png"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/citybuild/tiles"
TILE = 512

img = Image.open(SRC).convert("RGB")
W, H = img.size
meta = {"fullW": W, "fullH": H, "tile": TILE, "lods": []}

os.makedirs(OUT, exist_ok=True)
overview = img.resize((W // 4, H // 4), Image.LANCZOS)
overview.save(f"{OUT}/L0.jpg", quality=86)
meta["lods"].append({"name": "L0", "w": W // 4, "h": H // 4, "single": True})

for name, scale in (("L1", 2), ("L2", 1)):
    lw, lh = W // scale, H // scale
    level = img if scale == 1 else img.resize((lw, lh), Image.LANCZOS)
    os.makedirs(f"{OUT}/{name}", exist_ok=True)
    cols = (lw + TILE - 1) // TILE
    rows = (lh + TILE - 1) // TILE
    for r in range(rows):
        for c in range(cols):
            box = (c * TILE, r * TILE, min((c + 1) * TILE, lw),
                   min((r + 1) * TILE, lh))
            level.crop(box).save(f"{OUT}/{name}/{c}_{r}.jpg", quality=86)
    meta["lods"].append({"name": name, "w": lw, "h": lh,
                         "cols": cols, "rows": rows})

with open(f"{OUT}/meta.json", "w") as f:
    json.dump(meta, f)
total = sum(os.path.getsize(os.path.join(dp, fn))
            for dp, _, fns in os.walk(OUT) for fn in fns)
print(f"tiles done: {total / 1e6:.1f} MB")
