"""Assemble the full Nexarch layout in Blender from the kit and render
isometric previews. Local coords: x east, z south -> blender (x, -z)."""
import json
import math

import bpy

OUT = "/tmp/citybuild"

bpy.ops.wm.open_mainfile(filepath=f"{OUT}/nexarch-kit.blend")
scene = bpy.context.scene
layout = json.load(open(f"{OUT}/nexarch-layout.json"))

kit = {o.name: o for o in bpy.data.objects}
for o in kit.values():
    o.hide_render = True
    o.hide_viewport = True

for pl in layout["placements"]:
    src = kit[pl["p"]]
    dup = src.copy()  # linked duplicate, shares mesh
    dup.hide_render = False
    dup.hide_viewport = False
    dup.location = (pl["x"], -pl["z"], pl.get("y", 0))
    dup.rotation_euler = (0, 0, pl["r"])
    s = pl.get("s", 1.0)
    dup.scale = (s, s, s)
    bpy.context.collection.objects.link(dup)

# ground
bpy.ops.mesh.primitive_plane_add(size=640, location=(0, 0, -0.05))
ground = bpy.context.active_object
gm = bpy.data.materials.new("M_Ground")
gm.use_nodes = True
bsdf = gm.node_tree.nodes["Principled BSDF"]
tex = gm.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(f"{OUT}/nexarch-ground.png")
gm.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
gm.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 1.4
bsdf.inputs["Roughness"].default_value = 0.55
ground.data.materials.append(gm)
# flip V because image z-south maps to -y
ground.rotation_euler = (0, 0, 0)
uvl = ground.data.uv_layers.active
for loop in ground.data.loops:
    u, v = uvl.data[loop.index].uv
    uvl.data[loop.index].uv = (u, 1 - v)

# forest ring outside the walls: simple dark cones
import random
random.seed(5)
cone_mat = bpy.data.materials.new("M_Pine")
cone_mat.use_nodes = True
cone_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = \
    (0.015, 0.035, 0.03, 1)
for _ in range(260):
    a = random.uniform(0, 2 * math.pi)
    r = random.uniform(318, 470)
    h = random.uniform(9, 17)
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=h * 0.32, depth=h,
                                    location=(r * math.cos(a), r * math.sin(a), h / 2))
    bpy.context.active_object.data.materials.append(cone_mat)

# world / lights
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.014, 0.024, 1)
scene.world = world

moon = bpy.data.lights.new("Moon", "SUN")
moon.energy = 1.6
moon.color = (0.55, 0.65, 0.95)
mo = bpy.data.objects.new("Moon", moon)
mo.rotation_euler = (math.radians(50), math.radians(15), math.radians(140))
bpy.context.collection.objects.link(mo)

# camera: isometric like the prototype
cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam


def aim_iso(yaw_deg, ortho_scale, target=(0, 0, 0), pitch_deg=38):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    dist = 900
    d = (math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw),
         math.sin(pitch))
    cam.location = (target[0] + d[0] * dist, target[1] + d[1] * dist,
                    target[2] + d[2] * dist)
    cam.rotation_euler = (math.radians(90 - pitch_deg), 0,
                          math.radians(yaw_deg + 90))
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_end = 3000


scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.image_settings.file_format = "PNG"

scene.view_settings.exposure = 1.2
aim_iso(225, 700)                       # full city, from the SW like the concept
scene.render.filepath = f"{OUT}/city_full.png"
bpy.ops.render.render(write_still=True)

aim_iso(205, 240, target=(0, 185, 0))   # close-up: cathedral + monolith field
scene.render.filepath = f"{OUT}/city_closeup.png"
bpy.ops.render.render(write_still=True)
print("PREVIEWS DONE")
