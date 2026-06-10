"""Build the Nexarch modular building kit in Blender and export nexarch-kit.glb.

Every piece is a single mesh at the origin, base at z=0, front facing -Y
(which becomes +Z in glTF). Pieces are named exactly as referenced by
nexarch-layout.json.
"""
import math
import os

import bpy
import bmesh
from mathutils import Matrix, Vector

OUT = "/tmp/citybuild"

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes["Principled BSDF"], m.node_tree


def tex_mat(name, img, rough=0.85, emit=0.0, bump=0.0):
    m, bsdf, tree = new_mat(name)
    t = tree.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(f"{OUT}/{img}")
    tree.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    if bump:
        bn = tree.nodes.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump
        tree.links.new(t.outputs["Color"], bn.inputs["Height"])
        tree.links.new(bn.outputs["Normal"], bsdf.inputs["Normal"])
    if emit:
        tree.links.new(t.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def glow_mat(name, color, strength):
    m, bsdf, _ = new_mat(name)
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    return m


M = {
    "stone": tex_mat("M_Stone", "stone.png", bump=0.45),
    "roof": tex_mat("M_Roof", "roof.png", bump=0.4),
    "timber": tex_mat("M_Timber", "timber.png", bump=0.3),
    "winC": tex_mat("M_WinCyan", "win_cyan.png", rough=0.4, emit=9.0),
    "winM": tex_mat("M_WinMagenta", "win_magenta.png", rough=0.4, emit=9.0),
    "winO": tex_mat("M_WinOrange", "win_orange.png", rough=0.4, emit=7.0),
    "panel": tex_mat("M_Panel", "panel.png", rough=0.3, emit=4.5),
    "metal": None,
    "glowC": glow_mat("M_GlowCyan", (0.35, 0.95, 0.88), 5.0),
    "glowM": glow_mat("M_GlowMagenta", (0.84, 0.41, 1.0), 5.0),
    "glowO": glow_mat("M_GlowOrange", (1.0, 0.62, 0.30), 4.0),
    "glowPool": glow_mat("M_GlowPool", (0.16, 0.50, 0.47), 1.2),
    "neonCdim": glow_mat("M_NeonCdim", (0.30, 0.85, 0.78), 2.2),
    "neonMdim": glow_mat("M_NeonMdim", (0.75, 0.36, 0.90), 2.2),
}
m_metal, bsdf, _ = new_mat("M_Metal")
bsdf.inputs["Base Color"].default_value = (0.05, 0.055, 0.07, 1)
bsdf.inputs["Metallic"].default_value = 0.9
bsdf.inputs["Roughness"].default_value = 0.4
M["metal"] = m_metal
m_pine, bsdf, _ = new_mat("M_Pine")
bsdf.inputs["Base Color"].default_value = (0.03, 0.075, 0.06, 1)
bsdf.inputs["Roughness"].default_value = 1.0
M["pine"] = m_pine
m_trash, bsdf, _ = new_mat("M_Trash")
bsdf.inputs["Base Color"].default_value = (0.035, 0.04, 0.035, 1)
bsdf.inputs["Roughness"].default_value = 0.95
M["trash"] = m_trash

KIT = []


# ---------------------------------------------------------------- builder
class Piece:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []

    def midx(self, key):
        m = M[key]
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _uv_project(self, faces, scale=0.08):
        for f in faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for loop in f.loops:
                co = loop.vert.co
                if ax == 0:
                    u, v = co.y, co.z
                elif ax == 1:
                    u, v = co.x, co.z
                else:
                    u, v = co.x, co.y
                loop[self.uv].uv = (u * scale, v * scale)

    def _add(self, verts_faces, mat, transform, uv_scale=0.08, explicit_uv=None):
        verts, faces = verts_faces
        idx = self.midx(mat)
        bverts = [self.bm.verts.new(transform @ Vector(v)) for v in verts]
        new_faces = []
        for f in faces:
            bf = self.bm.faces.new([bverts[i] for i in f])
            bf.material_index = idx
            bf.smooth = False
            new_faces.append(bf)
        bmesh.ops.recalc_face_normals(self.bm, faces=new_faces)
        if explicit_uv:
            for bf in new_faces:
                for loop, uvco in zip(bf.loops, explicit_uv):
                    loop[self.uv].uv = uvco
        else:
            self._uv_project(new_faces, uv_scale)
        return new_faces

    @staticmethod
    def _box_data(w, d, h):
        x, y = w / 2, d / 2
        verts = [(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0),
                 (-x, -y, h), (x, -y, h), (x, y, h), (-x, y, h)]
        faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
                 (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        return verts, faces

    def box(self, mat, cx, cy, z0, w, d, h, rz=0.0, rx=0.0):
        t = (Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rz, 4, "Z")
             @ Matrix.Rotation(rx, 4, "X"))
        self._add(self._box_data(w, d, h), mat, t)

    def prism(self, mat, cx, cy, z0, w, d, h, ridge="x", rz=0.0):
        """Gable roof. ridge along x or y."""
        if ridge == "y":
            w, d = d, w
            rz += math.pi / 2
        x, y = w / 2, d / 2
        verts = [(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0),
                 (-x, 0, h), (x, 0, h)]
        faces = [(0, 1, 2, 3), (0, 4, 5, 1), (2, 5, 4, 3), (1, 5, 2), (3, 4, 0)]
        t = Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rz, 4, "Z")
        self._add((verts, faces), mat, t)

    def pyramid(self, mat, cx, cy, z0, w, d, h):
        x, y = w / 2, d / 2
        verts = [(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0), (0, 0, h)]
        faces = [(0, 1, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)]
        self._add((verts, faces), mat, Matrix.Translation((cx, cy, z0)))

    def cylinder(self, mat, cx, cy, z0, r, h, seg=14, r2=None, cap=True):
        r2 = r if r2 is None else r2
        verts, faces = [], []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            verts.append((r * math.cos(a), r * math.sin(a), 0))
        for i in range(seg):
            a = 2 * math.pi * i / seg
            verts.append((r2 * math.cos(a), r2 * math.sin(a), h))
        for i in range(seg):
            j = (i + 1) % seg
            faces.append((i, j, seg + j, seg + i))
        if cap:
            faces.append(tuple(range(seg))[::-1])
            faces.append(tuple(range(seg, 2 * seg)))
        self._add((verts, faces), mat, Matrix.Translation((cx, cy, z0)))

    def cone(self, mat, cx, cy, z0, r, h, seg=14):
        verts = [(r * math.cos(2 * math.pi * i / seg),
                  r * math.sin(2 * math.pi * i / seg), 0) for i in range(seg)]
        verts.append((0, 0, h))
        faces = [(i, (i + 1) % seg, seg) for i in range(seg)]
        faces.append(tuple(range(seg))[::-1])
        self._add((verts, faces), mat, Matrix.Translation((cx, cy, z0)))

    def glow_quad(self, mat, cx, cy, z0, w, h, facing="-y", rx=0.0):
        """Flat emissive quad (window/door/panel), UV 0..1."""
        x = w / 2
        verts = [(-x, 0, 0), (x, 0, 0), (x, 0, h), (-x, 0, h)]
        faces = [(0, 1, 2, 3)]
        rot = {"-y": 0, "+y": math.pi, "+x": -math.pi / 2, "-x": math.pi / 2}[facing]
        t = (Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rot, 4, "Z")
             @ Matrix.Rotation(rx, 4, "X"))
        self._add((verts, faces), mat, t,
                  explicit_uv=[(0, 0), (1, 0), (1, 1), (0, 1)])

    def roof_panel(self, cx, cy, z0, w, d, pitch, facing="-y"):
        """Neon data-panel lying on a roof slope."""
        rot = {"-y": 0, "+y": math.pi, "+x": -math.pi / 2, "-x": math.pi / 2}[facing]
        t = (Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rot, 4, "Z")
             @ Matrix.Rotation(pitch, 4, "X"))
        x, y = w / 2, d / 2
        verts = [(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0),
                 (-x, -y, 0.18), (x, -y, 0.18), (x, y, 0.18), (-x, y, 0.18)]
        faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
                 (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        idx = self.midx("panel")
        bverts = [self.bm.verts.new(t @ Vector(v)) for v in verts]
        for fi, f in enumerate(faces):
            bf = self.bm.faces.new([bverts[i] for i in f])
            bf.material_index = idx
            uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
            for loop, uvco in zip(bf.loops, uvs):
                loop[self.uv].uv = uvco
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])

    def done(self):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        KIT.append(obj)
        return obj


