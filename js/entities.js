'use strict';

let _nextId = 0;
function nextId() { return ++_nextId; }
function rememberId(id) { _nextId = Math.max(_nextId, id || 0); }
let _nextSettleOrder = 0;
function nextSettleOrder() { return ++_nextSettleOrder; }
function rememberSettleOrder(order) { _nextSettleOrder = Math.max(_nextSettleOrder, order || 0); }

// ─── Projectile ───────────────────────────────────────────────────────────────
class Projectile {
  constructor(sx, sy, target, damage, speed = 350, color = '#ffff88', source = 'unit') {
    this.id = nextId();
    this.x = sx; this.y = sy;
    this.target = target;    // entity reference
    this.damage = damage;
    this.speed = speed;
    this.color = color;
    this.source = source;
    this.dead = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.target?.vehicle) this.target = this.target.vehicle;
    if (this.target.dead) { this.dead = true; return; }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.sqrt(dx*dx + dy*dy);

    if (d < this.speed * dt + 4) {
      this.target.takeDamage(this.damage, this.source);
      this.dead = true;
    } else {
      this.x += (dx/d) * this.speed * dt;
      this.y += (dy/d) * this.speed * dt;
    }
  }
}

// ─── Particle ─────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, dx, dy, color, life) {
    this.x = x; this.y = y;
    this.dx = dx; this.dy = dy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.dead = false;
  }

  update(dt) {
    this.x += this.dx * dt;
    this.y += this.dy * dt;
    this.dy += 80 * dt; // gravity
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

// ─── Building ─────────────────────────────────────────────────────────────────
class Building {
  constructor(type, tileX, tileY) {
    this.id = nextId();
    this.type = type;
    this.tileX = tileX;
    this.tileY = tileY;
    const def = BUILDING_DEFS[type];
    this.hp = def.maxHp;
    this.maxHp = def.maxHp;
    this.dead = false;

    const ground = buildingGroundRect(type, tileX, tileY);
    this.x = ground.left + ground.width / 2;
    this.y = ground.top + ground.height / 2;
    this.width = ground.width;
    this.height = ground.height;

    // Combat (towers)
    this.atkCooldown = 0;
    this.atkTarget = null;

    // Training queue (barracks)
    this.trainQueue = [];
    this.trainProgress = 0;
    this.vehicleQueue = 0;
    this.vehicleProgress = 0;

    // Rally point for trained units (barracks)
    this.rally = null;
  }

  get def() { return BUILDING_DEFS[this.type]; }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  update(dt, game) {
    if (this.dead) return;

    // Tower auto-attack
    if (this.type === 'tower') {
      this.atkCooldown -= dt;
      if (!this.atkTarget || this.atkTarget.dead ||
          dist(this.x, this.y, this.atkTarget.x, this.atkTarget.y) > this.def.atkRange ||
          (game.isNight() && !game.tileVisible(Math.floor(this.atkTarget.x / TILE), Math.floor(this.atkTarget.y / TILE)))) {
        this.atkTarget = game.nearestZombie(this.x, this.y, this.def.atkRange);
      }
      if (this.atkTarget && !this.atkTarget.dead && this.atkCooldown <= 0) {
        this.atkCooldown = 1 / this.def.atkRate;
        game.projectiles.push(new Projectile(
          this.x, this.y, this.atkTarget, this.def.atkDmg, 380, '#ffdd44', 'tower'
        ));
        game.spawnMuzzleFlash(this.x, this.y);
      }
    }

    // Barracks training
    if (this.type === 'barracks' && this.trainQueue.length > 0) {
      const unitType = this.trainQueue[0];
      if (!game.canTrainUnit(unitType)) return;
      const trainTime = UNIT_DEFS[unitType].trainTime;
      this.trainProgress += dt;
      if (this.trainProgress >= trainTime) {
        const spawnX = this.x + randFloat(-TILE, TILE);
        const spawnY = this.y + this.height / 2 + TILE * 1.5;
        const site = game.nearestOpenGround(spawnX, spawnY, UNIT_DEFS[unitType].radius);
        if (!site) return;
        this.trainProgress = 0;
        this.trainQueue.shift();
        const u = game.spawnUnit(unitType, site.x, site.y);
        if (this.rally) {
          u.moveTo(this.rally.x + randFloat(-20, 20), this.rally.y + randFloat(-20, 20), game);
        }
      }
    }

    if (this.type === 'mechanics' && this.vehicleQueue > 0) {
      this.vehicleProgress += dt;
      if (this.vehicleProgress >= VEHICLE_DEFS.suv.trainTime) {
        const site = game.nearestOpenGround(this.x, this.y + this.height / 2 + TILE * 1.5,
          VEHICLE_DEFS.suv.radius);
        if (!site) return;
        this.vehicleQueue--;
        this.vehicleProgress = 0;
        game.spawnVehicle('suv', site.x, site.y);
      }
    }
  }
}

class Vehicle {
  constructor(type, x, y) {
    this.id = nextId();
    this.type = type;
    this.x = x; this.y = y;
    this.maxHp = VEHICLE_DEFS[type].maxHp;
    this.hp = this.maxHp;
    this.dead = false;
    this.passengers = [];
    this.waypoints = [];
    this.moveTarget = null;
  }

  get def() { return VEHICLE_DEFS[this.type]; }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.dead = true;
  }

  moveTo(x, y, game) {
    const site = game.nearestOpenGround(x, y, this.def.radius);
    if (!site) return false;
    const path = findPath(this.x, this.y, site.x, site.y,
      (tx, ty) => !game.canOccupyGround(tileCenterX(tx), tileCenterY(ty), this.def.radius));
    if (!path) return false;
    this.moveTarget = site;
    this.waypoints = path;
    return true;
  }

  update(dt, game) {
    if (this.dead || this.waypoints.length === 0) return;
    const wp = this.waypoints[0];
    const d = dist(this.x, this.y, wp.x, wp.y);
    if (d < 4) {
      this.waypoints.shift();
      if (this.waypoints.length === 0) this.moveTarget = null;
      return;
    }
    const step = Math.min(d, this.def.speed * dt);
    game.moveGroundEntity(this, (wp.x - this.x) / d * step, (wp.y - this.y) / d * step);
    for (const u of this.passengers) { u.x = this.x; u.y = this.y; }
  }
}

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
    const nearby = game.units.filter(u => !u.dead && !u.vehicle &&
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

    // Searched with contents: adjacent units load gradually up to capacity
    for (const u of nearby) {
      if (this.amount <= 0) break;
      if (!u.canLoadFromCache(this)) continue;
      u.loadFromCache(this, dt);
    }
    if (this.amount <= 0) this.empty = true;
  }

  // Distance-weighted roll: farther from center = richer
  _rollContents() {
    const cx = MAP_W * TILE / 2, cy = MAP_H * TILE / 2;
    const f = clamp(dist(this.x, this.y, cx, cy) / (MAP_W * TILE / 2), 0, 1);
    return randInt(Math.round(100 + 30 * f), Math.round(220 + 80 * f));
  }
}

