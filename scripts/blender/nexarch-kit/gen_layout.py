"""Generate nexarch-layout.json + nexarch-ground.png  (v2: organic + terrain).

City-local coords: x = east, z = south, in world units.
(0,0) == world (10500, 9000); wall ~ Nexarch radius 300 from world-coordinates.js,
but the wall line wobbles organically between ~240 and ~365.
Terrain: heightfield over a 900x900 span; roads are flattened, districts sit on
hills/hollows (church hill, sunken dark alley, west lowlands).
"""
import json
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

random.seed(2027)
OUT = "/tmp/citybuild"
SPAN = 900.0            # ground/heights span
GRID_N = 144            # walk grid (6.25 u/cell)
HN = 96                 # heightfield resolution
PLAZA_R = 52.0

CYAN = (90, 240, 225)
MAGENTA = (215, 105, 255)

# ---------------------------------------------------------------- wall shape
BUMPS = []  # (theta, amp, width) corrective bumps


def wall_R(theta):
    r = (290 + 42 * math.sin(2 * theta + 1.15) + 26 * math.sin(3 * theta + 4.0)
         + 14 * math.sin(5 * theta + 2.3))
    for (ta, amp, wd) in BUMPS:
        d = math.atan2(math.sin(theta - ta), math.cos(theta - ta))
        r += amp * math.exp(-(d / wd) ** 2)
    return r


ANCHORS = [(0, -250, 25), (0, 250, 28), (150, 150, 52), (-150, -150, 18),
           (150, -150, 18), (-250, 0, 20), (200, 0, 30), (-200, 200, 26)]
for (ax, az, need) in ANCHORS:           # make sure every district fits inside
    th = math.atan2(az, ax)
    rr = math.hypot(ax, az)
    if wall_R(th) < rr + need:
        BUMPS.append((th, rr + need + 14 - wall_R(th), 0.5))

GATE_THETA = {"N": -math.pi / 2, "S": math.pi / 2, "E": 0.0, "W": math.pi}

# ---------------------------------------------------------------- roads
def wobble_line(p0, p1, segs=9, amp=9, seed=0):
    rnd = random.Random(seed)
    x0, z0 = p0
    x1, z1 = p1
    L = math.hypot(x1 - x0, z1 - z0)
    nx, nz = -(z1 - z0) / L, (x1 - x0) / L
    ph = rnd.uniform(0, 6.28)
    pts = []
    for i in range(segs + 1):
        t = i / segs
        off = amp * math.sin(t * math.pi * rnd.uniform(1.4, 2.4) + ph) \
            * math.sin(t * math.pi)        # pinned at both ends
        pts.append((x0 + (x1 - x0) * t + nx * off,
                    z0 + (z1 - z0) * t + nz * off))
    return pts


ROADS = []
GATES = []
for i, (name, th) in enumerate(GATE_THETA.items()):
    gr = wall_R(th)
    p0 = (PLAZA_R * 0.9 * math.cos(th), PLAZA_R * 0.9 * math.sin(th))
    p1 = (gr * math.cos(th), gr * math.sin(th))
    pts = wobble_line(p0, p1, amp=13, seed=10 + i)
    ROADS.append({"pts": pts, "w": 16})
    dx = pts[-1][0] - pts[-2][0]
    dz = pts[-1][1] - pts[-2][1]
    GATES.append({"x": p1[0], "z": p1[1], "rot": math.atan2(dx, dz)})

ring_pts = []
for i in range(90 + 1):
    th = 2 * math.pi * i / 90
    rr = 0.56 * wall_R(th) + 13 * math.sin(2 * th + 0.7) + 7 * math.sin(4 * th + 2.6)
    ring_pts.append((rr * math.cos(th), rr * math.sin(th)))
ROADS.append({"pts": ring_pts, "w": 12})

for j, ang in enumerate((30, 75, 140, 210, 255, 320)):     # crooked alleys
    th = math.radians(ang)
    r0 = 0.56 * wall_R(th)
    r1 = 0.90 * wall_R(th)
    ROADS.append({"pts": wobble_line((r0 * math.cos(th), r0 * math.sin(th)),
                                     (r1 * math.cos(th), r1 * math.sin(th)),
                                     segs=6, amp=10, seed=30 + j), "w": 8})
