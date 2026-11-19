import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture(type='heavy') {
  const context=vm.createContext({window:{innerWidth:1200,innerHeight:900}});
  for(const name of ['config','utils','pathfinding','entities','game']) {
    vm.runInContext(readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8'),context);
  }
  const e=vm.runInContext('({Game,Unit,Zombie,Building,Vehicle,MAP_W,MAP_H,TILE,TILE_WATER,HEAVY_RETREAT_HEALTH_FRACTION})',context);
  const game=new e.Game();
  game.tiles=Array.from({length:e.MAP_H},()=>new Uint8Array(e.MAP_W));
  const hq=new e.Building('hq',28,14),unit=new e.Unit(type,620,620);
  game.buildings=[hq];game.units=[unit];game.waveTimer=999;
  game.fogVisible.fill(1);game.fogExplored.fill(1);game._rebuildFlowField();
  return {e,context,game,hq,unit};
}
function advance(unit,game,seconds,until=()=>false) {
  for(let t=0;t<seconds&&!until();t+=1/30) {
    game.gameTime+=1/30;unit.update(1/30,game);
    assert.ok(game.canOccupyGround(unit.x,unit.y,unit.def.radius),'retreat must not cross blocked ground');
  }
}

test('Heavy breaks off its charge strictly below 15 percent health',()=>{
  const {e,game,unit}=fixture(),zombie=new e.Zombie('brute',unit.x-150,unit.y);
  game.zombies=[zombie];unit.attackTarget(zombie);
  unit.hp=unit.maxHp*e.HEAVY_RETREAT_HEALTH_FRACTION;
  unit.update(.01,game);assert.equal(unit.heavyRetreating,false);assert.equal(unit.atkTarget,zombie);
  game.damageEntity(unit,1,'zombie',zombie);
  const x=unit.x;unit.update(.1,game);
  assert.equal(unit.heavyRetreating,true);assert.equal(unit.atkTarget,null);assert.equal(unit._heavyCharge,null);
  assert.ok(unit.x>x,'walks toward HQ instead of its attacker');
  assert.equal(game.toasts.filter(t=>t.text==='Heavy retreating to HQ').length,1);
});

test('retreat cancels work and boarding while keeping carried supplies',()=>{
  const {e,game,unit}=fixture();
  unit.gatherCenter={x:200,y:200};unit.bundleGatherCenter={x:200,y:200};
  unit.returnCargoTarget=game.buildings[0];unit.supportHome={x:unit.x,y:unit.y};
  unit.boardingVehicle=new e.Vehicle('suv',unit.x,unit.y);unit.carrying=9;unit.hp=1;
  unit.update(.01,game);
  assert.equal(unit.heavyRetreating,true);assert.equal(unit.gatherCenter,null);
  assert.equal(unit.bundleGatherCenter,null);assert.equal(unit.returnCargoTarget,null);
  assert.equal(unit.supportHome,null);assert.equal(unit.boardingVehicle,null);assert.equal(unit.vehicle,null);
  assert.equal(unit.carrying,9);
});

test('Heavy reaches an open point beside HQ and holds while critically wounded despite attacks',()=>{
  const {e,game,hq,unit}=fixture();unit.hp=62;
  const zombie=new e.Zombie('brute',unit.x-100,unit.y);game.zombies=[zombie];
  game.damageEntity(unit,1,'zombie',zombie);assert.equal(unit.atkTarget,null);
  advance(unit,game,20,()=>game.distanceToBuilding(unit.x,unit.y,hq)<=e.TILE);
  assert.ok(game.distanceToBuilding(unit.x,unit.y,hq)<=e.TILE);
  const x=unit.x,y=unit.y;
  zombie.x=x-30;zombie.y=y;
  game.damageEntity(unit,1,'zombie',zombie);
  advance(unit,game,2);
  assert.equal(unit.atkTarget,null);assert.equal(unit.heavyRetreating,true);
  assert.deepEqual([unit.x,unit.y],[x,y]);assert.equal(zombie.hp,zombie.maxHp);
  unit.hp=100;unit.update(.01,game);
  assert.equal(unit.heavyRetreating,false);assert.equal(unit.atkTarget,zombie,'normal combat resumes after recovery');
});

for(const obstacle of ['wall','water']) {
  test(`retreat routes around ${obstacle} and reuses its path`,()=>{
    const {e,context,game,hq,unit}=fixture();unit.hp=62;
    for(let y=12;y<=19;y++) {
      if(obstacle==='wall')game.buildings.push(new e.Building('wall',21,y));
      else game.tiles[y][21]=e.TILE_WATER;
    }
    game._rebuildFlowField();let searches=0;const find=context.findPath;
    context.findPath=(...args)=>{searches++;return find(...args);};
    advance(unit,game,25,()=>game.distanceToBuilding(unit.x,unit.y,hq)<=e.TILE);
    assert.ok(game.distanceToBuilding(unit.x,unit.y,hq)<=e.TILE);
    assert.ok(searches<=2,'route is not searched again every frame');
  });
}

test('save/load preserves a retreat even if healing raises health while still travelling',()=>{
  const {e,game,unit}=fixture();unit.hp=62;advance(unit,game,.5);
  assert.equal(unit.heavyRetreating,true);unit.hp=100;
  const data=game.toSaveData(),loaded=e.Game.fromSaveData(data),resumed=loaded.units[0],hq=loaded.buildings[0];
  assert.equal(resumed.heavyRetreating,true);assert.equal(resumed._heavyRetreatRoute,undefined);
  resumed.update(.01,loaded);assert.equal(resumed.heavyRetreating,true);
  advance(resumed,loaded,20,()=>loaded.distanceToBuilding(resumed.x,resumed.y,hq)<=e.TILE);
  resumed.update(.01,loaded);assert.equal(resumed.heavyRetreating,false);
  assert.ok(loaded.distanceToBuilding(resumed.x,resumed.y,hq)<=e.TILE);
  delete data.units[0].heavyRetreating;data.units[0].hp=62;
  const legacy=e.Game.fromSaveData(data);legacy.units[0].update(.01,legacy);
  assert.equal(legacy.units[0].heavyRetreating,true,'older saves also trigger low-health retreat');
});

test('an unreachable base does not trigger combat or a search every frame, and an opened route is used',()=>{
  const {e,context,game,hq,unit}=fixture();unit.hp=62;
  for(let y=hq.tileY-2;y<hq.tileY+hq.def.tileSize+2;y++) {
    for(let x=hq.tileX-2;x<hq.tileX+hq.def.tileSize+2;x++) {
      if(x<hq.tileX||y<hq.tileY||x>=hq.tileX+hq.def.tileSize||y>=hq.tileY+hq.def.tileSize)game.tiles[y][x]=e.TILE_WATER;
    }
  }
  game._rebuildFlowField();let searches=0;const find=context.findPath;
  context.findPath=(...args)=>{searches++;return find(...args);};
  advance(unit,game,1.5);assert.ok(searches>0&&searches<=2);
  assert.equal(unit.atkTarget,null);assert.equal(unit.heavyRetreating,true);
  for(const row of game.tiles)row.fill(0);game._rebuildFlowField();
  advance(unit,game,20,()=>game.distanceToBuilding(unit.x,unit.y,hq)<=e.TILE);
  assert.ok(game.distanceToBuilding(unit.x,unit.y,hq)<=e.TILE);
});

test('other units and embarked Heavies do not retreat, and a missing HQ is handled safely',()=>{
  const normal=fixture('soldier');normal.unit.hp=1;normal.unit.update(.01,normal.game);
  assert.equal(normal.unit.heavyRetreating,false);
  const passenger=fixture();passenger.unit.hp=1;
  passenger.unit.vehicle=new passenger.e.Vehicle('suv',passenger.unit.x,passenger.unit.y);
  passenger.unit.update(.01,passenger.game);assert.equal(passenger.unit.heavyRetreating,false);
  const missing=fixture();missing.unit.hp=1;missing.hq.dead=true;
  assert.doesNotThrow(()=>missing.unit.update(.01,missing.game));
});
