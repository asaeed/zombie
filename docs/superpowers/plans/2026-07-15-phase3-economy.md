# Phase 3: Economy & Exploration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passive/kill economy with scavenging — searchable caches guarded by dormant zombies, carry-and-haul logistics, fog of war that makes finding resources the game.

**Architecture:** Simulation additions ride the existing entity/update pattern: a new light `Cache` class, `Unit.carrying`, `Zombie.dormant`, `game.fog` (two Uint8Arrays recomputed on a 100 ms cadence), `game.bundles`. Rendering gates on fog state; all projection still goes through utils. Spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md` §1.3, §2, §3.3, §8 phase 3. **User priority note (2026-07-15): core mechanics over QoL — this phase IS the core loop; keep scope on mechanics, not polish.**

**Tech Stack:** Vanilla JS, Canvas 2D, plain script tags. `node tests/transforms.test.mjs` as regression gate + live Playwright verification.

## Global Constraints

- No dependencies, no build step, no modules; `'use strict';` everywhere
- Iso math ONLY via `js/utils.js` helpers
- **Numbers (single source of truth — put ALL of these in `js/config.js`, tasks reference them by name):**
  - `CACHE_COUNT = 44`, `CACHE_MIN_CENTER_DIST = 14` (tiles from map center), cache types `car|cabin|bin` (cosmetic)
  - Contents rolled AT SEARCH TIME, distance-weighted with `f = distFromCenter / maxDist` (0..1): empty `30 - 10*f`%, small `randInt(30,60)` weight `45 - 20*f`, medium `randInt(80,150)` weight `20 + 15*f`, large `randInt(200,280)` weight `5 + 15*f`
  - `CARRY_CAPACITY = { soldier: 20, builder: 30, scout: 50 }`
  - `SEARCH_TIME = 2` (s), `SEARCH_RADIUS = 1.5` (tiles), `DROP_RADIUS = 3` (tiles, HQ + depot), `BUNDLE_TTL = 60` (s)
  - `VISION = { soldier: 8, builder: 6, scout: 12, hq: 10, wall: 3, tower: 9, barracks: 6, depot: 6 }` (tiles), `FOG_INTERVAL = 0.1` (s)
  - Guards per cache: `clamp(Math.floor(f * 3 + randFloat(0, 1.5)), 0, 3)`; plus `10` stray dormants anywhere ≥ 18 tiles from center; wake: proximity `3` tiles, gunfire `6` tiles from the shooter
  - Wave-clear bonus `25 + 10 * waveNum`; repair cost `5` supplies per `20` HP tick (stalls when broke); depot cost `200 → 75`; starting supplies stay `500`
- Balance not otherwise touched: unit/zombie/building stats stay put except where listed
- User-facing copy: only strings specified in steps
- Repo `~/claude/zombie`, branch `phase-3-economy`, push after each task's commit
- Browser checks: `python3 -m http.server <port>` + cache-buster + freshness fetch before trusting anything; kill servers after

---

### Task 1: Economy rebalance

**Files:**
- Modify: `js/config.js` (depot cost + new constants block), `js/game.js` (income removal, wave bonus), `js/entities.js` (depot income deletion, repair cost)

**Interfaces:**
- Produces: economy where supplies come ONLY from scavenging (tasks 2+) and wave-clear bonuses; `game.supplies` semantics unchanged for all consumers

- [ ] **Step 1: config.js**

Change depot line's cost to 75 (`cost:75`, rest of the line unchanged, keep `income:3` REMOVED — delete the `income:3` field). Append the phase-3 constants block (all values from Global Constraints, as named constants):

```js
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
```

- [ ] **Step 2: kill rewards and passive income out; wave bonus in**

`js/game.js` `onEntityDied`: delete `this.supplies += entity.def.reward;` (the score line stays).

`js/game.js` wave-end (the `if (this.zombiesToSpawn.length === 0 && this.zombies.filter(...)...)` block in `update`): add the bonus when a wave ends:

```js
      if (this.zombiesToSpawn.length === 0 && this.zombies.filter(z => !z.dead).length === 0) {
        this.waveActive = false;
        this.supplies += 25 + 10 * this.waveNum;   // wave-clear bonus
      }
```

`js/entities.js` `Building.update`: delete the whole `// Depot income` block (`if (this.type === 'depot') { ... }`) and the `this.incomeTimer = 0;` constructor line.

