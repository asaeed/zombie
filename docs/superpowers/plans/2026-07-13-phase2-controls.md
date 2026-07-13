# Phase 2: Controls & Camera QoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RTS-grade controls — attack-move, control groups, rally points, camera bookmarks, alert jumps, idle-unit select, restart button — plus the input-hygiene fixes deferred from phase 1.

**Architecture:** All changes ride on phase 1's transforms (`worldToScreen`/`screenToWorld`/`centerCameraOn`/`clampCamera` in `js/utils.js`). Simulation files gain exactly three small features (unit `attackMove`, building `rally`, `game.alerts`); everything else is input/renderer. Spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md` §6.2, §6.3, §8 phase 2.

**Tech Stack:** Vanilla JS, Canvas 2D, plain script tags. Tests: `node tests/transforms.test.mjs` (unchanged) + live browser verification via Playwright.

## Global Constraints

- No dependencies, no build step, no modules; `'use strict';` everywhere
- Iso math ONLY in `js/utils.js` — everything projects through its helpers
- Simulation edits allowed ONLY as specified here: `Unit.attackMove`, `Building.rally`, `game.alerts`/`addAlert`, alert push in `Zombie.update`, deletion of dead `game.zombieAt`. Combat/economy numbers must not change
- User-facing copy changes ONLY where a step specifies the exact new string (hotkey hints, end screens)
- **Hotkey map after this phase** (single source of truth):
  - Build: `W` wall, `T` tower, `B` barracks, `D` depot (digits no longer build)
  - Digits `1–9`: select control group · `Shift+digit`: assign group · double-tap digit (<400 ms): center camera on group
  - `A`: arm attack-move (with selection), then left-click target · `S`: stop · `R`: builder repair (unchanged) · `H`: select idle military · Esc: cancel arm/build/deselect
  - Barracks train: `Z` soldier, `X` builder, `C` scout (was 6/7/8)
  - Camera: `Space` → HQ · `F1–F4` jump to bookmark · `Shift+F1–F4` set bookmark · `N` → latest alert · arrows/edge-click/middle-drag/wheel unchanged · WASD camera REMOVED
  - `Enter` or on-screen button: restart after game over / victory
  - Rationale for deviations from spec §6.3: browser reserves Ctrl+digit (tab switch) → Shift+digit assigns groups; Ctrl+F1–F4 → Shift+F1–F4 sets bookmarks; build letters are mnemonic (W/T/B/D) instead of positional
- Repo: `~/claude/zombie`, branch `phase-2-controls`, push after each task's commit
- Browser checks: serve `python3 -m http.server 8412`, load with a cache-buster (`?v=<epoch>`), verify freshness (`fetch('/js/input.js')` contains a symbol you just added) before trusting results; kill the server after

---

### Task 1: Input hygiene — the phase-1 deferred fixes

**Files:**
- Modify: `js/input.js`
- Modify: `js/game.js` (delete dead `zombieAt`)

**Interfaces:**
- Consumes: `worldToScreen`, `dist2`, existing input state machine
- Produces: `this._clickHandled` (named sentinel replacing overloaded `_dragging` uses — later tasks set it too); `_getZombieAt(sx, sy)` screen-space zombie hit-test

- [ ] **Step 1: Named `_clickHandled` sentinel**

In the constructor, after `this._dragging = false;` add:

```js
    // Set by mousedown paths that fully handle a click (train button,
    // building select, attack-move) so the paired mouseup's fallback
    // deselect logic must not run.
    this._clickHandled = false;
```

In `_onMouseDown`, the train-click branch: replace the `ponytail:` comment block and `this._dragging = true;` with:

```js
        this._clickHandled = true;
        return;
```

(The big comment moves to the constructor line above — delete it here.)

In `_onMouseDown`, the building-select branch: replace `this._dragging = true;` with `this._clickHandled = true;`.

In `_onMouseUp`: change `} else if (!this._dragging) {` to `} else if (!this._dragging && !this._clickHandled) {` and add `this._clickHandled = false;` next to the trailing `this._dragging = false;` cleanup.

