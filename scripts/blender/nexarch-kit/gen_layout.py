"""Generate nexarch-layout.json + nexarch-ground.png.

Coordinates are city-local: x = east, z = south, in world units.
City center (0,0) == world (10500, 9000) from world-coordinates.js.
Wall radius 300 == Nexarch radius in world-coordinates.js.
"""
import json
import math
import random

from PIL import Image, ImageDraw, ImageFilter

random.seed(2026)
OUT = "/tmp/citybuild"
R_WALL = 295.0
SIZE = 600.0          # city square spans [-300, 300]
GRID_N = 120          # walkability grid resolution (5 units / cell)

CYAN = (90, 240, 225)
MAGENTA = (215, 105, 255)

# ---------------------------------------------------------------- roads
def circle_pts(r, n=72):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)]


ROADS = [
    {"pts": [(0, -55), (0, -R_WALL)], "w": 16},       # N avenue
    {"pts": [(0, 55), (0, R_WALL)], "w": 16},         # S avenue
    {"pts": [(55, 0), (R_WALL, 0)], "w": 16},         # E avenue
    {"pts": [(-55, 0), (-R_WALL, 0)], "w": 16},       # W avenue
    {"pts": circle_pts(170), "w": 13},                # ring road
]
for ang in (45, 135, 225, 315):                       # diagonal alleys
    a = math.radians(ang)
    ROADS.append({"pts": [(55 * math.cos(a), 55 * math.sin(a)),
                          (262 * math.cos(a), 262 * math.sin(a))], "w": 9})
PLAZA_R = 55.0


def seg_dist(px, pz, ax, az, bx, bz):
    vx, vz = bx - ax, bz - az
    L2 = vx * vx + vz * vz
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * vx + (pz - az) * vz) / L2))
    return math.hypot(px - (ax + t * vx), pz - (az + t * vz))


def road_dist(x, z):
    best = 1e9
    for r in ROADS:
        p = r["pts"]
        for i in range(len(p) - 1):
            d = seg_dist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) - r["w"] / 2
            best = min(best, d)
    best = min(best, math.hypot(x, z) - PLAZA_R)
    return best  # <= 0 means on road/plaza


# ---------------------------------------------------------------- landmarks
# from world-coordinates.js, local = (wx - 10500, wy - 9000)
placements = []
labels = []
blockers = []   # (x, z, radius) keep-clear zones


def place(piece, x, z, rot=0.0, s=1.0):
    placements.append({"p": piece, "x": round(x, 2), "z": round(z, 2),
                       "r": round(rot, 4), "s": s})


def landmark(piece, x, z, rot, label, radius, energy=None):
    place(piece, x, z, rot)
    labels.append({"name": label, "x": x, "z": z})
    blockers.append((x, z, radius))


def face_center(x, z):
    """Rotation so the piece front (+z after export) points at the plaza."""
    return math.atan2(-x, -z)


landmark("fountain_core", 0, 0, 0, "THE CORE", 14)
landmark("cathedral", 0, -250, face_center(0, -250), "CHURCH", 28)
landmark("foundry", 0, 250, face_center(0, 250), "FORGE", 22)
landmark("arena", 150, 150, 0, "ARENA", 48)
landmark("tower_round", -150, -150, 0, "ALCHEMY LABS", 12)
landmark("vault", 150, -150, face_center(150, -150), "FAMILY VAULT", 12)
landmark("gate", -250, 0, math.radians(90), "DEEP MINES", 16)

# marketplace: stall cluster
labels.append({"name": "MARKET", "x": 200, "z": 0})
for i, (mx, mz) in enumerate([(186, -16), (214, -14), (188, 16), (212, 18), (200, -30)]):
    place("stall", mx, mz, random.uniform(0, 2 * math.pi))
    blockers.append((mx, mz, 7))

# dark alley: cramped tall houses
labels.append({"name": "DARK ALLEY", "x": -200, "z": 200})
for (hx, hz, hr) in [(-188, 186, 0.4), (-212, 196, -0.5), (-196, 218, 0.1),
                     (-222, 174, 0.9)]:
    place("house_tall", hx, hz, hr)
    blockers.append((hx, hz, 10))

# monolith memorial field by the cathedral plaza (style ref image 1)
for i in range(10):
    a = math.radians(random.uniform(0, 360))
    rr = random.uniform(24, 44)
    mx, mz = rr * math.cos(a), -185 + rr * math.sin(a) * 0.55
    if road_dist(mx, mz) < 3:
        continue
    place("monolith_c" if i % 2 else "monolith_m", mx, mz,
          random.uniform(0, 2 * math.pi))
    blockers.append((mx, mz, 3))
