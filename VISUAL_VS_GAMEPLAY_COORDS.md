# Visual Map vs Gameplay Coordinates

## The Problem

The **visual map image** is stylized and not to scale. If we use the visual positions for gameplay calculations, travel times become wrong.

**Example:**
- Visual Nexarch: 75% from left, 30% from top
- Visual Hashmere: 72% from left, 75% from top
- Visual distance: ~9,000 units = **7.5 hours** (wrong!)
- Agreed gameplay: **1 hour** between cities

---

## The Solution

**Separate systems:**
1. **Gameplay coordinates** - for distance/time calculations (accurate)
2. **Visual coordinates** - for map display (stylized)

### Gameplay Coordinates (World Units)
Used for: Travel time, energy cost, distance calculations

```javascript
Nexarch center: (10,500, 9,000)
Hashmere center: (11,500, 9,700)
Distance: 1,350 units = 67.5 min = 40.5 energy ✓
```

### Visual Map Positions (Percentage)
Used for: Label placement, marker display

```javascript
Nexarch visual: 75% left, 30% top
Hashmere visual: 72% left, 75% top
```

---

## How It Works

### 1. City Labels
Positioned at visual locations (where they appear on the map image):
```html
<div class="location-label city" style="left: 75%; top: 30%;">_Nexarch</div>
<div class="location-label town" style="left: 72%; top: 75%;">_Hashmere</div>
```

### 2. Agent Marker
Uses **gameplay coordinates** but displays at **visual positions**:

```javascript
// Agent at Nexarch in gameplay
agent.worldX = 10500;  // Gameplay coordinate
agent.worldY = 9000;

// But marker shows at visual position
marker.style.left = "75%";  // Visual position
marker.style.top = "30%";
```

### 3. Mapping Function
```javascript
function positionAgentMarker(worldX, worldY) {
  // If at Nexarch (gameplay)
  if (near(worldX, 10500) && near(worldY, 9000)) {
    // Show at Nexarch (visual)
    visualX = 75%;
    visualY = 30%;
  }
  // If at Hashmere (gameplay)
  else if (near(worldX, 11500) && near(worldY, 9700)) {
    // Show at Hashmere (visual)
    visualX = 72%;
    visualY = 75%;
  }
  // TODO: Interpolate for locations in-between
}
```

---

## Why This Approach?

**Common in games:**
- World maps are often stylized
- Gameplay ≠ visual scale
- Examples: Skyrim, Fallout, most RPGs

**Benefits:**
- Keeps agreed travel times (1h Nexarch→Hashmere) ✓
- Cities appear where they look on map image ✓
- Flexible for future map updates ✓

**Trade-off:**
- Need mapping between systems
- Can't just multiply coordinates

---

## Current Mapping

### Known Points:
| Location | Gameplay (X, Y) | Visual (%, %) |
|----------|-----------------|---------------|
| Nexarch | (10,500, 9,000) | (75, 30) |
| Hashmere | (11,500, 9,700) | (72, 75) |

### TODO: Add mapping for wilderness locations
From your screenshot, I can see these visual positions:
- **Epoch Spike:** ~52% left, 13% top
- **Singularity Crater:** ~28% left, 19% top
- **Hallucination Glitch:** ~22% left, 42% top
- **Data Center:** ~34% left, 45% top
- **Diffusion Mesa:** ~48% left, 62% top
- **Proof of Death:** ~52% left, 75% top

We'll need to map these to the gameplay coordinates we defined.

---

## Future: Proper Interpolation

For agents traveling between cities, we need to interpolate visual positions:

```javascript
function gameplayToVisual(worldX, worldY) {
  // Define key control points
  const points = [
    { game: [10500, 9000], visual: [75, 30] },  // Nexarch
    { game: [11500, 9700], visual: [72, 75] },  // Hashmere
    { game: [9000, 10800], visual: [34, 45] },  // Data Center
    // ... etc
  ];
  
  // Use bilinear interpolation or triangulation
  return interpolate(worldX, worldY, points);
}
```

This would give smooth, accurate positioning anywhere on the map.

---

## Testing

### Current State:
- [x] Nexarch label at correct visual position (75%, 30%)
- [x] Hashmere label at correct visual position (72%, 75%)
- [x] Agent spawns at Nexarch, marker shows at visual Nexarch
- [ ] Agent traveling shows correct interpolated position
- [ ] Wilderness locations mapped

### To Verify:
1. Agent spawns → marker at Nexarch visual position ✓
2. Labels match screenshot positions ✓
3. Travel times still correct (1h between cities) ✓
4. Dragging map doesn't break positioning ✓

---

**Status:** Basic mapping working, needs expansion for travel interpolation