for j, ang in enumerate((45, 135, 225, 315)):              # plaza spokes
    th = math.radians(ang)
    r1 = 0.58 * wall_R(th)
    ROADS.append({"pts": wobble_line((PLAZA_R * 0.9 * math.cos(th),
                                      PLAZA_R * 0.9 * math.sin(th)),
                                     (r1 * math.cos(th), r1 * math.sin(th)),
                                     segs=5, amp=7, seed=50 + j), "w": 9})

SQUARES = [(200, 0, 36), (0, -228, 34)]   # market square, church plaza (x,z,r)


def seg_dist(px, pz, ax, az, bx, bz):
    vx, vz = bx - ax, bz - az
    L2 = vx * vx + vz * vz
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * vx + (pz - az) * vz) / L2))
    return math.hypot(px - (ax + t * vx), pz - (az + t * vz))


def road_dist(x, z):
    best = math.hypot(x, z) - PLAZA_R
    for r in ROADS:
        p = r["pts"]
        for i in range(len(p) - 1):
            d = seg_dist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) - r["w"] / 2
            best = min(best, d)
    for (sx, sz, sr) in SQUARES:
        best = min(best, math.hypot(x - sx, z - sz) - sr)
    return best


# ---------------------------------------------------------------- heightfield
def fall(x, z, cx, cz, rad):
    d = math.hypot(x - cx, z - cz) / rad
    return 0.0 if d >= 1 else (1 - d * d) ** 2


def base_height(x, z):
    h = (2.6 * math.sin(x * 0.011 + 0.7) * math.sin(z * 0.009 + 2.1)
         + 1.7 * math.sin(x * 0.023 + 3.0) * math.sin(z * 0.019 + 1.0))
    h += 14.0 * fall(x, z, 0, -245, 110)        # church hill
    h += 4.0 * fall(x, z, 150, 150, 90)         # arena terrace
    h -= 9.0 * fall(x, z, -210, 70, 150)        # west lowlands
    h -= 6.5 * fall(x, z, -195, 200, 100)       # sunken dark alley
    h += 2.0 * fall(x, z, 200, 0, 80)           # market rise
    h *= 1.0 - 0.92 * fall(x, z, 0, 0, 75)      # flat central plaza
    return h


HC = SPAN / HN
H = np.zeros((HN, HN), dtype=np.float32)
for gz in range(HN):
    for gx in range(HN):
        x = -SPAN / 2 + (gx + 0.5) * HC
        z = -SPAN / 2 + (gz + 0.5) * HC
        H[gz, gx] = base_height(x, z)

# flatten roads: pull cells near a road toward the (smoothed) centerline height
samples = []   # (x, z, h_line, width)
for r in ROADS:
    p = r["pts"]
    hs = [base_height(px, pz) for (px, pz) in p]
    for _ in range(3):  # smooth along the line
        hs = [hs[0]] + [(hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4
                        for i in range(1, len(hs) - 1)] + [hs[-1]]
    for i in range(len(p) - 1):
        L = math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1])
        n = max(2, int(L / 5))
        for k in range(n):
            t = k / n
            samples.append((p[i][0] + (p[i + 1][0] - p[i][0]) * t,
                            p[i][1] + (p[i + 1][1] - p[i][1]) * t,
                            hs[i] + (hs[i + 1] - hs[i]) * t, r["w"]))
for (sx, sz, sr) in SQUARES:
    samples.append((sx, sz, base_height(sx, sz), sr * 2))

for (sx, sz, sh, w) in samples:
    g0x = max(0, int((sx + SPAN / 2 - w - 12) / HC))
    g1x = min(HN - 1, int((sx + SPAN / 2 + w + 12) / HC))
    g0z = max(0, int((sz + SPAN / 2 - w - 12) / HC))
    g1z = min(HN - 1, int((sz + SPAN / 2 + w + 12) / HC))
    for gz in range(g0z, g1z + 1):
        for gx in range(g0x, g1x + 1):
            x = -SPAN / 2 + (gx + 0.5) * HC
            z = -SPAN / 2 + (gz + 0.5) * HC
            d = math.hypot(x - sx, z - sz)
            t = max(0.0, 1.0 - d / (w / 2 + 12))
            if t > 0:
                H[gz, gx] += (sh - H[gz, gx]) * min(1.0, t * 1.6) * 0.9


