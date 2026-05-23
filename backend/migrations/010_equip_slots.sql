-- equip_slot — explicit gear slot per item.
--
-- The dashboard equipped panel has five slots (weapon=melee, ranged, helm,
-- armor=chest, trinket) but items only carried a coarse `kind`, so three slots
-- were unreachable and tools/scrolls could not be equipped at all. This adds an
-- explicit slot to items_master and backfills the live inventory from it.
--
-- The frontend (dashboard.html) reads equip_slot from items_master first, then
-- the inventory row, then a name/type heuristic — so this is the canonical
-- source but the UI degrades gracefully if a row is missing it.

BEGIN;

ALTER TABLE items_master ADD COLUMN IF NOT EXISTS equip_slot TEXT;

-- Heuristic assignment:
--   weapon + software            -> ranged   (remote/digital strike)
--   weapon (hardware/unknown)    -> weapon    (melee)
--   armor with head-gear in name -> helm
--   armor (everything else)      -> armor     (chest)
--   tool / scroll / artifact / implant -> trinket (utility slot)
--   consumable / ingredient / deployable -> NULL (not equippable)
UPDATE items_master SET equip_slot = CASE
  WHEN kind = 'weapon' AND type = 'software' THEN 'ranged'
  WHEN kind = 'weapon' THEN 'weapon'
  WHEN kind = 'armor' AND name ~* '(helm|visor|crown|mask|goggles|optic|cowl|hood|veil|circlet|halo|headpiece|faceplate)' THEN 'helm'
  WHEN kind = 'armor' THEN 'armor'
  WHEN kind IN ('tool','scroll','artifact','implant') THEN 'trinket'
  ELSE NULL
END;

-- Hand-fix: obvious projectile hardware weapons the heuristic placed in melee.
UPDATE items_master SET equip_slot = 'ranged'
WHERE id IN ('railgun_forearm_mount','tungsten_fragmentation_launcher');

-- Backfill the live inventory from the now-canonical catalog slot.
UPDATE inventory inv
SET equip_slot = m.equip_slot
FROM items_master m
WHERE m.id = inv.item_id
  AND m.equip_slot IS NOT NULL
  AND (inv.equip_slot IS DISTINCT FROM m.equip_slot);

COMMIT;
