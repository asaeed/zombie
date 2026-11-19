import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
function engine() {
  const context=vm.createContext({window:{innerWidth:1200,innerHeight:900}});
  for(const name of ['config','utils','pathfinding','entities','game'])
    vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),context);
  return {context,...vm.runInContext('({Game,Unit,Zombie,Building,Vehicle,Cache,TILE,MAP_W,MAP_H,TILE_WATER,HEAVY_AGGRO_RADIUS})',context)};
}
function fixture(e) {
  const g=new e.Game();g.tiles=Array.from({length:e.MAP_H},()=>new Uint8Array(e.MAP_W));
  g.fogVisible.fill(1);g.fogExplored.fill(1);g.waveTimer=999;
  const heavy=new e.Unit('heavy',15.5*e.TILE,15.5*e.TILE);
  g.units=[heavy];g._rebuildFlowField();return {g,heavy};
}
function run(heavy,g,seconds,until=()=>false) {
  for(let t=0;t<seconds&&!until();t+=1/30) {
    g.gameTime+=1/30;heavy.update(1/30,g);
    assert.ok(g.canOccupyGround(heavy.x,heavy.y,heavy.def.radius),'charge cannot pass through terrain or buildings');
  }
}

test('idle Heavy detects a distant enemy, charges faster and attacks only in melee range',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('brute',heavy.x+5*e.TILE,heavy.y);
  g.zombies=[target];const start=heavy.x;heavy.update(.1,g);
  assert.equal(heavy.atkTarget,target);assert.ok(heavy.x-start>heavy.def.speed*.1*1.8);
  assert.equal(target.hp,target.maxHp,'detection range is not a ranged attack');
  const swings=[],attack=heavy._attackZombie.bind(heavy);
  heavy._attackZombie=(z,game)=>{swings.push(Math.hypot(z.x-heavy.x,z.y-heavy.y));attack(z,game);};
  run(heavy,g,4,()=>target.hp<target.maxHp);
  assert.ok(target.hp<target.maxHp);assert.ok(swings.every(d=>d<=heavy.def.atkRange));assert.equal(g.projectiles.length,0);
});

test('Heavy detects enemies entering the wide radius and can hit a dormant target',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',heavy.x+e.HEAVY_AGGRO_RADIUS+1,heavy.y);
  target.dormant=true;g.zombies=[target];heavy.update(.1,g);assert.equal(heavy.atkTarget,null);
  target.x=heavy.x+5*e.TILE;run(heavy,g,4,()=>target.hp<target.maxHp);
  assert.ok(target.hp<target.maxHp);assert.equal(target.dormant,false);
});

test('explicit movement, gathering and boarding take priority over automatic charges',()=>{
  for(const order of ['move','gather','board']) {
    const e=engine(),{g,heavy}=fixture(e);g.zombies=[new e.Zombie('walker',heavy.x+200,heavy.y)];
    if(order==='move')heavy.moveTo(heavy.x,heavy.y+200,g);
    if(order==='gather'){const cache=new e.Cache('bin',15,22);g.caches=[cache];heavy.gatherFrom(cache,g);}
    if(order==='board'){const truck=new e.Vehicle('suv',heavy.x,heavy.y+200);g.vehicles=[truck];heavy.boardVehicle(truck,g);}
    const start={x:heavy.x,y:heavy.y};heavy.update(.1,g);
    assert.equal(heavy.atkTarget,null,order+' remains active');
    assert.ok(Math.hypot(heavy.x-start.x,heavy.y-start.y)<=heavy.def.speed*.1+.01,'ordinary movement uses walking speed');
  }
});

test('incoming damage interrupts movement and a new player move immediately cancels the charge',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',heavy.x+200,heavy.y);
  g.zombies=[target];heavy.moveTo(heavy.x,heavy.y+300,g);g.damageEntity(heavy,1,'zombie',target);
  heavy.update(.1,g);assert.equal(heavy.atkTarget,target);assert.ok(heavy.waypoints.length>0);
  heavy.moveTo(heavy.x,heavy.y+100,g);heavy.update(.1,g);assert.equal(heavy.atkTarget,null);
});

test('Heavy paths around walls and water to reach melee range without repeated pathfinding',()=>{
  for(const obstacle of ['wall','water']) {
    const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',20.5*e.TILE,15.5*e.TILE);g.zombies=[target];
    for(let y=13;y<=17;y++) {
      if(obstacle==='wall')g.buildings.push(new e.Building('wall',18,y));else g.tiles[y][18]=e.TILE_WATER;
    }
    g._rebuildFlowField();let searches=0;const find=e.context.findPath;e.context.findPath=(...args)=>{searches++;return find(...args);};
    run(heavy,g,12,()=>target.hp<target.maxHp);
    assert.ok(target.hp<target.maxHp,obstacle+' is routed around');assert.ok(searches<=2,'route is reused while target is stationary');
  }
});

test('unreachable targets do not cause a pathfinding search on every frame',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',20.5*e.TILE,15.5*e.TILE);g.zombies=[target];
  for(let x=19;x<=21;x++)for(let y=14;y<=16;y++)if(x!==20||y!==15)g.buildings.push(new e.Building('wall',x,y));
  g._rebuildFlowField();let searches=0;const find=e.context.findPath;e.context.findPath=(...args)=>{searches++;return find(...args);};
  run(heavy,g,1.5);assert.equal(target.hp,target.maxHp);assert.ok(searches>0&&searches<=2);
});

