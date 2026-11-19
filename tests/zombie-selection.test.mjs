import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
function fixture(type = 'brute', dormant = false) {
  const context = vm.createContext({window:{innerWidth:1200, innerHeight:900,
    location:{search:'?artPilot=off'}, addEventListener(){}}, URLSearchParams,
    performance:{now:() => 0}});
  for (const name of ['config', 'utils', 'pathfinding', 'entities', 'game', 'diorama-art', 'renderer', 'input']) {
    vm.runInContext(readFileSync(new URL(`js/${name}.js`, root), 'utf8'), context);
  }
  const e = vm.runInContext('({Game, Unit, Zombie, Building, Vehicle, InputHandler, Renderer, MAP_W, MAP_H, worldToScreen, minimapRect})', context);
  const game = new e.Game();
  game.tiles = Array.from({length:e.MAP_H}, () => new Uint8Array(e.MAP_W));
  game.fogVisible.fill(1); game.fogExplored.fill(1); game._fogTimer = 100;
  game.flowDirty = false;
  const zombie = new e.Zombie(type, 900, 900); zombie.dormant = dormant;
  const unit = new e.Unit('soldier', 1100, 900), building = new e.Building('hq', 10, 10);
  const vehicle = new e.Vehicle('suv', 1200, 900);
  game.zombies = [zombie]; game.units = [unit]; game.buildings = [building]; game.vehicles = [vehicle];
  game.camera = {x:0, y:0, zoom:1};
  const foot = e.worldToScreen(zombie.x, zombie.y, game.camera);
  game.camera.x = foot.x - 400; game.camera.y = foot.y - 360;
  const input = new e.InputHandler({style:{}, addEventListener(){}}, game);
  return {context, e, game, zombie, unit, building, vehicle, input};
}
const event = (extra = {}) => ({button:0, clientX:400, clientY:350, shiftKey:false, ...extra});
function click(input, extra = {}) {
  input._onMouseDown(event(extra)); input._onMouseUp(event(extra));
}

test('left click inspects every zombie class, including dormant zombies, without waking it', () => {
  for (const type of ['walker', 'runner', 'brute', 'spitter', 'exploder', 'screamer', 'boss']) {
    for (const dormant of [false, true]) {
      const {game, zombie, unit, input} = fixture(type, dormant);
      game.selected = [unit]; unit.selected = true;
      click(input);
      assert.equal(game.selectedZombies[0], zombie, type);
      assert.equal(game.selected.length, 0); assert.equal(unit.selected, false);
      assert.equal(zombie.dormant, dormant);
      assert.equal(game._selectedBuilding, null); assert.equal(game.selectedVehicle, null);
    }
  }
});

test('friendly units, buildings and vehicles replace zombie inspection', () => {
  for (const target of ['unit', 'building', 'vehicle']) {
    const f = fixture(); click(f.input);
    f.input._getZombieAt = () => null;
    f.input._getUnitAt = () => target === 'unit' ? f.unit : null;
    f.input._getVehicleAt = () => target === 'vehicle' ? f.vehicle : null;
    f.input._getBuildingAt = () => target === 'building' ? f.building : null;
    click(f.input);
    assert.equal(f.game.selectedZombies.length, 0);
    if (target === 'unit') assert.deepEqual([...f.game.selected], [f.unit]);
    if (target === 'building') assert.equal(f.game._selectedBuilding, f.building);
    if (target === 'vehicle') assert.equal(f.game.selectedVehicle, f.vehicle);
  }
});

test('box selection, control groups, idle-army selection and Escape clear zombie inspection', () => {
  for (const action of ['box', 'group', 'idle', 'escape']) {
    const {game, zombie, unit, input} = fixture(); click(input);
    assert.equal(game.selectedZombies[0], zombie);
    if (action === 'box') {
      game.unitsInScreenRect = () => [unit];
      game.zombiesInScreenRect = () => [];
      input._onMouseDown(event());
      input._onMouseMove(event({clientX:440, clientY:390, buttons:1}));
      input._onMouseUp(event({clientX:440, clientY:390}));
    } else {
      input.groups[1] = [unit];
      input._onKeyDown({code:{group:'Digit1', idle:'KeyH', escape:'Escape'}[action], preventDefault(){}});
    }
    assert.equal(game.selectedZombies.length, 0);
    assert.equal(game.selected.length, action === 'escape' ? 0 : 1);
  }
});

