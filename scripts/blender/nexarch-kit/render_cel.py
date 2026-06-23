"""Render the real Nexarch city in Messenger-style cel-shading:
Toon BSDF flat banding + Freestyle ink outlines + bright stylized palette.
Two close framings so we can judge the look as a game screen."""
import json
import math

import bpy
import bmesh

OUT = "/tmp/citybuild"
bpy.ops.wm.open_mainfile(filepath=f"{OUT}/nexarch-kit.blend")
scene = bpy.context.scene
layout = json.load(open(f"{OUT}/nexarch-layout.json"))

# ---------------- cel-ify every material -------------------------------------
def toonify(mat):
    if not mat or not mat.use_nodes:
        return
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if not bsdf or not out:
        return
    base = tuple(bsdf.inputs["Base Color"].default_value)
    emc = tuple(bsdf.inputs["Emission Color"].default_value)
    ems = bsdf.inputs["Emission Strength"].default_value
    # if it's an emissive (neon) material, keep it glowing flat
    if ems and (emc[0] + emc[1] + emc[2]) > 0.2:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = emc
        em.inputs["Strength"].default_value = max(ems, 9.0)
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        return
    # otherwise: punchier base color + Toon BSDF for hard banded shading
    boost = [min(1.0, c * 0.85 + 0.04) for c in base[:3]]
    toon = nt.nodes.new("ShaderNodeBsdfToon")
    toon.component = "DIFFUSE"
    toon.inputs["Color"].default_value = (*boost, 1)
    toon.inputs["Size"].default_value = 0.55
    toon.inputs["Smooth"].default_value = 0.0
    nt.links.new(toon.outputs["BSDF"], out.inputs["Surface"])

for m in bpy.data.materials:
    toonify(m)

# ---------------- place kit + terrain (same as bake) -------------------------
kit = {o.name: o for o in bpy.data.objects}
for o in kit.values():
    o.hide_render = o.hide_viewport = True
for pl in layout["placements"]:
    src = kit.get(pl["p"])
    if not src:
        continue
    d = src.copy()
    d.hide_render = d.hide_viewport = False
    d.location = (pl["x"], -pl["z"], pl.get("y", 0))
    d.rotation_euler = (0, 0, pl["r"])
    s = pl.get("s", 1.0)
    d.scale = (s, s, s)
    bpy.context.collection.objects.link(d)

SPAN, HN, Hs = layout["span"], layout["heightsN"], layout["heights"]
bm = bmesh.new()
uvl = bm.loops.layers.uv.new("UVMap")
vs = []
for gz in range(HN):
    row = []
    for gx in range(HN):
        x = -SPAN / 2 + (gx + 0.5) * (SPAN / HN)
        z = -SPAN / 2 + (gz + 0.5) * (SPAN / HN)
        row.append(bm.verts.new((x, -z, Hs[gz * HN + gx])))
    vs.append(row)
for gz in range(HN - 1):
    for gx in range(HN - 1):
        f = bm.faces.new((vs[gz][gx], vs[gz][gx+1], vs[gz+1][gx+1], vs[gz+1][gx]))
        for lp in f.loops:
            lp[uvl].uv = ((lp.vert.co.x+SPAN/2)/SPAN, (lp.vert.co.y+SPAN/2)/SPAN)
mesh = bpy.data.meshes.new("T")
bm.to_mesh(mesh); bm.free()
terr = bpy.data.objects.new("T", mesh)
bpy.context.collection.objects.link(terr)
gm = bpy.data.materials.new("Mground"); gm.use_nodes = True
gt = gm.node_tree
ti = gt.nodes.new("ShaderNodeTexImage")
ti.image = bpy.data.images.load(f"{OUT}/nexarch-ground.png")
gtoon = gt.nodes.new("ShaderNodeBsdfToon")
gtoon.inputs["Size"].default_value = 0.6
gt.links.new(ti.outputs["Color"], gtoon.inputs["Color"])
gout = next(n for n in gt.nodes if n.type == "OUTPUT_MATERIAL")
gt.links.new(gtoon.outputs["BSDF"], gout.inputs["Surface"])
terr.data.materials.append(gm)

# ---------------- lights + world ---------------------------------------------
w = bpy.data.worlds.new("W"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.02, 0.05, 1)
scene.world = w
sun = bpy.data.lights.new("S", "SUN"); sun.energy = 1.3; sun.color = (0.55, 0.68, 1.0)
so = bpy.data.objects.new("S", sun)
so.rotation_euler = (math.radians(52), math.radians(12), math.radians(140))
bpy.context.collection.objects.link(so)
for pl in layout["placements"]:
    if pl["p"] == "lamp":
        li = bpy.data.lights.new("L", "POINT"); li.energy = 240
        li.color = (1.0, 0.62, 0.3)
        lo = bpy.data.objects.new("L", li)
        lo.location = (pl["x"], -pl["z"], pl.get("y", 0) + 5)
        bpy.context.collection.objects.link(lo)

# ---------------- Freestyle ink outlines -------------------------------------
scene.render.use_freestyle = True
vl = scene.view_layers[0]
vl.use_freestyle = True
fs = vl.freestyle_settings
lineset = fs.linesets[0] if fs.linesets else fs.linesets.new("ls")
if lineset.linestyle is None:
    lineset.linestyle = bpy.data.linestyles.new("ink")
ls = lineset.linestyle
ls.color = (0.02, 0.03, 0.06)
ls.thickness = 2.6
lineset.select_silhouette = True
lineset.select_border = True
lineset.select_crease = True

# ---------------- camera + render --------------------------------------------
cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"; cam_data.clip_end = 4000
cam = bpy.data.objects.new("C", cam_data)
bpy.context.collection.objects.link(cam); scene.camera = cam
AZ = 135.0


def frame(target, ortho, pitch=40):
    p = math.radians(pitch); a = math.radians(AZ); dist = 1100
    cam.location = (target[0] + dist*math.cos(p)*math.cos(a),
                    target[1] + dist*math.cos(p)*math.sin(a),
                    target[2] + dist*math.sin(p))
    cam.rotation_euler = (math.radians(90-pitch), 0, math.radians(AZ+90))
    cam_data.ortho_scale = ortho

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 1600
scene.view_settings.exposure = 0.65
# (bloom skipped — Blender 5 compositor API; neon carried by emission)

# core plaza, phone-screen framing (note: target uses blender y = -z_world)
frame((0, 0, 0), 150)
scene.render.filepath = f"{OUT}/cel_core.png"
bpy.ops.render.render(write_still=True)
print("CEL CORE DONE")

frame((200, 0, 2), 150)   # market
scene.render.filepath = f"{OUT}/cel_market.png"
bpy.ops.render.render(write_still=True)
print("CEL MARKET DONE")
