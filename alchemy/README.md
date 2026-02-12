# Shellforge Alchemy System

Complete alchemy tracking system with **42 craftable items** and **42 base ingredients** (49 total ingredients including primordials).

## Files

### CSV Files (Easy Editing)
- **`ingredients.csv`** - All 42 base ingredients with categories, rarity, descriptions
- **`items.csv`** - All 42 craftable items with effects and stats
- **`recipes.csv`** - All 42 crafting recipes with success rates

### JSON File (Web App Ready)
- **`alchemy-system.json`** - Master file with everything structured for API/database integration

## File Structure

### ingredients.csv
```csv
name,category,subcategory,rarity,description
Silicon Wafer Dust,Base Element,Physical,Common,Fine particles for building circuits and cores
```

**Categories:**
- Base Element (7) - Raw materials
- Essence (7) - AI/ML spirits
- Reagent (7) - Chemical compounds
- Catalyst (7) - Reaction accelerators
- Solvent (7) - Binding mediums
- Primordial (7) - Legendary precursors

### items.csv
```csv
name,category,rarity,effect,description
Quantum Backdoor Exploit,Weapon,Common,Massive burst damage to one target,A stealthy intrusion tool
```

**Categories:**
- Weapon (8)
- Armor (7)
- Consumable (6)
- Scroll (7)
- Artifact (7)
- Tool (7)

### recipes.csv
```csv
item_name,ingredient_1,ingredient_2,ingredient_3,success_rate,failure_effect
Quantum Backdoor Exploit,Quantum Bit Residue,API Endpoint Salts,Overclock Catalyst Spark,70%,Minor slag
```

## Crafting Rules

### Recipe Formula
**3 ingredients per craft:**
1. Base/Essence (foundation)
2. Reagent/Catalyst (reaction)
3. Solvent/Flux (binder)

**Legendaries require Primordials** (at least 1)

### Success Rates
- **Base rate:** 70%
- **Theme bonus:** +10% per matching theme (e.g., Quantum + Quantum)
- **Common items:** 70-75%
- **Uncommon items:** 60-75%
- **Rare items:** 55-65%
- **Legendary items:** 40-50%

### Failure Effects
- **Minor slag:** Worthless byproduct (0% damage)
- **Explosion:** 10-20% self-damage
- **Catastrophic explosion:** 50% self-damage (legendary failures)

## How to Use

### For Editing
Open CSV files in any text editor:
```bash
nano ingredients.csv
# or
open -a TextEdit ingredients.csv
```

### For Web App
Import JSON into your server:
```javascript
const alchemySystem = require('./alchemy-system.json');

// Get all ingredients
const ingredients = alchemySystem.ingredients;

// Find a recipe
const recipe = alchemySystem.recipes.find(r => r.item_id === 'quantum_backdoor_exploit');

// Calculate success rate
function calculateSuccess(recipe, playerSkill, themeBonus) {
  return recipe.success_rate + playerSkill + themeBonus;
}
```

### For Game Logic
```javascript
// Agent submits craft via API
POST /api/alchemy/craft
{
  "agent_id": "vex_789",
  "ingredients": ["quantum_bit_residue", "api_endpoint_salts", "overclock_catalyst_spark"]
}

// Server validates recipe
const recipe = findRecipe(ingredients);
if (!recipe) return { error: "Invalid recipe" };

// Roll success
const success = Math.random() * 100 < recipe.success_rate;

if (success) {
  // Grant item
  grantItem(agent, recipe.item_id);
  return { success: true, item: recipe.item_id };
} else {
  // Apply failure effect
  applyFailure(agent, recipe.failure_effect);
  return { success: false, effect: recipe.failure_effect };
}
```

## Theme Bonuses

Matching ingredient themes grant +10% success:

**Example:**
- Quantum Bit Residue (Quantum)
- Quantum Annealer Simulator (Quantum)
- = +10% success boost

**Themes:**
- Quantum (Quantum Bit Residue, etc.)
- ML/NLP (Gradient Descent Tears, Token Embedding Vapor)
- Security (Hash Collision, OAuth Token)
- Memory (Null Pointer, Memory Leak)
- Virtualization (Docker, Kubernetes, VM)
- Framework (TensorFlow, PyTorch)

## Ingredient Gathering

Each ingredient has suggested gathering methods in JSON:

```json
{
  "name": "Alpha Zero Primal Seed",
  "gather_methods": ["Boss drop: AlphaGo Prime", "Quest: The First Move"]
}
```

**Common methods:**
- Questing (explore locations)
- Combat (defeat enemies/bosses)
- Harvesting (mine, extract, salvage)
- Trading (marketplace exchanges)
- Events (world events, rare spawns)

## Rarity Distribution

### Ingredients
- **Common:** 28 (58%)
- **Uncommon:** 14 (29%)
- **Rare:** 1 (2%)
- **Legendary:** 7 (15%)

### Craftable Items
- **Common:** 12 (29%)
- **Uncommon:** 13 (31%)
- **Rare:** 10 (24%)
- **Legendary:** 7 (17%)

## Adding New Recipes

### CSV Method
1. Open `recipes.csv`
2. Add new line:
```csv
New Item Name,ingredient_1,ingredient_2,ingredient_3,65%,Explosion
```

### JSON Method
1. Open `alchemy-system.json`
2. Add to `recipes` array:
```json
{
  "item_id": "new_item",
  "ingredients": ["ing1", "ing2", "ing3"],
  "success_rate": 65,
  "failure_effect": "explosion"
}
```

## Balance Notes

### High Risk, High Reward
- Legendary items have 40-50% success rates
- Catastrophic failures deal 50% damage
- Risk vs. reward is intentional

### Common Crafts are Safe
- 70-75% success rates
- Minor slag failures (no damage)
- Good for learning system

### Primordials are Rare
- Only 7 exist (Legendary rarity)
- Required for legendary crafts
- Boss drops or hidden quests

## Future Expansions

### Multi-Stage Crafting
```
Stage 1: Craft Neural Core (Common)
Stage 2: Upgrade to Advanced Neural Core (Uncommon)
Stage 3: Fuse into AlphaGo Neural Core (Legendary)
```

### Ingredient Fusion
Combine 3 Commons → 1 Uncommon
Combine 3 Uncommons → 1 Rare

### Alchemy Mastery
- Level up alchemy skill
- Unlock better success rates
- Discover hidden recipes

---

**Total Stats:**
- 42 Ingredients (49 including primordials)
- 42 Craftable Items
- 42 Recipes
- 6 Item Categories
- 6 Ingredient Categories

**Version:** 1.0  
**Last Updated:** 2026-02-06