# a few more scattered monoliths around the plaza
for i in range(6):
    a = math.radians(i * 60 + 12)
    mx, mz = 64 * math.cos(a), 64 * math.sin(a)
    if road_dist(mx, mz) < 2.5:
        continue
    place("monolith_m" if i % 2 else "monolith_c", mx, mz, a)
    blockers.append((mx, mz, 3))


def blocked(x, z, rad):
    for (bx, bz, br) in blockers:
        if math.hypot(x - bx, z - bz) < br + rad:
            return True
    return False


# ---------------------------------------------------------------- housing fill
HOUSES = [("house_small", 9.5, 3.0), ("house_med", 13.0, 1.6),
          ("house_tall", 8.5, 1.4)]


def pick_house():
    total = sum(w for _, _, w in HOUSES)
    t = random.uniform(0, total)
    for name, rad, w in HOUSES:
        t -= w
        if t <= 0:
            return name, rad
    return HOUSES[0][:2]


for ring_r in (92, 122, 146, 196, 226, 256):
    n = int(2 * math.pi * ring_r / 34)
    for i in range(n):
        a = 2 * math.pi * i / n + random.uniform(-0.06, 0.06)
        rr = ring_r + random.uniform(-7, 7)
        x, z = rr * math.cos(a), rr * math.sin(a)
        name, rad = pick_house()
        if math.hypot(x, z) > R_WALL - rad - 8:
            continue
        if road_dist(x, z) < rad + 2.5 or blocked(x, z, rad):
            continue
        rot = face_center(x, z) + math.pi + random.uniform(-0.15, 0.15)
        # houses face the street they sit on, i.e. outward from center on
        # inner ring edges, inward on outer edges — simplest: face the
        # nearest road by sampling
        best = (1e9, rot)
        for cand in (face_center(x, z), face_center(x, z) + math.pi):
            dx, dz = -math.sin(cand), -math.cos(cand)
            d = road_dist(x + dx * (rad + 6), z + dz * (rad + 6))
            if d < best[0]:
                best = (d, cand)
        rot = best[1] + random.uniform(-0.12, 0.12)
        place(name, x, z, rot)
        blockers.append((x, z, rad))

# ---------------------------------------------------------------- wall + gates
GATE_ANGLES = {270: "N", 90: "S", 0: "E", 180: "W"}  # z south positive
n_seg = 56
for i in range(n_seg):
    a = 2 * math.pi * i / n_seg
    deg = round(math.degrees(a)) % 360
    x, z = R_WALL * math.cos(a), R_WALL * math.sin(a)
    near_gate = any(min(abs(deg - g), 360 - abs(deg - g)) < 7 for g in GATE_ANGLES)
    if near_gate:
        continue
    place("wall_seg", x, z, -a + math.pi / 2)  # long axis tangent to the wall circle
    if i % 7 == 3:
        place("wall_tower", x, z, 0)
for g in GATE_ANGLES:
    a = math.radians(g)
    x, z = R_WALL * math.cos(a), R_WALL * math.sin(a)
    place("gate", x, z, -a + math.pi / 2)

# ---------------------------------------------------------------- lamps
for r in ROADS[:4]:
    (x1, z1), (x2, z2) = r["pts"]
    L = math.hypot(x2 - x1, z2 - z1)
    for t in (0.25, 0.55, 0.85):
        for side in (-1, 1):
            nx, nz = -(z2 - z1) / L, (x2 - x1) / L
            lx = x1 + (x2 - x1) * t + nx * side * (r["w"] / 2 + 2)
            lz = z1 + (z2 - z1) * t + nz * side * (r["w"] / 2 + 2)
            if not blocked(lx, lz, 1):
                place("lamp", lx, lz, math.atan2(-nx * side, -nz * side))
for i in range(10):  # ring road lamps
    a = 2 * math.pi * i / 10 + 0.2
    lx, lz = 179 * math.cos(a), 179 * math.sin(a)
    if not blocked(lx, lz, 1) and road_dist(lx, lz) > -2:
        place("lamp", lx, lz, face_center(lx, lz))

# ---------------------------------------------------------------- walk grid
cell = SIZE / GRID_N
rows = []
for gz in range(GRID_N):
    row = ""
    for gx in range(GRID_N):
        x = -SIZE / 2 + (gx + 0.5) * cell
        z = -SIZE / 2 + (gz + 0.5) * cell
        ok = road_dist(x, z) <= 0 and math.hypot(x, z) < R_WALL - 4
        # gates: open a corridor through the wall
        for g in GATE_ANGLES:
            a = math.radians(g)
            gxp, gzp = R_WALL * math.cos(a), R_WALL * math.sin(a)
            if math.hypot(x - gxp, z - gzp) < 14 and road_dist(x, z) <= 4:
                ok = True
        if ok and blocked(x, z, 1.2):
            ok = False
        row += "1" if ok else "0"
    rows.append(row)

