"""Build the rune-monk character in Blender (bpy module), render turnaround, export GLB."""
import math
import os
import random

import bpy
import bmesh
from mathutils import Vector

OUT = "/tmp/charbuild"
random.seed(7)

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

CHAR_PARTS = []


def register(obj):
    CHAR_PARTS.append(obj)
    return obj


# ---------------------------------------------------------------- materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    return m, bsdf, m.node_tree


def img_tex_mat(name, img_path, emit_strength=1.0, rough=0.9, uv_scale=None):
    m, bsdf, tree = new_mat(name)
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(img_path)
    if uv_scale:
        mapping = tree.nodes.new("ShaderNodeMapping")
        uvn = tree.nodes.new("ShaderNodeUVMap")
        mapping.inputs["Scale"].default_value = uv_scale
        tree.links.new(uvn.outputs["UV"], mapping.inputs["Vector"])
        tree.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = emit_strength
    bsdf.inputs["Roughness"].default_value = rough
    return m


def plain_mat(name, color, rough=0.8, metal=0.0, emit=None, emit_strength=0.0):
    m, bsdf, _ = new_mat(name)
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return m


M_CLOTH = img_tex_mat("M_RuneCloth", f"{OUT}/runes_cloth.png", emit_strength=1.6, rough=0.92)
M_TRIM = img_tex_mat("M_RuneTrim", f"{OUT}/runes_trim.png", emit_strength=2.5, rough=0.6,
                     uv_scale=(6.0, 12.0, 1.0))
M_CUFF = img_tex_mat("M_RuneCuff", f"{OUT}/runes_trim.png", emit_strength=2.5, rough=0.6,
                     uv_scale=(3.0, 8.0, 1.0))
M_HOOD = img_tex_mat("M_HoodCircuit", f"{OUT}/runes_circuit.png", emit_strength=1.0, rough=0.85)
M_METAL = plain_mat("M_DarkMetal", (0.05, 0.05, 0.06), rough=0.35, metal=0.95)
M_MASK = plain_mat("M_Mask", (0.008, 0.008, 0.01), rough=0.22, metal=0.7)
M_VISOR = plain_mat("M_Visor", (0.0, 0.0, 0.0), emit=(1.0, 0.06, 0.02), emit_strength=14.0)
M_SASH = plain_mat("M_Sash", (0.018, 0.018, 0.022), rough=0.95)


# ---------------------------------------------------------------- helpers
def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def lathe(name, profile, nseg=64, wave=None):
    """Surface of revolution. profile = [(radius, z), ...] bottom->top.
    wave(r, z, theta, ring_idx) -> radius lets us add cloth folds/hem flare."""
    bm = bmesh.new()
    rings = []
    for i, (r, z) in enumerate(profile):
        ring = []
        for s in range(nseg):
            th = 2 * math.pi * s / nseg
            rr = wave(r, z, th, i) if wave else r
            ring.append(bm.verts.new((rr * math.cos(th), rr * math.sin(th), z)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    faces = []
    for i in range(len(rings) - 1):
        for s in range(nseg):
            s2 = (s + 1) % nseg
            f = bm.faces.new((rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]))
            faces.append((f, i, s))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new("UVMap")
    nr = len(rings) - 1
    for f, i, s in faces:
        for loop in f.loops:
            v = loop.vert
            ring_i = i if v in (rings[i][s], rings[i][(s + 1) % nseg]) else i + 1
            in_next = v in (rings[ring_i][(s + 1) % nseg],)
            u = (s + (1 if in_next else 0)) / nseg
            loop[uv].uv = (u, ring_i / nr)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    smooth(obj)
    return register(obj)


def band_material(obj, base, trim, z_below=None, z_above=None):
    """Two material slots; faces whose center z passes the threshold get trim."""
    obj.data.materials.append(base)
    obj.data.materials.append(trim)
    for p in obj.data.polygons:
        z = sum(obj.data.vertices[v].co.z for v in p.vertices) / len(p.vertices)
        if (z_below is not None and z < z_below) or (z_above is not None and z > z_above):
            p.material_index = 1


def prim(kind, name, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(location=loc, rotation=rot, **kw)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    if mat:
        obj.data.materials.append(mat)
    smooth(obj)
    return register(obj)


def aligned_cone(name, mat, p_from, p_to, r1, r2, verts=24):
    p_from, p_to = Vector(p_from), Vector(p_to)
    d = p_to - p_from
    obj = prim("cone", name, mat, loc=tuple((p_from + p_to) / 2),
               vertices=verts, radius1=r1, radius2=r2, depth=d.length,
               end_fill_type="NGON")
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = d.to_track_quat("Z", "Y")
    return obj


# ---------------------------------------------------------------- robe skirt
def skirt_wave(r, z, th, i):
    t = 1.0 - (z - 0.10) / 1.20          # 1 at hem, 0 at waist
    hem = 0.10 * math.sin(5 * th + 0.7) * (t ** 2.2)
    folds = 0.035 * math.sin(13 * th) * (0.25 + 0.75 * t)
    return r + hem + folds


skirt_profile = [(0.92, 0.10), (0.86, 0.22), (0.74, 0.42), (0.62, 0.64),
                 (0.52, 0.86), (0.44, 1.05), (0.37, 1.20), (0.33, 1.30)]
skirt = lathe("RobeSkirt", skirt_profile, nseg=72, wave=skirt_wave)
band_material(skirt, M_CLOTH, M_TRIM, z_below=0.24)
sub = skirt.modifiers.new("subsurf", "SUBSURF")
sub.levels = sub.render_levels = 2
sol = skirt.modifiers.new("solid", "SOLIDIFY")
sol.thickness = 0.02

# ---------------------------------------------------------------- torso
torso = lathe("Torso", [(0.31, 1.25), (0.30, 1.50), (0.28, 1.75), (0.25, 1.98)], nseg=48)
band_material(torso, M_CLOTH, M_TRIM)
torso.modifiers.new("subsurf", "SUBSURF").levels = 1

# ---------------------------------------------------------------- shoulder mantle
def mantle_wave(r, z, th, i):
    t = 1.0 - (z - 1.58) / 0.62
    return r + 0.05 * math.sin(7 * th + 1.3) * max(t, 0) ** 2


mantle = lathe("Mantle", [(0.58, 1.58), (0.52, 1.72), (0.42, 1.88),
                          (0.30, 2.04), (0.19, 2.20)], nseg=64, wave=mantle_wave)
band_material(mantle, M_CLOTH, M_TRIM, z_below=1.66)
mantle.modifiers.new("subsurf", "SUBSURF").levels = 2
mantle.modifiers.new("solid", "SOLIDIFY").thickness = 0.025

# ---------------------------------------------------------------- hood
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=(0, 0.02, 2.30))
hood = bpy.context.active_object
hood.name = "Hood"
register(hood)
for v in hood.data.vertices:
    if v.co.z > 0.30:                      # angular peak leaning forward over the face
        f = (v.co.z - 0.30) / 0.70
        v.co.z += 0.24 * f
        v.co.y -= 0.42 * f * f
hood.scale = (0.34, 0.38, 0.40)
bpy.context.view_layer.objects.active = hood
bpy.ops.object.transform_apply(scale=True)
# carve face opening (lower, so the brow overhangs)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=0.26,
                                     location=(0, -0.37, 2.20))
