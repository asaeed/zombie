// Run: node tests/support-return.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
for (const file of ['js/config.js', 'js/utils.js', 'js/pathfinding.js', 'js/entities.js', 'js/game.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), ctx, { filename: file });
}
const { Game, Unit, Building, TILE, MAP_W, MAP_H } =
  vm.runInContext('({ Game, Unit, Building, TILE, MAP_W, MAP_H })', ctx);

function setup(type) {
  const game = new Game();
  game.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq', 10, 10)];
  game.supplies = 200;
  const station = { x: 20 * TILE + 20, y: 20 * TILE + 20 };
  const support = new Unit(type, station.x, station.y);
  game.units = [support];
  return { game, support, station };
}

function run(game, seconds) {
  for (let i = 0; i < seconds / 0.05; i++) {
    for (const unit of game.units) unit.update(0.05, game);
  }
}

for (const type of ['builder', 'medic']) {
  const fixture = setup(type);
  const { station } = fixture;
  if (type === 'builder') {
    const damaged = new Building('light', 24, 20);
    damaged.hp = 80;
    fixture.game.buildings.push(damaged);
  } else {
    const wounded = new Unit('soldier', station.x + 4 * TILE, station.y);
    wounded.hp = 20;
    fixture.game.units.push(wounded);
  }

  run(fixture.game, 1.5);
  assert.ok(fixture.support.supportHome, `${type} should remember its station before leaving`);
  assert.equal(fixture.support.supportHome.x, station.x);
  const restored = Game.fromSaveData(fixture.game.toSaveData());
  run(restored, 30);
  const actor = restored.units[0];
  if (type === 'builder') assert.equal(restored.buildings[1].hp, restored.buildings[1].maxHp);
  else assert.equal(restored.units[1].hp, restored.units[1].maxHp);
  assert.ok(Math.hypot(actor.x - station.x, actor.y - station.y) < 8,
    `${type} should return to its original station after the job`);
  assert.equal(actor.supportHome, null, `${type} should finish its return order`);
}

const manual = setup('builder');
const manualTarget = new Building('light', 24, 20);
manualTarget.hp = 160;
manual.game.buildings.push(manualTarget);
manual.support.repairBuilding(manualTarget);
run(manual.game, 20);
assert.equal(manualTarget.hp, manualTarget.maxHp);
assert.ok(Math.hypot(manual.support.x - manual.station.x, manual.support.y - manual.station.y) < 8,
  'a manually ordered builder should also return to its station');

const blocked = setup('builder');
const blockedTarget = new Building('light', 24, 20);
blockedTarget.hp = 160;
blocked.game.buildings.push(blockedTarget);
run(blocked.game, 1.5);
blocked.game.buildings.push(new Building('wall', 20, 20));
run(blocked.game, 20);
assert.equal(blockedTarget.hp, blockedTarget.maxHp);
assert.equal(blocked.support.supportHome, null,
  'builder should complete the return even when its former tile is blocked');
assert.notEqual(`${Math.floor(blocked.support.x / TILE)},${Math.floor(blocked.support.y / TILE)}`, '20,20');
assert.ok(Math.hypot(blocked.support.x - blocked.station.x, blocked.support.y - blocked.station.y) < TILE * 2,
  'builder should settle near its blocked station');

const returning = setup('builder');
const returningTarget = new Building('light', 24, 20);
returningTarget.hp = 180;
returning.game.buildings.push(returningTarget);
for (let i = 0; i < 400 && !returning.support._supportReturning; i++) run(returning.game, 0.05);
assert.equal(returning.support._supportReturning, true, 'builder should begin a return trip');
const resumedReturn = Game.fromSaveData(returning.game.toSaveData());
run(resumedReturn, 12);
assert.equal(resumedReturn.units[0].supportHome, null,
  'a return trip in progress should finish after loading a save');
assert.ok(Math.hypot(resumedReturn.units[0].x - returning.station.x,
  resumedReturn.units[0].y - returning.station.y) < 8);

const redirected = setup('medic');
const wounded = new Unit('soldier', redirected.station.x + 4 * TILE, redirected.station.y);
wounded.hp = 20;
redirected.game.units.push(wounded);
run(redirected.game, 1.5);
const newStation = { x: 32 * TILE + 20, y: 32 * TILE + 20 };
redirected.support.moveTo(newStation.x, newStation.y, redirected.game);
run(redirected.game, 30);
assert.ok(Math.hypot(redirected.support.x - newStation.x, redirected.support.y - newStation.y) < TILE * 0.8,
  'a player move order should override the old support station');

console.log('support-return.test: all assertions passed');
