import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({window: {innerWidth:1200, innerHeight:900}});
for (const file of ['config', 'utils', 'pathfinding', 'entities', 'game']) {
  vm.runInContext(readFileSync(new URL(`js/${file}.js`, root), 'utf8'), context,
    {filename:`js/${file}.js`});
}
const {Game, Building, Unit, Zombie, MAP_W, MAP_H, ZOMBIE_DEFS, FIRE_DURATION,
  FIRE_DPS, SCREAMER_SPEED_FACTOR} = vm.runInContext(
  '({Game, Building, Unit, Zombie, MAP_W, MAP_H, ZOMBIE_DEFS, FIRE_DURATION, FIRE_DPS, SCREAMER_SPEED_FACTOR})',
  context);

function fixture(type = 'walker') {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  game.fogVisible.fill(1); game.fogExplored.fill(1);
  const hq = new Building('hq', 28, 13);
  const zombie = new Zombie(type, 620, 620);
  game.buildings = [hq]; game.zombies = [zombie];
  game._rebuildFlowField();
  return {game, zombie, hq};
}

test('a direct flare hit never parks zombies at the flare or interrupts their path to HQ', () => {
  const {game, zombie, hq} = fixture();
  assert.equal(game.throwFlare(zombie.x, zombie.y), true);
  assert.equal(zombie.burning, true);
  for (let i = 0; i < 20; i++) {
    const before = Math.hypot(hq.x - zombie.x, hq.y - zombie.y);
    game.update(.05);
    assert.ok(Math.hypot(hq.x - zombie.x, hq.y - zombie.y) < before,
      `burning zombie should keep advancing on tick ${i}`);
  }
  assert.ok(zombie.hp < zombie.maxHp, 'moving zombies still take fire damage');
  assert.ok(game.particles.length > 0, 'moving zombies still emit fire particles');
});

test('burning zombies retain their human target instead of chasing an off-path flare', () => {
  const {game, zombie} = fixture();
  const human = new Unit('soldier', zombie.x + 300, zombie.y);
  game.units = [human]; zombie.atkTarget = human;
  assert.equal(game.throwFlare(zombie.x, zombie.y + 80), true);
  const start = {x:zombie.x, y:zombie.y};
  for (let i = 0; i < 10; i++) {
    zombie.update(.05, game);
    assert.equal(zombie.atkTarget, human);
  }
  assert.ok(zombie.x > start.x, 'zombie continues toward its human target');
  assert.equal(zombie.y, start.y, 'flare must not steer it off the path');
});

test('even an unburned zombie keeps its existing route when a flare is nearby', () => {
  const control = fixture(), lit = fixture();
  lit.game.flares.push({x:lit.zombie.x, y:lit.zombie.y + 240, t:0});
  for (let i = 0; i < 10; i++) {
    control.zombie.update(.05, control.game);
    lit.zombie.update(.05, lit.game);
  }
  assert.equal(lit.zombie.burning, false);
  assert.equal(lit.zombie.x, control.zombie.x);
  assert.equal(lit.zombie.y, control.zombie.y);
});

test('fire adds 20 percent speed for every zombie type, without changing base stats', () => {
  for (const type of Object.keys(ZOMBIE_DEFS)) {
    const {game, zombie} = fixture(type);
    const base = zombie.def.speed;
    assert.equal(game.zombieSpeed(zombie), base);
    zombie.ignite();
    assert.equal(game.zombieSpeed(zombie), base * 1.2, type);
    assert.equal(zombie.def.speed, base);
    zombie.burnTime = .02;
    zombie.update(.05, game);
    assert.equal(zombie.burning, false);
    assert.equal(game.zombieSpeed(zombie), base, 'boost ends as soon as the fire goes out');
  }
});

test('burning speed stacks once with a screamer aura and vanishes when fire expires', () => {
  const {game, zombie} = fixture();
  game.zombies.push(new Zombie('screamer', zombie.x + 100, zombie.y),
    new Zombie('screamer', zombie.x - 100, zombie.y));
  zombie.ignite();
  assert.equal(game.zombieSpeed(zombie), zombie.def.speed * 1.2 * SCREAMER_SPEED_FACTOR);
  zombie.burnTime = 0;
  assert.equal(game.zombieSpeed(zombie), zombie.def.speed * SCREAMER_SPEED_FACTOR);
});

for (const type of ['walker', 'spitter', 'exploder']) {
  test(`a burning ${type} can still attack its target beside an active flare`, () => {
    const {game, zombie} = fixture(type);
    const human = new Unit('soldier', zombie.x + 20, zombie.y);
    game.units = [human]; zombie.atkTarget = human;
    game.throwFlare(zombie.x, zombie.y);
    zombie.update(.05, game);
    if (type === 'spitter') assert.equal(game.projectiles.at(-1)?.target, human);
    else assert.ok(human.hp < human.maxHp);
    if (type === 'exploder') assert.equal(zombie.exploded, true);
  });
}

test('saved burning zombies resume their target and boosted movement without a new order', () => {
  const {game, zombie} = fixture();
  const human = new Unit('soldier', zombie.x + 300, zombie.y);
  game.units = [human]; zombie.atkTarget = human;
  game.throwFlare(zombie.x, zombie.y);
  const restored = Game.fromSaveData(game.toSaveData());
  const resumed = restored.zombies[0], x = resumed.x;
  assert.equal(resumed.burnTime, FIRE_DURATION);
  assert.equal(restored.zombieSpeed(resumed), resumed.def.speed * 1.2);
  resumed.update(.05, restored);
  assert.equal(resumed.atkTarget, restored.units[0]);
  assert.ok(resumed.x > x);
  assert.equal(resumed.hp, resumed.maxHp - FIRE_DPS * .05);
});