cutter = bpy.context.active_object
boolm = hood.modifiers.new("cut", "BOOLEAN")
boolm.object = cutter
boolm.operation = "DIFFERENCE"
bpy.context.view_layer.objects.active = hood
bpy.ops.object.modifier_apply(modifier="cut")
bpy.data.objects.remove(cutter, do_unlink=True)
hood.modifiers.new("solid", "SOLIDIFY").thickness = 0.025
hood.modifiers.new("subsurf", "SUBSURF").levels = 1
smooth(hood)
# project simple UVs so the circuit texture shows
uvl = hood.data.uv_layers.new(name="UVMap")
for loop in hood.data.loops:
    co = hood.data.vertices[loop.vertex_index].co
    uvl.data[loop.index].uv = ((co.x + 0.5), (co.z - 1.9))
hood.data.materials.append(M_HOOD)

# hood rim trim ring around the face opening
rim = prim("torus", "HoodRim", M_CUFF, loc=(0, -0.36, 2.19),
           rot=(math.radians(90), 0, 0),
           major_radius=0.205, minor_radius=0.012,
           major_segments=40, minor_segments=10)
rim.scale = (1.0, 1.05, 1.0)

# ---------------------------------------------------------------- face mask + visor
mask = prim("uv_sphere", "Mask", M_MASK, loc=(0, -0.235, 2.19),
            scale=(0.165, 0.135, 0.21), segments=32, ring_count=24)
visor = prim("cube", "Visor", M_VISOR, loc=(0, -0.368, 2.235),
             scale=(0.10, 0.02, 0.017))
visor.rotation_euler = (math.radians(-6), 0, 0)
chest = prim("cube", "ChestCore", M_VISOR, loc=(0, -0.300, 1.80),
             scale=(0.055, 0.012, 0.014))

# ---------------------------------------------------------------- sash + front trim
sash = prim("torus", "Sash", M_SASH, loc=(0, 0, 1.32), scale=(1, 1, 0.55),
            major_radius=0.36, minor_radius=0.075,
            major_segments=48, minor_segments=16)
buckle = prim("cube", "Buckle", M_METAL, loc=(0, -0.40, 1.32),
              scale=(0.10, 0.035, 0.055))

# front rune strip running down the skirt
strip = prim("cube", "FrontStrip", M_CUFF, loc=(0, -0.625, 0.72),
             scale=(0.05, 0.012, 0.60))
strip.rotation_euler = (math.radians(-24.5), 0, 0)
# chest V straps
for sx in (-1, 1):
    s = prim("cube", f"ChestStrap{'LR'[sx>0]}", M_CUFF,
             loc=(sx * 0.13, -0.295, 1.70), scale=(0.035, 0.012, 0.20))
    s.rotation_euler = (math.radians(-8), 0, sx * math.radians(-18))

