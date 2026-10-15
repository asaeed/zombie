import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const window = {innerWidth:1440, innerHeight:1000, addEventListener() {}};
const context = vm.createContext({window});
for (const file of ['config', 'utils', 'pathfinding', 'entities', 'game', 'renderer', 'input']) {
  vm.runInContext(readFileSync(new URL(`js/${file}.js`, root), 'utf8'), context, {filename:`js/${file}.js`});
}
const {Game, Unit, Zombie, Building, Vehicle, Projectile, Renderer, InputHandler,
  MAP_W, MAP_H, TILE, UNIT_DEFS, VEHICLE_DEFS, BUILDING_DEFS, FLARE_COST, REPAIR_TICK_COST,
  productionPopupLayout, productionButtonRects, activityPanelRects, buildButtonRects, bottomPanelHeight} =
  vm.runInContext('({Game, Unit, Zombie, Building, Vehicle, Projectile, Renderer, InputHandler, MAP_W, MAP_H, TILE, UNIT_DEFS, VEHICLE_DEFS, BUILDING_DEFS, FLARE_COST, REPAIR_TICK_COST, productionPopupLayout, productionButtonRects, activityPanelRects, buildButtonRects, bottomPanelHeight})', context);

function fixture() {
  window.innerWidth = 1440; window.innerHeight = 1000;
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  game.fogVisible.fill(1); game.fogExplored.fill(1);
  game.buildings = [new Building('hq', 30, 30), new Building('barracks', 40, 40), new Building('mechanics', 44, 40)];
  game.supplies = 5000;
  return game;
}
const plain = value => JSON.parse(JSON.stringify(value));
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('attack notices are immediate, throttled by individual and type, and deaths are never suppressed', () => {
  const g = fixture(), a = new Unit('scout', 600, 600), b = new Unit('scout', 650, 600);
  g.units = [a, b];
  g.damageEntity(a, 1);
  assert.equal(g.activity.at(-1).text, 'Scout is under attack');
  for (let i = 0; i < 15; i++) g.damageEntity(a, 1);
  g.damageEntity(b, 1);
  assert.equal(g.activity.length, 1);
  g.gameTime = 6; g.damageEntity(a, 1);
  assert.equal(g.activity.length, 1, 'same individual is quiet for 20 seconds');
  g.damageEntity(b, 1);
  assert.equal(g.activity.length, 2, 'another scout can report after the type cooldown');
  g.gameTime = 21; g.damageEntity(a, 1);
  assert.equal(g.activity.length, 3);
  g.damageEntity(a, 1000); g.onEntityDied(a); g.update(.01);
  assert.equal(g.activity.at(-1).text, 'Scout has fallen');
  assert.equal(g.stats.humansLost, 1);
});

test('zombie melee, acid projectiles, and explosions all report human damage and casualties', () => {
  for (const attack of ['melee', 'acid', 'blast']) {
    const g = fixture(), u = new Unit('scout', 600, 600);
    g.units = [u];
    if (attack === 'melee') {
      const z = new Zombie('walker', 610, 600); z.atkTarget = u;
      z.update(.01, g);
    } else if (attack === 'acid') {
      new Projectile(600, 600, u, 12, 180, '#a6e54a', 'acid').update(.01, g);
    } else g.explodeZombie(600, 600, false);
    assert.equal(g.activity.at(-1).text, 'Scout is under attack', attack);
    u.hp = 1;
    if (attack === 'acid') {
      g.projectiles.push(new Projectile(600, 600, u, 12, 180, '#a6e54a', 'acid'));
      g.update(.01);
    } else {
      g.explodeZombie(600, 600, false); g.update(.01);
    }
    assert.equal(g.stats.humansLost, 1, attack);
    assert.equal(g.activity.at(-1).text, 'Scout has fallen', attack);
  }
});

test('all zombie deaths count once, whether reported by a projectile or cleanup', () => {
  const g = fixture();
  const a = new Zombie('walker', 600, 600), b = new Zombie('runner', 620, 600);
  g.zombies = [a, b];
  new Projectile(a.x, a.y, a, 1000).update(.01, g);
  b.takeDamage(1000);
  g.onEntityDied(a); g.update(.01); g.update(.01);
  assert.equal(g.stats.zombiesKilled, 2);
  assert.equal(g.score, (a.def.reward + b.def.reward) * 10);
});

