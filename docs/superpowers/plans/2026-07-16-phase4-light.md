# Phase 4: Light & Dark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darkness with teeth — a day/night cycle where vision shrinks at night, defenders can only shoot lit zombies, light towers push the safe envelope outward, and a thrown flare is your only panic button.

**Architecture:** Fog and lighting share one source-of-truth: `game.visionRadius(type)` returns the (night-shrunk) radius used BOTH by `_recomputeFog` and by the renderer's darkness layer — so at night, "lit" and "visible" are the same set of tiles, and the light-is-safety targeting rule is just a `tileVisible` check. Spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md` §1.2, §4 (Light tower), §5 (flare), §8 phase 4.

**Tech Stack:** Vanilla JS, Canvas 2D (offscreen lighting canvas composited per frame at night). `node tests/transforms.test.mjs` regression gate + live Playwright verification (use the `playwright-iso` MCP server — `mcp__playwright-iso__*` tools — NOT the persistent plugin one).

## Global Constraints

- No dependencies, no build step; `'use strict';` everywhere; iso math ONLY via `js/utils.js`
- **Numbers (all go in `js/config.js`, tasks reference by name):**
  - `DAY_LENGTH = 180`, `NIGHT_LENGTH = 120` (s), `CYCLE_TRANSITION = 15` (s dusk/dawn ramp)
  - `NIGHT_VISION_FACTOR = 0.4` (vision radii shrink to 40% at full night; light sources exempt)
  - Light tower: `light: { name:'Light Tower', maxHp:200, tileSize:1, cost:60, color:'#ddcc66', canBuild:true }`, `ISO_HEIGHTS.light = 38`, `VISION.light = 14`, hotkey `L`
  - Flare: `FLARE_COST = 50`, `FLARE_COOLDOWN = 60` (s), `FLARE_DURATION = 10` (s), `FLARE_LIGHT_RADIUS = 9` (tiles, also its vision radius), `FLARE_PULL_RADIUS = 12` (tiles), hotkey `F`
  - Night combat rule active when `game.isNight()` (darkness > 0.5)
- Game starts at day 0 of the cycle (safe start); victory timer unchanged (600s = 2 full cycles)
- Simulation edits ONLY as specified: cycle/darkness state, visionRadius, nearestZombie lit-gate, tower target lit-drop, flare entity + zombie flare-pull, dormant wake by flare. Combat/economy numbers untouched
- Mode exclusivity pattern (established in phase 2): flare arm, attack-move arm, and build mode are mutually exclusive — last intent wins, Esc clears the active one (arm first)
- User-facing copy ONLY as specified (HUD indicators, help lines)
- Repo `~/claude/zombie`, branch `phase-4-light`, push after each task's commit
- Browser checks via `mcp__playwright-iso__*` (fresh profile — no cache-buster needed); still verify the served file contains a just-added symbol once per task as a sanity habit; kill servers after

---

### Task 1: Day/night core + night vision shrink + HUD indicator

**Files:**
- Modify: `js/config.js` (cycle + night constants), `js/game.js` (cycle state, darkness, visionRadius, fog integration), `js/renderer.js` (HUD indicator)

**Interfaces:**
- Produces: `game.cycleTime()` (0..DAY+NIGHT), `game.darkness()` -> 0..1 (0 = full day, 1 = full night, linear CYCLE_TRANSITION ramps), `game.isNight()` (darkness > 0.5), `game.visionRadius(type)` -> tiles (night-shrunk except 'light'/'flare')

- [ ] **Step 1: config.js — append**

```js
// ── Phase 4: light & dark ─────────────────────────────────────────────────────
const DAY_LENGTH = 180;                  // seconds of daylight per cycle
const NIGHT_LENGTH = 120;                // seconds of night per cycle
const CYCLE_TRANSITION = 15;             // dusk/dawn ramp seconds
const NIGHT_VISION_FACTOR = 0.4;         // vision radii shrink to this at full night
const FLARE_COST = 50;
const FLARE_COOLDOWN = 60;               // seconds
const FLARE_DURATION = 10;               // seconds burning
const FLARE_LIGHT_RADIUS = 9;            // tiles of light/vision while burning
const FLARE_PULL_RADIUS = 12;            // tiles: zombies aggro to the flare
```

