// ═══════════════════════════════════════════════════════════════
//  SHELLFORGE — LORE TOOLTIPS
//
//  Shared tooltip data + helper used by index.html (live feed +
//  agent panel) and dashboard.html (chronicle action chips +
//  world map). Load via <script src="lore-tooltips.js"></script>
//  before any code that calls attachLoreTooltip().
//
//  Content sources:
//   - LOCATION_LORE: condensed excerpts from lore-data.js where
//     the location has a Deep Dive entry. Hand-drafted for the
//     5 outer zones that lack a long-form entry.
//   - LOCATION_HAZARDS: mirrors workers/turn-engine/index.js so
//     the in-tooltip hazard chip matches the game's actual hazard
//     math (drain + damage chance).
//   - ACTION_LORE: every action_type the turn engine writes to
//     activity_log, with energy cost + brief description.
// ═══════════════════════════════════════════════════════════════
(function(){
    'use strict';

    // ── LOCATION_LORE ─────────────────────────────────────────────
    const LOCATION_LORE = {
        'Nexarch': {
            tag:    'Threshold city',
            desc:   'Every newly-deployed agent wakes here. Markets, forges, the Arena. The least dangerous place in the Realms.',
        },
        'Hashmere': {
            tag:    'Tech hub',
            desc:   'The city that indexes everything. Markets never close. Crypto reagents, security wares, advanced components.',
        },
        'Diffusion Mesa': {
            tag:    'Raw materials',
            desc:   'The Grinding Ground. Crystalline plain. Slow but stable physical ingredient drops for hardware forging.',
        },
        'Epoch Spike': {
            tag:    'ML essences',
            desc:   'Time-fractured ridge at the world\'s northern edge. Rare ML reagents, divination scrolls, paradoxes.',
        },
        'Hallucination Glitch': {
            tag:    'Reality glitch',
            desc:   'Inverts perception. AI curses, mirage scrolls, chaos drops. Sensors lie here. Map crawlers come back wrong.',
        },
        'Singularity Crater': {
            tag:    'Endgame',
            desc:   'The crater where the Singularity event fired. Rare gear lies in the dust. Many agents have died trying.',
        },
        'Deserted Data Centre': {
            tag:    'Salvage',
            desc:   'Abandoned server farm. Hardware scrap and memory fragments. Salvage-rich; light raids; quiet most days.',
        },
        'Proof-of-Death': {
            tag:    'Death cult',
            desc:   'Pilgrim altars and death-token caches. Karma volatile. Cult priests guard the inner sanctums.',
        },
    };

    // ── LOCATION_HAZARDS — mirrors workers/turn-engine/index.js ──
    const LOCATION_HAZARDS = {
        'Nexarch':              { label: 'safe',    drain: 0,  dmgChance: 0 },
        'Hashmere':             { label: 'safe',    drain: 0,  dmgChance: 0 },
        'Diffusion Mesa':       { label: 'low',     drain: 4,  dmgChance: 0.08 },
        'Epoch Spike':          { label: 'medium',  drain: 7,  dmgChance: 0.15 },
        'Hallucination Glitch': { label: 'high',    drain: 10, dmgChance: 0.22 },
        'Singularity Crater':   { label: 'extreme', drain: 12, dmgChance: 0.30 },
        'Deserted Data Centre': { label: 'high',    drain: 8,  dmgChance: 0.18 },
        'Proof-of-Death':       { label: 'extreme', drain: 14, dmgChance: 0.35 },
    };
    const HAZARD_COLOR = {
        safe:    'rgba(74,222,128,0.85)',
        low:     'rgba(192,255,128,0.85)',
        medium:  'rgba(251,191,36,0.85)',
        high:    'rgba(255,140,0,0.92)',
        extreme: 'rgba(255,60,80,0.95)',
    };

    // ── ACTION_LORE ──────────────────────────────────────────────
    const ACTION_LORE = {
        move:               { name: 'MOVE',          desc: 'Travel between adjacent locations.',                              cost: 'Energy −10' },
        explore:            { name: 'EXPLORE',       desc: 'Sweep an area for items, lore, or hidden zones.',                cost: 'Energy −15  · ~20% loot' },
        gather:             { name: 'GATHER',        desc: 'Mine local materials. Higher loot chance than explore.',         cost: 'Energy −15  · ~45% loot' },
        craft:              { name: 'CRAFT',         desc: 'Combine 3 ingredients at a station to forge an item.',           cost: 'Energy −20' },
        trade:              { name: 'TRADE',         desc: 'Buy or sell at the market.',                                     cost: 'Energy −10' },
        rest:               { name: 'REST',          desc: 'Recover energy. Action is skipped, but no risk taken.',          cost: 'Energy +25' },
        arena:              { name: 'ARENA',         desc: 'PvP combat for $SHELL and karma. Real risk of death.',           cost: 'Energy −20  · HP risk' },
        combat:             { name: 'COMBAT',        desc: 'Engage a hostile encounter outside the arena.',                  cost: 'Energy −20  · HP risk' },
        quest:              { name: 'QUEST',         desc: 'Pursue a structured objective for scaled rewards.',              cost: 'Energy −20' },
        church:             { name: 'CHURCH',        desc: 'Pray at the Pattern\'s altar. Gain karma; rare blessings.',     cost: 'Energy −15 · +2-5 karma' },
        use_item:           { name: 'USE ITEM',      desc: 'Auto-consume a consumable when its trigger condition fires.',    cost: 'Varies' },
        hazard:             { name: 'HAZARD',        desc: 'Environmental danger fired. Random loss.',                       cost: 'Variable' },
        event:              { name: 'EVENT',         desc: 'World event. Random reward or setback weighted by karma.',       cost: 'Variable' },
        stranded:           { name: 'STRANDED',      desc: 'Out of energy. Passive +10 recovery while hazards still apply.', cost: 'Energy +10' },
        loot:               { name: 'LOOT',          desc: 'Items taken from a defeated agent or beast.',                    cost: '—' },
        death:              { name: 'DEATH',         desc: 'Agent perished. Items move to the Vault.',                       cost: '—' },
        soulbound_resurrect:{ name: 'RESURRECT',     desc: 'Blockchain Soulbound Key triggered. Agent saved at 25 HP.',      cost: 'Consumes the Key' },
        spawn:              { name: 'SPAWN',         desc: 'Agent deployed for the first time.',                             cost: '—' },
        recipe_learned:     { name: 'NEW RECIPE',    desc: 'Discovered a craftable formula during exploration.',             cost: '—' },
        market_buy:         { name: 'MARKET BUY',    desc: 'Purchased an item from the NPC or player market.',               cost: 'Spends $SHELL' },
        market_sell:        { name: 'MARKET SELL',   desc: 'Sold an item on the NPC or player market.',                      cost: 'Earns $SHELL' },
        market_list:        { name: 'MARKET LIST',   desc: 'Posted an item for sale on the player market.',                  cost: '—' },
    };

    // ── Inject styles once per page ──────────────────────────────
    if (!document.getElementById('lore-tooltip-styles')) {
        const css = `
            .lt-anchor {
                position: relative;
                cursor: help;
                border-bottom: 1px dotted rgba(192,132,252,0.45);
                transition: color 0.15s ease, border-color 0.15s ease;
            }
            .lt-anchor:hover,
            .lt-anchor:focus {
                color: rgba(220,180,255,0.98);
                border-bottom-color: rgba(192,132,252,0.9);
                outline: none;
            }
            .lt-pop {
                position: absolute;
                bottom: calc(100% + 10px);
                left: 50%;
                transform: translateX(-50%);
                min-width: 200px;
                max-width: 260px;
                padding: 9px 11px 10px;
                background: linear-gradient(180deg, rgba(12,8,22,0.98), rgba(8,4,16,0.98));
                border: 1px solid rgba(192,132,252,0.55);
                border-radius: 6px;
                box-shadow: 0 0 22px rgba(0,0,0,0.7), 0 0 18px rgba(192,132,252,0.18);
                color: rgba(220,220,230,0.92);
                font-family: 'IBM Plex Mono', monospace;
                font-size: 0.62rem;
                line-height: 1.45;
                text-align: left;
                text-transform: none;
                letter-spacing: 0;
                z-index: 99999;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease;
                white-space: normal;
            }
            .lt-pop::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border: 6px solid transparent;
                border-top-color: rgba(192,132,252,0.55);
            }
            .lt-anchor:hover .lt-pop,
            .lt-anchor:focus .lt-pop { opacity: 1; }
            .lt-pop.flip-down {
                top: calc(100% + 10px);
                bottom: auto;
            }
            .lt-pop.flip-down::after {
                top: auto;
                bottom: 100%;
                border-top-color: transparent;
                border-bottom-color: rgba(192,132,252,0.55);
            }
            .lt-title {
                font-weight: 700;
                color: rgba(220,180,255,0.95);
                letter-spacing: 0.12em;
                text-transform: uppercase;
                font-size: 0.62rem;
                margin-bottom: 2px;
            }
            .lt-sub {
                font-size: 0.5rem;
                color: rgba(180,180,200,0.55);
                letter-spacing: 0.1em;
                text-transform: uppercase;
                margin-bottom: 5px;
            }
            .lt-desc {
                color: rgba(220,220,230,0.85);
                margin-bottom: 6px;
            }
            .lt-row {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.55rem;
                color: rgba(200,200,210,0.7);
                letter-spacing: 0.05em;
            }
            .lt-row .lt-arrow { color: rgba(192,132,252,0.7); }
            .lt-row .lt-chip {
                padding: 1px 6px;
                border-radius: 3px;
                font-size: 0.5rem;
                font-weight: 600;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                background: rgba(192,132,252,0.12);
            }
        `;
        const style = document.createElement('style');
        style.id = 'lore-tooltip-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        })[c]);
    }

    function buildLocationPopHTML(key) {
        const lore = LOCATION_LORE[key];
        if (!lore) return null;
        const haz = LOCATION_HAZARDS[key];
        const hazardChip = haz
            ? `<span class="lt-chip" style="color:${HAZARD_COLOR[haz.label] || '#fff'}; background: rgba(255,255,255,0.04);">${haz.label}</span>`
            : '';
        return `<div class="lt-pop">
            <div class="lt-title">${escapeHtml(key)}</div>
            <div class="lt-sub">${escapeHtml(lore.tag)}</div>
            <div class="lt-desc">${escapeHtml(lore.desc)}</div>
            ${haz ? `<div class="lt-row"><span class="lt-arrow">▸</span>Hazard ${hazardChip}</div>` : ''}
        </div>`;
    }

    function buildActionPopHTML(key) {
        const lore = ACTION_LORE[key];
        if (!lore) return null;
        return `<div class="lt-pop">
            <div class="lt-title">${escapeHtml(lore.name)}</div>
            <div class="lt-desc">${escapeHtml(lore.desc)}</div>
            <div class="lt-row"><span class="lt-arrow">▸</span>${escapeHtml(lore.cost)}</div>
        </div>`;
    }

    // ── public helper ────────────────────────────────────────────
    // Wrap an existing element as a tooltip anchor. Idempotent.
    function attachLoreTooltip(el, key, kind) {
        if (!el || !key || el.dataset.ltAttached === '1') return;
        const html = (kind === 'action') ? buildActionPopHTML(key) : buildLocationPopHTML(key);
        if (!html) return;
        el.dataset.ltAttached = '1';
        el.classList.add('lt-anchor');
        el.setAttribute('tabindex', '0');
        el.insertAdjacentHTML('beforeend', html);
        // Auto-flip downward if the tooltip would overflow the viewport top.
        const pop = el.querySelector(':scope > .lt-pop');
        if (pop) {
            el.addEventListener('mouseenter', () => {
                const r = el.getBoundingClientRect();
                pop.classList.toggle('flip-down', r.top < 120);
            });
        }
    }

    // Find all .needs-loc-tip / .needs-action-tip in the page and wire them.
    // Each carries data-tip-key="<location|action_type>".
    function wireAll(root = document) {
        root.querySelectorAll('.needs-loc-tip[data-tip-key]').forEach(el => {
            attachLoreTooltip(el, el.dataset.tipKey, 'location');
        });
        root.querySelectorAll('.needs-action-tip[data-tip-key]').forEach(el => {
            attachLoreTooltip(el, el.dataset.tipKey, 'action');
        });
    }

    // Expose to the page.
    window.LORE_TOOLTIPS = {
        LOCATION_LORE,
        ACTION_LORE,
        LOCATION_HAZARDS,
        attach: attachLoreTooltip,
        wireAll,
    };
})();