test('a lethal building strike reports safely when death handling clears zombie targets', () => {
  const g = fixture(), b = g.buildings[1];
  const z = new Zombie('walker', b.x, b.y + b.height / 2 + 10);
  b.hp = 1; z.atkTarget = b; g.zombies = [z];
  assert.doesNotThrow(() => z.update(.01, g));
  assert.equal(b.dead, true); assert.equal(z.atkTarget, null);
  assert.equal(g.stats.buildingsDestroyed, 1);
  g.update(.01);
  assert.equal(g.stats.buildingsDestroyed, 1);
});

test('destroyed structures count once; sales never count as losses, even across a save', () => {
  const g = fixture(), destroyed = g.buildings[1], sold = g.buildings[2];
  g.damageEntity(destroyed, 10000);
  g.sellBuilding(sold); g.sellBuilding(sold);
  const restored = Game.fromSaveData(g.toSaveData());
  restored.update(.01);
  assert.equal(restored.stats.buildingsDestroyed, 1);
  assert.equal(restored.activity.filter(e => e.text === 'Barracks destroyed').length, 1);
  assert.equal(restored.activity.filter(e => e.text === 'Mechanics Bay sold').length, 1);
});

test('losing a truck records its loss without counting surviving passengers as human deaths', () => {
  const g = fixture(), v = new Vehicle('suv', 600, 600), u = new Unit('soldier', 600, 600);
  g.vehicles = [v]; g.units = [u]; g.boardUnit(u, v);
  g.damageEntity(u, 10000);
  assert.equal(g.activity.length, 0, 'passengers cannot be directly damaged');
  g.damageEntity(v, 10000); g.update(.01);
  assert.equal(g.stats.humansLost, 0); assert.equal(u.dead, false); assert.equal(u.vehicle, null);
  assert.ok(g.activity.some(e => e.text === 'Armored Truck destroyed'));
});

test('construction, training, vehicles, flares and repairs all contribute to spending', () => {
  const g = fixture(), before = g.supplies;
  assert.equal(g.placeBuilding('wall', 10, 10), true);
  assert.equal(g.trainUnit(g.buildings[1], 'soldier'), true);
  assert.equal(g.buildVehicle(g.buildings[2]), true);
  assert.equal(g.throwFlare(600, 600), true);
  const wall = g.buildings.at(-1); wall.hp -= 30;
  const builder = new Unit('builder', wall.x, wall.y + TILE);
  builder._repairBuilding(.01, g, wall);
  const spent = BUILDING_DEFS.wall.cost + UNIT_DEFS.soldier.cost + VEHICLE_DEFS.suv.cost + FLARE_COST + REPAIR_TICK_COST;
  assert.equal(g.stats.suppliesSpent, spent); assert.equal(g.supplies, before - spent);
  const recorded = g.stats.suppliesSpent;
  g.addSupplies(10); g.spendSupplies(-1); g.spendSupplies(Infinity); g.spendSupplies(1000000);
  assert.equal(g.stats.suppliesSpent, recorded);
  g.supplies = 0;
  assert.equal(g.trainUnit(g.buildings[1], 'soldier'), false);
  assert.equal(g.buildVehicle(g.buildings[2]), false);
  assert.equal(g.stats.suppliesSpent, recorded);
});

test('activity is bounded, toasts are deduplicated, and stats/feed survive save and load', () => {
  const g = fixture();
  for (let i = 0; i < 60; i++) { g.gameTime = i; g.addActivity(`Event ${i}`); }
  assert.equal(g.activity.length, 40);
  g.addToast('Wave 4 begins', 'danger', 'wave', 10);
  g.addToast('Wave 4 begins', 'danger', 'wave', 10);
  assert.equal(g.activity.filter(e => e.text === 'Wave 4 begins').length, 1);
  g.stats.zombiesKilled = 123; g.spendSupplies(50);
  const snapshot = g.toSaveData(), restored = Game.fromSaveData(snapshot);
  assert.deepEqual(plain(restored.stats), plain(g.stats));
  assert.deepEqual(plain(restored.activity), plain(g.activity));
  restored.addActivity('Independent'); restored.stats.humansLost++;
  assert.notEqual(restored.activity.at(-1).text, snapshot.activity.at(-1).text);
  assert.equal(snapshot.stats.humansLost, 0);
});

