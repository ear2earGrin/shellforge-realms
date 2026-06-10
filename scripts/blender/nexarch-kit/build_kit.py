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


def tex_mat(name, img, rough=0.85, emit=0.0):
    m, bsdf, tree = new_mat(name)
    t = tree.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(f"{OUT}/{img}")
    tree.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
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
    "stone": tex_mat("M_Stone", "stone.png"),
    "roof": tex_mat("M_Roof", "roof.png"),
    "timber": tex_mat("M_Timber", "timber.png"),
    "winC": tex_mat("M_WinCyan", "win_cyan.png", rough=0.4, emit=9.0),
    "winM": tex_mat("M_WinMagenta", "win_magenta.png", rough=0.4, emit=9.0),
    "winO": tex_mat("M_WinOrange", "win_orange.png", rough=0.4, emit=7.0),
    "panel": tex_mat("M_Panel", "panel.png", rough=0.3, emit=4.5),
    "metal": None,
    "glowC": glow_mat("M_GlowCyan", (0.35, 0.95, 0.88), 5.0),
    "glowM": glow_mat("M_GlowMagenta", (0.84, 0.41, 1.0), 5.0),
    "glowO": glow_mat("M_GlowOrange", (1.0, 0.62, 0.30), 4.0),
}
m_metal, bsdf, _ = new_mat("M_Metal")
bsdf.inputs["Base Color"].default_value = (0.05, 0.055, 0.07, 1)
bsdf.inputs["Metallic"].default_value = 0.9
bsdf.inputs["Roughness"].default_value = 0.4
M["metal"] = m_metal

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
def house_small():
    p = Piece("house_small")
    p.box("stone", 0, 0, 0, 14, 12, 8)
    p.box("timber", 0, 0, 4.2, 14.3, 12.3, 0.7)       # half-timber band
    p.prism("roof", 0, 0, 8, 15.4, 13.6, 5.5, ridge="x")
    windows_row(p, "winC", (-4, 4), -6.07, 4.0)
    p.glow_quad("winO", 0, -6.07, 0, 3.0, 4.6)          # door
    p.glow_quad("winM", 7.07, 0, 3.8, 2.2, 3.2, facing="+x")
    pitch = math.atan2(5.5, 6.8)
    p.roof_panel(0, -3.4, 10.85, 5.5, 4.2, pitch)
    return p.done()


def house_med():
    p = Piece("house_med")
    p.box("stone", 0, 0, 0, 20, 14, 10)
    p.box("timber", 0, 0, 5.0, 20.3, 14.3, 0.7)
    p.prism("roof", 0, 0, 10, 21.6, 15.8, 6.5, ridge="x")
    p.box("stone", 6.5, 2.0, 16.5, 2.0, 2.0, 3.5)       # chimney
    windows_row(p, "winC", (-7, -2.4, 2.4, 7), -7.07, 5.6)
    windows_row(p, "winM", (-3,), -7.07, 1.0, 2.0, 3.0)
    p.glow_quad("winO", 3.2, -7.07, 0, 3.2, 5.0)
    p.glow_quad("winC", 10.07, 0, 4.5, 2.4, 3.4, facing="+x")
    pitch = math.atan2(6.5, 7.9)
    p.roof_panel(-4.5, -3.9, 13.1, 6.0, 4.6, pitch)
    p.roof_panel(4.5, -3.9, 13.1, 6.0, 4.6, pitch)
    return p.done()


