'use strict';

function migrateSavedUnitTypes(data) {
  if (!data) return false;
  let changed = false;
  for (const unit of data.units || []) {
    if (unit.type !== 'marksman') continue;
    unit.type = 'sniper';
    changed = true;
  }
  for (const building of data.buildings || []) {
    if (!Array.isArray(building.trainQueue)) continue;
    building.trainQueue = building.trainQueue.map(type => {
      if (type !== 'marksman') return type;
      changed = true;
      return 'sniper';
    });
  }
  return changed;
}

class Game {
  constructor() {
    this.tiles       = [];
    this.buildings   = [];
    this.units       = [];
    this.vehicles    = [];
    this.zombies     = [];
    this.projectiles = [];
    this.particles   = [];
    this.threatEffects = []; // short-lived shriek and blast rings
    this.alerts      = [];   // {x, y, t, kind} — recent attack/wave locations
    this.toasts      = [];   // {text, kind, t, life} — attention messages
    this._toastLast  = {};
    this.activity = [];
    this._activityLast = {};
    this.stats = { zombiesKilled: 0, humansLost: 0, buildingsDestroyed: 0, suppliesSpent: 0 };
    this.caches      = [];
    this.bundles     = [];   // {x, y, amount, t} — death-drop supply bundles
    this.flares      = [];   // {x, y, t} — thrown flare: light + fire source
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
    this.waveDirections = [];
    this.waveSpawnIndex = 0;

    this.flowField   = [];
    this.flowDirty   = true;

    this.selected    = [];       // selected units
    this.selectedVehicle = null;
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
      stats: { ...this.stats },
      activity: this.activity.map(event => ({ ...event })),
      waveNum: this.waveNum,
      waveTimer: this.waveTimer,
      waveActive: this.waveActive,
      zombiesToSpawn: [...this.zombiesToSpawn],
      spawnTimer: this.spawnTimer,
      waveDirections: [...this.waveDirections],
      waveSpawnIndex: this.waveSpawnIndex,
      flareCooldown: this.flareCooldown,
      status: this.status,
      gameTime: this.gameTime,
      camera: { ...this.camera },
      buildMode: this.buildMode,
      selectedIds: this.selected.filter(u => !u.dead).map(u => u.id),
      selectedVehicleId: targetId(this.selectedVehicle),
      selectedBuildingId: targetId(this._selectedBuilding),
      buildings: this.buildings.map(b => ({
        id: b.id, type: b.type, tileX: b.tileX, tileY: b.tileY,
        hp: b.hp, dead: b.dead, deathHandled: !!b._deathHandled, atkCooldown: b.atkCooldown,
        atkTargetId: targetId(b.atkTarget),
        trainQueue: [...b.trainQueue], trainProgress: b.trainProgress,
        vehicleQueue: b.vehicleQueue, vehicleProgress: b.vehicleProgress,
        rally: point(b.rally),
      })),
      vehicles: this.vehicles.map(v => ({
        id: v.id, type: v.type, x: v.x, y: v.y, hp: v.hp, dead: v.dead,
        deathHandled: !!v._deathHandled,
        passengerIds: v.passengers.map(u => u.id),
        waypoints: v.waypoints.map(point), moveTarget: point(v.moveTarget),
      })),
      units: this.units.map(u => ({
        id: u.id, type: u.type, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, dead: u.dead,
        deathHandled: !!u._deathHandled,
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
        vehicleId: targetId(u.vehicle), boardingVehicleId: targetId(u.boardingVehicle),
        formationOffset: { ...u.formationOffset },
      })),
      zombies: this.zombies.map(z => ({
        id: z.id, type: z.type, x: z.x, y: z.y, hp: z.hp, dead: z.dead,
        deathHandled: !!z._deathHandled,
        atkTargetId: targetId(z.atkTarget), atkCooldown: z.atkCooldown,
        maxHp: z.maxHp, dormant: z.dormant, burnTime: z.burnTime, burnMax: z.burnMax,
        burnParticleTimer: z._burnParticleTimer, shriekCooldown: z.shriekCooldown,
        exploded: z.exploded, facing: z.facing, animDistance: z.animDistance,
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, x: p.x, y: p.y, targetId: targetId(p.target),
        damage: p.damage, speed: p.speed, color: p.color, source: p.source, dead: p.dead,
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
    migrateSavedUnitTypes(data);

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
    for (const key of Object.keys(game.stats)) {
      const value = data.stats?.[key];
      if (Number.isFinite(value)) game.stats[key] = Math.max(0, Math.floor(value));
    }
    game.activity = (Array.isArray(data.activity) ? data.activity : []).filter(event =>
      event && typeof event.text === 'string' && Number.isFinite(event.time)
    ).slice(-40).map(event => ({
      text: event.text.slice(0, 180), time: Math.max(0, event.time),
      kind: ['info', 'warning', 'danger', 'success'].includes(event.kind) ? event.kind : 'info',
    }));
    game.waveNum = data.waveNum ?? 0;
    game.waveTimer = data.waveTimer ?? FIRST_WAVE_DELAY;
    game.waveActive = !!data.waveActive;
    game.zombiesToSpawn = [...(data.zombiesToSpawn || [])];
    game.spawnTimer = data.spawnTimer ?? 0;
    game.waveDirections = (data.waveDirections || []).filter(side => Number.isInteger(side) && side >= 0 && side <= 3);
    game.waveSpawnIndex = data.waveSpawnIndex ?? 0;
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
      b._deathHandled = !!s.deathHandled;
      b.atkCooldown = s.atkCooldown ?? 0;
      b.trainQueue = [...(s.trainQueue || [])].filter(type => UNIT_DEFS[type]);
      b.trainProgress = s.trainProgress ?? 0;
      b.vehicleQueue = s.vehicleQueue ?? 0;
      b.vehicleProgress = s.vehicleProgress ?? 0;
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
      // Older unit saves omitted maxHp; their Heavy had 210 HP.
      const savedMaxHp = s.maxHp ?? (u.type === 'heavy' ? 210 : u.maxHp);
      u.hp = s.hp ?? savedMaxHp;
      if (savedMaxHp !== u.maxHp) u.hp = clamp(u.hp / savedMaxHp, 0, 1) * u.maxHp;
      u.dead = !!s.dead;
      u._deathHandled = !!s.deathHandled;
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
      u._saveVehicleId = s.vehicleId ?? null;
      u._saveBoardingVehicleId = s.boardingVehicleId ?? null;
      addEntity(u);
      return u;
    });

    game.vehicles = (data.vehicles || []).map(s => {
      const v = new Vehicle(s.type, s.x, s.y);
      v.id = s.id;
      v.hp = s.hp ?? v.maxHp;
      v.dead = !!s.dead;
      v._deathHandled = !!s.deathHandled;
      v.waypoints = (s.waypoints || []).map(copyPoint).filter(Boolean);
      v.moveTarget = copyPoint(s.moveTarget);
      v._savePassengerIds = s.passengerIds || [];
      addEntity(v);
      return v;
    });

    game.zombies = (data.zombies || []).map(s => {
      const z = new Zombie(s.type, s.x, s.y);
      z.id = s.id;
      const savedMaxHp = s.maxHp ?? z.maxHp;
      z.hp = s.dead ? 0 : Math.max(1, Math.round(clamp((s.hp ?? savedMaxHp) / savedMaxHp, 0, 1) * z.maxHp));
      z.dead = !!s.dead;
      z._deathHandled = !!s.deathHandled;
      z.atkCooldown = s.atkCooldown ?? 0;
      z.dormant = !!s.dormant;
      z.burnTime = s.burnTime ?? 0;
      z.burnMax = s.burnMax ?? z.burnTime;
      z._burnParticleTimer = s.burnParticleTimer ?? 0;
      z.shriekCooldown = s.shriekCooldown ?? 0;
      z.exploded = !!s.exploded;
      z.facing = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'].includes(s.facing) ? s.facing : 'S';
      z.animDistance = s.animDistance ?? 0;
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
      u.vehicle = entityById.get(u._saveVehicleId) || null;
      u.boardingVehicle = entityById.get(u._saveBoardingVehicleId) || null;
      delete u._saveAtkTargetId;
      delete u._saveGatherTargetId;
      delete u._saveReturnCargoTargetId;
      delete u._saveBundleTargetId;
      delete u._saveRepairTargetId;
      delete u._saveVehicleId;
      delete u._saveBoardingVehicleId;
    }
    for (const v of game.vehicles) {
      v.passengers = v._savePassengerIds.map(id => entityById.get(id)).filter(u => u instanceof Unit && !u.dead);
      for (const u of v.passengers) u.vehicle = v;
      delete v._savePassengerIds;
    }
    for (const z of game.zombies) {
      z.atkTarget = entityById.get(z._saveAtkTargetId) || null;
      delete z._saveAtkTargetId;
    }

    game.projectiles = (data.projectiles || []).map(s => {
      const target = entityById.get(s.targetId);
      if (!target) return null;
      const p = new Projectile(s.x, s.y, target, s.damage, s.speed, s.color, s.source);
      p.id = s.id;
      p.dead = !!s.dead;
      rememberId(p.id);
      return p;
    }).filter(Boolean);

    const selectedIds = new Set(data.selectedIds || []);
    game.selected = [];
    for (const u of game.units) {
      u.selected = selectedIds.has(u.id) && !u.dead && !u.vehicle;
      if (u.selected) game.selected.push(u);
    }
    game.selectedVehicle = entityById.get(data.selectedVehicleId) || null;
    game._selectedBuilding = entityById.get(data.selectedBuildingId) || null;
    game.flares = (data.flares || []).map(f => ({ x: f.x, y: f.y, t: f.t }));
    game.alerts = (data.alerts || []).map(a => ({ x: a.x, y: a.y, t: a.t, kind: a.kind }));
    game.projectiles = game.projectiles.filter(p => !p.dead);
    game.particles = [];
    game.flowDirty = true;
    game._rebuildFlowField();
    for (const z of game.zombies) {
      if (z.dead || game.canOccupyGround(z.x, z.y, z.def.radius)) continue;
      const site = game.nearestOpenGround(z.x, z.y, z.def.radius);
      if (site) { z.x = site.x; z.y = site.y; }
    }
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
      const site = this.nearestOpenGround(wx, wy, ZOMBIE_DEFS[type].radius);
      if (!site) return;
      const z = new Zombie(type, site.x, site.y);
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

    const {left, top, right, bottom} = buildingGroundRect(type, tileX, tileY);
    for (let ty = Math.floor(top / TILE); ty < Math.ceil(bottom / TILE); ty++) {
      for (let tx = Math.floor(left / TILE); tx < Math.ceil(right / TILE); tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
        if (this.tiles[ty][tx] === TILE_WATER) return false;
        // Caches can't be built over (buried loot)
        for (const c of this.caches) {
          if (c.tileX === tx && c.tileY === ty) return false;
        }
      }
    }
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (left < b.x + b.width / 2 && right > b.x - b.width / 2 &&
          top < b.y + b.height / 2 && bottom > b.y - b.height / 2) return false;
    }
    const overlaps = e => dist2(e.x, e.y, clamp(e.x, left, right), clamp(e.y, top, bottom)) < e.def.radius ** 2;
    if (this.zombies.some(z => !z.dead && overlaps(z))) return false;
    if (this.units.some(u => !u.dead && !u.vehicle && overlaps(u))) return false;
    if (this.vehicles.some(v => !v.dead && overlaps(v))) return false;
    return true;
  }

  placeBuilding(type, tileX, tileY) {
    if (!this.canPlaceBuilding(type, tileX, tileY)) return false;
    this.spendSupplies(BUILDING_DEFS[type].cost);
    this._addBuilding(type, tileX, tileY);
    this.addActivity(`${BUILDING_DEFS[type].name} constructed`, 'success');
    return true;
  }

  sellBuilding(building) {
    if (building.dead || building.type === 'hq') return;
    this.addSupplies(Math.floor(BUILDING_DEFS[building.type].cost * 0.5));
    building.dead = true;
    building._deathHandled = true;
    this.addActivity(`${building.def.name} sold`);
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

  spendSupplies(amount) {
    if (!Number.isFinite(amount) || amount < 0 || this.supplies < amount) return false;
    this.supplies -= amount;
    this.stats.suppliesSpent += amount;
    return true;
  }

  addActivity(text, kind = 'info', key = null, cooldown = 0) {
    if (key !== null) {
      const last = this._activityLast[key];
      if (last != null && this.gameTime - last < cooldown) return false;
      this._activityLast[key] = this.gameTime;
    }
    this.activity.push({ text, kind, time: this.gameTime });
    if (this.activity.length > 40) this.activity.shift();
    return true;
  }

  addToast(text, kind = 'info', key = text, cooldown = 5) {
    const now = this.gameTime;
    if (this._toastLast[key] != null && now - this._toastLast[key] < cooldown) return false;
    this._toastLast[key] = now;
    this.toasts.push({ text, kind, t: 0, life: 4 });
    if (this.toasts.length > 5) this.toasts.shift();
    this.addActivity(text, kind);
    return true;
  }

  // ── Units ────────────────────────────────────────────────────────────────────
  spawnUnit(type, x, y) {
    const u = new Unit(type, x, y);
    this.units.push(u);
    return u;
  }

  spawnVehicle(type, x, y) {
    const v = new Vehicle(type, x, y);
    this.vehicles.push(v);
    return v;
  }

  hasBuilding(type) {
    return this.buildings.some(b => !b.dead && b.type === type);
  }

  canTrainUnit(type) {
    const def = UNIT_DEFS[type];
    return !!def && (!def.requires || this.hasBuilding(def.requires));
  }

  trainUnit(barracks, type) {
    const def = UNIT_DEFS[type];
    if (!barracks || barracks.dead || barracks.type !== 'barracks' || !def) return false;
    if (!this.canTrainUnit(type)) {
      this.addToast(`Build a ${BUILDING_DEFS[def.requires].name} to train ${def.name}s`, 'warning', `train-${type}`, 3);
      return false;
    }
    const cost = def.cost;
    if (this.supplies < cost) return false;
    this.spendSupplies(cost);
    barracks.trainQueue.push(type);
    return true;
  }

  buildVehicle(bay) {
    if (!bay || bay.dead || bay.type !== 'mechanics' || this.supplies < VEHICLE_DEFS.suv.cost) return false;
    this.spendSupplies(VEHICLE_DEFS.suv.cost);
    bay.vehicleQueue++;
    return true;
  }

  cancelProduction(building, index) {
    if (!building || building.dead || !Number.isInteger(index) || index < 0) return false;
    let def;
    if (building.type === 'barracks' && index < building.trainQueue.length) {
      def = UNIT_DEFS[building.trainQueue[index]];
      building.trainQueue.splice(index, 1);
      if (index === 0) building.trainProgress = 0;
    } else if (building.type === 'mechanics' && index < building.vehicleQueue) {
      def = VEHICLE_DEFS.suv;
      building.vehicleQueue--;
      if (index === 0) building.vehicleProgress = 0;
    } else return false;
    // Return prepaid supplies in full, even if storage has filled since queuing.
    this.supplies += def.cost;
    this.stats.suppliesSpent = Math.max(0, this.stats.suppliesSpent - def.cost);
    this.addActivity(`${def.name} canceled (+${def.cost} supplies)`);
    return true;
  }

  boardUnit(unit, vehicle) {
    if (!unit || unit.dead || unit.vehicle || !vehicle || vehicle.dead ||
        vehicle.passengers.length >= vehicle.def.capacity) return false;
    unit.stop();
    unit.vehicle = vehicle;
    unit.x = vehicle.x; unit.y = vehicle.y;
    unit.selected = false;
    this.selected = this.selected.filter(u => u !== unit);
    vehicle.passengers.push(unit);
    if (this.selected.length === 0) this.selectedVehicle = vehicle;
    return true;
  }

  disembarkVehicle(vehicle) {
    if (!vehicle) return;
    const spots = [[1,0], [0,1], [-1,0], [0,-1], [1,1], [-1,1], [-1,-1], [1,-1], [0,0]];
    const used = new Set();
    for (const u of vehicle.passengers) {
      let site = null;
      for (const [dx, dy] of spots) {
        const x = vehicle.x + dx * TILE, y = vehicle.y + dy * TILE;
        const key = `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`;
        if (!used.has(key) && this.canOccupyGround(x, y, u.def.radius)) {
          site = { x, y }; used.add(key); break;
        }
      }
      if (!site) site = this.nearestOpenGround(vehicle.x, vehicle.y, u.def.radius) || { x: vehicle.x, y: vehicle.y };
      u.vehicle = null;
      u.stop();
      u.x = site.x; u.y = site.y;
      u._settledAt = nextSettleOrder();
    }
    vehicle.passengers = [];
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  nearbyZombies(x, y, radius) {
    return this._zombieGrid ? this._zombieGrid.near(x, y, radius) : this.zombies;
  }

  nearestZombie(x, y, range, includeDormant = false) {
    const nightRule = this.isNight();
    let best = null, bestD2 = range * range;
    for (const z of this.nearbyZombies(x, y, range)) {
      if (z.dead || (!includeDormant && z.dormant)) continue;
      if (nightRule && !this.tileVisible(Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;
      const d2 = dist2(x, y, z.x, z.y);
      if (d2 < bestD2) { bestD2 = d2; best = z; }
    }
    return best;
  }

  priorityZombie(x, y, range) {
    const priority = { spitter: 1, screamer: 1, exploder: 1, boss: 2 };
    let best = null, bestScore = Infinity;
    for (const z of this.nearbyZombies(x, y, range)) {
      if (z.dead || z.dormant) continue;
      if (this.isNight() && !this.tileVisible(Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;
      const d2 = dist2(x, y, z.x, z.y);
      if (d2 > range * range) continue;
      const score = (priority[z.type] ?? 3) * range * range + d2;
      if (score < bestScore) { bestScore = score; best = z; }
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

  distanceToBuilding(x, y, building) {
    const dx = Math.max(Math.abs(x - building.x) - building.width / 2, 0);
    const dy = Math.max(Math.abs(y - building.y) - building.height / 2, 0);
    return Math.hypot(dx, dy);
  }

  nearestBuildingTo(x, y) {
    let best = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.dead) continue;
      const d = this.distanceToBuilding(x, y, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  zombieSpeed(zombie) {
    const speed = zombie.def.speed * (zombie.burning ? FIRE_SPEED_FACTOR : 1);
    if (zombie.type === 'screamer') return speed;
    for (const z of this._screamers ?? this.zombies) {
      if (z.type === 'screamer' && !z.dead && !z.dormant &&
          dist2(z.x, z.y, zombie.x, zombie.y) <= SCREAMER_AURA_RADIUS ** 2) {
        return speed * SCREAMER_SPEED_FACTOR;
      }
    }
    return speed;
  }

  wakeDormantNear(x, y, radius) {
    for (const z of this.zombies) {
      if (z.dead || !z.dormant) continue;
      if (dist2(x, y, z.x, z.y) < radius * radius) {
        z.dormant = false;
        let best = null, bestD = Infinity;
        for (const u of [...this.units, ...this.vehicles]) {
          if (u.dead || u.vehicle) continue;
          const d = dist2(u.x, u.y, z.x, z.y);
          if (d < bestD) { bestD = d; best = u; }
        }
        z.atkTarget = best;
      }
    }
  }

  spawnShriekEffect(x, y) {
    this.threatEffects.push({ x, y, radius: SCREAMER_SHRIEK_RADIUS, kind: 'shriek', t: 0, life: 0.75 });
  }

  explodeZombie(x, y, premature) {
    const radius = premature ? EXPLODER_SHOT_RADIUS : EXPLODER_BLAST_RADIUS;
    const buildingDamage = premature ? 45 : 220;
    const unitDamage = premature ? 12 : 35;
    // Anything in the central 15% takes the full hit. Beyond that, damage falls smoothly to zero
    // at the edge, so the widened shot-down blast is dangerous nearby without becoming a flat,
    // screen-wide damage tax.
    const damageAt = (maxDamage, distance) => {
      const coreRadius = radius * 0.15;
      if (distance <= coreRadius) return maxDamage;
      return maxDamage * Math.max(0, 1 - (distance - coreRadius) / (radius - coreRadius));
    };
    for (const b of this.buildings) {
      if (b.dead) continue;
      const distance = this.distanceToBuilding(x, y, b);
      if (distance < radius) this.damageEntity(b, damageAt(buildingDamage, distance));
    }
    for (const u of this.units) {
      if (u.dead || u.vehicle) continue;
      const distance = Math.max(0, dist(x, y, u.x, u.y) - u.def.radius);
      if (distance < radius) this.damageEntity(u, damageAt(unitDamage, distance));
    }
    for (const v of this.vehicles) {
      if (v.dead) continue;
      const distance = Math.max(0, dist(x, y, v.x, v.y) - v.def.radius);
      if (distance < radius) this.damageEntity(v, damageAt(buildingDamage * 0.6, distance));
    }
    this.threatEffects.push({ x, y, radius, kind: 'blast', t: 0, life: 0.55 });
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randFloat(50, 160);
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        premature ? '#f6a14a' : '#ff6437', randFloat(0.25, 0.55)));
    }
    this.addAlert(x, y, 'building');
  }

  // Throw a flare at an explored point: light + fire source
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
    this.spendSupplies(FLARE_COST);
    this.flareCooldown = FLARE_COOLDOWN;
    this.flares.push({ x: wx, y: wy, t: 0 });
    this.wakeDormantNear(wx, wy, FLARE_LIGHT_RADIUS * TILE);  // light wakes sleepers
    this.igniteZombiesNear(wx, wy, FLARE_FIRE_RADIUS * TILE);
    this.addToast('Flare thrown', 'info', 'flare-thrown', 1);
    return true;
  }

  igniteZombiesNear(x, y, radius) {
    for (const z of this.nearbyZombies(x, y, radius)) {
      if (z.dead) continue;
      if (dist2(x, y, z.x, z.y) <= radius * radius) z.ignite();
    }
  }

  spreadZombieFire() {
    const sources = this.zombies.filter(z => !z.dead && z.burning);
    for (const source of sources) {
      for (const target of this.nearbyZombies(source.x, source.y, FIRE_SPREAD_RADIUS)) {
        if (target === source || target.dead ||
            dist2(source.x, source.y, target.x, target.y) > FIRE_SPREAD_RADIUS ** 2) continue;
        target.ignite(source.burnTime * FIRE_SPREAD_FACTOR);
      }
    }
  }

  entityAt(wx, wy) {
    // Check units first
    for (const u of this.units) {
      if (u.dead || u.vehicle) continue;
      if (dist2(wx, wy, u.x, u.y) < u.def.radius * u.def.radius * 1.5) return u;
    }
    for (const v of this.vehicles) {
      if (!v.dead && dist2(wx, wy, v.x, v.y) < v.def.radius ** 2 * 2) return v;
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
      if (u.dead || u.vehicle) return false;
      const s = worldToScreen(u.x, u.y, this.camera);
      return s.x >= lx && s.x <= rx && s.y >= ly && s.y <= ry;
    });
  }

  isTileBlockedForUnits(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    if (this.tiles[ty][tx] === TILE_WATER) return true;
    for (const b of this.buildings) {
      if (b.dead) continue;
      const x = (tx + .5) * TILE, y = (ty + .5) * TILE;
      if (x >= b.x - b.width / 2 && x < b.x + b.width / 2 &&
          y >= b.y - b.height / 2 && y < b.y + b.height / 2) return true;
    }
    return false;
  }

  canOccupyGround(x, y, radius) {
    if (x - radius < 0 || y - radius < 0 || x + radius >= MAP_W * TILE || y + radius >= MAP_H * TILE) return false;
    const minX = Math.floor((x - radius) / TILE), maxX = Math.floor((x + radius) / TILE);
    const minY = Math.floor((y - radius) / TILE), maxY = Math.floor((y + radius) / TILE);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (this.tiles[ty][tx] !== TILE_WATER) continue;
        const cx = clamp(x, tx * TILE, (tx + 1) * TILE);
        const cy = clamp(y, ty * TILE, (ty + 1) * TILE);
        if (dist2(x, y, cx, cy) < radius * radius) return false;
      }
    }
    for (const b of this.buildings) {
      if (b.dead) continue;
      const cx = clamp(x, b.x - b.width / 2, b.x + b.width / 2);
      const cy = clamp(y, b.y - b.height / 2, b.y + b.height / 2);
      if (dist2(x, y, cx, cy) < radius * radius) return false;
    }
    return true;
  }

  moveGroundEntity(entity, dx, dy) {
    const startX = entity.x, startY = entity.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (this.canOccupyGround(entity.x + sx, entity.y + sy, entity.def.radius)) {
        entity.x += sx; entity.y += sy;
      } else if (this.canOccupyGround(entity.x + sx, entity.y, entity.def.radius)) {
        entity.x += sx;
      } else if (this.canOccupyGround(entity.x, entity.y + sy, entity.def.radius)) {
        entity.y += sy;
      }
    }
    return entity.x !== startX || entity.y !== startY;
  }

  nearestOpenGround(x, y, radius) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.canOccupyGround(x, y, radius)) return { x, y };
    for (let ring = 0; ring <= 8; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const px = tileCenterX(tx + dx), py = tileCenterY(ty + dy);
          if (this.canOccupyGround(px, py, radius)) return { x: px, y: py };
        }
      }
    }
    return null;
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
      if (!u.dead && !u.vehicle) this._markVision(u.x, u.y, this.visionRadius(u.type));
    }
    for (const v of this.vehicles) {
      if (!v.dead) this._markVision(v.x, v.y, this.visionRadius(v.type));
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
    if (type === 'light' || type === 'flare' || type === 'torchbearer') return base;
    return lerp(base, base * NIGHT_VISION_FACTOR, this.darkness());
  }

  // ── Waves ─────────────────────────────────────────────────────────────────────
  _prepareWaveDirections() {
    if (this.waveDirections.length > 0) return;
    const incomingWave = this.waveActive ? this.waveNum : this.waveNum + 1;
    const first = randInt(0, 3);
    this.waveDirections = [first];
    if (incomingWave >= 6) this.waveDirections.push((first + randInt(1, 3)) % 4);
    if (!this.waveActive) this.addToast(`Wave ${incomingWave} approaching from ${this.waveDirectionLabel()}`,
      'danger', `wave-warning-${incomingWave}`, 0);
  }

  waveDirectionLabel() {
    const names = ['North', 'East', 'South', 'West'];
    return this.waveDirections.map(side => names[side]).join(' + ');
  }

  _scheduleWave() {
    this._prepareWaveDirections();
    this.waveNum++;
    const template = WAVE_TABLE[Math.min(this.waveNum - 1, WAVE_TABLE.length - 1)];
    const scale = Math.min(3, 1 + Math.max(0, this.waveNum - WAVE_TABLE.length) * 0.12);

    this.zombiesToSpawn = [];
    const add = (type, n) => {
      for (let i = 0; i < Math.ceil(n * scale); i++) this.zombiesToSpawn.push(type);
    };
    add('walker', template.walkers);
    add('runner', template.runners);
    add('brute',  template.brutes);
    add('spitter', template.spitters);
    add('exploder', template.exploders);
    add('screamer', template.screamers);
    if (this.waveNum >= 10 && this.waveNum % 5 === 0) {
      for (let i = 0; i < this.waveNum / 5 - 1; i++) this.zombiesToSpawn.push('boss');
    }

    // Shuffle
    for (let i = this.zombiesToSpawn.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [this.zombiesToSpawn[i], this.zombiesToSpawn[j]] = [this.zombiesToSpawn[j], this.zombiesToSpawn[i]];
    }

    this.waveActive = true;
    this.spawnTimer = 0;
    this.waveSpawnIndex = 0;
    this.addToast(`Wave ${this.waveNum} begins`, 'danger', `wave-start-${this.waveNum}`, 0);
  }

  _spawnZombieFromEdge(type) {
    if (this.waveDirections.length === 0) this._prepareWaveDirections();
    const side = this.waveDirections[this.waveSpawnIndex++ % this.waveDirections.length];
    let x, y;
    const margin = TILE * 2;
    switch (side) {
      case 0: x = randFloat(margin, MAP_W*TILE-margin); y = margin; break;
      case 1: x = MAP_W*TILE-margin; y = randFloat(margin, MAP_H*TILE-margin); break;
      case 2: x = randFloat(margin, MAP_W*TILE-margin); y = MAP_H*TILE-margin; break;
      case 3: x = margin; y = randFloat(margin, MAP_H*TILE-margin); break;
    }
    const site = this.nearestOpenGround(x, y, ZOMBIE_DEFS[type].radius);
    if (!site) return;
    x = site.x; y = site.y;
    if (this.waveSpawnIndex <= this.waveDirections.length) {
      this.addAlert(x, y, 'wave');
    }
    this.zombies.push(new Zombie(type, x, y));
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  damageEntity(entity, amount, source) {
    const hp = entity.hp;
    entity.takeDamage(amount, source);
    if (entity.hp >= hp) return;
    if (entity.dead) {
      this.onEntityDied(entity);
    } else if (!(entity instanceof Zombie)) {
      // Bound notices both per individual and per type during a crowded fight.
      if (entity._lastAttackNotice != null && this.gameTime - entity._lastAttackNotice < 20) return;
      if (this.addActivity(`${entity.def.name} is under attack`, 'warning', `attack-${entity.type}`, 5)) {
        entity._lastAttackNotice = this.gameTime;
      }
    }
  }

  onEntityDied(entity) {
    if (!entity.dead || entity._deathHandled) return;
    entity._deathHandled = true;
    if (entity instanceof Zombie) {
      this.score += entity.def.reward * 10;
      this.stats.zombiesKilled++;
      if (!['walker', 'runner'].includes(entity.type)) {
        this.addActivity(`${entity.def.name} eliminated`, 'success', `kill-${entity.type}`, 3);
      }
    } else if (entity instanceof Unit) {
      this.stats.humansLost++;
      this.addActivity(`${entity.def.name} has fallen`, 'danger');
    } else if (entity instanceof Vehicle) {
      this.addActivity(`${entity.def.name} destroyed`, 'danger');
    } else if (entity instanceof Building) {
      this.stats.buildingsDestroyed++;
      this.addActivity(`${entity.def.name} destroyed`, 'danger');
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

  spawnMeleeEffect(x, y) {
    for (let i = 0; i < 5; i++) {
      const angle = randFloat(-Math.PI, 0);
      const speed = randFloat(35, 90);
      this.particles.push(new Particle(x, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        '#dce5df', randFloat(0.12, 0.25)));
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
      if (this.waveTimer <= WAVE_WARNING) this._prepareWaveDirections();
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
        this.waveDirections = [];
        this.waveSpawnIndex = 0;
        // Wave-clear bonus is cap-exempt: it's the anti-softlock income floor
        this.supplies += 25 + 10 * this.waveNum;
        this.addToast(`Wave ${this.waveNum} eliminated`, 'success', `wave-clear-${this.waveNum}`, 0);
      }
    }

    // Keep the index live as zombies move, so later entities see current positions.
    this._zombieGrid = new SpatialGrid(2 * TILE);
    this._screamers = [];
    for (const zombie of this.zombies) {
      if (!zombie.dead) this._zombieGrid.add(zombie);
      if (zombie.type === 'screamer') this._screamers.push(zombie);
    }

    // Update buildings
    for (const b of this.buildings) {
      b.update(dt, this);
      if (b.dead) this.onEntityDied(b);
    }

    // Update vehicles before passengers and enemies.
    for (const v of this.vehicles) v.update(dt, this);

    // Update units
    for (const u of this.units) {
      u.update(dt, this);
    }

    // Update zombies
    for (const z of this.zombies) {
      const x = z.x, y = z.y;
      z.update(dt, this);
      if (!z.dead) this._zombieGrid.move(z);
      z.recordMotion(z.x - x, z.y - y, this.gameTime);
    }

    // Update caches (auto-search + auto-load on adjacency)
    for (const c of this.caches) c.update(dt, this);

    // Bundle expiry
    // Bundles persist until recovered (no decay)
    this.bundles = this.bundles.filter(bd => bd.amount > 0);

    // Flare aging/expiry
    for (const f of this.flares) f.t += dt;
    for (const f of this.flares) this.igniteZombiesNear(f.x, f.y, FLARE_FIRE_RADIUS * TILE);
    this.flares = this.flares.filter(f => f.t < FLARE_DURATION);
    this.spreadZombieFire();

    // Update projectiles (may kill zombies or buildings)
    for (const p of this.projectiles) p.update(dt, this);

    for (const v of this.vehicles) {
      if (!v.dead) continue;
      this.onEntityDied(v);
      this.disembarkVehicle(v);
      if (this.selectedVehicle === v) this.selectedVehicle = null;
      this.addToast('Armored truck destroyed: passengers escaped', 'warning', `suv-lost-${v.id}`, 0);
    }

    for (const z of this.zombies) {
      if (z.dead && z.type === 'exploder' && !z.exploded) z.detonate(this, true);
    }
    for (const b of this.buildings) {
      if (b.dead) this.onEntityDied(b);
    }

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
    for (const effect of this.threatEffects) effect.t += dt;
    this.threatEffects = this.threatEffects.filter(effect => effect.t < effect.life);

    // Update attention toasts
    for (const toast of this.toasts) toast.t += dt;
    this.toasts = this.toasts.filter(toast => toast.t < toast.life);

    // Death-drop: dying units spill their carried supplies as a bundle
    for (const u of this.units) {
      if (u.dead) this.onEntityDied(u);
      if (u.dead && u.carrying > 0) {
        this.bundles.push({ id: nextId(), x: u.x, y: u.y, amount: u.carrying });
        u.carrying = 0;
      }
    }

    this._zombieGrid = null;
    this._screamers = null;

    // Cleanup dead entities
    this.buildings   = this.buildings.filter(b => !b.dead);
    this.units       = this.units.filter(u => !u.dead);
    this.vehicles    = this.vehicles.filter(v => !v.dead);
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
