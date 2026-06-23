# Medieval Cyberpunk City — Design Plan (Mode S)

## §1 Profile
| Axis | Choice |
|---|---|
| Time | Real-time (continuous exploration, no turns) |
| Space | Continuous 2D isometric (tile-based rendering on canvas) |
| Player agency | One embodied hero (hooded figure) |
| Conflict | Versus the environment (exploration, discovery) |
| Content | Authored (hand-placed city districts per the reference map) |
| Outcome | Endless / player sets own goals (explore the city) |
| Players | Solo |
| Session | Minutes (drop-in exploration) |
| Engagement source | Discovery (primary), Self-expression (secondary — choosing where to go) |

**Delivery context:**
- Target platforms: Desktop + mobile browsers
- Input methods: Keyboard (WASD/arrows), touch (virtual joystick), gamepad
- Languages: English (all strings external)

**Performance budgets (§7.5):**
- draw_call_budget: 80 (mobile floor)
- entity_count_estimate: ~50 NPCs + buildings rendered at once
- worst_case_scene: Full city center (Market area) with all NPCs, rain particles, neon glow effects, and ambient animations visible simultaneously
- DPR cap: 1.5

## §2 Laws
**L1 Experience:** The experience is exploring a dark, rain-soaked medieval cyberpunk city from an isometric view, discovering districts with distinct character.
**L2 Meaningful interaction:** Movement is discernible (camera follows, parallax rain), integrated (reaching new districts reveals their unique atmosphere). Interacting with landmarks triggers info panels.
**L3 Patterns:** The city layout itself is the pattern — learning the roads between Cathedral, Arena, Watchtower, Market, Church, Foundry, and Tavern. Each district has a visual signature.
**L4 Uncertainty:** Anticipation (what does the next district look like?) and discovery (finding hidden details, NPC interactions).

Learnable patterns: city navigation (road network), district identification (visual cues), NPC locations.
Loops: short (walk through streets, discover props), medium (explore a full district), long (visit all 7 landmarks).
Uncertainty sources: anticipation (next district), discovery (hidden details) — carrier mechanics: fog of exploration, landmark reveal.

## §3 Concept
**Experience formula:** "The player feels like a lone wanderer in a dark, rain-drenched medieval city fused with cyberpunk technology, because the game constantly reveals new atmospheric details — glowing circuit-board panels, hooded figures, neon-lit alleys — as they navigate deeper into the city."

**Four pillars:**
- Mechanics: Isometric movement with camera tracking, district exploration, landmark interaction
- Story: Implicit environmental storytelling — the city tells its own story through details
- Aesthetics: Dark medieval cyberpunk with neon accents (THE load-bearing pillar) — directly from reference images
- Technology: Canvas 2D rendering with layered isometric tiles, particle rain, glow effects

**Interest curve (session):** Hook=immediate atmospheric immersion (rain, neon glow) → steady exploration → peaks at each landmark discovery → climax at Cathedral (highest point).

## §4 System
**Verbs:**
- MOVE (strong): acts on roads/paths → character walks, camera follows, rain parallax shifts, new areas revealed
- INTERACT (moderate): acts on landmarks/NPCs → info panel appears with lore text
- LOOK (passive): acts on environment → ambient details visible (rain, glow, NPCs walking)

**Feedback loops:** Positive — discovering one district reveals paths to adjacent ones.
**Information map:** City layout is initially unknown (fog), revealed by exploration. Landmark names visible on approach. NPC positions are open.

## §5 Prototype question
"Does isometric tile-based movement with the Diablo II camera feel satisfying on canvas at 60fps with rain particles and glow effects?"

## STYLE FORMULA
Dark medieval cyberpunk isometric rendering with pre-rendered sprite aesthetic and painterly detail, angular stone-and-timber architecture with thick dark outlines and weathered surface textures, environment in deep charcoal-slate stone with cold teal-blue shadows and rain-wet reflections while neon circuit-board panels glow in cyan and magenta on rooftops and walls, moody oppressive rain-drenched night atmosphere with localized warm amber firelight from windows and forges, high contrast between dark architecture and vivid neon accents with clean readable building silhouettes in consistent Diablo-II-style isometric top-down perspective across all assets.
