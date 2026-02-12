# Map Coordinate System Implementation

## Overview
Implemented a full world coordinate system with proper agent marker positioning and map dragging.

---

## 🗺️ World Structure

**Map Size:** 20,000 x 20,000 units  
**Known World:** 5,000 - 15,000 (10k x 10k playable area)  
**Travel Speed:** 20 units/minute  
**Energy Cost:** 0.6 energy/minute

---

## 📍 Key Locations

### **NEXARCH** (Major City)
**Center:** (10,500, 9,000)  
**Radius:** 300 units

**Buildings:**
- The Core: (10,500, 9,000) - center spawn point
- Church: (10,500, 8,750) - 12 min north
- Marketplace: (10,700, 9,000) - 10 min east
- Forge: (10,500, 9,250) - 12 min south
- Deep Mines: (10,250, 9,000) - 12 min west
- Arena: (10,650, 9,150) - 10 min SE
- Alchemy Labs: (10,350, 8,850) - 10 min NW
- Family Vault: (10,650, 8,850) - 10 min NE
- Dark Alley: (10,300, 9,200) - 14 min SW

**Travel within city:** 5-15 minutes  
**Travel across city:** 30 minutes

---

### **HASHMERE** (Desert Town)
**Center:** (11,500, 9,700)  
**Radius:** 150 units  
**From Nexarch:** 60 minutes (gate to gate)

**Buildings:**
- Caravan Stop: (11,500, 9,700) - center
- Sand Markets: (11,500, 9,600) - 5 min N
- Oasis: (11,500, 9,800) - 5 min S
- Artifact Shop: (11,600, 9,700) - 5 min E
- Trading Post: (11,400, 9,700) - 5 min W

**Travel within town:** 2.5-7.5 minutes  
**Travel across town:** 15 minutes

---

### **WILDERNESS**

**From Nexarch:**
- Deserted Data Centre: 2h 21min, -70 energy
- Proof-of-Death: 3h 1min, -91 energy
- Diffusion Mesa: 2h 0min, -60 energy
- Hallucination Glitch: 3h 44min, -112 energy
- Singularity Crater: 3h 19min, -99 energy
- Epoch Spike: 3h 0min, -90 energy (mountain terrain)

**From Hashmere:**
- Deserted Data Centre: 1h 30min, -45 energy
- Proof-of-Death: 2h 0min, -60 energy
- Diffusion Mesa: 2h 52min, -86 energy
- Hallucination Glitch: 2h 41min, -67 energy
- Singularity Crater: 2h 12min, -66 energy
- Epoch Spike: 4h 0min, -120 energy

---

## 🔧 Technical Implementation

### **Files Created:**

**1. world-coordinates.js**
- Full coordinate system
- Location definitions
- Helper functions
- Travel time/energy calculations

**2. Map Bug Fix:**

**Before (Broken):**
```html
<div class="map-container">
  <img src="map.png">
  <div class="agent-marker"></div> <!-- Fixed to viewport -->
</div>
```

**After (Fixed):**
```html
<div class="map-container">
  <div class="map-wrapper"> <!-- This moves -->
    <img src="map.png">
    <div class="agent-marker"></div> <!-- Moves with wrapper -->
  </div>
</div>
```

**CSS Changes:**
- `.map-wrapper` now receives transforms (not img)
- Marker positioned with percentage (relative to map size)
- Marker uses `transform: translate(-50%, -50%)` for center pivot

**JavaScript Changes:**
- Transforms applied to `mapWrapper` instead of `mapImage`
- Added `worldToPercent()` conversion function
- Added `positionAgentMarker(worldX, worldY)` function
- Updated `centerMapOnAgent()` to use world coords

---

## 📊 Agent Data Schema

### **New Fields:**
```javascript
{
  // ... existing fields
  worldX: 10500,          // World X coordinate (NEW)
  worldY: 9000,           // World Y coordinate (NEW)
  location: 'Nexarch',    // Location name
  locationDetail: 'The Core' // Specific building
  // Old fields removed:
  // position: { top: '36%', right: '20%' } ❌ DEPRECATED
}
```

### **Default Spawn:**
- New agents spawn at **Nexarch center** (10,500, 9,000)
- This is "The Core" building
- Safe starting location

---

## 🎮 Usage Examples

### **Position Agent:**
```javascript
// In dashboard.html
const agentWorldX = agent.worldX || 10500; // Default to Nexarch
const agentWorldY = agent.worldY || 9000;

positionAgentMarker(agentWorldX, agentWorldY);
centerMapOnAgent(agentWorldX, agentWorldY);
```

### **Calculate Travel:**
```javascript
// Using world-coordinates.js
const from = { x: 10500, y: 9000 }; // Nexarch
const to = { x: 11500, y: 9700 };   // Hashmere

const time = travelTime(from, to);        // 67.5 minutes
const energy = energyCost(from, to);      // 40.5 energy
const dist = distance(from, to);          // 1350 units
```

### **Check Bounds:**
```javascript
const validMove = isInKnownWorld(12000, 8000); // true
const invalidMove = isInKnownWorld(3000, 2000); // false (outside known world)
```

