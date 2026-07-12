# Dead Zone RTS — Fidelity & Depth Overhaul

**Date:** 2026-07-13
**Status:** Approved direction, spec for implementation planning
**Codebase:** `~/claude/zombie/` — vanilla JS, Canvas 2D, no build step, no dependencies. Keep it that way.

## Vision

A survival RTS where darkness is the enemy's ally. The world is dark; your base is a
pool of warm light. Supplies don't print themselves — you send people out into the
black to search wrecked cars and cabins, wake things that were standing still, and
haul what they find back home before the next horde hits. No help is coming.

## Current state (baseline)

- 80×80 tile map (grass/dirt/water), flat-color rect/circle rendering
- Units: soldier, builder (repair), scout. Buildings: HQ, wall, tower, barracks, depot
- Zombies: walker, runner, brute. Waves every 60s from random edges, count-scaling only
- Economy: 500 start + per-kill rewards + depot passive income (3/s, stackable — degenerate)
- Camera: arrows/edge scroll/minimap click. No zoom. A/S keys conflict (camera vs unit commands)
- Win = survive 10 minutes. Restart = F5

## 1. Visual direction: "Darkest Night" + low-rez 3/4 pixel art

### 1.1 Pixel sprites (3/4 top-down oblique — NOT true isometric)

Square tile grid stays. All game logic, input, and placement code untouched. Sprites are
drawn in 3/4 perspective: buildings have a roof + visible front face extending above
their tile footprint; units/zombies are small upright characters with implied height.

- Base sprite resolution 16×16 (units/zombies) and 16px-per-tile buildings/terrain,
  rendered scaled up with `ctx.imageSmoothingEnabled = false` for crisp pixels
- Sprites authored as embedded pixel data (compact palette-indexed strings in a new
  `js/sprites.js`), rasterized once at load into an offscreen atlas canvas. No binary
  assets, no HTTP fetches — the game stays a folder you open in a browser
- Units/zombies: 2-frame walk animation + idle; zombies get a distinct dormant
  (slouched) frame. Buildings: single sprite each + damaged variant (cracks) below 50% HP
- Terrain: textured tiles with simple edge transitions (grass→dirt, grass→water shore),
  scattered doodads (rocks, shrubs, dead trees) placed at mapgen, water shimmer kept
- Draw order: painter's algorithm sorted by world y so tall sprites overlap correctly
- Risk: hand-authored pixel art quality. Mitigation: tiny sizes, one limited palette
  (~24 colors), consistent light-from-upper-left. Fallback if it disappoints: swap the
  atlas for a CC0 pack (Kenney) — renderer interface stays the same either way

### 1.2 Lighting & darkness

Offscreen "darkness" canvas composited over the world each frame:

- Fill with ambient darkness (alpha varies by time of day), punch out lights with
  radial gradients (`destination-out`): HQ large warm glow, buildings small glow,
  units a modest flashlight radius, flare very bright, floodlight structure very wide
- Day/night cycle: 3 min day / 2 min night (tunable in config). Night = deep darkness
  outside light pools; day = mild dimming only. Subtle color tint shifts (cold blue
  night, amber dusk)
- Wave timer stays independent of the cycle — a wave that happens to land at night is
  simply scarier because visibility shrinks. Scavenging is naturally a daytime
  activity — going out at night is possible but you can't see dormant zombies until
  you're close

### 1.3 Fog of war

Three tile states, stored per tile and updated from unit/building vision radii:

- **Unexplored** — solid black. Caches, terrain, everything hidden
- **Explored** — remembered terrain + static objects (buildings, cache husks) drawn
  dimmed; no live entities (zombies invisible here)
- **Visible** — within current vision of a unit/building; fully lit and live

Vision radius per entity (scout largest). At night, vision radii shrink to roughly the
flashlight radius — fog and lighting share the same source data. Minimap shows fog.
Zombie waves are still announced by direction (see 3.2) so fog doesn't make defense blind.

### 1.4 Juice pass

- Screen shake: brute/boss hits on buildings, exploder detonations
- Hit flash: entities blink white for ~80ms when damaged
- Corpse decals: dead zombies leave a fading stain (capped pool)
- Floating damage numbers (small, pixel font)
- Wave banner: animated "HORDE FROM THE NORTH" slide-in instead of plain HUD text
- Restart button on game-over/victory screens (no more F5)