test('older saves start new counters without inventing historical losses or spending', () => {
  const snapshot = fixture().toSaveData(); delete snapshot.stats; delete snapshot.activity;
  const restored = Game.fromSaveData(snapshot);
  assert.deepEqual(plain(restored.stats), {zombiesKilled:0, humansLost:0, buildingsDestroyed:0, suppliesSpent:0});
  assert.equal(restored.activity.length, 0);
});

test('canceling waiting units refunds immediately and preserves current progress and queue order', () => {
  const g = fixture(), b = g.buildings[1], initial = g.supplies;
  for (const type of ['soldier', 'scout', 'builder']) g.trainUnit(b, type);
  b.trainProgress = 4;
  assert.equal(g.cancelProduction(b, 1), true);
  assert.deepEqual(plain(b.trainQueue), ['soldier', 'builder']);
  assert.equal(b.trainProgress, 4);
  assert.equal(g.supplies, initial - UNIT_DEFS.soldier.cost - UNIT_DEFS.builder.cost);
  assert.equal(g.stats.suppliesSpent, UNIT_DEFS.soldier.cost + UNIT_DEFS.builder.cost);
  for (const index of [-1, .5, 99]) assert.equal(g.cancelProduction(b, index), false);
});

test('canceling current training starts the next unit at zero, with a full refund even above storage cap', () => {
  const g = fixture(), b = g.buildings[1];
  g.trainUnit(b, 'soldier'); g.trainUnit(b, 'scout'); b.trainProgress = 7.99;
  const before = g.supplies;
  assert.ok(before > g.storageCap());
  assert.equal(g.cancelProduction(b, 0), true);
  assert.equal(g.supplies, before + UNIT_DEFS.soldier.cost);
  assert.equal(b.trainProgress, 0); assert.deepEqual(plain(b.trainQueue), ['scout']);
  b.update(.1, g); assert.equal(b.trainProgress, .1);
  g.cancelProduction(b, 0);
  assert.equal(b.trainQueue.length, 0); assert.equal(b.trainProgress, 0);
  assert.equal(g.stats.suppliesSpent, 0);
});

test('paused, saved, and loaded queues remain cancellable, and refunds cannot repeat', () => {
  const g = fixture(), b = g.buildings[1];
  g.trainUnit(b, 'sniper'); b.trainProgress = 5;
  g.buildings[2].dead = true;
  const restored = Game.fromSaveData(g.toSaveData()), barracks = restored.buildings[1];
  const before = restored.supplies;
  assert.equal(restored.canTrainUnit('sniper'), false);
  assert.equal(restored.cancelProduction(barracks, 0), true);
  assert.equal(restored.supplies, before + UNIT_DEFS.sniper.cost);
  assert.equal(restored.cancelProduction(barracks, 0), false);
  assert.equal(restored.supplies, before + UNIT_DEFS.sniper.cost);
  barracks.dead = true;
  assert.equal(restored.cancelProduction(barracks, 0), false);
});

test('mechanics queue cancellation shares the same full-refund and progress rules', () => {
  const g = fixture(), b = g.buildings[2], initial = g.supplies;
  g.buildVehicle(b); g.buildVehicle(b); b.vehicleProgress = 8;
  g.cancelProduction(b, 1);
  assert.equal(b.vehicleQueue, 1); assert.equal(b.vehicleProgress, 8);
  g.cancelProduction(b, 0);
  assert.equal(b.vehicleQueue, 0); assert.equal(b.vehicleProgress, 0);
  assert.equal(g.supplies, initial); assert.equal(g.stats.suppliesSpent, 0);
});

test('canceled training never spawns, and completed orders advance and announce the next unit', () => {
  const g = fixture(), b = g.buildings[1];
  g.trainUnit(b, 'soldier'); g.trainUnit(b, 'scout');
  b.trainProgress = UNIT_DEFS.soldier.trainTime - .01;
  g.cancelProduction(b, 0);
  b.update(UNIT_DEFS.scout.trainTime, g);
  assert.deepEqual(plain(g.units.map(u => u.type)), ['scout']);
  assert.equal(b.trainQueue.length, 0); assert.equal(b.trainProgress, 0);
  assert.equal(g.activity.at(-1).text, 'Scout ready');
});

