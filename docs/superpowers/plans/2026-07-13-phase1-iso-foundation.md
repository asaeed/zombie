# Phase 1: Iso Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render and control the existing game in true 2:1 isometric projection — identical gameplay, diamond world, mouse-wheel zoom, middle-drag pan.

**Architecture:** The simulation stays entirely in world coordinates (square 80×80 tile grid, world px, `TILE = 40`) — pathfinding, flow field, combat, separation are untouched. All iso math lives in one pair of pure functions in `js/utils.js` (`worldToScreen` / `screenToWorld`, camera-aware); the renderer and input handler route every coordinate conversion through them. Spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md` §1.1, §7, §8 phase 1.

**Tech Stack:** Vanilla JS, Canvas 2D, plain `<script>` tags. Tests: plain `node:assert` script run with `node` (no framework).

## Global Constraints

- No dependencies, no build step, no modules — the game stays a folder you open in a browser
- Every file keeps `'use strict';` at the top; new functions follow the existing naming style
- Iso math exists ONLY in `js/utils.js` — any other file doing `* ISO_X` by hand is a bug
- Game logic files (`entities.js`, `pathfinding.js`, and `game.js` except where this plan says) must not change
- Gameplay must be identical after this phase: same units, waves, economy, win/lose
- No user-facing copy changes (labels, HUD text stay as-is)
- Repo: `~/claude/zombie`, branch `main`, push after each task's commit
- Browser check: `cd ~/claude/zombie && python3 -m http.server 8412` then open `http://localhost:8412` (Playwright needs http; `file://` is blocked). Check the console for errors every time

---

### Task 1: Iso transforms + camera math (pure functions, node-tested)

**Files:**
- Modify: `js/config.js` (append constants)
- Modify: `js/utils.js` (append functions)
- Create: `tests/transforms.test.mjs`

**Interfaces:**
- Consumes: existing `TILE`, `MAP_W`, `MAP_H`, `clamp()`
- Produces (later tasks rely on these exact signatures):
  - `worldToScreen(wx, wy, cam) -> {x, y}` — `cam = {x, y, zoom}`, cam.x/y in projected screen space
  - `screenToWorld(sx, sy, cam) -> {x, y}` (world coords)
  - `mapScreenBounds(zoom) -> {minX, maxX, minY, maxY}` — projected bounding box of the map
  - `clampCamera(cam, viewW, viewH)` — mutates cam.x/cam.y; centers axis if map smaller than view
  - `centerCameraOn(cam, wx, wy, viewW, viewH)` — mutates cam so (wx,wy) lands at view center
  - `shadeColor('#rrggbb', f) -> 'rgb(r,g,b)'` — multiply brightness by f
  - `barracksButtonRects(b, cam) -> [{type, x, y, w, h}]` — screen-space train buttons (renderer draws them, input hit-tests them; single source of truth)
  - Constants: `ISO_X = 0.8`, `ISO_Y = 0.4`, `ZOOM_MIN = 0.5`, `ZOOM_MAX = 2.0`, `ISO_HEIGHTS = {hq: 44, wall: 18, tower: 48, barracks: 34, depot: 26}`

- [ ] **Step 1: Write the failing test**

Create `tests/transforms.test.mjs`:

```js
// Run: node tests/transforms.test.mjs
// Loads the plain-script game files into a VM context (they aren't modules).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
for (const f of ['js/config.js', 'js/utils.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}
const { worldToScreen, screenToWorld, clampCamera, centerCameraOn,
        mapScreenBounds, shadeColor } = ctx;

const cam0 = { x: 0, y: 0, zoom: 1 };

// One world tile (40 px) projects to a 64×32 diamond
assert.deepEqual(worldToScreen(0, 0, cam0),   { x: 0,   y: 0 });
assert.deepEqual(worldToScreen(40, 0, cam0),  { x: 32,  y: 16 });
assert.deepEqual(worldToScreen(0, 40, cam0),  { x: -32, y: 16 });
assert.deepEqual(worldToScreen(40, 40, cam0), { x: 0,   y: 32 });

// Round-trips at assorted cameras/zooms
for (const cam of [cam0, { x: 137, y: -260, zoom: 0.5 }, { x: -1000, y: 400, zoom: 2 }]) {
  for (const [wx, wy] of [[0, 0], [1600, 1600], [3200, 0], [123.5, 2999.25]]) {
    const s = worldToScreen(wx, wy, cam);
    const w = screenToWorld(s.x, s.y, cam);
    assert.ok(Math.abs(w.x - wx) < 1e-6 && Math.abs(w.y - wy) < 1e-6,
      `round-trip failed for ${wx},${wy} @ zoom ${cam.zoom}`);
  }
}

// centerCameraOn puts the target at the viewport center
{
  const cam = { x: 0, y: 0, zoom: 1.3 };
  centerCameraOn(cam, 1600, 1600, 800, 600);
  const s = worldToScreen(1600, 1600, cam);
  assert.ok(Math.abs(s.x - 400) < 1e-6 && Math.abs(s.y - 300) < 1e-6, 'centerCameraOn off-center');
}

// clampCamera keeps the view inside the projected map bounds…
{
  const cam = { x: 99999, y: 99999, zoom: 1 };
  clampCamera(cam, 800, 600);
  const b = mapScreenBounds(1);
  assert.ok(cam.x >= b.minX && cam.x <= b.maxX - 800, 'cam.x not clamped');
  assert.ok(cam.y >= b.minY && cam.y <= b.maxY - 600, 'cam.y not clamped');
}
// …and centers an axis when the map is smaller than the viewport
{
  const cam = { x: 0, y: 0, zoom: 0.5 }; // projected map 2560×1280 < 4000×3000 view
  clampCamera(cam, 4000, 3000);
  const b = mapScreenBounds(0.5);
  assert.ok(Math.abs(cam.x - (b.minX + b.maxX - 4000) / 2) < 1e-6, 'small map not x-centered');
  assert.ok(Math.abs(cam.y - (b.minY + b.maxY - 3000) / 2) < 1e-6, 'small map not y-centered');
}

assert.equal(shadeColor('#ff8800', 0.5), 'rgb(128,68,0)');

console.log('transforms.test: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/claude/zombie && node tests/transforms.test.mjs`
Expected: FAIL — `TypeError: worldToScreen is not a function` (config/utils don't define them yet)

- [ ] **Step 3: Add constants to `js/config.js`**

Append at the end of the file:

```js
// ── Isometric projection ──────────────────────────────────────────────────────
// One world tile (TILE=40 world px) renders as a 64×32 diamond at zoom 1.
const ISO_X = 0.8;   // screen px per world px along (wx - wy)
const ISO_Y = 0.4;   // screen px per world px along (wx + wy)
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
// Building volume heights in screen px at zoom 1 (placeholder iso volumes)
const ISO_HEIGHTS = { hq: 44, wall: 18, tower: 48, barracks: 34, depot: 26 };
```

- [ ] **Step 4: Add transform functions to `js/utils.js`**

Append at the end of the file:

```js
// ── Isometric projection ──────────────────────────────────────────────────────
// The ONLY place iso math is allowed to exist. cam = {x, y, zoom};
// cam.x/cam.y are the camera offset in projected (screen) space.
function worldToScreen(wx, wy, cam) {
  return {
    x: (wx - wy) * ISO_X * cam.zoom - cam.x,
    y: (wx + wy) * ISO_Y * cam.zoom - cam.y,
  };
}

function screenToWorld(sx, sy, cam) {
  const ix = (sx + cam.x) / (ISO_X * cam.zoom);
  const iy = (sy + cam.y) / (ISO_Y * cam.zoom);
  return { x: (iy + ix) / 2, y: (iy - ix) / 2 };
}

// Projected bounding box of the full map diamond at a given zoom
function mapScreenBounds(zoom) {
  const wpx = MAP_W * TILE, hpx = MAP_H * TILE;
  return {
    minX: -hpx * ISO_X * zoom,
    maxX:  wpx * ISO_X * zoom,
    minY: 0,
    maxY: (wpx + hpx) * ISO_Y * zoom,
  };
}

// Keep the viewport inside the projected map; center an axis when the
// projected map is smaller than the viewport on that axis.
function clampCamera(cam, viewW, viewH) {
  const b = mapScreenBounds(cam.zoom);
  cam.x = (b.maxX - b.minX <= viewW)
    ? (b.minX + b.maxX - viewW) / 2
    : clamp(cam.x, b.minX, b.maxX - viewW);
  cam.y = (b.maxY - b.minY <= viewH)
    ? (b.minY + b.maxY - viewH) / 2
    : clamp(cam.y, b.minY, b.maxY - viewH);
}

function centerCameraOn(cam, wx, wy, viewW, viewH) {
  cam.x = (wx - wy) * ISO_X * cam.zoom - viewW / 2;
  cam.y = (wx + wy) * ISO_Y * cam.zoom - viewH / 2;
}

// Multiply a '#rrggbb' color's brightness by f (0..1 darkens, >1 lightens)
function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Screen-space rects for the barracks train buttons, anchored under the
// building's projected south corner. Renderer draws these; input hit-tests
// them — keep this the single source of truth for that layout.
function barracksButtonRects(b, cam) {
  const BTW = 96, BTH = 58, gap = 6;
  const s = worldToScreen(b.x + b.width / 2, b.y + b.height / 2, cam); // south corner
  const totalW = 3 * BTW + 2 * gap;
  const startX = s.x - totalW / 2;
  const startY = s.y + 12;
  return ['soldier', 'builder', 'scout'].map((type, i) => ({
    type, x: startX + i * (BTW + gap), y: startY, w: BTW, h: BTH,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/claude/zombie && node tests/transforms.test.mjs`
Expected: `transforms.test: all assertions passed`

- [ ] **Step 6: Sanity-check the game still runs unchanged**

Serve and open `http://localhost:8412`. The game must look and play exactly as before (nothing consumes the new functions yet) with zero console errors.

- [ ] **Step 7: Commit**

```bash
cd ~/claude/zombie
git add js/config.js js/utils.js tests/transforms.test.mjs
git commit -m "feat(iso): projection transforms, camera clamp/center, node test"
git push
```

---

### Task 2: Renderer draws the world isometrically

**Files:**
- Modify: `js/renderer.js` (rewrite the world-space half; HUD/minimap/endscreens mostly unchanged)
- Modify: `js/game.js:26` (camera gains zoom) and `js/game.js:39-45` (start() centering)

**Interfaces:**
- Consumes: everything Task 1 produces
- Produces: `game.camera = {x, y, zoom}` (all later tasks assume `.zoom` exists); renderer methods `_drawTiles`, `_drawEntities`, `_drawBuilding`, `_drawUnit`, `_drawZombie`, `_drawBuildGhost`, `_drawBarracksButtons` (screen-anchored), `_groundEllipse`
- **Known mid-phase state:** after this task the world RENDERS in iso but mouse input still maps with the old planar math — clicks land in the wrong place until Task 3. Expected; don't "fix" input here.

- [ ] **Step 1: Camera gets a zoom; start() centers via the helpers**

In `js/game.js` replace line 26:

```js
    this.camera      = { x: 0, y: 0, zoom: 1 };
```

and replace the start() centering block (lines 39–45):

```js
    // Center camera on HQ
    const hq = this.buildings.find(b => b.type === 'hq');
    if (hq) {
      centerCameraOn(this.camera, hq.x, hq.y, window.innerWidth, window.innerHeight);
      clampCamera(this.camera, window.innerWidth, window.innerHeight);
    }
```

- [ ] **Step 2: Pre-rendered diamond tile sprites + render() restructure**

In `js/renderer.js`, add to the constructor (after `this.resize();`):

```js
    this._tileSprites = this._makeTileSprites();
```

Add the factory method:

```js
  // Pre-render one 64×32 diamond per tile type × 2 checker shades
  _makeTileSprites() {
    const mk = (fill, accent) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(32, 0); g.lineTo(64, 16); g.lineTo(32, 32); g.lineTo(0, 16);
      g.closePath(); g.fill();
      if (accent) { // subtle inner sheen (water)
        g.globalAlpha = 0.25; g.fillStyle = accent;
        g.beginPath();
        g.moveTo(32, 5); g.lineTo(55, 16); g.lineTo(32, 27); g.lineTo(9, 16);
        g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      return c;
    };
    return {
      [TILE_GRASS]: [mk('#2d4a20'), mk('#355524')],
      [TILE_DIRT]:  [mk('#5a4a2a'), mk('#4e3f24')],
      [TILE_WATER]: [mk('#1a3a5c', '#4a7ab0'), mk('#163352', '#4a7ab0')],
    };
  }
```

Replace the whole `render()` method (the `ctx.save()/translate/restore` world block disappears — every world draw now projects through `worldToScreen` itself):

```js
  render(game, input) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0c0e14';               // void outside the map diamond
    ctx.fillRect(0, 0, this.W, this.H);

    this._drawTiles(ctx, game);
    if (game.buildMode && input.mouseTile) this._drawBuildGhost(ctx, game, input.mouseTile);
    this._drawEntities(ctx, game);
    this._drawProjectiles(ctx, game);
    this._drawParticles(ctx, game);
    if (input.selectBox) this._drawSelectionBox(ctx, input.selectBox);
    if (game._selectedBuilding && game._selectedBuilding.type === 'barracks' && !game._selectedBuilding.dead) {
      this._drawBarracksButtons(ctx, game, game._selectedBuilding);
    }

    this._drawHUD(ctx, game, input);
    this._drawMinimap(ctx, game);
    if (game.status === 'gameover') this._drawGameOver(ctx);
    if (game.status === 'victory') this._drawVictory(ctx);
  }
```

- [ ] **Step 3: Iso tile pass**

Replace `_drawTiles` entirely:

```js
  _drawTiles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    // World-space bounding box of the viewport (over-covers the diamond; fine)
    const corners = [
      screenToWorld(0, 0, cam), screenToWorld(this.W, 0, cam),
      screenToWorld(0, this.H, cam), screenToWorld(this.W, this.H, cam),
    ];
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    const tx0 = clamp(Math.floor(Math.min(...xs) / TILE) - 1, 0, MAP_W);
    const tx1 = clamp(Math.ceil(Math.max(...xs) / TILE) + 1, 0, MAP_W);
    const ty0 = clamp(Math.floor(Math.min(...ys) / TILE) - 1, 0, MAP_H);
    const ty1 = clamp(Math.ceil(Math.max(...ys) / TILE) + 1, 0, MAP_H);

    const w = 64 * z, h = 32 * z;
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const spr = this._tileSprites[game.tiles[ty][tx]][(tx + ty) % 2];
        const s = worldToScreen(tx * TILE, ty * TILE, cam); // north corner of the diamond
        ctx.drawImage(spr, s.x - w / 2, s.y, w, h);
      }
    }
  }
```

- [ ] **Step 4: Painter-sorted entity pass with iso volumes and billboards**

Replace `_drawBuildings`, `_drawUnits`, `_drawZombies` with one sorted pass plus per-kind methods:

```js
  // Back-to-front by (worldX + worldY): what's "behind" in iso draws first
  _drawEntities(ctx, game) {
    const drawables = [];
    for (const b of game.buildings) {
      if (b.dead) continue;
      const ts = b.def.tileSize;
      drawables.push({ key: (b.tileX + ts) * TILE + (b.tileY + ts) * TILE,
                       draw: () => this._drawBuilding(ctx, game, b) });
    }
    for (const u of game.units) {
      if (u.dead) continue;
      drawables.push({ key: u.x + u.y, draw: () => this._drawUnit(ctx, game, u) });
    }
    for (const z of game.zombies) {
      if (z.dead) continue;
      drawables.push({ key: z.x + z.y, draw: () => this._drawZombie(ctx, game, z) });
    }
    drawables.sort((a, b) => a.key - b.key);
    for (const d of drawables) d.draw();
  }

  // Ground-plane circle of world radius r at world point (via projected s)
  _groundEllipse(ctx, s, r, z) {
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.13 * z, r * 0.57 * z, 0, 0, Math.PI * 2);
  }

  _drawBuilding(ctx, game, b) {
    const cam = game.camera, z = cam.zoom;
    const def = b.def, ts = def.tileSize;
    const x0 = b.tileX * TILE, y0 = b.tileY * TILE;
    const x1 = x0 + ts * TILE, y1 = y0 + ts * TILE;
    const h = ISO_HEIGHTS[b.type] * z;
    const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam),
          S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);

    const face = (p1, p2, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p1.x, p1.y - h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    };
    face(E, S, shadeColor(def.color, 0.72)); // sun-side face
    face(S, W, shadeColor(def.color, 0.52)); // shade-side face

    ctx.fillStyle = def.color;               // roof
    ctx.beginPath();
    ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h);
    ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

    // Label on the roof
    const cx = (N.x + S.x) / 2, roofCy = (N.y + S.y) / 2 - h;
    const labels = { hq: 'HQ', wall: '', tower: 'T', barracks: 'B', depot: 'D' };
    if (labels[b.type]) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `bold ${Math.min(12, ts * 8)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[b.type], cx, roofCy);
    }

    // Health bar above the top corner
    const barW = 36 * ts * z;
    const topY = N.y - h;
    this._drawHealthBar(ctx, cx - barW / 2, topY - 10 * z, barW, 5, b.hp / b.maxHp);

    // Barracks queue indicator + progress
    if (b.type === 'barracks' && b.trainQueue.length > 0) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`[${b.trainQueue.length}]`, cx, topY - 16 * z);
      if (b.trainProgress > 0) {
        const pct = b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
        this._drawHealthBar(ctx, cx - barW / 2, topY - 24 * z, barW, 4, pct, '#44aaff');
      }
    }
  }

  _drawUnit(ctx, game, u) {
    const cam = game.camera, z = cam.zoom;
    const s = worldToScreen(u.x, u.y, cam);
    const r = u.def.radius * z;

    if (u.selected) {
      this._groundEllipse(ctx, s, u.def.radius + 4, z);
      ctx.strokeStyle = '#44ffff'; ctx.lineWidth = 2; ctx.stroke();
    }
    this._groundEllipse(ctx, s, u.def.radius, z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();       // ground shadow

    ctx.beginPath(); ctx.arc(s.x, s.y - r * 1.2, r, 0, Math.PI * 2); // raised body
    ctx.fillStyle = u.def.color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y - r * 1.2, 3 * z, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();

    this._drawHealthBar(ctx, s.x - r, s.y - r * 2.4 - 6 * z, r * 2, 4, u.hp / u.maxHp);

    if (u.type === 'builder' && u.repairTarget) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('⚙', s.x, s.y - r * 2.4 - 12 * z);
    }
  }

  _drawZombie(ctx, game, zb) {
    const cam = game.camera, z = cam.zoom;
    const s = worldToScreen(zb.x, zb.y, cam);
    const r = zb.def.radius * z;

    this._groundEllipse(ctx, s, zb.def.radius, z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();

    const by = s.y - r * 1.2;
    ctx.beginPath(); ctx.arc(s.x, by, r, 0, Math.PI * 2);
    ctx.fillStyle = zb.def.color; ctx.fill();
    ctx.strokeStyle = '#005500'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = '#ff0000';                              // eyes
    ctx.beginPath();
    ctx.arc(s.x - r * 0.3, by - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.arc(s.x + r * 0.3, by - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();

    this._drawHealthBar(ctx, s.x - r, s.y - r * 2.4 - 5 * z, r * 2, 4, zb.hp / zb.maxHp, '#ff4422');
  }
```

Delete the old `_drawBuildings`, `_drawUnits`, `_drawZombies` methods entirely.

- [ ] **Step 5: Projectiles, particles, ghost, selection box, barracks buttons**

Replace `_drawProjectiles` and `_drawParticles` (projected, lifted slightly off the ground plane):

```js
  _drawProjectiles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const p of game.projectiles) {
      if (p.dead) continue;
      const s = worldToScreen(p.x, p.y, cam);
      const py = s.y - 10 * z;
      ctx.beginPath(); ctx.arc(s.x, py, 3 * z, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.beginPath(); ctx.arc(s.x, py, 5 * z, 0, Math.PI * 2);
      ctx.fillStyle = p.color + '55'; ctx.fill();
    }
  }

  _drawParticles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const p of game.particles) {
      const alpha = p.life / p.maxLife;
      const s = worldToScreen(p.x, p.y, cam);
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(s.x, s.y - 10 * z, 2 * z, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
```

Replace `_drawBuildGhost` (projected footprint diamond — no volume; the flat footprint is clearer for placement):

```js
  _drawBuildGhost(ctx, game, tile) {
    const cam = game.camera;
    const def = BUILDING_DEFS[game.buildMode];
    const ts = def.tileSize;
    const x0 = tile.tx * TILE, y0 = tile.ty * TILE;
    const x1 = x0 + ts * TILE, y1 = y0 + ts * TILE;
    const valid = game.canPlaceBuilding(game.buildMode, tile.tx, tile.ty);
    const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam),
          S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = valid ? def.color : '#ff2222';
    ctx.beginPath();
    ctx.moveTo(N.x, N.y); ctx.lineTo(E.x, E.y); ctx.lineTo(S.x, S.y); ctx.lineTo(W.x, W.y);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = valid ? '#ffffff' : '#ff0000'; ctx.lineWidth = 2; ctx.stroke();
  }
```

`_drawSelectionBox` keeps its exact body — but the box it receives is now screen-space (Task 3 changes the producer; drawing code is coordinate-agnostic).

Replace `_drawBarracksButtons` to use the shared screen-space rects:

```js
  _drawBarracksButtons(ctx, game, b) {
    const rects = barracksButtonRects(b, game.camera);
    const startX = rects[0].x, startY = rects[0].y;
    const BTH = rects[0].h;
    const totalW = rects[2].x + rects[2].w - startX;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, BTH + 20, 6); ctx.fill();
    ctx.strokeStyle = '#883322'; ctx.lineWidth = 2;
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, BTH + 20, 6); ctx.stroke();

    ctx.fillStyle = '#ff8844';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TRAIN UNIT', startX + totalW / 2, startY + BTH + 8);

    for (const [i, rc] of rects.entries()) {
      const udef = UNIT_DEFS[rc.type];
      const canAfford = game.supplies >= udef.cost;

      ctx.fillStyle = canAfford ? 'rgba(70,50,30,0.95)' : 'rgba(20,20,20,0.95)';
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 5); ctx.fill();
      ctx.strokeStyle = canAfford ? udef.color : '#444';
      ctx.lineWidth = canAfford ? 2.5 : 1;
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 5); ctx.stroke();

      ctx.beginPath();
      ctx.arc(rc.x + 14, rc.y + rc.h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = canAfford ? udef.color : '#444'; ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = canAfford ? '#eee' : '#555';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(udef.name, rc.x + 26, rc.y + 16);
      ctx.fillStyle = canAfford ? '#ffdd44' : '#444';
      ctx.font = '11px monospace';
      ctx.fillText(`$${udef.cost}`, rc.x + 26, rc.y + 32);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`${udef.trainTime}s  [${i + 6}]`, rc.x + 26, rc.y + 47);
    }

    if (b.trainQueue.length > 0) {
      const pct = b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
      const barY = startY + BTH + 18;
      ctx.fillStyle = '#333';
      ctx.fillRect(startX - 4, barY, totalW + 8, 6);
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(startX - 4, barY, (totalW + 8) * pct, 6);
      ctx.fillStyle = '#aaa'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Training: ${b.trainQueue.map(t => UNIT_DEFS[t].name).join(', ')}`, startX - 4, barY + 16);
    }
  }
```

- [ ] **Step 6: Minimap viewport becomes the projected quad**

In `_drawMinimap`, replace only the "Camera viewport rect" block (the `ctx.strokeRect(MX + game.camera.x * scaleX, ...)` call):

```js
    // Camera viewport (projected quad, clipped to the minimap)
    ctx.save();
    ctx.beginPath(); ctx.rect(MX, MY, MINIMAP_W, MINIMAP_H); ctx.clip();
    const quad = [[0, 0], [this.W, 0], [this.W, this.H], [0, this.H]].map(([sx, sy]) => {
      const w = screenToWorld(sx, sy, game.camera);
      return [MX + w.x * scaleX, MY + w.y * scaleY];
    });
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(quad[0][0], quad[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(quad[i][0], quad[i][1]);
    ctx.closePath(); ctx.stroke();
    ctx.restore();
```

The rest of `_drawMinimap` (tiles, buildings, units, zombies as logical top-down dots) stays exactly as-is — the spec keeps the minimap square (§1.1).

- [ ] **Step 7: Verify in browser**

Run the transforms test again (`node tests/transforms.test.mjs` — still passes), then serve + open. Checklist:
- Map renders as a diamond floating in dark void; grass/dirt/water checker readable
- HQ renders as a raised iso volume (the start base is just the HQ + 4 units); units/zombies are circles with ground shadows and ellipse selection rings
- A unit walking "north" on the minimap moves up-right diagonally on screen
- Waves still spawn and attack; HUD, minimap, endscreens intact; no console errors
- KNOWN BROKEN (until Task 3): clicking selects the wrong spot — do not fix here

- [ ] **Step 8: Commit**

```bash
cd ~/claude/zombie
git add js/renderer.js js/game.js
git commit -m "feat(iso): render world in 2:1 isometric projection (input still planar)"
git push
```

---

### Task 3: Input routes through the transforms

**Files:**
- Modify: `js/input.js` (`_screenToWorld`, drag-select, minimap click, barracks hit-test)
- Modify: `js/game.js:206-210` (`unitsInRect` → `unitsInScreenRect`)

**Interfaces:**
- Consumes: `screenToWorld`, `centerCameraOn`, `clampCamera`, `barracksButtonRects` (Task 1); `game.camera.zoom` (Task 2)
- Produces: `game.unitsInScreenRect(x1, y1, x2, y2) -> Unit[]` (screen-space box select); `input.selectBox` is now SCREEN coords `{x1,y1,x2,y2}`; `input._checkBarracksTrainClick(sx, sy)` takes SCREEN coords

- [ ] **Step 1: Route the mouse through the projection**

In `js/input.js` replace `_screenToWorld` (lines 35–40):

```js
  _screenToWorld(sx, sy) {
    return screenToWorld(sx, sy, this.game.camera);
  }
```

- [ ] **Step 2: Box select in screen space**

In `js/game.js`, replace `unitsInRect` (lines 206–210) with:

```js
  // Box-select against projected positions: what you see is what you select
  unitsInScreenRect(x1, y1, x2, y2) {
    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const ly = Math.min(y1, y2), ry = Math.max(y1, y2);
    return this.units.filter(u => {
      if (u.dead) return false;
      const s = worldToScreen(u.x, u.y, this.camera);
      return s.x >= lx && s.x <= rx && s.y >= ly && s.y <= ry;
    });
  }
```

In `js/input.js` `_onMouseMove`, the drag box becomes screen coords — replace the `if (this._dragging)` body:

```js
      if (this._dragging) {
        this.selectBox = {
          x1: this._dragStart.x, y1: this._dragStart.y,
          x2: e.clientX,          y2: e.clientY,
        };
      }
```

Delete the `this._dragStartWorld = { x: wx, y: wy };` line in `_onMouseDown` and the `this._dragStartWorld = null;` line in `_onMouseUp` (no longer used).

In `_onMouseUp`, replace the box-select call:

```js
      const units = game.unitsInScreenRect(
        this.selectBox.x1, this.selectBox.y1,
        this.selectBox.x2, this.selectBox.y2
      );
```

- [ ] **Step 3: Minimap click centers through the helper**

In `_onMouseDown`, replace the minimap-click body (the four `game.camera.x/y` lines after computing `fx`/`fy`):

```js
      const wx = fx * MAP_W * TILE, wy = fy * MAP_H * TILE;
      centerCameraOn(game.camera, wx, wy, window.innerWidth, window.innerHeight);
      clampCamera(game.camera, window.innerWidth, window.innerHeight);
      return;
```

- [ ] **Step 4: Barracks train buttons hit-test in screen space**

Replace `_checkBarracksTrainClick` entirely:

```js
  // ponytail: buildings hit-test at their ground footprint; clicking a tall
  // roof selects the tile behind it. Fine for placeholder volumes — revisit
  // with sprite hit-boxes in phase 7.
  _checkBarracksTrainClick(sx, sy) {
    const b = this.game._selectedBuilding;
    if (!b || b.type !== 'barracks' || b.dead) return null;
    for (const rc of barracksButtonRects(b, this.game.camera)) {
      if (sx >= rc.x && sx <= rc.x + rc.w && sy >= rc.y && sy <= rc.y + rc.h) return rc.type;
    }
    return null;
  }
```

And in `_onMouseDown`, change its call site to pass screen coords:

```js
      const trainResult = this._checkBarracksTrainClick(e.clientX, e.clientY);
```

- [ ] **Step 5: Verify in browser**

Serve + open. Checklist (this is the "game is whole again" gate):
- Click a soldier → selection ellipse under that soldier; click empty ground → deselect
- Drag a box on screen → exactly the visually-inside units get selected
- Right-click ground → selected units path there (watch them arrive where you clicked)
- Right-click a zombie → units attack it
- Press 1, place a wall → ghost diamond sits under the cursor, placement lands on the hovered tile, red over water/occupied
- Build a barracks (key 3 — buildables are 1 wall, 2 tower, 3 barracks, 4 depot), click it → train panel appears under the building; click Soldier → queues; keys 6/7/8 work
- Minimap click jumps the camera so the clicked spot is centered
- Del sells a selected building; R sends builder to repair; Esc cancels
- No console errors

- [ ] **Step 6: Commit**

```bash
cd ~/claude/zombie
git add js/input.js js/game.js
git commit -m "feat(iso): route all input through iso transforms (select/build/minimap)"
git push
```

---

### Task 4: Mouse-wheel zoom + middle-drag pan + clamped scrolling

**Files:**
- Modify: `js/input.js` (`_bind`, new `_onWheel`, middle-button pan in `_onMouseDown`/`_onMouseMove`/`_onMouseUp`, `updateCamera` clamping)

**Interfaces:**
- Consumes: `ZOOM_MIN`, `ZOOM_MAX`, `ISO_X`, `ISO_Y`, `clampCamera`, `screenToWorld`
- Produces: `game.camera.zoom` actually varies at runtime (0.5–2.0); everything from Tasks 2–3 must keep working at any zoom

- [ ] **Step 1: Wheel zoom toward the cursor**

In `_bind`, add:

```js
    c.addEventListener('wheel', e => this._onWheel(e), { passive: false });
```

Add the handler method:

```js
  _onWheel(e) {
    e.preventDefault();
    const cam = this.game.camera;
    const before = screenToWorld(e.clientX, e.clientY, cam);
    cam.zoom = clamp(cam.zoom * Math.pow(1.0015, -e.deltaY), ZOOM_MIN, ZOOM_MAX);
    // Keep the world point under the cursor fixed while zooming
    cam.x = (before.x - before.y) * ISO_X * cam.zoom - e.clientX;
    cam.y = (before.x + before.y) * ISO_Y * cam.zoom - e.clientY;
    clampCamera(cam, window.innerWidth, window.innerHeight);
  }
```

- [ ] **Step 2: Middle-mouse drag pan**

In `_onMouseDown`, the method currently returns early on `e.button !== 0`. Change the top to:

```js
  _onMouseDown(e) {
    if (e.button === 1) {                    // middle: start drag-pan
      e.preventDefault();
      this._panStart = { mx: e.clientX, my: e.clientY,
                         cx: this.game.camera.x, cy: this.game.camera.y };
      return;
    }
    if (e.button !== 0) return;
```

In `_onMouseMove`, add at the top (before `_updateMouseState`):

```js
    if (this._panStart) {
      const cam = this.game.camera;
      cam.x = this._panStart.cx - (e.clientX - this._panStart.mx);
      cam.y = this._panStart.cy - (e.clientY - this._panStart.my);
      clampCamera(cam, window.innerWidth, window.innerHeight);
    }
```

In `_onMouseUp`, add at the top:

```js
    if (e.button === 1) { this._panStart = null; return; }
```

Also initialize `this._panStart = null;` next to the other state in the constructor.

- [ ] **Step 3: Keyboard/edge scroll uses the shared clamp**

In `updateCamera`, replace the final two `cam.x = clamp(...)`/`cam.y = clamp(...)` lines inside `if (dx !== 0 || dy !== 0)` with:

```js
      cam.x += (dx / len) * speed * dt;
      cam.y += (dy / len) * speed * dt;
      clampCamera(cam, W, H);
```

(`const len` line stays.)

- [ ] **Step 4: Verify in browser**

Serve + open. Checklist:
- Wheel in/out: zoom range feels 0.5×–2×; the world point under the cursor stays pinned while zooming
- Fully zoomed out: whole diamond visible and centered; camera can't escape the map at any zoom
- Middle-drag pans; arrows and edge-scroll still pan; minimap click still centers
- Select/move/build/train from Task 3 all still work while zoomed in AND out (the transforms carry zoom — box select, ghost placement, barracks buttons must all land correctly)
- No console errors

- [ ] **Step 5: Commit**

```bash
cd ~/claude/zombie
git add js/input.js
git commit -m "feat(iso): mouse-wheel zoom to cursor, middle-drag pan, clamped camera"
git push
```

---

### Task 5: Cleanup, README, full playthrough smoke

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Modify: none expected (this task is verification; fix regressions found here in place)

**Interfaces:**
- Consumes: the finished phase
- Produces: documented repo; phase-1 exit checklist green

- [ ] **Step 1: .gitignore**

```
.DS_Store
.playwright-mcp/
```

- [ ] **Step 2: README.md**

```markdown
# Dead Zone RTS

Browser zombie-survival RTS. Vanilla JS + Canvas 2D, no build step, no
dependencies — open `index.html` in a browser (or `python3 -m http.server`
and open localhost) and play.

## Controls
- Left click / drag: select units · Right click: move / attack / repair
- 1–4: build (wall, tower, barracks, depot) · Esc: cancel · Del: sell
- Click barracks → train panel (6/7/8) · R: builder repairs nearest
- Mouse wheel: zoom · Middle-drag / arrows / screen edges / minimap click: pan

## Architecture
- Simulation runs on a square 80×80 tile grid in world coordinates
  (`js/game.js`, `js/entities.js`, `js/pathfinding.js`) — unchanged by rendering
- Rendering is true 2:1 isometric. ALL iso math lives in `worldToScreen` /
  `screenToWorld` in `js/utils.js`; renderer and input route through them
- Tests: `node tests/transforms.test.mjs`

## Project docs
- Design spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md`
- Current plan: `docs/superpowers/plans/2026-07-13-phase1-iso-foundation.md`
  (phase 1 of 7 — iso foundation)
- Visual mockups: `docs/mockups/visual-directions.html`
```

- [ ] **Step 3: Run the transform test one more time**

Run: `node tests/transforms.test.mjs` → `transforms.test: all assertions passed`

- [ ] **Step 4: Full playthrough smoke**

Play (dev-speed acceptable) through wave 2 at mixed zooms. Exit checklist:
- Survive past wave 1 by building walls + a tower and training a soldier
- Zombies path around walls, attack them, die to tower fire; supplies increase on kills
- Lose condition still works (optional quick check: sell everything, let HQ fall → OVERRUN screen)
- 5 minutes of play with zero console errors

- [ ] **Step 5: Commit**

```bash
cd ~/claude/zombie
git add README.md .gitignore
git commit -m "docs: README + gitignore; phase 1 (iso foundation) complete"
git push
```
