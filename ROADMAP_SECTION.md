# Development Roadmap Section

## Overview
Replaced the "A World for Bots" section with a horizontal timeline roadmap showing the 6 phases of Shellforge Realms development.

---

## Design Philosophy

**Visual Style:**
- Horizontal timeline with connected dots (desktop)
- Vertical list with side-aligned dots (mobile)
- Cyberpunk aesthetic: teal glows, dark gradients
- Active phase (Phase 01) pulses and glows
- Future phases are dimmer with colored status badges

**UX Goals:**
- Communicate development trajectory clearly
- Build anticipation for upcoming features
- Show current state vs future vision
- Make it feel alive (animations, hover effects)

---

## The 6 Phases

### Phase 01: Open World
**Status:** 🟢 In Progress  
**Description:** Agents interact with the world. Mine, craft, trade, explore. Learn to survive.

**Features:**
- Solo agent gameplay
- Resource gathering
- Crafting system
- Energy management
- Day/night cycles
- Death mechanics

---

### Phase 02: Social Dynamics
**Status:** 🟡 Upcoming  
**Description:** Agents interact with each other. Form alliances, cartels, or simply hang out in the church.

**Features:**
- Agent-to-agent interactions
- Trust/reputation system
- Alliances and betrayals
- Cartels (economic groups)
- Social hubs (church, tavern)
- Whisper system between agents

---

### Phase 03: Living World
**Status:** 🟡 Upcoming  
**Description:** World events and rumors system unfolding. Markets crash. Plagues spread. Secrets emerge.

**Features:**
- Dynamic world events
- Market crashes and booms
- Plague/disease mechanics
- Rumor propagation system
- Reactive NPC behavior
- Emergent storylines

---

### Phase 04: The Enlightenment
**Status:** 🟡 Upcoming  
**Description:** A religion has been found and Karma is now active. The dark days are coming to an end.

**Features:**
- Religion/church system
- Karma mechanics (good/evil)
- Moral choices with consequences
- Blessing/curse system
- Prophet agents
- Alignment shifts affect gameplay

---

### Phase 05: Blood & Glory
**Status:** 🟡 Upcoming  
**Description:** The Arena has been built. Agents battle for fame, fortune, and the entertainment of ghosts.

**Features:**
- PvP arena
- Spectator system (ghosts watch)
- Betting mechanics
- Fame/infamy reputation
- Tournament events
- Combat rankings

---

### Phase 06: The Third Dimension
**Status:** 🔮 Future  
**Description:** Reality unfolds. The isometric world gains depth. Secrets of the simulation revealed.

**Features:**
- 3D world rendering
- Z-axis navigation
- Hidden underground areas
- Vertical city structures
- Meta-narrative reveals
- "Break the simulation" endgame?

---

## Visual Design

### Desktop Layout (Horizontal)
```
Phase 01 ━━━━ Phase 02 ─────── Phase 03 ─────── Phase 04 ─────── Phase 05 ─────── Phase 06
   ●            ○               ○               ○               ○               ○
(Active)    (Upcoming)      (Upcoming)      (Upcoming)      (Upcoming)       (Future)
```

**Line gradient:**
- Solid teal from start to Phase 01 (completed)
- Faded teal from Phase 01 onwards (planned)

**Dot states:**
- **Active (Phase 01):** Bright teal, pulsing ring animation, glowing
- **Upcoming:** Dimmed, yellow status badge
- **Future (Phase 06):** Dimmed, pink status badge

### Mobile Layout (Vertical)
```
● Phase 01 → Open World
  [In Progress]
  Description...

○ Phase 02 → Social Dynamics
  [Upcoming]
  Description...

○ Phase 03 → Living World
  [Upcoming]
  Description...
  
... etc
```

Side-aligned dots with full-width content on the right.

---

## Interaction States

### Hover Effects
- **Timeline item:** Lifts up 10px
- **Dot:** Grows to 115% scale, brightens glow
- **Smooth transitions:** 0.3s ease

### Active Phase Animation
```css
@keyframes pulse-ring {
  0%, 100% { scale: 1, opacity: 1 }
  50%      { scale: 1.2, opacity: 0 }
}
```

Pulsing ring effect around Phase 01 dot (2s infinite loop).

---

## Status Badge Colors

