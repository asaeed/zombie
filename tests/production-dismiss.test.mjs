import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({window: {
  innerWidth: 1200, innerHeight: 900, addEventListener() {}
}});
for (const file of ['config', 'utils', 'input']) {
  vm.runInContext(readFileSync(new URL(`js/${file}.js`, root), 'utf8'), context,
    {filename: `js/${file}.js`});
}
const {InputHandler, productionButtonRects, minimapRect, centerCameraOn} = vm.runInContext(
  '({InputHandler, productionButtonRects, minimapRect, centerCameraOn})', context);

function fixture(type = 'barracks') {
  const building = {type, x: 640, y: 640, width: 128, height: 128, dead: false};
  const unit = {selected: false};
  const orders = [];
  const game = {
    status: 'playing', camera: {x: 0, y: 0, zoom: 1},
    selected: [], units: [unit], _selectedBuilding: building, selectedVehicle: null,
    buildMode: null, trainUnit: (b, type) => orders.push({building: b, type}),
    buildVehicle: b => orders.push({building: b, type: 'suv'}),
    unitsInScreenRect: () => [],
  };
  centerCameraOn(game.camera, building.x, building.y, 1200, 900);
  const input = new InputHandler({style: {}, addEventListener() {}}, game);
  input.hits = {};
  input._getUnitAt = () => input.hits.unit ?? null;
  input._getBuildingAt = () => input.hits.building ?? null;
  input._getVehicleAt = () => null;
  input._getCacheAt = () => null;
  input._getBundleAt = () => null;
  return {game, input, building, unit, orders};
}

const event = (extras = {}) => ({button: 0, clientX: 150, clientY: 180,
  shiftKey: false, preventDefault() {}, ...extras});
function click(input, extras) {
  input._onMouseDown(event(extras));
  input._onMouseUp(event(extras));
}

for (const type of ['barracks', 'mechanics']) {
  test(`empty map clicks dismiss the ${type} production menu`, () => {
    const {game, input} = fixture(type);
    click(input);
    assert.equal(game._selectedBuilding, null);
    assert.equal(input._dragStart, null);
    assert.equal(input._clickHandled, false);
  });

  test(`${type} production buttons retain priority and keep the menu open`, () => {
    const {game, input, building, unit, orders} = fixture(type);
    input.hits.unit = unit;
    const rc = productionButtonRects(building, game.camera).find(
      rc => rc.type === (type === 'barracks' ? 'scout' : 'suv'));
    click(input, {clientX: rc.x + rc.w / 2, clientY: rc.y + rc.h / 2});
    assert.deepEqual(orders, [{building, type: rc.type}]);
    assert.equal(game._selectedBuilding, building);
    assert.equal(game.selected.length, 0);
  });

  test(`camera controls do not dismiss the ${type} menu`, () => {
    const {game, input, building} = fixture(type);
    click(input, {clientX: 5});
    assert.equal(input._edgeScrollArmed, true);
    assert.equal(game._selectedBuilding, building);
    const rc = minimapRect(1200, 900, true);
    click(input, {clientX: rc.x + rc.w / 2, clientY: rc.y + rc.h / 2});
    assert.equal(game._selectedBuilding, building);
    click(input, {button: 1});
    assert.equal(game._selectedBuilding, building);
  });
}

test('empty map clicks still preserve units and non-production selections', () => {
  for (const selected of ['unit', 'hq', 'vehicle']) {
    const {game, input, building, unit} = fixture('hq');
    if (selected !== 'hq') game._selectedBuilding = null;
    if (selected === 'unit') { game.selected = [unit]; unit.selected = true; }
    if (selected === 'vehicle') game.selectedVehicle = {};
    const vehicle = game.selectedVehicle;
    click(input);
    assert.equal(game._selectedBuilding, selected === 'hq' ? building : null);
    assert.equal(game.selectedVehicle, vehicle);
    assert.equal(unit.selected, selected === 'unit');
    assert.deepEqual(game.selected, selected === 'unit' ? [unit] : []);
  }
});

test('clicks on selectable objects still replace or retain the building selection', () => {
  const {game, input, building, unit} = fixture();
  input.hits.building = building;
  click(input);
  assert.equal(game._selectedBuilding, building);
  const hq = {type: 'hq'};
  input.hits.building = hq;
  click(input);
  assert.equal(game._selectedBuilding, hq);
  input.hits.unit = unit;
  click(input);
  assert.equal(game._selectedBuilding, null);
  assert.deepEqual([...game.selected], [unit]);
});

test('dismissing production still allows drag selection on the map', () => {
  const {game, input, unit} = fixture();
  game.unitsInScreenRect = () => [unit];
  input._onMouseDown(event());
  input._onMouseMove(event({clientX: 230, clientY: 260, buttons: 1}));
  input._onMouseUp(event({clientX: 230, clientY: 260}));
  assert.equal(game._selectedBuilding, null);
  assert.deepEqual([...game.selected], [unit]);
  assert.equal(unit.selected, true);
});

test('right-clicking the map keeps the barracks menu and sets its rally point', () => {
  const {game, input, building} = fixture();
  input._onRightClick(event({button: 2}));
  assert.equal(game._selectedBuilding, building);
  assert.equal(building.rally.x, input.mouseWorld.x);
  assert.equal(building.rally.y, input.mouseWorld.y);
});
