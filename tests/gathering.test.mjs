// Run: node tests/gathering.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { innerWidth: 1200, innerHeight: 900, location: {search:'?artPilot=off'} }, URLSearchParams });
for (const file of ['js/config.js', 'js/utils.js', 'js/pathfinding.js', 'js/entities.js', 'js/game.js', 'js/zombie-art.js', 'js/diorama-art.js', 'js/renderer.js', 'js/input.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), ctx, { filename: file });
}
const { Game, Unit, Building, Cache, Renderer, InputHandler, TILE, MAP_W, MAP_H, worldToScreen, screenToWorld, centerCameraOn } =
  vm.runInContext('({ Game, Unit, Building, Cache, Renderer, InputHandler, TILE, MAP_W, MAP_H, worldToScreen, screenToWorld, centerCameraOn })', ctx);

const clickGame = new Game();
clickGame.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
clickGame.fogExplored.fill(1);
clickGame.buildings = [new Building('hq', 15, 15)];
const clickedCache = new Cache('cabin', 20, 20);
clickedCache.searched = true;
clickedCache.amount = 150;
clickGame.caches = [clickedCache];
const clickUnit = new Unit('soldier', clickedCache.x - 160, clickedCache.y);
clickGame.units = [clickUnit];
clickGame.selected = [clickUnit];
centerCameraOn(clickGame.camera, clickedCache.x, clickedCache.y, 1200, 900);
const roof = worldToScreen(clickedCache.x, clickedCache.y, clickGame.camera);
roof.y -= 26;
const projectedGround = screenToWorld(roof.x, roof.y, clickGame.camera);
assert.ok(Math.hypot(projectedGround.x - clickedCache.x, projectedGround.y - clickedCache.y) > TILE * 0.65,
  'roof click must exercise the old ground-only hit-test failure');
const input = Object.create(InputHandler.prototype);
input.game = clickGame;
input._onRightClick({ clientX: roof.x, clientY: roof.y });
assert.equal(clickUnit.gatherTarget, clickedCache,
  'right-clicking the visible cache roof must establish an auto-gather order');
clickUnit.stop();
input._handleMainMenuClick = () => false;
input._onMouseDown({ button: 0, clientX: roof.x, clientY: roof.y });
input._onMouseUp({ button: 0, clientX: roof.x, clientY: roof.y, shiftKey: false });
assert.equal(clickUnit.gatherTarget, clickedCache,
  'left-clicking the visible cache roof must establish an auto-gather order');
assert.equal(clickGame.selected[0], clickUnit, 'the completed click should keep the carrier selected');
for (const zoom of [0.5, 1, 2]) {
  clickGame.camera.zoom = zoom;
  centerCameraOn(clickGame.camera, clickedCache.x, clickedCache.y, 1200, 900);
  const roofAtZoom = worldToScreen(clickedCache.x, clickedCache.y, clickGame.camera);
  roofAtZoom.y -= 26 * zoom;
  assert.equal(input._getCacheAt(roofAtZoom.x, roofAtZoom.y), clickedCache,
    `cache roof should be clickable at zoom ${zoom}`);
  assert.equal(input._getCacheAt(roofAtZoom.x, roofAtZoom.y - 8 * zoom), clickedCache,
    `cache label should be clickable at zoom ${zoom}`);
}
let clickReturnedFull = false;
for (let i = 0; i < 2000 && !clickReturnedFull; i++) {
  clickUnit.update(0.05, clickGame);
  clickedCache.update(0.05, clickGame);
  clickReturnedFull = clickUnit._gatherReturning;
}
assert.equal(clickReturnedFull, true);
assert.equal(clickUnit.carrying, clickUnit.carryCapacity,
  'a roof click should fill the cargo meter before the unit returns');

for (const direction of [-1, 1]) {
  const approachGame = new Game();
  approachGame.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
  approachGame.fogExplored.fill(1);
  approachGame.buildings = [new Building('hq', 15, 15)];
  const cache = new Cache('cabin', 20, 20);
  cache.searched = true;
  cache.amount = 150;
  approachGame.caches = [cache];
  const carrier = new Unit('soldier', cache.x, cache.y + direction * 160);
  approachGame.units = [carrier];
  approachGame.selected = [carrier];
  centerCameraOn(approachGame.camera, cache.x, cache.y, 1200, 900);
  const click = worldToScreen(cache.x, cache.y, approachGame.camera);
  click.y -= 26;
  const handler = Object.create(InputHandler.prototype);
  handler.game = approachGame;
  handler._onRightClick({ clientX: click.x, clientY: click.y });
  let returning = false;
  for (let i = 0; i < 2000 && !returning; i++) {
    carrier.update(0.05, approachGame);
    cache.update(0.05, approachGame);
    returning = carrier._gatherReturning;
  }
  assert.equal(returning, true, `carrier approaching from ${direction < 0 ? 'above' : 'below'} should return`);
  assert.equal(carrier.carrying, carrier.carryCapacity,
    `carrier approaching from ${direction < 0 ? 'above' : 'below'} should fill first`);
  assert.equal(carrier.gatherTarget, cache, 'active cache order should remain visible');
}

const game = new Game();
game.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
game.buildings = [new Building('hq', 15, 15)];
game.supplies = 0;
const first = new Cache('bin', 20, 20);
first.searched = true;
first.amount = 1;
const second = new Cache('bin', 23, 20);
second.searched = true;
second.amount = 100;
game.caches = [first, second];
let unit = new Unit('soldier', first.x, first.y);
game.units = [unit];
unit.gatherFrom(first, game);

let switched = false;
for (let i = 0; i < 1000 && !switched; i++) {
  unit.update(0.05, game);
  for (const cache of game.caches) cache.update(0.05, game);
  switched = unit.gatherTarget === second;
}
assert.equal(switched, true, 'unit should continue to another nearby cache');
assert.equal(unit.carrying, 1, 'unit should carry the last supply from the first cache');
assert.equal(unit._gatherReturning, false, 'unit must keep loading before returning');

const restored = Game.fromSaveData(game.toSaveData());
unit = restored.units[0];
assert.equal(unit.gatherTarget, restored.caches[1]);
assert.equal(unit.gatherCenter.x, first.x);

let returnedFull = false;
for (let i = 0; i < 2000 && !returnedFull; i++) {
  unit.update(0.05, restored);
  for (const cache of restored.caches) cache.update(0.05, restored);
  returnedFull = unit._gatherReturning;
}
assert.equal(returnedFull, true, 'unit should eventually head home');
assert.equal(unit.carrying, unit.carryCapacity, 'unit should return with a full load');

let unloaded = false;
for (let i = 0; i < 2000 && !unloaded; i++) {
  unit.update(0.05, restored);
  for (const cache of restored.caches) cache.update(0.05, restored);
  unloaded = unit.carrying === 0 && restored.supplies === unit.carryCapacity;
}
assert.equal(unloaded, true, 'unit should unload its full load');
assert.ok(unit.gatherCenter, 'unit should retain its gathering order for another trip');
assert.equal(unit._gatherReturning, false, 'unit should start another collection trip');
assert.equal(unit.gatherTarget, restored.caches[1], 'unit should return to the remaining cache');

const renderer = Object.create(Renderer.prototype);
const tower = new Building('tower', 20, 20);
const frontUnit = new Unit('soldier', (tower.tileX + tower.def.tileSize) * TILE + 20, tower.y);
const towerKey = (tower.tileX + tower.tileY + tower.def.tileSize * 2) * TILE;
assert.ok(frontUnit.x + frontUnit.y < towerKey, 'fixture exercises the old wrong draw order');
assert.ok(renderer._unitDrawKey({ buildings: [tower], caches: [] }, frontUnit) > towerKey,
  'front-adjacent unit should draw after the tower');

const hiddenUnit = new Unit('soldier', first.x, first.y);
const cam = { x: 0, y: 0, zoom: 1 };
const x0 = first.tileX * TILE, y0 = first.tileY * TILE;
const corners = [
  worldToScreen(x0, y0, cam), worldToScreen(x0 + TILE, y0, cam),
  worldToScreen(x0 + TILE, y0 + TILE, cam), worldToScreen(x0, y0 + TILE, cam),
];
const [n, e, s, w] = corners;
const cacheShell = [
  { x: n.x, y: n.y - 26 }, { x: e.x, y: e.y - 26 }, e, s, w,
  { x: w.x, y: w.y - 26 },
];
assert.equal(renderer._unitOcclusionAlpha({ camera: cam, units: [hiddenUnit], buildings: [], caches: [first] },
  cacheShell, (first.tileX + first.tileY + 2) * TILE), 0.42,
  'a supply block should fade when it covers a unit');

const rangeGame = new Game();
rangeGame.camera = cam;
rangeGame.fogExplored.fill(1);
const medic = new Unit('medic', 30 * TILE + 20, 30 * TILE + 20);
rangeGame.selected = [medic];
let highlighted = 0;
const drawCtx = {
  save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
  fill() { highlighted++; },
};
renderer._drawSupportRanges(drawCtx, rangeGame);
assert.equal(highlighted, 97, 'medic should highlight tiles inside its 5.5 tile radius');
medic.type = 'builder';
highlighted = 0;
renderer._drawSupportRanges(drawCtx, rangeGame);
assert.equal(highlighted, 97, 'builder should highlight tiles inside its 5.5 tile radius');
rangeGame.selected = [];
highlighted = 0;
renderer._drawSupportRanges(drawCtx, rangeGame);
assert.equal(highlighted, 0, 'unselected support units should not show a range');

const spacingGame = new Game();
spacingGame.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
spacingGame.units = Array.from({ length: 3 }, () => new Unit('soldier', 30 * TILE + 20, 30 * TILE + 20));
for (let i = 0; i < 250; i++) {
  for (const u of spacingGame.units) u.update(0.05, spacingGame);
}
const occupied = spacingGame.units.map(u => `${Math.floor(u.x / TILE)},${Math.floor(u.y / TILE)}`);
assert.equal(new Set(occupied).size, spacingGame.units.length,
  'idle units that share a tile should settle into separate adjacent tiles');

for (const olderArrives of [true, false]) {
  const arrivalGame = new Game();
  arrivalGame.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
  const destination = { x: 30 * TILE + 20, y: 30 * TILE + 20 };
  const arriver = olderArrives ? new Unit('soldier', destination.x - TILE, destination.y) : null;
  const incumbent = new Unit('soldier', destination.x, destination.y);
  const incoming = arriver || new Unit('soldier', destination.x - TILE, destination.y);
  arrivalGame.units = [incoming, incumbent];
  incoming.moveTo(destination.x, destination.y, arrivalGame);
  const activeGame = olderArrives ? Game.fromSaveData(arrivalGame.toSaveData()) : arrivalGame;
  const [activeIncoming, activeIncumbent] = activeGame.units;
  for (let i = 0; i < 150; i++) {
    for (const u of activeGame.units) u.update(0.05, activeGame);
  }
  assert.equal(Math.floor(activeIncumbent.x / TILE), 30,
    'the unit already occupying the destination should stay in its tile');
  assert.equal(Math.floor(activeIncumbent.y / TILE), 30,
    'the unit already occupying the destination should stay in its tile');
  assert.notEqual(`${Math.floor(activeIncoming.x / TILE)},${Math.floor(activeIncoming.y / TILE)}`, '30,30',
    'the arriving unit should take a neighboring tile');
}

console.log('gathering.test: all assertions passed');