test('moving or dead targets, changed terrain and save loads invalidate cached charges',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('brute',heavy.x+200,heavy.y);g.zombies=[target];
  heavy.update(.1,g);const route=heavy._heavyCharge;target.y+=e.TILE;heavy.update(.1,g);assert.notEqual(heavy._heavyCharge,route);
  const moved=heavy._heavyCharge;g._rebuildFlowField();heavy.update(.1,g);assert.notEqual(heavy._heavyCharge,moved);
  const save=g.toSaveData();assert.equal('_heavyCharge' in save.units[0],false);
  const loaded=e.Game.fromSaveData(save);assert.equal(loaded.units[0]._heavyCharge,undefined);
  run(loaded.units[0],loaded,6,()=>loaded.zombies[0].hp<loaded.zombies[0].maxHp);assert.ok(loaded.zombies[0].hp<loaded.zombies[0].maxHp);
  target.dead=true;heavy.update(.1,g);assert.equal(heavy.atkTarget,null);
});

test('Heavy respects fog at night and cannot charge or attack from inside a vehicle',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',heavy.x+200,heavy.y);g.zombies=[target];
  g.gameTime=210;g.fogVisible.fill(0);heavy.update(.1,g);assert.equal(heavy.atkTarget,null);
  g.fogVisible.fill(1);const truck=new e.Vehicle('suv',heavy.x,heavy.y);g.vehicles=[truck];truck.passengers=[heavy];heavy.vehicle=truck;
  heavy.update(.1,g);assert.equal(heavy.atkTarget,null);assert.equal(target.hp,target.maxHp);
});


test('movement resumes from the pursuit position after killing an attacker',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',heavy.x+200,heavy.y);g.zombies=[target];
  const destination={x:heavy.x,y:heavy.y+300};heavy.moveTo(destination.x,destination.y,g);g.damageEntity(heavy,1,'zombie',target);
  run(heavy,g,6,()=>target.dead);assert.equal(target.dead,true);
  heavy.update(.01,g);assert.equal(heavy.atkTarget,null);
  assert.deepEqual(JSON.parse(JSON.stringify(heavy.moveTarget)),destination);
  const next=heavy.waypoints[0];assert.ok(Math.hypot(next.x-heavy.x,next.y-heavy.y)<60,'resumes a freshly planned route');
});


test('Heavy charge works in the full simulation with spatial indexing and kill accounting',()=>{
  const e=engine(),{g,heavy}=fixture(e),target=new e.Zombie('walker',heavy.x+200,heavy.y);
  g.buildings=[new e.Building('hq',39,39)];g.zombies=[target];g._rebuildFlowField();
  for(let i=0;i<240&&!target.dead;i++)g.update(1/30);
  assert.equal(target.dead,true);assert.equal(g.stats.zombiesKilled,1);assert.equal(heavy.dead,false);
});

for(const death of ['heavy kill','another unit kills the target']) {
  test(`Heavy finds a new target from its charge position before returning home: ${death}`,()=>{
    const e=engine(),{g,heavy}=fixture(e),home={x:heavy.x,y:heavy.y};
    heavy.moveTo(home.x,home.y,g);heavy.update(.01,g);
    const first=new e.Zombie('walker',home.x+200,home.y);
    const next=new e.Zombie('walker',home.x+370,home.y);
    next.dormant=death==='another unit kills the target';
    g.zombies=[first,next];
    assert.ok(Math.hypot(next.x-home.x,next.y-home.y)>e.HEAVY_AGGRO_RADIUS);
    if(death==='heavy kill')run(heavy,g,6,()=>first.dead);
    else {
      run(heavy,g,6,()=>heavy.x>home.x+140);
      g.damageEntity(first,first.hp);
    }
    assert.equal(first.dead,true);
    const x=heavy.x,plans=[],plan=heavy._setDestination.bind(heavy);
    heavy._setDestination=(x,y,game)=>{plans.push({x,y});return plan(x,y,game);};
    heavy.update(.01,g);
    assert.equal(heavy.atkTarget,next,'nearby replacement is acquired before planning a return');
    assert.equal(plans.length,0);assert.ok(heavy.x>=x,'no first step back toward home');
    assert.equal(heavy._heavyCharge.target,next,'the dead target route is discarded');
    assert.deepEqual(JSON.parse(JSON.stringify(heavy.moveTarget)),home);
    run(heavy,g,6,()=>next.dead);assert.equal(next.dead,true);
    heavy.update(.01,g);
    assert.equal(heavy.atkTarget,null);assert.deepEqual(plans.at(-1),home);
    const wp=heavy.waypoints[0];
    assert.ok(wp&&Math.hypot(wp.x-heavy.x,wp.y-heavy.y)<60,'return is replanned from the final fight position');
  });
}

for(const reason of ['dead','out of range','hidden at night']) {
  test(`Heavy resumes its previous order when the remaining target is ${reason}`,()=>{
    const e=engine(),{g,heavy}=fixture(e),first=new e.Zombie('walker',heavy.x+100,heavy.y);
    const destination={x:heavy.x,y:heavy.y+300};
    const next=new e.Zombie('walker',heavy.x+160,heavy.y);
    g.zombies=[first,next];heavy.moveTo(destination.x,destination.y,g);
    g.damageEntity(heavy,1,'zombie',first);heavy.update(.01,g);
    first.dead=true;
    if(reason==='dead')next.dead=true;
    if(reason==='out of range')next.x=heavy.x+e.HEAVY_AGGRO_RADIUS+1;
    if(reason==='hidden at night'){g.gameTime=210;g.fogVisible.fill(0);}
    heavy.update(.01,g);
    assert.equal(heavy.atkTarget,null);assert.ok(heavy.waypoints.length);
    assert.deepEqual(JSON.parse(JSON.stringify(heavy.moveTarget)),destination);
  });
}