- [ ] **Step 2: Stuck left-drag guard (off-window release)**

In `_onMouseMove`, wrap the existing `if (this._dragStart) { ... }` body:

```js
    if (this._dragStart) {
      if (!(e.buttons & 1)) {
        this._dragStart = null; this._dragging = false; this.selectBox = null;
      } else {
        const dx = e.clientX - this._dragStart.x;
        const dy = e.clientY - this._dragStart.y;
        if (!this._dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          this._dragging = true;
        }
        if (this._dragging) {
          this.selectBox = {
            x1: this._dragStart.x, y1: this._dragStart.y,
            x2: e.clientX,          y2: e.clientY,
          };
        }
      }
    }
```

- [ ] **Step 3: Zombie right-click targets the drawn body**

Add next to `_getUnitAt` (same pattern):

```js
  _getZombieAt(sx, sy) {
    const cam = this.game.camera, z = cam.zoom;
    for (const zb of this.game.zombies) {
      if (zb.dead) continue;
      const s = worldToScreen(zb.x, zb.y, cam);
      const r = zb.def.radius * z;
      if (dist2(sx, sy, s.x, s.y - r * 1.2) < (r + 6) * (r + 6)) return zb;
    }
    return null;
  }
```

In `_onRightClick`: delete the `ponytail:` comment about zombieAt and replace
`const zombie = game.zombieAt(wx, wy);` with
`const zombie = this._getZombieAt(e.clientX, e.clientY);`

In `js/game.js`: delete the now-unused `zombieAt(wx, wy) { ... }` method entirely (grep confirms no other caller).

- [ ] **Step 4: Wheel over UI zones must not zoom**

At the top of `_onWheel`, after `e.preventDefault();`:

```js
    if (this._isInMinimap(e.clientX, e.clientY) || this._isInBottomPanel(e.clientY)) return;
```

- [ ] **Step 5: Remove WASD camera; rename shadowed wx/wy**

In `updateCamera`, the four keyboard lines become arrows-only:

```js
    if (this.keys['ArrowLeft'])  dx -= 1;
    if (this.keys['ArrowRight']) dx += 1;
    if (this.keys['ArrowUp'])    dy -= 1;
    if (this.keys['ArrowDown'])  dy += 1;
```

In `_onMouseDown`'s minimap block, rename the inner `wx`/`wy` to `twx`/`twy` (they shadow the outer pair):

```js
      const twx = ... , twy = ...;   // (same expressions, new names)
      const w = screenToWorld(px, py, { x: 0, y: 0, zoom: 1 });
```

Note: after the minimap rework the inner block computes `px/py` then `w` — if no `wx/wy` shadow remains in the current code, skip the rename and say so in the report.

- [ ] **Step 6: Verify in browser**

Cache-busted load; synthetic-event checks against `window._game`:
- Click a building → panel persists; click a train button twice → queue reaches 2, panel still open (sentinel still works under its new name)
- mousedown at (400,300), mousemove to (500,400) with `buttons:0` → selectBox cleared (stuck-drag guard)
- Right-click a zombie's BODY pixel (projected `s.y - r*1.2`) with units selected → they attack it
- WheelEvent over the minimap rect → `camera.zoom` unchanged
- Arrow keys still pan; `KeyA`/`KeyD` with nothing selected no longer pan
- Zero console errors

- [ ] **Step 7: Commit**

```bash
cd ~/claude/zombie
git add js/input.js js/game.js
git commit -m "fix: input hygiene — clickHandled sentinel, drag guard, zombie body hit-test, wheel zones, WASD removal"
git push
```

---

### Task 2: Alerts + camera jumps (Space, bookmarks, N)

**Files:**
- Modify: `js/game.js` (alerts store), `js/entities.js` (alert push in Zombie.update), `js/input.js` (Space/F1–F4/N), `js/renderer.js` (minimap pings)

**Interfaces:**
- Consumes: `centerCameraOn`, `clampCamera`, minimap `mp()` helper
- Produces: `game.alerts` array of `{x, y, t, kind}` (kind: 'building' | 'unit' | 'wave'); `game.addAlert(x, y, kind)`; `input.bookmarks` array of `{x, y, zoom}`

