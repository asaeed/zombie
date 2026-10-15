'use strict';

const TILE = 40;
const MAP_W = 80;
const MAP_H = 80;

const TILE_GRASS = 0;
const TILE_DIRT  = 1;
const TILE_WATER = 2;

const UNIT_DEFS = {
  soldier: { name:'Soldier', maxHp:100, speed:90,  atkRange:165, atkDmg:25, atkRate:1.5, radius:10, cost:75,  color:'#4a9eff', trainTime:8 },
  builder: { name:'Builder', maxHp:60,  speed:70,  atkRange:70,  atkDmg:8,  atkRate:0.8, radius:10, cost:50,  color:'#ed8128', trainTime:6 },
  scout:   { name:'Scout',   maxHp:50,  speed:180, atkRange:120, atkDmg:9,  atkRate:2.0, radius:8,  cost:60,  color:'#00ffcc', trainTime:5 },
  medic:   { name:'Medic',   maxHp:70,  speed:100, atkRange:0,   atkDmg:0,  atkRate:0,   radius:9,  cost:90,  color:'#ff77aa', trainTime:9 },
  sniper: { name:'Sniper', maxHp:70, speed:78, atkRange:390, atkDmg:65, atkRate:0.55, radius:9, cost:150, color:'#54c76c', trainTime:12, requires:'mechanics' },
  heavy: { name:'Heavy', maxHp:420, speed:62, atkRange:50, atkDmg:42, atkRate:0.7, radius:13, cost:140, color:'#373c40', trainTime:12, requires:'mechanics' },
  torchbearer: { name:'Torchbearer', maxHp:85, speed:85, atkRange:90, atkDmg:8, atkRate:1.0, radius:10, cost:120, color:'#e8d12b', trainTime:10, requires:'mechanics' },
};
UNIT_DEFS.medic.requires = 'clinic';
const TRAINABLE_UNITS = ['soldier', 'builder', 'scout', 'medic', 'sniper', 'heavy', 'torchbearer'];

const VEHICLE_DEFS = {
  suv: { name:'Armored Truck', maxHp:500, speed:155, radius:17, capacity:4, cost:350, trainTime:20 },
};

const BUILDING_DEFS = {
  hq:       { name:'HQ',           maxHp:1000, tileSize:3, cost:0,   color:'#6655cc', canBuild:false },
  wall:     { name:'Wall',         maxHp:250,  tileSize:1, cost:20,  color:'#778877', canBuild:true },
  tower:    { name:'Guard Tower',  maxHp:350,  tileSize:2, footprint:{width:1.25,height:1.25}, cost:150, color:'#cc9922', canBuild:true, atkRange:220, atkDmg:40, atkRate:1.0 },
  barracks: { name:'Barracks',     maxHp:500,  tileSize:2, cost:200, color:'#883322', canBuild:true },
  depot:    { name:'Supply Depot', maxHp:300,  tileSize:2, cost:75, color:'#445566', canBuild:true },
  light:    { name:'Light Tower',  maxHp:200,  tileSize:1, cost:60,  color:'#ddcc66', canBuild:true },
  clinic:   { name:'Clinic',       maxHp:320, tileSize:2, cost:160, color:'#cc657e', canBuild:true },
  mechanics:{ name:'Mechanics Bay',maxHp:450, tileSize:2, cost:250, color:'#8c9d9b', canBuild:true },
};

const ZOMBIE_DEFS = {
  walker: { name:'Walker', maxHp:80,  speed:35, atkRange:35, atkDmg:15, atkRate:0.8, radius:9,  reward:5,  color:'#b6c3bf' },
  runner: { name:'Runner', maxHp:40,  speed:110, atkRange:28, atkDmg:10, atkRate:1.5, radius:7,  reward:8,  color:'#b6c3bf' },
  brute:  { name:'Brute',  maxHp:1000, speed:18, atkRange:40, atkDmg:55, atkRate:0.5, radius:15, reward:30, color:'#b6c3bf' },
  spitter: { name:'Spitter', maxHp:65, speed:30, atkRange:120, atkDmg:22, atkRate:0.55, radius:9, reward:12, color:'#a6d94e' },
  exploder: { name:'Exploder', maxHp:95, speed:72, atkRange:22, atkDmg:0, atkRate:0, radius:11, reward:15, color:'#ee7a38' },
  screamer: { name:'Screamer', maxHp:110, speed:42, atkRange:32, atkDmg:8, atkRate:0.6, radius:10, reward:18, color:'#d883d2' },
  boss: { name:'Boss Brute', maxHp:3600, speed:20, atkRange:45, atkDmg:140, atkRate:0.45, radius:22, reward:100, color:'#b6c3bf' },
};

const WAVE_TABLE = [
  { walkers:8,  runners:0,  brutes:0, spitters:0, exploders:0, screamers:0 },
  { walkers:12, runners:3,  brutes:0, spitters:0, exploders:0, screamers:0 },
  { walkers:15, runners:5,  brutes:1, spitters:0, exploders:0, screamers:0 },
  { walkers:18, runners:8,  brutes:2, spitters:2, exploders:0, screamers:0 },
  { walkers:20, runners:12, brutes:3, spitters:3, exploders:0, screamers:0 },
  { walkers:25, runners:15, brutes:4, spitters:4, exploders:2, screamers:0 },
  { walkers:27, runners:17, brutes:4, spitters:4, exploders:3, screamers:0 },
  { walkers:30, runners:18, brutes:5, spitters:5, exploders:3, screamers:1 },
];