- [ ] **Step 3: repair costs supplies**

`js/entities.js`, builder repair tick in `Unit.update` — the `this.repairCooldown <= 0` branch becomes:

```js
          if (this.repairCooldown <= 0 && game.supplies >= REPAIR_TICK_COST) {
            this.repairCooldown = 0.5;
            game.supplies -= REPAIR_TICK_COST;
            this.repairTarget.hp = Math.min(this.repairTarget.maxHp, this.repairTarget.hp + 20);
          }
```

(Broke = repair stalls; the builder stays on target and resumes when supplies allow.)

- [ ] **Step 4: Verify**

`node --check` touched files; `node tests/transforms.test.mjs`; browser (cache-busted + freshness):
- Kill a zombie (spawn one next to a soldier) → supplies UNCHANGED, score increased
- Place a depot → supplies decrease by 75; wait 5s → no passive income
- Damage a wall (`w.takeDamage(100)`), builder repair with supplies=7 → exactly one tick fires (supplies 2, +20 HP), then stalls; set supplies=100 → resumes
- Run a wave to completion (waveTimer=1, fast-forward, kill spawned zombies via `z.takeDamage(9999)`) → supplies jump by 25+10×wave
- Zero console errors

- [ ] **Step 5: Commit**

```bash
cd ~/claude/zombie
git add js/config.js js/game.js js/entities.js
git commit -m "feat(econ): scavenging-only income — no kill rewards, no depot income, wave bonus, repair costs"
git push
```

---

### Task 2: Caches, carry & haul, drop bundles

**Files:**
- Modify: `js/entities.js` (Cache class, Unit.carrying + banking), `js/game.js` (caches/bundles arrays + placement + update + death drop), `js/renderer.js` (cache volumes, bag icon, bundle sacks, minimap dots)

**Interfaces:**
- Consumes: Task 1 constants
- Produces: `game.caches` (Cache[]), `game.bundles` (`[{x, y, amount, t}]`), `unit.carrying` (number), `Cache {tileX, tileY, x, y, kind, searched, empty, amount, searchProgress}`

- [ ] **Step 1: Cache class (js/entities.js)**

```js
// ─── Cache (searchable scavenge site) ─────────────────────────────────────────
class Cache {
  constructor(kind, tileX, tileY) {
    this.id = nextId();
    this.kind = kind;                 // 'car' | 'cabin' | 'bin' (cosmetic)
    this.tileX = tileX; this.tileY = tileY;
    this.x = tileCenterX(tileX); this.y = tileCenterY(tileY);
    this.searched = false;
    this.empty = false;
    this.amount = 0;                  // rolled at search time
    this.searchProgress = 0;
  }

  update(dt, game) {
    if (this.empty) return;
    const nearby = game.units.filter(u => !u.dead &&
      dist2(u.x, u.y, this.x, this.y) < (SEARCH_RADIUS * TILE) ** 2);
    if (nearby.length === 0) return;

    if (!this.searched) {
      this.searchProgress += dt;
      if (this.searchProgress >= SEARCH_TIME) {
        this.searched = true;
        this.amount = this._rollContents();
        if (this.amount === 0) this.empty = true;
      }
      return;
    }

    // Searched with contents: adjacent units auto-load up to capacity
    for (const u of nearby) {
      if (this.amount <= 0) break;
      const cap = CARRY_CAPACITY[u.type] - u.carrying;
      if (cap <= 0) continue;
      const take = Math.min(cap, this.amount);
      u.carrying += take;
      this.amount -= take;
    }
    if (this.amount <= 0) this.empty = true;
  }

  // Distance-weighted roll: farther from center = richer
  _rollContents() {
    const cx = MAP_W * TILE / 2, cy = MAP_H * TILE / 2;
    const f = clamp(dist(this.x, this.y, cx, cy) / (MAP_W * TILE / 2), 0, 1);
    const weights = [
      [30 - 10 * f, () => 0],
      [45 - 20 * f, () => randInt(30, 60)],
      [20 + 15 * f, () => randInt(80, 150)],
      [5 + 15 * f,  () => randInt(200, 280)],
    ];
    const total = weights.reduce((s, [w]) => s + w, 0);
    let r = randFloat(0, total);
    for (const [w, roll] of weights) { if ((r -= w) <= 0) return roll(); }
    return 0;
  }
}
```

- [ ] **Step 2: Unit carrying + banking + death drop**

