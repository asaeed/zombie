'use strict';

class Game {
  constructor() {
    this.tiles       = [];
    this.buildings   = [];
    this.units       = [];
    this.zombies     = [];
    this.projectiles = [];
    this.particles   = [];
    this.alerts      = [];   // {x, y, t, kind} — recent attack/wave locations
    this.toasts      = [];   // {text, kind, t, life} — attention messages
    this._toastLast  = {};
    this.caches      = [];
    this.bundles     = [];   // {x, y, amount, t} — death-drop supply bundles
    this.flares      = [];   // {x, y, t} — thrown flare: light + zombie magnet + fire source
    this.flareCooldown = 0;  // seconds remaining before another throw

    this.fogVisible  = new Uint8Array(MAP_W * MAP_H);
    this.fogExplored = new Uint8Array(MAP_W * MAP_H);
    this._fogTimer   = 0;

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
    this._selectedBuilding = null;
    this.buildMode   = null;     // string: building type being placed

    this.camera      = { x: 0, y: 0, zoom: 1 };

    this.status      = 'playing'; // 'playing' | 'gameover'
    this.paused      = false;
    this.gameTime    = 0;
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  start() {
    this._generateMap();
    this._placeStartingEntities();
    this._placeCaches();
    this._placeGuards();
    this._rebuildFlowField();

    // Center camera on HQ
    const hq = this.buildings.find(b => b.type === 'hq');
    if (hq) {
      centerCameraOn(this.camera, hq.x, hq.y, window.innerWidth, window.innerHeight);
      clampCamera(this.camera, window.innerWidth, window.innerHeight);
    }

    this._recomputeFog();
  }

  toSaveData() {
    const targetId = target => (target && !target.dead) ? target.id : null;
    const point = p => p ? { x: p.x, y: p.y } : null;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      tiles: this.tiles.map(row => Array.from(row)),
      fogVisible: Array.from(this.fogVisible),
      fogExplored: Array.from(this.fogExplored),
      fogTimer: this._fogTimer,
      supplies: this.supplies,
      score: this.score,
      waveNum: this.waveNum,
      waveTimer: this.waveTimer,
      waveActive: this.waveActive,
      zombiesToSpawn: [...this.zombiesToSpawn],
      spawnTimer: this.spawnTimer,
      flareCooldown: this.flareCooldown,
      status: this.status,
      gameTime: this.gameTime,
      camera: { ...this.camera },
      buildMode: this.buildMode,
      selectedIds: this.selected.filter(u => !u.dead).map(u => u.id),
      selectedBuildingId: targetId(this._selectedBuilding),
      buildings: this.buildings.map(b => ({
        id: b.id, type: b.type, tileX: b.tileX, tileY: b.tileY,
        hp: b.hp, dead: b.dead, atkCooldown: b.atkCooldown,
        atkTargetId: targetId(b.atkTarget),
        trainQueue: [...b.trainQueue], trainProgress: b.trainProgress,
        rally: point(b.rally),
      })),
      units: this.units.map(u => ({
        id: u.id, type: u.type, x: u.x, y: u.y, hp: u.hp, dead: u.dead,
        selected: u.selected, atkCooldown: u.atkCooldown,
        atkTargetId: targetId(u.atkTarget), moveTarget: point(u.moveTarget),
        waypoints: u.waypoints.map(point), attackMove: u.attackMove,
        settledAt: u._settledAt,
        carrying: u.carrying, gatherTargetId: targetId(u.gatherTarget),
        gatherCenter: point(u.gatherCenter),
        returnCargoTargetId: targetId(u.returnCargoTarget),
        gatherReturning: u._gatherReturning,
        bundleGatherCenter: point(u.bundleGatherCenter),
        bundleGatherRadius: u.bundleGatherRadius,
        bundleTargetId: targetId(u.bundleTarget),
        bundleGatherReturning: u._bundleGatherReturning,
        resourceLoadBuffer: u._resourceLoadBuffer,
        resourceUnloadBuffer: u._resourceUnloadBuffer,
        repairTargetId: targetId(u.repairTarget), repairCooldown: u.repairCooldown,
        healCooldown: u.healCooldown,
        supportHome: point(u.supportHome), supportReturning: u._supportReturning,
        formationOffset: { ...u.formationOffset },
      })),
      zombies: this.zombies.map(z => ({
        id: z.id, type: z.type, x: z.x, y: z.y, hp: z.hp, dead: z.dead,
        atkTargetId: targetId(z.atkTarget), atkCooldown: z.atkCooldown,
        dormant: z.dormant, burnTime: z.burnTime, burnMax: z.burnMax,
        burnParticleTimer: z._burnParticleTimer,
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, x: p.x, y: p.y, targetId: targetId(p.target),
        damage: p.damage, speed: p.speed, color: p.color, dead: p.dead,
      })),
      caches: this.caches.map(c => ({
        id: c.id, kind: c.kind, tileX: c.tileX, tileY: c.tileY,
        searched: c.searched, empty: c.empty, amount: c.amount,
        searchProgress: c.searchProgress,
      })),
      bundles: this.bundles.map(bd => {
        if (bd.id == null) bd.id = nextId();
        return { id: bd.id, x: bd.x, y: bd.y, amount: bd.amount };
      }),
      flares: this.flares.map(f => ({ x: f.x, y: f.y, t: f.t })),
      alerts: this.alerts.map(a => ({ x: a.x, y: a.y, t: a.t, kind: a.kind })),
    };
  }