const FIRST_WAVE_DELAY = 90;
const WAVE_INTERVAL    = 60;
const WAVE_WARNING     = 20;
const SCREAMER_AURA_RADIUS = 5 * TILE;
const SCREAMER_SPEED_FACTOR = 1.35;
const SCREAMER_TRIGGER_RADIUS = 5 * TILE;
const SCREAMER_SHRIEK_RADIUS = 9 * TILE;
const SCREAMER_SHRIEK_INTERVAL = 8;
const EXPLODER_BLAST_RADIUS = 2.6 * TILE;
const EXPLODER_SHOT_RADIUS = 4.5 * TILE;
const HEAVY_SWING_RADIUS = 55;
const TORCH_LIGHT_RADIUS = 9;
const STARTING_SUPPLIES = 500;

const CAM_SPEED = 500; // px/sec keyboard pan
const EDGE_SCROLL_MARGIN = 40; // px from edge triggers scroll
const MINIMAP_W = 180;
const MINIMAP_H = 90; // projected iso map is 2:1, so the minimap diamond fits exactly

// ── Isometric projection ──────────────────────────────────────────────────────
// One world tile (TILE=40 world px) renders as a 64×32 diamond at zoom 1.
const ISO_X = 0.8;   // screen px per world px along (wx - wy)
const ISO_Y = 0.4;   // screen px per world px along (wx + wy)
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
// Building volume heights in screen px at zoom 1 (placeholder iso volumes)
const ISO_HEIGHTS = { hq: 44, wall: 18, tower: 48, barracks: 34, depot: 26, light: 38, clinic: 30, mechanics: 34 };

// ── Phase 3: scavenging economy ───────────────────────────────────────────────
const CACHE_COUNT = 44;
const CACHE_MIN_CENTER_DIST = 14;        // tiles from map center
const CACHE_TYPES = ['car', 'cabin', 'bin'];
const CACHE_HEIGHTS = { car: 12, cabin: 26, bin: 10 };
const CARRY_CAPACITY = { soldier: 20, builder: 30, scout: 30, medic: 20, sniper: 20, heavy: 20, torchbearer: 20 };
const RESOURCE_TRANSFER_RATE = { soldier: 4, builder: 4, scout: 8, medic: 4, sniper: 4, heavy: 4, torchbearer: 4 };
const CARGO_FULL_SPEED_FACTOR = 0.65;    // full packs slow movement to 65%
const CARGO_FULL_ATK_FACTOR = 0.65;      // full packs slow firing cadence to 65%
const SEARCH_TIME = 2;                   // seconds adjacent to an unsearched cache
const SEARCH_RADIUS = 1.5;               // tiles
const CACHE_GATHER_RADIUS = 6 * TILE;    // nearby caches to finish a partial load
const BUNDLE_GATHER_RADIUS = 4 * TILE;   // dropped-supply sources around the clicked point
const DROP_RADIUS = 3;                   // tiles from HQ/depot to bank carried supplies
const HQ_STORAGE = 500;                  // base storage at the HQ
const DEPOT_STORAGE = 250;               // extra storage capacity per depot
const VISION = { soldier: 8, builder: 6, scout: 12, medic: 7, sniper: 9, heavy: 7, torchbearer: TORCH_LIGHT_RADIUS, suv: 9, hq: 10, wall: 3, tower: 9, barracks: 6, depot: 6, light: 12, clinic: 6, mechanics: 6 };
const FOG_INTERVAL = 0.1;                // seconds between visibility recomputes
const GUARD_STRAYS = 10;
const GUARD_WAKE_RADIUS = 3 * TILE;      // proximity wake
const GUARD_GUNFIRE_RADIUS = 6 * TILE;   // gunfire wake (from the shooter)
const REPAIR_TICK_COST = 5;              // supplies per repair tick
const REPAIR_TICK_AMOUNT = 20;
const REPAIR_TICK_INTERVAL = 1.0;        // seconds; half the old repair speed
const BUILDER_REPAIR_RADIUS = 5.5 * TILE;
const MEDIC_HEAL_RADIUS = 5.5 * TILE;
const MEDIC_HEAL_AMOUNT = 12;
const MEDIC_HEAL_INTERVAL = 0.5;

// ── Phase 4: light & dark ─────────────────────────────────────────────────────
const DAY_LENGTH = 180;                  // seconds of daylight per cycle
const NIGHT_LENGTH = 120;                // seconds of night per cycle
const CYCLE_TRANSITION = 15;             // dusk/dawn ramp seconds
const NIGHT_VISION_FACTOR = 0.4;         // vision radii shrink to this at full night
const FLARE_COST = 50;
const FLARE_COOLDOWN = 60;               // seconds
const FLARE_DURATION = 10;               // seconds burning
const FLARE_LIGHT_RADIUS = 9;            // tiles of light/vision while burning
const FLARE_FIRE_RADIUS = 4;             // tiles: zombies ignited near a flare
const FIRE_DURATION = 6;                 // seconds a zombie burns
const FIRE_DPS = 12;                     // fire damage per second
const FIRE_SPEED_FACTOR = 1.2;           // burning zombies move faster, never stop for flares
const FIRE_LIGHT_RADIUS = 3;             // burning zombies are moving light sources
const FIRE_SPREAD_RADIUS = 24;            // world px: only near-contact spreads fire
const FIRE_SPREAD_FACTOR = 0.6;           // each hop burns for less time
const SAVE_VERSION = 1;