## 2. Economy: scavenging replaces passive income

### 2.1 Caches

- New entity: **cache** — abandoned car, cabin, dumpster (distinct sprites)
- Placed at mapgen: ~40–50 caches, sparse near center, richer and denser toward map
  edges (distance-weighted contents). None inside the starting base radius
- Contents hidden until searched: roll on search, weighted by distance from center —
  nothing (~25%), small (30–60), medium (80–150), rare large (200+)
- A cache must be **searched** before you know: unit stands adjacent, auto-search
  ~2s (progress ring), then contents revealed. Searched-empty caches gray out

### 2.2 Carry & haul

- Searching auto-loads the unit up to carry capacity; excess stays in the cache for
  more trips. Carry capacity: soldier 20, builder 30, **scout 50** (fast + big bag —
  the scout finally has a job)
- Units bank carried supplies by returning within drop-off radius of the **HQ or a
  depot**. Carried amount shown as a small bag icon + number over the unit
- If a carrying unit dies, the supplies drop on the ground as a lootable bundle
  (despawns after 60s) — risk made visible

### 2.3 Income rebalance

- **Removed:** depot passive income, per-kill rewards
- **Depot re-role:** drop-off point (extends banking radius far from HQ) — enables
  forward scavenging outposts. Cost drops to 75
- **Wave-clear bonus:** small backstop payment (25 + 10×wave) so a picked-clean map
  doesn't hard-starve endless mode
- Starting supplies stay 500; repair now costs supplies (1 per 4 HP restored)

## 3. Threat: zombies & waves

### 3.1 New zombie types

| Type | Role | Notes |
|------|------|-------|
| Spitter | Ranged siege | ~120px range acid lob, hits over walls, fragile. Forces towers/units, walls alone stop working |
| Exploder | Wall breaker | Rushes nearest wall/building, detonates: big AoE building damage. Killing it early detonates it in place harmlessly-ish (smaller radius) |
| Screamer | Force multiplier | Speed-buff aura for nearby zombies; periodically shrieks, waking dormant zombies in a wide radius. Priority target |
| Boss brute | 5th-wave event | Huge HP, smashes walls in a few hits, slight tower-damage resistance. One per 5th wave, +1 each recurrence |

### 3.2 Wave scaling & direction

- HP scaling: zombie HP ×(1 + 0.08×wave) in addition to count scaling
- Each wave picks 1 compass direction (2 directions from wave 6+): spawns cluster on
  that edge. Warning phase (20s) shows direction banner + pulsing minimap edge indicator
- Wave composition table extended for new types; spitters from wave 3, exploders 4,
  screamers 5, boss every 5th

### 3.3 Dormant zombies (map guards)

- Placed at mapgen near caches (count scales with cache value — rich caches are
  guarded) plus scattered strays. Standing idle, slouched sprite, no aggro
- **Activation:** unit within ~3 tiles, OR gunfire within ~6 tiles, OR flare light,
  OR screamer shriek. Activated guards aggro the nearest unit first, then behave as
  normal zombies (flow field to base)
- This makes every scavenging run a stealth-ish risk decision: bring escorts and wake
  the guards, or send a lone fast scout and try to grab-and-go

### 3.4 Endless mode

- At the 10-minute survive mark: "You survived the first night(s)" screen with a
  **Keep playing** option. Scaling continues indefinitely; score keeps counting

## 4. New structures

| Structure | Size | Cost | Function |
|-----------|------|------|----------|
| Gate | 1×1 | 30 | Wall that friendly units path through; zombies treat as wall |
| Barbed wire | 1×1 | 10 | Doesn't block; zombies crossing are slowed ~60% and take slow chip damage; degrades with use |
| Mine | 1×1 | 40 | Hidden once placed; proximity-triggered AoE, single use |
| Floodlight | 1×1 | 60 | Wide light + vision radius. No weapon. The darkness answer |
| Sniper tower | 2×2 | 200 | Very long range, high single-target damage, slow rate. Existing tower = mid-range workhorse |
| Workshop | 2×2 | 250 | One-at-a-time upgrades: tower damage +25%, unit armor +20%, carry capacity +50%, flashlight radius +40% |
| Medic tent | 2×2 | 150 | Slowly heals units in radius |