Also: add to `BUILDING_DEFS` (after depot): `light: { name:'Light Tower', maxHp:200, tileSize:1, cost:60, color:'#ddcc66', canBuild:true },` — add `light: 38` to `ISO_HEIGHTS` and `light: 14` to `VISION`. (The build panel and hotkey land in Task 3; defining the building now is harmless — it appears as a fifth panel button immediately, which Task 3 finishes wiring.)

- [ ] **Step 2: game.js — cycle + shared vision source-of-truth**

Methods (near the fog methods):

```js
  // ── Day/night cycle ─────────────────────────────────────────────────────────
  cycleTime() { return this.gameTime % (DAY_LENGTH + NIGHT_LENGTH); }

  // 0 = full day, 1 = full night, linear ramps CYCLE_TRANSITION long at each edge
  darkness() {
    const t = this.cycleTime();
    if (t < DAY_LENGTH - CYCLE_TRANSITION) return 0;
    if (t < DAY_LENGTH) return (t - (DAY_LENGTH - CYCLE_TRANSITION)) / CYCLE_TRANSITION;
    const nightEnd = DAY_LENGTH + NIGHT_LENGTH;
    if (t < nightEnd - CYCLE_TRANSITION) return 1;
    return (nightEnd - t) / CYCLE_TRANSITION;
  }

  isNight() { return this.darkness() > 0.5; }

  // Fog AND the lighting layer both use this — lit and visible are the same set
  visionRadius(type) {
    const base = VISION[type] ?? 4;
    if (type === 'light' || type === 'flare') return base;   // lights don't dim
    return lerp(base, base * NIGHT_VISION_FACTOR, this.darkness());
  }
```

`_recomputeFog` switches to it:

```js
    for (const u of this.units) {
      if (!u.dead) this._markVision(u.x, u.y, this.visionRadius(u.type));
    }
    for (const b of this.buildings) {
      if (!b.dead) this._markVision(b.x, b.y, this.visionRadius(b.type));
    }
```

- [ ] **Step 3: renderer.js — HUD day/night indicator**

In `_drawHUD`, right BEFORE the survive-timer text, add a right-aligned indicator at `this.W - 340` (clear of the centered wave text on its left and the survive timer on its right):

```js
    // Day/night indicator
    const t = game.cycleTime();
    const night = t >= DAY_LENGTH;
    const nextIn = Math.ceil(night ? DAY_LENGTH + NIGHT_LENGTH - t : DAY_LENGTH - t);
    ctx.textAlign = 'right';
    ctx.fillStyle = night ? '#88aaff' : '#ffd870';
    ctx.fillText(night ? `NIGHT — dawn in ${nextIn}s` : `Day — night in ${nextIn}s`, this.W - 340, 22);
```

- [ ] **Step 4: Verify (playwright-iso, port 8422)**

- `g.darkness()` at gameTime 0 → 0; force `g.gameTime = 172` → ~0.47 ramping; 180→1... (set gameTime directly, call `g.darkness()`; check 0 / ~0.5 at 172.5 / 1 at 181 / ramp down at 296)
- Vision shrink: `g.gameTime = 200; g._recomputeFog();` explored/visible count around a soldier drops vs day (compare `fogVisible` sums day vs night with units parked)
- `g.visionRadius('light')` = 14 at night (exempt); `g.visionRadius('scout')` = 4.8 at full night (12 × 0.4)
- HUD screenshot day + night: indicator text correct both ways
- `node tests/transforms.test.mjs` green; zero console errors

- [ ] **Step 5: Commit**

```bash
cd ~/claude/zombie
git add js/config.js js/game.js js/renderer.js
git commit -m "feat(night): day/night cycle, night vision shrink, HUD indicator"
git push
```

---

### Task 2: Darkness rendering — the lighting layer

**Files:**
- Modify: `js/renderer.js` (offscreen light canvas, composite pass, draw-order shuffle), `js/utils.js` (one radius helper)