`Unit` constructor: `this.carrying = 0;`

`Unit.update`, after the `atkCooldown -= dt` line region (before command logic is fine), add banking:

```js
    // Bank carried supplies at any drop point
    if (this.carrying > 0) {
      for (const b of game.buildings) {
        if (b.dead || (b.type !== 'hq' && b.type !== 'depot')) continue;
        if (dist2(this.x, this.y, b.x, b.y) < (DROP_RADIUS * TILE) ** 2) {
          game.supplies += this.carrying;
          this.carrying = 0;
          break;
        }
      }
    }

    // Pick up dropped bundles on contact
    for (const bd of game.bundles) {
      if (bd.amount <= 0) continue;
      if (dist2(this.x, this.y, bd.x, bd.y) < (SEARCH_RADIUS * TILE) ** 2) {
        const take = Math.min(CARRY_CAPACITY[this.type] - this.carrying, bd.amount);
        bd.amount -= take;
        this.carrying += take;
      }
    }
```

- [ ] **Step 3: game.js — arrays, placement, update loop, death drop**

Constructor: `this.caches = []; this.bundles = [];`

Placement — add method, called from `start()` AFTER `_placeStartingEntities()`:

```js
  _placeCaches() {
    const cx = MAP_W / 2, cy = MAP_H / 2;
    let attempts = 0;
    while (this.caches.length < CACHE_COUNT && attempts++ < 2000) {
      const tx = randInt(2, MAP_W - 3), ty = randInt(2, MAP_H - 3);
      const df = Math.hypot(tx - cx, ty - cy);
      if (df < CACHE_MIN_CENTER_DIST) continue;
      if (randFloat(0, 1) > df / (MAP_W / 2)) continue;          // density rises outward
      if (this.tiles[ty][tx] === TILE_WATER) continue;
      if (this.caches.some(c => Math.hypot(c.tileX - tx, c.tileY - ty) < 3)) continue;
      this.caches.push(new Cache(CACHE_TYPES[randInt(0, 2)], tx, ty));
    }
  }
```

`update(dt)`: add `for (const c of this.caches) c.update(dt, this);` beside the other entity updates, and bundle expiry beside the other filters:

```js
    for (const bd of this.bundles) bd.t += dt;
    this.bundles = this.bundles.filter(bd => bd.amount > 0 && bd.t < BUNDLE_TTL);
```

Death drop — in the units cleanup area of `update` (before `this.units = this.units.filter(...)`):

```js
    for (const u of this.units) {
      if (u.dead && u.carrying > 0) {
        this.bundles.push({ x: u.x, y: u.y, amount: u.carrying, t: 0 });
        u.carrying = 0;
      }
    }
```

- [ ] **Step 4: renderer.js — cache volumes, markers, bag icons, bundles, minimap**

In `_drawEntities`, add caches to the sorted pass (before buildings loop is fine — key them like 1×1 buildings):

```js
    for (const c of game.caches) {
      drawables.push({ key: (c.tileX + 1) * TILE + (c.tileY + 1) * TILE,
                       draw: () => this._drawCache(ctx, game, c) });
    }
```

Add the draw method (placeholder volumes in the phase-1 style; colors per kind):

```js
  _drawCache(ctx, game, c) {
    const cam = game.camera, z = cam.zoom;
    const x0 = c.tileX * TILE, y0 = c.tileY * TILE;
    const x1 = x0 + TILE, y1 = y0 + TILE;
    const looks = { car:   { color: '#8a4a30', h: 12 },
                    cabin: { color: '#7a5c3e', h: 26 },
                    bin:   { color: '#3e5e46', h: 10 } };
    const { color, h: hBase } = looks[c.kind];
    const h = hBase * z;
    const base = c.empty ? shadeColor(color, 0.45) : color;
    const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam),
          S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);
    const face = (p1, p2, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p1.x, p1.y - h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    };
    face(E, S, shadeColor(base, 0.72));
    face(S, W, shadeColor(base, 0.52));
    ctx.fillStyle = base; ctx.beginPath();
    ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h);
    ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();

    const cx = (N.x + S.x) / 2, topY = N.y - h;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!c.searched) {
      ctx.fillStyle = '#ffdd44'; ctx.font = `bold ${Math.max(10, 12 * z)}px monospace`;
      ctx.fillText('?', cx, topY - 8 * z);
      if (c.searchProgress > 0) {
        this._drawHealthBar(ctx, cx - 16 * z, topY - 18 * z, 32 * z, 4, c.searchProgress / SEARCH_TIME, '#ffdd44');
      }
    } else if (!c.empty) {
      ctx.fillStyle = '#ffdd44'; ctx.font = `${Math.max(9, 10 * z)}px monospace`;
      ctx.fillText(`${c.amount}`, cx, topY - 8 * z);
    }
  }
```

