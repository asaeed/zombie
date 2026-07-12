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
    this.selectBox = null;    // {x1,y1,x2,y2} in world space
    this._dragStart = null;   // screen coords
    this._dragging = false;

    // Keyboard state
    this.keys = {};

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('mousedown',   e => this._onMouseDown(e));
    c.addEventListener('mousemove',   e => this._onMouseMove(e));
    c.addEventListener('mouseup',     e => this._onMouseUp(e));
    c.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
  }

  _screenToWorld(sx, sy) {
    return {
      x: sx + this.game.camera.x,
      y: sy + this.game.camera.y,
    };
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

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._updateMouseState(e);

    const game = this.game;
    const wx = this.mouseWorld.x, wy = this.mouseWorld.y;

    // Minimap click
    if (this._isInMinimap(e.clientX, e.clientY)) {
      const MX = window.innerWidth - MINIMAP_W - 10;
      const MY = window.innerHeight - 110 - MINIMAP_H - 10;
      const fx = (e.clientX - MX) / MINIMAP_W;
      const fy = (e.clientY - MY) / MINIMAP_H;
      game.camera.x = fx * MAP_W * TILE - window.innerWidth  / 2;
      game.camera.y = fy * MAP_H * TILE - window.innerHeight / 2;
      game.camera.x = clamp(game.camera.x, 0, MAP_W * TILE - window.innerWidth);
      game.camera.y = clamp(game.camera.y, 0, MAP_H * TILE - window.innerHeight);
      return;
    }

    // Bottom panel: check build buttons
    if (this._isInBottomPanel(e.clientY)) {
      this._handleBuildPanelClick(e.clientX, e.clientY);
      return;
    }

    // Build mode: place building
    if (game.buildMode) {
      if (this.mouseTile) {
        game.placeBuilding(game.buildMode, this.mouseTile.tx, this.mouseTile.ty);
        // Keep build mode active for quick placement
      }
      return;
    }

    // Check barracks train buttons FIRST (world-space buttons on the building)
    if (game._selectedBuilding && game._selectedBuilding.type === 'barracks' && !game._selectedBuilding.dead) {
      const trainResult = this._checkBarracksTrainClick(wx, wy);
      if (trainResult) {
        game.trainUnit(game._selectedBuilding, trainResult);
        return;
      }
    }

    // Check if clicking on a building (for selection/info panel)
    const building = this._getBuildingAt(wx, wy);
    if (building) {
      game._selectedBuilding = building;
      game.selected = [];
      for (const u of game.units) u.selected = false;
      return;
    }

    // Left click in world: begin drag or select single unit
    game._selectedBuilding = null;
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._dragStartWorld = { x: wx, y: wy };
    this._dragging = false;
  }

  _onMouseMove(e) {
    this._updateMouseState(e);

    if (this._dragStart) {
      const dx = e.clientX - this._dragStart.x;
      const dy = e.clientY - this._dragStart.y;
      if (!this._dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        this._dragging = true;
      }
      if (this._dragging) {
        const ww = this.mouseWorld;
        this.selectBox = {
          x1: this._dragStartWorld.x, y1: this._dragStartWorld.y,
          x2: ww.x, y2: ww.y,
        };
      }
    }
  }

  _onMouseUp(e) {
    if (e.button !== 0) return;
    this._updateMouseState(e);

    const game = this.game;
    const wx = this.mouseWorld.x, wy = this.mouseWorld.y;

    if (this._dragging && this.selectBox) {
      // Box select
      const units = game.unitsInRect(
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
    } else if (!this._dragging) {
      // Single click - select unit
      if (this._isInBottomPanel(e.clientY) || this._isInMinimap(e.clientX, e.clientY)) {
        // Already handled in mousedown
      } else if (!game.buildMode) {
        const unit = this._getUnitAt(wx, wy);
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
    this._dragStartWorld = null;
    this._dragging = false;
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

    // Check if right-clicking a zombie
    const zombie = game.zombieAt(wx, wy);
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

  _checkBarracksTrainClick(wx, wy) {
    // Buttons are in world space, attached to the barracks building
    // Must match renderer._drawBarracksButtons layout
    const b = this.game._selectedBuilding;
    if (!b || b.type !== 'barracks' || b.dead) return null;

    const BTW = 96, BTH = 58, gap = 6;
    const totalW = 3 * BTW + 2 * gap;
    const startX = b.x - totalW / 2;
    const startY = b.y + b.height / 2 + 10;
    const trainable = ['soldier', 'builder', 'scout'];

    for (let i = 0; i < trainable.length; i++) {
      const bx = startX + i * (BTW + gap);
      if (wx >= bx && wx <= bx + BTW && wy >= startY && wy <= startY + BTH) {
        return trainable[i];
      }
    }
    return null;
  }

  _getUnitAt(wx, wy) {
    for (const u of this.game.units) {
      if (u.dead) continue;
      if (dist2(wx, wy, u.x, u.y) < (u.def.radius + 4) ** 2) return u;
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

    if (this.keys['ArrowLeft']  || this.keys['KeyA'] && game.selected.length === 0) dx -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD'] && game.selected.length === 0) dx += 1;
    if (this.keys['ArrowUp']    || this.keys['KeyW'] && game.selected.length === 0) dy -= 1;
    if (this.keys['ArrowDown']  || this.keys['KeyS'] && game.selected.length === 0) dy += 1;

    // Edge scrolling
    const mx = this.mouseX, my = this.mouseY;
    const W = window.innerWidth, H = window.innerHeight;
    const M = EDGE_SCROLL_MARGIN;
    if (mx < M) dx -= 1;
    if (mx > W - M) dx += 1;
    if (my < M + 44) dy -= 1;  // account for top bar
    if (my > H - 110 - M) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      cam.x = clamp(cam.x + (dx/len) * speed * dt, 0, Math.max(0, MAP_W*TILE - W));
      cam.y = clamp(cam.y + (dy/len) * speed * dt, 0, Math.max(0, MAP_H*TILE - H));
    }
  }
}