def windows_row(p, mat, xs, y, z0, w=2.2, h=3.2, facing="-y"):
    for x in xs:
        p.glow_quad(mat, x, y, z0, w, h, facing)


# ---------------------------------------------------------------- pieces

def shuttered(p, mat, x, y, z, w=2.2, h=3.2, facing="-y"):
    p.glow_quad(mat, x, y, z, w, h, facing)
    off = w / 2 + 0.45
    if facing in ("-y", "+y"):
        sy = y + (0.18 if facing == "-y" else -0.18)
        p.box("timber", x - off, sy, z + 0.1, 0.7, 0.16, h - 0.4)
        p.box("timber", x + off, sy, z + 0.1, 0.7, 0.16, h - 0.4)
    else:
        sx = x + (0.18 if facing == "-x" else -0.18)
        p.box("timber", sx, y - off, z + 0.1, 0.16, 0.7, h - 0.4)
        p.box("timber", sx, y + off, z + 0.1, 0.16, 0.7, h - 0.4)


def stoop(p, x, y_front, w=3.6):
    p.box("stone", x, y_front - 0.9, 0, w, 1.7, 0.55)


def house_small():
    p = Piece("house_small")
    p.box("stone", 0, 0, -5, 13.6, 11.6, 5.2)
    p.box("stone", 0, 0, 0, 14, 12, 8)
    p.box("timber", 0, 0, 4.2, 14.3, 12.3, 0.7)       # half-timber band
    p.prism("roof", 0, 0, 8, 15.4, 13.6, 5.5, ridge="x")
    shuttered(p, "winC", -4, -6.07, 4.0)
    shuttered(p, "winC", 4, -6.07, 4.0)
    p.glow_quad("winO", 0, -6.07, 0, 3.0, 4.6)          # door
    stoop(p, 0, -6.07)
    p.glow_quad("winM", 7.07, 0, 3.8, 2.2, 3.2, facing="+x")
    p.box("roof", 0, 0, 13.1, 15.8, 0.9, 0.5)           # ridge cap
    pitch = math.atan2(5.5, 6.8)
    p.roof_panel(0, -3.4, 10.85, 5.5, 4.2, pitch)
    return p.done()


