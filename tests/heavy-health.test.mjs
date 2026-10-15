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
const {Game, Unit, Vehicle, Zombie, MAP_W, MAP_H} = vm.runInContext(
  '({Game, Unit, Vehicle, Zombie, MAP_W, MAP_H})', context);
function fixture() {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  return game;
}

test('Heavy, Brute and Boss Brute have doubled fixed health; other units do not change', () => {
  for (const [entity, hp] of [[new Unit('heavy',600,600),420],
    [new Zombie('brute',700,600),1000], [new Zombie('boss',800,600),3600],
    [new Unit('soldier',900,600),100], [new Zombie('walker',1000,600),80]]) {
    assert.equal(entity.hp, hp, entity.type);
    assert.equal(entity.maxHp, hp, entity.type);
  }
});

test('Brute and Boss health stays fixed regardless of wave number', () => {
  for (const wave of [1, 10, 15, 30, 100]) {
    const game = fixture();
    game.waveNum = wave;
    for (const [type, hp] of [['brute',1000], ['boss',3600]]) {
      game._spawnZombieFromEdge(type);
      assert.equal(game.zombies.at(-1).maxHp, hp);
      assert.equal(game.zombies.at(-1).hp, hp);
    }
  }
});

test('legacy Heavy saves gain the new health pool while preserving their health fraction', () => {
  for (const [oldHp, dead] of [[210,false], [105,false], [0,true]]) {
    const game = fixture();
    game.units = [new Unit('heavy',600,600)];
    const save = game.toSaveData();
    delete save.units[0].maxHp;
    save.units[0].hp = oldHp; save.units[0].dead = dead;
    const restored = Game.fromSaveData(save);
    assert.equal(restored.units[0].maxHp, 420);
    assert.equal(restored.units[0].hp, oldHp * 2);
    assert.equal(restored.units[0].dead, dead);
    const currentSave = restored.toSaveData();
    assert.equal(currentSave.units[0].maxHp, 420);
    const again = Game.fromSaveData(currentSave);
    assert.equal(again.units[0].hp, oldHp * 2, 'repeated loads must not double health again');
  }
});

test('current Heavy saves retain exact HP, including loaded passengers', () => {
  const game = fixture();
  const heavy = new Unit('heavy',600,600);
  const soldier = new Unit('soldier',600,700);
  const truck = new Vehicle('suv',600,600);
  heavy.hp = 315;
  soldier.hp = 37.5;
  truck.passengers = [heavy]; heavy.vehicle = truck;
  game.units = [heavy, soldier]; game.vehicles = [truck];
  const restored = Game.fromSaveData(game.toSaveData());
  assert.equal(restored.units[0].maxHp, 420);
  assert.equal(restored.units[0].hp, 315);
  assert.equal(restored.units[0].vehicle, restored.vehicles[0]);
  assert.equal(restored.vehicles[0].passengers[0], restored.units[0]);
  assert.equal(restored.units[1].hp, 37.5, 'unchanged stats preserve exact existing health');
});

test('old Brute and Boss saves preserve injuries when their fixed health doubles', () => {
  for (const [type, oldMax] of [['brute',500], ['boss',1800]]) {
    const game = fixture();
    game.zombies = [new Zombie(type,600,600)];
    const save = game.toSaveData();
    save.zombies[0].maxHp = oldMax;
    save.zombies[0].hp = oldMax / 2;
    const restored = Game.fromSaveData(save);
    assert.equal(restored.zombies[0].maxHp, oldMax * 2);
    assert.equal(restored.zombies[0].hp, oldMax);
    const again = Game.fromSaveData(restored.toSaveData());
    assert.equal(again.zombies[0].hp, oldMax);
  }
});
