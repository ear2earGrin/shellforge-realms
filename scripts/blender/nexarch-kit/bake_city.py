"""Pre-render the Nexarch backdrop the Diablo 2 way: one fixed isometric
camera, Cycles GI, wet streets. Geometry/camera must match nexarch-3d.html:
three.js yaw = 225 deg -> blender azimuth 135 deg, pitch 38 deg,
ortho width 830 world units, 4096x2800 px, target (0,0,0)."""
import json
import math

import bpy
import bmesh

OUT = "/tmp/citybuild"
RES_X, RES_Y = 4096, 2800
ORTHO = 830.0
AZ, PITCH = 135.0, 38.0

bpy.ops.wm.open_mainfile(filepath=f"{OUT}/nexarch-kit.blend")
scene = bpy.context.scene
layout = json.load(open(f"{OUT}/nexarch-layout.json"))

kit = {o.name: o for o in bpy.data.objects}
for o in kit.values():
    o.hide_render = True
    o.hide_viewport = True

for pl in layout["placements"]:
    src = kit.get(pl["p"])
    if src is None:
        continue
    dup = src.copy()
    dup.hide_render = False
    dup.hide_viewport = False
    dup.location = (pl["x"], -pl["z"], pl.get("y", 0))
    dup.rotation_euler = (0, 0, pl["r"])
    s = pl.get("s", 1.0)
    dup.scale = (s, s, s)
    bpy.context.collection.objects.link(dup)

# ---------------------------------------------------------------- terrain
SPAN = layout["span"]
HN = layout["heightsN"]
Hs = layout["heights"]
bm = bmesh.new()
uvl = bm.loops.layers.uv.new("UVMap")
verts = []
for gz in range(HN):
    row = []
    for gx in range(HN):
        x = -SPAN / 2 + (gx + 0.5) * (SPAN / HN)
        z = -SPAN / 2 + (gz + 0.5) * (SPAN / HN)
        row.append(bm.verts.new((x, -z, Hs[gz * HN + gx])))
    verts.append(row)
for gz in range(HN - 1):
    for gx in range(HN - 1):
        f = bm.faces.new((verts[gz][gx], verts[gz][gx + 1],
                          verts[gz + 1][gx + 1], verts[gz + 1][gx]))
        for loop in f.loops:
            vx, vy = loop.vert.co.x, loop.vert.co.y
            loop[uvl].uv = ((vx + SPAN / 2) / SPAN, (vy + SPAN / 2) / SPAN)
mesh = bpy.data.meshes.new("Terrain")
bm.to_mesh(mesh)
bm.free()
terrain = bpy.data.objects.new("Terrain", mesh)
bpy.context.collection.objects.link(terrain)
for p in terrain.data.polygons:
    p.use_smooth = True
gm = bpy.data.materials.new("M_Ground")
gm.use_nodes = True
bsdf = gm.node_tree.nodes["Principled BSDF"]
tex = gm.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(f"{OUT}/nexarch-ground.png")
gm.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
gm.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 1.15
bsdf.inputs["Roughness"].default_value = 0.22          # rain-slick streets
terrain.data.materials.append(gm)

# ---------------------------------------------------------------- trees
tree_mat = bpy.data.materials.new("M_PineT")
tree_mat.use_nodes = True
tree_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = \
    (0.018, 0.045, 0.036, 1)
bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.34, depth=1.0,
                                location=(0, 0, -100))
tree_src = bpy.context.active_object
tree_src.data.materials.append(tree_mat)
for (x, z, y, h) in layout["trees"]:
    d = tree_src.copy()
    d.location = (x, -z, y + h / 2 - 0.5)
    d.scale = (h, h, h)
    bpy.context.collection.objects.link(d)
tree_src.hide_render = True

# ---------------------------------------------------------------- lamp lights
for pl in layout["placements"]:
    if pl["p"] == "lamp":
        li = bpy.data.lights.new("L", "POINT")
        li.energy = 220
        li.color = (1.0, 0.62, 0.30)
        li.shadow_soft_size = 1.2
        lo = bpy.data.objects.new("L", li)
        lo.location = (pl["x"], -pl["z"], pl.get("y", 0) + 5.2)
        bpy.context.collection.objects.link(lo)

# ---------------------------------------------------------------- world/camera
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = \
    (0.010, 0.012, 0.020, 1)
scene.world = world
moon = bpy.data.lights.new("Moon", "SUN")
moon.energy = 1.5
moon.color = (0.55, 0.65, 0.95)
moon.angle = math.radians(8)            # soft moon shadows
mo = bpy.data.objects.new("Moon", moon)
mo.rotation_euler = (math.radians(48), math.radians(12), math.radians(140))
bpy.context.collection.objects.link(mo)

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = ORTHO
cam_data.clip_end = 4000
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
pitch = math.radians(PITCH)
az = math.radians(AZ)
dist = 1100
cam.location = (dist * math.cos(pitch) * math.cos(az),
                dist * math.cos(pitch) * math.sin(az),
                dist * math.sin(pitch))
cam.rotation_euler = (math.radians(90 - PITCH), 0, math.radians(AZ + 90))

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 28
scene.cycles.use_denoising = True
scene.cycles.sample_clamp_indirect = 8.0
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.image_settings.file_format = "PNG"
scene.view_settings.exposure = 1.25
scene.render.filepath = f"{OUT}/nexarch-bake.png"
bpy.ops.render.render(write_still=True)

from PIL import Image
img = Image.open(f"{OUT}/nexarch-bake.png").convert("RGB")
img.save(f"{OUT}/nexarch-bake.jpg", quality=88)
print("BAKE DONE", img.size)