// ─── Unit ─────────────────────────────────────────────────────────────────────
class Unit {
  constructor(type, x, y) {
    this.id = nextId();
    this.type = type;
    this.x = x; this.y = y;
    const def = UNIT_DEFS[type];
    this.hp = def.maxHp;
    this.maxHp = def.maxHp;
    this.dead = false;
    this.selected = false;

    this.waypoints = [];       // A* path waypoints
    this._settledAt = nextSettleOrder();
    this.atkTarget = null;     // attack target (zombie)
    this.atkCooldown = 0;
    this.moveTarget = null;    // {x, y} destination
    this.attackMove = false;   // pause at enemies encountered en route
    this.carrying = 0;         // scavenged supplies being hauled
    this.gatherTarget = null;  // cache assigned for auto-hauling
    this.gatherCenter = null;
    this.returnCargoTarget = null;
    this._gatherReturning = false;
    this.bundleGatherCenter = null;
    this.bundleGatherRadius = BUNDLE_GATHER_RADIUS;
    this.bundleTarget = null;
    this._bundleGatherReturning = false;
    this.resourcePopups = [];
    this._resourceLoadBuffer = 0;
    this._resourceUnloadBuffer = 0;

    // Slight random offset for formation
    this.formationOffset = { x: 0, y: 0 };

    // For builder repair
    this.repairTarget = null;
    this.repairCooldown = 0;

    // For medic healing
    this.healCooldown = 0;
    this.supportHome = null;
    this._supportReturning = false;
    this.vehicle = null;
    this.boardingVehicle = null;
    this.facing = 'S';
    this.animDistance = 0;
    this.lastMotionAt = -Infinity;
    this.attackAnimStart = -Infinity;
    this.gatherAnimTime = 0;
  }

  get def() { return UNIT_DEFS[this.type]; }

  get carryCapacity() { return CARRY_CAPACITY[this.type] ?? 0; }

  get cargoRatio() {
    const cap = this.carryCapacity;
    return cap > 0 ? clamp(this.carrying / cap, 0, 1) : 0;
  }

  get transferRate() { return RESOURCE_TRANSFER_RATE[this.type] ?? 4; }

  moveSpeedFactor() {
    return lerp(1, CARGO_FULL_SPEED_FACTOR, this.cargoRatio);
  }

  attackCooldownTime() {
    const rateFactor = lerp(1, CARGO_FULL_ATK_FACTOR, this.cargoRatio);
    return (1 / this.def.atkRate) / rateFactor;
  }

