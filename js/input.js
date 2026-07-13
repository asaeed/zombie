'use strict';

class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;

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
    // deselect logic must not run.
    this._clickHandled = false;

    // Keyboard state
    this.keys = {};

    // Middle-drag pan state
    this._panStart = null;

    // Edge scrolling arms only on a click in the hot zone (hover alone is annoying)
    this._edgeScrollArmed = false;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('mousedown',   e => this._onMouseDown(e));
    c.addEventListener('mousemove',   e => this._onMouseMove(e));
    c.addEventListener('mouseup',     e => this._onMouseUp(e));
    c.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });
    c.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
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
    return y > window.innerHeight - 110;
  }

  _isInMinimap(x, y) {
    const MX = window.innerWidth - MINIMAP_W - 10;
    const MY = window.innerHeight - 110 - MINIMAP_H - 10;
    return x >= MX && x <= MX + MINIMAP_W && y >= MY && y <= MY + MINIMAP_H;
  }

  // Edge-scroll hot zone: the screen borders, minus bottom panel and minimap
  _inEdgeZone(x, y) {
    const W = window.innerWidth, H = window.innerHeight, M = EDGE_SCROLL_MARGIN;
    if (this._isInBottomPanel(y) || this._isInMinimap(x, y)) return false;
    return x < M || x > W - M || y < M + 44 || y > H - 110 - M;
  }

  _onMouseDown(e) {
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

    // Minimap click — minimap is drawn in zoom-1 projected space (see renderer)
    if (this._isInMinimap(e.clientX, e.clientY)) {
      const MX = window.innerWidth - MINIMAP_W - 10;
      const MY = window.innerHeight - 110 - MINIMAP_H - 10;
      const b = mapScreenBounds(1);
      const s = MINIMAP_W / (b.maxX - b.minX);
      const px = (e.clientX - MX) / s + b.minX;
      const py = (e.clientY - MY) / s;
      const w = screenToWorld(px, py, { x: 0, y: 0, zoom: 1 });
      centerCameraOn(game.camera, w.x, w.y, window.innerWidth, window.innerHeight);
      clampCamera(game.camera, window.innerWidth, window.innerHeight);
      return;
    }

    // Bottom panel: check build buttons
    if (this._isInBottomPanel(e.clientY)) {
      this._handleBuildPanelClick(e.clientX, e.clientY);
      return;
    }

    // Clicking the edge hot zone arms edge scrolling (leaving the zone disarms)
    if (this._inEdgeZone(e.clientX, e.clientY)) this._edgeScrollArmed = true;

    // Build mode: place building
    if (game.buildMode) {
      if (this.mouseTile) {
        game.placeBuilding(game.buildMode, this.mouseTile.tx, this.mouseTile.ty);
        // Keep build mode active for quick placement
      }
      return;
    }

    // Check barracks train buttons FIRST (screen-space buttons on the building)
    if (game._selectedBuilding && game._selectedBuilding.type === 'barracks' && !game._selectedBuilding.dead) {
      const trainResult = this._checkBarracksTrainClick(e.clientX, e.clientY);
      if (trainResult) {
        game.trainUnit(game._selectedBuilding, trainResult);
        this._clickHandled = true;
        return;
      }
    }

    // Check if clicking on a building (for selection/info panel)
    const building = this._getBuildingAt(wx, wy);
    if (building) {
      game._selectedBuilding = building;
      game.selected = [];
      for (const u of game.units) u.selected = false;
      this._clickHandled = true;
      return;
    }

    // Left click in world: begin drag or select single unit
    game._selectedBuilding = null;
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._dragging = false;
  }

  _onMouseMove(e) {
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
      if (!e.shiftKey) {
        for (const u of game.units) u.selected = false;
        game.selected = [];
      }
      for (const u of units) {
        u.selected = true;
        if (!game.selected.includes(u)) game.selected.push(u);
      }
    } else if (!this._dragging && !this._clickHandled) {
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
          unit.selected = !unit.selected || !e.shiftKey;
          if (unit.selected) game.selected.push(unit);
          else game.selected = game.selected.filter(u => u !== unit);
        } else if (!e.shiftKey) {
          for (const u of game.units) u.selected = false;
          game.selected = [];
          game._selectedBuilding = null;
        }
      }
    }

    this._dragStart = null;
    this._dragging = false;
    this._clickHandled = false;
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

    if (game.selected.length === 0) return;

    const wx = this.mouseWorld.x, wy = this.mouseWorld.y;

    const zombie = this._getZombieAt(e.clientX, e.clientY);
    if (zombie) {
      for (const u of game.selected) u.attackTarget(zombie);
      return;
    }

    // Check if builder right-clicking a building (repair)
    const building = this._getBuildingAt(wx, wy);
    if (building) {
      for (const u of game.selected) {
        if (u.type === 'builder') u.repairTarget = building;
      }
      return;
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
    this.keys[e.code] = true;
    const game = this.game;

    // Escape: cancel build mode / deselect
    if (e.code === 'Escape') {
      if (game.buildMode) {
        game.buildMode = null;
      } else {
        for (const u of game.units) u.selected = false;
        game.selected = [];
        game._selectedBuilding = null;
      }
    }

    // Number keys 1-4 for build mode
    const buildables = Object.entries(BUILDING_DEFS).filter(([,d]) => d.canBuild);
    const numKey = parseInt(e.key);
    if (!isNaN(numKey) && numKey >= 1 && numKey <= buildables.length) {
      const type = buildables[numKey - 1][0];
      game.buildMode = game.buildMode === type ? null : type;
    }

    // Keys 6/7/8: train from selected barracks
    const trainable = ['soldier', 'builder', 'scout'];
    if (!isNaN(numKey) && numKey >= 6 && numKey <= 8) {
      const b = game._selectedBuilding;
      if (b && b.type === 'barracks' && !b.dead) {
        game.trainUnit(b, trainable[numKey - 6]);
      }
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
          if (nearestB) u.repairTarget = nearestB;
        }
      }
    }

    // A: stop/attack-move (stop current movement)
    if (e.code === 'KeyA') {
      for (const u of game.selected) {
        u.waypoints = [];
        u.moveTarget = null;
      }
    }

    // S: stop all
    if (e.code === 'KeyS' && !e.ctrlKey) {
      for (const u of game.selected) {
        u.waypoints = [];
        u.moveTarget = null;
        u.atkTarget = null;
      }
    }
  }

  _handleBuildPanelClick(sx, sy) {
    const game = this.game;
    const buildables = Object.entries(BUILDING_DEFS).filter(([,d]) => d.canBuild);
    const BW = 100, BH = 80, BX = 10, PY = window.innerHeight - 110;
    const BY = PY + 14;
    const gap = 8;

    buildables.forEach(([type], i) => {
      const x = BX + i * (BW + gap);
      const y = BY;
      if (sx >= x && sx <= x + BW && sy >= y && sy <= y + BH) {
        game.buildMode = game.buildMode === type ? null : type;
      }
    });

  }

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

  // Hit-tests in screen space against the projected, raised body (renderer
  // draws units at s.y - r*1.2, not at their ground point).
  _getUnitAt(sx, sy) {
    const cam = this.game.camera, z = cam.zoom;
    for (const u of this.game.units) {
      if (u.dead) continue;
      const s = worldToScreen(u.x, u.y, cam);
      const r = u.def.radius * z;
      if (dist2(sx, sy, s.x, s.y - r * 1.2) < (r + 6) * (r + 6)) return u;
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
      if (dist2(sx, sy, s.x, s.y - r * 1.2) < (r + 6) * (r + 6)) return zb;
    }
    return null;
  }

  _getBuildingAt(wx, wy) {
    for (const b of this.game.buildings) {
      if (b.dead) continue;
      const hw = b.width/2 + 2, hh = b.height/2 + 2;
      if (wx > b.x - hw && wx < b.x + hw && wy > b.y - hh && wy < b.y + hh) return b;
    }
    return null;
  }

  // Called each frame from main loop for continuous keyboard input
  updateCamera(dt) {
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
      if (my > H - 110 - M) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      cam.x += (dx / len) * speed * dt;
      cam.y += (dy / len) * speed * dt;
      clampCamera(cam, W, H);
    }
  }
}
