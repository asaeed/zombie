import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const context=vm.createContext({window:{innerWidth:1200,innerHeight:900,
  location:{search:'?artPilot=off'},addEventListener(){}},URLSearchParams});
for(const file of ['config','utils','pathfinding','entities','game','diorama-art','renderer','input'])
  vm.runInContext(readFileSync(new URL(`js/${file}.js`,root),'utf8'),context,{filename:`js/${file}.js`});
const {Game,Unit,Building,Vehicle,InputHandler,MAP_W,MAP_H}=vm.runInContext(
  '({Game,Unit,Building,Vehicle,InputHandler,MAP_W,MAP_H})',context);

function fixture(selection='unit'){
  const game=new Game();
  game.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));
  const first=new Unit('soldier',700,700),second=new Unit('scout',800,700);
  const building=new Building('hq',10,10),vehicle=new Vehicle('suv',900,700);
  game.units=[first,second];game.buildings=[building];game.vehicles=[vehicle];
  if(selection==='unit'||selection==='group'){
    first.selected=true;game.selected=[first];
    if(selection==='group'){second.selected=true;game.selected.push(second);}
  }else if(selection==='building')game._selectedBuilding=building;
  else if(selection==='vehicle')game.selectedVehicle=vehicle;
  const input=new InputHandler({style:{},addEventListener(){}},game);
  input.hits={};
  input._checkProductionClick=()=>null;
  input._getUnitAt=()=>input.hits.unit??null;
  input._getBuildingAt=()=>input.hits.building??null;
  input._getVehicleAt=()=>input.hits.vehicle??null;
  input._getCacheAt=()=>null;input._getBundleAt=()=>null;
  game.unitsInScreenRect=()=>input.hits.box??[];
  return {game,input,first,second,building,vehicle};
}
const event=(extras={})=>({button:0,clientX:400,clientY:350,shiftKey:false,...extras});
function click(input,extras={}){input._onMouseDown(event(extras));input._onMouseUp(event(extras));}
function selectionState(game){
  return {units:[...game.selected],flags:game.units.map(u=>u.selected),
    building:game._selectedBuilding,vehicle:game.selectedVehicle};
}

for(const selected of ['unit','group','building','vehicle']){
  test(`empty left clicks preserve ${selected} selection on both mouse-down and mouse-up`,()=>{
    const {game,input}=fixture(selected),before=selectionState(game);
    for(const shiftKey of [false,true]){
      input._onMouseDown(event({shiftKey}));assert.deepEqual(selectionState(game),before);
      input._onMouseUp(event({shiftKey}));assert.deepEqual(selectionState(game),before);
      assert.equal(input._dragStart,null);assert.equal(input._clickHandled,false);
    }
  });
  test(`an empty drag box preserves ${selected} selection`,()=>{
    const {game,input}=fixture(selected),before=selectionState(game);
    input._onMouseDown(event());
    input._onMouseMove(event({clientX:440,clientY:390,buttons:1}));
    assert.equal(input._dragging,true);
    input._onMouseUp(event({clientX:440,clientY:390}));
    assert.deepEqual(selectionState(game),before);assert.equal(input.selectBox,null);
  });
}
for(const selected of ['unit','building','vehicle'])test(`clicking another unit replaces ${selected} selection`,()=>{
  const {game,input,first,second}=fixture(selected);input.hits.unit=second;
  click(input);
  assert.deepEqual([...game.selected],[second]);assert.equal(second.selected,true);assert.equal(first.selected,false);
  assert.equal(game._selectedBuilding,null);assert.equal(game.selectedVehicle,null);
});
test('clicking a building or vehicle still replaces the unit selection',()=>{
  for(const target of ['building','vehicle']){
    const f=fixture('group');f.input.hits[target]=f[target];click(f.input);
    assert.equal(f.game.selected.length,0);assert.ok(f.game.units.every(u=>!u.selected));
    assert.equal(f.game._selectedBuilding,target==='building'?f.building:null);
    assert.equal(f.game.selectedVehicle,target==='vehicle'?f.vehicle:null);
  }
});
test('a nonempty drag box switches from buildings and vehicles to units',()=>{
  for(const selected of ['unit','building','vehicle']){
    const {game,input,first,second}=fixture(selected);input.hits.box=[second];
    input._onMouseDown(event());input._onMouseMove(event({clientX:440,clientY:390,buttons:1}));
    input._onMouseUp(event({clientX:440,clientY:390}));
    assert.deepEqual([...game.selected],[second]);assert.equal(first.selected,false);assert.equal(second.selected,true);
    assert.equal(game._selectedBuilding,null);assert.equal(game.selectedVehicle,null);
  }
});
test('shift-click still adds and toggles units without duplicate selection',()=>{
  const {game,input,first,second}=fixture();input.hits.unit=second;
  click(input,{shiftKey:true});assert.deepEqual([...game.selected],[first,second]);
  click(input,{shiftKey:true});assert.deepEqual([...game.selected],[first]);assert.equal(second.selected,false);
  input.hits.unit=first;click(input);assert.deepEqual([...game.selected],[first]);
});
test('shift-drag still adds units to the current selection',()=>{
  const {game,input,first,second}=fixture();input.hits.box=[first,second];
  input._onMouseDown(event({shiftKey:true}));input._onMouseMove(event({clientX:440,clientY:390,buttons:1}));
  input._onMouseUp(event({clientX:440,clientY:390,shiftKey:true}));
  assert.deepEqual([...game.selected],[first,second]);
});
test('camera edge clicks preserve selection and Escape still explicitly clears it',()=>{
  const {game,input}=fixture('group'),before=selectionState(game);
  click(input,{clientX:5});assert.deepEqual(selectionState(game),before);assert.equal(input._edgeScrollArmed,true);
  input._onKeyDown({code:'Escape',preventDefault(){}});
  assert.equal(game.selected.length,0);assert.ok(game.units.every(u=>!u.selected));
});