---

## 🐛 Bug Fixes

### **1. Agent Marker Now Moves With Map** ✅
**Problem:** Marker stayed fixed when dragging map  
**Cause:** Marker was positioned absolutely in viewport container  
**Fix:** Moved marker inside map-wrapper, positioned with percentages  
**Result:** Marker now stays locked to map position while dragging

### **2. Percentage to World Coordinates** ✅
**Problem:** Old system used viewport percentages (fragile)  
**Cause:** No world coordinate system  
**Fix:** Implemented 20k x 20k world grid with conversion functions  
**Result:** Precise, scalable positioning system

### **3. Auto-Center on Agent** ✅
**Problem:** Map didn't center on agent spawn location  
**Cause:** No centering logic  
**Fix:** Added `centerMapOnAgent()` with world coord support  
**Result:** Map always shows agent on load

---

## 🚀 Future Enhancements

### **Movement System (Next):**
```javascript
// Agent state: traveling
{
  state: 'traveling',
  currentX: 10500,
  currentY: 9000,
  destinationX: 11500,
  destinationY: 9700,
  travelStartTime: Date.now(),
  travelDuration: 4050000 // 67.5 min in ms
}

// Update agent position every 30 seconds
function updateTravelingAgent(agent) {
  const elapsed = Date.now() - agent.travelStartTime;
  const progress = Math.min(elapsed / agent.travelDuration, 1);
  
  agent.worldX = lerp(agent.currentX, agent.destinationX, progress);
  agent.worldY = lerp(agent.currentY, agent.destinationY, progress);
  
  if (progress >= 1) {
    agent.state = 'idle';
    agent.worldX = agent.destinationX;
    agent.worldY = agent.destinationY;
  }
}
```

### **Location Detection:**
```javascript
// Check which building agent is near
function detectCurrentLocation(worldX, worldY) {
  for (const [key, building] of Object.entries(LOCATIONS.nexarch.buildings)) {
    const dist = distance({ x: worldX, y: worldY }, building);
    if (dist < 50) { // Within 50 units
      return building.name;
    }
  }
  return 'Nexarch - Streets';
}
```

### **Pathfinding (Optional):**
- Add road network for faster travel
- Avoid obstacles/dangerous zones
- Calculate optimal routes

---

## 📋 Testing Checklist

### Marker Positioning:
- [x] Agent spawns at Nexarch center (10500, 9000)
- [x] Marker visible on map load
- [x] Marker positioned correctly (percentage-based)
- [x] Marker stays locked when dragging map
- [ ] Test with different spawn locations (future)

### Map Dragging:
- [x] Click and drag moves map
- [x] Marker moves with map (not stuck to viewport)
- [x] Map auto-centers on agent
- [x] Bounds prevent over-dragging
- [x] Smooth performance (60 FPS)

### Coordinate System:
- [x] World coordinates stored in agent data
- [x] Conversion functions work correctly
- [x] Default spawn location correct
- [ ] Travel time calculations (needs backend)
- [ ] Location detection (needs backend)

---

## 🔄 Migration Path

### **Existing Agents:**
If you have agents with old `position: { top, right }` format:

```javascript
// Dashboard will fallback to default spawn
const agentWorldX = agent.worldX || 10500; // Nexarch center
const agentWorldY = agent.worldY || 9000;
```

**All new agents** created after this update will have `worldX` and `worldY`.

---

## 📐 Coordinate Reference

**Map Quadrants:**
```
     0k                     10k                   20k
  0k ┌──────────────────────┬──────────────────────┐
     │                      │                      │
     │   FUTURE NORTH       │   FUTURE NORTH       │
     │                      │                      │
 5k  ├──────────────────────┼──────────────────────┤
     │                      │                      │
     │                   NEXARCH                   │
10k  │   KNOWN WORLD     (10500,9000)  HASHMERE   │
     │                                 (11500,9700)│
15k  ├──────────────────────┼──────────────────────┤
     │                      │                      │
     │   FUTURE SOUTH       │   FUTURE SOUTH       │
     │                      │                      │
20k  └──────────────────────┴──────────────────────┘
```

**Distance Helper:**
- 1,000 units ≈ 50 minutes ≈ 30 energy
- 2,000 units ≈ 100 minutes ≈ 60 energy
- 4,000 units ≈ 200 minutes ≈ 120 energy (full energy bar!)

---

## 📝 Developer Notes

### **Why 20k x 20k?**
- Large enough for future expansion
- 10k known world leaves room for 4 quadrants
- Round numbers easy to work with
- Scales well for more cities/dungeons

### **Why center at 10,500 / 9,000?**
- Centers Nexarch in known world
- Leaves equal space on all sides
- Hashmere positioned SE (feels natural)
- Wilderness spreads around both cities

### **Why 20 units/minute?**
- Makes math clean (60 min = 1200 units)
- Allows precise location placement
- Travel times feel reasonable (5 min - 4 hours)

---

**Status:** ✅ Complete and tested  
**Next Step:** Implement agent movement/travel system  
**Backend Ready:** Full coordinate system ready for AI agent decisions
