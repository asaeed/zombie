'use strict';

class Game {
  constructor() {
    this.tiles       = [];
    this.buildings   = [];
    this.units       = [];
    this.zombies     = [];
    this.projectiles = [];
    this.particles   = [];

    this.supplies    = STARTING_SUPPLIES;
    this.score       = 0;
    this.waveNum     = 0;
    this.waveTimer   = FIRST_WAVE_DELAY;
    this.waveActive  = false;
    this.zombiesToSpawn = [];
    this.spawnTimer  = 0;

    this.flowField   = [];
    this.flowDirty   = true;

    this.selected    = [];       // selected units
    this.buildMode   = null;     // string: building type being placed

    this.camera      = { x: 0, y: 0, zoom: 1 };

    this.status      = 'playing'; // 'playing' | 'gameover' | 'victory'
    this.gameTime    = 0;
    this.surviveTarget = 600; // 10 minutes to "win"
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  start() {
    this._generateMap();
    this._placeStartingEntities();
    this._rebuildFlowField();

    // Center camera on HQ
    const hq = this.buildings.find(b => b.type === 'hq');
    if (hq) {
      centerCameraOn(this.camera, hq.x, hq.y, window.innerWidth, window.innerHeight);
      clampCamera(this.camera, window.innerWidth, window.innerHeight);
    }
  }

  _generateMap() {
    // Fill with grass
    for (let y = 0; y < MAP_H; y++) {
      this.tiles[y] = new Uint8Array(MAP_W).fill(TILE_GRASS);
    }

    // Add dirt patches
    for (let i = 0; i < 30; i++) {
      const cx = randInt(2, MAP_W-3), cy = randInt(2, MAP_H-3);
      const r = randInt(1, 4);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx+dy*dy <= r*r) {
            const tx = cx+dx, ty = cy+dy;
            if (tx > 0 && ty > 0 && tx < MAP_W-1 && ty < MAP_H-1)
              this.tiles[ty][tx] = TILE_DIRT;
          }
        }
      }
    }

    // Add water lakes - avoid center 20x20
    for (let i = 0; i < 8; i++) {
      const cx = randInt(5, MAP_W-6), cy = randInt(5, MAP_H-6);
      if (Math.abs(cx - MAP_W/2) < 12 && Math.abs(cy - MAP_H/2) < 12) continue;
      const r = randInt(2, 5);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx+dy*dy <= r*r) {
            const tx = cx+dx, ty = cy+dy;
            if (tx > 0 && ty > 0 && tx < MAP_W-1 && ty < MAP_H-1)
              this.tiles[ty][tx] = TILE_WATER;
          }
        }
      }
    }
  }

  _placeStartingEntities() {
    const cx = Math.floor(MAP_W/2), cy = Math.floor(MAP_H/2);

    // HQ at center
    this._addBuilding('hq', cx - 1, cy - 1);

    // Starting soldiers
    this.spawnUnit('soldier', tileCenterX(cx - 3), tileCenterY(cy));
    this.spawnUnit('soldier', tileCenterX(cx + 3), tileCenterY(cy));
    this.spawnUnit('soldier', tileCenterX(cx),     tileCenterY(cy - 3));
    this.spawnUnit('builder', tileCenterX(cx - 2), tileCenterY(cy + 3));
  }

  // ── Flow Field ──────────────────────────────────────────────────────────────
  _rebuildFlowField() {
    this.flowField = buildFlowField(this.buildings, this.tiles);
    this.flowDirty = false;
  }

  // ── Building ─────────────────────────────────────────────────────────────────
  _addBuilding(type, tileX, tileY) {
    // Clear tiles under building from water
    const ts = BUILDING_DEFS[type].tileSize;
    for (let dy = 0; dy < ts; dy++) {
      for (let dx = 0; dx < ts; dx++) {
        this.tiles[tileY+dy][tileX+dx] = TILE_GRASS;
      }
    }
    const b = new Building(type, tileX, tileY);
    this.buildings.push(b);
    this.flowDirty = true;
    return b;
  }

  canPlaceBuilding(type, tileX, tileY) {
    const def = BUILDING_DEFS[type];
    if (!def || !def.canBuild) return false;
    if (this.supplies < def.cost) return false;

    const ts = def.tileSize;
    for (let dy = 0; dy < ts; dy++) {
      for (let dx = 0; dx < ts; dx++) {
        const tx = tileX + dx, ty = tileY + dy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
        if (this.tiles[ty][tx] === TILE_WATER) return false;
        // Check for existing buildings
        for (const b of this.buildings) {
          if (b.dead) continue;
          const bts = BUILDING_DEFS[b.type].tileSize;
          if (tx >= b.tileX && tx < b.tileX + bts &&
              ty >= b.tileY && ty < b.tileY + bts) return false;
        }
      }
    }
    return true;
  }

  placeBuilding(type, tileX, tileY) {
    if (!this.canPlaceBuilding(type, tileX, tileY)) return false;
    this.supplies -= BUILDING_DEFS[type].cost;
    this._addBuilding(type, tileX, tileY);
    return true;
  }

  sellBuilding(building) {
    if (building.type === 'hq') return;
    this.supplies += Math.floor(BUILDING_DEFS[building.type].cost * 0.5);
    building.dead = true;
    this.flowDirty = true;
  }

  // ── Units ────────────────────────────────────────────────────────────────────
  spawnUnit(type, x, y) {
    const u = new Unit(type, x, y);
    this.units.push(u);
    return u;
  }

  trainUnit(barracks, type) {
    const cost = UNIT_DEFS[type].cost;
    if (this.supplies < cost) return false;
    this.supplies -= cost;
    barracks.trainQueue.push(type);
    return true;
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  nearestZombie(x, y, range) {
    let best = null, bestD2 = range * range;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d2 = dist2(x, y, z.x, z.y);
      if (d2 < bestD2) { bestD2 = d2; best = z; }
    }
    return best;
  }

  entityAt(wx, wy) {
    // Check units first
    for (const u of this.units) {
      if (u.dead) continue;
      if (dist2(wx, wy, u.x, u.y) < u.def.radius * u.def.radius * 1.5) return u;
    }
    // Check buildings
    for (const b of this.buildings) {
      if (b.dead) continue;
      const hw = b.width/2, hh = b.height/2;
      if (wx > b.x - hw && wx < b.x + hw && wy > b.y - hh && wy < b.y + hh) return b;
    }
    return null;
  }

  zombieAt(wx, wy) {
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (dist2(wx, wy, z.x, z.y) < z.def.radius * z.def.radius * 2) return z;
    }
    return null;
  }

  unitsInRect(x1, y1, x2, y2) {
    const lx = Math.min(x1,x2), rx = Math.max(x1,x2);
    const ly = Math.min(y1,y2), ry = Math.max(y1,y2);
    return this.units.filter(u => !u.dead && u.x >= lx && u.x <= rx && u.y >= ly && u.y <= ry);
  }

  isTileBlockedForUnits(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    if (this.tiles[ty][tx] === TILE_WATER) return true;
    for (const b of this.buildings) {
      if (b.dead) continue;
      const ts = BUILDING_DEFS[b.type].tileSize;
      if (tx >= b.tileX && tx < b.tileX + ts &&
          ty >= b.tileY && ty < b.tileY + ts) return true;
    }
    return false;
  }

  // ── Waves ─────────────────────────────────────────────────────────────────────
  _scheduleWave() {
    this.waveNum++;
    const template = WAVE_TABLE[Math.min(this.waveNum - 1, WAVE_TABLE.length - 1)];
    // Scale up for later waves
    const scale = this.waveNum > WAVE_TABLE.length ? this.waveNum - WAVE_TABLE.length + 1 : 1;

    this.zombiesToSpawn = [];
    const add = (type, n) => {
      for (let i = 0; i < Math.ceil(n * scale); i++) this.zombiesToSpawn.push(type);
    };
    add('walker', template.walkers);
    add('runner', template.runners);
    add('brute',  template.brutes);

    // Shuffle
    for (let i = this.zombiesToSpawn.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [this.zombiesToSpawn[i], this.zombiesToSpawn[j]] = [this.zombiesToSpawn[j], this.zombiesToSpawn[i]];
    }

    this.waveActive = true;
    this.spawnTimer = 0;
  }

  _spawnZombieFromEdge(type) {
    const side = randInt(0, 3);
    let x, y;
    const margin = TILE * 2;
    switch (side) {
      case 0: x = randFloat(margin, MAP_W*TILE-margin); y = margin; break;
      case 1: x = MAP_W*TILE-margin; y = randFloat(margin, MAP_H*TILE-margin); break;
      case 2: x = randFloat(margin, MAP_W*TILE-margin); y = MAP_H*TILE-margin; break;
      case 3: x = margin; y = randFloat(margin, MAP_H*TILE-margin); break;
    }
    this.zombies.push(new Zombie(type, x, y));
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  onEntityDied(entity) {
    if (entity instanceof Zombie) {
      this.supplies += entity.def.reward;
      this.score += entity.def.reward * 10;
    } else if (entity instanceof Building && entity.type === 'hq') {
      this.status = 'gameover';
    }
  }

  spawnMuzzleFlash(x, y) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randFloat(30, 120);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        `hsl(${randInt(30,60)}, 100%, 70%)`,
        randFloat(0.1, 0.3)
      ));
    }
  }

  spawnBloodEffect(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randFloat(20, 80);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        `hsl(${randInt(0,30)}, 90%, ${randInt(30,50)}%)`,
        randFloat(0.2, 0.5)
      ));
    }
  }

  // ── Main Update ──────────────────────────────────────────────────────────────
  update(dt) {
    if (this.status !== 'playing') return;

    this.gameTime += dt;

    // Victory condition
    if (this.gameTime >= this.surviveTarget) {
      this.status = 'victory';
      return;
    }

    // Rebuild flow field if dirty
    if (this.flowDirty) {
      this._rebuildFlowField();
    }

    // Wave timer
    if (!this.waveActive) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this._scheduleWave();
        this.waveTimer = WAVE_INTERVAL;
      }
    } else {
      // Drip-spawn zombies
      this.spawnTimer -= dt;
      if (this.zombiesToSpawn.length > 0 && this.spawnTimer <= 0) {
        this.spawnTimer = 0.35;
        this._spawnZombieFromEdge(this.zombiesToSpawn.shift());
      }
      if (this.zombiesToSpawn.length === 0 && this.zombies.filter(z => !z.dead).length === 0) {
        this.waveActive = false;
      }
    }

    // Update buildings
    for (const b of this.buildings) {
      b.update(dt, this);
      if (b.dead) this.onEntityDied(b);
    }

    // Update units
    for (const u of this.units) {
      u.update(dt, this);
    }

    // Update zombies
    for (const z of this.zombies) z.update(dt, this);

    // Update projectiles (may kill zombies)
    for (const p of this.projectiles) p.update(dt);

    // Give rewards for all zombies killed this frame
    for (const z of this.zombies) {
      if (z.dead && !z._rewardGiven) {
        z._rewardGiven = true;
        this.onEntityDied(z);
        this.spawnBloodEffect(z.x, z.y);
      }
    }

    // Update particles
    for (const p of this.particles) p.update(dt);

    // Cleanup dead entities
    this.buildings   = this.buildings.filter(b => !b.dead);
    this.units       = this.units.filter(u => !u.dead);
    this.zombies     = this.zombies.filter(z => !z.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.particles   = this.particles.filter(p => !p.dead);

    // Remove dead from selection
    this.selected = this.selected.filter(u => !u.dead);

    // Check if HQ still exists
    if (!this.buildings.find(b => b.type === 'hq' && !b.dead)) {
      this.status = 'gameover';
    }
  }
}