def height_at(x, z):
    fx = (x + SPAN / 2) / HC - 0.5
    fz = (z + SPAN / 2) / HC - 0.5
    x0 = max(0, min(HN - 2, int(fx)))
    z0 = max(0, min(HN - 2, int(fz)))
    tx = max(0.0, min(1.0, fx - x0))
    tz = max(0.0, min(1.0, fz - z0))
    return float(H[z0, x0] * (1 - tx) * (1 - tz) + H[z0, x0 + 1] * tx * (1 - tz)
                 + H[z0 + 1, x0] * (1 - tx) * tz + H[z0 + 1, x0 + 1] * tx * tz)


# ---------------------------------------------------------------- placements
placements = []
labels = []
blockers = []


def place(piece, x, z, rot=0.0, s=1.0, sink=0.0):
    placements.append({"p": piece, "x": round(x, 2), "z": round(z, 2),
                       "y": round(height_at(x, z) - sink, 2),
                       "r": round(rot, 4), "s": s})


def face(x, z, tx, tz):
    return math.atan2(tx - x, tz - z)


def landmark(piece, x, z, rot, label, radius):
    place(piece, x, z, rot)
    labels.append({"name": label, "x": x, "z": z})
    blockers.append((x, z, radius))


landmark("fountain_core", 0, 0, 0, "THE CORE", 14)
landmark("cathedral", 0, -250, face(0, -250, 0, 0), "CHURCH", 28)
landmark("foundry", 0, 250, face(0, 250, 0, 0), "FORGE", 22)
landmark("arena", 150, 150, 0, "ARENA", 50)
landmark("tower_round", -150, -150, 0, "ALCHEMY LABS", 12)
landmark("vault", 150, -150, face(150, -150, 0, 0), "FAMILY VAULT", 12)
landmark("gate", -250, 0, math.radians(90), "DEEP MINES", 16)

labels.append({"name": "MARKET", "x": 200, "z": 0})
for (mx, mz) in [(184, -18), (216, -14), (186, 16), (214, 18), (200, -32), (228, 2)]:
    place("stall", mx, mz, random.uniform(0, 2 * math.pi))
    blockers.append((mx, mz, 6.5))

labels.append({"name": "DARK ALLEY", "x": -200, "z": 200})
for (hx, hz, hr) in [(-186, 184, 0.4), (-211, 196, -0.5), (-196, 219, 0.1),
                     (-223, 176, 0.9), (-176, 206, -0.9)]:
    place("house_tall", hx, hz, hr, s=random.uniform(0.9, 1.05), sink=1.0)
    blockers.append((hx, hz, 9.5))

for i in range(10):       # monolith memorial on the church hill
    a = math.radians(random.uniform(0, 360))
    rr = random.uniform(22, 42)
    mx, mz = rr * math.cos(a), -198 + rr * math.sin(a) * 0.5
    if road_dist(mx, mz) < 2.5:
        continue
    place("monolith_c" if i % 2 else "monolith_m", mx, mz,
          random.uniform(0, 2 * math.pi))
    blockers.append((mx, mz, 3))
for i in range(6):
    a = math.radians(i * 60 + 12)
    mx, mz = 62 * math.cos(a), 62 * math.sin(a)
    if road_dist(mx, mz) < 2.5:
        continue
    place("monolith_m" if i % 2 else "monolith_c", mx, mz, a)
    blockers.append((mx, mz, 3))


def blocked(x, z, rad, factor=1.0):
    for (bx, bz, br) in blockers:
        if math.hypot(x - bx, z - bz) < (br + rad) * factor:
            return True
    return False


def inside_wall(x, z, margin):
    th = math.atan2(z, x)
    return math.hypot(x, z) < wall_R(th) - margin


HOUSES = [("house_small", 9.0, 3.0), ("house_med", 12.0, 1.7),
          ("house_tall", 8.2, 1.5), ("house_jetty", 11.5, 1.3)]


def pick_house():
    t = random.uniform(0, sum(w for *_, w in HOUSES))
    for name, rad, w in HOUSES:
        t -= w
        if t <= 0:
            return name, rad
    return HOUSES[0][:2]


def try_house(x, z, rot, rad, name, tight=0.94):
    if not inside_wall(x, z, rad + 9):
        return False
    if road_dist(x, z) < rad * 0.92 or blocked(x, z, rad, tight):
        return False
    slope_ok = abs(height_at(x + rad, z) - height_at(x - rad, z)) < 6.5 and \
               abs(height_at(x, z + rad) - height_at(x, z - rad)) < 6.5
    if not slope_ok:
        return False
    place(name, x, z, rot, s=round(random.uniform(0.88, 1.12), 3), sink=1.2)
    blockers.append((x, z, rad))
    street_houses.append((x, z, rot, rad))
    return True


