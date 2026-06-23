"""Render each Nexarch kit piece as a transparent isometric sprite PNG,
with a manifest of foot-anchor points, for a sprite-compositing canvas
engine (e.g. the Higgsfield Supercomputer game). Camera matches the city
bake: ortho, azimuth 135, pitch 38. Foundations (z<0) are clipped so each
sprite sits flat on a tile. Constant pixels-per-world-unit keeps relative
building sizes correct."""
import json
import math
import os

import bpy
import bmesh

OUT_TMP = "/tmp/citybuild/bsprites"
OUT_REPO = "/home/user/shellforge-realms/images/districts/building-sprites"
os.makedirs(OUT_TMP, exist_ok=True)
os.makedirs(OUT_REPO, exist_ok=True)

PXU = 24                 # pixels per world unit (constant across all sprites)
RES = 2400               # square canvas; big enough for the arena
AZ, PITCH = 135.0, 38.0

bpy.ops.wm.open_mainfile(filepath="/tmp/citybuild/nexarch-kit.blend")
scene = bpy.context.scene

pieces = [o for o in bpy.data.objects if o.type == "MESH"]
for o in bpy.data.objects:
    o.hide_render = True

# clip foundations: delete geometry below z=-0.2 so buildings sit flat
for o in pieces:
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    doomed = [v for v in bm.verts if v.co.z < -0.2]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(me); bm.free()

# lights: cool moon key + warm fill (consistent for every sprite)
key = bpy.data.lights.new("K", "SUN"); key.energy = 3.2; key.color = (0.7, 0.8, 1.0)
ko = bpy.data.objects.new("K", key)
ko.rotation_euler = (math.radians(52), math.radians(14), math.radians(140))
scene.collection.objects.link(ko)
fill = bpy.data.lights.new("F", "SUN"); fill.energy = 1.1; fill.color = (1.0, 0.55, 0.4)
fo = bpy.data.objects.new("F", fill)
fo.rotation_euler = (math.radians(64), 0, math.radians(-40))
scene.collection.objects.link(fo)

world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.2, 0.25, 0.4, 1)
scene.world = world

# ortho camera pointed at origin (so world (0,0,0) lands at frame center)
cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"
cam_data.ortho_scale = RES / PXU          # constant px/unit
cam_data.clip_start = -2000; cam_data.clip_end = 4000
cam = bpy.data.objects.new("C", cam_data)
scene.collection.objects.link(cam); scene.camera = cam
p, a = math.radians(PITCH), math.radians(AZ)
dist = 1500
cam.location = (dist*math.cos(p)*math.cos(a), dist*math.cos(p)*math.sin(a),
                dist*math.sin(p))
cam.rotation_euler = (math.radians(90-PITCH), 0, math.radians(AZ+90))

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = RES
scene.render.resolution_y = RES
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.exposure = 0.9

from PIL import Image

manifest = {"pxPerUnit": PXU, "camera": {"azimuth": AZ, "pitch": PITCH},
            "sprites": {}}
for o in pieces:
    o.hide_render = False
    scene.render.filepath = f"{OUT_TMP}/{o.name}.png"
    bpy.ops.render.render(write_still=True)
    o.hide_render = True
    img = Image.open(f"{OUT_TMP}/{o.name}.png")
    bbox = img.getbbox()
    if not bbox:
        continue
    cropped = img.crop(bbox)
    cropped.save(f"{OUT_REPO}/{o.name}.png")
    # origin (foot point) is at frame center; anchor in cropped coords:
    anchor_x = RES // 2 - bbox[0]
    anchor_y = RES // 2 - bbox[1]
    manifest["sprites"][o.name] = {
        "file": f"{o.name}.png", "w": cropped.width, "h": cropped.height,
        "anchorX": anchor_x, "anchorY": anchor_y}
    print("sprite", o.name, cropped.width, "x", cropped.height)

json.dump(manifest, open(f"{OUT_REPO}/manifest.json", "w"), indent=1)
print("SPRITES DONE:", len(manifest["sprites"]))
