"""Generate a small, tight Nexarch city plan: clear road network, buildings
packed along the roads, 9 landmark districts. Outputs
images/districts/city-plan-compact.json in the same schema nexarch-map.html
reads (gridN, streets, roads, buildings, districts)."""
import json

N = 28
C = N // 2                                   # center = (14,14)

# --- road polylines (tile coords col,row) ---
roads = [
    [[C, 3], [C, N - 4]],                    # N-S avenue
    [[3, C], [N - 4, C]],                    # E-W avenue
    [[7, 7], [N - 8, 7], [N - 8, N - 8], [7, N - 8], [7, 7]],   # ring
    [[C, C], [8, 8]], [[C, C], [N - 8, 8]],  # diagonals to NW / NE
    [[C, C], [N - 8, N - 8]], [[C, C], [8, N - 8]],             # SE / SW
]

# --- districts at compass nodes ---
districts = [
    ("THE CORE", [C, C]),       ("CHURCH", [C, 5]),
    ("FORGE", [C, N - 6]),      ("MARKET", [N - 6, C]),
    ("DEEP MINES", [5, C]),     ("FAMILY VAULT", [N - 8, 8]),
    ("ALCHEMY LABS", [8, 8]),   ("ARENA", [N - 8, N - 8]),
    ("DARK ALLEY", [8, N - 8]),
]
LANDMARK = {"THE CORE": "fountain_core", "CHURCH": "cathedral", "FORGE": "foundry",
            "MARKET": "kiosk", "DEEP MINES": "gate", "FAMILY VAULT": "vault",
            "ALCHEMY LABS": "tower_round", "ARENA": "arena", "DARK ALLEY": "house_ruin"}

# --- rasterize roads into a street grid ---
street = [[0] * N for _ in range(N)]


def stamp(c, r, w=0):
    for dc in range(-w, w + 1):
        for dr in range(-w, w + 1):
            x, y = c + dc, r + dr
            if 0 <= x < N and 0 <= y < N:
                street[y][x] = 1


def line(p0, p1, w):
    c0, r0 = p0
    c1, r1 = p1
    steps = max(abs(c1 - c0), abs(r1 - r0))
    for i in range(steps + 1):
        t = i / steps if steps else 0
        stamp(round(c0 + (c1 - c0) * t), round(r0 + (r1 - r0) * t), w)


for poly in roads:
    wide = 1 if poly in roads[:2] else 0       # avenues a bit wider
    for i in range(len(poly) - 1):
        line(poly[i], poly[i + 1], wide)

# --- place buildings ---
buildings = []
taken = [[False] * N for _ in range(N)]
HOUSES = ["house_small", "house_med", "house_tall", "house_L", "house_jetty"]
rng = 1234567


def rnd():
    global rng
    rng = (rng * 1103515245 + 12345) & 0x7fffffff
    return rng / 0x7fffffff


# landmarks first
for name, (c, r) in districts:
    buildings.append({"type": LANDMARK[name], "tile": [c, r], "rotDeg": 0, "scale": 1})
    for dc in range(-1, 2):
        for dr in range(-1, 2):
            if 0 <= c + dc < N and 0 <= r + dr < N:
                taken[r + dr][c + dc] = True

# houses packed along the roads (cells next to a street, not on it)
def near_street(c, r):
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1):
            x, y = c + dc, r + dr
            if 0 <= x < N and 0 <= y < N and street[y][x]:
                return True
    return False


for r in range(N):
    for c in range(N):
        if street[r][c] or taken[r][c] or not near_street(c, r):
            continue
        # spacing: skip if a building sits in the 4-neighbourhood (keeps a tight
        # but non-overlapping terrace)
        if any(taken[r + dr][c + dc] for dc, dr in [(1, 0), (-1, 0), (0, 1), (0, -1)]
               if 0 <= c + dc < N and 0 <= r + dr < N):
            continue
        if rnd() < 0.82:
            t = HOUSES[int(rnd() * len(HOUSES))]
            buildings.append({"type": t, "tile": [c, r], "rotDeg": 0, "scale": 1})
            taken[r][c] = True

plan = {
    "gridN": N,
    "streets": ["".join(str(street[r][c]) for c in range(N)) for r in range(N)],
    "roads": roads,
    "districts": [{"name": n, "tile": t} for n, t in districts],
    "buildings": buildings,
}
json.dump(plan, open("images/districts/city-plan-compact.json", "w"),
          separators=(",", ":"))
print(f"compact plan: {N}x{N}, {len(buildings)} buildings, "
      f"{sum(row.count(1) for row in street)} street cells")
