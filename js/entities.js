'use strict';

let _nextId = 0;
function nextId() { return ++_nextId; }

// ─── Projectile ───────────────────────────────────────────────────────────────
class Projectile {
  constructor(sx, sy, target, damage, speed = 350, color = '#ffff88') {
    this.id = nextId();
    this.x = sx; this.y = sy;
    this.target = target;    // entity reference
    this.damage = damage;
    this.speed = speed;
    this.color = color;
    this.dead = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.target.dead) { this.dead = true; return; }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.sqrt(dx*dx + dy*dy);

    if (d < this.speed * dt + 4) {
      this.target.takeDamage(this.damage);
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

    const ts = def.tileSize;
    this.x = tileX * TILE + ts * TILE / 2;
    this.y = tileY * TILE + ts * TILE / 2;
    this.width = ts * TILE;
    this.height = ts * TILE;

    // Combat (towers)
    this.atkCooldown = 0;
    this.atkTarget = null;

    // Training queue (barracks)
    this.trainQueue = [];
    this.trainProgress = 0;

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
          dist(this.x, this.y, this.atkTarget.x, this.atkTarget.y) > this.def.atkRange) {
        this.atkTarget = game.nearestZombie(this.x, this.y, this.def.atkRange);
      }
      if (this.atkTarget && !this.atkTarget.dead && this.atkCooldown <= 0) {
        this.atkCooldown = 1 / this.def.atkRate;
        game.projectiles.push(new Projectile(
          this.x, this.y, this.atkTarget, this.def.atkDmg, 380, '#ffdd44'
        ));
        game.spawnMuzzleFlash(this.x, this.y);
      }
    }

    // Barracks training
    if (this.type === 'barracks' && this.trainQueue.length > 0) {
      const unitType = this.trainQueue[0];
      const trainTime = UNIT_DEFS[unitType].trainTime;
      this.trainProgress += dt;
      if (this.trainProgress >= trainTime) {
        this.trainProgress = 0;
        this.trainQueue.shift();
        // Spawn near barracks
        const spawnX = this.x + randFloat(-TILE, TILE);
        const spawnY = this.y + this.height / 2 + TILE * 1.5;
        const u = game.spawnUnit(unitType, spawnX, spawnY);
        if (this.rally) {
          u.moveTo(this.rally.x + randFloat(-20, 20), this.rally.y + randFloat(-20, 20), game);
        }
      }
    }
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
    const nearby = game.units.filter(u => !u.dead &&
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

    // Searched with contents: adjacent units auto-load up to capacity
    for (const u of nearby) {
      if (this.amount <= 0) break;
      const cap = CARRY_CAPACITY[u.type] - u.carrying;
      if (cap <= 0) continue;
      const take = Math.min(cap, this.amount);
      u.carrying += take;
      this.amount -= take;
    }
    if (this.amount <= 0) this.empty = true;
  }

  // Distance-weighted roll: farther from center = richer
  _rollContents() {
    const cx = MAP_W * TILE / 2, cy = MAP_H * TILE / 2;
    const f = clamp(dist(this.x, this.y, cx, cy) / (MAP_W * TILE / 2), 0, 1);
    const weights = [
      [30 - 10 * f, () => 0],
      [45 - 20 * f, () => randInt(30, 60)],
      [20 + 15 * f, () => randInt(80, 150)],
      [5 + 15 * f,  () => randInt(200, 280)],
    ];
    const total = weights.reduce((s, [w]) => s + w, 0);
    let r = randFloat(0, total);
    for (const [w, roll] of weights) { if ((r -= w) <= 0) return roll(); }
    return 0;
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
    this.atkTarget = null;     // attack target (zombie)
    this.atkCooldown = 0;
    this.moveTarget = null;    // {x, y} destination
    this.attackMove = false;   // pause at enemies encountered en route
    this.carrying = 0;         // scavenged supplies being hauled

    // Slight random offset for formation
    this.formationOffset = { x: 0, y: 0 };

    // For builder repair
    this.repairTarget = null;
    this.repairCooldown = 0;
  }

  get def() { return UNIT_DEFS[this.type]; }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  // Command to move to world position
  moveTo(wx, wy, game) {
    this.moveTarget = { x: wx, y: wy };
    this.atkTarget = null;
    this.repairTarget = null;
    this.attackMove = false;
    // Compute A* path
    const path = findPath(this.x, this.y, wx, wy, (tx, ty) => game.isTileBlockedForUnits(tx, ty));
    this.waypoints = path || [];
  }

  // Command to attack a zombie
  attackTarget(zombie) {
    this.atkTarget = zombie;
    this.moveTarget = null;
    this.waypoints = [];
    this.repairTarget = null;
  }

  update(dt, game) {
    if (this.dead) return;

    this.atkCooldown -= dt;

    // Bank carried supplies at any drop point
    if (this.carrying > 0) {
      for (const b of game.buildings) {
        if (b.dead || (b.type !== 'hq' && b.type !== 'depot')) continue;
        if (dist2(this.x, this.y, b.x, b.y) < (DROP_RADIUS * TILE) ** 2) {
          game.supplies += this.carrying;
          this.carrying = 0;
          break;
        }
      }
    }

    // Pick up dropped bundles on contact
    for (const bd of game.bundles) {
      if (bd.amount <= 0) continue;
      if (dist2(this.x, this.y, bd.x, bd.y) < (SEARCH_RADIUS * TILE) ** 2) {
        const take = Math.min(CARRY_CAPACITY[this.type] - this.carrying, bd.amount);
        bd.amount -= take;
        this.carrying += take;
      }
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
          this.atkCooldown = 1 / this.def.atkRate;
          game.projectiles.push(new Projectile(
            this.x, this.y, this.atkTarget, this.def.atkDmg, 320, '#88ffff'
          ));
          game.spawnMuzzleFlash(this.x, this.y);
        }
      }
      return;
    }

    // Builder: repair nearby damaged building
    if (this.type === 'builder') {
      if (this.repairTarget && !this.repairTarget.dead && this.repairTarget.hp < this.repairTarget.maxHp) {
        const d = dist(this.x, this.y, this.repairTarget.x, this.repairTarget.y);
        if (d > TILE * 2) {
          this._moveToward(this.repairTarget.x, this.repairTarget.y, dt, game);
        } else {
          this.repairCooldown -= dt;
          if (this.repairCooldown <= 0 && game.supplies >= REPAIR_TICK_COST) {
            this.repairCooldown = 0.5;
            game.supplies -= REPAIR_TICK_COST;
            this.repairTarget.hp = Math.min(this.repairTarget.maxHp, this.repairTarget.hp + 20);
          }
        }
        return;
      } else {
        this.repairTarget = null;
      }
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
        } else {
          this._moveToward(wp.x, wp.y, dt, game);
        }
      }
    } else {
      this.attackMove = false;
    }

    // Auto-attack nearest zombie in range
    if (this.atkCooldown <= 0) {
      const z = game.nearestZombie(this.x, this.y, this.def.atkRange);
      if (z) {
        this.atkCooldown = 1 / this.def.atkRate;
        game.projectiles.push(new Projectile(
          this.x, this.y, z, this.def.atkDmg, 320, '#88ffff'
        ));
        game.spawnMuzzleFlash(this.x, this.y);
      }
    }
  }

  _moveToward(tx, ty, dt, game) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < 1) return;
    let nx = dx/d, ny = dy/d;

    // Simple separation from other units
    for (const u of game.units) {
      if (u === this || u.dead) continue;
      const sdx = this.x - u.x, sdy = this.y - u.y;
      const sd = Math.sqrt(sdx*sdx + sdy*sdy);
      if (sd < 22 && sd > 0) {
        nx += (sdx/sd) * (22-sd)/22 * 0.8;
        ny += (sdy/sd) * (22-sd)/22 * 0.8;
      }
    }

    const len = Math.sqrt(nx*nx + ny*ny);
    if (len > 0) { nx /= len; ny /= len; }

    const speed = this.def.speed;
    const newX = this.x + nx * speed * dt;
    const newY = this.y + ny * speed * dt;

    // Clamp to map
    this.x = clamp(newX, this.def.radius, MAP_W * TILE - this.def.radius);
    this.y = clamp(newY, this.def.radius, MAP_H * TILE - this.def.radius);
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
  }

  get def() { return ZOMBIE_DEFS[this.type]; }

  takeDamage(amount) {
    this.dormant = false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.dormant) {
      // Sleeps until something comes close (gunfire wake is handled by the game)
      for (const u of game.units) {
        if (u.dead) continue;
        if (dist2(this.x, this.y, u.x, u.y) < GUARD_WAKE_RADIUS * GUARD_WAKE_RADIUS) {
          this.dormant = false;
          this.atkTarget = u;          // aggro the intruder first
          break;
        }
      }
      if (this.dormant) return;
    }

    this.atkCooldown -= dt;

    // Clear dead attack target
    if (this.atkTarget && this.atkTarget.dead) this.atkTarget = null;

    // Find something to attack (prefer units over buildings)
    if (!this.atkTarget) {
      // Check for nearby units first
      let bestU = null, bestUD = Infinity;
      for (const u of game.units) {
        if (u.dead) continue;
        const d = dist(this.x, this.y, u.x, u.y);
        if (d < this.def.atkRange + 20 && d < bestUD) { bestUD = d; bestU = u; }
      }
      this.atkTarget = bestU;

      // Otherwise attack building in range
      if (!this.atkTarget) {
        for (const b of game.buildings) {
          if (b.dead) continue;
          const d = dist(this.x, this.y, b.x, b.y);
          if (d < this.def.atkRange + b.width/2) { this.atkTarget = b; break; }
        }
      }
    }

    if (this.atkTarget && !this.atkTarget.dead) {
      const targetX = this.atkTarget.x, targetY = this.atkTarget.y;
      const d = dist(this.x, this.y, targetX, targetY);
      const stopRange = this.def.atkRange + (this.atkTarget.width ? this.atkTarget.width/2 - 4 : 0);

      if (d > stopRange) {
        // Move toward target
        this._flowMove(dt, game);
      } else {
        // Attack
        if (this.atkCooldown <= 0) {
          this.atkCooldown = 1 / this.def.atkRate;
          this.atkTarget.takeDamage(this.def.atkDmg);
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

  _flowMove(dt, game) {
    const tx = Math.floor(this.x / TILE);
    const ty = Math.floor(this.y / TILE);

    let nx = 0, ny = 0;

    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && game.flowField[ty] && game.flowField[ty][tx]) {
      const f = game.flowField[ty][tx];
      nx = f.dx; ny = f.dy;
    } else {
      // Fallback: move toward nearest building directly
      let nearestB = null, nearestD = Infinity;
      for (const b of game.buildings) {
        if (b.dead) continue;
        const d = dist(this.x, this.y, b.x, b.y);
        if (d < nearestD) { nearestD = d; nearestB = b; }
      }
      if (nearestB) {
        const ddx = nearestB.x - this.x, ddy = nearestB.y - this.y;
        const d = Math.sqrt(ddx*ddx + ddy*ddy);
        nx = d > 0 ? ddx/d : 0;
        ny = d > 0 ? ddy/d : 0;
      }
    }

    if (nx === 0 && ny === 0) return;

    // Separation from other zombies
    for (const z of game.zombies) {
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

    this.x = clamp(this.x + nx * this.def.speed * dt, this.def.radius, MAP_W * TILE - this.def.radius);
    this.y = clamp(this.y + ny * this.def.speed * dt, this.def.radius, MAP_H * TILE - this.def.radius);
  }
}