def house_med():
    p = Piece("house_med")
    p.box("stone", 0, 0, -5, 19.6, 13.6, 5.2)
    p.box("stone", 0, 0, 0, 20, 14, 10)
    p.box("timber", 0, 0, 5.0, 20.3, 14.3, 0.7)
    p.prism("roof", 0, 0, 10, 21.6, 15.8, 6.5, ridge="x")
    p.box("stone", 6.5, 2.0, 16.5, 2.0, 2.0, 3.5)       # chimney
    shuttered(p, "winC", -7, -7.07, 5.6)
    shuttered(p, "winC", 2.4, -7.07, 5.6)
    windows_row(p, "winC", (-2.4, 7), -7.07, 5.6)
    windows_row(p, "winM", (-3,), -7.07, 1.0, 2.0, 3.0)
    p.glow_quad("winO", 3.2, -7.07, 0, 3.2, 5.0)
    stoop(p, 3.2, -7.07)
    p.glow_quad("winC", 10.07, 0, 4.5, 2.4, 3.4, facing="+x")
    p.box("roof", 0, 0, 16.1, 22.0, 0.9, 0.5)           # ridge cap
    p.box("stone", 1.0, -5.6, 12.0, 3.0, 2.6, 2.6)      # dormer
    p.prism("roof", 1.0, -5.6, 14.6, 3.6, 3.2, 1.5, ridge="y")
    p.glow_quad("winC", 1.0, -6.95, 12.5, 1.5, 1.6)
    pitch = math.atan2(6.5, 7.9)
    p.roof_panel(-4.5, -3.9, 13.1, 6.0, 4.6, pitch)
    p.roof_panel(4.5, -3.9, 13.1, 6.0, 4.6, pitch)
    p.box("metal", -7, 1.5, 16.5, 0.22, 0.22, 4.2)      # antenna
    p.glow_quad("glowM", -7, 1.5, 20.6, 0.5, 0.5)
    p.cone("metal", 6.5, 2.0, 20.2, 1.1, 0.5, seg=8)    # dish on chimney
    return p.done()


def house_tall():
    p = Piece("house_tall")
    p.box("stone", 0, 0, -5, 11.6, 11.6, 5.2)
    p.box("stone", 0, 0, 0, 12, 12, 18)
    p.box("timber", 0, 0, 6.0, 12.3, 12.3, 0.7)
    p.box("timber", 0, 0, 12.0, 12.3, 12.3, 0.7)
    p.prism("roof", 0, 0, 18, 13.4, 13.6, 8, ridge="y")
    for z, mat in ((1.0, "winO"), (7.2, "winC"), (13.2, "winM")):
        windows_row(p, mat, (-3.2, 3.2), -6.07, z)
    stoop(p, 0, -6.07, 5.5)
    p.box("timber", 0, -7.0, 12.0, 12.6, 2.4, 0.45)     # balcony deck
    for bx in (-5.6, -1.9, 1.9, 5.6):
        p.box("timber", bx, -7.9, 12.4, 0.28, 0.28, 2.6)
    p.box("timber", 0, -7.9, 15.0, 12.0, 0.24, 0.35)    # rail
    p.box("timber", 0, -7.6, 16.6, 12.4, 1.6, 0.22)     # balcony awning
    p.glow_quad("neonCdim", 0, -8.42, 12.6, 10.5, 0.35)
    p.glow_quad("winC", 6.07, 0, 8, 2.2, 3.2, facing="+x")
    p.glow_quad("winM", -6.07, 0, 8, 2.2, 3.2, facing="-x")
    pitch = math.atan2(8, 6.7)
    p.roof_panel(-3.0, -3.3, 21.8, 4.6, 4.0, pitch)
    p.box("metal", 4, 4, 24.5, 0.2, 0.2, 3.6)
    p.glow_quad("glowC", 4, 4, 28.0, 0.45, 0.45)
    return p.done()


def tower_round():
    p = Piece("tower_round")
    p.cylinder("stone", 0, 0, -5, 5, 5.2, seg=14)
    p.cylinder("stone", 0, 0, 0, 5, 22, seg=14)
    p.cylinder("stone", 0, 0, 21.4, 5.8, 1.2, seg=14)
    p.cone("roof", 0, 0, 22.6, 6.2, 9, seg=14)
    p.box("metal", 0, 0, 31.4, 0.3, 0.3, 3.0)
    p.glow_quad("glowC", 0, 0, 34.2, 0.7, 0.7)
    for ang in (0, math.pi / 2, math.pi, -math.pi / 2):
        x, y = 5.05 * math.sin(ang), -5.05 * math.cos(ang)
        facing = {0: "-y", 1: "+x", 2: "+y", 3: "-x"}[round(ang / (math.pi / 2)) % 4]
        p.glow_quad("winC" if ang % math.pi else "winM", x, y, 9, 1.4, 5.0, facing)
        p.glow_quad("winC", x, y, 16, 1.4, 4.0, facing)
    p.glow_quad("winO", 0, -5.05, 0, 2.8, 4.4)
    return p.done()