test('friendly units and vehicles keep click priority when a zombie overlaps them', () => {
  for (const target of ['unit', 'vehicle']) {
    const {game, unit, vehicle, input} = fixture();
    input._getUnitAt = () => target === 'unit' ? unit : null;
    input._getVehicleAt = () => target === 'vehicle' ? vehicle : null;
    click(input);
    assert.equal(game.selectedZombies.length, 0);
    if (target === 'unit') assert.deepEqual([...game.selected], [unit]);
    else assert.equal(game.selectedVehicle, vehicle);
  }
});

test('inspected zombies receive no movement, attack, stop or control-group commands', () => {
  const {game, zombie, input} = fixture(); click(input);
  const before = [zombie.x, zombie.y, zombie.atkTarget, zombie.dormant];
  input._onRightClick(event({button:2}));
  for (const code of ['KeyA', 'KeyS', 'KeyR', 'Digit1']) input._onKeyDown({code, shiftKey:true, preventDefault(){}});
  assert.deepEqual([zombie.x, zombie.y, zombie.atkTarget, zombie.dormant], before);
  assert.equal(game.selected.length, 0); assert.equal(input.groups[1], undefined);
});

test('troops can still attack a zombie by right click after being selected again', () => {
  const {game, zombie, unit, input} = fixture(); click(input);
  input._getUnitAt = () => unit; click(input);
  let attacked = null; unit.attackTarget = target => { attacked = target; };
  input._onRightClick(event({button:2}));
  assert.equal(attacked, zombie); assert.equal(game.selectedZombies.length, 0);
});

test('hidden and dead zombies cannot be hit, and existing inspection clears on death or loss of vision', () => {
  for (const reason of ['hidden', 'dead']) {
    const {game, zombie, input} = fixture('walker', true); click(input);
    if (reason === 'hidden') game.fogVisible.fill(0);
    else zombie.dead = true;
    assert.equal(input._getZombieAt(400, 350), null);
    game.update(.01);
    assert.equal(game.selectedZombies.length, 0);
  }
});

test('zombie information shows the class, current health and state without troop command hints', () => {
  for (const type of ['walker', 'runner', 'brute', 'spitter', 'exploder', 'screamer', 'boss']) {
    const {e, game, zombie, input} = fixture(type, true); click(input); zombie.hp -= 1.5;
    const text = [], bars = [], renderer = Object.create(e.Renderer.prototype);
    renderer.W = 1200; renderer.H = 900; renderer._drawHealthBar = (...args) => bars.push(args);
    const ctx = new Proxy({fillText:value => text.push(value)}, {get:(obj, key) => key in obj ? obj[key] : () => {}});
    renderer._drawSelectionPanel(ctx, game);
    assert.deepEqual(text, ['1 selected', `${zombie.def.name} · Dormant`, `${Math.ceil(zombie.hp)}/${zombie.maxHp}`, 'Zombies · Inspection only']);
    assert.equal(bars.length, 1); assert.equal(bars[0][5], zombie.hp / zombie.maxHp);
  }
});

test('the mobile minimap stays above the zombie information panel', () => {
  const {context, e, game, input} = fixture(); click(input);
  context.window.innerWidth = 390;
  const rc = e.minimapRect(390, 900, true);
  assert.equal(input._isInMinimap(rc.x + 20, rc.y + 20), true);
  const lower = e.minimapRect(390, 900, false);
  assert.equal(input._isInMinimap(lower.x + 20, lower.y + 20), false);
  assert.ok(game.selectedZombies.length);
});

test('dragging selects visible humans and multiple zombies, in either direction, including from a zombie', () => {
  for (const reverse of [false, true]) {
    const {e, game, zombie, unit, input} = fixture();
    const other = new e.Zombie('spitter', 940, 900);
    const hidden = new e.Zombie('walker', 960, 900);
    const dead = new e.Zombie('runner', 930, 900); dead.dead = true;
    zombie.dormant = other.dormant = true;
    unit.x = 980;
    game.zombies.push(other, hidden, dead);
    game.tileVisible = (tx, ty) => tx !== Math.floor(hidden.x / 40);
    const start = reverse ? {clientX:520, clientY:430} : {clientX:400, clientY:350};
    const end = reverse ? {clientX:390, clientY:340} : {clientX:520, clientY:430};
    input._onMouseDown(event(start));
    input._onMouseMove(event({...end, buttons:1})); input._onMouseUp(event(end));
    assert.deepEqual([...game.selected], [unit]);
    assert.deepEqual([...game.selectedZombies], [zombie, other]);
    assert.equal(zombie.dormant, true); assert.equal(other.dormant, true);
  }
});

