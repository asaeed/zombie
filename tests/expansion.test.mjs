// Run: node tests/expansion.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { innerWidth: 1200, innerHeight: 900 } });
for (const file of ['js/config.js', 'js/utils.js', 'js/pathfinding.js', 'js/entities.js', 'js/game.js', 'js/renderer.js', 'js/input.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), ctx, { filename: file });
}
const { Game, Unit, Zombie, Building, Projectile, Renderer, InputHandler, UNIT_DEFS, TILE, MAP_W, MAP_H,
  DAY_LENGTH, FIRE_DURATION, TORCH_LIGHT_RADIUS, buildButtonRects, bottomPanelHeight,
  productionButtonRects, worldToScreen, centerCameraOn } = vm.runInContext(
  '({ Game, Unit, Zombie, Building, Projectile, Renderer, InputHandler, UNIT_DEFS, TILE, MAP_W, MAP_H, DAY_LENGTH, FIRE_DURATION, TORCH_LIGHT_RADIUS, buildButtonRects, bottomPanelHeight, productionButtonRects, worldToScreen, centerCameraOn })', ctx);

function bareGame() {
  const game = new Game();
  game.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
  game.fogVisible.fill(1);
  game.fogExplored.fill(1);
  game.buildings = [new Building('hq', 39, 39)];
  game.supplies = 5000;
  game._rebuildFlowField();
  return game;
}

const production = bareGame();
const barracks = production._addBuilding('barracks', 32, 32);
assert.equal(production.trainUnit(barracks, 'medic'), false);
for (const type of ['sniper', 'heavy', 'torchbearer']) {
  assert.equal(production.trainUnit(barracks, type), false, `${type} needs a mechanics bay`);
}
const clinic = production._addBuilding('clinic', 29, 29);
assert.equal(production.trainUnit(barracks, 'medic'), true);
clinic.dead = true;
barracks.update(UNIT_DEFS.medic.trainTime + 1, production);
assert.equal(barracks.trainQueue[0], 'medic', 'training pauses when the clinic is destroyed');
clinic.dead = false;
barracks.update(UNIT_DEFS.medic.trainTime + 1, production);
assert.ok(production.units.some(u => u.type === 'medic'));
const bay = production._addBuilding('mechanics', 27, 27);
for (const type of ['sniper', 'heavy', 'torchbearer']) {
  assert.equal(production.trainUnit(barracks, type), true);
}

const legacySniperGame = bareGame();
const legacyBarracks = legacySniperGame._addBuilding('barracks', 32, 32);
legacyBarracks.trainQueue = ['sniper'];
const legacySniper = legacySniperGame.spawnUnit('sniper', 700, 700);
const legacySniperSave = legacySniperGame.toSaveData();
legacySniperSave.units.find(unit => unit.id === legacySniper.id).type = 'marksman';
legacySniperSave.buildings.find(building => building.id === legacyBarracks.id).trainQueue = ['marksman'];
const migratedSniperGame = Game.fromSaveData(legacySniperSave);
assert.equal(migratedSniperGame.units.find(unit => unit.id === legacySniper.id).type, 'sniper',
  'legacy marksman units migrate to the sniper type');
assert.deepEqual([...migratedSniperGame.buildings.find(building => building.id === legacyBarracks.id).trainQueue],
  ['sniper'], 'legacy marksman training queues migrate to sniper');
assert.ok(!JSON.stringify(migratedSniperGame.toSaveData()).includes('marksman'),
  'new saves only persist the sniper type');

assert.equal(production.buildVehicle(bay), true);
bay.update(21, production);
assert.equal(production.vehicles.length, 1);
const suv = production.vehicles[0];
assert.equal(suv.type, 'suv');
assert.equal(suv.passengers.length, 0);

const boarding = bareGame();
const vehicle = boarding.spawnVehicle('suv', 700, 700);
const riders = Array.from({ length: 5 }, (_, i) => boarding.spawnUnit('soldier', 700 + i, 700));
for (const u of riders.slice(0, 4)) assert.equal(u.boardVehicle(vehicle, boarding), true);
assert.equal(riders[4].boardVehicle(vehicle, boarding), false, 'armored truck holds exactly four units');
for (const u of riders.slice(0, 4)) u.update(0.05, boarding);
assert.equal(vehicle.passengers.length, 4);
assert.ok(riders.slice(0, 4).every(u => u.vehicle === vehicle));
riders[4].x = 200; riders[4].y = 200;
const roadsideZombie = new Zombie('walker', vehicle.x + 80, vehicle.y);
boarding.zombies = [roadsideZombie];
boarding.update(0.05);
assert.equal(boarding.projectiles.length, 4, 'all four armed passengers shoot from a stationary armored truck');
assert.ok(riders.slice(0, 4).every(u => u.vehicle === vehicle && u.hp === u.maxHp));
assert.equal(vehicle.moveTo(900, 700, boarding), true);
boarding.update(0.05);
assert.ok(riders.slice(0, 4).every(u => u.x === vehicle.x && u.y === vehicle.y),
  'passengers fire from the moving vehicle position');
riders.slice(0, 4).forEach(u => { u.atkCooldown = 0; });
boarding.projectiles = [];
boarding.update(0.05);
assert.equal(boarding.projectiles.length, 4, 'passengers keep firing while the armored truck drives');
for (const projectile of boarding.projectiles) projectile.update(0.5);
assert.ok(roadsideZombie.hp < roadsideZombie.maxHp, 'passenger shots damage zombies');
const protectedHp = riders[0].hp;
riders[0].takeDamage(25);
assert.equal(riders[0].hp, protectedHp, 'passengers take no direct damage while aboard');
const acid = new Projectile(690, 700, riders[0], 20);
acid.update(0.1);
assert.equal(acid.target, vehicle, 'shots in flight transfer to the armored truck when a unit boards');
const pursuer = new Zombie('walker', 710, 700);
pursuer.atkTarget = riders[0];
boarding.zombies = [pursuer];
pursuer.update(0.1, boarding);
assert.equal(pursuer.atkTarget, vehicle, 'zombies pursue the armored truck, not its passengers');
const saved = Game.fromSaveData(boarding.toSaveData());
assert.equal(saved.vehicles[0].passengers.length, 4);
assert.ok(saved.vehicles[0].passengers.every(u => u.vehicle === saved.vehicles[0]));
assert.ok(saved.vehicles[0].passengers.every(u => u.atkCooldown > 0),
  'passenger firing cooldowns survive a save and reload');
assert.equal(saved.selectedVehicle, saved.vehicles[0]);
const beforeHp = saved.vehicles[0].passengers.map(u => u.hp);
saved.vehicles[0].takeDamage(saved.vehicles[0].maxHp);
saved.update(0.05);
assert.equal(saved.vehicles.length, 0);
assert.ok(saved.units.slice(0, 4).every((u, i) => !u.vehicle && !u.dead && u.hp === beforeHp[i]),
  'armored truck destruction must release passengers without damaging them');
assert.ok(saved.units.slice(0, 4).every(u => saved.canOccupyGround(u.x, u.y, u.def.radius)));

const mixedCrew = bareGame();
const crewSuv = mixedCrew.spawnVehicle('suv', 700, 700);
for (const type of ['sniper', 'torchbearer', 'heavy', 'medic']) {
  assert.equal(mixedCrew.boardUnit(mixedCrew.spawnUnit(type, 700, 700), crewSuv), true);
}
const closeZombie = new Zombie('walker', 740, 700);
mixedCrew.zombies = [closeZombie];
mixedCrew.update(0.05);
assert.equal(mixedCrew.projectiles.length, 1, 'sniper shoots, while heavy and medic do not attack from the cabin');
assert.ok(closeZombie.burning, 'torchbearer can ignite a zombie from the armored truck');
assert.ok(closeZombie.hp < closeZombie.maxHp);

const melee = bareGame();
assert.equal(UNIT_DEFS.sniper.name, 'Sniper', 'the internal and displayed names both use sniper');
assert.equal(UNIT_DEFS.sniper.atkRange, 390, 'sniper range is 50% longer than the original 260');
assert.equal(UNIT_DEFS.sniper.color, '#54c76c', 'sniper uses green');
assert.equal(UNIT_DEFS.heavy.color, '#373c40', 'heavy uses darker grey');
assert.equal(UNIT_DEFS.builder.color, '#ed8128', 'builder uses orange');
assert.equal(UNIT_DEFS.torchbearer.color, '#e8d12b', 'torchbearer uses yellow');
const spriteRenderer = Object.create(Renderer.prototype);
const spriteCalls = type => {
  const calls = [];
  const paint = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push({ method: key, args, fillStyle: target.fillStyle });
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  spriteRenderer._drawUnit(paint, { camera: { x: 0, y: 0, zoom: 1 } }, new Unit(type, 200, 200));
  return calls;
};
assert.equal(spriteCalls('sniper').filter(call => call.method === 'lineTo').length, 0,
  'sniper sprite has no line accessory');
assert.equal(spriteCalls('heavy').filter(call => call.method === 'lineTo').length, 0,
  'heavy sprite has no line accessory');
assert.equal(spriteCalls('torchbearer').filter(call => call.method === 'arc').length, 2,
  'torchbearer has no yellow tip circle');
assert.equal(spriteCalls('medic').filter(call => call.method === 'fillRect' && call.fillStyle === '#ffffff').length, 2,
  'medic center uses two clean bars for its cross');
const heavy = melee.spawnUnit('heavy', 200, 200);
const front = new Zombie('walker', 240, 200);
const nextToIt = new Zombie('walker', 239, 220);
const behind = new Zombie('walker', 160, 200);
melee.zombies = [front, nextToIt, behind];
heavy._attackZombie(front, melee);
assert.ok(front.hp < front.maxHp && nextToIt.hp < nextToIt.maxHp);
assert.equal(behind.hp, behind.maxHp, 'cleave should cover a forward swing, not the rear');
const torch = melee.spawnUnit('torchbearer', 250, 250);
const victim = new Zombie('walker', 300, 250);
melee.zombies = [victim];
torch._attackZombie(victim, melee);
assert.equal(victim.burnTime, FIRE_DURATION);
melee.gameTime = DAY_LENGTH + 20;
assert.equal(melee.visionRadius('torchbearer'), TORCH_LIGHT_RADIUS,
  'torchbearer stays a useful light source at night');

const walls = bareGame();
walls._addBuilding('wall', 20, 20);
walls._addBuilding('wall', 21, 21);
walls._rebuildFlowField();
assert.equal(walls.flowField[20][20], null);
assert.equal(walls.flowField[39][39], null, 'HQ tiles are not flow-field destinations');
const cornerZombie = new Zombie('walker', 20 * TILE + TILE / 2, 21 * TILE + TILE / 2);
walls.moveGroundEntity(cornerZombie, TILE, -TILE);
assert.equal(Math.floor(cornerZombie.x / TILE), 20, 'diagonally touching walls block the corner');
assert.equal(Math.floor(cornerZombie.y / TILE), 21);
const blockedZombie = new Zombie('runner', 20 * TILE - 35, 20 * TILE + TILE / 2);
walls.moveGroundEntity(blockedZombie, 100, 0);
assert.ok(blockedZombie.x < 20 * TILE, 'zombies cannot enter wall tiles even in a long step');
assert.ok(walls.canOccupyGround(blockedZombie.x, blockedZombie.y, blockedZombie.def.radius));
walls.zombies = [blockedZombie];
assert.equal(walls.canPlaceBuilding('wall', 19, 20), false, 'cannot place a wall onto a zombie');

for (const width of [390, 800, 1200]) {
  ctx.window.innerWidth = width;
  const rects = buildButtonRects(width, 900);
  assert.equal(rects.length, 7);
  assert.ok(rects.every(rc => rc.x >= 0 && rc.x + rc.w <= width &&
    rc.y >= 900 - bottomPanelHeight(width) && rc.y + rc.h <= 900));
  const trainRects = productionButtonRects(barracks, production.camera);
  assert.equal(trainRects.length, 7);
  assert.ok(trainRects.every(rc => rc.x >= 0 && rc.x + rc.w <= width));
}
ctx.window.innerWidth = 390;
const mobileMap = vm.runInContext('minimapRect(390, 900, true)', ctx);
const selectionTop = 900 - bottomPanelHeight(390) - 86 - 8;
assert.ok(mobileMap.y + mobileMap.h < selectionTop, 'mobile minimap stays above selection panel');

const siege = bareGame();
const hq = siege.buildings[0];
const attacker = new Zombie('walker', hq.x - 220, hq.y);
siege.zombies = [attacker];
let struck = false;
for (let i = 0; i < 500; i++) {
  attacker.update(0.05, siege);
  assert.ok(siege.canOccupyGround(attacker.x, attacker.y, attacker.def.radius),
    'zombie movement must never enter an intact structure');
  if (hq.hp < hq.maxHp) { struck = true; break; }
}
assert.ok(struck, 'zombies must still be able to attack the building they cannot enter');

const cornerSiege = bareGame();
const cornerHq = cornerSiege.buildings[0];
const cornerAttacker = new Zombie('walker', cornerHq.x + cornerHq.width / 2 + 9,
  cornerHq.y + cornerHq.height / 2 + 9);
cornerSiege.zombies = [cornerAttacker];
assert.ok(cornerSiege.canOccupyGround(cornerAttacker.x, cornerAttacker.y, cornerAttacker.def.radius));
cornerAttacker.dormant = true;
cornerAttacker.takeDamage(1);
assert.equal(cornerAttacker.dormant, false, 'a sniper hit wakes a dormant zombie');
cornerAttacker.update(0.05, cornerSiege);
assert.ok(cornerHq.hp < cornerHq.maxHp,
  'a zombie beside a structure corner must attack its edge instead of standing idle');

const narrowApproach = bareGame();
narrowApproach.buildings = [new Building('hq', 23, 20)];
narrowApproach.tiles[19][21] = 2;
narrowApproach._rebuildFlowField();
const laneZombie = new Zombie('walker', 20 * TILE + 20, 20 * TILE + 8);
narrowApproach.zombies = [laneZombie];
assert.ok(narrowApproach.canOccupyGround(laneZombie.x, laneZombie.y, laneZombie.def.radius));
for (let i = 0; i < 80; i++) laneZombie.update(0.05, narrowApproach);
assert.ok(laneZombie.x > 21 * TILE,
  'flow-field movement must center an off-axis zombie enough to clear an obstacle corner');

const edge = bareGame();
edge.waveDirections = [0];
edge.tiles[2].fill(2);
edge._spawnZombieFromEdge('walker');
assert.equal(edge.zombies.length, 1);
assert.ok(edge.canOccupyGround(edge.zombies[0].x, edge.zombies[0].y, edge.zombies[0].def.radius),
  'wave spawns must avoid obstructed edge tiles');

const depthGame = bareGame();
const depthBuilding = depthGame.buildings[0];
const behindZombie = new Zombie('walker', depthBuilding.tileX * TILE - TILE / 2, depthBuilding.y);
const frontZombie = new Zombie('walker', (depthBuilding.tileX + depthBuilding.def.tileSize) * TILE + TILE / 2, depthBuilding.y);
depthGame.zombies = [behindZombie, frontZombie];
depthGame.tileVisible = () => true;
const drawOrder = [];
const depthRenderer = Object.create(Renderer.prototype);
depthRenderer._drawBuilding = () => drawOrder.push('building');
depthRenderer._drawZombie = (_ctx, _game, zombie) => drawOrder.push(zombie === frontZombie ? 'front' : 'behind');
depthRenderer._drawEntities({}, depthGame);
assert.deepEqual(drawOrder, ['behind', 'building', 'front'],
  'zombies in front of a building must draw over its wall');

const overrunRenderer = Object.create(Renderer.prototype);
overrunRenderer.W = 390;
overrunRenderer.H = 900;
let restartDraws = 0;
overrunRenderer._drawRestartButton = () => restartDraws++;
const overrunCanvas = new Proxy({}, { get: () => () => {} });
overrunRenderer._drawGameOver(overrunCanvas);
assert.equal(restartDraws, 1, 'Overrun screen displays a restart button');
const overrunInput = Object.create(InputHandler.prototype);
overrunInput.game = { status: 'gameover' };
overrunInput.keys = {};
overrunInput.menuOpen = false;
overrunInput._handleMainMenuClick = () => false;
let restarts = 0;
overrunInput.menuActions = { newGame: () => { restarts++; return {}; } };
ctx.window.innerWidth = 390;
ctx.window.innerHeight = 900;
const restartRect = vm.runInContext('endScreenButtonRect(390, 900)', ctx);
overrunInput._onMouseDown({ button: 0, clientX: restartRect.x + 5, clientY: restartRect.y + 5 });
assert.equal(restarts, 1, 'clicking the Overrun button starts a new game');
overrunInput._onKeyDown({ code: 'Enter' });
assert.equal(restarts, 2, 'Enter also restarts from Overrun');

ctx.window.innerWidth = 1200;
centerCameraOn(boarding.camera, vehicle.x, vehicle.y, 1200, 900);
boarding.selectedVehicle = null;
const handler = Object.create(InputHandler.prototype);
handler.game = boarding;
handler.canvas = { style: {} };
handler._handleMainMenuClick = () => false;
handler.attackMoveArm = false;
handler.flareArm = false;
handler._clickHandled = false;
const vehicleScreen = worldToScreen(vehicle.x, vehicle.y, boarding.camera);
handler._onMouseDown({ button: 0, clientX: vehicleScreen.x, clientY: vehicleScreen.y - vehicle.def.radius });
assert.equal(boarding.selectedVehicle, vehicle, 'vehicle should be selectable from its visible body');
const action = vm.runInContext('vehicleUnloadRect(1200, 900)', ctx);
handler._onMouseDown({ button: 0, clientX: action.x + 5, clientY: action.y + 5 });
assert.equal(vehicle.passengers.length, 0, 'Unload button should release passengers');
assert.ok(riders.slice(0, 4).every(u => u.vehicle === null));

let draws = 0;
const paint = new Proxy({ globalAlpha: 1 }, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => { draws++; };
  },
  set(target, key, value) { target[key] = value; return true; },
});
const canvas = () => ({ width: 0, height: 0, getContext: () => paint });
ctx.document = { createElement: () => canvas() };
const renderer = new Renderer(canvas());
renderer.render(boarding, { mouseX: 600, mouseY: 450, menuOpen: false, mouseTile: null,
  selectBox: null, _inEdgeZone: () => false });
assert.ok(draws > 100, 'vehicle scene should render without throwing');

console.log('expansion.test: all assertions passed');
