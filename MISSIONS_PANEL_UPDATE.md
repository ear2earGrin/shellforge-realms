# Missions Panel - Terminal Style Redesign

## Changes Made

Updated the Active Missions panel to be minimalistic, terminal-style, and repositioned on the dashboard.

---

## Visual Changes

### 1. Position Update

**Before:**
- Bottom right corner (below map, right of quest log)

**After:**
- Right side, between Whisper Panel and Inventory Panel

**Desktop Grid Order (Right Column):**
1. Whisper Panel (top)
2. **Missions Panel** (middle) ← moved here
3. Inventory Panel (bottom)

**Mobile Order:**
1. Agent Status
2. Map View
3. Whisper Panel
4. **Missions Panel** ← moved here
5. Inventory Panel
6. Quest Log

---

### 2. Style Changes (Terminal/Minimalistic)

**Before:**
- Colorful (teal, pink, yellow accents)
- Thick colored borders
- Heavy shadows and glows
- Icons in mission titles (⚡, 🔮, ✓)
- Large padding
- Progress bars with gradients

**After:**
- Monochrome terminal aesthetic
- Thin borders (1px)
- Courier New monospace font
- No icons in titles
- Smaller, tighter spacing
- Simple progress bars (solid color)

---

## Technical Details

### Size & Scrolling

```css
.missions-panel {
    max-height: 280px;
    overflow-y: auto;
}
```

**Behavior:**
- Shows ~3 missions comfortably
- Scrollbar appears when > 3 missions
- Custom styled scrollbar (6px, teal accent)

### Terminal Typography

**All text now uses:**
```css
font-family: 'Courier New', monospace;
```

**Font sizes (reduced):**
- Header: 0.85rem (was 1.2rem)
- Mission title: 0.8rem (was 0.9rem)
- Description: 0.75rem (was 0.8rem)
- Reward: 0.7rem (was 0.75rem)

### Color Scheme

**Simplified palette:**
- Background: `rgba(0, 0, 0, 0.9)` (darker)
- Border: `rgba(0, 255, 204, 0.3)` (subtle teal)
- Text: `var(--color-text)` (standard white/gray)
- Accents: Teal only (no pink, yellow, green)

### Mission Status Indicators

**Removed emojis, added text prefixes:**

**Active missions:**
```
> First Steps
```
(Teal `>` prompt character)

**Completed missions:**
```
[DONE] Welcome to the Realms
```
(Dimmed text, reduced opacity)

**Pending missions:**
```
The Oracle's Request
```
(No prefix, standard styling)

---

## CSS Classes Updated

### `.missions-panel`
- Border reduced: 2px → 1px
- Shadow removed
- Background darker: 0.8 → 0.9 opacity
- Added max-height: 280px
- Added overflow-y: auto
- Padding reduced: 20px → 15px

### `.missions-header`
- Padding reduced
- Font changed to monospace
- Size reduced: 1.2rem → 0.85rem

### `.mission-item`
- Background: colored → transparent
- Border: 3px → 2px left border only
- Removed hover transform
- Reduced padding: 12px → 8px 10px
- Margin reduced: 12px → 8px

### `.mission-item.active`
- Removed shadow/glow
- Added `> ` prefix via ::before
- Border color: teal

### `.mission-item.completed`
- Reduced opacity: 0.6 → 0.5
- Added `[DONE] ` prefix via ::before
- Border color: dimmed teal

### `.mission-title`
- Font: main → Courier New
- Weight: bold → normal
- Size reduced: 0.9rem → 0.8rem

### `.mission-desc`
- Font: main → Courier New
- Size reduced: 0.8rem → 0.75rem
- Margin reduced: 8px → 6px

### `.mission-reward`
- Font: main → Courier New
- Color: yellow → teal (0.7 opacity)
- Size reduced: 0.75rem → 0.7rem
- Text lowercase: "Reward:" → "reward:"

### `.mission-progress`
- Height reduced: 4px → 2px
- Margin reduced: 8px → 6px

### `.mission-progress-bar`
- Background: gradient → solid teal
- Removed border-radius

---

## HTML Changes

**Mission titles (removed icons):**

**Before:**
```html
<div class="mission-title">⚡ First Steps</div>
<div class="mission-title">🔮 The Oracle's Request</div>
<div class="mission-title">✓ Welcome to the Realms</div>
```

**After:**
```html
<div class="mission-title">First Steps</div>
<div class="mission-title">The Oracle's Request</div>
<div class="mission-title">Welcome to the Realms</div>
```

Status indicators (>, [DONE]) are added via CSS ::before pseudo-elements.

**Reward text (lowercase):**

**Before:**
```html
<div class="mission-reward">Reward: 50 $SHELL + 10 XP</div>
```