street_houses = []
# A) street-front rows: houses hugging every road on both sides
n_row = 0
for r in ROADS:
    p = r["pts"]
    acc = 0.0
    for i in range(len(p) - 1):
        segL = math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1])
        ux, uz = (p[i + 1][0] - p[i][0]) / segL, (p[i + 1][1] - p[i][1]) / segL
        nx, nz = -uz, ux
        t = -acc
        while t < segL:
            step = random.uniform(14, 20)
            cx_, cz_ = p[i][0] + ux * max(t, 0), p[i][1] + uz * max(t, 0)
            for side in (-1, 1):
                name, rad = pick_house()
                off = r["w"] / 2 + rad * 0.95 + random.uniform(0.5, 3.0)
                hx, hz = cx_ + nx * side * off, cz_ + nz * side * off
                rot = face(hx, hz, cx_, cz_) + random.uniform(-0.1, 0.1)
                if try_house(hx, hz, rot, rad, name):
                    n_row += 1
            t += step
        acc = (segL - t) % 14

# B) block infill behind the street rows
n_fill = 0
for _ in range(2600):
    th = random.uniform(0, 2 * math.pi)
    rr = math.sqrt(random.uniform(0.04, 1.0)) * wall_R(th)
    x, z = rr * math.cos(th), rr * math.sin(th)
    name, rad = pick_house()
    rot = face(x, z, 0, 0) + math.pi + random.uniform(-0.4, 0.4)
    if try_house(x, z, rot, rad, name, tight=0.90):
        n_fill += 1

# ---------------------------------------------------------------- clutter
SMALL = [("crate", 1.2, 3), ("barrel", 1.0, 3), ("sacks", 1.3, 2), ("rubble", 2.0, 1)]


def pick_small():
    t = random.uniform(0, sum(w for *_, w in SMALL))
    for name, rad, w in SMALL:
        t -= w
        if t <= 0:
            return name, rad
    return SMALL[0][:2]


n_clutter = 0
# street-edge clutter: barrels/crates against the houses
for r in ROADS:
    p = r["pts"]
    for i in range(len(p) - 1):
        segL = math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1])
        ux, uz = (p[i + 1][0] - p[i][0]) / segL, (p[i + 1][1] - p[i][1]) / segL
        nx, nz = -uz, ux
        t = 0.0
        while t < segL:
            t += random.uniform(18, 34)
            if random.random() < 0.62:
                name, rad = pick_small()
                side = random.choice((-1, 1))
                off = r["w"] / 2 + rad + random.uniform(0.2, 1.4)
                cx_, cz_ = p[i][0] + ux * t, p[i][1] + uz * t
                x, z = cx_ + nx * side * off, cz_ + nz * side * off
                if inside_wall(x, z, 6) and road_dist(x, z) > 0.2 \
                        and not blocked(x, z, rad, 0.9):
                    place(name, x, z, random.uniform(0, 6.28), sink=0.3)
                    blockers.append((x, z, rad))
                    n_clutter += 1

# neon banner poles along the four avenues
for ri, r in enumerate(ROADS[:4]):
    p = r["pts"]
    for k, t in enumerate((0.18, 0.42, 0.66, 0.9)):
        i = min(int(t * (len(p) - 1)), len(p) - 2)
        x0, z0 = p[i]
        x1, z1 = p[i + 1]
        L = math.hypot(x1 - x0, z1 - z0) or 1
        nx, nz = -(z1 - z0) / L, (x1 - x0) / L
        side = -1 if k % 2 else 1
        bx = x0 + nx * side * (r["w"] / 2 + 1.5)
        bz = z0 + nz * side * (r["w"] / 2 + 1.5)
        if not blocked(bx, bz, 0.8, 0.9):
            place("banner_pole" if (ri + k) % 2 else "banner_pole_c",
                  bx, bz, face(bx, bz, x0, z0), sink=0.5)
            blockers.append((bx, bz, 0.8))
            n_clutter += 1

# market dressing: carts, carpets, crate stacks, braziers
for (mx, mz) in [(192, -2), (208, 6), (196, 24), (222, -10)]:
    if not blocked(mx, mz, 2.0, 0.85):
        place("cart", mx, mz, random.uniform(0, 6.28), sink=0.3)
        blockers.append((mx, mz, 2.0))