def cathedral():
    p = Piece("cathedral")
    p.box("stone", 0, 4, -6, 17.6, 25.6, 6.2)
    p.box("stone", 0, -13, -6, 10.6, 10.6, 6.2)
    p.box("stone", 0, 4, 0, 18, 26, 16)                 # nave
    p.prism("roof", 0, 4, 16, 19.4, 28, 7.5, ridge="y")
    p.box("stone", 0, -13, 0, 11, 11, 30)               # front tower
    p.pyramid("roof", 0, -13, 30, 12.4, 12.4, 9)
    p.box("metal", 0, -13, 38.6, 0.35, 0.35, 4.5)
    p.glow_quad("glowM", 0, -13, 42.6, 1.0, 1.0)
    for sx in (-1, 1):                                  # buttresses
        for yy in (-2, 6, 14):
            p.box("stone", sx * 9.6, yy, 0, 1.6, 2.4, 12)
    p.glow_quad("winM", 0, -18.57, 14.5, 7.0, 9.0)      # rose window
    p.glow_quad("winO", 0, -18.57, 0, 4.2, 7.5)         # portal
    for sx in (-1, 1):                                  # nave windows
        for yy in (-4, 2, 8, 14):
            f = "+x" if sx > 0 else "-x"
            p.glow_quad("winC", sx * 9.07, yy, 6.5, 2.6, 7.0, f)
    pitch = math.atan2(7.5, 9.7)
    p.roof_panel(-4.8, 4, 19.7, 6.5, 9, pitch, facing="-x")
    return p.done()