`_drawUnit`: after the health bar, bag icon when carrying:

```js
    if (u.carrying > 0) {
      ctx.fillStyle = '#b08040';
      ctx.fillRect(s.x + r * 0.7, s.y - r * 1.6, 5 * z, 5 * z);
      ctx.fillStyle = '#ffdd44'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${u.carrying}`, s.x + r * 0.7 + 2 * z, s.y - r * 2.0);
    }
```

Bundles — draw after particles in `render()` (`this._drawBundles(ctx, game);`):

```js
  _drawBundles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const bd of game.bundles) {
      const s = worldToScreen(bd.x, bd.y, cam);
      ctx.fillStyle = '#b08040';
      ctx.beginPath(); ctx.arc(s.x, s.y - 3 * z, 5 * z, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffdd44'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${bd.amount}`, s.x, s.y - 12 * z);
    }
  }
```

Minimap — after buildings, before units: cache dots (`#c9a94a` unsearched/with-contents, `#555` empty):

```js
    for (const c of game.caches) {
      ctx.fillStyle = c.empty ? '#555555' : '#c9a94a';
      const [x, y] = mp(c.x, c.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
```

- [ ] **Step 5: Verify**

Browser (cache-busted + freshness `fetch('/js/entities.js')` contains 'class Cache'):
- `g.caches.length` ≈ 44, none within 14 tiles of center, none on water
- Walk a scout onto an unsearched cache (moveTo + fast-forward): progress bar → searched; amount rolled (or empty grays out); scout auto-loads ≤ 50; walk it back to HQ → supplies += carried, bag icon gone
- Cache with amount > capacity leaves a remainder for a second trip
- Kill a carrying unit (takeDamage) → bundle appears with the amount; another unit walks over it → picks it up; a fresh bundle expires after 60s (fast-forward)
- Screenshot with a cache + carrying unit visible; READ it; describe (volumes, '?', bag icon, minimap amber dots)
- Zero console errors

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/game.js js/renderer.js
git commit -m "feat(econ): searchable caches, carry & haul, death-drop bundles"
git push
```

---

### Task 3: Fog of war (flat overlay version)

**Files:**
- Modify: `js/game.js` (fog arrays + recompute), `js/renderer.js` (tile gates, entity gates, minimap fog)

**Interfaces:**
- Consumes: `VISION`, `FOG_INTERVAL`
- Produces: `game.fogVisible`, `game.fogExplored` (Uint8Array(MAP_W*MAP_H), 1 = visible/explored); helper `game.tileVisible(tx, ty)` / `game.tileExplored(tx, ty)` (bounds-safe, off-map ⇒ false)

- [ ] **Step 1: game.js fog state + recompute**

Constructor:

```js
    this.fogVisible  = new Uint8Array(MAP_W * MAP_H);
    this.fogExplored = new Uint8Array(MAP_W * MAP_H);
    this._fogTimer   = 0;
```

Methods:

```js
  tileVisible(tx, ty)  { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && this.fogVisible[ty * MAP_W + tx] === 1; }
  tileExplored(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && this.fogExplored[ty * MAP_W + tx] === 1; }

  _markVision(wx, wy, radiusTiles) {
    const ctx0 = Math.floor(wx / TILE), cty0 = Math.floor(wy / TILE);
    const r = Math.ceil(radiusTiles);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > radiusTiles * radiusTiles) continue;
        const tx = ctx0 + dx, ty = cty0 + dy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        this.fogVisible[ty * MAP_W + tx] = 1;
        this.fogExplored[ty * MAP_W + tx] = 1;
      }
    }
  }

  _recomputeFog() {
    this.fogVisible.fill(0);
    for (const u of this.units) {
      if (!u.dead) this._markVision(u.x, u.y, VISION[u.type]);
    }
    for (const b of this.buildings) {
      if (!b.dead) this._markVision(b.x, b.y, VISION[b.type] ?? 4);
    }
  }