test('feed and counters fit without touching build buttons or the source link at all supported widths', () => {
  for (const width of [320, 390, 430, 560, 620, 800, 999, 1000, 1200, 1440, 1920]) {
    const height = 844;
    const {feed, stats} = activityPanelRects(width, height);
    const link = {x:width - 97, y:height - 30, w:85, h:24};
    for (const panel of [feed, stats]) {
      assert.ok(panel.x >= 0 && panel.x + panel.w <= width);
      assert.ok(panel.y >= height - bottomPanelHeight(width));
      assert.equal(overlaps(panel, link), false, `source link at ${width}`);
      for (const button of buildButtonRects(width, height)) assert.equal(overlaps(panel, button), false, `${button.type} at ${width}`);
    }
    assert.equal(overlaps(feed, stats), false);
  }
});

test('every queue item is reachable through bounded pages and cancellation never clicks through', () => {
  const g = fixture(), b = g.buildings[1];
  for (let i = 0; i < 11; i++) g.trainUnit(b, i % 2 ? 'scout' : 'soldier');
  g._selectedBuilding = b; g.buildMode = 'depot';
  const input = new InputHandler({style:{}, addEventListener() {}}, g);
  const seen = [];
  for (let p = 0; p < 4; p++) {
    const layout = productionPopupLayout(b, g.camera, p);
    seen.push(...layout.queue.map(r => r.index));
    assert.ok(layout.queue.every(r => r.y >= layout.panel.y && r.y + r.h <= layout.panel.y + layout.panel.h));
  }
  assert.deepEqual(plain(seen), Array.from({length:11}, (_, i) => i));
  input._productionBuilding = b; input._productionPage = 3;
  const layout = productionPopupLayout(b, g.camera, 3), rc = layout.queue[0].cancel;
  const before = g.supplies;
  const event = {button:0, clientX:rc.x + 12, clientY:rc.y + 12, preventDefault() {}};
  input._onMouseDown(event); input._onMouseUp(event);
  assert.equal(b.trainQueue.length, 10); assert.equal(g.supplies, before + UNIT_DEFS.scout.cost);
  assert.equal(g._selectedBuilding, b); assert.equal(g.buildMode, null); assert.equal(g.buildings.length, 3);
});

test('queue geometry remains stable when ordering more units and fits mobile/desktop viewports', () => {
  const g = fixture(), b = g.buildings[1];
  for (const width of [320, 390, 800, 1440]) {
    window.innerWidth = width; window.innerHeight = 844;
    const before = plain(productionButtonRects(b, g.camera));
    g.trainUnit(b, 'scout');
    assert.deepEqual(plain(productionButtonRects(b, g.camera)), before);
    const layout = productionPopupLayout(b, g.camera, 999);
    assert.ok(layout.panel.x >= 0 && layout.panel.x + layout.panel.w <= width);
    assert.ok(layout.panel.y >= 80);
    assert.ok(layout.panel.y + layout.panel.h <= 844 - bottomPanelHeight(width));
    for (const button of layout.buttons) for (const row of layout.queue) assert.equal(overlaps(button, row), false);
  }
});

test('HUD text is fitted once per event/resize, not measured again on every rendered frame', () => {
  const g = fixture(); g.addActivity('Scout is under attack', 'warning');
  let measurements = 0; const texts = [];
  const ctx = new Proxy({
    measureText: text => { measurements++; return {width:text.length * 6.6}; },
    fillText: text => texts.push(String(text)),
  }, {get:(target, key) => target[key] ?? (() => {})});
  const r = Object.assign(Object.create(Renderer.prototype), {W:1440, H:1000});
  r._drawActivityPanel(ctx, g);
  const first = measurements; assert.ok(first > 0);
  r._drawActivityPanel(ctx, g); assert.equal(measurements, first);
  assert.ok(texts.includes('Scout is under attack'));
  for (const label of ['Zombies killed', 'Humans lost', 'Buildings destroyed', 'Supplies used']) assert.ok(texts.includes(label));
  g.addActivity('Builder has fallen', 'danger'); r._drawActivityPanel(ctx, g);
  assert.ok(measurements > first);
});
