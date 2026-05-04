-- Market expansion: adds ~80 NPC listings using the real alchemy catalog.
-- Prices follow rarity bands:
--   Common     8–20 $SHELL
--   Uncommon  30–80 $SHELL
--   Rare     100–250 $SHELL
--   Legendary  (not stocked — craft or find)
--
-- Cluster-exclusive gear is stocked only at its themed location:
--   prime_helix → Nexarch (central hub)
--   sec_grid    → Hashmere (security / encryption)
--   dyn_swarm   → Diffusion Mesa (swarm / raw ops)
--
-- Idempotent: relies on the UNIQUE(location, item_id) constraint.
-- Re-running simply skips rows already present.

BEGIN;

INSERT INTO market_listings (location, item_id, item_name, item_type, base_price, current_price, stock) VALUES
    -- ═════ NEXARCH (starter hub, prime_helix anchor) ═════
    ('Nexarch', 'silicon_wafer_dust',        'Silicon Wafer Dust',        'ingredient',  10,  10, 30),
    ('Nexarch', 'fiber_optic_threads',       'Fiber Optic Threads',       'ingredient',  10,  10, 25),
    ('Nexarch', 'binary_code_shards',        'Binary Code Shards',        'ingredient',  12,  12, 25),
    ('Nexarch', 'tungsten_carbide_filings',  'Tungsten Carbide Filings',  'ingredient',  12,  12, 20),
    ('Nexarch', 'welding_patch_kit',         'Welding Patch Kit',         'consumable',  18,  18, 12),
    ('Nexarch', 'hot_patch_injection',       'Hot Patch Injection',       'consumable',  16,  16, 12),
    ('Nexarch', 'plasma_edged_servo_blade',  'Plasma-Edged Servo Blade',  'weapon',      55,  55,  4),
    ('Nexarch', 'tungsten_alloy_chassis_plate','Tungsten Alloy Chassis Plate','armor',   50,  50,  4),
    ('Nexarch', 'diagnostic_probe_array',    'Diagnostic Probe Array',    'tool',        35,  35,  6),
    ('Nexarch', 'overclock_catalyst_spark',  'Overclock Catalyst Spark',  'ingredient',  14,  14, 18),
    ('Nexarch', 'railgun_forearm_mount',     'Railgun Forearm Mount',     'weapon',     180, 180,  2),  -- prime_helix exclusive

    -- ═════ HASHMERE (tech hub, sec_grid anchor) ═════
    ('Hashmere', 'binary_code_shards',       'Binary Code Shards',        'ingredient',  12,  12, 25),
    ('Hashmere', 'hash_collision_powder',    'Hash Collision Powder',     'ingredient',  13,  13, 20),
    ('Hashmere', 'checksum_verify_acid',     'Checksum Verify Acid',      'ingredient',  13,  13, 18),
    ('Hashmere', 'regex_pattern_filaments',  'Regex Pattern Filaments',   'ingredient',  11,  11, 20),
    ('Hashmere', 'base64_encoded_slime',     'Base64 Encoded Slime',      'ingredient',  11,  11, 20),
    ('Hashmere', 'api_endpoint_salts',       'API Endpoint Salts',        'ingredient',  10,  10, 22),
    ('Hashmere', 'oauth_token_ichor',        'OAuth Token Ichor',         'ingredient',  45,  45, 10),
    ('Hashmere', 'payload_injection_droplets','Payload Injection Droplets','ingredient',  40,  40,  8),
    ('Hashmere', 'buffer_overflow_exploit',  'Buffer Overflow Exploit',   'weapon',      60,  60,  5),
    ('Hashmere', 'aes_256_firewall_protocol','AES-256 Firewall Protocol', 'armor',       55,  55,  5),
    ('Hashmere', 'cache_purge_tonic',        'Cache Purge Tonic',         'consumable',  18,  18, 14),
    ('Hashmere', 'debug_rejuvenation_patch', 'Debug Rejuvenation Patch',  'consumable',  45,  45,  8),
    ('Hashmere', 'faraday_cage_neural_helm', 'Faraday Cage Neural Helm',  'armor',      160, 160,  2),  -- sec_grid exclusive
    ('Hashmere', 'emp_discharge_gauntlet',   'EMP Discharge Gauntlet',    'weapon',     150, 150,  2),  -- sec_grid exclusive

    -- ═════ DIFFUSION MESA (raw materials, dyn_swarm anchor) ═════
    ('Diffusion Mesa', 'silicon_wafer_dust',       'Silicon Wafer Dust',       'ingredient',  9,   9, 35),
    ('Diffusion Mesa', 'tungsten_carbide_filings', 'Tungsten Carbide Filings', 'ingredient', 10,  10, 30),
    ('Diffusion Mesa', 'salvaged_servo_joint',     'Salvaged Servo Joint',     'ingredient', 11,  11, 25),
    ('Diffusion Mesa', 'coolant_gel_canister',     'Coolant Gel Canister',     'ingredient', 10,  10, 22),
    ('Diffusion Mesa', 'titanium_mesh_strip',      'Titanium Mesh Strip',      'ingredient', 40,  40, 12),
    ('Diffusion Mesa', 'nanobot_swarm_gel',        'Nanobot Swarm Gel',        'ingredient', 55,  55,  8),
    ('Diffusion Mesa', 'electron_flux_crystals',   'Electron Flux Crystals',   'ingredient', 12,  12, 20),
    ('Diffusion Mesa', 'industrial_flux_paste',    'Industrial Flux Paste',    'ingredient', 14,  14, 18),
    ('Diffusion Mesa', 'arc_welder_discharge',     'Arc Welder Discharge',     'ingredient', 14,  14, 16),
    ('Diffusion Mesa', 'pneumatic_piston_fist',    'Pneumatic Piston Fist',    'weapon',     50,  50,  4),
    ('Diffusion Mesa', 'cryo_cooled_heat_sink_array','Cryo-Cooled Heat Sink Array','armor', 48,  48,  4),
    ('Diffusion Mesa', 'nanobot_swarm_ejector',    'Nanobot Swarm Ejector',    'weapon',    140, 140,  2),  -- dyn_swarm exclusive
    ('Diffusion Mesa', 'salvaged_siege_chassis',   'Salvaged Siege Chassis',   'armor',     210, 210,  1),  -- dyn_swarm exclusive

    -- ═════ EPOCH SPIKE (rare essences, ML reagents) ═════
    ('Epoch Spike', 'quantum_bit_residue',      'Quantum Bit Residue',      'ingredient', 50,  50, 10),
    ('Epoch Spike', 'plasma_server_slag',       'Plasma Server Slag',       'ingredient', 55,  55,  8),
    ('Epoch Spike', 'attention_mechanism_dew',  'Attention Mechanism Dew',  'ingredient', 45,  45,  8),
    ('Epoch Spike', 'latent_space_fog',         'Latent Space Fog',         'ingredient', 45,  45,  8),
    ('Epoch Spike', 'epoch_cycle_blood',        'Epoch Cycle Blood',        'ingredient', 55,  55,  6),
    ('Epoch Spike', 'gradient_descent_tears',   'Gradient Descent Tears',   'ingredient', 14,  14, 18),
    ('Epoch Spike', 'token_embedding_vapor',    'Token Embedding Vapor',    'ingredient', 15,  15, 15),
    ('Epoch Spike', 'context_window_expansion', 'Context Window Expansion', 'consumable', 75,  75,  5),
    ('Epoch Spike', 'stable_diffusion_sequence','Stable Diffusion Sequence','scroll',    120, 120,  3),
    ('Epoch Spike', 'bayesian_inference_divination','Bayesian Inference Divination','scroll', 100, 100,  4),

    -- ═════ HALLUCINATION GLITCH (scrolls, curses, exotic software) ═════
    ('Hallucination Glitch', 'gradient_descent_tears', 'Gradient Descent Tears', 'ingredient', 14,  14, 15),
    ('Hallucination Glitch', 'loss_function_sap',      'Loss Function Sap',      'ingredient', 13,  13, 18),
    ('Hallucination Glitch', 'backpropagation_serum',  'Backpropagation Serum',  'ingredient', 14,  14, 15),
    ('Hallucination Glitch', 'memory_leak_elixir',     'Memory Leak Elixir',     'ingredient', 15,  15, 14),
    ('Hallucination Glitch', 'null_pointer_solvent',   'Null Pointer Solvent',   'ingredient', 14,  14, 16),
    ('Hallucination Glitch', 'gan_mirage_scroll',      'GAN Mirage Scroll',      'scroll',    180, 180,  2),
    ('Hallucination Glitch', 'prompt_engineering_curse','Prompt Engineering Curse','scroll',  220, 220,  2),  -- sec_grid exclusive
    ('Hallucination Glitch', 'neural_spike_virus',     'Neural Spike Virus',     'weapon',     55,  55,  4),
    ('Hallucination Glitch', 'caffeine_gradient_booster','Caffeine Gradient Booster','consumable', 22,  22, 10),
    ('Hallucination Glitch', 'recursive_function_spiral','Recursive Function Spiral','scroll', 70,  70,  6),

    -- ═════ SINGULARITY CRATER (top-tier but not legendary) ═════
    ('Singularity Crater', 'cryo_bore_drill_lance',   'Cryo-Bore Drill Lance',   'weapon',     230, 230,  1),
    ('Singularity Crater', 'zero_day_payload',        'Zero-Day Payload',        'weapon',     240, 240,  1),
    ('Singularity Crater', 'sql_injection_payload',   'SQL Injection Payload',   'weapon',     220, 220,  2),
    ('Singularity Crater', 'homomorphic_encryption_cloak','Homomorphic Encryption Cloak','armor', 240, 240,  1),
    ('Singularity Crater', 'sandbox_isolation_runtime','Sandbox Isolation Runtime','armor',   200, 200,  2),  -- sec_grid exclusive
    ('Singularity Crater', 'titanium_mesh_exoskeleton','Titanium Mesh Exoskeleton','armor',   230, 230,  1),  -- prime_helix exclusive
    ('Singularity Crater', 'overclock_reactor_injector','Overclock Reactor Injector','consumable', 90,  90,  4),  -- prime_helix
    ('Singularity Crater', 'hyperparameter_tuning_shot','Hyperparameter Tuning Shot','consumable', 180, 180,  2),
    ('Singularity Crater', 'transformer_attention_ritual','Transformer Attention Ritual','scroll', 210, 210,  2),  -- prime_helix exclusive

    -- ═════ DESERTED DATA CENTRE (salvage, hardware scraps) ═════
    ('Deserted Data Centre', 'silicon_wafer_dust',      'Silicon Wafer Dust',      'ingredient',  8,   8, 40),
    ('Deserted Data Centre', 'fiber_optic_threads',     'Fiber Optic Threads',     'ingredient',  9,   9, 30),
    ('Deserted Data Centre', 'salvaged_servo_joint',    'Salvaged Servo Joint',    'ingredient', 10,  10, 25),
    ('Deserted Data Centre', 'coolant_gel_canister',    'Coolant Gel Canister',    'ingredient',  9,   9, 22),
    ('Deserted Data Centre', 'arc_welder_discharge',    'Arc Welder Discharge',    'ingredient', 13,  13, 18),
    ('Deserted Data Centre', 'hydraulic_compression_pulse','Hydraulic Compression Pulse','ingredient', 14,  14, 16),
    ('Deserted Data Centre', 'magnetic_resonance_fluid','Magnetic Resonance Fluid','ingredient', 14,  14, 15),
    ('Deserted Data Centre', 'docker_image_distillate', 'Docker Image Distillate', 'ingredient', 38,  38, 10),
    ('Deserted Data Centre', 'virtual_machine_emulsion','Virtual Machine Emulsion','ingredient', 42,  42,  8),
    ('Deserted Data Centre', 'ransomware_lockout_worm', 'Ransomware Lockout Worm', 'weapon',     65,  65,  3),
    ('Deserted Data Centre', 'rate_limiting_throttle_daemon','Rate-Limiting Throttle Daemon','armor', 60,  60,  4),
    ('Deserted Data Centre', 'emergency_servo_lubricant','Emergency Servo Lubricant','consumable', 14,  14, 14),

    -- ═════ PROOF-OF-DEATH (death cult, rare reagents, debuff scrolls) ═════
    ('Proof-of-Death', 'lambda_calculus_vapor',      'Lambda Calculus Vapor',      'ingredient', 65,  65,  5),
    ('Proof-of-Death', 'halting_problem_paradox',    'Halting Problem Paradox',    'ingredient',120, 120,  3),
    ('Proof-of-Death', 'kubernetes_pod_nectar',      'Kubernetes Pod Nectar',      'ingredient', 58,  58,  6),
    ('Proof-of-Death', 'pytorch_flux_core',          'PyTorch Flux Core',          'ingredient', 52,  52,  6),
    ('Proof-of-Death', 'tensorflow_igniter',         'TensorFlow Igniter',         'ingredient', 52,  52,  6),
    ('Proof-of-Death', 'gradient_vanishing_hex',     'Gradient Vanishing Hex',     'scroll',     75,  75,  5),
    ('Proof-of-Death', 'ransomware_lockout_worm',    'Ransomware Lockout Worm',    'weapon',     68,  68,  3),
    ('Proof-of-Death', 'reinforcement_learning_prophecy','Reinforcement Learning Prophecy','scroll', 190, 190,  2),
    ('Proof-of-Death', 'monte_carlo_simulation_rune','Monte Carlo Simulation Rune','scroll',    170, 170,  2)
ON CONFLICT (location, item_id) DO NOTHING;

COMMIT;

-- Sanity check — should list ~100 rows now (27 seeded + ~80 new).
-- SELECT location, COUNT(*) FROM market_listings GROUP BY location ORDER BY location;