```

In `update(dt)`, near the top (after the flow-field rebuild):

```js
    this._fogTimer -= dt;
    if (this._fogTimer <= 0) {
      this._fogTimer = FOG_INTERVAL;
      this._recomputeFog();
    }
```

And call `this._recomputeFog();` once at the end of `start()` so frame 1 isn't blind.

- [ ] **Step 2: renderer tile gates**

In `_makeTileSprites`, add two overlay sprites after the waste line:

```js
    sprites.unexplored = [mk('#0a0d08'), mk('#0a0d08')];   // in-map, never seen
    const dim = document.createElement('canvas');
    dim.width = 64; dim.height = 32;
    const dg = dim.getContext('2d');
    dg.fillStyle = 'rgba(8,10,24,0.45)';
    dg.beginPath();
    dg.moveTo(32, 0); dg.lineTo(64, 16); dg.lineTo(32, 32); dg.lineTo(0, 16);
    dg.closePath(); dg.fill();
    sprites.dim = dim;                                     // explored-not-visible overlay
    return sprites;
```

(This replaces the existing `return sprites;` — the waste line stays above it.)

In `_drawTiles`' inner loop, replace the sprite pick + draw with fog-gated logic (skirt tiles unchanged):

```js
        const inMap = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
        const shade = (((tx + ty) % 2) + 2) % 2;
        const s = worldToScreen(tx * TILE, ty * TILE, cam);
        if (!inMap) {
          ctx.drawImage(this._tileSprites.waste[shade], s.x - w / 2, s.y, w, h);
          continue;
        }
        if (!game.tileExplored(tx, ty)) {
          ctx.drawImage(this._tileSprites.unexplored[shade], s.x - w / 2, s.y, w, h);
          continue;
        }
        ctx.drawImage(this._tileSprites[game.tiles[ty][tx]][shade], s.x - w / 2, s.y, w, h);
        if (!game.tileVisible(tx, ty)) {
          ctx.drawImage(this._tileSprites.dim, s.x - w / 2, s.y, w, h);
        }
