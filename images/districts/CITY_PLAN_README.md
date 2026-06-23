# Nexarch city plan (engine-agnostic)

`city-plan.json` is the real Nexarch layout for a sprite-compositing
isometric engine. Use it to place building sprites on the true street plan
with walkable roads, instead of a random grid.

- **grid**: 144x144 tiles, each 6.25 world units.
- **streets[row][col]**: `'1'` = walkable cobblestone street/plaza,
  `'0'` = building land. Render a cobblestone ground tile on every cell;
  use a lighter "road" variant where `streets=='1'`.
- **buildings[]**: `{type, tile:[col,row], rotDeg, scale, world}`.
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
