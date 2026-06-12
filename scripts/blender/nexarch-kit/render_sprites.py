"""Render pixel-art sprites of the rune-monk agent (8 directions) and the
hooded NPCs (4 directions) for the district scenes."""
import math
import os
import sys

import bpy

OUT = "/home/user/shellforge-realms/images/districts/sprites"
os.makedirs(OUT, exist_ok=True)
TMP = "/tmp/citybuild/spr"
os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# lights + ortho camera at the game pitch
key = bpy.data.lights.new("K", "SUN")
key.energy = 3.0
key.color = (0.75, 0.8, 1.0)
ko = bpy.data.objects.new("K", key)
ko.rotation_euler = (math.radians(50), math.radians(15), math.radians(140))
bpy.context.collection.objects.link(ko)
fill = bpy.data.lights.new("F", "SUN")
fill.energy = 1.2
fill.color = (1.0, 0.5, 0.4)
fo = bpy.data.objects.new("F", fill)
fo.rotation_euler = (math.radians(60), 0, math.radians(-40))
bpy.context.collection.objects.link(fo)

cam_data = bpy.data.cameras.new("C")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("C", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
PITCH = 38
dist = 30


def aim(target_z, ortho):
    p = math.radians(PITCH)
    cam.location = (0, -dist * math.cos(p), target_z + dist * math.sin(p))
    cam.rotation_euler = (math.radians(90 - PITCH), 0, 0)
    cam_data.ortho_scale = ortho


scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

jobs = []

# rune-monk: 8 directions
bpy.ops.import_scene.gltf(filepath="/home/user/shellforge-realms/images/3d/rune-monk.glb")
monk = [o for o in bpy.context.selected_objects]
root = bpy.data.objects.new("MR", None)
bpy.context.collection.objects.link(root)
for o in monk:
    if o.parent is None:
        o.parent = root
jobs.append(("monk", root, 8, 1.55, 3.4))

for (name, root, n_dir, target_z, ortho) in jobs:
    aim(target_z, ortho)
    for d in range(n_dir):
        root.rotation_euler = (0, 0, 2 * math.pi * d / n_dir)
        scene.render.filepath = f"{TMP}/{name}_{d}.png"
        bpy.ops.render.render(write_still=True)
print("monk renders done")

# NPCs from the kit
for o in list(bpy.data.objects):
    if o.name not in ("C", "K", "F"):
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.append(directory="/tmp/citybuild/nexarch-kit.blend/Object/",
                  filename="npc_c")
bpy.ops.wm.append(directory="/tmp/citybuild/nexarch-kit.blend/Object/",
                  filename="npc_m")
bpy.ops.wm.append(directory="/tmp/citybuild/nexarch-kit.blend/Object/",
                  filename="npc_o")
scene.camera = bpy.data.objects["C"]
for v in ("npc_c", "npc_m", "npc_o"):
    o = bpy.data.objects[v]
    o.hide_render = True
for v in ("npc_c", "npc_m", "npc_o"):
    o = bpy.data.objects[v]
    o.hide_render = False
    aim(1.9, 4.6)
    for d in range(4):
        o.rotation_euler = (0, 0, 2 * math.pi * d / 4)
        scene.render.filepath = f"{TMP}/{v}_{d}.png"
        bpy.ops.render.render(write_still=True)
    o.hide_render = True
print("npc renders done")

# pixelate: trim alpha, downscale NEAREST, 2x nearest upscale
from PIL import Image

for f in sorted(os.listdir(TMP)):
    if not f.endswith(".png"):
        continue
    img = Image.open(f"{TMP}/{f}")
    bbox = img.getbbox()
    img = img.crop(bbox)
    h = 40 if f.startswith("monk") else 30
    w = max(1, round(img.width * h / img.height))
    img = img.resize((w, h), Image.NEAREST).resize((w * 2, h * 2), Image.NEAREST)
    img.save(f"{OUT}/{f}")
print("SPRITES DONE:", len(os.listdir(OUT)))