```

- [ ] **Step 3: entity visibility gates**

In `_drawEntities`:
- Zombies: skip unless their tile is currently visible —
  `if (!game.tileVisible(Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;`
- Caches: skip unless explored —
  `if (!game.tileExplored(c.tileX, c.tileY)) continue;`
- Buildings and units: always drawn (all player-owned; they carry vision)

Bundles (`_drawBundles`): skip unless tile visible (same test as zombies).

Minimap: DO NOT add a per-frame 6400-tile fog pass — cache the static layer instead. Constructor gets:

```js
    this._mmLayer = document.createElement('canvas');
    this._mmLayer.width = MINIMAP_W; this._mmLayer.height = MINIMAP_H;
    this._mmLayerAt = -1;   // gameTime of last rebuild
```

In `_drawMinimap`, replace the map-diamond fill + water loop with the cached layer (rebuilt at most 4×/sim-second):

```js
    if (game.gameTime - this._mmLayerAt > 0.25 || this._mmLayerAt < 0) {
      this._mmLayerAt = game.gameTime;
      const g = this._mmLayer.getContext('2d');
      g.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
      const lmp = (wx, wy) => {           // layer-local mp (no MX/MY offset)
        const p = worldToScreen(wx, wy, cam1);
        return [(p.x - b.minX) * s, p.y * s];
      };
      // Map diamond, dark (unexplored base)
      const lcs = [[0, 0], [MAP_W * TILE, 0], [MAP_W * TILE, MAP_H * TILE], [0, MAP_H * TILE]]
        .map(([wx, wy]) => lmp(wx, wy));
      g.fillStyle = '#0a0d08';
      g.beginPath(); g.moveTo(lcs[0][0], lcs[0][1]);
      for (let i = 1; i < 4; i++) g.lineTo(lcs[i][0], lcs[i][1]);
      g.closePath(); g.fill();
      // Explored tiles: terrain green / water blue
      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          if (!game.tileExplored(tx, ty)) continue;
          g.fillStyle = game.tiles[ty][tx] === TILE_WATER ? '#163352' : '#1a2a1a';
          const [x, y] = lmp(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
          g.fillRect(x - 1, y - 1, 3, 2);
        }
      }
    }
    ctx.drawImage(this._mmLayer, MX, MY);
```

(The old always-green diamond fill and the per-frame water loop are deleted; `b`, `s`, `cam1`, `mp` stay for the dynamic passes.) Dynamic passes keep drawing per frame ON TOP: buildings, caches (gated `tileExplored`), units, zombies (gated `tileVisible`), alert pings (UNFOGGED — they're the point of alerts), viewport rect.

- [ ] **Step 4: Verify**

- Fresh game: only the HQ surroundings (~10 tile radius) + unit positions lit; rest of the diamond near-black; minimap mostly dark
- Send the scout somewhere far: corridor of explored terrain trails it; behind it the corridor stays visible-off (dim) but explored
- A zombie outside vision does not render (spawn one far away, assert not in a screenshot / check its tile invisible), then walk a unit near it → renders
- Caches: invisible until an explorer's vision touches them; after exploring, cache stays drawn when the unit leaves (dim area)
- `game.tileVisible(-1, 5) === false` (bounds safety, via evaluate)
- Zero console errors; framerate sanity: fast-forward 30 sim-seconds while timing a few frames (no order-of-magnitude regression)

- [ ] **Step 5: Commit**

```bash
git add js/game.js js/renderer.js
git commit -m "feat(fog): three-state fog of war — unexplored/explored/visible, minimap mask"
git push
```

---

### Task 4: Dormant guards

**Files:**
- Modify: `js/entities.js` (Zombie.dormant + wake logic), `js/game.js` (guard placement, nearestZombie exclusion, gunfire wake), `js/renderer.js` (slouched rendering)

**Interfaces:**
- Consumes: caches (Task 2), `GUARD_WAKE_RADIUS`, `GUARD_GUNFIRE_RADIUS`, `GUARD_STRAYS`
- Produces: `zombie.dormant` (bool); `game.nearestZombie(x, y, range, includeDormant = false)`; `game.wakeDormantNear(x, y, radius)`

- [ ] **Step 1: Zombie dormancy (js/entities.js)**

`Zombie` constructor: `this.dormant = false;`

`Zombie.takeDamage`: first line `this.dormant = false;` (getting shot wakes you).

`Zombie.update`, at the top after the dead check:

```js
    if (this.dormant) {
      // Sleeps until something comes close (gunfire wake is handled by the game)
      for (const u of game.units) {
        if (u.dead) continue;
        if (dist2(this.x, this.y, u.x, u.y) < GUARD_WAKE_RADIUS * GUARD_WAKE_RADIUS) {
          this.dormant = false;
          this.atkTarget = u;          // aggro the intruder first
          break;
        }
      }
      if (this.dormant) return;
    }
```

- [ ] **Step 2: game.js — placement, targeting exclusion, gunfire wake**

`nearestZombie(x, y, range)` gains a fourth param and a skip:

```js
  nearestZombie(x, y, range, includeDormant = false) {
    let best = null, bestD2 = range * range;
    for (const z of this.zombies) {
      if (z.dead || (!includeDormant && z.dormant)) continue;
      ...
```

(Existing call sites — tower auto-attack, unit auto-attack, attack-move hold — need no change: dormant zombies are ignored automatically, which is what makes sneaking possible. Explicit right-click attack still works because it sets `atkTarget` directly.)

Add:

```js
  wakeDormantNear(x, y, radius) {
    for (const z of this.zombies) {
      if (z.dead || !z.dormant) continue;
      if (dist2(x, y, z.x, z.y) < radius * radius) z.dormant = false;
    }
  }
```

`spawnMuzzleFlash(x, y)` first line: `this.wakeDormantNear(x, y, GUARD_GUNFIRE_RADIUS);` — every shot fired is noise.

**CRITICAL — wave-end must ignore dormant guards** (they live in `game.zombies` from game start; without this the first wave never "ends", blocking all later waves and bonuses). In `update`, the wave-end condition becomes:

```js
      if (this.zombiesToSpawn.length === 0 &&
          this.zombies.filter(z => !z.dead && !z.dormant).length === 0) {
```

Also the HUD's "N zombies remaining" count in `js/renderer.js` `_drawHUD` must exclude dormants the same way (`z => !z.dead && !z.dormant`) — otherwise the wave banner counts sleeping map guards.

Guard placement — new method, called in `start()` after `_placeCaches()`:

```js
  _placeGuards() {
    const cx = MAP_W * TILE / 2, cy = MAP_H * TILE / 2;
    const spawnDormant = (wx, wy) => {
      const type = randFloat(0, 1) < 0.85 ? 'walker' : 'runner';
      const z = new Zombie(type, wx, wy);
      z.dormant = true;
      this.zombies.push(z);
    };
    for (const c of this.caches) {
      const f = clamp(dist(c.x, c.y, cx, cy) / (MAP_W * TILE / 2), 0, 1);
      const n = clamp(Math.floor(f * 3 + randFloat(0, 1.5)), 0, 3);
      for (let i = 0; i < n; i++) {
        spawnDormant(c.x + randFloat(-2, 2) * TILE, c.y + randFloat(-2, 2) * TILE);
      }
    }
    for (let i = 0; i < GUARD_STRAYS; i++) {
      let wx, wy, tries = 0;
      do {
        wx = randFloat(2 * TILE, (MAP_W - 2) * TILE);
        wy = randFloat(2 * TILE, (MAP_H - 2) * TILE);
      } while (dist(wx, wy, cx, cy) < 18 * TILE && ++tries < 50);
      spawnDormant(wx, wy);
    }
  }
```

- [ ] **Step 3: renderer — slouched dormant look**

In `_drawZombie`, branch the body on dormancy (shadow + squashed darker body, no eyes):

```js
    if (zb.dormant) {
      this._groundEllipse(ctx, s, zb.def.radius, z);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - r * 0.5, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = shadeColor(zb.def.color, 0.55); ctx.fill();
      ctx.strokeStyle = '#003300'; ctx.lineWidth = 1.5; ctx.stroke();
      return;   // no eyes, no health bar — it's scenery until it isn't
    }
```

(Place at the top of the method after computing `s`, `r`.)

- [ ] **Step 4: Verify**

- Fresh game: `g.zombies.filter(z => z.dormant).length > 0` (guards + strays); none aggro/move over 10 fast-forwarded seconds
- HQ safety: no dormant guard within ~14 tiles of the HQ at spawn
- Walk a scout to within 3 tiles of a dormant guard → it wakes and targets the scout
- Sneak test: scout pathing 5+ tiles away from a guard → stays dormant
- Gunfire: order a soldier to attack (right-click) a dormant zombie from range → shot fires → other dormants within 6 tiles of the SOLDIER wake
- Auto-target exclusion: soldier walked past a dormant guard at ~4 tiles (outside wake, inside atkRange 150px... use a runner-guard spacing that keeps >3 tiles) → does NOT auto-fire
- Screenshot of a dormant cluster near a cache (READ + describe: slouched dark shapes, no health bars)
- Waves still work (waveTimer=1, fast-forward: spawned zombies are NOT dormant)
- Zero console errors

- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/game.js js/renderer.js
git commit -m "feat(threat): dormant guards near caches — proximity/gunfire/damage wake, auto-target exclusion"
git push
```

---

### Task 5: Docs + full smoke

**Files:**
- Modify: `README.md` (gameplay section)
- Verification task; fix regressions in place

- [ ] **Step 1: README — add a Gameplay section after Controls**

```markdown
## Gameplay
- Supplies come from scavenging: search the wrecked cars, cabins and bins
  scattered across the map (walk a unit onto one; contents are unknown until
  searched), then haul the loot back to the HQ or a depot to bank it
- Farther caches are richer — and more likely to be guarded by dormant
  zombies that wake on proximity or gunfire. Units drop their cargo when
  they die; the bundle can be recovered for 60 seconds
- Fog of war: the map starts dark. Scout to find caches; explored ground
  stays on the map, but zombies are only visible where you have vision
- Kills score points but pay nothing; each cleared wave pays a small bonus;
  repairs cost supplies. Depots are cheap drop-off points for long hauls
```

- [ ] **Step 2: Transforms test** — `node tests/transforms.test.mjs` green.

- [ ] **Step 3: Full playthrough smoke (dev-speed, synthetic events)**

The core loop end-to-end: fresh game → scout the fog for a cache (real move orders) → search it → haul back → bank (supplies increase by exactly the carried amount) → buy a depot near a far cache cluster → second haul banks at the depot → wake a guard by proximity, kill it (no supplies, score up) → survive wave 1 (bonus paid) → builder repair drains supplies per tick → die on purpose → restart → fog reset to just-HQ. Screenshot mid-scavenge (READ + describe). Zero console errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: scavenging gameplay guide; phase 3 complete"
git push
```
