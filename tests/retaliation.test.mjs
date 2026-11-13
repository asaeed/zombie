import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture(type = 'soldier') {
  const context = vm.createContext({window:{innerWidth:1200, innerHeight:900}});
  for (const name of ['config', 'utils', 'pathfinding', 'entities', 'game']) {
    vm.runInContext(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
  }
  const e = vm.runInContext('({Game, Unit, Zombie, Building, Vehicle, Cache, Projectile, MAP_W, MAP_H, TILE, TILE_WATER})', context);
  const game = new e.Game();
  game.tiles = Array.from({length:e.MAP_H}, () => new Uint8Array(e.MAP_W));
  game.buildings = [new e.Building('hq', 3, 3)];
  game.fogVisible.fill(1); game.fogExplored.fill(1); game.waveTimer = 999;
  const unit = new e.Unit(type, 1220, 1220);
  const zombie = new e.Zombie('spitter', 1395, 1220);
  zombie.atkTarget = unit;
  game.units = [unit]; game.zombies = [zombie];
  game._rebuildFlowField();
  return {e, context, game, unit, zombie};
}

test('a soldier hit by out-of-range acid advances, returns fire in range, and kills the Spitter', () => {
  const {game, unit, zombie} = fixture();
  const start = unit.x, ranges = [], attack = unit._attackZombie.bind(unit);
  unit._attackZombie = (target, game) => {
    ranges.push(Math.hypot(target.x - unit.x, target.y - unit.y)); attack(target, game);
  };
  for (let i=0; i<300 && !zombie.dead && !unit.dead; i++) game.update(1/30);
  assert.ok(unit.hp < unit.maxHp); assert.ok(unit.x > start);
  assert.ok(ranges.length); assert.ok(ranges.every(d => d <= unit.def.atkRange));
  assert.equal(unit.dead, false); assert.equal(zombie.dead, true);
});

test('all armed human types pursue their attacker, while medics and passengers do not chase', () => {
  for (const type of ['soldier','scout','builder','sniper','heavy','torchbearer','medic']) {
    const {e, game, unit, zombie} = fixture(type);
    zombie.x = unit.x + unit.def.atkRange + 60;
    game.damageEntity(unit, 1, 'acid', zombie);
    if (type === 'medic') {
      assert.equal(unit.atkTarget, null); continue;
    }
    assert.equal(unit.atkTarget, zombie);
    const start = unit.x;
    for (let i=0; i<90; i++) unit.update(1/30, game);
    assert.ok(unit.x > start, type);
    const passenger = new e.Unit(type, unit.x, unit.y); passenger.vehicle = new e.Vehicle('suv', unit.x, unit.y);
    passenger.takeDamage(1, 'acid', zombie); assert.equal(passenger.atkTarget, null);
  }
});

test('melee damage assigns the actual attacking zombie, even when another zombie is closer', () => {
  for (const type of ['walker','runner','brute','screamer','boss']) {
    const {e, game, unit, zombie} = fixture();
    zombie.dead = true;
    const attacker = new e.Zombie(type, unit.x+25, unit.y);
    attacker.atkTarget = unit;
    unit.hp = unit.maxHp = 1000;
    game.zombies = [new e.Zombie('walker', unit.x+10, unit.y), attacker];
    attacker.update(.01, game);
    assert.ok(unit.hp < unit.maxHp); assert.equal(unit.atkTarget, attacker, type);
  }
});

test('pursuit routes around terrain, reuses the route, and reaches firing range', () => {
  for (const obstacle of ['wall','water']) {
    const {e, context, game, unit, zombie} = fixture('builder');
    unit.x = 15.5*e.TILE; unit.y = 15.5*e.TILE;
    zombie.x = 20.5*e.TILE; zombie.y = unit.y;
    for (let y=13; y<=17; y++) {
      if (obstacle === 'wall') game.buildings.push(new e.Building('wall',18,y));
      else game.tiles[y][18] = e.TILE_WATER;
    }
    game._rebuildFlowField();
    let searches=0; const find=context.findPath;
    context.findPath=(...args) => { searches++; return find(...args); };
    game.damageEntity(unit, 1, 'acid', zombie);
    for (let i=0; i<600 && !game.projectiles.length; i++) {
      unit.update(1/30, game);
      assert.ok(game.canOccupyGround(unit.x, unit.y, unit.def.radius));
    }
    assert.ok(game.projectiles.length, obstacle); assert.ok(searches<=2);
  }
});

test('acid attribution and pursuit survive saves, and old projectile saves still load', () => {
  const {e, game, unit, zombie} = fixture();
  zombie.update(.01, game); assert.equal(game.projectiles[0].attacker, zombie);
  const data = game.toSaveData(), loaded = e.Game.fromSaveData(data);
  assert.equal(loaded.projectiles[0].attacker, loaded.zombies[0]);
  loaded.projectiles[0].update(2, loaded);
  assert.equal(loaded.units[0].atkTarget, loaded.zombies[0]);
  const again=e.Game.fromSaveData(loaded.toSaveData());
  assert.equal(again.units[0].atkTarget, again.zombies[0]);
  delete data.projectiles[0].attackerId;
  assert.equal(e.Game.fromSaveData(data).projectiles[0].attacker, null);
  assert.equal(unit.atkTarget, null);
});

test('dead attackers and lethal or unrelated damage do not start a pursuit', () => {
  for (const reason of ['attacker-dead','lethal','unrelated']) {
    const {game, unit, zombie} = fixture();
    if (reason === 'attacker-dead') zombie.dead = true;
    game.damageEntity(unit, reason === 'lethal' ? 1000 : 1, 'acid', reason === 'unrelated' ? null : zombie);
    assert.equal(unit.atkTarget, null, reason);
  }
});

test('retaliation preserves gathering and resumes it after the attacker dies; player orders override pursuit', () => {
  const {e, game, unit, zombie} = fixture();
  const cache = new e.Cache('bin',40,40); game.caches = [cache];
  unit.gatherFrom(cache, game); game.damageEntity(unit, 1, 'acid', zombie);
  const center = unit.gatherCenter;
  unit.update(.1, game); assert.equal(unit.atkTarget, zombie); assert.equal(unit.gatherCenter, center);
  zombie.dead = true; unit.update(.1, game);
  assert.equal(unit.atkTarget, null); assert.equal(unit.gatherTarget, cache); assert.ok(unit.waypoints.length);
  zombie.dead = false; game.damageEntity(unit, 1, 'acid', zombie);
  unit.moveTo(1100,1100,game); assert.equal(unit.atkTarget, null);
  game.damageEntity(unit, 1, 'acid', zombie); unit.stop(); assert.equal(unit.atkTarget, null);
});

test('legacy attack-move saves resume ordinary movement and still fire at nearby enemies', () => {
  const {e, game, unit, zombie} = fixture();
  zombie.x = unit.x + 100;
  unit.moveTo(unit.x + 300, unit.y, game);
  const data = game.toSaveData(); data.units[0].attackMove = true;
  const loaded = e.Game.fromSaveData(data), moving = loaded.units[0];
  const start = moving.x;
  for (let i=0;i<15;i++) moving.update(1/30, loaded);
  assert.ok(moving.x > start + 20, 'nearby enemies do not pause the move order');
  assert.ok(loaded.projectiles.length > 0, 'the unit continues shooting while moving');
  assert.equal('attackMove' in loaded.toSaveData().units[0], false);
});