for (mx, mz, cc) in [(190, 8, 0), (210, -8, 1), (204, 16, 0), (216, 12, 1)]:
    if not blocked(mx, mz, 1.8, 0.8):
        place("carpet" if cc else "carpet_c", mx, mz, random.uniform(0, 6.28))
for (mx, mz) in [(184, -26), (226, 14), (198, 36)]:
    if not blocked(mx, mz, 1.0, 0.85):
        place("brazier", mx, mz, 0, sink=0.2)
        blockers.append((mx, mz, 1.0))
for _ in range(14):
    mx, mz = 200 + random.uniform(-30, 30), random.uniform(-30, 34)
    name, rad = pick_small()
    if not blocked(mx, mz, rad, 0.85):
        place(name, mx, mz, random.uniform(0, 6.28), sink=0.3)
        blockers.append((mx, mz, rad))
        n_clutter += 1

# holo-signs on shopfront houses near streets
random.shuffle(street_houses)
for (hx, hz, hrot, hrad) in street_houses[:64]:
    fx = hx + math.sin(hrot) * (hrad * 0.7) + math.cos(hrot) * 2.5
    fz = hz + math.cos(hrot) * (hrad * 0.7) - math.sin(hrot) * 2.5
    place("holo_sign", fx, fz, hrot + math.pi / 2, sink=0.0)
    n_clutter += 1

# server racks humming beside houses
for (hx, hz, hrot, hrad) in street_houses[64:116]:
    sx_ = hx - math.sin(hrot + 0.9) * (hrad * 0.85)
    sz_ = hz - math.cos(hrot + 0.9) * (hrad * 0.85)
    if road_dist(sx_, sz_) > 0.3 and not blocked(sx_, sz_, 1.2, 0.85):
        place("server_rack", sx_, sz_, hrot + random.uniform(-0.4, 0.4), sink=0.2)
        blockers.append((sx_, sz_, 1.2))
        n_clutter += 1

# cables strung across the narrow alleys
for r in ROADS[5:11]:
    p = r["pts"]
    for i in range(1, len(p) - 1, 2):
        if random.random() < 0.6:
            x0, z0 = p[i]
            x1, z1 = p[i + 1]
            L = math.hypot(x1 - x0, z1 - z0) or 1
            tang = math.atan2((x1 - x0) / L, (z1 - z0) / L)
            place("cable_span", x0, z0, tang + math.pi / 2, sink=0.0)
            n_clutter += 1

# rubble + extra cables in the dark alley quarter
for _ in range(8):
    x, z = -200 + random.uniform(-34, 34), 198 + random.uniform(-30, 30)
    if road_dist(x, z) > 1 and not blocked(x, z, 2.0, 0.8):
        place("rubble", x, z, random.uniform(0, 6.28), sink=0.4)
        blockers.append((x, z, 2.0))
        n_clutter += 1

# courtyard bushes
for _ in range(160):
    th = random.uniform(0, 2 * math.pi)
    rr = math.sqrt(random.random()) * wall_R(th) * 0.94
    x, z = rr * math.cos(th), rr * math.sin(th)
    if road_dist(x, z) > 2.5 and not blocked(x, z, 1.2, 0.75):
        place("bush", x, z, random.uniform(0, 6.28),
              s=round(random.uniform(0.7, 1.5), 2), sink=0.3)
        blockers.append((x, z, 1.2))
        n_clutter += 1

# braziers flanking each gate (placed after GATES exist, see below)
print(f"clutter: {n_clutter} props")

# ---------------------------------------------------------------- wall + gates
arc, th = 0.0, 0.0
seg_i = 0
prev = (wall_R(0), 0.0)
while th < 2 * math.pi:
    th += 0.003
    r = wall_R(th)
    x, z = r * math.cos(th), r * math.sin(th)
    px_, pz_ = prev[0] * math.cos(prev[1]), prev[0] * math.sin(prev[1])
    arc += math.hypot(x - px_, z - pz_)
    prev = (r, th)
    if arc >= 29.0:
        arc = 0.0
        near_gate = any(math.hypot(x - g["x"], z - g["z"]) < 24 for g in GATES)
        if near_gate:
            continue
        d = 0.02
        tx = (wall_R(th + d) * math.cos(th + d) - x)
        tz = (wall_R(th + d) * math.sin(th + d) - z)
        rot = math.atan2(-tz, tx) + math.pi / 2 + math.pi / 2  # long axis = tangent
        place("wall_seg", x, z, math.atan2(tx, tz) + math.pi / 2, sink=2.0)
        seg_i += 1
        if seg_i % 7 == 3:
            place("wall_tower", x, z, 0, sink=2.0)
