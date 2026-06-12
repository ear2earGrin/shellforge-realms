"""Cut phone-portrait structure crops of each district from the city bake.
These are the img2img structure inputs for AI restyling (Grok/Higgsfield),
and the placeholder art for district.html until styled art replaces them.

Projection of city-local (x, z, h) into bake pixels (6144x4200, yaw 225,
pitch 38, ortho width 830, target 0,0,0):
  sx = -0.7071*x + 0.7071*z            sy = 0.4355*(x+z) + 0.7876*h
  px = 3072 + sx*7.402                 py = 2100 - sy*7.402
"""
import json
import os
import sys

from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "images/3d/nexarch-bake.jpg"
OUT = sys.argv[2] if len(sys.argv) > 2 else "images/districts/structure"
W_CROP, H_CROP = 480, 800   # ~65x108 world units, ref-like framing

DISTRICTS = [
    ("core",    "THE CORE",      0,    0,  0),
    ("church",  "CHURCH",        0, -250, 14),
    ("forge",   "FORGE",         0,  250,  0),
    ("market",  "MARKET",      200,    0,  2),
    ("arena",   "ARENA",       150,  150,  4),
    ("alchemy", "ALCHEMY LABS", -150, -150, 0),
    ("vault",   "FAMILY VAULT", 150, -150,  0),
    ("mines",   "DEEP MINES",  -250,    0, -4),
    ("alley",   "DARK ALLEY",  -200,  200, -6),
]


def to_px(x, z, h):
    sx = -0.7071 * x + 0.7071 * z
    sy = 0.4355 * (x + z) + 0.7876 * h
    return 3072 + sx * 7.402, 2100 - sy * 7.402


img = Image.open(SRC).convert("RGB")
W, H = img.size
os.makedirs(OUT, exist_ok=True)
meta = {}
for key, name, x, z, h in DISTRICTS:
    px, py = to_px(x, z, h)
    py -= 60                       # bias upward so buildings above are in frame
    x0 = int(min(max(px - W_CROP / 2, 0), W - W_CROP))
    y0 = int(min(max(py - H_CROP / 2, 0), H - H_CROP))
    crop = img.crop((x0, y0, x0 + W_CROP, y0 + H_CROP))
    crop.resize((W_CROP * 2, H_CROP * 2), Image.LANCZOS).save(
        f"{OUT}/{key}.jpg", quality=92)   # 2x for img2img input quality
    meta[key] = {"name": name, "bakeBox": [x0, y0, W_CROP, H_CROP],
                 "center": [x, z]}
json.dump(meta, open(f"{OUT}/crops.json", "w"), indent=1)
print("district crops done:", ", ".join(meta))