- [ ] **Step 1: Alert store in game.js**

Constructor, after `this.particles = [];`:

```js
    this.alerts      = [];   // {x, y, t, kind} — recent attack/wave locations
```

Add method after `onEntityDied`:

```js
  // Deduped alert feed: skip if a recent alert already covers this area
  addAlert(x, y, kind) {
    for (const a of this.alerts) {
      if (this.gameTime - a.t < 3 && dist2(x, y, a.x, a.y) < 300 * 300) return;
    }
    this.alerts.push({ x, y, t: this.gameTime, kind });
  }
```

In `update(dt)`, next to the other cleanup filters:

```js
    this.alerts = this.alerts.filter(a => this.gameTime - a.t < 8);
```

Wave alert — in `_scheduleWave`, after `this.spawnTimer = 0;` add `this._waveAlerted = false;` and in `_spawnZombieFromEdge`, before `this.zombies.push(...)`:

```js
    if (!this._waveAlerted) {
      this._waveAlerted = true;
      this.addAlert(x, y, 'wave');
    }
```

- [ ] **Step 2: Combat alerts from zombie attacks**

In `js/entities.js`, `Zombie.update`, inside the attack branch right after `this.atkTarget.takeDamage(this.def.atkDmg);`:

```js
          game.addAlert(this.atkTarget.x, this.atkTarget.y,
                        this.atkTarget instanceof Building ? 'building' : 'unit');
```

- [ ] **Step 3: Camera jump keys in input.js**

Constructor: `this.bookmarks = [];` next to the other state.

In `_onKeyDown`, after the Escape block:

```js
    // Space: center on HQ
    if (e.code === 'Space') {
      e.preventDefault();
      const hq = game.buildings.find(b => b.type === 'hq' && !b.dead);
      if (hq) {
        centerCameraOn(game.camera, hq.x, hq.y, window.innerWidth, window.innerHeight);
        clampCamera(game.camera, window.innerWidth, window.innerHeight);
      }
    }

    // F1–F4: camera bookmarks (Shift sets, plain jumps)
    const fm = /^F([1-4])$/.exec(e.code);
    if (fm) {
      e.preventDefault();
      const i = fm[1] - 1;
      if (e.shiftKey) {
        this.bookmarks[i] = { x: game.camera.x, y: game.camera.y, zoom: game.camera.zoom };
      } else if (this.bookmarks[i]) {
        Object.assign(game.camera, this.bookmarks[i]);
        clampCamera(game.camera, window.innerWidth, window.innerHeight);
      }
    }

    // N: jump to the most recent alert
    if (e.code === 'KeyN' && game.alerts.length > 0) {
      const a = game.alerts[game.alerts.length - 1];
      centerCameraOn(game.camera, a.x, a.y, window.innerWidth, window.innerHeight);
      clampCamera(game.camera, window.innerWidth, window.innerHeight);
    }
```

- [ ] **Step 4: Minimap drag-to-pan**

In `js/input.js`, extract the minimap→world mapping into a helper and use it from both mousedown and mousemove. Replace the body of the minimap-click branch in `_onMouseDown` with:

```js
      this._minimapDrag = true;
      this._centerFromMinimap(e.clientX, e.clientY);
      return;
```

Add the helper next to `_isInMinimap`:

```js
  // Map minimap pixel -> world point, center the camera there
  _centerFromMinimap(sx, sy) {
    const MX = window.innerWidth - MINIMAP_W - 10;
    const MY = window.innerHeight - 110 - MINIMAP_H - 10;
    const b = mapScreenBounds(1);
    const s = MINIMAP_W / (b.maxX - b.minX);
    const px = (sx - MX) / s + b.minX;
    const py = (sy - MY) / s;
    const w = screenToWorld(px, py, { x: 0, y: 0, zoom: 1 });
    centerCameraOn(this.game.camera, w.x, w.y, window.innerWidth, window.innerHeight);
    clampCamera(this.game.camera, window.innerWidth, window.innerHeight);
  }
```

In `_onMouseMove`, at the top (before the pan block):