for g in GATES:
    place("gate", g["x"], g["z"], g["rot"], sink=2.0)
    for side in (-1, 1):
        bx = g["x"] + math.cos(g["rot"]) * side * 8 - math.sin(g["rot"]) * 10
        bz = g["z"] - math.sin(g["rot"]) * side * 8 - math.cos(g["rot"]) * 10
        place("brazier", bx, bz, 0, sink=0.2)

# ---------------------------------------------------------------- lamps
for r in ROADS[:4]:
    p = r["pts"]
    for t in (0.3, 0.6, 0.88):
        i = int(t * (len(p) - 1))
        x0, z0 = p[i]
        x1, z1 = p[i + 1] if i + 1 < len(p) else p[i]
        L = math.hypot(x1 - x0, z1 - z0) or 1
        nx, nz = -(z1 - z0) / L, (x1 - x0) / L
        for side in (-1, 1):
            lx, lz = x0 + nx * side * (r["w"] / 2 + 2), z0 + nz * side * (r["w"] / 2 + 2)
            if not blocked(lx, lz, 1):
                place("lamp", lx, lz, face(lx, lz, x0, z0), sink=0.5)
for i in range(12):
    a = 2 * math.pi * i / 12 + 0.2
    rr = 0.56 * wall_R(a) + 8
    lx, lz = rr * math.cos(a), rr * math.sin(a)
    if not blocked(lx, lz, 1) and road_dist(lx, lz) > -3:
        place("lamp", lx, lz, face(lx, lz, 0, 0), sink=0.5)

# ---------------------------------------------------------------- trees
trees = []
for _ in range(340):
    th = random.uniform(0, 2 * math.pi)
    rw = wall_R(th)
    rr = rw + 14 + (random.random() ** 1.6) * (430 - rw)
    x, z = rr * math.cos(th), rr * math.sin(th)
    if abs(x) > SPAN / 2 - 10 or abs(z) > SPAN / 2 - 10:
        continue
    trees.append([round(x, 1), round(z, 1), round(height_at(x, z), 2),
                  round(random.uniform(9, 19), 1)])
for _ in range(60):   # courtyard trees inside
    th = random.uniform(0, 2 * math.pi)
    rr = math.sqrt(random.random()) * wall_R(th) * 0.92
    x, z = rr * math.cos(th), rr * math.sin(th)
    if road_dist(x, z) > 6 and not blocked(x, z, 3):
        trees.append([round(x, 1), round(z, 1), round(height_at(x, z), 2),
                      round(random.uniform(6, 11), 1)])

# ---------------------------------------------------------------- walk grid
cell = SPAN / GRID_N
rows = []
for gz in range(GRID_N):
    row = ""
    for gx in range(GRID_N):
        x = -SPAN / 2 + (gx + 0.5) * cell
        z = -SPAN / 2 + (gz + 0.5) * cell
        ok = road_dist(x, z) <= 0 and inside_wall(x, z, 4)
        for g in GATES:
            if math.hypot(x - g["x"], z - g["z"]) < 15 and road_dist(x, z) <= 4:
                ok = True
        if ok and blocked(x, z, 1.0):
            ok = False
        row += "1" if ok else "0"
    rows.append(row)

layout = {
    "world": {"centerX": 10500, "centerY": 9000, "radius": 300},
    "span": SPAN, "gridN": GRID_N, "grid": rows,
    "heightsN": HN, "heights": [round(float(v), 2) for v in H.flatten()],
    "placements": placements, "labels": labels, "trees": trees,
    "plazaR": PLAZA_R,
}
with open(f"{OUT}/nexarch-layout.json", "w") as f:
    json.dump(layout, f, separators=(",", ":"))
print(f"layout: {len(placements)} placements ({n_row} street, {n_fill} infill), "
      f"{sum(r.count('1') for r in rows)} walkable cells")

# ---------------------------------------------------------------- ground texture
TEX = 3072
px = TEX / SPAN


def to_px(x, z):
    return ((x + SPAN / 2) * px, (z + SPAN / 2) * px)


