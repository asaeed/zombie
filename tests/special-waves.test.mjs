import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
function engine() {
  const context = vm.createContext({window:{innerWidth:1200, innerHeight:900}});
  for (const name of ['config', 'utils', 'pathfinding', 'entities', 'game']) {
    vm.runInContext(readFileSync(new URL(`js/${name}.js`, root), 'utf8'), context);
  }
  return vm.runInContext('({Game, Building, MAP_W, MAP_H, WAVE_INTERVAL})', context);
}
function fixture(e) {
  const game = new e.Game();
  game.tiles = Array.from({length:e.MAP_H}, () => new Uint8Array(e.MAP_W));
  game.buildings = [new e.Building('hq', 39, 39)];
  game.waveNum = 8;
  game.waveTimer = e.WAVE_INTERVAL;
  game._rebuildFlowField();
  game._recomputeFog();
  return game;
}

test('wave counts match the original special zombie progression', () => {
  const e = engine();
  const types = ['walker', 'runner', 'brute', 'spitter', 'exploder', 'screamer'];
  const counts = [
    [8, 0, 0, 0, 0, 0],
    [12, 3, 0, 0, 0, 0],
    [15, 5, 1, 0, 0, 0],
    [18, 8, 2, 2, 0, 0],
    [20, 12, 3, 3, 0, 0],
    [25, 15, 4, 4, 2, 0],
    [27, 17, 4, 4, 3, 0],
    [30, 18, 5, 5, 3, 1],
  ];
  for (const [index, expected] of counts.entries()) {
    const game = fixture(e);
    game.waveNum = index;
    game._scheduleWave();
    for (const [i, type] of types.entries()) {
      assert.equal(game.zombiesToSpawn.filter(t => t === type).length, expected[i],
        `wave ${index + 1}: ${type}`);
    }
    assert.equal(game.zombiesToSpawn.length, expected.reduce((sum, n) => sum + n, 0));
  }
});

test('completed waves leave the intermission free of new zombie spawns', () => {
  const e = engine();
  for (const wave of [4, 5, 8, 20]) {
    const game = fixture(e);
    game.waveNum = wave;
    game.waveActive = true;
    game.update(.01);
    const supplies = game.supplies;
    for (let i = 0; i < 180; i++) game.update(.25);
    assert.equal(game.zombies.length, 0);
    assert.equal(game.zombiesToSpawn.length, 0);
    assert.equal(game.waveActive, false);
    assert.equal(game.waveNum, wave);
    assert.equal(game.supplies, supplies);
  }
});

test('loading an older save ignores pending between-wave specials', () => {
  const e = engine(), game = fixture(e);
  const save = game.toSaveData();
  save.interWaveSpawns = [{type:'brute', delay:0}, {type:'exploder', delay:2}];
  const loaded = e.Game.fromSaveData(save);
  for (let i = 0; i < 40; i++) loaded.update(.25);
  assert.equal(loaded.zombies.length, 0);
  assert.equal(loaded.waveActive, false);
  assert.equal(loaded.waveNum, 8);
  assert.equal(Object.hasOwn(loaded.toSaveData(), 'interWaveSpawns'), false);
});
