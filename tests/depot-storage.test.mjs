import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
for (const file of ['config', 'utils', 'pathfinding', 'entities', 'game']) {
  vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const {Game, Building, MAP_W, MAP_H, HQ_STORAGE, DEPOT_STORAGE} =
  vm.runInContext('({Game, Building, MAP_W, MAP_H, HQ_STORAGE, DEPOT_STORAGE})', context);

function fixture(supplies, count) {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq', 10, 10)];
  const depots = Array.from({length:count}, (_, i) => new Building('depot', 20 + 3 * i, 20));
  game.buildings.push(...depots);
  game.supplies = supplies;
  return {game, depots};
}

for (const supplies of [0, 100, 249, 250, HQ_STORAGE - 1, HQ_STORAGE]) {
  test(`destroying a depot preserves all ${supplies} supplies within HQ capacity`, () => {
    const {game, depots} = fixture(supplies, 1);
    game.damageEntity(depots[0], depots[0].hp);
    game.update(.05);
    assert.equal(game.supplies, supplies);
    assert.equal(game.stats.suppliesSpent, 0);
    assert.equal(game.storageCap(), HQ_STORAGE);
  });
}

for (const [supplies, count, loss] of [[650, 1, 150], [750, 1, 250], [800, 3, 100], [550, 3, 16], [1500, 2, 500]]) {
  test(`destroying one of ${count} depots with ${supplies} supplies loses only its ${loss} share`, () => {
    const {game, depots} = fixture(supplies, count);
    game.damageEntity(depots[0], depots[0].hp);
    assert.equal(game.supplies, supplies - loss);
    assert.equal(game.stats.suppliesSpent, 0, 'destroyed supplies are not spending');
    game.onEntityDied(depots[0]);
    game.update(.05);
    assert.equal(game.supplies, supplies - loss, 'death handling never charges twice');
    assert.equal(game.storageCap(), HQ_STORAGE + (count - 1) * DEPOT_STORAGE);
    assert.ok(game.activity.some(e => e.text.includes(`${loss} supplies lost`)));
    const restored = Game.fromSaveData(game.toSaveData());
    restored.update(.05);
    assert.equal(restored.supplies, supplies - loss);
  });
}

for (const simultaneous of [false, true]) {
  test(`losing multiple depots ${simultaneous ? 'together' : 'in sequence'} preserves the HQ reserve`, () => {
    const {game, depots} = fixture(850, 3);
    if (simultaneous) {
      for (const depot of depots) depot.takeDamage(depot.hp);
      game.update(.05);
    } else {
      const balances = [734, 617, 500];
      depots.forEach((depot, i) => {
        game.damageEntity(depot, depot.hp);
        assert.equal(game.supplies, balances[i]);
        game.update(.05);
      });
    }
    assert.equal(game.supplies, HQ_STORAGE);
    assert.equal(game.stats.buildingsDestroyed, 3);
    assert.equal(game.stats.suppliesSpent, 0);
  });
}

test('selling a depot preserves banked supplies and applies only the sale refund', () => {
  const {game, depots} = fixture(600, 1);
  game.sellBuilding(depots[0]);
  game.update(.05);
  assert.equal(game.supplies, 637);
  assert.equal(game.stats.buildingsDestroyed, 0);
});