**Interfaces:**
- Consumes: `game.darkness()`, `game.visionRadius(type)`, `game.flares` (Task 4 — guard with `game.flares || []` until then)
- Produces: `_drawLighting(ctx, game)` composited between world and UI; `tilesToScreenRadius(tiles, zoom)` in utils.js (keeps ISO_X out of the renderer, per the project's iso-math rule)

- [ ] **Step 0: utils.js helper**

```js
// Screen-px radius of a ground circle r tiles wide (approximation for light pools)
function tilesToScreenRadius(tiles, zoom) { return tiles * TILE * ISO_X * zoom; }
```

- [ ] **Step 1: offscreen canvas**

Constructor: `this._lightCanvas = document.createElement('canvas');` and in `resize()`: `if (this._lightCanvas) { this._lightCanvas.width = this.W; this._lightCanvas.height = this.H; }` (guard because `resize()` runs in the constructor before the field exists — OR move the field init above `this.resize()`; either is fine, say which you did).

- [ ] **Step 2: the lighting pass**

```js
  // ── Darkness + light pools (night only) ────────────────────────────────────
  _drawLighting(ctx, game) {
    const dk = game.darkness();
    if (dk < 0.02) return;
    const cam = game.camera, z = cam.zoom;
    const lc = this._lightCanvas;
    const g = lc.getContext('2d');

    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.W, this.H);
    g.fillStyle = `rgba(7, 10, 32, ${0.82 * dk})`;
    g.fillRect(0, 0, this.W, this.H);

    // Punch light pools out of the darkness — same radii the fog uses
    g.globalCompositeOperation = 'destination-out';
    const punch = (wx, wy, radiusTiles, coreAlpha = 1) => {
      const s = worldToScreen(wx, wy, cam);
      const r = tilesToScreenRadius(radiusTiles, z);
      const grad = g.createRadialGradient(s.x, s.y, r * 0.15, s.x, s.y, r);
      grad.addColorStop(0, `rgba(0,0,0,${coreAlpha})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.fill();
    };
    for (const u of game.units) {
      if (!u.dead) punch(u.x, u.y, game.visionRadius(u.type));
    }
    for (const b of game.buildings) {
      if (!b.dead) punch(b.x, b.y, game.visionRadius(b.type));
    }
    for (const f of (game.flares || [])) punch(f.x, f.y, FLARE_LIGHT_RADIUS);

    ctx.drawImage(lc, 0, 0);

    // Warm glows on the strongest sources
    ctx.globalCompositeOperation = 'lighter';
    const warm = (wx, wy, radiusTiles, color) => {
      const s = worldToScreen(wx, wy, cam);
      const r = tilesToScreenRadius(radiusTiles, z) * 0.6;
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const b of game.buildings) {
      if (b.dead) continue;
      if (b.type === 'hq')    warm(b.x, b.y, VISION.hq,    `rgba(255,170,70,${0.16 * dk})`);
      if (b.type === 'light') warm(b.x, b.y, VISION.light, `rgba(255,225,140,${0.14 * dk})`);
    }
    for (const f of (game.flares || [])) warm(f.x, f.y, FLARE_LIGHT_RADIUS, `rgba(255,120,40,${0.4 * dk})`);
    ctx.globalCompositeOperation = 'source-over';

    // Cold night tint
    ctx.fillStyle = `rgba(40, 60, 140, ${0.08 * dk})`;
    ctx.fillRect(0, 0, this.W, this.H);
  }
```

- [ ] **Step 3: draw order**

In `render()`, the world block becomes (ghost moves AFTER lighting so placement stays readable at night):

```js
    this._drawTiles(ctx, game);
    this._drawEntities(ctx, game);
    this._drawProjectiles(ctx, game);
    this._drawParticles(ctx, game);
    this._drawBundles(ctx, game);
    this._drawLighting(ctx, game);
    if (game.buildMode && input.mouseTile) this._drawBuildGhost(ctx, game, input.mouseTile);
    if (input.selectBox) this._drawSelectionBox(ctx, input.selectBox);