  takeDamage(amount) {
    if (this.dead || this.vehicle) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  // Command to move to world position
  moveTo(wx, wy, game) {
    this._clearGatherOrder();
    this._clearBundleGatherOrder();
    this._clearReturnCargoOrder();
    this._clearSupportOrder();
    this.moveTarget = { x: wx, y: wy };
    this.atkTarget = null;
    this.repairTarget = null;
    this.attackMove = false;
    this._setDestination(wx, wy, game);
  }

  // Command to attack a zombie
  attackTarget(zombie) {
    if (this.def.atkDmg <= 0 || this.def.atkRate <= 0) return;
    this._clearGatherOrder();
    this._clearBundleGatherOrder();
    this._clearReturnCargoOrder();
    this._clearSupportOrder();
    this.atkTarget = zombie;
    this.moveTarget = null;
    this.waypoints = [];
    this.repairTarget = null;
  }

  repairBuilding(building) {
    this._clearGatherOrder();
    this._clearBundleGatherOrder();
    this._clearReturnCargoOrder();
    if (!this.supportHome) this.supportHome = { x: this.x, y: this.y };
    this._supportReturning = false;
    this.atkTarget = null;
    this.moveTarget = null;
    this.waypoints = [];
    this.attackMove = false;
    this.repairTarget = building;
  }

  gatherFrom(cache, game) {
    if (!cache || cache.empty) return;
    this._clearSupportOrder();
    this.gatherCenter = { x: cache.x, y: cache.y };
    this.gatherTarget = cache;
    this._gatherReturning = this.carrying >= this.carryCapacity;
    this._clearBundleGatherOrder();
    this._clearReturnCargoOrder();
    this.atkTarget = null;
    this.repairTarget = null;
    this.attackMove = false;
    this._updateGatherOrder(game);
  }

  returnCargoTo(dropoff, game) {
    if (!dropoff || (dropoff.type !== 'hq' && dropoff.type !== 'depot')) return;
    this._clearGatherOrder();
    this._clearBundleGatherOrder();
    this._clearSupportOrder();
    this.atkTarget = null;
    this.repairTarget = null;
    this.attackMove = false;
    this.returnCargoTarget = dropoff;
    this._updateReturnCargoOrder(game);
  }

  stop() {
    this._clearGatherOrder();
    this._clearBundleGatherOrder();
    this._clearReturnCargoOrder();
    this._clearSupportOrder();
    this.waypoints = [];
    this.moveTarget = null;
    this.atkTarget = null;
    this.attackMove = false;
    this.repairTarget = null;
  }

  _clearGatherOrder() {
    this.gatherTarget = null;
    this.gatherCenter = null;
    this._gatherReturning = false;
  }

  _clearBundleGatherOrder() {
    this.bundleGatherCenter = null;
    this.bundleTarget = null;
    this._bundleGatherReturning = false;
  }

  _clearReturnCargoOrder() {
    this.returnCargoTarget = null;
  }

  _clearSupportOrder() {
    this.supportHome = null;
    this._supportReturning = false;
    this.boardingVehicle = null;
  }

  boardVehicle(vehicle, game) {
    if (!vehicle || vehicle.dead || this.vehicle) return false;
    const reserved = game.units.filter(u => u.boardingVehicle === vehicle && !u.dead).length;
    if (vehicle.passengers.length + reserved >= vehicle.def.capacity) return false;
    this.stop();
    this.boardingVehicle = vehicle;
    this._setDestination(vehicle.x, vehicle.y, game);
    return true;
  }

  gatherDroppedSuppliesAt(wx, wy, game) {
    if (this.carryCapacity <= 0) return;
    this._clearSupportOrder();
    this._clearGatherOrder();
    this._clearReturnCargoOrder();
    this.bundleGatherCenter = { x: wx, y: wy };
    this.bundleGatherRadius = BUNDLE_GATHER_RADIUS;
    this.bundleTarget = null;
    this._bundleGatherReturning = this.carrying >= this.carryCapacity;
    this.atkTarget = null;
    this.repairTarget = null;
    this.attackMove = false;
    this._updateBundleGatherOrder(game);
  }

  canLoadFromCache(cache) {
    if (this.vehicle || this.boardingVehicle) return false;
    if (this.returnCargoTarget) return false;
    if (this.bundleGatherCenter) return false;
    if (this.gatherCenter && (this.gatherTarget !== cache || this._gatherReturning)) return false;
    return true;
  }

  canLoadFromBundle(bundle) {
    if (this.vehicle || this.boardingVehicle) return false;
    if (this.returnCargoTarget || this.gatherCenter) return false;
    if (!this.bundleGatherCenter) return true;
    if (this._bundleGatherReturning) return false;
    if (dist2(bundle.x, bundle.y, this.bundleGatherCenter.x, this.bundleGatherCenter.y) >
        this.bundleGatherRadius * this.bundleGatherRadius) return false;
    if (this.bundleTarget && this.bundleTarget !== bundle) return false;
    return true;
  }

  loadFromCache(cache, dt) {
    return this._loadResource(dt, cache);
  }

  loadFromBundle(bundle, dt) {
    return this._loadResource(dt, bundle);
  }

  _loadResource(dt, source) {
    if (!source || source.amount <= 0) return 0;
    const room = this.carryCapacity - this.carrying;
    if (room <= 0) return 0;

    this._resourceLoadBuffer += this.transferRate * dt;
    const take = Math.min(Math.floor(this._resourceLoadBuffer), room, source.amount);
    if (take <= 0) return 0;

    this._resourceLoadBuffer -= take;
    this.carrying += take;
    source.amount -= take;
    if (source === this.gatherTarget && this.carrying >= this.carryCapacity) this._gatherReturning = true;
    if (this.bundleGatherCenter) {
      if (source === this.bundleTarget && source.amount <= 0) this.bundleTarget = null;
      if (this.carrying >= this.carryCapacity) this._bundleGatherReturning = true;
    }
    this._addResourcePopup(take);
    return take;
  }

  _unloadResource(dt, game) {
    if (this.carrying <= 0) return 0;
    const room = game.supplyRoom();
    if (room <= 0) {
      game.addToast('Storage full: build a Supply Depot before carriers can unload', 'warning', 'storage-full', 6);
      return 0;
    }

    this._resourceUnloadBuffer += this.transferRate * dt;
    const drop = Math.min(Math.floor(this._resourceUnloadBuffer), this.carrying, room);
    if (drop <= 0) return 0;

    this._resourceUnloadBuffer -= drop;
    this.carrying -= drop;
    game.addSupplies(drop);
    this._addResourcePopup(-drop);
    return drop;
  }

  _addResourcePopup(amount) {
    this.resourcePopups.push({ amount, t: 0, life: 0.8 });
  }

  _setDestination(wx, wy, game) {
    this.moveTarget = { x: wx, y: wy };
    const path = findPath(this.x, this.y, wx, wy, (tx, ty) => game.isTileBlockedForUnits(tx, ty));
    this.waypoints = path || [];
  }

  _setGatherDestination(wx, wy, game) {
    if (this.moveTarget && dist2(this.moveTarget.x, this.moveTarget.y, wx, wy) < (TILE * 0.5) ** 2) return;
    this._setDestination(wx, wy, game);
  }

  _updateGatherOrder(game) {
    const cap = this.carryCapacity;
    if (!this.gatherCenter || cap <= 0) {
      this._clearGatherOrder();
      return;
    }

    if (this._gatherReturning) {
      if (this.carrying > 0) {
        if (this._nearDropoff(game)) {
          this.waypoints = [];
          this.moveTarget = null;
        } else {
          this._moveToDropoff(game);
        }
        return;
      }
      this._gatherReturning = false;
    }

    if (this.carrying >= cap) {
      this._gatherReturning = true;
      this._moveToDropoff(game);
      return;
    }

    if (!this.gatherTarget || this.gatherTarget.empty) {
      this.gatherTarget = this._nearestCacheInGatherArea(game);
    }
    const cache = this.gatherTarget;
    if (!cache) {
      if (this.carrying > 0) {
        this._gatherReturning = true;
        this._moveToDropoff(game);
      } else {
        this._clearGatherOrder();
      }
      return;
    }

    if (dist2(this.x, this.y, cache.x, cache.y) <= (SEARCH_RADIUS * TILE * 0.8) ** 2) {
      this.waypoints = [];
      this.moveTarget = null;
    } else {
      this._setGatherDestination(cache.x, cache.y, game);
    }
  }

  _nearestCacheInGatherArea(game) {
    let best = null, bestD2 = Infinity;
    for (const cache of game.caches) {
      if (cache.empty || dist2(cache.x, cache.y, this.gatherCenter.x, this.gatherCenter.y) >
          CACHE_GATHER_RADIUS * CACHE_GATHER_RADIUS) continue;
      const d2 = dist2(this.x, this.y, cache.x, cache.y);
      if (d2 < bestD2) { bestD2 = d2; best = cache; }
    }
    return best;
  }

  _nearestBundleInGatherArea(game) {
    if (!this.bundleGatherCenter) return null;
    let best = null, bestD2 = Infinity;
    const r2 = this.bundleGatherRadius * this.bundleGatherRadius;
    for (const bd of game.bundles) {
      if (bd.amount <= 0) continue;
      if (dist2(bd.x, bd.y, this.bundleGatherCenter.x, this.bundleGatherCenter.y) > r2) continue;
      const d2 = dist2(this.x, this.y, bd.x, bd.y);
      if (d2 < bestD2) { bestD2 = d2; best = bd; }
    }
    return best;
  }

  _hasBundleSources(game) {
    return !!this._nearestBundleInGatherArea(game);
  }

  _updateBundleGatherOrder(game) {
    const cap = this.carryCapacity;
    if (!this.bundleGatherCenter || cap <= 0) {
      this._clearBundleGatherOrder();
      return;
    }

    if (this.bundleTarget && this.bundleTarget.amount <= 0) this.bundleTarget = null;

    if (this._bundleGatherReturning) {
      if (this.carrying > 0) {
        if (this._nearDropoff(game)) {
          this.waypoints = [];
          this.moveTarget = null;
        } else {
          this._moveToDropoff(game);
        }
        return;
      }
      this._bundleGatherReturning = false;
      if (!this._hasBundleSources(game)) {
        this._clearBundleGatherOrder();
        return;
      }
    }

    if (this.carrying >= cap) {
      this._bundleGatherReturning = true;
      this._moveToDropoff(game);
      return;
    }

    const target = this.bundleTarget || this._nearestBundleInGatherArea(game);
    this.bundleTarget = target;
    if (!target) {
      if (this.carrying > 0) {
        this._bundleGatherReturning = true;
        this._moveToDropoff(game);
      } else {
        this._clearBundleGatherOrder();
      }
      return;
    }

    if (dist2(this.x, this.y, target.x, target.y) <= (SEARCH_RADIUS * TILE * 0.8) ** 2) {
      this.waypoints = [];
      this.moveTarget = null;
    } else {
      this._setGatherDestination(target.x, target.y, game);
    }
  }

  _moveToDropoff(game) {
    const drop = game.nearestDropoff(this.x, this.y);
    if (!drop) return;
    if (dist2(this.x, this.y, drop.x, drop.y) <= (DROP_RADIUS * TILE * 0.8) ** 2) {
      this.waypoints = [];
      this.moveTarget = null;
      return;
    }
    const p = this._dropoffPoint(drop, game);
    this._setGatherDestination(p.x, p.y, game);
  }

  _updateReturnCargoOrder(game) {
    if (this.carrying <= 0) {
      this._clearReturnCargoOrder();
      return false;
    }

    const target = this._resolveReturnCargoTarget(game);
    if (!target) return false;

    if (dist2(this.x, this.y, target.x, target.y) <= (DROP_RADIUS * TILE * 0.8) ** 2) {
      this.waypoints = [];
      this.moveTarget = null;
      return true;
    }

    const p = this._dropoffPoint(target, game);
    this._setGatherDestination(p.x, p.y, game);
    return true;
  }

  _resolveReturnCargoTarget(game) {
    const live = b => b && !b.dead && (b.type === 'hq' || b.type === 'depot');
    if (!live(this.returnCargoTarget)) this.returnCargoTarget = game.nearestDropoff(this.x, this.y);
    return live(this.returnCargoTarget) ? this.returnCargoTarget : null;
  }

  _nearDropoff(game) {
    for (const b of game.buildings) {
      if (b.dead || (b.type !== 'hq' && b.type !== 'depot')) continue;
      if (dist2(this.x, this.y, b.x, b.y) < (DROP_RADIUS * TILE) ** 2) return true;
    }
    return false;
  }

  _dropoffPoint(drop, game) {
    const ts = drop.def.tileSize;
    let best = null, bestD2 = Infinity;
    for (let ty = drop.tileY - 1; ty <= drop.tileY + ts; ty++) {
      for (let tx = drop.tileX - 1; tx <= drop.tileX + ts; tx++) {
        if (game.isTileBlockedForUnits(tx, ty)) continue;
        const x = tileCenterX(tx), y = tileCenterY(ty);
        const d2 = dist2(this.x, this.y, x, y);
        if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
      }
    }
    return best || { x: drop.x, y: drop.y };
  }

  update(dt, game) {
    if (this.dead) return;
    this.gatherAnimTime += dt;
    if (this.vehicle) {
      this.atkCooldown -= dt;
      if (!this.vehicle.dead && this.type !== 'heavy') this._autoAttack(game);
      return;
    }

    if (this.boardingVehicle) {
      if (this.boardingVehicle.dead) this.boardingVehicle = null;
      else if (dist2(this.x, this.y, this.boardingVehicle.x, this.boardingVehicle.y) <= (TILE * 1.1) ** 2) {
        if (!game.boardUnit(this, this.boardingVehicle)) this.boardingVehicle = null;
        return;
      } else {
        this._setGatherDestination(this.boardingVehicle.x, this.boardingVehicle.y, game);
      }
    }

    for (const p of this.resourcePopups) p.t += dt;
    this.resourcePopups = this.resourcePopups.filter(p => p.t < p.life);

    this.atkCooldown -= dt;
    this.healCooldown -= dt;

    // Bank carried supplies at any drop point — only as much as storage allows;
    // the unit keeps the remainder until a depot has room
    const gatherReadyToBank = (!this.gatherCenter || this._gatherReturning || !this._nearestCacheInGatherArea(game)) &&
      (!this.bundleGatherCenter || this._bundleGatherReturning || !this._hasBundleSources(game));
    if (this.carrying > 0 && gatherReadyToBank) {
      for (const b of game.buildings) {
        if (b.dead || (b.type !== 'hq' && b.type !== 'depot')) continue;
        if (dist2(this.x, this.y, b.x, b.y) < (DROP_RADIUS * TILE) ** 2) {
          this._unloadResource(dt, game);
          break;
        }
      }
    }

    // Pick up dropped bundles on contact
    for (const bd of game.bundles) {
      if (bd.amount <= 0) continue;
      if (dist2(this.x, this.y, bd.x, bd.y) < (SEARCH_RADIUS * TILE) ** 2) {
        if (!this.canLoadFromBundle(bd)) continue;
        this.loadFromBundle(bd, dt);
      }
    }

    if (this.gatherCenter) this._updateGatherOrder(game);
    if (!this.gatherCenter && this.bundleGatherCenter) this._updateBundleGatherOrder(game);
    if (!this.gatherCenter && !this.bundleGatherCenter && this.returnCargoTarget) this._updateReturnCargoOrder(game);
    if (!this.gatherCenter && !this.bundleGatherCenter && !this.returnCargoTarget && !this.boardingVehicle && this.carrying > 0 &&
        this.waypoints.length === 0 && !this.atkTarget && !this.repairTarget) {
      const drop = game.nearestDropoff(this.x, this.y);
      if (drop) this.returnCargoTo(drop, game);
    }

    // If attack target is dead, clear it
    if (this.atkTarget && this.atkTarget.dead) {
      this.atkTarget = null;
    }

    // Attack target logic
    if (this.atkTarget) {
      const d = dist(this.x, this.y, this.atkTarget.x, this.atkTarget.y);
      if (d > this.def.atkRange) {
        // Chase
        this._moveToward(this.atkTarget.x, this.atkTarget.y, dt, game);
      } else {
        // In range - attack
        if (this.atkCooldown <= 0) {
          this._attackZombie(this.atkTarget, game);
        }
      }
      return;
    }

    if (this._supportReturning) this._updateSupportReturn(dt, game);

    if (!this._supportReturning && this.type === 'builder') {
      if (this.repairTarget && !this.repairTarget.dead && this.repairTarget.hp < this.repairTarget.maxHp) {
        if (!this.supportHome) this.supportHome = { x: this.x, y: this.y };
        this._repairBuilding(dt, game, this.repairTarget);
        return;
      }
      this.repairTarget = null;
      if (!this.gatherCenter && !this.bundleGatherCenter && !this.returnCargoTarget &&
          this.carrying === 0 && this.waypoints.length === 0 &&
          this._updateBuilderAutoRepair(dt, game)) return;
      if (this.supportHome) this._startSupportReturn(game);
    }

    if (!this._supportReturning && this.type === 'medic' && !this.gatherCenter &&
        !this.bundleGatherCenter && !this.returnCargoTarget &&
        (this.waypoints.length === 0 || this.supportHome)) {
      const healing = this._updateMedic(dt, game);
      if (healing === true) return;
      if (healing === null && this.supportHome) this._startSupportReturn(game);
    }

    // Follow waypoints (attack-move pauses while an enemy is in range)
    if (this.waypoints.length > 0) {
      if (this.attackMove && game.nearestZombie(this.x, this.y, this.def.atkRange)) {
        // hold position; the auto-attack block below does the shooting
      } else {
        const wp = this.waypoints[0];
        const d = dist(this.x, this.y, wp.x, wp.y);
        if (d < 4) {
          this.waypoints.shift();
          if (this.waypoints.length === 0) this._settledAt = nextSettleOrder();
        } else {
          this._moveToward(wp.x, wp.y, dt, game);
        }
      }
    } else {
      this.attackMove = false;
      if (!this.gatherCenter && !this.bundleGatherCenter && !this.returnCargoTarget &&
          !this.repairTarget && !this.atkTarget && !this._supportReturning) this._settleApart(game);
    }

    this._autoAttack(game);
  }

  _autoAttack(game) {
    if (this.def.atkDmg > 0 && this.def.atkRate > 0 && this.atkCooldown <= 0) {
      const z = this.type === 'sniper'
        ? game.priorityZombie(this.x, this.y, this.def.atkRange)
        : game.nearestZombie(this.x, this.y, this.def.atkRange);
      if (z) {
        this._attackZombie(z, game);
      }
    }
  }

  _attackZombie(target, game) {
    this.atkCooldown = this.attackCooldownTime();
    this.attackAnimStart = game.gameTime;
    this._faceMotion(target.x - this.x, target.y - this.y);
    if (this.type === 'heavy') {
      const vx = target.x - this.x, vy = target.y - this.y;
      for (const z of game.nearbyZombies(this.x, this.y, HEAVY_SWING_RADIUS)) {
        if (z.dead || z.dormant || dist2(this.x, this.y, z.x, z.y) > HEAVY_SWING_RADIUS ** 2) continue;
        if ((z.x - this.x) * vx + (z.y - this.y) * vy < 0) continue;
        z.takeDamage(this.def.atkDmg);
      }
      game.spawnMeleeEffect(this.x, this.y);
    } else if (this.type === 'torchbearer') {
      target.takeDamage(this.def.atkDmg);
      if (!target.dead) target.ignite();
      game.spawnFireEffect(target.x, target.y);
    } else {
      game.projectiles.push(new Projectile(
        this.x, this.y, target, this.def.atkDmg, 320, this.type === 'sniper' ? '#c7e9ff' : '#88ffff'
      ));
      game.spawnMuzzleFlash(this.x, this.y);
    }
  }

  _updateMedic(dt, game) {
    let target = null, bestD2 = MEDIC_HEAL_RADIUS * MEDIC_HEAL_RADIUS;
    for (const u of game.units) {
      if (u === this || u.dead || u.vehicle || u.hp >= u.maxHp) continue;
      const d2 = dist2(this.x, this.y, u.x, u.y);
      if (d2 < bestD2) { bestD2 = d2; target = u; }
    }
    if (!target) return null;

    if (!this.supportHome) this.supportHome = { x: this.x, y: this.y };

    const d = Math.sqrt(bestD2);
    if (d > TILE * 0.9) {
      this._setDestination(target.x, target.y, game);
      return false;
    }

    this.waypoints = [];
    this.moveTarget = null;
    if (this.healCooldown <= 0) {
      this.healCooldown = MEDIC_HEAL_INTERVAL;
      target.hp = Math.min(target.maxHp, target.hp + MEDIC_HEAL_AMOUNT);
      game.spawnHealEffect(target.x, target.y);
    }
    return true;
  }

  _updateBuilderAutoRepair(dt, game) {
    let target = null, bestD2 = BUILDER_REPAIR_RADIUS * BUILDER_REPAIR_RADIUS;
    for (const b of game.buildings) {
      if (b.dead || b.hp >= b.maxHp) continue;
      const d2 = dist2(this.x, this.y, b.x, b.y);
      if (d2 < bestD2) { bestD2 = d2; target = b; }
    }
    if (!target) return false;

    if (!this.supportHome) this.supportHome = { x: this.x, y: this.y };
    this.repairTarget = target;
    this._repairBuilding(dt, game, target);
    return true;
  }

  _startSupportReturn(game) {
    this._supportReturning = true;
    this.repairTarget = null;
    this.waypoints = [];
    this.moveTarget = null;
    this._updateSupportReturn(0, game);
  }

  _supportReturnPoint(game) {
    const home = this.supportHome;
    const tx = Math.floor(home.x / TILE), ty = Math.floor(home.y / TILE);
    if (!game.isTileBlockedForUnits(tx, ty)) return home;

    let best = null, bestD2 = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (game.isTileBlockedForUnits(tx + dx, ty + dy)) continue;
        const x = tileCenterX(tx + dx), y = tileCenterY(ty + dy);
        const d2 = dist2(x, y, home.x, home.y);
        if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
      }
    }
    return best;
  }

  _updateSupportReturn(dt, game) {
    const home = this.supportHome;
    if (!home) {
      this._supportReturning = false;
      return;
    }
    const target = this._supportReturnPoint(game);
    if (!target) return;
    if (dist2(this.x, this.y, target.x, target.y) < 8 ** 2) {
      this._clearSupportOrder();
      this.waypoints = [];
      this.moveTarget = null;
    } else if (this.waypoints.length === 0) {
      if (Math.floor(this.x / TILE) === Math.floor(target.x / TILE) &&
          Math.floor(this.y / TILE) === Math.floor(target.y / TILE)) {
        this._moveToward(target.x, target.y, dt, game);
      } else {
        this._setDestination(target.x, target.y, game);
      }
    }
  }

  _repairBuilding(dt, game, building) {
    const d = dist(this.x, this.y, building.x, building.y);
    if (d > TILE * 2) {
      this._moveToward(building.x, building.y, dt, game);
      return;
    }

    this.waypoints = [];
    this.moveTarget = null;
    this.repairCooldown -= dt;
    if (this.repairCooldown <= 0 && game.supplies >= REPAIR_TICK_COST) {
      this.repairCooldown = REPAIR_TICK_INTERVAL;
      game.supplies -= REPAIR_TICK_COST;
      building.hp = Math.min(building.maxHp, building.hp + REPAIR_TICK_AMOUNT);
    }
  }

  _moveToward(tx, ty, dt, game) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < 1) return;
    let nx = dx/d, ny = dy/d;

    // Simple separation from other units
    for (const u of game.units) {
      if (u === this || u.dead || u.vehicle) continue;
      const sdx = this.x - u.x, sdy = this.y - u.y;
      const sd = Math.sqrt(sdx*sdx + sdy*sdy);
      if (sd < 22 && sd > 0) {
        nx += (sdx/sd) * (22-sd)/22 * 0.8;
        ny += (sdy/sd) * (22-sd)/22 * 0.8;
      }
    }

    const len = Math.sqrt(nx*nx + ny*ny);
    if (len > 0) { nx /= len; ny /= len; }

    const speed = this.def.speed * this.moveSpeedFactor();
    const step = Math.min(speed * dt, d);
    const newX = this.x + nx * step;
    const newY = this.y + ny * step;

    // Clamp to map
    const oldX = this.x, oldY = this.y;
    this.x = clamp(newX, this.def.radius, MAP_W * TILE - this.def.radius);
    this.y = clamp(newY, this.def.radius, MAP_H * TILE - this.def.radius);
    const traveled = Math.hypot(this.x - oldX, this.y - oldY);
    if (traveled > 0.05) {
      this.animDistance += traveled;
      this.lastMotionAt = game.gameTime;
      this._faceMotion(this.x - oldX, this.y - oldY);
    }
  }

  _faceMotion(dx, dy) {
    if (Math.hypot(dx, dy) < 0.05) return;
    const angle = Math.atan2((dx + dy) * 0.5, dx - dy);
    const headings = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    this.facing = headings[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
  }

  _settleApart(game) {
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (!game.units.some(u => u !== this && !u.dead && !u.vehicle && u.waypoints.length === 0 &&
        Math.floor(u.x / TILE) === tx && Math.floor(u.y / TILE) === ty &&
        (u._settledAt < this._settledAt || (u._settledAt === this._settledAt && u.id < this.id)))) return;

    const offsets = [[1, 0], [0, 1], [-1, 0], [0, -1],
      [1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (const [dx, dy] of offsets) {
      const nx = tx + dx, ny = ty + dy;
      if (game.isTileBlockedForUnits(nx, ny)) continue;
      if (game.units.some(u => u !== this && !u.dead && !u.vehicle &&
          ((Math.floor(u.x / TILE) === nx && Math.floor(u.y / TILE) === ny) ||
           (u.moveTarget && Math.floor(u.moveTarget.x / TILE) === nx &&
            Math.floor(u.moveTarget.y / TILE) === ny && u.waypoints.length > 0)))) continue;
      const x = tileCenterX(nx), y = tileCenterY(ny);
      const path = findPath(this.x, this.y, x, y, (px, py) => game.isTileBlockedForUnits(px, py));
      if (!path || path.length === 0) continue;
      this.moveTarget = { x, y };
      this.waypoints = path;
      return;
    }
  }
}

// ─── Zombie ───────────────────────────────────────────────────────────────────
class Zombie {
  constructor(type, x, y) {
    this.id = nextId();
    this.type = type;
    this.x = x; this.y = y;
    const def = ZOMBIE_DEFS[type];
    this.hp = def.maxHp;
    this.maxHp = def.maxHp;
    this.dead = false;
    this.atkTarget = null;
    this.atkCooldown = 0;
    this.dormant = false;
    this.burnTime = 0;
    this.burnMax = 0;
    this._burnParticleTimer = 0;
    this.shriekCooldown = 0;
    this.exploded = false;
    this.facing = 'S';
    this.animDistance = 0;
    this.lastMotionAt = -Infinity;
    this.attackAnimStart = -Infinity;
  }

  get def() { return ZOMBIE_DEFS[this.type]; }

  get burning() { return this.burnTime > 0; }

  recordMotion(dx, dy, time) {
    const traveled = Math.hypot(dx, dy);
    if (traveled < 0.05) return;
    this.animDistance += traveled;
    this.lastMotionAt = time;
    const angle = Math.atan2((dx + dy) * 0.5, dx - dy);
    const headings = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    this.facing = headings[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
  }

  ignite(duration = FIRE_DURATION) {
    this.dormant = false;
    this.burnTime = Math.max(this.burnTime, duration);
    this.burnMax = Math.max(this.burnMax, duration);
  }

  takeDamage(amount, source = 'unit') {
    if (this.dead) return;
    this.dormant = false;
    if (this.type === 'boss' && source === 'tower') amount *= 0.75;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.burning) {
      this._updateBurn(dt, game);
      if (this.dead) return;
    }

    if (this.dormant) {
      // Sleeps until something comes close (gunfire wake is handled by the game)
      let wakeTarget = null;
      for (const u of [...game.units, ...game.vehicles]) {
        if (u.dead || u.vehicle) continue;
        if (dist2(this.x, this.y, u.x, u.y) < GUARD_WAKE_RADIUS * GUARD_WAKE_RADIUS) {
          wakeTarget = u;
          this.dormant = false;
          break;
        }
      }
      if (wakeTarget) this.atkTarget = wakeTarget;
      if (this.dormant) return;
    }

    if (this.type === 'screamer') {
      this.shriekCooldown = Math.max(0, this.shriekCooldown - dt);
      const humanNearby = game.units.some(u => !u.dead &&
        !u.vehicle &&
        dist2(this.x, this.y, u.x, u.y) <= SCREAMER_TRIGGER_RADIUS ** 2);
      if (humanNearby && this.shriekCooldown <= 0) {
        this.shriekCooldown = SCREAMER_SHRIEK_INTERVAL;
        this.attackAnimStart = game.gameTime;
        game.wakeDormantNear(this.x, this.y, SCREAMER_SHRIEK_RADIUS);
        game.spawnShriekEffect(this.x, this.y);
      }
    }

    if (this.type === 'exploder') {
      if (this.atkTarget?.vehicle) this.atkTarget = this.atkTarget.vehicle;
      if (this.atkTarget?.dead) this.atkTarget = null;

      let target = this.atkTarget;
      if (!target) {
        let nearestUnit = null, nearestUnitDistance = GUARD_WAKE_RADIUS;
        for (const candidate of [...game.units, ...game.vehicles]) {
          if (candidate.dead || candidate.vehicle) continue;
          const distance = dist(this.x, this.y, candidate.x, candidate.y);
          if (distance < nearestUnitDistance) {
            nearestUnit = candidate;
            nearestUnitDistance = distance;
          }
        }
        target = nearestUnit || game.nearestBuildingTo(this.x, this.y);
        this.atkTarget = target;
      }
      if (target) {
        const targetDistance = target instanceof Building
          ? game.distanceToBuilding(this.x, this.y, target)
          : Math.max(0, dist(this.x, this.y, target.x, target.y) - target.def.radius);
        if (targetDistance <= this.def.atkRange) {
          this.detonate(game, false);
        } else {
          this._directMoveToward(target.x, target.y, dt, game);
        }
      }
      return;
    }

    this.atkCooldown -= dt;

    // Clear dead attack target
    if (this.atkTarget?.vehicle) this.atkTarget = this.atkTarget.vehicle;
    if (this.atkTarget && this.atkTarget.dead) this.atkTarget = null;

    // Find something to attack (prefer units over buildings)
    if (!this.atkTarget) {
      // Check for nearby units first
      let bestU = null, bestUD = Infinity;
      for (const u of [...game.units, ...game.vehicles]) {
        if (u.dead || u.vehicle) continue;
        const d = dist(this.x, this.y, u.x, u.y);
        if (d < Math.max(GUARD_WAKE_RADIUS, this.def.atkRange) && d < bestUD) { bestUD = d; bestU = u; }
      }
      this.atkTarget = bestU;

      // Otherwise attack building in range
      if (!this.atkTarget) {
        let bestB = null, bestBD = Infinity;
        for (const b of game.buildings) {
          if (b.dead) continue;
          const d = game.distanceToBuilding(this.x, this.y, b);
          if (d < this.def.atkRange && d < bestBD) { bestBD = d; bestB = b; }
        }
        this.atkTarget = bestB;
      }
    }

    if (this.atkTarget && !this.atkTarget.dead) {
      const targetX = this.atkTarget.x, targetY = this.atkTarget.y;
      const d = this.atkTarget instanceof Building
        ? game.distanceToBuilding(this.x, this.y, this.atkTarget)
        : dist(this.x, this.y, targetX, targetY);

      if (d > this.def.atkRange) {
        if (this.atkTarget instanceof Unit || this.atkTarget instanceof Vehicle) this._directMoveToward(targetX, targetY, dt, game);
        else this._flowMove(dt, game);
      } else {
        // Attack
        if (this.atkCooldown <= 0) {
          this.atkCooldown = 1 / this.def.atkRate;
          this.attackAnimStart = game.gameTime;
          if (this.type === 'spitter') {
            game.projectiles.push(new Projectile(
              this.x, this.y, this.atkTarget, this.def.atkDmg, 180, '#a6e54a', 'acid'
            ));
          } else {
            this.atkTarget.takeDamage(this.def.atkDmg);
          }
          game.addAlert(this.atkTarget.x, this.atkTarget.y,
                        this.atkTarget instanceof Building ? 'building' : 'unit');
          if (this.atkTarget.dead) {
            game.onEntityDied(this.atkTarget);
          }
        }
      }
    } else {
      this.atkTarget = null;
      this._flowMove(dt, game);
    }
  }

  detonate(game, premature) {
    if (this.exploded) return;
    this.exploded = true;
    this.dead = true;
    this.hp = 0;
    game.explodeZombie(this.x, this.y, premature);
  }

  _updateBurn(dt, game) {
    this.burnTime = Math.max(0, this.burnTime - dt);
    this.takeDamage(FIRE_DPS * dt);
    this._burnParticleTimer -= dt;
    if (this._burnParticleTimer <= 0) {
      this._burnParticleTimer = 0.08;
      game.spawnFireEffect(
        this.x + randFloat(-this.def.radius, this.def.radius),
        this.y + randFloat(-this.def.radius, this.def.radius)
      );
    }
  }

  _directMoveToward(tx, ty, dt, game) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < 1) return;
    let nx = dx / d, ny = dy / d;

    // Separation from other zombies while chasing a specific unit
    for (const z of game.nearbyZombies(this.x, this.y, this.def.radius + (game._zombieGrid?.maxRadius ?? 22))) {
      if (z === this || z.dead) continue;
      const sdx = this.x - z.x, sdy = this.y - z.y;
      const sd = Math.sqrt(sdx*sdx + sdy*sdy);
      const minD = this.def.radius + z.def.radius;
      if (sd < minD && sd > 0) {
        nx += (sdx/sd) * 0.6;
        ny += (sdy/sd) * 0.6;
      }
    }

    const len = Math.sqrt(nx*nx + ny*ny);
    if (len > 0) { nx /= len; ny /= len; }

    const step = game.zombieSpeed(this) * dt;
    if (!game.moveGroundEntity(this, nx * step, ny * step)) this._flowMove(dt, game);
  }

  _flowMove(dt, game) {
    const tx = Math.floor(this.x / TILE);
    const ty = Math.floor(this.y / TILE);

    let nx = 0, ny = 0;

    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && game.flowField[ty] && game.flowField[ty][tx]) {
      const f = game.flowField[ty][tx];
      if (f.dx || f.dy) {
        const toward = normalize(tileCenterX(tx + f.dx) - this.x,
          tileCenterY(ty + f.dy) - this.y);
        nx = toward.dx; ny = toward.dy;
      }
    }
    if (nx === 0 && ny === 0) {
      const nearestB = game.nearestBuildingTo(this.x, this.y);
      if (nearestB) {
        const ddx = nearestB.x - this.x, ddy = nearestB.y - this.y;
        const d = Math.hypot(ddx, ddy);
        nx = d > 0 ? ddx / d : 0;
        ny = d > 0 ? ddy / d : 0;
      }
    }

    if (nx === 0 && ny === 0) return;

    // Separation from other zombies
    for (const z of game.nearbyZombies(this.x, this.y, this.def.radius + (game._zombieGrid?.maxRadius ?? 22))) {
      if (z === this || z.dead) continue;
      const sdx = this.x - z.x, sdy = this.y - z.y;
      const sd = Math.sqrt(sdx*sdx + sdy*sdy);
      const minD = this.def.radius + z.def.radius;
      if (sd < minD && sd > 0) {
        nx += (sdx/sd) * 0.6;
        ny += (sdy/sd) * 0.6;
      }
    }

    const len = Math.sqrt(nx*nx + ny*ny);
    if (len > 0) { nx /= len; ny /= len; }

    const step = game.zombieSpeed(this) * dt;
    game.moveGroundEntity(this, nx * step, ny * step);
  }
}
