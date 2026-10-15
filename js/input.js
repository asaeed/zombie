'use strict';

class InputHandler {
  constructor(canvas, game, menuActions = {}) {
    this.canvas = canvas;
    this.game = game;
    this.menuActions = menuActions;
    this.menuOpen = false;
    this.menuNotice = null;
    this.saveMeta = { auto: null, slots: {} };

    // Mouse state
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseWorld = { x: 0, y: 0 };
    this.mouseTile = null;

    // Drag selection
    this.selectBox = null;    // {x1,y1,x2,y2} in screen space
    this._dragStart = null;   // screen coords
    this._dragging = false;

    // Set by mousedown paths that fully handle a click (train button,
    // building select, attack-move) so the paired mouseup's fallback
    // selection logic must not run.
    this._clickHandled = false;

    // Keyboard state
    this.keys = {};

    // Middle-drag pan state
    this._panStart = null;

    // Minimap drag-to-pan state
    this._minimapDrag = false;

    // Camera bookmarks: F1-F4, {x, y, zoom} set with Shift, jumped to plain
    this.bookmarks = [];

    // Edge scrolling arms only on a click in the hot zone (hover alone is annoying)
    this._edgeScrollArmed = false;

    // Control groups + attack-move arm state
    this.groups = {};            // digit -> unit array
    this._lastGroupTap = null;   // { d, t } for double-tap detection
    this.attackMoveArm = false;
    this.flareArm = false;

    this._bind();
  }

  setSaveMeta(meta) {
    this.saveMeta = meta || { auto: null, slots: {} };
  }

  setMenuOpen(open) {
    this.menuOpen = !!open;
    if (this.game) this.game.paused = this.menuOpen;
    this.menuActions?.menuVisibility?.(this.menuOpen);
  }

  notify(text) {
    this.menuNotice = { text, t: 0, life: 2.2 };
  }

