import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ window: { innerWidth: 1200, innerHeight: 900 } });
for (const file of ['js/config.js', 'js/utils.js', 'js/pathfinding.js',
  'js/entities.js', 'js/game.js', 'js/zombie-art.js']) {
  vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}
const { Zombie, Game, defs, appearance, variants, frame, mapW, mapH } = vm.runInContext(
  '({ Zombie, Game, defs: ZOMBIE_DEFS, appearance: zombieAppearance, variants: ZOMBIE_VARIANTS, frame: zombieArtFrame, mapW: MAP_W, mapH: MAP_H })', context);

test('regular morphology varies, while every special keeps one fixed look', () => {
  assert.equal(new Set(Array.from({ length: 8 }, (_, id) => appearance('walker', id))).size, 8);
  assert.equal(new Set(Array.from({ length: 8 }, (_, id) => appearance('runner', id))).size, 8);
  assert.ok(variants.some(variant => variant.missingArm === 'left'));
  assert.ok(variants.some(variant => variant.missingArm === 'right'));
  assert.ok(variants.some(variant => variant.cap));
  assert.ok(variants.some(variant => variant.dress));
  for (const type of ['spitter', 'exploder', 'screamer', 'brute', 'boss']) {
    assert.equal(appearance(type, 1), appearance(type, 987));
  }
});

test('runner motion and heavy cadence use separate timing', () => {
  assert.ok(defs.runner.speed >= defs.walker.speed * 3);
  assert.ok(defs.brute.speed < defs.walker.speed);
  assert.notDeepEqual(frame('runner', 'SE', true, Infinity, 0),
    frame('runner', 'SE', true, Infinity, 21));
  assert.notDeepEqual(frame('brute', 'SE', true, Infinity, 0),
    frame('brute', 'SE', true, Infinity, 18));
  assert.notDeepEqual(frame('walker', 'S', false, 0.2, 0),
    frame('walker', 'S', false, Infinity, 0));
});

test('zombie heading follows actual travel and survives save/load', () => {
  const zombie = new Zombie('walker', 500, 500);
  zombie.recordMotion(12, 0, 2);
  assert.equal(zombie.facing, 'SE');
  assert.equal(zombie.animDistance, 12);
  assert.equal(zombie.lastMotionAt, 2);
  const game = new Game();
  game.tiles = Array.from({ length: mapH }, () => new Uint8Array(mapW));
  game.zombies = [zombie];
  const saved = Game.fromSaveData(game.toSaveData()).zombies[0];
  assert.equal(saved.facing, 'SE');
  assert.equal(saved.animDistance, 12);
  assert.equal(appearance('walker', saved.id), appearance('walker', zombie.id));
});
