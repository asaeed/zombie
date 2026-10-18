import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
for (const file of ['config', 'utils', 'pathfinding', 'entities', 'game']) {
  vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const {Game, Unit, Building, MAP_W, MAP_H, TILE, BUILDER_REPAIR_RADIUS, REPAIR_TICK_COST} =
  vm.runInContext('({Game, Unit, Building, MAP_W, MAP_H, TILE, BUILDER_REPAIR_RADIUS, REPAIR_TICK_COST})', context);

function fixture() {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq', 10, 10)];
  game.supplies = 200;
  const builder = new Unit('builder', 30.5 * TILE, 30.5 * TILE);
  game.units = [builder];
  return {game, builder};
}

function run(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds / .05); i++) {
    for (const unit of game.units) unit.update(.05, game);
  }
}

for (const type of ['hq', 'barracks', 'depot', 'tower', 'wall']) {
  test(`builder automatically repairs the ${type} footprint inside its range`, () => {
    const {game, builder} = fixture();
    const target = new Building(type, 37, 30);
    target.hp -= 40;
    game.buildings.push(target);
    builder.x = target.x - target.width / 2 - BUILDER_REPAIR_RADIUS;
    builder.y = target.y;
    assert.ok(Math.hypot(builder.x - target.x, builder.y - target.y) > BUILDER_REPAIR_RADIUS);
    builder.update(.05, game);
    assert.equal(builder.repairTarget, target, 'the footprint boundary counts as in range');
    const restored = Game.fromSaveData(game.toSaveData());
    run(restored, 18);
    assert.equal(restored.buildings[1].hp, target.maxHp);
    assert.equal(restored.supplies, 200 - 2 * REPAIR_TICK_COST);
    assert.equal(restored.units[0].supportHome, null, 'builder finishes its return after loading');
    assert.ok(Math.hypot(restored.units[0].x - builder.supportHome.x,
      restored.units[0].y - builder.supportHome.y) < 8);
  });
}

test('builder leaves buildings whose entire footprint is outside its range alone', () => {
  const {game, builder} = fixture();
  const target = new Building('depot', 38, 30);
  target.hp -= 40;
  game.buildings.push(target);
  builder.x = target.x - target.width / 2 - BUILDER_REPAIR_RADIUS - 1;
  builder.y = target.y;
  run(game, 1);
  assert.equal(builder.repairTarget, null);
  assert.equal(game.supplies, 200);
});

test('builder picks the closest damaged footprint', () => {
  const {game, builder} = fixture();
  const large = new Building('hq', 34, 30);
  const small = new Building('wall', 30, 35);
  large.hp -= 20; small.hp -= 20;
  game.buildings.push(small, large);
  builder.update(.05, game);
  assert.equal(builder.repairTarget, large);
});

test('a returning builder picks up new damage without a manual repair order', () => {
  const {game, builder} = fixture();
  const station = {x:builder.x, y:builder.y};
  const first = new Building('light', 35, 30);
  const second = new Building('depot', 35, 32);
  first.hp -= 20;
  game.buildings.push(first, second);
  for (let i = 0; i < 200 && !builder._supportReturning; i++) run(game, .05);
  assert.equal(builder._supportReturning, true);
  second.hp -= 40;
  builder.update(.05, game);
  assert.equal(builder.repairTarget, second);
  assert.equal(builder._supportReturning, false);
  run(game, 20);
  assert.equal(second.hp, second.maxHp);
  assert.equal(builder.supportHome, null);
  assert.ok(Math.hypot(builder.x - station.x, builder.y - station.y) < 8);
});

test('builders continue to the next damaged building when another builder finishes their target', () => {
  const {game, builder} = fixture();
  const first = new Building('light', 35, 30);
  const second = new Building('depot', 35, 32);
  first.hp -= 20; second.hp -= 40;
  game.buildings.push(first, second);
  builder.update(.05, game);
  assert.equal(builder.repairTarget, first);
  first.hp = first.maxHp;
  run(game, 20);
  assert.equal(second.hp, second.maxHp);
  assert.equal(builder.supportHome, null);
});

test('automatic repair respects player move and gathering orders', () => {
  for (const order of ['move', 'gather']) {
    const {game, builder} = fixture();
    const target = new Building('light', 34, 30);
    target.hp -= 40;
    game.buildings.push(target);
    if (order === 'move') builder.moveTo(builder.x, builder.y + 10 * TILE, game);
    else {
      game.bundles.push({id:1, x:builder.x + TILE, y:builder.y, amount:30});
      builder.gatherDroppedSuppliesAt(builder.x + TILE, builder.y, game);
    }
    builder.update(.05, game);
    assert.equal(builder.repairTarget, null, order);
    assert.equal(target.hp, target.maxHp - 40, order);
  }
});