  static fromSaveData(data) {
    if (!data || data.version !== SAVE_VERSION) throw new Error('Unsupported save version');

    const game = new Game();
    const entityById = new Map();
    const cacheById = new Map();
    const bundleById = new Map();
    const addEntity = e => {
      if (!e || e.id == null) return;
      rememberId(e.id);
      entityById.set(e.id, e);
    };
    const copyPoint = p => p ? { x: p.x, y: p.y } : null;

    game.tiles = (data.tiles || []).map(row => Uint8Array.from(row));
    if (game.tiles.length !== MAP_H || game.tiles.some(row => row.length !== MAP_W)) {
      throw new Error('Save map dimensions do not match this build');
    }
    game.fogVisible = Uint8Array.from(data.fogVisible || []);
    game.fogExplored = Uint8Array.from(data.fogExplored || []);
    if (game.fogVisible.length !== MAP_W * MAP_H) game.fogVisible = new Uint8Array(MAP_W * MAP_H);
    if (game.fogExplored.length !== MAP_W * MAP_H) game.fogExplored = new Uint8Array(MAP_W * MAP_H);
    game._fogTimer = data.fogTimer ?? 0;

    game.supplies = data.supplies ?? STARTING_SUPPLIES;
    game.score = data.score ?? 0;
    game.waveNum = data.waveNum ?? 0;
    game.waveTimer = data.waveTimer ?? FIRST_WAVE_DELAY;
    game.waveActive = !!data.waveActive;
    game.zombiesToSpawn = [...(data.zombiesToSpawn || [])];
    game.spawnTimer = data.spawnTimer ?? 0;
    game.flareCooldown = data.flareCooldown ?? 0;
    game.status = data.status || 'playing';
    game.gameTime = data.gameTime ?? 0;
    game.camera = {
      x: data.camera?.x ?? 0,
      y: data.camera?.y ?? 0,
      zoom: data.camera?.zoom ?? 1,
    };
    game.buildMode = data.buildMode || null;

    game.buildings = (data.buildings || []).map(s => {
      const b = new Building(s.type, s.tileX, s.tileY);
      b.id = s.id;
      b.hp = s.hp ?? b.maxHp;
      b.dead = !!s.dead;
      b.atkCooldown = s.atkCooldown ?? 0;
      b.trainQueue = [...(s.trainQueue || [])].filter(type => UNIT_DEFS[type]);
      b.trainProgress = s.trainProgress ?? 0;
      b.rally = copyPoint(s.rally);
      b._saveAtkTargetId = s.atkTargetId ?? null;
      addEntity(b);
      return b;
    });

    game.caches = (data.caches || []).map(s => {
      const c = new Cache(s.kind, s.tileX, s.tileY);
      c.id = s.id;
      c.searched = !!s.searched;
      c.empty = !!s.empty;
      c.amount = s.amount ?? 0;
      c.searchProgress = s.searchProgress ?? 0;
      rememberId(c.id);
      cacheById.set(c.id, c);
      return c;
    });

    game.bundles = (data.bundles || []).map(bd => {
      const bundle = { id: bd.id ?? nextId(), x: bd.x, y: bd.y, amount: bd.amount };
      rememberId(bundle.id);
      bundleById.set(bundle.id, bundle);
      return bundle;
    });

    game.units = (data.units || []).map(s => {
      const u = new Unit(s.type, s.x, s.y);
      u.id = s.id;
      u.hp = s.hp ?? u.maxHp;
      u.dead = !!s.dead;
      u.selected = false;
      u.atkCooldown = s.atkCooldown ?? 0;
      u.moveTarget = copyPoint(s.moveTarget);
      u.waypoints = (s.waypoints || []).map(copyPoint).filter(Boolean);
      u._settledAt = s.settledAt ?? u._settledAt;
      rememberSettleOrder(u._settledAt);
      u.attackMove = !!s.attackMove;
      u.carrying = s.carrying ?? 0;
      u._gatherReturning = !!s.gatherReturning;
      u.gatherCenter = copyPoint(s.gatherCenter);
      u.bundleGatherCenter = copyPoint(s.bundleGatherCenter);
      u.bundleGatherRadius = s.bundleGatherRadius ?? BUNDLE_GATHER_RADIUS;
      u._bundleGatherReturning = !!s.bundleGatherReturning;
      u._resourceLoadBuffer = s.resourceLoadBuffer ?? 0;
      u._resourceUnloadBuffer = s.resourceUnloadBuffer ?? 0;
      u.repairCooldown = s.repairCooldown ?? 0;
      u.healCooldown = s.healCooldown ?? 0;
      u.supportHome = copyPoint(s.supportHome);
      u._supportReturning = !!s.supportReturning && !!u.supportHome;
      u.formationOffset = s.formationOffset || { x: 0, y: 0 };
      u._saveAtkTargetId = s.atkTargetId ?? null;
      u._saveGatherTargetId = s.gatherTargetId ?? null;
      u._saveReturnCargoTargetId = s.returnCargoTargetId ?? null;
      u._saveBundleTargetId = s.bundleTargetId ?? null;
      u._saveRepairTargetId = s.repairTargetId ?? null;
      addEntity(u);
      return u;
    });

    game.zombies = (data.zombies || []).map(s => {
      const z = new Zombie(s.type, s.x, s.y);
      z.id = s.id;
      z.hp = s.hp ?? z.maxHp;
      z.dead = !!s.dead;
      z.atkCooldown = s.atkCooldown ?? 0;
      z.dormant = !!s.dormant;
      z.burnTime = s.burnTime ?? 0;
      z.burnMax = s.burnMax ?? z.burnTime;
      z._burnParticleTimer = s.burnParticleTimer ?? 0;
      z._saveAtkTargetId = s.atkTargetId ?? null;
      addEntity(z);
      return z;
    });

    for (const b of game.buildings) {
      b.atkTarget = entityById.get(b._saveAtkTargetId) || null;
      delete b._saveAtkTargetId;
    }
    for (const u of game.units) {
      u.atkTarget = entityById.get(u._saveAtkTargetId) || null;
      u.gatherTarget = cacheById.get(u._saveGatherTargetId) || null;
      if (!u.gatherCenter && u.gatherTarget) {
        u.gatherCenter = { x: u.gatherTarget.x, y: u.gatherTarget.y };
      }
      u.returnCargoTarget = entityById.get(u._saveReturnCargoTargetId) || null;
      u.bundleTarget = bundleById.get(u._saveBundleTargetId) || null;
      u.repairTarget = entityById.get(u._saveRepairTargetId) || null;
      delete u._saveAtkTargetId;
      delete u._saveGatherTargetId;
      delete u._saveReturnCargoTargetId;
      delete u._saveBundleTargetId;
      delete u._saveRepairTargetId;
    }
    for (const z of game.zombies) {
      z.atkTarget = entityById.get(z._saveAtkTargetId) || null;
      delete z._saveAtkTargetId;
    }

    game.projectiles = (data.projectiles || []).map(s => {
      const target = entityById.get(s.targetId);
      if (!target) return null;
      const p = new Projectile(s.x, s.y, target, s.damage, s.speed, s.color);
      p.id = s.id;
      p.dead = !!s.dead;
      rememberId(p.id);
      return p;
    }).filter(Boolean);

    const selectedIds = new Set(data.selectedIds || []);
    game.selected = [];
    for (const u of game.units) {
      u.selected = selectedIds.has(u.id);
      if (u.selected && !u.dead) game.selected.push(u);
    }
    game._selectedBuilding = entityById.get(data.selectedBuildingId) || null;
    game.flares = (data.flares || []).map(f => ({ x: f.x, y: f.y, t: f.t }));
    game.alerts = (data.alerts || []).map(a => ({ x: a.x, y: a.y, t: a.t, kind: a.kind }));
    game.projectiles = game.projectiles.filter(p => !p.dead);
    game.particles = [];
    game.flowDirty = true;
    game._rebuildFlowField();
    return game;
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
        // Caches can't be built over (buried loot)
        for (const c of this.caches) {
          if (c.tileX === tx && c.tileY === ty) return false;
        }
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
    this.addSupplies(Math.floor(BUILDING_DEFS[building.type].cost * 0.5));
    building.dead = true;
    this.flowDirty = true;
  }