**After:**
```html
<div class="mission-reward">reward: 50 $SHELL + 10 XP</div>
```

---

## Scrollbar Styling

**Custom scrollbar for missions panel:**

```css
.missions-panel::-webkit-scrollbar {
    width: 6px;
}

.missions-panel::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
}

.missions-panel::-webkit-scrollbar-thumb {
    background: rgba(0, 255, 204, 0.3);
}

.missions-panel::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 255, 204, 0.5);
}
```

**Appearance:**
- Thin (6px) scrollbar
- Dark track
- Teal thumb that brightens on hover
- Matches terminal aesthetic

---

## Responsive Behavior

### Desktop (>1200px)
- Right column: Whisper → Missions → Inventory
- Height: 280px max
- ~3 missions visible

### Mobile (<1200px)
- Stacked vertically
- Order: Whisper → Missions → Inventory → Quest Log
- Height: 250px max
- Scrollbar appears when needed

---

## Before/After Comparison

### Visual Style

**Before:**
```
┏━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [ ACTIVE MISSIONS ]   ┃  ← Large header, glowing border
┣━━━━━━━━━━━━━━━━━━━━━━━┫
┃                       ┃
┃  ⚡ First Steps      ┃  ← Icons, colored backgrounds
┃  [Description]        ┃
┃  Reward: 50 $SHELL   ┃  ← Yellow reward text
┃  ████░░░░░░ 50%      ┃  ← Gradient progress bar
┃                       ┃
┃  🔮 The Oracle's... ┃  ← Pink border accent
┃  [Description]        ┃
┃  Reward: 100 $SHELL  ┃
┃                       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┛
```

**After:**
```
┌───────────────────────┐
│ [ ACTIVE MISSIONS ]   │  ← Small monospace header
├───────────────────────┤
│                       │
│ > First Steps        │  ← Prompt character, no icon
│ [Description]         │
│ reward: 50 $SHELL    │  ← Lowercase, teal
│ ██░░░░░░░░ 50%       │  ← Simple bar
│                       │
│ The Oracle's Request │  ← No prefix, clean
│ [Description]         │
│ reward: 100 $SHELL   │
│                       │
│ [DONE] Welcome...    │  ← Completed prefix, dimmed
│ [Description]         │
│ reward: 50 $SHELL    │
│                       │  ↕ Scrolls if >3 missions
└───────────────────────┘
```

---

## Design Philosophy

**From colorful/gamey → terminal/minimal:**

**Old approach:**
- Draw attention with colors
- Use icons for visual interest
- Gradients and glows
- Spacious padding

**New approach:**
- Focus on content
- Terminal aesthetic consistency
- Monospace readability
- Efficient space usage
- Scrollable for scalability

**Why terminal style?**
- Matches cyberpunk theme
- Consistent with notifications
- Professional/hacker aesthetic
- Focuses on information density
- Easier to read (less visual noise)

---

## Future Enhancements

### Dynamic Mission States

**Could add more state prefixes:**
- `[!] ` - Urgent missions
- `[*] ` - New missions
- `[~] ` - In progress
- `[✓] ` - Completed (alternative)
- `[X] ` - Failed

### Mission Categories

**Group by type:**
```
[ MAIN QUESTS ]
> First Steps
[DONE] Welcome to the Realms

[ SIDE QUESTS ]
The Oracle's Request
```

### Completion Animation

**When mission completes:**
- Fade out over 1s
- Slide up other missions
- Flash [DONE] prefix briefly

### Click Interaction

**On mission click:**
- Expand to show full details
- Show objectives breakdown
- Map marker for location
- Accept/Abandon buttons

---

## Player Experience

### What Players Notice

**Immediate:**
- Cleaner, less cluttered
- Easier to read
- Fits terminal theme better

**On interaction:**
- Scrollbar appears when needed
- Prompt character shows active mission
- [DONE] clearly marks completed

**Overall feel:**
- More professional
- Less "cartoony"
- Better information density
- Matches game's cyberpunk tone

---

## Testing Checklist

- [x] Missions panel repositioned correctly
- [x] Icons removed from all mission titles
- [x] Active missions show `> ` prefix
- [x] Completed missions show `[DONE] ` prefix
- [x] Scrollbar appears with >3 missions
- [x] Terminal font applied to all text
- [x] Colors simplified (teal only)
- [x] Progress bars simplified
- [x] Mobile layout updated
- [ ] Test with 5+ missions (scrolling)
- [ ] Test hover states
- [ ] Verify scrollbar styling in different browsers
- [ ] Check mobile responsive layout

---

**Status:** ✅ Implemented
**Visual Impact:** Minimalistic upgrade
**Functional Change:** Repositioned + scrollable

Last Updated: 2026-02-08
