# Wilderness Markers Feature

## Overview
Added hoverable wilderness location markers to the dashboard map. When a player hovers over a wilderness marker, they see real-time stats about that location relative to their agent's current position.

## Features

### Visual Markers
- **8px circular markers** positioned at wilderness locations
- **Color-coded by danger level:**
  - Orange: Medium danger
  - Dark orange: High danger
  - Red: Extreme danger
- **Glow effects** matching danger level
- **Hover animation**: Grows to 10px with increased glow

### Tooltip Information
Terminal-style tooltip displays on hover:
- **Location name** (uppercase header with primary color)
- **Distance** from agent's current position (in km)
- **Travel time** (formatted as hours/minutes)
- **Energy cost** (based on travel time × 0.6 energy/min)
- **Danger level** (color-coded: orange/dark orange/red)

### Wilderness Locations
Six wilderness locations rendered with fixed visual positions (stylized map):

| Location | Gameplay Coords | Visual Position | Danger |
|----------|----------------|-----------------|--------|
| **Epoch Spike** | (10500, 5400) | Top center (52%, 8%) | Extreme (1.7× terrain) |
| **Singularity Crater** | (7500, 5800) | Left side (35%, 30%) | High |
| **Hallucination Glitch** | (6300, 10500) | Far left (17%, 30%) | Extreme |
| **Deserted Data Centre** | (9000, 10800) | Center-left (45%, 52%) | Medium |
| **Diffusion Mesa** | (8100, 9000) | Center-bottom (45%, 70%) | Medium |
| **Proof-of-Death** | (11000, 12600) | Bottom center (50%, 82%) | High |

## Technical Implementation

### CSS Classes
```css
.wilderness-marker              /* Base marker style */
.wilderness-marker.danger-X     /* Danger-specific colors */
.wilderness-tooltip             /* Hover tooltip */
.tooltip-header                 /* Location name */
.tooltip-row                    /* Info row (label + value) */
.tooltip-value.danger-X         /* Color-coded danger text */
.tooltip-value.energy           /* Blue energy cost */
.tooltip-value.time             /* Yellow travel time */
```

### JavaScript Functions
```javascript
calculateDistance(x1, y1, x2, y2)           // Euclidean distance
calculateTravelTime(distance, terrain)       // Minutes based on 20 units/min
calculateEnergyCost(travelTimeMinutes)       // Energy = time × 0.6
formatTime(minutes)                          // Format as "Xh Ym" or "Ym"
renderWildernessMarkers(agentX, agentY)      // Create all markers with tooltips
```

### Calculation Logic
- **Travel Speed**: 20 units/minute (base)
- **Energy Cost**: 0.6 energy/minute
- **Terrain Multiplier**: 1.7x for mountain terrain (Epoch Spike)
- **Distance**: Direct Euclidean distance (√(dx² + dy²))

### Integration
- Markers rendered in `loadAgentData()` after agent marker positioning
- Stats calculated dynamically based on agent's current worldX/worldY
- **Dual coordinate system**: Visual positions fixed (stylized map), gameplay coordinates used for distance/time/energy calculations
- Same approach as cities (Nexarch/Hashmere): visual position ≠ gameplay position for artistic map design

## Design Philosophy
- **Minimalistic terminal style**: Monospace font, subtle borders, no gradients
- **Information density**: All critical travel data in compact format
- **Color coding**: Instant visual danger assessment
- **Low-friction interaction**: Hover only, no clicks required
- **Performance**: Lightweight, no heavy animations or API calls

## Future Enhancements (Phase 2+)
- [ ] Click marker to open detailed location page
- [ ] Show recommended route path on map
- [ ] Display agents currently at location
- [ ] Show loot/rewards available
- [ ] Add terrain difficulty indicator
- [ ] Integrate with AI movement decisions
- [ ] Show weather/environmental hazards

## Files Modified
- `dashboard.html`: Added CSS, HTML container, JavaScript functions
- World coordinates from existing `world-coordinates.js` (WILDERNESS object)

## Testing Notes
- Hover tooltips position automatically above markers
- Tooltip arrow points down to marker
- All 6 wilderness locations render correctly
- Distance/time/energy calculations verified against world-coordinates.js comments
- Danger colors match visual hierarchy (orange → red)
- Tooltip stays visible while hovering marker (pointer-events: none on tooltip)

---

## Position Fix (2026-02-08 03:57 PST)

**Issue**: Markers initially positioned using automatic coordinate conversion, which didn't match the stylized visual map.

**Solution**: Switched to fixed visual positions for each wilderness location, matching the artistic map design:
- Visual positions manually set to match map geography
- Gameplay coordinates still used for distance/time/energy calculations
- Same dual-coordinate approach as Nexarch/Hashmere

This allows the map to be stylized/artistic while maintaining accurate gameplay calculations.

---

**Status**: ✅ Complete (positions fixed)
**Date**: 2026-02-08
**Design**: Terminal aesthetic, minimalistic, information-focused