  // HQ plus depots define supply storage. Supplies already banked above the cap
  // persist (spend-only) — losing a depot never destroys what you have.
  storageCap() {
    const hqCap = this.buildings.some(b => !b.dead && b.type === 'hq') ? HQ_STORAGE : 0;
    const depotCap = DEPOT_STORAGE * this.buildings.filter(b => !b.dead && b.type === 'depot').length;
    return hqCap + depotCap;
  }

  supplyRoom() {
    return Math.max(0, this.storageCap() - this.supplies);
  }

  // Add supplies up to the storage cap; returns the amount actually stored
  addSupplies(n) {
    const room = this.supplyRoom();
    const added = Math.min(n, room);
    this.supplies += added;
    return added;
  }

  addToast(text, kind = 'info', key = text, cooldown = 5) {
    const now = this.gameTime;
    if (this._toastLast[key] != null && now - this._toastLast[key] < cooldown) return false;
    this._toastLast[key] = now;
    this.toasts.push({ text, kind, t: 0, life: 4 });
    if (this.toasts.length > 5) this.toasts.shift();
    return true;
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

  nearestDropoff(x, y) {
    let best = null, bestD2 = Infinity;
    for (const b of this.buildings) {
      if (b.dead || (b.type !== 'hq' && b.type !== 'depot')) continue;
      const d2 = dist2(x, y, b.x, b.y);
      if (d2 < bestD2) { bestD2 = d2; best = b; }
    }
    return best;
  }

  wakeDormantNear(x, y, radius) {
    for (const z of this.zombies) {
      if (z.dead || !z.dormant) continue;
      if (dist2(x, y, z.x, z.y) < radius * radius) z.dormant = false;
    }
  }

  // Throw a flare at an explored point: light + zombie magnet + fire source
  throwFlare(wx, wy) {
    if (this.flareCooldown > 0) {
      this.addToast(`Flare recharging: ${Math.ceil(this.flareCooldown)}s`, 'warning', 'flare-cooldown', 1);
      return false;
    }
    if (this.supplies < FLARE_COST) {
      this.addToast(`Need ${FLARE_COST} supplies for a flare`, 'warning', 'flare-supplies', 2);
      return false;
    }
    if (!this.tileExplored(Math.floor(wx / TILE), Math.floor(wy / TILE))) {
      this.addToast('Flares can only be thrown onto explored ground', 'warning', 'flare-unexplored', 2);
      return false;
    }
    this.supplies -= FLARE_COST;
    this.flareCooldown = FLARE_COOLDOWN;
    this.flares.push({ x: wx, y: wy, t: 0 });
    this.wakeDormantNear(wx, wy, FLARE_LIGHT_RADIUS * TILE);  // light wakes sleepers
    this.igniteZombiesNear(wx, wy, FLARE_FIRE_RADIUS * TILE);
    this.addToast('Flare thrown', 'info', 'flare-thrown', 1);
    return true;
  }

  igniteZombiesNear(x, y, radius) {
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (dist2(x, y, z.x, z.y) <= radius * radius) z.ignite();
    }
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

  // ── Fog of war ─────────────────────────────────────────────────────────────────
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
      if (!u.dead) this._markVision(u.x, u.y, this.visionRadius(u.type));
    }
    for (const b of this.buildings) {
      if (!b.dead) this._markVision(b.x, b.y, this.visionRadius(b.type));
    }
    for (const f of this.flares) this._markVision(f.x, f.y, FLARE_LIGHT_RADIUS);
    for (const z of this.zombies) {
      if (!z.dead && z.burning) this._markVision(z.x, z.y, FIRE_LIGHT_RADIUS);
    }
  }

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
    this._waveAlerted = false;
    this.addToast(`Wave ${this.waveNum} begins`, 'danger', `wave-start-${this.waveNum}`, 0);
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
    if (!this._waveAlerted) {
      this._waveAlerted = true;
      this.addAlert(x, y, 'wave');
    }
    this.zombies.push(new Zombie(type, x, y));
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  onEntityDied(entity) {
    if (entity instanceof Zombie) {
      this.score += entity.def.reward * 10;
    } else if (entity instanceof Building) {
      this.flowDirty = true;
      for (const z of this.zombies) {
        if (z.atkTarget === entity) z.atkTarget = null;
      }
      if (entity.type === 'hq') this.status = 'gameover';
    }
  }

  // Deduped alert feed: skip if a recent alert already covers this area
  addAlert(x, y, kind) {
    for (const a of this.alerts) {
      if (this.gameTime - a.t < 3 && dist2(x, y, a.x, a.y) < 300 * 300) return;
    }
    this.alerts.push({ x, y, t: this.gameTime, kind });
  }

  spawnMuzzleFlash(x, y) {
    this.wakeDormantNear(x, y, GUARD_GUNFIRE_RADIUS);
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

  spawnHealEffect(x, y) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randFloat(15, 45);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 20,
        `hsl(${randInt(315,345)}, 90%, 72%)`,
        randFloat(0.25, 0.45)
      ));
    }
  }

  spawnFireEffect(x, y) {
    const angle = randFloat(-Math.PI, 0);
    const speed = randFloat(10, 45);
    this.particles.push(new Particle(
      x, y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - randFloat(20, 50),
      `hsl(${randInt(20,45)}, 100%, ${randInt(55,75)}%)`,
      randFloat(0.18, 0.35)
    ));
  }

  // ── Main Update ──────────────────────────────────────────────────────────────
  update(dt) {
    if (this.status !== 'playing') return;

    this.gameTime += dt;

    // Rebuild flow field if dirty
    if (this.flowDirty) {
      this._rebuildFlowField();
    }

    this._fogTimer -= dt;
    if (this._fogTimer <= 0) {
      this._fogTimer = FOG_INTERVAL;
      this._recomputeFog();
    }

    const prevFlareCooldown = this.flareCooldown;
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    if (prevFlareCooldown > 0 && this.flareCooldown === 0) {
      this.addToast('Flare ready', 'info', 'flare-ready', 5);
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
      if (this.zombiesToSpawn.length === 0 &&
          this.zombies.filter(z => !z.dead && !z.dormant).length === 0) {
        this.waveActive = false;
        // Wave-clear bonus is cap-exempt: it's the anti-softlock income floor
        this.supplies += 25 + 10 * this.waveNum;
        this.addToast(`Wave ${this.waveNum} eliminated`, 'success', `wave-clear-${this.waveNum}`, 0);
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

    // Update caches (auto-search + auto-load on adjacency)
    for (const c of this.caches) c.update(dt, this);

    // Bundle expiry
    // Bundles persist until recovered (no decay)
    this.bundles = this.bundles.filter(bd => bd.amount > 0);

    // Flare aging/expiry
    for (const f of this.flares) f.t += dt;
    for (const f of this.flares) this.igniteZombiesNear(f.x, f.y, FLARE_FIRE_RADIUS * TILE);
    this.flares = this.flares.filter(f => f.t < FLARE_DURATION);

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

    // Update attention toasts
    for (const toast of this.toasts) toast.t += dt;
    this.toasts = this.toasts.filter(toast => toast.t < toast.life);

    // Death-drop: dying units spill their carried supplies as a bundle
    for (const u of this.units) {
      if (u.dead && u.carrying > 0) {
        this.bundles.push({ id: nextId(), x: u.x, y: u.y, amount: u.carrying });
        u.carrying = 0;
      }
    }

    // Cleanup dead entities
    this.buildings   = this.buildings.filter(b => !b.dead);
    this.units       = this.units.filter(u => !u.dead);
    this.zombies     = this.zombies.filter(z => !z.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.particles   = this.particles.filter(p => !p.dead);
    this.alerts      = this.alerts.filter(a => this.gameTime - a.t < 8);

    // Remove dead from selection
    this.selected = this.selected.filter(u => !u.dead);

    // Check if HQ still exists
    if (!this.buildings.find(b => b.type === 'hq' && !b.dead)) {
      this.status = 'gameover';
    }
  }
}
