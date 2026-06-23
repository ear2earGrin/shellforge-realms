# Performance Thresholds

- Target FPS: 60
- Red-build FPS: < 45
- draw_call_budget: 80 (mobile)
- worst_case_scene: Market district, all NPCs + rain + glow
- DPR cap: 1.5
- Max rain particles: 200
- Max visible NPCs: 20
- Max glow effects: 30
- Tile render batch: single drawImage per visible tile (no per-pixel ops in loop)