layout = {
    "world": {"centerX": 10500, "centerY": 9000, "radius": 300},
    "size": SIZE, "gridN": GRID_N, "grid": rows,
    "placements": placements, "labels": labels,
    "roads": [{"pts": r["pts"], "w": r["w"]} for r in ROADS],
    "plazaR": PLAZA_R,
}
with open(f"{OUT}/nexarch-layout.json", "w") as f:
    json.dump(layout, f)
print(f"layout: {len(placements)} placements, "
      f"{sum(r.count('1') for r in rows)} walkable cells")

# ---------------------------------------------------------------- ground texture
TEX = 2048
px = TEX / SIZE


def to_px(x, z):
    return ((x + SIZE / 2) * px, (z + SIZE / 2) * px)


img = Image.new("RGB", (TEX, TEX), (30, 34, 44))
d = ImageDraw.Draw(img)
# cobble field
for _ in range(26000):
    x, y = random.randrange(TEX), random.randrange(TEX)
    w, h = random.randint(6, 14), random.randint(5, 10)
    v = random.randint(-4, 5)
    d.rectangle((x, y, x + w, y + h), fill=(36 + v, 41 + v, 53 + v),
                outline=(20, 22, 30))
# roads: lighter slabs
road_layer = Image.new("L", (TEX, TEX), 0)
rd = ImageDraw.Draw(road_layer)
for r in ROADS:
    pts = [to_px(*p) for p in r["pts"]]
    rd.line(pts, fill=255, width=int(r["w"] * px))
cx, cz = to_px(0, 0)
rd.ellipse((cx - PLAZA_R * px, cz - PLAZA_R * px,
            cx + PLAZA_R * px, cz + PLAZA_R * px), fill=255)
slabs = Image.new("RGB", (TEX, TEX), (52, 58, 72))
sd = ImageDraw.Draw(slabs)
for _ in range(30000):
    x, y = random.randrange(TEX), random.randrange(TEX)
    w, h = random.randint(8, 18), random.randint(6, 12)
    v = random.randint(-4, 6)
    sd.rectangle((x, y, x + w, y + h), fill=(56 + v, 64 + v, 82 + v),
                 outline=(34, 38, 50))
img.paste(slabs, (0, 0), road_layer)

# neon circuit traces running along the streets (style ref image 2)
def trace_along(pts, color, n_branch=14):
    glow = tuple(int(c * 0.30) for c in color)
    pp = [to_px(*p) for p in pts]
    d.line(pp, fill=glow, width=14)
    d.line(pp, fill=color, width=4)
    # right-angle branch stubs
    for _ in range(n_branch):
        i = random.randrange(len(pts) - 1)
        t = random.random()
        bx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t
        bz = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
        path = [(bx, bz)]
        for _ in range(random.randint(1, 3)):
            axis = random.random() < 0.5
            step = random.choice([-1, 1]) * random.uniform(6, 18)
            bx, bz = (bx + step, bz) if axis else (bx, bz + step)
            path.append((bx, bz))
        ppp = [to_px(*p) for p in path]
        d.line(ppp, fill=glow, width=8)
        d.line(ppp, fill=color, width=3)
        ex, ey = ppp[-1]
        d.ellipse((ex - 4, ey - 4, ex + 4, ey + 4), outline=color, width=2)


for i, r in enumerate(ROADS):
    trace_along(r["pts"], CYAN if i % 2 == 0 else MAGENTA,
                n_branch=20 if len(r["pts"]) > 3 else 10)
# plaza glyph rings
for rr, col in ((48, CYAN), (38, MAGENTA), (26, CYAN)):
    d.ellipse((cx - rr * px, cz - rr * px, cx + rr * px, cz + rr * px),
              outline=tuple(int(c * 0.5) for c in col), width=5)
# puddles
for _ in range(140):
    x, y = random.randrange(TEX), random.randrange(TEX)
    w, h = random.randint(14, 60), random.randint(8, 26)
    d.ellipse((x, y, x + w, y + h), fill=(28, 42, 60))

img = img.filter(ImageFilter.GaussianBlur(0.8))
img.save(f"{OUT}/nexarch-ground.png")
print("ground texture done")