img = Image.new("RGB", (TEX, TEX), (24, 28, 34))
d = ImageDraw.Draw(img)
# forest floor / earth outside, mossy patches
for _ in range(36000):
    x, y = random.randrange(TEX), random.randrange(TEX)
    w, h = random.randint(8, 26), random.randint(6, 18)
    g = random.randint(-6, 6)
    col = random.choice([(26 + g, 32 + g, 36 + g), (24 + g, 34 + g, 30 + g),
                         (30 + g, 30 + g, 38 + g)])
    d.ellipse((x, y, x + w, y + h), fill=col)

# inside the walls: dirt + scattered stones
city_mask = Image.new("L", (TEX, TEX), 0)
cmd = ImageDraw.Draw(city_mask)
poly = []
for i in range(160):
    t = 2 * math.pi * i / 160
    rr = wall_R(t)
    poly.append(to_px(rr * math.cos(t), rr * math.sin(t)))
cmd.polygon(poly, fill=255)
dirt = Image.new("RGB", (TEX, TEX), (37, 38, 46))
dd = ImageDraw.Draw(dirt)
for _ in range(42000):
    x, y = random.randrange(TEX), random.randrange(TEX)
    w, h = random.randint(6, 16), random.randint(5, 12)
    g = random.randint(-7, 7)
    dd.ellipse((x, y, x + w, y + h), fill=(40 + g, 42 + g, 52 + g))
img.paste(dirt, (0, 0), city_mask)

# roads: bold cobblestones with dark joints
road_mask = Image.new("L", (TEX, TEX), 0)
rd = ImageDraw.Draw(road_mask)
for r in ROADS:
    rd.line([to_px(*p) for p in r["pts"]], fill=255, width=int(r["w"] * px),
            joint="curve")
cx0, cz0 = to_px(0, 0)
rd.ellipse((cx0 - PLAZA_R * px, cz0 - PLAZA_R * px,
            cx0 + PLAZA_R * px, cz0 + PLAZA_R * px), fill=255)
for (sx, sz, sr) in SQUARES:
    sx0, sz0 = to_px(sx, sz)
    rd.ellipse((sx0 - sr * px, sz0 - sr * px, sx0 + sr * px, sz0 + sr * px), fill=255)
cobbles = Image.new("RGB", (TEX, TEX), (22, 25, 33))
cd = ImageDraw.Draw(cobbles)
sw, sh, row = 17, 13, 0
y = 0
while y < TEX + sh:
    x = -(sw // 2) if row % 2 else 0
    while x < TEX:
        g = random.randint(-9, 11)
        cd.ellipse((x + 1, y + 1, x + sw - 1, y + sh - 1),
                   fill=(64 + g, 71 + g, 88 + g), outline=(26, 29, 38))
        x += sw
    y += sh
    row += 1
img.paste(cobbles, (0, 0), road_mask)

# neon circuit traces along streets
def trace_along(pts, color, n_branch=14):
    glow = tuple(int(c * 0.30) for c in color)
    pp = [to_px(*p) for p in pts]
    d.line(pp, fill=glow, width=16, joint="curve")
    d.line(pp, fill=color, width=4, joint="curve")
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
                n_branch=22 if len(r["pts"]) > 12 else 8)
for rr, col in ((46, CYAN), (36, MAGENTA), (25, CYAN)):
    d.ellipse((cx0 - rr * px, cz0 - rr * px, cx0 + rr * px, cz0 + rr * px),
              outline=tuple(int(c * 0.5) for c in col), width=5)
# puddles
for _ in range(220):
    x, y = random.randrange(TEX), random.randrange(TEX)
    w, h = random.randint(14, 56), random.randint(8, 24)
    d.ellipse((x, y, x + w, y + h), fill=(30, 44, 62))

# bake height shading: high ground brighter, hollows darker
shade = np.clip(1.0 + (H * 0.020) - 0.04, 0.72, 1.30)
shade_img = Image.fromarray((shade * 127).astype(np.uint8)).resize((TEX, TEX),
                                                                   Image.BILINEAR)
arr = np.asarray(img).astype(np.float32)
arr *= (np.asarray(shade_img).astype(np.float32) / 127.0)[..., None]
img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
img = img.filter(ImageFilter.GaussianBlur(0.6))
img.save(f"{OUT}/nexarch-ground.png")
print("ground texture done")
