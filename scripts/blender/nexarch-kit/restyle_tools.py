"""Split the 6K Nexarch bake into model-sized regions for AI restyling,
then stitch the restyled regions back into a full-resolution image.

No Blender needed — pure PIL. Usage:

  python3 restyle_tools.py split images/3d/nexarch-bake.jpg /tmp/restyle
      -> /tmp/restyle/in/c{X}_r{Y}.png   (2048x2048 regions, 256px overlap)
      -> /tmp/restyle/manifest.json

  ...run every in/ region through img2img with the SAME prompt/strength,
     save results as /tmp/restyle/out/c{X}_r{Y}.png (same names)...

  python3 restyle_tools.py stitch /tmp/restyle images/3d/nexarch-bake.jpg
      -> feather-blends out/ regions into the full-size bake image.
         Then re-run gen_tiles.py to rebuild images/3d/tiles/.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

TILE = 2048
OVERLAP = 256


def positions(full, tile, step):
    xs = list(range(0, max(full - tile, 0) + 1, step))
    if xs[-1] != full - tile:
        xs.append(full - tile)
    return xs


def split(src, workdir):
    img = Image.open(src).convert("RGB")
    W, H = img.size
    step = TILE - OVERLAP
    os.makedirs(f"{workdir}/in", exist_ok=True)
    os.makedirs(f"{workdir}/out", exist_ok=True)
    boxes = {}
    for ci, x in enumerate(positions(W, TILE, step)):
        for ri, y in enumerate(positions(H, TILE, step)):
            name = f"c{ci}_r{ri}"
            img.crop((x, y, x + TILE, y + TILE)).save(f"{workdir}/in/{name}.png")
            boxes[name] = [x, y]
    json.dump({"fullW": W, "fullH": H, "tile": TILE, "overlap": OVERLAP,
               "boxes": boxes}, open(f"{workdir}/manifest.json", "w"))
    print(f"split: {len(boxes)} regions of {TILE}px -> {workdir}/in/")
    print("Process each through img2img with identical settings, save to out/.")


def feather_weight():
    """2D weight map: 1 in the core, linear ramp to ~0 across the overlap."""
    ramp = np.minimum(np.arange(TILE) + 1, OVERLAP) / OVERLAP
    w1d = np.minimum(ramp, ramp[::-1])
    return np.outer(w1d, w1d)


def stitch(workdir, dest):
    meta = json.load(open(f"{workdir}/manifest.json"))
    W, H = meta["fullW"], meta["fullH"]
    acc = np.zeros((H, W, 3), dtype=np.float64)
    wacc = np.zeros((H, W, 1), dtype=np.float64)
    wmap = feather_weight()[..., None]
    missing = []
    for name, (x, y) in meta["boxes"].items():
        matches = glob.glob(f"{workdir}/out/{name}.*")
        if not matches:
            missing.append(name)
            continue
        tile = Image.open(matches[0]).convert("RGB")
        if tile.size != (TILE, TILE):       # model returned a different size
            tile = tile.resize((TILE, TILE), Image.LANCZOS)
        arr = np.asarray(tile, dtype=np.float64)
        acc[y:y + TILE, x:x + TILE] += arr * wmap
        wacc[y:y + TILE, x:x + TILE] += wmap
    if missing:
        sys.exit(f"missing restyled regions in {workdir}/out/: {missing}")
    out = (acc / np.maximum(wacc, 1e-9)).clip(0, 255).astype(np.uint8)
    Image.fromarray(out).save(dest, quality=90)
    print(f"stitched {len(meta['boxes'])} regions -> {dest}")
    print("Now re-run gen_tiles.py to rebuild images/3d/tiles/.")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("split", "stitch"):
        sys.exit(__doc__)
    if sys.argv[1] == "split":
        split(sys.argv[2], sys.argv[3])
    else:
        stitch(sys.argv[2], sys.argv[3])
