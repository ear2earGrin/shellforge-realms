"""Export the real Nexarch layout as an engine-agnostic city plan for a
sprite-compositing isometric engine: a 144x144 tile grid where every cell is
either street or buildable, plus every building placed by type at tile coords,
plus district centers. Lets any engine stamp building sprites onto the TRUE
Nexarch street plan with walkable roads, instead of a random grid.

Reads images/3d/nexarch-layout.json (committed). Writes
images/districts/city-plan.json + a short README."""
import json

L = json.load(open("images/3d/nexarch-layout.json"))
N = L["gridN"]                       # 144
SPAN = L["span"]                     # 900 world units
CELL = SPAN / N                      # 6.25 u/cell
grid = L["grid"]                     # rows of '0'/'1', '1' = walkable street


def to_tile(x, z):
    return [round((x + SPAN / 2) / CELL), round((z + SPAN / 2) / CELL)]


# street mask: 1 = walkable street/plaza, 0 = block/building land
streets = ["".join("1" if grid[r][c] == "1" else "0" for c in range(N))
           for r in range(N)]

# buildings: keep structures + props, drop the pure walk markers
buildings = []
for p in L["placements"]:
    tx, ty = to_tile(p["x"], p["z"])
    buildings.append({
        "type": p["p"],
        "tile": [tx, ty],                       # column,row on the NxN grid
        "rotDeg": round(p.get("r", 0) * 57.2958, 1),
        "scale": p.get("s", 1.0),
        # mirror hint: engines can flip ~half the houses to fight repetition
        "world": [p["x"], p["z"]],
    })

districts = [{"name": l["name"], "tile": to_tile(l["x"], l["z"]),
              "world": [l["x"], l["z"]]} for l in L["labels"]]

plan = {
    "gridN": N,
    "cellWorldUnits": CELL,
    "note": "Cell [col,row]; col grows +x (east), row grows +z (south). "
            "streets[row][col]=='1' is walkable cobblestone; '0' is building "
            "land. Place each building sprite by its foot anchor at its tile. "
            "Districts mark the 9 landmark centers. Mirror/tint repeated house "
            "types per-instance to reduce visible repetition.",
    "streets": streets,
    "districts": districts,
    "buildingCounts": {},
    "buildings": buildings,
}
for b in buildings:
    plan["buildingCounts"][b["type"]] = plan["buildingCounts"].get(b["type"], 0) + 1

json.dump(plan, open("images/districts/city-plan.json", "w"), separators=(",", ":"))

readme = """# Nexarch city plan (engine-agnostic)

`city-plan.json` is the real Nexarch layout for a sprite-compositing
isometric engine. Use it to place building sprites on the true street plan
with walkable roads, instead of a random grid.

- **grid**: {N}x{N} tiles, each {cell:.2f} world units.
- **streets[row][col]**: `'1'` = walkable cobblestone street/plaza,
  `'0'` = building land. Render a cobblestone ground tile on every cell;
  use a lighter "road" variant where `streets=='1'`.
- **buildings[]**: `{{type, tile:[col,row], rotDeg, scale, world}}`.
  Stamp the matching sprite by its foot anchor at `tile`. Depth-sort by
  `row+col` (or screen-Y) so nearer buildings overlap farther ones.
- **districts[]**: the 9 landmark centers (Core, Church, Forge, Arena,
  Alchemy, Vault, Mines, Market, Dark Alley) — use for the minimap and
  camera focus.
- **buildingCounts**: how many of each type, so you know which sprites to
  generate first (the high-count house types matter most).

Tips: mirror ~half of repeated house instances horizontally and tint each
slightly to kill copy-paste repetition; scatter clutter (barrels, stalls,
lamps) along street edges (`streets=='1'` cells adjacent to `'0'`).
""".format(N=N, cell=CELL)
open("images/districts/CITY_PLAN_README.md", "w").write(readme)

print("city plan:", len(buildings), "buildings,",
      sum(r.count("1") for r in streets), "street cells")
print("top types:", sorted(plan["buildingCounts"].items(),
                            key=lambda kv: -kv[1])[:8])