def house_tall():
    p = Piece("house_tall")
    p.box("stone", 0, 0, 0, 12, 12, 18)
    p.box("timber", 0, 0, 6.0, 12.3, 12.3, 0.7)
    p.box("timber", 0, 0, 12.0, 12.3, 12.3, 0.7)
    p.prism("roof", 0, 0, 18, 13.4, 13.6, 8, ridge="y")
    for z, mat in ((1.0, "winO"), (7.2, "winC"), (13.2, "winM")):
        windows_row(p, mat, (-3.2, 3.2), -6.07, z)
    p.glow_quad("winC", 6.07, 0, 8, 2.2, 3.2, facing="+x")
    p.glow_quad("winM", -6.07, 0, 8, 2.2, 3.2, facing="-x")
    pitch = math.atan2(8, 6.7)
    p.roof_panel(-3.0, -3.3, 21.8, 4.6, 4.0, pitch)
    return p.done()


def tower_round():
    p = Piece("tower_round")
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
        p.box("stone", x, y, 0, L, 4.5, 14, rz=tang)
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
    p.box("stone", 0, 0, 0, 30, 4, 10)
    for i in range(5):
        p.box("stone", -12 + i * 6, 0, 10, 3.2, 4.4, 2.2)
    p.glow_quad("glowC", 0, -2.07, 8.6, 26, 0.45)        # rampart light line
    return p.done()


def wall_tower():
    p = Piece("wall_tower")
    p.cylinder("stone", 0, 0, 0, 5.5, 15, seg=12)
    p.cylinder("stone", 0, 0, 14.5, 6.3, 1.3, seg=12)
    p.cone("roof", 0, 0, 15.8, 6.7, 7, seg=12)
    p.glow_quad("winM", 0, -5.55, 9.5, 1.6, 4.0)
    p.glow_quad("winC", 0, 5.55, 9.5, 1.6, 4.0, facing="+y")
    return p.done()


def gate():
    p = Piece("gate")
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
    p.box("stone", 0, 0, 0, 3.4, 2.2, 0.9)
    p.box("stone", 0, 0, 0.9, 2.6, 1.5, 6.4)
    p.box("stone", 0, 0, 7.3, 3.0, 1.9, 0.5)
    p.glow_quad(win, 0, -0.78, 1.3, 2.2, 5.6)
    p.glow_quad(win, 0, 0.78, 1.3, 2.2, 5.6, facing="+y")
    p.glow_quad(glow, 0, 0, 7.82, 1.2, 0.8)              # cap light
    return p.done()


def stall():
    p = Piece("stall")
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        p.box("timber", sx * 3.4, sy * 3.0, 0, 0.6, 0.6, 4.6)
    p.box("timber", 0, -2.6, 0, 7.4, 1.6, 2.6)           # counter
    p.roof_panel(0, 0.4, 5.6, 8.6, 8.2, math.radians(16))
    p.glow_quad("glowM", 0, -3.42, 3.0, 5.0, 0.5)        # neon counter strip
    return p.done()


def fountain_core():
    p = Piece("fountain_core")
    p.cylinder("stone", 0, 0, 0, 8, 1.3, seg=18)
    p.cylinder("glowC", 0, 0, 1.0, 7.0, 0.35, seg=18)    # data pool
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
    p.cylinder("metal", 0, 0, 0, 0.28, 5.8, seg=8)
    p.box("metal", 0, -0.7, 5.6, 0.18, 1.6, 0.18)
    p.box("metal", 0, -1.4, 4.6, 0.7, 0.7, 1.0)
    p.glow_quad("glowO", 0, -1.76, 4.7, 0.55, 0.8)
    p.glow_quad("glowO", 0, -1.04, 4.7, 0.55, 0.8, facing="+y")
    return p.done()


PIECES = [house_small(), house_med(), house_tall(), tower_round(), cathedral(),
          arena(), wall_seg(), wall_tower(), gate(),
          monolith("monolith_c", "winC", "glowC"),
          monolith("monolith_m", "winM", "glowM"),
          stall(), fountain_core(), vault(), foundry(), lamp()]

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action="DESELECT")
for o in PIECES:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=f"{OUT}/nexarch-kit.glb", export_format="GLB",
                          use_selection=True, export_apply=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/nexarch-kit.blend")
print("KIT DONE:", [o.name for o in PIECES])
