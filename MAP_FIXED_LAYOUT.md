# Map Fixed Layout

## Changes Made

Removed the drag functionality and made the map container exactly match the map image size, eliminating black borders.

### Technical Details

**CSS Changes:**
- Removed `.map-wrapper` styles
- Removed `.map-container.dragging` styles
- Changed `.map-container` to use `aspect-ratio: 3 / 2` to match the map image
- Changed map image `object-fit` from `contain` to `cover` for perfect fill
- Removed `background: #000` that was causing black bars
- Removed `cursor: grab` since no dragging

**HTML Changes:**
- Removed `.map-wrapper` div element
- Agent marker and location labels are now direct children of `.map-container`
- Updated city label positions to match visual coordinates (Nexarch: 75%/30%, Hashmere: 72%/75%)

**JavaScript Changes:**
- Removed all drag event listeners (mousedown, mousemove, mouseup, mouseleave)
- Removed drag state variables (isDragging, startX, startY, translateX, translateY, etc.)
- Removed `centerMapOnAgent()` function
- `positionAgentMarker()` now directly positions on the fixed container

### Result

- **No black borders** on any side of the map
- Map fills the container perfectly with 3:2 aspect ratio
- Agent marker and city labels positioned correctly
- Clean, fixed display without drag complexity
- Responsive on mobile (maintains aspect ratio)

### Future Considerations

If drag/pan is needed later:
1. Can add it back as an optional zoom/pan feature
2. Would need to implement proper bounds checking
3. Consider zoom levels for better exploration

For now, the fixed view shows the full map clearly with all locations visible.