```js
    if (this._minimapDrag) {
      if (!(e.buttons & 1)) this._minimapDrag = false;
      else { this._centerFromMinimap(e.clientX, e.clientY); return; }
    }
```

In `_onMouseUp`, alongside the other cleanup: `this._minimapDrag = false;`
Constructor: `this._minimapDrag = false;` next to the other state.

- [ ] **Step 5: Minimap alert pings**

In `js/renderer.js` `_drawMinimap`, after the zombies loop and before the viewport rect:

```js
    // Alert pings — fading pulsing rings
    for (const a of game.alerts) {
      const age = game.gameTime - a.t;
      const [ax, ay] = mp(a.x, a.y);
      ctx.strokeStyle = `rgba(255,64,48,${Math.max(0, 0.9 - age / 8)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 3 + (age % 1.2) * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
```

- [ ] **Step 6: Verify in browser**

- Spawn a zombie next to a wall (`g.zombies.push(new Zombie('walker', x, y))` beside a placed wall), fast-forward a few seconds → `g.alerts.length > 0`, ping visible on minimap screenshot
- Press N (synthetic KeyboardEvent on window) → camera centers near the alert
- Pan away, press Space → camera centers on HQ (assert screen-center world point ≈ HQ)
- Shift+F1 at one camera spot, pan+zoom elsewhere, F1 → camera x/y/zoom restored
- Minimap drag: mousedown on minimap, mousemove across it (buttons:1) → camera follows continuously; release ends it; a drag that leaves the minimap keeps panning until release (that's fine)
- Zero console errors

- [ ] **Step 7: Commit**

```bash
git add js/game.js js/entities.js js/input.js js/renderer.js
git commit -m "feat: alert feed + minimap pings, Space/F1-F4/N camera jumps"
git push
```

---

### Task 3: Command rework — build letters, control groups, attack-move, rally, idle select

**Files:**
- Modify: `js/input.js` (keydown rework, attack-move arm, rally), `js/entities.js` (Unit.attackMove, Building.rally), `js/renderer.js` (panel labels, rally flag, armed hint)

**Interfaces:**
- Consumes: Task 1's `_clickHandled`
- Produces: `input.attackMoveArm` (bool), `input.groups` (digit→units map), `unit.attackMove` (bool), `building.rally` (`{x,y}|null`)

- [ ] **Step 1: entities.js — attack-move behavior + rally field**

`Unit` constructor, after `this.moveTarget = null;`:

```js
    this.attackMove = false;   // pause at enemies encountered en route
```

In `Unit.moveTo`, after `this.repairTarget = null;` add `this.attackMove = false;` (a plain move order cancels attack-move; the input layer re-sets the flag after calling moveTo for attack-move orders).

Replace the waypoint-following block in `Unit.update`:

```js
    // Follow waypoints (attack-move pauses while an enemy is in range)
    if (this.waypoints.length > 0) {
      if (this.attackMove && game.nearestZombie(this.x, this.y, this.def.atkRange)) {
        // hold position; the auto-attack block below does the shooting
      } else {
        const wp = this.waypoints[0];
        const d = dist(this.x, this.y, wp.x, wp.y);
        if (d < 4) {
          this.waypoints.shift();
        } else {
          this._moveToward(wp.x, wp.y, dt, game);
        }
      }
    } else {
      this.attackMove = false;
    }
```

`Building` constructor, after `this.incomeTimer = 0;`:

```js
    // Rally point for trained units (barracks)
    this.rally = null;
```

In `Building.update`, barracks training completion — after `game.spawnUnit(unitType, spawnX, spawnY);` change to:

```js
        const u = game.spawnUnit(unitType, spawnX, spawnY);
        if (this.rally) {
          u.moveTo(this.rally.x + randFloat(-20, 20), this.rally.y + randFloat(-20, 20), game);
        }
```

- [ ] **Step 2: input.js — keydown rework**

Constructor additions:

```js
    // Control groups + attack-move arm state
    this.groups = {};            // digit -> unit array
    this._lastGroupTap = null;   // { d, t } for double-tap detection
    this.attackMoveArm = false;
```

In `_onKeyDown`, REPLACE the "Number keys 1-4 for build mode" block and the "Keys 6/7/8 train" block with:

```js
    // Build hotkeys: mnemonic letters (digits are control groups now)
    const buildKeys = { KeyW: 'wall', KeyT: 'tower', KeyB: 'barracks', KeyD: 'depot' };
    if (buildKeys[e.code] && !e.shiftKey) {
      const type = buildKeys[e.code];
      game.buildMode = game.buildMode === type ? null : type;
    }

    // Barracks train: Z/X/C
    const trainKeys = { KeyZ: 'soldier', KeyX: 'builder', KeyC: 'scout' };
    if (trainKeys[e.code]) {
      const b = game._selectedBuilding;
      if (b && b.type === 'barracks' && !b.dead) game.trainUnit(b, trainKeys[e.code]);
    }

    // Control groups: digit selects, Shift+digit assigns, double-tap centers
    const dm = /^Digit([1-9])$/.exec(e.code);
    if (dm) {
      const d = dm[1];
      if (e.shiftKey) {
        if (game.selected.length > 0) this.groups[d] = [...game.selected];
      } else {
        const grp = (this.groups[d] || []).filter(u => !u.dead);
        this.groups[d] = grp;
        for (const u of game.units) u.selected = false;
        game.selected = [...grp];
        for (const u of grp) u.selected = true;
        if (grp.length > 0) game._selectedBuilding = null;
        const now = performance.now();
        if (this._lastGroupTap && this._lastGroupTap.d === d &&
            now - this._lastGroupTap.t < 400 && grp.length > 0) {
          const cx = grp.reduce((s, u) => s + u.x, 0) / grp.length;
          const cy = grp.reduce((s, u) => s + u.y, 0) / grp.length;
          centerCameraOn(game.camera, cx, cy, window.innerWidth, window.innerHeight);
          clampCamera(game.camera, window.innerWidth, window.innerHeight);
        }
        this._lastGroupTap = { d, t: now };
      }
    }

    // H: select all idle military units (soldiers/scouts standing around)
    if (e.code === 'KeyH') {
      for (const u of game.units) u.selected = false;
      game.selected = game.units.filter(u => !u.dead && u.type !== 'builder' &&
        !u.atkTarget && u.waypoints.length === 0 && !u.repairTarget);
      for (const u of game.selected) u.selected = true;
      if (game.selected.length > 0) game._selectedBuilding = null;
    }
```

REPLACE the old `KeyA` block (which only stopped units):

```js
    // A: arm attack-move — next left-click orders move-and-engage
    if (e.code === 'KeyA' && game.selected.length > 0) {
      this.attackMoveArm = true;
      this.canvas.style.cursor = 'crosshair';
    }
```

In the `KeyS` stop block, add `u.attackMove = false;` beside the other clears, plus:

```js
      this.attackMoveArm = false;
      this.canvas.style.cursor = '';
```

In the Escape block, add the same two attack-move-arm clearing lines (Esc cancels an armed attack-move like it cancels build mode).

- [ ] **Step 3: input.js — attack-move click + rally right-click**

In `_onMouseDown`, right after the build-mode block (`if (game.buildMode) { ... return; }`):

```js
    // Armed attack-move: this click is the order
    if (this.attackMoveArm) {
      this.attackMoveArm = false;
      this.canvas.style.cursor = '';
      const count = game.selected.length;
      game.selected.forEach((u, i) => {
        const row = Math.floor(i / 5), col = i % 5;
        u.moveTo(wx + (col - Math.min(count, 5) / 2) * 22, wy + row * 22, game);
        u.attackMove = true;
      });
      this._clickHandled = true;
      return;
    }
```

In `_onRightClick`, right after the build-mode cancel block:

```js
    // Selected barracks: right-click sets its rally point
    const sb = game._selectedBuilding;
    if (sb && sb.type === 'barracks' && !sb.dead) {
      this._updateMouseState(e);
      sb.rally = { x: this.mouseWorld.x, y: this.mouseWorld.y };
      return;
    }
```

(Note `_onRightClick` already calls `_updateMouseState(e)` at its top in the current code — if so, drop the duplicated call here.)

- [ ] **Step 4: renderer.js — labels, armed hint, rally flag**

Bottom panel build-button hotkey hint: replace `ctx.fillText(\`[${i+1}]\`, ...)` with:

```js
      const hotkeys = { wall: 'W', tower: 'T', barracks: 'B', depot: 'D' };
      ctx.fillText(`[${hotkeys[type]}]`, x + BW - 14, y + 12);
```

(`type` is in scope in that forEach; keep font save/restore as-is.)

Replace the three help lines in `_drawBottomPanel`:

```js
    ctx.fillText('BUILD: [W]all [T]ower [B]arracks [D]epot | Esc: cancel | Right-click: move/attack | A+click: attack-move', BX + buildables.length * (BW + gap) + 8, PY + 30);
    ctx.fillText('S: stop | R: repair | Del: sell | H: idle units | Space: HQ | F1-F4 bookmarks (Shift sets) | N: last alert', BX + buildables.length * (BW + gap) + 8, PY + 48);
    ctx.fillText('1-9: control groups (Shift assigns, double-tap centers) | Barracks: click to train (Z/X/C)', BX + buildables.length * (BW + gap) + 8, PY + 66);
```

Barracks train-button hint `[${i + 6}]` → `[${['Z','X','C'][i]}]`.

Attack-move armed banner — in `_drawHUD`, after the top-bar text:

```js
    if (input.attackMoveArm) {
      ctx.fillStyle = '#ff8866';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ATTACK-MOVE — click target (Esc cancels)', this.W / 2, 58);
    }
```

Rally flag — in `_drawBuilding`, after the barracks queue block:

```js
    if (b.type === 'barracks' && b.rally && game._selectedBuilding === b) {
      const rp = worldToScreen(b.rally.x, b.rally.y, cam);
      this._groundEllipse(ctx, rp, 8, z);
      ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#ffdd44';
      ctx.beginPath(); ctx.moveTo(rp.x, rp.y); ctx.lineTo(rp.x, rp.y - 18 * z); ctx.stroke();
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      ctx.moveTo(rp.x, rp.y - 18 * z); ctx.lineTo(rp.x + 10 * z, rp.y - 14 * z); ctx.lineTo(rp.x, rp.y - 10 * z);
      ctx.closePath(); ctx.fill();
    }
```

- [ ] **Step 5: Verify in browser**

Synthetic events against `window._game`:
- `W` toggles wall build mode; digits no longer build; place a wall to confirm flow intact
- Select 2 units, `Shift+Digit1`, click empty ground (deselect), `Digit1` → both selected again; `Digit1` twice fast → camera centers on them
- `A` then click across the map past a spawned zombie → units walk, STOP within attack range of the zombie and kill it, then resume (assert unit position holds while zombie alive, moves after)
- Barracks: select, right-click ground → `b.rally` set, flag visible when selected; train a soldier (Z) → after trainTime it walks toward the rally point
- `H` selects only idle soldiers/scouts (not the builder)
- Zero console errors

- [ ] **Step 6: Commit**

```bash
git add js/input.js js/entities.js js/renderer.js
git commit -m "feat: attack-move, control groups, rally points, idle select, letter build keys"
git push
```

---

### Task 4: Restart without F5

**Files:**
- Modify: `js/utils.js` (shared button rect), `js/main.js` (game re-init), `js/renderer.js` (end-screen button), `js/input.js` (click + Enter)

**Interfaces:**
- Produces: `endScreenButtonRect(W, H) -> {x, y, w, h}` in utils.js; `window._newGame()` in main.js

- [ ] **Step 1: utils.js**

```js
// Screen-space "play again" button on the end screens
// (renderer draws it, input hit-tests it)
function endScreenButtonRect(W, H) {
  return { x: W / 2 - 90, y: H / 2 + 80, w: 180, h: 44 };
}
```

- [ ] **Step 2: main.js re-init**

Change `const game = new Game();` to `let game = new Game();` and add after `game.start();`:

```js
  window._newGame = function () {
    game = new Game();
    input.game = game;
    window._game = game;
    game.start();
  };
```

IMPORTANT: the render/update loop must reference the `game` variable (not a captured copy) — it already does (`game.update(dt)`, `renderer.render(game, input)` read the closure variable each frame). Do not construct a new InputHandler or Renderer (listeners would double-bind).

- [ ] **Step 3: renderer.js end screens**

In `_drawGameOver`, replace the `'Press F5 to restart'` line with:

```js
    this._drawRestartButton(ctx);
```

In `_drawVictory`, replace the `'Press F5 to play again'` line with:

```js
    this._drawRestartButton(ctx);
```

Add the shared method:

```js
  _drawRestartButton(ctx) {
    const r = endScreenButtonRect(this.W, this.H);
    ctx.fillStyle = 'rgba(255,221,68,0.15)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PLAY AGAIN', r.x + r.w / 2, r.y + r.h / 2);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#aa9944';
    ctx.fillText('[Enter]', r.x + r.w / 2, r.y + r.h + 14);
  }
```

Victory screen note: its score line sits at `H/2 + 55`; the button at `H/2 + 80` clears it. Game-over subtitle at `+55` — same.

- [ ] **Step 4: input.js**

At the very top of `_onMouseDown` (before the middle-button branch):

```js
    if (this.game.status !== 'playing') {
      const r = endScreenButtonRect(window.innerWidth, window.innerHeight);
      if (e.button === 0 && e.clientX >= r.x && e.clientX <= r.x + r.w &&
          e.clientY >= r.y && e.clientY <= r.y + r.h) {
        window._newGame();
      }
      return;
    }
```

At the very top of `_onKeyDown` (after `this.keys[e.code] = true;`):

```js
    if (this.game.status !== 'playing') {
      if (e.code === 'Enter') window._newGame();
      return;
    }
```

- [ ] **Step 5: Verify in browser**

- Kill the HQ (`hq.takeDamage(99999)`, tick updates) → OVERRUN screen with button; click it → fresh game (`status === 'playing'`, supplies 500, camera on HQ); input still works (select a unit)
- Kill HQ again, press Enter → fresh game again
- No duplicate-listener artifacts: after two restarts, one click selects one unit exactly once (assert `game.selected.length === 1`)
- Zero console errors

- [ ] **Step 6: Commit**

```bash
git add js/utils.js js/main.js js/renderer.js js/input.js
git commit -m "feat: restart button + Enter on end screens (no more F5)"
git push
```

---

### Task 5: Docs + full smoke

**Files:**
- Modify: `README.md` (controls section)
- Modify: none else expected — verification task; fix regressions in place

- [ ] **Step 1: README controls section**

Replace the `## Controls` section with:

```markdown
## Controls
- Left click / drag: select units · Right click: move / attack / repair
- Build: `W`all, `T`ower, `B`arracks, `D`epot · Esc: cancel · Del: sell
- `A` + click: attack-move · `S`: stop · `R`: builder repair · `H`: select idle units
- `1–9`: control groups (`Shift+digit` assigns, double-tap centers)
- Barracks: click → train panel (`Z`/`X`/`C`) · right-click sets rally point
- Camera: wheel zoom · middle-drag / arrows / minimap click: pan
- Click a screen edge to arm auto-scroll; moving off the edge stops it
- `Space`: jump to HQ · `F1–F4`: bookmarks (`Shift+F` sets) · `N`: latest alert
- Game over / victory: click PLAY AGAIN or press Enter
```

- [ ] **Step 2: Run transforms test**

`node tests/transforms.test.mjs` → all assertions passed (nothing in this phase touches the pure math, this is a regression gate).

- [ ] **Step 3: Full playthrough smoke**

Dev-speed playthrough (same technique as phase 1): build W/T/B/D via letter keys, assign two control groups, attack-move into a wave, set a rally and train Z/X/C, use Space/F1/N navigation, survive to wave 2, die on purpose, restart via button, play 30 more sim-seconds. Zero console errors throughout. One screenshot mid-game read back and described.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: phase-2 controls reference; phase 2 complete"
git push
```