  resetTransient() {
    this.attackMoveArm = false;
    this.flareArm = false;
    this.canvas.style.cursor = '';
    this.groups = {};
    this._lastGroupTap = null;
    this._panStart = null;
    this._minimapDrag = false;
    this._dragStart = null;
    this._dragging = false;
    this.selectBox = null;
    this._edgeScrollArmed = false;
    this.setMenuOpen(false);
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('mousedown',   e => this._onMouseDown(e));
    c.addEventListener('mousemove',   e => this._onMouseMove(e));
    c.addEventListener('mouseup',     e => this._onMouseUp(e));
    c.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });
    c.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup',   e => {
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.keys[e.code] = false;
    });
  }

  _onWheel(e) {
    e.preventDefault();
    if (this._isInMinimap(e.clientX, e.clientY) || this._isInBottomPanel(e.clientY)) return;
    const cam = this.game.camera;
    const before = screenToWorld(e.clientX, e.clientY, cam);
    cam.zoom = clamp(cam.zoom * Math.pow(1.0015, -e.deltaY), ZOOM_MIN, ZOOM_MAX);
    // Keep the world point under the cursor fixed while zooming
    const s = worldToScreen(before.x, before.y, { x: 0, y: 0, zoom: cam.zoom });
    cam.x = s.x - e.clientX;
    cam.y = s.y - e.clientY;
    clampCamera(cam, window.innerWidth, window.innerHeight);
  }

  _screenToWorld(sx, sy) {
    return screenToWorld(sx, sy, this.game.camera);
  }

  _updateMouseState(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.mouseWorld = this._screenToWorld(e.clientX, e.clientY);
    const tx = Math.floor(this.mouseWorld.x / TILE);
    const ty = Math.floor(this.mouseWorld.y / TILE);
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
      this.mouseTile = { tx, ty };
    } else {
      this.mouseTile = null;
    }
  }

  _isInBottomPanel(y) {
    return y > window.innerHeight - bottomPanelHeight(window.innerWidth);
  }

  _isInMinimap(x, y) {
    const selected = !!(this.game.selected.length || this.game._selectedBuilding || this.game.selectedVehicle);
    const rc = minimapRect(window.innerWidth, window.innerHeight, selected);
    return x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h;
  }

  // Map minimap pixel -> world point, center the camera there
  _centerFromMinimap(sx, sy) {
    const selected = !!(this.game.selected.length || this.game._selectedBuilding || this.game.selectedVehicle);
    const { x: MX, y: MY } = minimapRect(window.innerWidth, window.innerHeight, selected);
    const b = mapScreenBounds(1);
    const s = MINIMAP_W / (b.maxX - b.minX);
    const px = (sx - MX) / s + b.minX;
    const py = (sy - MY) / s;
    const w = screenToWorld(px, py, { x: 0, y: 0, zoom: 1 });
    centerCameraOn(this.game.camera, w.x, w.y, window.innerWidth, window.innerHeight);
    clampCamera(this.game.camera, window.innerWidth, window.innerHeight);
  }

  // Edge-scroll hot zone: the screen borders, minus bottom panel and minimap
  _inEdgeZone(x, y) {
    const W = window.innerWidth, H = window.innerHeight, M = EDGE_SCROLL_MARGIN;
    if (this._isInBottomPanel(y) || this._isInMinimap(x, y)) return false;
    return x < M || x > W - M || y < M + 44 || y > H - bottomPanelHeight(W) - M;
  }

  _onMouseDown(e) {
    if (e.button === 0 && this._handleMainMenuClick(e.clientX, e.clientY)) return;

    if (this.game.status !== 'playing') {
      const r = endScreenButtonRect(window.innerWidth, window.innerHeight);
      if (e.button === 0 && e.clientX >= r.x && e.clientX <= r.x + r.w &&
          e.clientY >= r.y && e.clientY <= r.y + r.h) {
        this._runMenuAction('new-game');
        this._clickHandled = true;
      }
      return;
    }
    if (e.button === 1) {                    // middle: start drag-pan
      e.preventDefault();
      this._panStart = { mx: e.clientX, my: e.clientY,
                         cx: this.game.camera.x, cy: this.game.camera.y };
      return;
    }
    if (e.button !== 0) return;
    this._updateMouseState(e);

    const game = this.game;
    const wx = this.mouseWorld.x, wy = this.mouseWorld.y;

    // Production popovers win over bottom buttons and world clicks.
    if (game._selectedBuilding && !game._selectedBuilding.dead) {
      const production = this._checkProductionClick(e.clientX, e.clientY);
      if (production) {
        if (game._selectedBuilding.type === 'mechanics') game.buildVehicle(game._selectedBuilding);
        else game.trainUnit(game._selectedBuilding, production);
        game.buildMode = null;
        this.attackMoveArm = false;
        this.flareArm = false;
        this.canvas.style.cursor = '';
        this._clickHandled = true;
        return;
      }
    }

    if (game.selectedVehicle) {
      const rc = vehicleUnloadRect(window.innerWidth, window.innerHeight);
      if (e.clientX >= rc.x && e.clientX <= rc.x + rc.w &&
          e.clientY >= rc.y && e.clientY <= rc.y + rc.h) {
        game.disembarkVehicle(game.selectedVehicle);
        this._clickHandled = true;
        return;
      }
    }

    // Minimap click — minimap is drawn in zoom-1 projected space (see renderer)
    if (this._isInMinimap(e.clientX, e.clientY)) {
      this._minimapDrag = true;
      this._centerFromMinimap(e.clientX, e.clientY);
      return;
    }

    // Bottom panel: check build buttons
    if (this._isInBottomPanel(e.clientY)) {
      this._handleBuildPanelClick(e.clientX, e.clientY);
      return;
    }

    // Clicking the edge hot zone arms edge scrolling without changing selection.
    if (this._inEdgeZone(e.clientX, e.clientY)) {
      this._edgeScrollArmed = true;
      this._clickHandled = true;
      return;
    }

    // Build mode: place building
    if (game.buildMode) {
      if (this.mouseTile) {
        const placed = game.placeBuilding(game.buildMode, this.mouseTile.tx, this.mouseTile.ty);
        if (placed) game.buildMode = null;
      }
      this._clickHandled = true;
      return;
    }

    // Armed flare: this click throws it
    if (this.flareArm) {
      const thrown = game.throwFlare(wx, wy);
      if (thrown || game.flareCooldown > 0 || game.supplies < FLARE_COST) {
        this.flareArm = false;
        this.canvas.style.cursor = '';
      }
      this._clickHandled = true;
      return;
    }

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

    // Unit selection is resolved on release so Shift and drag selection still work.
    if (this._getUnitAt(e.clientX, e.clientY)) {
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._dragging = false;
      return;
    }

    // Selected units + resource cache: enter auto-gather mode.
    const cache = this._getCacheAt(e.clientX, e.clientY);
    if (cache && game.selected.length > 0) {
      game._selectedBuilding = null;
      for (const u of game.selected) u.gatherFrom(cache, game);
      this._clickHandled = true;
      return;
    }

    const bundle = this._getBundleAt(wx, wy);
    if (bundle && game.selected.length > 0) {
      game._selectedBuilding = null;
      for (const u of game.selected) u.gatherDroppedSuppliesAt(bundle.x, bundle.y, game);
      this._clickHandled = true;
      return;
    }

    const vehicle = this._getVehicleAt(e.clientX, e.clientY);
    if (vehicle) {
      game.selectedVehicle = vehicle;
      game._selectedBuilding = null;
      game.selected = [];
      for (const u of game.units) u.selected = false;
      this._clickHandled = true;
      return;
    }

    // Check if clicking on a building (for selection/info panel)
    const building = this._getBuildingAt(wx, wy);
    if (building) {
      game._selectedBuilding = building;
      game.selectedVehicle = null;
      game.selected = [];
      for (const u of game.units) u.selected = false;
      this._clickHandled = true;
      return;
    }

    // Empty map clicks dismiss production menus, but preserve other selections.
    if (game._selectedBuilding?.type === 'barracks' || game._selectedBuilding?.type === 'mechanics') {
      game._selectedBuilding = null;
    }
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._dragging = false;
  }

  _onMouseMove(e) {
    if (this._minimapDrag) {
      if (!(e.buttons & 1)) this._minimapDrag = false;
      else { this._centerFromMinimap(e.clientX, e.clientY); return; }
    }
    if (this._panStart) {
      if (!(e.buttons & 4)) {
        this._panStart = null;
      } else {
        const cam = this.game.camera;
        cam.x = this._panStart.cx - (e.clientX - this._panStart.mx);
        cam.y = this._panStart.cy - (e.clientY - this._panStart.my);
        clampCamera(cam, window.innerWidth, window.innerHeight);
      }
    }
    this._updateMouseState(e);

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
  }

  _onMouseUp(e) {
    if (e.button === 1) { this._panStart = null; return; }
    if (e.button !== 0) return;
    this._updateMouseState(e);

    const game = this.game;
    const wx = this.mouseWorld.x, wy = this.mouseWorld.y;

    if (this._dragging && this.selectBox) {
      // Box select
      const units = game.unitsInScreenRect(
        this.selectBox.x1, this.selectBox.y1,
        this.selectBox.x2, this.selectBox.y2
      );
      if (units.length > 0) {
        if (!e.shiftKey) {
          for (const u of game.units) u.selected = false;
          game.selected = [];
        }
        for (const u of units) {
          u.selected = true;
          if (!game.selected.includes(u)) game.selected.push(u);
        }
        game._selectedBuilding = null;
        game.selectedVehicle = null;
      }
    } else if (!this._dragging && !this._clickHandled && !this._minimapDrag) {
      // Single click - select unit
      if (this._isInBottomPanel(e.clientY) || this._isInMinimap(e.clientX, e.clientY)) {
        // Already handled in mousedown
      } else if (!game.buildMode) {
        const unit = this._getUnitAt(e.clientX, e.clientY);
        if (unit) {
          if (!e.shiftKey) {
            for (const u of game.units) u.selected = false;
            game.selected = [];
          }
          game._selectedBuilding = null;
          game.selectedVehicle = null;
          unit.selected = !unit.selected || !e.shiftKey;
          if (unit.selected) game.selected.push(unit);
          else game.selected = game.selected.filter(u => u !== unit);
        }
      }
    }

    this._dragStart = null;
    this._dragging = false;
    this._clickHandled = false;
    this._minimapDrag = false;
    this.selectBox = null;
  }

  _onRightClick(e) {
    this._updateMouseState(e);
    const game = this.game;

    // Cancel build mode
    if (game.buildMode) {
      game.buildMode = null;
      return;
    }

    // Selected barracks: right-click sets its rally point
    const sb = game._selectedBuilding;
    if (sb && sb.type === 'barracks' && !sb.dead) {
      sb.rally = { x: this.mouseWorld.x, y: this.mouseWorld.y };
      return;
    }

    const wx = this.mouseWorld.x, wy = this.mouseWorld.y;

    if (game.selectedVehicle && !game.selectedVehicle.dead) {
      game.selectedVehicle.moveTo(wx, wy, game);
      return;
    }

    if (game.selected.length === 0) return;

    const vehicle = this._getVehicleAt(e.clientX, e.clientY);
    if (vehicle) {
      let queued = 0;
      for (const u of [...game.selected]) if (u.boardVehicle(vehicle, game)) queued++;
      if (queued === 0) game.addToast('Armored truck is full', 'warning', 'suv-full', 2);
      return;
    }

    const zombie = this._getZombieAt(e.clientX, e.clientY);
    if (zombie) {
      for (const u of game.selected) u.attackTarget(zombie);
      return;
    }

    const cache = this._getCacheAt(e.clientX, e.clientY);
    if (cache) {
      for (const u of game.selected) u.gatherFrom(cache, game);
      return;
    }

    const bundle = this._getBundleAt(wx, wy);
    if (bundle) {
      for (const u of game.selected) u.gatherDroppedSuppliesAt(bundle.x, bundle.y, game);
      return;
    }

    // Check if builder right-clicking a building (repair)
    const building = this._getBuildingAt(wx, wy);
    if (building) {
      if (building.type === 'hq' || building.type === 'depot') {
        let sentCargo = false;
        for (const u of game.selected) {
          if (u.carrying > 0) {
            u.returnCargoTo(building, game);
            sentCargo = true;
          }
        }
        if (sentCargo) return;
      }
      let repairing = false;
      for (const u of game.selected) {
        if (u.type === 'builder') { u.repairBuilding(building); repairing = true; }
      }
      // A roof/support over open ground must not swallow an ordinary move order.
      const onFootprint = Math.abs(wx - building.x) <= building.width / 2 &&
        Math.abs(wy - building.y) <= building.height / 2;
      if (repairing || onFootprint) return;
    }

    // Move command - scatter formation
    const count = game.selected.length;
    game.selected.forEach((u, i) => {
      const row = Math.floor(i / 5), col = i % 5;
      const offsetX = (col - Math.min(count, 5) / 2) * 22;
      const offsetY = row * 22;
      u.moveTo(wx + offsetX, wy + offsetY, game);
    });
  }

  _onKeyDown(e) {
    if (e.target?.closest?.('a')) return;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    this.keys[e.code] = true;
    if (this.game.status !== 'playing') {
      if (e.code === 'Enter' && !this.menuOpen) this._runMenuAction('new-game');
      else if (e.code === 'Escape' && this.menuOpen) this.setMenuOpen(false);
      return;
    }
    const game = this.game;

    // Escape: cancel flare arm / attack-move arm / build mode / deselect
    if (e.code === 'Escape') {
      if (this.menuOpen) {
        this.setMenuOpen(false);
      } else if (this.flareArm) {
        this.flareArm = false;
        this.canvas.style.cursor = '';
      } else if (this.attackMoveArm) {
        this.attackMoveArm = false;
        this.canvas.style.cursor = '';
      } else if (game.buildMode) {
        game.buildMode = null;
      } else {
        for (const u of game.units) u.selected = false;
        game.selected = [];
        game._selectedBuilding = null;
        game.selectedVehicle = null;
      }
    }

    if (this.menuOpen) return;

    // Build hotkeys: mnemonic letters (digits are control groups now)
    const buildKeys = { KeyW: 'wall', KeyT: 'tower', KeyB: 'barracks', KeyD: 'depot', KeyL: 'light', KeyK: 'clinic', KeyM: 'mechanics' };
    if (buildKeys[e.code] && !e.shiftKey) {
      const type = buildKeys[e.code];
      game.buildMode = game.buildMode === type ? null : type;
      if (game.buildMode) {          // last intent wins: entering build mode disarms attack-move/flare
        this.attackMoveArm = false;
        this.flareArm = false;
        this.canvas.style.cursor = '';
      }
    }

    const trainKeys = { KeyZ: 'soldier', KeyX: 'builder', KeyC: 'scout', KeyV: 'medic', KeyQ: 'sniper', KeyE: 'heavy', KeyY: 'torchbearer' };
    if (trainKeys[e.code]) {
      const b = game._selectedBuilding;
      if (b && b.type === 'barracks' && !b.dead) game.trainUnit(b, trainKeys[e.code]);
    }
    if (e.code === 'KeyU' && game._selectedBuilding?.type === 'mechanics') game.buildVehicle(game._selectedBuilding);
    if (e.code === 'KeyE' && game.selectedVehicle) game.disembarkVehicle(game.selectedVehicle);

    // Control groups: digit selects, Shift+digit assigns, double-tap centers
    const dm = /^Digit([1-9])$/.exec(e.code);
    if (dm) {
      const d = dm[1];
      if (e.shiftKey) {
        if (game.selected.length > 0) this.groups[d] = [...game.selected];
      } else {
        const grp = (this.groups[d] || []).filter(u => !u.dead && !u.vehicle);
        this.groups[d] = grp;
        for (const u of game.units) u.selected = false;
        game.selected = [...grp];
        for (const u of grp) u.selected = true;
        if (grp.length > 0) game._selectedBuilding = null;
        if (grp.length > 0) game.selectedVehicle = null;
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
      game.selected = game.units.filter(u => !u.dead && !u.vehicle && u.type !== 'builder' &&
        u.type !== 'medic' && !u.atkTarget && u.waypoints.length === 0 &&
        !u.repairTarget && !u.gatherTarget && !u.bundleGatherCenter);
      for (const u of game.selected) u.selected = true;
      if (game.selected.length > 0) game._selectedBuilding = null;
      if (game.selected.length > 0) game.selectedVehicle = null;
    }

    // Delete: sell selected building
    if (e.code === 'Delete' && game._selectedBuilding) {
      game.sellBuilding(game._selectedBuilding);
      game._selectedBuilding = null;
    }

    // R: builder repair
    if (e.code === 'KeyR') {
      // Find nearest damaged building
      for (const u of game.selected) {
        if (u.type === 'builder') {
          let nearestB = null, nearestD = Infinity;
          for (const b of game.buildings) {
            if (b.dead || b.hp >= b.maxHp) continue;
            const d = dist(u.x, u.y, b.x, b.y);
            if (d < nearestD) { nearestD = d; nearestB = b; }
          }
          if (nearestB) u.repairBuilding(nearestB);
        }
      }
    }

    // A: arm attack-move — next left-click orders move-and-engage
    if (e.code === 'KeyA' && game.selected.length > 0) {
      this.attackMoveArm = true;
      this.flareArm = false;         // last intent wins: arming cancels flare arm
      this.canvas.style.cursor = 'crosshair';
      game.buildMode = null;         // last intent wins: arming cancels build mode
    }

    // F: arm flare throw (next click is the target)
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) {
      if (this.flareArm) {
        game.addToast('Flare armed: click explored ground', 'info', 'flare-armed', 1);
      } else if (game.flareCooldown > 0) {
        game.addToast(`Flare recharging: ${Math.ceil(game.flareCooldown)}s`, 'warning', 'flare-cooldown', 1);
      } else if (game.supplies < FLARE_COST) {
        game.addToast(`Need ${FLARE_COST} supplies for a flare`, 'warning', 'flare-supplies', 2);
      } else {
        this.flareArm = true;
        this.attackMoveArm = false;
        game.buildMode = null;
        this.canvas.style.cursor = 'crosshair';
        game.addToast('Flare armed: click explored ground', 'info', 'flare-armed', 1);
      }
    }

    // S: stop all
    if (e.code === 'KeyS' && !e.ctrlKey) {
      for (const u of game.selected) u.stop();
      this.attackMoveArm = false;
      this.canvas.style.cursor = '';
    }

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
  }

  _handleBuildPanelClick(sx, sy) {
    const game = this.game;
    for (const rc of buildButtonRects(window.innerWidth, window.innerHeight)) {
      if (sx >= rc.x && sx <= rc.x + rc.w && sy >= rc.y && sy <= rc.y + rc.h) {
        const type = rc.type;
        game.buildMode = game.buildMode === type ? null : type;
        if (game.buildMode) { this.attackMoveArm = false; this.flareArm = false; this.canvas.style.cursor = ''; }
        break;
      }
    }
  }

  _hasMenuSave(action) {
    if (action === 'load-auto') return !!this.saveMeta.auto;
    const m = /^load-slot-(\d)$/.exec(action);
    return !m || !!this.saveMeta.slots[m[1]];
  }

  _handleMainMenuClick(sx, sy) {
    const W = window.innerWidth;
    const button = mainMenuButtonRect(W);
    if (sx >= button.x && sx <= button.x + button.w &&
        sy >= button.y && sy <= button.y + button.h) {
      this.setMenuOpen(!this.menuOpen);
      this._clickHandled = true;
      return true;
    }

    if (!this.menuOpen) return false;

    for (const rc of mainMenuActionRects(W)) {
      if (sx < rc.x || sx > rc.x + rc.w || sy < rc.y || sy > rc.y + rc.h) continue;
      if (!this._hasMenuSave(rc.action)) {
        this.notify('No save found');
        return true;
      }
      this._runMenuAction(rc.action);
      this._clickHandled = true;
      return true;
    }

    const panel = mainMenuPanelRect(W);
    if (sx < panel.x || sx > panel.x + panel.w || sy < panel.y || sy > panel.y + panel.h) {
      this.setMenuOpen(false);
    }
    this._clickHandled = true;
    return true;
  }

  _runMenuAction(action) {
    if (action === 'resume') {
      this.setMenuOpen(false);
      return;
    }

    const slot = /^save-slot-(\d)$/.exec(action) || /^load-slot-(\d)$/.exec(action);
    const name = action.startsWith('save-slot') ? 'saveSlot'
               : action.startsWith('load-slot') ? 'loadSlot'
               : action.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const fn = this.menuActions[name];
    if (!fn) return;

    const result = slot ? fn(slot[1]) : fn();
    if (result?.meta) this.setSaveMeta(result.meta);
    if (result?.text) this.notify(result.text);
    if (result?.closeMenu) this.setMenuOpen(false);
  }

  // ponytail: buildings hit-test at their ground footprint; clicking a tall
  // roof selects the tile behind it. Fine for placeholder volumes — revisit
  // with sprite hit-boxes in phase 7.
  _checkProductionClick(sx, sy) {
    const b = this.game._selectedBuilding;
    if (!b || (b.type !== 'barracks' && b.type !== 'mechanics') || b.dead) return null;
    for (const rc of productionButtonRects(b, this.game.camera)) {
      if (sx >= rc.x && sx <= rc.x + rc.w && sy >= rc.y && sy <= rc.y + rc.h) return rc.type;
    }
    return null;
  }

  // Hit-tests in screen space against the projected, raised body (renderer
  // draws units at s.y - r*1.2, not at their ground point).
  _getUnitAt(sx, sy) {
    const cam = this.game.camera, z = cam.zoom;
    for (const u of this.game.units) {
      if (u.dead || u.vehicle) continue;
      const s = worldToScreen(u.x, u.y, cam);
      const r = u.def.radius * z;
      const artwork = sculptedActor(u.type);
      if (artwork) {
        const height = artwork.metadata.bodyHeight * artwork.metadata.renderScale * z;
        if (((sx - s.x) / (r * .5 + 6)) ** 2 + ((sy - s.y + height * .5) / (height * .5 + 4)) ** 2 < 1) return u;
        continue;
      }
      if (dist2(sx, sy, s.x, s.y - r * 1.2) < (r + 6) * (r + 6)) return u;
    }
    return null;
  }

  _getVehicleAt(sx, sy) {
    const cam = this.game.camera;
    for (const v of this.game.vehicles) {
      if (v.dead) continue;
      const s = worldToScreen(v.x, v.y, cam);
      const r = v.def.radius * cam.zoom;
      const artwork = sculptedActor('suv');
      if (artwork) {
        const height = artwork.metadata.bodyHeight * artwork.metadata.renderScale * cam.zoom;
        const halfWidth = 20 * (artwork.metadata.presentationScale ?? 1) * cam.zoom;
        if (Math.abs(sx - s.x) < halfWidth && sy > s.y - height - 5 && sy < s.y + 6) return v;
        continue;
      }
      if (dist2(sx, sy, s.x, s.y - r * 0.9) < (r + 9) ** 2) return v;
    }
    return null;
  }

  // Screen-space hit-test against the drawn (raised) zombie body — mirrors
  // _getUnitAt above.
  _getZombieAt(sx, sy) {
    const cam = this.game.camera, z = cam.zoom;
    for (const zb of this.game.zombies) {
      if (zb.dead) continue;
      const s = worldToScreen(zb.x, zb.y, cam);
      const r = zb.def.radius * z;
      const artwork = sculptedActor(zb.type);
      if (artwork) {
        const height = artwork.metadata.bodyHeight * artwork.metadata.renderScale * z;
        if (((sx - s.x) / (r * .5 + 6)) ** 2 + ((sy - s.y + height * .5) / (height * .5 + 4)) ** 2 < 1) return zb;
        continue;
      }
      const raise = zb.dormant ? 0.5 : 1.2;
      if (dist2(sx, sy, s.x, s.y - r * raise) < (r + 6) * (r + 6)) return zb;
    }
    return null;
  }

  _getBuildingAt(wx, wy) {
    const screen = worldToScreen(wx, wy, this.game.camera);
    let hit = null, depth = -Infinity;
    for (const b of this.game.buildings) {
      if (b.dead) continue;
      const hw = b.width/2 + 2, hh = b.height/2 + 2;
      let onBuilding = wx > b.x - hw && wx < b.x + hw && wy > b.y - hh && wy < b.y + hh;
      const artwork = sculptedObject(b.type);
      if (artwork) {
        const foot = worldToScreen((b.tileX + b.def.tileSize) * TILE, (b.tileY + b.def.tileSize) * TILE, this.game.camera);
        onBuilding ||= sculptedObjectHit(artwork, sculptedObjectRect(artwork, foot, this.game.camera.zoom), screen.x, screen.y);
      }
      const key = b.tileX + b.tileY + b.def.tileSize * 2;
      if (onBuilding && key > depth) { hit = b; depth = key; }
    }
    return hit;
  }

  _getCacheAt(sx, sy) {
    let hit = null, bestDepth = -Infinity;
    for (const c of this.game.caches) {
      if (c.empty) continue;
      if (!this.game.tileExplored(c.tileX, c.tileY)) continue;
      const { N, S, h, shell } = cacheScreenShape(c, this.game.camera);
      const artwork = sculptedObject(c.kind), rect = artwork ? sculptedObjectRect(artwork, S, this.game.camera.zoom) : null;
      const labelX = (N.x + S.x) / 2, labelY = (rect ? rect.y : N.y - h) - 8 * this.game.camera.zoom;
      const onLabel = dist2(sx, sy, labelX, labelY) <= (12 * this.game.camera.zoom) ** 2;
      const onBody = artwork ? sculptedObjectHit(artwork, rect, sx, sy) : pointInPolygon(sx, sy, shell);
      if (!onBody && !onLabel) continue;
      const depth = c.tileX + c.tileY;
      if (depth > bestDepth) { bestDepth = depth; hit = c; }
    }
    return hit;
  }

  _getBundleAt(wx, wy) {
    let best = null, bestD2 = (TILE * 0.75) ** 2;
    for (const bd of this.game.bundles) {
      if (bd.amount <= 0) continue;
      const tx = Math.floor(bd.x / TILE), ty = Math.floor(bd.y / TILE);
      if (!this.game.tileExplored(tx, ty)) continue;
      const d2 = dist2(wx, wy, bd.x, bd.y);
      if (d2 < bestD2) { bestD2 = d2; best = bd; }
    }
    return best;
  }

  // Called each frame from main loop for continuous keyboard input
  updateCamera(dt) {
    if (this.menuNotice) {
      this.menuNotice.t += dt;
      if (this.menuNotice.t >= this.menuNotice.life) this.menuNotice = null;
    }
    if (this.menuOpen) return;

    const game = this.game;
    const cam = game.camera;
    const speed = CAM_SPEED;

    let dx = 0, dy = 0;

    if (this.keys['ArrowLeft'])  dx -= 1;
    if (this.keys['ArrowRight']) dx += 1;
    if (this.keys['ArrowUp'])    dy -= 1;
    if (this.keys['ArrowDown'])  dy += 1;

    // Edge scrolling — armed by a click in the hot zone, disarmed on leaving it
    const mx = this.mouseX, my = this.mouseY;
    const W = window.innerWidth, H = window.innerHeight;
    const M = EDGE_SCROLL_MARGIN;
    if (this._edgeScrollArmed && !this._inEdgeZone(mx, my)) this._edgeScrollArmed = false;
    if (this._edgeScrollArmed) {
      if (mx < M) dx -= 1;
      if (mx > W - M) dx += 1;
      if (my < M + 44) dy -= 1;  // account for top bar
      if (my > H - bottomPanelHeight(W) - M) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      cam.x += (dx / len) * speed * dt;
      cam.y += (dy / len) * speed * dt;
      clampCamera(cam, W, H);
    }
  }
}