# ---------------------------------------------------------------- arms
for sx in (-1, 1):
    side = "L" if sx > 0 else "R"
    shoulder = Vector((sx * 0.46, -0.02, 1.84))
    wrist = Vector((sx * 0.82, -0.22, 1.16))
    direction = (wrist - shoulder).normalized()
    aligned_cone(f"Sleeve{side}", M_CLOTH, shoulder, wrist, 0.15, 0.115, verts=24)
    # flared cuff with rune band
    aligned_cone(f"Cuff{side}", M_CUFF, wrist - direction * 0.04,
                 wrist + direction * 0.14, 0.125, 0.185, verts=24)
    # mech hand
    hand = wrist + direction * 0.26
    px, py, pz = hand.x, hand.y, hand.z
    prim("cube", f"Palm{side}", M_METAL, loc=(px, py, pz),
         scale=(0.052, 0.042, 0.07))
    for j, dx in enumerate((-0.036, -0.012, 0.012, 0.036)):
        f = prim("cube", f"Finger{side}{j}", M_METAL,
                 loc=(px + dx, py - 0.02, pz - 0.095),
                 scale=(0.0095, 0.012, 0.042))
        f.rotation_euler = (math.radians(14), 0, 0)
    th = prim("cube", f"Thumb{side}", M_METAL,
              loc=(px - sx * 0.055, py - 0.035, pz - 0.02),
              scale=(0.010, 0.013, 0.034))
    th.rotation_euler = (math.radians(20), sx * math.radians(25), 0)

# ---------------------------------------------------------------- clawed mech feet
for sx in (-1, 1):
    side = "L" if sx > 0 else "R"
    fx = sx * 0.24
    prim("cube", f"Ankle{side}", M_METAL, loc=(fx, -0.62, 0.13),
         scale=(0.085, 0.13, 0.095))
    prim("cylinder", f"Shin{side}", M_METAL, loc=(fx, -0.52, 0.30),
         rot=(math.radians(12), 0, 0), scale=(1, 1, 1),
         radius=0.06, depth=0.35, vertices=16)
    for j, dx in enumerate((-0.06, 0.0, 0.06)):
        c = aligned_cone(f"Claw{side}{j}", M_METAL,
                         (fx + dx, -0.70, 0.11), (fx + dx * 1.7, -1.00, 0.012),
                         0.038, 0.004, verts=12)
    # back talon
    aligned_cone(f"ClawB{side}", M_METAL, (fx, -0.54, 0.10),
                 (fx, -0.40, 0.02), 0.025, 0.004, verts=12)

# ---------------------------------------------------------------- root, floor, lights
root = bpy.data.objects.new("CharRoot", None)
bpy.context.collection.objects.link(root)
for o in CHAR_PARTS:
    o.parent = root

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
floor = bpy.context.active_object
floor.name = "Floor"
floor.data.materials.append(plain_mat("M_Floor", (0.025, 0.025, 0.03), rough=0.9))

target = bpy.data.objects.new("AimTarget", None)
target.location = (0, 0, 1.30)
bpy.context.collection.objects.link(target)


def add_light(name, kind, loc, energy, color=(1, 1, 1), size=2.0):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    tc = obj.constraints.new("TRACK_TO")
    tc.target = target
    return obj


add_light("Key", "AREA", (2.6, -2.8, 3.2), 700, (1.0, 0.95, 0.88), 2.5)
add_light("Rim", "AREA", (-2.2, 2.6, 3.0), 450, (0.55, 0.65, 1.0), 2.0)
add_light("Fill", "AREA", (-2.6, -2.2, 1.0), 120, (0.9, 0.9, 1.0), 3.0)
glow = bpy.data.lights.new("FaceGlow", "POINT")
glow.energy = 32
glow.color = (1.0, 0.12, 0.05)
glow_o = bpy.data.objects.new("FaceGlow", glow)
glow_o.location = (0, -0.55, 2.22)
bpy.context.collection.objects.link(glow_o)

cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 55
cam = bpy.data.objects.new("Cam", cam_data)
cam.location = (0.0, -5.3, 1.55)
bpy.context.collection.objects.link(cam)
cam.constraints.new("TRACK_TO").target = target
scene.camera = cam

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.012, 0.018, 1)
scene.world = world

# ---------------------------------------------------------------- render
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 640
scene.render.resolution_y = 1024
scene.render.image_settings.file_format = "PNG"

for label, deg in [("front", 0), ("threequarter", 38), ("side", 90), ("back", 180)]:
    root.rotation_euler = (0, 0, math.radians(deg))
    bpy.context.view_layer.update()
    scene.render.filepath = f"{OUT}/render_{label}.png"
    bpy.ops.render.render(write_still=True)
    print("rendered", label)

# ---------------------------------------------------------------- export GLB
root.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="DESELECT")
for o in CHAR_PARTS:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=f"{OUT}/rune-monk.glb", export_format="GLB",
                          use_selection=True, export_apply=True,
                          export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/rune-monk.blend")
print("DONE")