Depot re-role covered in 2.3. Build panel grows to two rows; hotkeys move to letters
(see 6.3).

## 5. Ability: signal flare

- One button (HUD + hotkey `F`), costs 50 supplies, 60s cooldown
- Click target anywhere explored: flare burns ~10s — bright light (reveals area
  through darkness), and all zombies within a wide radius aggro to the flare point
  while it burns
- Uses: pull a horde off a breached wall, clear a path for a returning hauler, light
  up an area at night. It also *wakes dormant zombies* in its radius — double-edged
- Thematics: no airstrikes, no rescue. You throw a light and run

## 6. Controls & navigation

### 6.1 Camera

- **Mouse-wheel zoom** 0.5×–2.0×, zooming toward the cursor. Renderer gains a
  `camera.zoom` factor; all screen↔world transforms route through shared helpers
  (input.js currently inlines them — consolidate)
- **Middle-mouse drag** to pan; **minimap drag** (not just click) to pan continuously
- Arrows + edge scroll kept. WASD camera removed (keys reassigned, see 6.3)

### 6.2 Jump navigation

- `Space` — center on HQ
- `Ctrl+F1..F4` set camera bookmark; `F1..F4` jump to it
- `N` — jump to most recent alert (building damaged, wave spawn, unit under attack).
  Alerts also ping the minimap
- Double-tap a control-group number — center on that group

### 6.3 Commands & hotkeys (conflict cleanup)

- **Control groups:** `Ctrl+1..9` assign, `1..9` select (replaces number-key build)
- **Build hotkeys:** letters shown on buttons — e.g. `W`all, `G`ate, `T`ower, etc.
  Build panel stays click-first; letters are accelerators
- **Attack-move:** `A` + left-click (units move, engaging anything encountered) —
  replaces the current fake-A. `S` = stop (selected units only, no camera meaning)
- **Rally points:** barracks selected + right-click sets rally; trained units walk there
- `H` — select all idle military units (grab defenders fast)
- Existing: Esc cancel/deselect, Del sell, R repair, Shift multi-select all kept

## 7. Architecture notes

- File layout unchanged (+ `js/sprites.js` for the atlas, + new entity classes in
  entities.js). No modules/bundler — plain script tags stay
- New systems land as: `game.caches[]`, `game.decals[]`, `game.fog` (Uint8Array),
  `game.lighting` (offscreen canvas in renderer), `game.dayTime`, `game.alerts[]`
- Flow field: gates join walls in the blocked set (zombie side); unit A* treats gates
  as open. Barbed wire is non-blocking for both, applies a slow on overlap
- Fog update: recompute visible set each ~100ms from vision sources, not per frame
- Performance budget: 80×80 map, ≤~300 zombies, ≤60 lights — all fine for Canvas 2D
  with the existing viewport culling; lighting canvas is one extra composite per frame

## 8. Implementation phases

Each phase leaves the game playable and better than before:

1. **Controls & camera** — zoom, middle-drag, minimap drag, Space/bookmarks/N-alert,
   control groups, attack-move, stop, rally, hotkey rework, restart button
2. **Economy & exploration** — caches + search + carry/haul + drop bundles, depot
   re-role, kill/passive income removal, repair cost, fog of war (flat overlay
   version), dormant guards
3. **Threat** — spitter/exploder/screamer/boss, HP scaling, directional waves +
   warnings, signal flare, endless mode
4. **Structures** — gate, barbed wire, mine, floodlight, sniper tower, workshop
   upgrades, medic tent, two-row build panel
5. **Visual overhaul** — sprite atlas + 3/4 pixel art, terrain texturing + doodads,
   lighting/darkness + day/night cycle (upgrades phase-2 fog rendering), juice pass
   (shake, hit flash, decals, damage numbers, wave banner)

Phase order rationale: controls first (everything else is tested through them),
visuals last (no point skinning entities that phases 2–4 are still adding).

## 9. Explicitly out of scope

- True isometric projection (diamond grid) — rejected: doubles effort for projection
  change; 3/4 oblique achieves the "3D-looking pixel art" read
- Sound/music — worth doing later, not in this overhaul
- Save games, high-score persistence, multiple maps/difficulty presets
- Touch/mobile support