def arena():
    p = Piece("arena")
    seg = 22
    rx, ry = 40, 31
    for i in range(seg):
        a = 2 * math.pi * i / seg
        x, y = rx * math.cos(a), ry * math.sin(a)
        tang = math.atan2(ry * math.cos(a), -rx * math.sin(a))
        L = 2 * math.pi * math.hypot(rx, ry) / 2 / seg + 2.2
        p.box("stone", x, y, -6, L, 4.5, 20, rz=tang)
        p.box("stone", x, y, 14, L, 5.2, 1.4, rz=tang)
        if i % 2 == 0:                                   # glowing arches
            ox, oy = (rx + 2.4) * math.cos(a), (ry + 2.4) * math.sin(a)
            mat = "winC" if i % 4 == 0 else "winM"
            x2 = 3.4 / 2
            verts = [(-x2, 0, 0), (x2, 0, 0), (x2, 0, 8.5), (-x2, 0, 8.5)]
            t = (Matrix.Translation((ox, oy, 2.0))
                 @ Matrix.Rotation(tang + math.pi / 2, 4, "Z"))
            p._add((verts, [(0, 1, 2, 3)]), mat, t,
                   explicit_uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
    for a in (0.4, 2.1, 3.9, 5.5):                       # mast lights
        x, y = (rx - 4) * math.cos(a), (ry - 4) * math.sin(a)
        p.box("metal", x, y, 14, 0.5, 0.5, 9)
        p.glow_quad("glowC", x, y, 23, 1.6, 1.0)
    return p.done()


def wall_seg():
    p = Piece("wall_seg")
    p.box("stone", 0, 0, -7, 30, 4, 7.2)
    p.box("stone", 0, 0, 0, 30, 4, 10)
    for i in range(5):
        p.box("stone", -12 + i * 6, 0, 10, 3.2, 4.4, 2.2)
    p.glow_quad("glowC", 0, -2.07, 8.6, 26, 0.45)        # rampart light line
    return p.done()


def wall_tower():
    p = Piece("wall_tower")
    p.cylinder("stone", 0, 0, -7, 5.5, 7.2, seg=12)
    p.cylinder("stone", 0, 0, 0, 5.5, 15, seg=12)
    p.cylinder("stone", 0, 0, 14.5, 6.3, 1.3, seg=12)
    p.cone("roof", 0, 0, 15.8, 6.7, 7, seg=12)
    p.glow_quad("winM", 0, -5.55, 9.5, 1.6, 4.0)
    p.glow_quad("winC", 0, 5.55, 9.5, 1.6, 4.0, facing="+y")
    return p.done()


def gate():
    p = Piece("gate")
    p.box("stone", 0, 0, -7, 26, 5, 7.2)
    for sx in (-1, 1):
        p.cylinder("stone", sx * 10, 0, 0, 4.5, 17, seg=12)
        p.cone("roof", sx * 10, 0, 17.6, 5.4, 6.5, seg=12)
        p.cylinder("stone", sx * 10, 0, 17, 5.1, 1.0, seg=12)
    p.box("stone", 0, 0, 11, 13, 4, 6)                   # lintel over arch
    p.box("stone", 0, 0, 17, 13, 4.6, 1.6)
    p.glow_quad("winC", 0, -2.07, 0, 8.5, 10.5)          # portal glow
    p.glow_quad("winC", 0, 2.07, 0, 8.5, 10.5, facing="+y")
    return p.done()


def monolith(name, win, glow):
    p = Piece(name)
    p.box("stone", 0, 0, -2.5, 3.4, 2.2, 2.7)
    p.box("stone", 0, 0, 0, 3.4, 2.2, 0.9)
    p.box("stone", 0, 0, 0.9, 2.6, 1.5, 6.4)
    p.box("stone", 0, 0, 7.3, 3.0, 1.9, 0.5)
    p.glow_quad(win, 0, -0.78, 1.3, 2.2, 5.6)
    p.glow_quad(win, 0, 0.78, 1.3, 2.2, 5.6, facing="+y")
    p.glow_quad(glow, 0, 0, 7.82, 1.2, 0.8)              # cap light
    return p.done()


def stall():
    p = Piece("stall")
    p.box("timber", 0, 0, -2.5, 7.4, 6.6, 2.7)
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        p.box("timber", sx * 3.4, sy * 3.0, 0, 0.6, 0.6, 4.6)
    p.box("timber", 0, -2.6, 0, 7.4, 1.6, 2.6)           # counter
    p.roof_panel(0, 0.4, 5.6, 8.6, 8.2, math.radians(16))
    p.glow_quad("glowM", 0, -3.42, 3.0, 5.0, 0.5)        # neon counter strip
    return p.done()


def fountain_core():
    p = Piece("fountain_core")
    p.cylinder("stone", 0, 0, -4, 8, 4.2, seg=18)
    p.cylinder("stone", 0, 0, 0, 8, 1.3, seg=18)
    p.cylinder("glowPool", 0, 0, 1.0, 7.0, 0.35, seg=18)  # data pool
    p.cylinder("stone", 0, 0, 0, 2.6, 3.2, seg=10)
    p.box("stone", 0, 0, 3.2, 2.4, 2.4, 6.0)
    p.glow_quad("winC", 0, -1.21, 3.6, 1.8, 5.0)
    p.glow_quad("winM", 0, 1.21, 3.6, 1.8, 5.0, facing="+y")
    p.glow_quad("winC", 1.21, 0, 3.6, 1.8, 5.0, facing="+x")
    p.glow_quad("winM", -1.21, 0, 3.6, 1.8, 5.0, facing="-x")
    p.pyramid("metal", 0, 0, 9.2, 2.8, 2.8, 1.6)
    p.glow_quad("glowC", 0, 0, 10.9, 0.9, 0.9)
    return p.done()


def vault():
    p = Piece("vault")
    p.box("stone", 0, 0, -5, 12.6, 12.6, 5.2)
    p.box("stone", 0, 0, 0, 13, 13, 6)
    p.box("stone", 0, 0, 6, 10, 10, 3)
    p.pyramid("stone", 0, 0, 9, 8, 8, 2.6)
    for f, cx, cy in (("-y", 0, -6.57), ("+y", 0, 6.57),
                      ("+x", 6.57, 0), ("-x", -6.57, 0)):
        p.glow_quad("glowC", cx, cy, 4.6, 11, 0.5, facing=f)
        p.glow_quad("glowM", cx, cy, 7.6, 8, 0.4, facing=f)
    p.glow_quad("winC", 0, -6.62, 0.6, 3.0, 3.6)
    return p.done()


def foundry():
    p = Piece("foundry")
    p.box("stone", 0, 0, -5, 23.6, 15.6, 5.2)
    p.box("stone", 0, 0, 0, 24, 16, 11)
    p.prism("roof", 0, 0, 11, 25.6, 17.8, 6.5, ridge="x")
    for cx in (-6, 4):
        p.cylinder("metal", cx, 3, 13, 1.3, 8, seg=10)
        p.glow_quad("glowO", cx, 3, 21.1, 1.8, 0.9)
    windows_row(p, "winO", (-8, -2.7, 2.7, 8), -8.07, 5.5, 2.4, 3.6)
    p.glow_quad("winO", 0, -8.07, 0, 4.6, 6.0)
    p.glow_quad("winO", 12.07, 0, 4, 3.0, 4.0, facing="+x")
    pitch = math.atan2(6.5, 8.9)
    p.roof_panel(6, -4.4, 14.2, 6.5, 5, pitch)
    return p.done()


def lamp():
    p = Piece("lamp")
    p.cylinder("metal", 0, 0, -2.5, 0.34, 2.7, seg=8)
    p.cylinder("metal", 0, 0, 0, 0.28, 5.8, seg=8)
    p.box("metal", 0, -0.7, 5.6, 0.18, 1.6, 0.18)
    p.box("metal", 0, -1.4, 4.6, 0.7, 0.7, 1.0)
    p.glow_quad("glowO", 0, -1.76, 4.7, 0.55, 0.8)
    p.glow_quad("glowO", 0, -1.04, 4.7, 0.55, 0.8, facing="+y")
    return p.done()


def crate():
    p = Piece("crate")
    p.box("timber", 0, 0, 0, 1.7, 1.7, 1.7)
    p.box("timber", 0, 0, 1.7, 1.3, 1.3, 0.12)
    return p.done()


def barrel():
    p = Piece("barrel")
    p.cylinder("timber", 0, 0, 0, 0.85, 1.6, seg=10)
    p.cylinder("metal", 0, 0, 0.25, 0.9, 0.14, seg=10)
    p.cylinder("metal", 0, 0, 1.2, 0.9, 0.14, seg=10)
    return p.done()


def sacks():
    p = Piece("sacks")
    for (cx, cy, r, h) in ((0, 0, 0.9, 0.9), (1.0, 0.5, 0.7, 0.7), (-0.6, 0.8, 0.6, 0.65)):
        p.cylinder("timber", cx, cy, 0, r, h, seg=8, r2=r * 0.55)
    return p.done()


def cart():
    p = Piece("cart")
    p.box("timber", 0, 0, 0.9, 2.6, 1.5, 0.35)
    p.box("timber", 0, 0, 1.25, 0.9, 1.3, 0.5)          # load
    for sx in (-1, 1):
        p.cylinder("metal", sx * 1.0, 0.78, 0.7, 0.7, 0.18, seg=10)
    for sy in (-0.5, 0.5):
        p.box("timber", 1.9, sy, 0.8, 1.4, 0.14, 0.14)
    return p.done()


def banner_pole():
    p = Piece("banner_pole")
    p.cylinder("metal", 0, 0, -2, 0.18, 10.5, seg=8)
    p.box("metal", 0, -0.8, 8.2, 0.14, 1.7, 0.14)
    p.glow_quad("winM", 0, -1.45, 3.6, 1.6, 4.5)
    p.glow_quad("winM", 0, -1.40, 3.6, 1.6, 4.5, facing="+y")
    return p.done()


def banner_pole_c():
    p = Piece("banner_pole_c")
    p.cylinder("metal", 0, 0, -2, 0.18, 10.5, seg=8)
    p.box("metal", 0, -0.8, 8.2, 0.14, 1.7, 0.14)
    p.glow_quad("winC", 0, -1.45, 3.6, 1.6, 4.5)
    p.glow_quad("winC", 0, -1.40, 3.6, 1.6, 4.5, facing="+y")
    return p.done()


def holo_sign():
    p = Piece("holo_sign")
    p.box("metal", 0, 0, 4.2, 0.18, 0.9, 0.18)
    p.glow_quad("neonMdim", 0, -0.95, 3.1, 2.3, 1.5)
    p.glow_quad("neonCdim", 0, -0.90, 3.1, 2.3, 1.5, facing="+y")
    return p.done()


def cable_span():
    p = Piece("cable_span")
    n = 7
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        x0, x1 = -8 + 16 * t0, -8 + 16 * t1
        y0 = 9.0 - 2.2 * (1 - (2 * t0 - 1) ** 2)
        y1 = 9.0 - 2.2 * (1 - (2 * t1 - 1) ** 2)
        cx, cz = (x0 + x1) / 2, (y0 + y1) / 2
        L = math.hypot(x1 - x0, y1 - y0)
        ang = math.atan2(y1 - y0, x1 - x0)
        p.box("metal", cx, 0, cz - 0.06, L + 0.1, 0.12, 0.12,
              rz=0.0, rx=0.0)
        # tilt via direct rotation around Y is not supported; steps are fine
    for lx in (-4, 0.5, 5):
        p.box("metal", lx, 0, 6.4, 0.1, 0.1, 1.1)
        p.glow_quad("glowO", lx, 0, 5.9, 0.5, 0.6)
    return p.done()


def rubble():
    p = Piece("rubble")
    rnd = __import__("random").Random(9)
    for _ in range(7):
        w = rnd.uniform(0.5, 1.4)
        p.box("stone", rnd.uniform(-1.6, 1.6), rnd.uniform(-1.2, 1.2),
              rnd.uniform(-0.3, 0.25), w, w * rnd.uniform(0.6, 1.2),
              rnd.uniform(0.4, 1.0), rz=rnd.uniform(0, 3.1))
    return p.done()


def brazier():
    p = Piece("brazier")
    p.cylinder("metal", 0, 0, 0, 0.75, 1.0, seg=10, r2=0.95)
    p.glow_quad("glowO", 0, 0, 1.02, 1.2, 1.2, rx=math.pi / 2)
    return p.done()


def bush():
    p = Piece("bush")
    p.cylinder("pine", 0, 0, 0, 1.3, 1.6, seg=8, r2=0.5)
    return p.done()


def carpet():
    p = Piece("carpet")
    p.box("winM", 0, 0, 0.04, 3.2, 4.6, 0.1)
    return p.done()


def carpet_c():
    p = Piece("carpet_c")
    p.box("winC", 0, 0, 0.04, 3.2, 4.6, 0.1)
    return p.done()


def house_jetty():
    """D2 'Lut Gholein house' adapted: arched ground floor, jettied upper
    storey, flat roof full of clutter (barrels, tarp, solar rack, servers)."""
    p = Piece("house_jetty")
    p.box("stone", 0, 0, -5, 17.6, 13.6, 5.2)
    p.box("stone", 0, 0, 0, 18, 14, 7.5)
    p.glow_quad("winO", -4.5, -7.07, 0.4, 4.2, 5.6)      # arched openings
    p.glow_quad("winO", 4.5, -7.07, 0.4, 4.2, 5.6)
    p.box("timber", 0, -0.8, 7.5, 18.4, 15.6, 6.0)       # jettied upper floor
    for i in range(5):                                   # joist ends
        p.box("timber", -7 + i * 3.5, -8.0, 6.9, 0.5, 1.4, 0.55)
    windows_row(p, "winC", (-5.5, 0.0, 5.5), -8.67, 9.4, 2.0, 2.8)
    p.glow_quad("winM", 9.27, 0, 9.4, 2.2, 3.0, facing="+x")
    p.box("stone", 0, -0.8, 13.5, 18.8, 16.0, 0.8)       # flat roof slab
    for (bx, by, bw, bd) in ((0, 6.9, 18.8, 0.7), (0, -8.5, 18.8, 0.7),
                             (9.1, -0.8, 0.7, 16.0), (-9.1, -0.8, 0.7, 16.0)):
        p.box("stone", bx, by, 14.3, bw, bd, 1.1)        # parapet
    p.cylinder("timber", -5.5, 3.5, 14.3, 0.85, 1.6, seg=10)   # roof barrels
    p.cylinder("timber", -3.8, 4.6, 14.3, 0.85, 1.6, seg=10)
    p.box("timber", -5.2, 0.6, 14.3, 1.7, 1.7, 1.7)      # roof crate
    for (qx, qy) in ((2.5, 2.0), (8.0, 2.0), (2.5, 6.4), (8.0, 6.4)):
        p.box("timber", qx, qy, 14.3, 0.4, 0.4, 3.4)     # tarp poles
    p.box("timber", 5.25, 4.2, 17.7, 7.2, 6.2, 0.25)     # tarp
    p.roof_panel(-0.5, -5.6, 15.5, 6.5, 4.5, math.radians(28))  # solar rack
    p.box("metal", 7.2, -5.8, 14.3, 1.6, 1.2, 2.6)       # roof server cabinet
    for i in range(3):
        p.glow_quad("glowC", 7.2, -6.42, 15.0 + i * 0.55, 0.9, 0.18)
    p.cylinder("metal", -7.4, 5.9, 14.3, 0.5, 2.6, seg=8)       # vent stack
    p.cylinder("metal", -7.4, 5.9, 16.9, 0.85, 0.45, seg=8)
    p.roof_panel(10.4, 0, 6.6, 5.6, 3.4, math.radians(18), facing="+x")  # lean-to
    p.box("timber", 11.8, -1.5, 0, 0.4, 0.4, 5.4)
    p.box("timber", 11.8, 1.5, 0, 0.4, 0.4, 5.4)
    p.box("metal", -7.8, -6.6, 15.4, 0.2, 0.2, 4.2)      # antenna
    p.glow_quad("glowM", -7.8, -6.6, 19.5, 0.5, 0.5)
    return p.done()


def server_rack():
    p = Piece("server_rack")
    p.box("metal", 0, 0, 0, 1.8, 1.3, 3.0)
    for i in range(4):
        p.glow_quad("glowC" if i % 2 else "neonMdim", 0, -0.66,
                    0.5 + i * 0.6, 1.2, 0.2)
    p.cylinder("metal", 1.3, 0.2, 0, 0.3, 1.9, seg=8)
    p.box("metal", 0.6, 0.9, 0, 0.9, 0.5, 0.6)
    return p.done()


def kiosk():
    """Market kiosk from the style ref: timber booth, goods on the counter,
    big tilted circuit-panel awning with a neon trim strip."""
    p = Piece("kiosk")
    p.box("timber", 0, 0, -2.5, 8.0, 6.2, 2.7)           # foundation pad
    p.box("timber", 0, 2.6, 0, 8.4, 0.7, 4.6)            # back wall
    p.box("timber", -3.9, 0.6, 0, 0.6, 4.6, 4.6)         # side walls
    p.box("timber", 3.9, 0.6, 0, 0.6, 4.6, 4.6)
    p.box("timber", 0, -2.4, 0, 8.4, 1.3, 2.3)           # counter
    for sx in (-1, 1):                                   # front posts
        p.box("timber", sx * 3.9, -2.7, 0, 0.55, 0.55, 5.6)
    p.roof_panel(0, -0.4, 6.3, 9.6, 7.6, math.radians(22))   # big panel awning
    p.glow_quad("neonMdim", 0, -3.6, 5.0, 8.8, 0.5)      # neon trim strip
    p.box("timber", -2.2, -2.3, 2.3, 1.5, 1.5, 1.5)      # goods
    p.cylinder("timber", 2.0, -2.2, 2.3, 0.7, 1.2, seg=8)
    p.box("metal", 0.2, -2.5, 2.3, 1.0, 0.8, 0.7)
    p.box("metal", 0, 2.2, 4.7, 0.7, 0.7, 0.8)           # roof unit
    p.glow_quad("glowO", 0, -0.5, 4.55, 0.8, 0.7)        # hanging lamp
    return p.done()


def e_waste():
    """Broken hardware dumped in the street: dead cases, a cracked screen."""
    p = Piece("e_waste")
    rnd = __import__("random").Random(31)
    for _ in range(5):
        w = rnd.uniform(0.6, 1.3)
        p.box("metal", rnd.uniform(-1.4, 1.4), rnd.uniform(-1.0, 1.0),
              rnd.uniform(-0.2, 0.3), w, w * rnd.uniform(0.6, 1.1),
              rnd.uniform(0.4, 0.9), rz=rnd.uniform(0, 3.1))
    p.box("metal", -0.6, -0.4, 0.7, 1.6, 0.18, 1.1, rz=0.5)   # dead screen
    p.glow_quad("neonCdim", 0.9, -1.05, 0.25, 0.8, 0.35)      # one still flickers
    p.cylinder("metal", 1.5, 0.8, 0, 0.25, 1.3, seg=6)        # bent conduit
    return p.done()


def house_L():
    """Two-wing house: gabled wings at right angles, lived-in details."""
    p = Piece("house_L")
    p.box("stone", 0, 1, -5, 19, 15, 5.2)
    p.box("stone", -2, 0, 0, 14, 10, 9)                  # wing A
    p.prism("roof", -2, 0, 9, 15.4, 11.4, 5, ridge="x")
    p.box("roof", -2, 0, 13.7, 15.6, 0.9, 0.45)
    p.box("stone", 5, 4, 0, 9, 13, 8)                    # wing B
    p.prism("roof", 5, 4, 8, 9.8, 14.4, 4.5, ridge="y")
    p.box("roof", 5, 4, 12.2, 0.9, 14.6, 0.45)
    p.box("timber", -2, 0, 4.6, 14.3, 10.3, 0.7)
    shuttered(p, "winC", -6, -5.07, 4.2)
    p.glow_quad("winO", -1.5, -5.07, 0, 3.0, 4.6)
    stoop(p, -1.5, -5.07)
    shuttered(p, "winM", 5, -2.57, 3.6)
    p.glow_quad("winC", 9.57, 4, 3.4, 2.2, 3.0, facing="+x")
    p.glow_quad("winC", 9.57, 4, 0.4, 2.2, 2.4, facing="+x")
    p.box("stone", -6.5, 2.0, 12.5, 2.0, 2.0, 3.5)       # chimney
    pitch = math.atan2(5, 5.7)
    p.roof_panel(-4.0, -2.9, 11.4, 5.5, 4.0, pitch)
    p.box("metal", 8, 8, 11.0, 0.2, 0.2, 3.8)            # antenna
    p.glow_quad("glowC", 8, 8, 14.7, 0.45, 0.45)
    p.cylinder("metal", -8.3, -4.0, 0, 0.5, 7.5, seg=8)  # downpipe
    return p.done()


def garbage_pile():
    p = Piece("garbage_pile")
    rnd = __import__("random").Random(17)
    for _ in range(6):
        r = rnd.uniform(0.5, 1.0)
        p.cylinder("trash", rnd.uniform(-1.3, 1.3), rnd.uniform(-1.0, 1.0),
                   -0.1, r, r * rnd.uniform(0.9, 1.3), seg=7, r2=r * 0.4)
    for _ in range(4):
        w = rnd.uniform(0.3, 0.7)
        p.box("trash", rnd.uniform(-1.8, 1.8), rnd.uniform(-1.4, 1.4), 0,
              w, w, rnd.uniform(0.2, 0.5), rz=rnd.uniform(0, 3.1))
    p.box("timber", 1.6, -0.8, 0, 0.4, 1.8, 0.3, rz=0.6)  # broken plank
    return p.done()


def water_pod():
    """Rain-collector tank hugging a wall, valve light dripping cyan."""
    p = Piece("water_pod")
    for sx in (-0.8, 0.8):
        p.box("metal", sx, 0, 0, 0.35, 1.6, 0.7)         # legs
    p.cylinder("metal", 0, 0, 0.6, 1.35, 2.6, seg=12, r2=1.15)
    p.cone("metal", 0, 0, 3.2, 1.18, 0.7, seg=12)        # dome
    p.cylinder("metal", 0, -1.5, 0.9, 0.16, 0.9, seg=6)  # valve pipe
    p.glow_quad("neonCdim", 0, -1.62, 0.45, 0.4, 0.5)    # valve light
    p.cylinder("glowPool", 0, -1.6, 0.02, 0.7, 0.08, seg=10)  # drip puddle
    p.cylinder("metal", 1.2, 0.9, 3.0, 0.14, 2.2, seg=6)  # feed pipe up
    return p.done()


PIECES = [house_small(), house_med(), house_tall(), tower_round(), cathedral(),
          arena(), wall_seg(), wall_tower(), gate(),
          monolith("monolith_c", "winC", "glowC"),
          monolith("monolith_m", "winM", "glowM"),
          stall(), fountain_core(), vault(), foundry(), lamp(),
          crate(), barrel(), sacks(), cart(), banner_pole(), banner_pole_c(),
          holo_sign(), cable_span(), rubble(), brazier(), bush(), carpet(),
          carpet_c(), house_jetty(), server_rack(), kiosk(), e_waste(),
          house_L(), garbage_pile(), water_pod()]

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action="DESELECT")
for o in PIECES:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=f"{OUT}/nexarch-kit.glb", export_format="GLB",
                          use_selection=True, export_apply=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/nexarch-kit.blend")
print("KIT DONE:", [o.name for o in PIECES])
