'use strict';

const TILE = 40;
const MAP_W = 80;
const MAP_H = 80;

const TILE_GRASS = 0;
const TILE_DIRT  = 1;
const TILE_WATER = 2;

const UNIT_DEFS = {
  soldier: { name:'Soldier', maxHp:100, speed:90,  atkRange:150, atkDmg:25, atkRate:1.5, radius:10, cost:75,  color:'#4a9eff', trainTime:8 },
  builder:  { name:'Builder', maxHp:60,  speed:70,  atkRange:70,  atkDmg:8,  atkRate:0.8, radius:10, cost:50,  color:'#ffaa00', trainTime:6 },
  scout:    { name:'Scout',   maxHp:50,  speed:150, atkRange:120, atkDmg:15, atkRate:2.0, radius:8,  cost:60,  color:'#00ffcc', trainTime:5 },
};

const BUILDING_DEFS = {
  hq:       { name:'HQ',           maxHp:1000, tileSize:3, cost:0,   color:'#6655cc', canBuild:false },
  wall:     { name:'Wall',         maxHp:250,  tileSize:1, cost:20,  color:'#778877', canBuild:true },
  tower:    { name:'Guard Tower',  maxHp:350,  tileSize:2, cost:150, color:'#cc9922', canBuild:true, atkRange:220, atkDmg:40, atkRate:1.0 },
  barracks: { name:'Barracks',     maxHp:500,  tileSize:2, cost:200, color:'#883322', canBuild:true },
  depot:    { name:'Supply Depot', maxHp:300,  tileSize:2, cost:75, color:'#445566', canBuild:true },
};

const ZOMBIE_DEFS = {
  walker: { name:'Walker', maxHp:80,  speed:35, atkRange:35, atkDmg:15, atkRate:0.8, radius:9,  reward:5,  color:'#4aee22' },
  runner: { name:'Runner', maxHp:40,  speed:95, atkRange:28, atkDmg:10, atkRate:1.5, radius:7,  reward:8,  color:'#aaff00' },
  brute:  { name:'Brute',  maxHp:500, speed:18, atkRange:40, atkDmg:55, atkRate:0.5, radius:15, reward:30, color:'#22bb55' },
};

const WAVE_TABLE = [
  { walkers:8,  runners:0,  brutes:0 },
  { walkers:12, runners:3,  brutes:0 },
  { walkers:15, runners:5,  brutes:1 },
  { walkers:18, runners:8,  brutes:2 },
  { walkers:20, runners:12, brutes:3 },
  { walkers:25, runners:15, brutes:5 },
];

const FIRST_WAVE_DELAY = 90;
const WAVE_INTERVAL    = 60;
const WAVE_WARNING     = 20;
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
const ISO_HEIGHTS = { hq: 44, wall: 18, tower: 48, barracks: 34, depot: 26 };

// ── Phase 3: scavenging economy ───────────────────────────────────────────────
const CACHE_COUNT = 44;
const CACHE_MIN_CENTER_DIST = 14;        // tiles from map center
const CACHE_TYPES = ['car', 'cabin', 'bin'];
const CARRY_CAPACITY = { soldier: 20, builder: 30, scout: 50 };
const SEARCH_TIME = 2;                   // seconds adjacent to an unsearched cache
const SEARCH_RADIUS = 1.5;               // tiles
const DROP_RADIUS = 3;                   // tiles from HQ/depot to bank carried supplies
const BUNDLE_TTL = 60;                   // seconds a dropped bundle survives
const VISION = { soldier: 8, builder: 6, scout: 12, hq: 10, wall: 3, tower: 9, barracks: 6, depot: 6 };
const FOG_INTERVAL = 0.1;                // seconds between visibility recomputes
const GUARD_STRAYS = 10;
const GUARD_WAKE_RADIUS = 3 * TILE;      // proximity wake
const GUARD_GUNFIRE_RADIUS = 6 * TILE;   // gunfire wake (from the shooter)
const REPAIR_TICK_COST = 5;              // supplies per 20 HP repair tick