for(const obscurer of ['building','vehicle'])test(`an overlapping unit wins over a ${obscurer}`,()=>{
 const f=fixture('group');f.input.hits.unit=f.second;f.input.hits[obscurer]=f[obscurer];
 click(f.input);assert.deepEqual([...f.game.selected],[f.second]);
 assert.equal(f.game._selectedBuilding,null);assert.equal(f.game.selectedVehicle,null);
 click(f.input,{shiftKey:true});assert.equal(f.game.selected.length,0);
});
test('an overlapping unit can still begin a drag-selection',()=>{
 const f=fixture();f.input.hits.unit=f.second;f.input.hits.building=f.building;f.input.hits.box=[f.first,f.second];
 f.input._onMouseDown(event());f.input._onMouseMove(event({clientX:440,clientY:390,buttons:1}));
 f.input._onMouseUp(event({clientX:440,clientY:390}));assert.deepEqual([...f.game.selected],[f.first,f.second]);
});
test('production controls keep priority over world units',()=>{
 const f=fixture('building');f.building.type='barracks';f.input.hits.unit=f.second;
 let trained=null;f.input._checkProductionClick=()=> 'scout';f.game.trainUnit=(_b,type)=>{trained=type;};
 click(f.input);assert.equal(trained,'scout');assert.equal(f.game._selectedBuilding,f.building);assert.equal(f.game.selected.length,0);
});
test('right-clicking a building graphic over open ground still sends a move order',()=>{
 const f=fixture();f.input.hits.building=f.building;
 f.input._updateMouseState=()=>{f.input.mouseWorld={x:700,y:700};};
 f.input._getZombieAt=()=>null;
 let moved=null;f.first.moveTo=(x,y)=>{moved={x,y};};
 f.input._onRightClick(event({button:2}));assert.ok(moved);
 f.input._updateMouseState=()=>{f.input.mouseWorld={x:f.building.x,y:f.building.y};};moved=null;
 f.input._onRightClick(event({button:2}));assert.equal(moved,null);
});

test('A does not intercept the next left click or issue a movement order',()=>{
 const {game,input,first,second}=fixture();input.hits.unit=second;
 input._onKeyDown({code:'KeyA'});click(input);
 assert.deepEqual([...game.selected],[second]);
 assert.equal(first.moveTarget,null);assert.equal(second.moveTarget,null);
 assert.notEqual(input.canvas.style.cursor,'crosshair');
});

test('A preserves an armed flare or active building placement',()=>{
 for(const mode of ['flare','build']){
  const {game,input,first}=fixture();
  input.flareArm=mode==='flare';game.buildMode=mode==='build'?'wall':null;
  input.canvas.style.cursor=mode==='flare'?'crosshair':'';
  const before={flare:input.flareArm,build:game.buildMode,cursor:input.canvas.style.cursor};
  input._onKeyDown({code:'KeyA'});
  assert.deepEqual({flare:input.flareArm,build:game.buildMode,cursor:input.canvas.style.cursor},before);
  assert.deepEqual([...game.selected],[first]);
 }
});
