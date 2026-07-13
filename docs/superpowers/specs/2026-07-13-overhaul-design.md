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

## 1. Visual direction: "Darkest Night" + true isometric pixel art

### 1.1 True isometric pixel art (user decision 2026-07-13, mockup panel D + B)

The world renders in 2:1 isometric projection (diamond tiles). The simulation is
untouched: game logic stays on the existing square tile grid and world coordinates;
the projection lives in one pair of transforms (`worldToScreen` / `screenToWorld`)
that ALL rendering and input route through. Nothing else is allowed to do coordinate
math on its own.

- Diamond tile 64×32 screen px at zoom 1.0. Sprites authored at half resolution
  (32×16 diamond base) and scaled ×2 with `imageSmoothingEnabled = false` for the
  chunky pixel look
- Buildings are iso volumes (roof diamond + two visible faces, damaged variant below
  50% HP); units/zombies are upright billboard sprites standing on their tile,
  2-frame walk + idle, distinct dormant (slouched) frame
- Painter's algorithm: draw order sorted by (worldX + worldY) so volumes correctly
  occlude what stands behind them
- Terrain: textured diamond tiles with edge transitions (grass→dirt, shore), doodads
  (rocks, shrubs, dead trees) as billboards, water shimmer kept
- Map edges: beyond the 80×80 diamond a dark wasteland skirt is rendered (visual
  only, not playable); the camera clamps so the viewport CENTER stays over the map —
  every corner can be centered (changed 2026-07-13 from bounds-clamping after play
  feedback: corners felt inaccessible). Minimap renders in zoom-1 projected space
  (map reads as a diamond) so the camera viewport is an exact rectangle (changed
  2026-07-13 from the square top-down view, same feedback round)
- Sprites still authored as embedded pixel data (palette-indexed strings in a new
  `js/sprites.js`), rasterized once at load into an atlas canvas. No binary assets,
  no build step
- Cost acknowledged: every screen↔world interaction (hit-tests, drag-select, build
  ghost, minimap, edge scroll, camera clamping) must route through the new
  transforms — this is why iso is its own foundation phase (phase 1), not a skin
  applied at the end
- Risk: hand-authored pixel art quality. Mitigation: tiny sizes, one limited palette
  (~24 colors), consistent light direction. Fallback: swap the atlas for a CC0 iso
  pack — the renderer interface stays the same either way

### 1.2 Lighting & darkness

Offscreen "darkness" canvas composited over the world each frame:

- Fill with ambient darkness (alpha varies by time of day), punch out lights with
  radial gradients (`destination-out`): HQ large warm glow, buildings small glow,
  units a modest flashlight radius, flare very bright, light tower very wide
- Day/night cycle: 3 min day / 2 min night (tunable in config). Night = deep darkness
  outside light pools; day = mild dimming only. Subtle color tint shifts (cold blue
  night, amber dusk)
- Wave timer stays independent of the cycle — a wave that happens to land at night is
  simply scarier because visibility shrinks. Scavenging is naturally a daytime
  activity — going out at night is possible but you can't see dormant zombies until
  you're close
- **Light is safety, not decoration.** At night, units and towers can only target
  zombies that are lit — inside some light radius (or anywhere, during the day). An
  unlit perimeter means your towers stay silent until the horde is already at the
  walls. Keeping the camp lit becomes base infrastructure on par with walls, and the
  light tower (§4) exists to push that safe envelope outward

### 1.3 Fog of war

Three tile states, stored per tile and updated from unit/building vision radii:

- **Unexplored** — solid black. Caches, terrain, everything hidden
- **Explored** — remembered terrain + static objects (buildings, cache husks) drawn
  dimmed; no live entities (zombies invisible here)
- **Visible** — within current vision of a unit/building; fully lit and live

Vision radius per entity (scout largest). At night, vision radii shrink to roughly the
flashlight radius — fog and lighting share the same source data. Minimap shows fog.
Cache locations are never marked up front: finding resources means physically scouting
the map. Zombie waves are still announced by direction (see 3.2) so fog doesn't make
defense blind.

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
| Light tower | 1×1 | 60 | Wide light + vision radius, no weapon. At night defenders only shoot lit targets (§1.2), so light towers extend the defensive envelope |
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
- **Projection boundary:** simulation stays entirely in world coordinates (square
  grid, world px) — pathfinding, flow field, combat ranges, separation all unchanged.
  `worldToScreen(wx, wy)` / `screenToWorld(sx, sy)` (camera x/y/zoom aware) live in
  utils.js and are the ONLY place iso math exists. Renderer and input both route
  through them; viewport culling tests projected bounds
- New systems land as: `game.caches[]`, `game.decals[]`, `game.fog` (Uint8Array),
  `game.lighting` (offscreen canvas in renderer), `game.dayTime`, `game.alerts[]`
- Flow field: gates join walls in the blocked set (zombie side); unit A* treats gates
  as open. Barbed wire is non-blocking for both, applies a slow on overlap
- Fog update: recompute visible set each ~100ms from vision sources, not per frame
- Performance budget: 80×80 map, ≤~300 zombies, ≤60 lights — all fine for Canvas 2D
  with the existing viewport culling; lighting canvas is one extra composite per frame

## 8. Implementation phases

Each phase leaves the game playable and better than before:

1. **Iso foundation** — `worldToScreen`/`screenToWorld` + camera (pan/zoom/clamping),
   diamond terrain rendering, (worldX+worldY)-sorted entity draw as placeholder iso
   volumes/billboards, and every input path (hit-tests, drag-select, build ghost,
   minimap, edge scroll) rerouted through the transforms. Game plays exactly as
   today — just isometric, with mouse-wheel zoom and middle-drag pan landing here
   since they're camera math
2. **Controls & camera QoL** — minimap drag, Space→HQ, F1–F4 bookmarks, N→last
   alert + minimap pings, control groups, attack-move, stop, rally points, hotkey
   rework, restart button
3. **Economy & exploration** — caches + search + carry/haul + drop bundles, depot
   re-role, kill/passive income removal, repair cost, fog of war (flat overlay
   version), dormant guards
4. **Light & dark** — day/night cycle, darkness overlay + light sources (the panel-B
   look), light-is-safety targeting rule, light tower, signal flare
5. **Threat** — spitter/exploder/screamer/boss, HP scaling, directional waves +
   warnings, endless mode
6. **Structures** — gate, barbed wire, mine, sniper tower, workshop upgrades, medic
   tent, two-row build panel
7. **Polish** — final iso pixel-art sprite set, terrain texturing + doodads, juice
   pass (shake, hit flash, decals, damage numbers, wave banner)

Phase order rationale: iso first because every later feature is built and tested
through its transforms; light & dark before new threats/structures because the
light-targeting rule changes how defense is balanced; final art last so we aren't
re-drawing sprites for entities that phases 3–6 are still adding.

## 9. Explicitly out of scope

- 3/4 top-down oblique projection — was the original recommendation for its lower
  cost; rejected 2026-07-13 after mockup review, Ahmad chose true isometric (panel D)
  with the panel-B lighting. The cost is paid deliberately in phase 1
- Sound/music — worth doing later, not in this overhaul
- Save games, high-score persistence, multiple maps/difficulty presets
- Touch/mobile support