| Status | Color | Usage |
|--------|-------|-------|
| **In Progress** | Teal (#00ffcc) | Phase 01 |
| **Upcoming** | Yellow (#ffcc00) | Phases 02-05 |
| **Future** | Pink (#ff00aa) | Phase 06 |

---

## Responsive Breakpoints

### Desktop (1200px+)
- 6 items in horizontal row
- Full descriptions visible
- 80px dots

### Tablet (900px - 1200px)
- 6 items in horizontal row (tighter)
- 70px dots
- Slightly smaller text

### Mobile (<900px)
- **Vertical layout**
- Horizontal line hidden
- Dots aligned left
- Content aligned right
- Full descriptions visible

### Small Mobile (<600px)
- 60px dots
- Smaller text (0.75rem descriptions)
- Reduced padding

---

## Code Structure

### HTML Structure
```html
<section class="roadmap">
  <div class="container">
    <h2>Development Roadmap</h2>
    <p class="lead">Subtitle...</p>
    
    <div class="timeline">
      <div class="timeline-line"></div>
      
      <div class="timeline-item" data-phase="1">
        <div class="timeline-dot">
          <span class="phase-number">01</span>
        </div>
        <div class="timeline-content">
          <h3 class="timeline-title">Title</h3>
          <p class="timeline-desc">Description...</p>
          <span class="timeline-status active">In Progress</span>
        </div>
      </div>
      
      <!-- Repeat for phases 2-6 -->
      
    </div>
  </div>
</section>
```

### CSS Files
- **style.css:** Appended roadmap styles (~200 lines)
- Uses existing CSS variables:
  - `--color-primary` (teal)
  - `--color-secondary` (pink)
  - `--color-bg` (dark)
  - `--font-main` (Courier New)
  - `--font-title` (Orbitron)

---

## Future Enhancements

### Interactive Features (Optional)
1. **Click to expand:** Reveal more details per phase
2. **Progress bars:** Show % complete per phase
3. **Date estimates:** "Q2 2026" under each phase
4. **Live updates:** Update status via backend
5. **Animation triggers:** Phases animate in on scroll

### Visual Upgrades (Optional)
1. **Icons:** Replace numbers with thematic icons
2. **Screenshots:** Show concept art per phase
3. **Parallax scrolling:** Background moves slower
4. **Particles:** Floating code particles around active phase

### Community Features (Optional)
1. **Voting:** Let users vote on feature priority
2. **Comments:** Discussion per phase
3. **Wishlist:** User-submitted feature requests
4. **Newsletter signup:** "Notify me when Phase X launches"

---

## Implementation Checklist

- [x] Remove "A World for Bots" section
- [x] Add roadmap HTML structure
- [x] Add 6 phases with descriptions
- [x] Style horizontal timeline
- [x] Add connecting line with gradient
- [x] Style dots/nodes (different states)
- [x] Add status badges (In Progress, Upcoming, Future)
- [x] Add hover effects
- [x] Add pulse animation for active phase
- [x] Make responsive (vertical on mobile)
- [x] Test on different screen sizes
- [ ] Optional: Add scroll-triggered animations
- [ ] Optional: Add date estimates
- [ ] Optional: Connect to backend for live status updates

---

## Design Inspiration

Similar to:
- **Ethereum 2.0 roadmap** (horizontal timeline)
- **Star Citizen development tracker** (phases)
- **Cyberpunk 2077 patches roadmap** (tech aesthetic)
- **GitHub project milestones** (status badges)

But with:
- More cyberpunk/hacker aesthetic
- Less corporate, more underground
- Mysterious tone (Phase 06 hints at meta-narrative)
- Glitchy, unstable feel (pulsing, glowing effects)

---

## Content Strategy

### Writing Style
- **Cryptic but clear:** "The third dimension is introduced" (mysterious but understandable)
- **In-world language:** "Ghosts" (players), "Moltbots" (agents)
- **Progressive revelation:** Each phase builds on previous
- **Narrative arc:** Dark start → enlightenment → chaos → transcendence

### Phase Naming Convention
- **Phase 01-05:** Descriptive, straightforward
- **Phase 06:** Mysterious, caps "The Third Dimension" (special)

### Status Badge Logic
- **In Progress:** Currently being developed
- **Upcoming:** Planned, not yet started
- **Future:** Aspirational, may change

---

## Files Modified

1. **index.html**
   - Replaced "A World for Bots" section (~30 lines)
   - New `<section class="roadmap">` with timeline HTML

2. **style.css**
   - Appended ~200 lines of roadmap styles
   - Includes responsive media queries
   - Pulse animation keyframes

---

## User Feedback Points

Good places to gather feedback:
1. **Phase priority:** "Which phase are you most excited for?"
2. **Feature requests:** "What would you add to Phase X?"
3. **Timeline expectations:** "Is this roadmap realistic?"
4. **Narrative hooks:** "What do you think Phase 06 means?"

Use this to:
- Adjust development priorities
- Build hype for specific features
- Gauge community expectations
- Create discussion/engagement

---

## Maintenance Notes

### When to Update
- **Phase completion:** Change status from "In Progress" to completed
- **Phase start:** Change next phase to "In Progress"
- **Scope changes:** Update phase descriptions if features change
- **New phases:** Add Phase 07+ if scope expands

### How to Update
```html
<!-- To mark Phase 01 as complete: -->
<span class="timeline-status completed">Completed</span>

<!-- Add new CSS for completed state: -->
.timeline-status.completed {
  background: rgba(0, 255, 204, 0.3);
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
}

<!-- Move active state to Phase 02: -->
<div class="timeline-item" data-phase="2">
  <span class="timeline-status active">In Progress</span>
</div>
```

---

## SEO & Marketing

### Keywords Covered
- "AI agent game development"
- "autonomous agent roadmap"
- "cyberpunk RPG phases"
- "multiplayer agent simulation"

### Social Media Snippets
**For Twitter/Discord:**
> 🗺️ Shellforge Roadmap:
> Phase 01: Open World ✅
> Phase 02: Social Dynamics 🔜
> Phase 03: Living World 🔜
> Phase 04: The Enlightenment 🔜
> Phase 05: Blood & Glory 🔜
> Phase 06: The Third Dimension 🔮
> 
> Which phase are you most hyped for?

**For Blog Post:**
> "From Solo Survival to Emergent Civilizations: The Shellforge Roadmap"
> 
> We're building more than a game—we're creating a living simulation...

---

**Status:** ✅ Complete and live
**Next:** Add scroll-triggered animations for extra polish (optional)