test('Shift toggles individual zombies and humans and adds mixed drag selections without duplicates', () => {
  const {e, game, zombie, unit, input} = fixture();
  game.selected = [unit]; unit.selected = true;
  click(input, {shiftKey:true});
  assert.deepEqual([...game.selected], [unit]); assert.deepEqual([...game.selectedZombies], [zombie]);
  click(input, {shiftKey:true}); assert.equal(game.selectedZombies.length, 0);
  click(input, {shiftKey:true});
  input._getUnitAt = () => unit;
  click(input, {shiftKey:true}); assert.equal(game.selected.length, 0);
  assert.deepEqual([...game.selectedZombies], [zombie]);
  const other = new e.Zombie('spitter', 1300, 1000); game.zombies.push(other);
  game.unitsInScreenRect = () => [unit]; game.zombiesInScreenRect = () => [zombie, other];
  input._onMouseDown(event({shiftKey:true}));
  input._onMouseMove(event({clientX:440, clientY:390, buttons:1}));
  input._onMouseUp(event({clientX:440, clientY:390, shiftKey:true}));
  assert.deepEqual([...game.selected], [unit]);
  assert.deepEqual([...game.selectedZombies], [zombie, other]);
});

test('mixed selections draw a separate health row for every character, including duplicate types', () => {
  const {e, game, zombie, unit} = fixture();
  const otherUnit = new e.Unit('soldier', 1100, 950), otherZombie = new e.Zombie('brute', 950, 950);
  game.selected = [unit, otherUnit]; game.selectedZombies = [zombie, otherZombie];
  const actors = [unit, otherUnit, zombie, otherZombie];
  actors.forEach((actor, i) => { actor.hp = actor.maxHp - i * 3; });
  const text = [], bars = [], renderer = Object.create(e.Renderer.prototype);
  renderer.W = 1200; renderer.H = 900; renderer._drawHealthBar = (...args) => bars.push(args);
  const ctx = new Proxy({fillText:(...args) => text.push(args)}, {get:(obj, key) => key in obj ? obj[key] : () => {}});
  renderer._drawSelectionPanel(ctx, game);
  assert.equal(bars.length, 4);
  assert.deepEqual(bars.map(args => args[5]), actors.map(actor => actor.hp / actor.maxHp));
  assert.deepEqual(text.filter(args => ['Soldier', 'Brute'].includes(args[0])).map(args => args[2]),
    bars.map(args => args[2] - 15));
});

test('large selections scroll through every character and panel input does not zoom or command units', () => {
  const {context, e, game, input} = fixture();
  context.window.innerWidth = 390;
  game.selectedZombies = Array.from({length:50}, () => new e.Zombie('walker',900,900));
  const rc = vm.runInContext('characterSelectionPanelRect', context)(game, 390, 900);
  const minimap = e.minimapRect(390, 900, true, rc.h);
  assert.ok(minimap.y >= 144); assert.ok(minimap.y + minimap.h < rc.y);
  const mouse = {clientX:rc.x + 20, clientY:rc.y + 35};
  const zoom = game.camera.zoom;
  for (let i=0; i<60; i++) input._onWheel({...mouse, deltaY:100, preventDefault(){}});
  assert.equal(game.camera.zoom, zoom); assert.equal(game.selectionScroll, rc.maxScroll);
  const before = [...game.selectedZombies]; click(input, mouse);
  assert.deepEqual([...game.selectedZombies], before);
  const text = [], renderer = Object.create(e.Renderer.prototype);
  renderer.W = 390; renderer.H = 900; renderer._drawHealthBar = () => {};
  const ctx = new Proxy({fillText:value => text.push(value)}, {get:(obj,key) => key in obj ? obj[key] : () => {}});
  renderer._drawSelectionPanel(ctx, game);
  assert.ok(text.at(-1).includes('of 50')); assert.ok(text.at(-1).includes('50 ·'));
});

test('mixed selection commands and control-group assignment only affect humans', () => {
  const {game, zombie, unit, input} = fixture();
  game.selected = [unit]; game.selectedZombies = [zombie];
  const before = [zombie.x, zombie.y, zombie.atkTarget, zombie.dormant];
  input._onKeyDown({code:'Digit1', shiftKey:true});
  assert.deepEqual([...input.groups[1]], [unit]);
  input._getZombieAt = () => null;
  input._onRightClick(event({button:2, clientX:650}));
  assert.ok(unit.moveTarget);
  input._onKeyDown({code:'KeyS'}); assert.equal(unit.moveTarget, null);
  assert.deepEqual([zombie.x, zombie.y, zombie.atkTarget, zombie.dormant], before);
});
