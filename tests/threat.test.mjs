// Run: node tests/threat.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { innerWidth: 1200, innerHeight: 900, location: {search:'?artPilot=off'} }, URLSearchParams });
for (const file of ['js/config.js', 'js/utils.js', 'js/pathfinding.js', 'js/entities.js', 'js/game.js', 'js/zombie-art.js', 'js/diorama-art.js', 'js/renderer.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), ctx, { filename: file });
}
const { Game, Building, Unit, Zombie, Projectile, Renderer, ZOMBIE_DEFS, TILE, MAP_W, MAP_H,
  WAVE_WARNING, SCREAMER_SPEED_FACTOR, SCREAMER_TRIGGER_RADIUS, FIRE_SPREAD_FACTOR,
  EXPLODER_BLAST_RADIUS, EXPLODER_SHOT_RADIUS } = vm.runInContext(
  '({ Game, Building, Unit, Zombie, Projectile, Renderer, ZOMBIE_DEFS, TILE, MAP_W, MAP_H, WAVE_WARNING, SCREAMER_SPEED_FACTOR, SCREAMER_TRIGGER_RADIUS, FIRE_SPREAD_FACTOR, EXPLODER_BLAST_RADIUS, EXPLODER_SHOT_RADIUS })', ctx);

function bareGame() {
  const game = new Game();
  game.tiles = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq', 39, 39)];
  game.fogVisible.fill(1);
  game.fogExplored.fill(1);
  return game;
}

const fireGame = bareGame();
const burning = new Zombie('walker', 600, 600);
const nearby = new Zombie('walker', 620, 600);
const nextHop = new Zombie('walker', 640, 600);
const distant = new Zombie('walker', 700, 600);
fireGame.zombies = [burning, nearby, nextHop, distant];
burning.ignite();
fireGame.spreadZombieFire();
assert.equal(nearby.burning, true, 'fire spreads to zombies in near contact');
assert.equal(nextHop.burning, false, 'newly lit zombies do not spread fire in the same tick');
assert.equal(distant.burning, false, 'fire does not jump across a gap');
assert.equal(nearby.burnTime, burning.burnTime * FIRE_SPREAD_FACTOR);
fireGame.spreadZombieFire();
assert.equal(nextHop.burning, true, 'fire can continue across a close group');
assert.ok(nextHop.burnTime < nearby.burnTime, 'each spread hop has a shorter burn');
for (let i = 0; i < 140; i++) fireGame.update(0.05);
assert.ok(fireGame.zombies.every(z => !z.burning), 'neighboring zombies must not keep each other burning forever');

for (let wave = 1; wave <= 20; wave++) {
  const game = bareGame();
  game.waveNum = wave - 1;
  game._scheduleWave();
  for (const [type, firstWave] of [['spitter', 4], ['exploder', 6], ['screamer', 8]]) {
    assert.equal(game.zombiesToSpawn.includes(type), wave >= firstWave,
      `${type} introduction should be wave ${firstWave}, checked at wave ${wave}`);
  }
  const bosses = wave >= 10 && wave % 5 === 0 ? wave / 5 - 1 : 0;
  assert.equal(game.zombiesToSpawn.filter(type => type === 'boss').length, bosses,
    `boss count at wave ${wave}`);
}

const warning = bareGame();
warning.waveNum = 5;
warning.waveTimer = WAVE_WARNING + 0.05;
warning.update(0.1);
assert.equal(warning.waveDirections.length, 2, 'wave 6 should warn of two approach edges');
assert.notEqual(warning.waveDirections[0], warning.waveDirections[1]);
assert.match(warning.toasts.at(-1).text, /approaching from/);
const prepared = [...warning.waveDirections];
const restored = Game.fromSaveData(warning.toSaveData());
assert.deepEqual([...restored.waveDirections], prepared, 'warning directions survive save/load');
restored.waveTimer = 0;
restored.update(0.05);
assert.deepEqual([...restored.waveDirections], prepared, 'scheduled wave uses advertised edges');
const margin = TILE * 2;
for (let i = 0; i < 4; i++) {
  restored._spawnZombieFromEdge('walker');
  const z = restored.zombies.at(-1);
  const side = prepared[i % prepared.length];
  assert.equal(side === 0 ? z.y : side === 1 ? z.x : side === 2 ? z.y : z.x,
    side === 0 || side === 3 ? margin : side === 1 ? MAP_W * TILE - margin : MAP_H * TILE - margin);
  assert.equal(z.maxHp, ZOMBIE_DEFS.walker.maxHp, 'wave HP must stay at type base HP');
}
const oldScaledSave = restored.toSaveData();
oldScaledSave.zombies[0].maxHp = ZOMBIE_DEFS.walker.maxHp * 2;
oldScaledSave.zombies[0].hp = ZOMBIE_DEFS.walker.maxHp;
const normalizedSave = Game.fromSaveData(oldScaledSave);
assert.equal(normalizedSave.zombies[0].maxHp, ZOMBIE_DEFS.walker.maxHp,
  'old scaled saves should normalize to base HP');
assert.equal(normalizedSave.zombies[0].hp, ZOMBIE_DEFS.walker.maxHp / 2,
  'old scaled saves should preserve the current health fraction');
assert.equal(normalizedSave.waveSpawnIndex, restored.waveSpawnIndex);

const spitterGame = bareGame();
const wall = new Building('wall', 25, 25);
spitterGame.buildings.push(wall);
const spitter = new Zombie('spitter', wall.x - 90, wall.y);
spitter.atkTarget = wall;
spitterGame.zombies = [spitter];
spitter.update(0.1, spitterGame);
assert.equal(spitterGame.projectiles.length, 1, 'spitter should lob from outside melee range');
assert.equal(spitterGame.projectiles[0].source, 'acid');
for (let i = 0; i < 20 && !spitterGame.projectiles[0].dead; i++) spitterGame.projectiles[0].update(0.05);
assert.ok(wall.hp < wall.maxHp, 'acid should strike a building across open space');
assert.equal(Game.fromSaveData(spitterGame.toSaveData()).zombies[0].maxHp, spitter.maxHp);

const blastGame = bareGame();
const blastWall = new Building('wall', 25, 25);
blastGame.buildings.push(blastWall);
const exploder = new Zombie('exploder', blastWall.x + blastWall.width / 2 + 5, blastWall.y);
blastGame.zombies = [exploder];
exploder.update(0.05, blastGame);
assert.equal(exploder.dead, true);
assert.equal(exploder.exploded, true);
assert.equal(blastWall.hp, blastWall.maxHp - 220);

const unitGame = bareGame();
const contactUnit = new Unit('soldier', 600, 600);
const unitExploder = new Zombie('exploder', 600 + contactUnit.def.radius + 5, 600);
unitExploder.atkTarget = contactUnit;
unitGame.units = [contactUnit];
unitGame.zombies = [unitExploder];
unitExploder.update(0.05, unitGame);
assert.equal(unitExploder.exploded, true, 'exploder should detonate on the unit it reaches');
assert.equal(contactUnit.hp, contactUnit.maxHp - 35, 'contact detonation keeps its point-blank unit damage');
assert.equal(unitGame.threatEffects.at(-1).radius, EXPLODER_BLAST_RADIUS,
  'contact detonation keeps the original blast size');

const shotGame = bareGame();
const early = new Zombie('exploder', 800, 800);
const nearBlast = new Unit('soldier', 810, 800);
const midBlast = new Unit('soldier', 890, 800);
const edgeBlast = new Unit('soldier', 965, 800);
const outsideBlast = new Unit('soldier', 1000, 800);
shotGame.units = [nearBlast, midBlast, edgeBlast, outsideBlast];
shotGame.zombies = [early];
early.takeDamage(early.maxHp);
shotGame.update(0.05);
const nearDamage = nearBlast.maxHp - nearBlast.hp;
const midDamage = midBlast.maxHp - midBlast.hp;
const edgeDamage = edgeBlast.maxHp - edgeBlast.hp;
assert.ok(EXPLODER_SHOT_RADIUS > EXPLODER_BLAST_RADIUS,
  'shooting an exploder should make a wider blast than contact detonation');
assert.equal(shotGame.threatEffects.at(-1).radius, EXPLODER_SHOT_RADIUS);
assert.ok(nearDamage > midDamage && midDamage > edgeDamage && edgeDamage > 0,
  'shot blast damage should fall with distance');
assert.equal(outsideBlast.hp, outsideBlast.maxHp, 'entities outside the shot blast take no damage');
assert.ok(!shotGame.zombies.includes(early));

const screamerGame = bareGame();
const screamer = new Zombie('screamer', 600, 600);
const walker = new Zombie('walker', 640, 600);
walker.dormant = true;
screamerGame.zombies = [screamer, walker];
assert.equal(screamerGame.zombieSpeed(walker), walker.def.speed * SCREAMER_SPEED_FACTOR);
screamer.update(0.05, screamerGame);
assert.equal(walker.dormant, true, 'a screamer must stay quiet without human units');
assert.equal(screamerGame.threatEffects.length, 0);
const targetUnit = new Unit('soldier', 600 + SCREAMER_TRIGGER_RADIUS + TILE, 600);
screamerGame.units = [targetUnit];
screamer.update(0.05, screamerGame);
assert.equal(walker.dormant, true, 'a human outside the trigger range must not cause a shriek');
assert.equal(screamerGame.threatEffects.length, 0);
targetUnit.x = 650;
targetUnit.y = 610;
screamer.update(0.05, screamerGame);
assert.equal(walker.dormant, false);
assert.equal(walker.atkTarget, targetUnit);
assert.equal(screamerGame.threatEffects.at(-1).kind, 'shriek');
targetUnit.x = 2000;
targetUnit.y = 2000;
screamer.update(8.1, screamerGame);
assert.equal(screamerGame.threatEffects.length, 1,
  'a ready screamer should not shriek after the human leaves');
const shriekSave = Game.fromSaveData(screamerGame.toSaveData());
assert.equal(shriekSave.zombies[0].shriekCooldown, screamer.shriekCooldown);

const boss = new Zombie('boss', 300, 300);
const towerShot = new Projectile(0, 0, boss, 100, 350, '#ffdd44', 'tower');
towerShot.x = boss.x; towerShot.y = boss.y;
towerShot.update(0.05);
assert.equal(boss.hp, boss.maxHp - 75, 'boss should resist a quarter of tower damage');
boss.takeDamage(100, 'unit');
assert.equal(boss.hp, boss.maxHp - 175, 'soldier damage should not be resisted');

let drawCalls = 0;
const paint = new Proxy({ globalAlpha: 1 }, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: text.length * 7 });
    if (key === 'createRadialGradient' || key === 'createLinearGradient') {
      return () => ({ addColorStop() {} });
    }
    return () => { drawCalls++; };
  },
  set(target, key, value) { target[key] = value; return true; },
});
const canvas = () => ({ width: 0, height: 0, getContext: () => paint });
ctx.document = { createElement: () => canvas() };
const renderer = new Renderer(canvas());
const renderGame = bareGame();
renderGame.waveDirections = [0, 2];
renderGame.waveTimer = 10;
renderGame.zombies = ['spitter', 'exploder', 'screamer', 'boss']
  .map((type, i) => new Zombie(type, 1450 + i * 25, 1450));
renderGame.threatEffects = [
  { x: 1450, y: 1450, radius: 100, kind: 'shriek', t: 0.2, life: 0.75 },
  { x: 1500, y: 1450, radius: 80, kind: 'blast', t: 0.1, life: 0.55 },
];
renderer.render(renderGame, {
  mouseX: 600, mouseY: 450, menuOpen: false, mouseTile: null, selectBox: null,
  _inEdgeZone: () => false,
});
assert.ok(drawCalls > 100, 'warning and threat scene should render without throwing');

console.log('threat.test: all assertions passed');