```

(Everything from the selection box down is unchanged. If `_drawBundles` is currently called elsewhere in `render()`, move it here — one call only.)

- [ ] **Step 4: Verify (playwright-iso, port 8423)**

- Day (`gameTime=50`): screenshot — no darkness, identical to phase-3 look
- Night (`gameTime=200`, `_recomputeFog()`): screenshot — dark world, warm pool at HQ, small pools at units, buildings dim; READ and describe both screenshots
- Transition (`gameTime=170`): partial darkness visible
- Ghost readable at night: `buildMode='wall'`, mousemove over dark ground, screenshot → ghost diamond clearly visible above darkness
- Perf: time 300 update+render cycles at night — the game loop is rAF so approximate by timing `g.update(0.05)` × 300 plus noting no visible jank in a 3s live watch; record numbers
- Zero console errors

- [ ] **Step 5: Commit**

```bash
git add js/renderer.js js/utils.js
git commit -m "feat(night): darkness overlay with light pools, warm glows, night tint"
git push
```

---

### Task 3: Light-is-safety targeting + Light Tower

**Files:**
- Modify: `js/game.js` (nearestZombie lit-gate), `js/entities.js` (tower drops unlit targets), `js/input.js` (L hotkey), `js/renderer.js` (help text)

**Interfaces:**
- Consumes: `game.isNight()`, `game.tileVisible`, the `light` building def from Task 1
- Produces: at night, auto-targeting only acquires zombies on visible (=lit) tiles; light tower buildable via panel + `L`

- [ ] **Step 1: nearestZombie gains the lit-gate**

```js
  nearestZombie(x, y, range, includeDormant = false) {
    const nightRule = this.isNight();
    let best = null, bestD2 = range * range;
    for (const z of this.zombies) {
      if (z.dead || (!includeDormant && z.dormant)) continue;
      if (nightRule && !this.tileVisible(Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;
      const d2 = dist2(x, y, z.x, z.y);
      if (d2 < bestD2) { bestD2 = d2; best = z; }
    }
    return best;
  }
```

(Units, towers, and attack-move all acquire through this — one gate covers them. Explicit right-click orders keep their target even if it walks into darkness; the player gave the order.)

- [ ] **Step 2: towers drop targets that go dark**

`js/entities.js`, tower block in `Building.update` — the target-validity condition gains one clause:

```js
      if (!this.atkTarget || this.atkTarget.dead ||
          dist(this.x, this.y, this.atkTarget.x, this.atkTarget.y) > this.def.atkRange ||
          (game.isNight() && !game.tileVisible(Math.floor(this.atkTarget.x / TILE), Math.floor(this.atkTarget.y / TILE)))) {
        this.atkTarget = game.nearestZombie(this.x, this.y, this.def.atkRange);
      }
```

- [ ] **Step 3: input + panel wiring for the light tower**

`js/input.js` build-keys map gains `KeyL: 'light'`.

`js/renderer.js`: build-button hotkey map gains `light: 'L'`; the first bottom-panel help line becomes:

```js
    ctx.fillText('BUILD: [W]all [T]ower [B]arracks [D]epot [L]ight | Esc: cancel | Right-click: move/attack | A+click: attack-move', BX + buildables.length * (BW + gap) + 8, PY + 30);
```

(The panel renders buildables generically — the fifth button appears on its own; verify it fits: 5 × 108 px = 540 px, fine at any sane window width.)

- [ ] **Step 4: Verify (playwright-iso, port 8424)**

- Night silent-tower: `gameTime=200`, place a tower, spawn a walker 4 tiles beyond every light pool's edge but inside tower atkRange (5.5 tiles) — careful: tower's own vision is 9×0.4=3.6 tiles at night, so park the walker at ~4.5 tiles from the tower with no other source near; `_recomputeFog()`; tick 2s → tower fired nothing (projectiles stay 0), walker undamaged
- Light tower turns it on: place a light tower near the walker (vision 14, night-exempt) → `_recomputeFog()`; tick → tower acquires and fires; walker takes damage
- Day control: `gameTime=50`, same setup minus light tower → tower fires (rule inactive by day)
- Unit auto-attack obeys the same gate (soldier + unlit walker at night → no muzzle particles)
- `L` toggles light build mode; place one for 60 supplies; help line screenshot shows [L]ight
- Zero console errors; transforms test green

- [ ] **Step 5: Commit**

```bash
git add js/game.js js/entities.js js/input.js js/renderer.js
git commit -m "feat(night): light-is-safety targeting rule + Light Tower"
git push
```

---

### Task 4: Signal flare

**Files:**
- Modify: `js/game.js` (flares state + throw + update), `js/entities.js` (zombie flare-pull), `js/input.js` (F arm + click + exclusivity), `js/renderer.js` (flare sprite + HUD cooldown indicator)

**Interfaces:**
- Consumes: mode-exclusivity pattern, `wakeDormantNear`, fog vision sources
- Produces: `game.flares` (`[{x, y, t}]`), `game.flareCooldown` (s remaining), `game.throwFlare(wx, wy)` -> bool, `input.flareArm`

- [ ] **Step 1: game.js — flare state**

Constructor: `this.flares = []; this.flareCooldown = 0;`

Methods:

```js
  // Throw a flare at an explored point: light + zombie magnet, wakes sleepers
  throwFlare(wx, wy) {
    if (this.flareCooldown > 0 || this.supplies < FLARE_COST) return false;
    if (!this.tileExplored(Math.floor(wx / TILE), Math.floor(wy / TILE))) return false;
    this.supplies -= FLARE_COST;
    this.flareCooldown = FLARE_COOLDOWN;
    this.flares.push({ x: wx, y: wy, t: 0 });
    this.wakeDormantNear(wx, wy, FLARE_LIGHT_RADIUS * TILE);  // light wakes sleepers
    return true;
  }
```

In `update(dt)`: `this.flareCooldown = Math.max(0, this.flareCooldown - dt);` plus flare aging/expiry beside the bundle filter:

```js
    for (const f of this.flares) f.t += dt;
    this.flares = this.flares.filter(f => f.t < FLARE_DURATION);
```

In `_recomputeFog`, flares are vision sources:

```js
    for (const f of this.flares) this._markVision(f.x, f.y, FLARE_LIGHT_RADIUS);
```

- [ ] **Step 2: entities.js — the pull**

In `Zombie.update`, right after the dormant block (before target acquisition), burning flares override everything except an existing melee engagement:

```js
    // A burning flare is irresistible: drop long-range intent and shamble to it
    if (game.flares.length > 0) {
      let nf = null, nfD2 = (FLARE_PULL_RADIUS * TILE) ** 2;
      for (const f of game.flares) {
        const d2 = dist2(this.x, this.y, f.x, f.y);
        if (d2 < nfD2) { nfD2 = d2; nf = f; }
      }
      if (nf) {
        const engaged = this.atkTarget && !this.atkTarget.dead &&
          dist(this.x, this.y, this.atkTarget.x, this.atkTarget.y) <= this.def.atkRange + 10;
        if (!engaged) {
          this.atkTarget = null;
          const d = dist(this.x, this.y, nf.x, nf.y);
          if (d > TILE) {
            const nx = (nf.x - this.x) / d, ny = (nf.y - this.y) / d;
            this.x = clamp(this.x + nx * this.def.speed * dt, this.def.radius, MAP_W * TILE - this.def.radius);
            this.y = clamp(this.y + ny * this.def.speed * dt, this.def.radius, MAP_H * TILE - this.def.radius);
          }
          return;  // transfixed while it burns
        }
      }
    }
```

- [ ] **Step 3: input.js — F arm, click, exclusivity**

Constructor: `this.flareArm = false;`

`_onKeyDown` (near the KeyA block):

```js
    // F: arm flare throw (next click is the target)
    if (e.code === 'KeyF' && !e.ctrlKey) {
      if (game.flareCooldown <= 0 && game.supplies >= FLARE_COST) {
        this.flareArm = true;
        this.attackMoveArm = false;
        game.buildMode = null;
        this.canvas.style.cursor = 'crosshair';
      }
    }
```

Extend the exclusivity edges: the `KeyA` arm block also sets `this.flareArm = false;`; the build-key toggle-ON block also sets `this.flareArm = false;`; the Escape chain clears `flareArm` FIRST (before attackMoveArm), restoring the cursor. `_handleBuildPanelClick`'s toggle-ON disarm line gains `this.flareArm = false;`.

`_onMouseDown`, immediately BEFORE the attack-move click block:

```js
    // Armed flare: this click throws it
    if (this.flareArm) {
      this.flareArm = false;
      this.canvas.style.cursor = '';
      game.throwFlare(wx, wy);
      this._clickHandled = true;
      return;
    }
```

- [ ] **Step 4: renderer.js — flare sprite + HUD indicator + armed banner**

Flare ground sprite — in `render()`'s world block, after `_drawBundles` (before `_drawLighting`, so the glow reads on top):

```js
    this._drawFlares(ctx, game);
```

```js
  _drawFlares(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const f of game.flares) {
      const s = worldToScreen(f.x, f.y, cam);
      const flicker = 0.75 + 0.25 * Math.sin(f.t * 30);
      ctx.fillStyle = '#c03028';
      ctx.fillRect(s.x - 1.5 * z, s.y - 6 * z, 3 * z, 6 * z);       // stick
      ctx.fillStyle = `rgba(255,240,190,${flicker})`;
      ctx.beginPath(); ctx.arc(s.x, s.y - 7 * z, 2.5 * z, 0, Math.PI * 2); ctx.fill();
    }
  }
```

HUD indicator — in `_drawHUD`, under the supplies text region (left side, y 22 is taken; use a second short line only when relevant is noisy — instead append after Score):

```js
    ctx.fillStyle = game.flareCooldown > 0 ? '#777777'
                   : game.supplies >= FLARE_COST ? '#ff8866' : '#775544';
    ctx.fillText(game.flareCooldown > 0 ? `Flare ${Math.ceil(game.flareCooldown)}s` : 'Flare ready [F]', 385, 22);
```

Armed banner — extend the attack-move banner block:

```js
    if (input.flareArm) {
      ctx.fillStyle = '#ff8866';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FLARE — click target (Esc cancels)', this.W / 2, 58);
    }
```

Help line 2 in `_drawBottomPanel` gains the flare (replace the existing line-2 string):

```js
    ctx.fillText('S: stop | R: repair | Del: sell | H: idle units | F: flare | Space: HQ | F1-F4 bookmarks (Shift sets) | N: last alert', BX + buildables.length * (BW + gap) + 8, PY + 48);
```

- [ ] **Step 5: Verify (playwright-iso, port 8425)**

- Throw: F (with supplies ≥ 50) → crosshair + banner; click explored ground → supplies -50, flare exists, cooldown 60 ticking; second F while cooling → no arm
- Unexplored target: F + click deep black → `throwFlare` returned false (supplies unchanged, arm consumed — acceptable; note it)
- Pull: spawn 3 walkers ~8 tiles from a flare point, throw → all three converge on the flare, ignoring the base; when `t` hits 10 the flare expires and they resume flow-field behavior
- Engaged exception: a walker actively chewing a wall (in melee range) stays on the wall
- Dormant wake: dormants within 9 tiles of the throw wake; 11 tiles away stays asleep (pull radius reaches it only if awake — woken ones converge)
- Fog: flare lights its area (tileVisible true at its tile with no unit nearby) for 10s, then reverts
- Night visual: screenshot of a burning flare at night — bright pool + orange glow + flicker dot; READ + describe
- Exclusivity: F then W → build mode on, flare arm off; A then F → flare arm on, attack-move off; Esc clears flare arm first
- Zero console errors; transforms green

- [ ] **Step 6: Commit**

```bash
git add js/game.js js/entities.js js/input.js js/renderer.js
git commit -m "feat(night): signal flare — light, zombie magnet, dormant wake, F hotkey"
git push
```

---

### Task 5: Docs + night-survival smoke

**Files:**
- Modify: `README.md` (controls line + gameplay bullets + plan pointer)
- Verification task; fix regressions in place

- [ ] **Step 1: README**

Controls section: add to the build line `, \`L\`ight tower` after Depot; add a new bullet after the barracks line:

```markdown
- `F` + click: throw a signal flare (50 supplies, 60s cooldown) — lures the horde, wakes sleepers
```

Gameplay section: add after the fog bullet:

```markdown
- Night falls every 3 minutes (2 minutes long): vision shrinks to flashlight
  range and your defenders can only shoot zombies that are LIT. Light towers
  (60 supplies, no weapon) push the lit perimeter outward — keep the camp lit
  or your towers go silent right when the horde arrives
```

Project docs: "Current plan" pointer → `docs/superpowers/plans/2026-07-16-phase4-light.md` (phase 4 of 7 — light & dark; phases 1–3 complete).

- [ ] **Step 2: transforms test green.**

- [ ] **Step 3: Night-survival smoke (playwright-iso, dev-speed, synthetic events)**

Fresh game → build W/T/B/D/L kit by day → fast-forward to first night (gameTime ≈ 185) → verify: darkness rendered, vision shrunk, an unlit walker inside tower range is NOT shot until it steps into light (or a light tower is placed) → survive a night wave → scavenge by day with a hauler, bank (storage cap respected) → throw a flare at a dormant cluster: they wake and converge on it, defenders pick them off as they cross lit ground → dusk/dawn transitions render (screenshots at gameTime 172 and 296) → restart resets cycle/flares/cooldown (gameTime 0 = day, flares [], flareCooldown 0) → zero console errors. Screenshots of full night with the lit base + a burning flare; READ + describe.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: night survival + flare guide; phase 4 complete"
git push
```
