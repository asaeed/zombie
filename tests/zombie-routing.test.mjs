import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
function engine() {
  const context=vm.createContext({window:{innerWidth:1440,innerHeight:1000}});
  for(const name of ['config','utils','pathfinding','entities','game']) {
    vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),context);
  }
  return {context,...vm.runInContext('({Game,Building,Unit,Zombie,MAP_W,MAP_H,TILE,TILE_WATER,findPath})',context)};
}
function fixture(e) {
  const g=new e.Game();g.tiles=Array.from({length:e.MAP_H},()=>new Uint8Array(e.MAP_W));
  g.fogVisible.fill(1);g.fogExplored.fill(1);g.waveTimer=999;return g;
}
function runZombie(z,g,seconds=60,dt=1/30,until=()=>z.dead) {
  let elapsed=0;
  while(elapsed<seconds&&!until()) {
    z.update(dt,g);elapsed+=dt;
    assert.ok(g.canOccupyGround(z.x,z.y,z.def.radius),'route must never cross water or a structure');
  }
  return elapsed;
}

test('Exploders round either side of a pond and detonate instead of alternating direct pursuit and flow',()=>{
  for(const side of [-1,1])for(const dt of [1/60,1/30,.05]) {
    const e=engine(),g=fixture(e),target=new e.Building('tower',30,20);
    g.buildings=[target];
    for(let y=23;y<=28;y++)for(let x=27;x<=33;x++)g.tiles[y][x]=e.TILE_WATER;
    const z=new e.Zombie('exploder',target.x+side*80,29*e.TILE+12);
    z.atkTarget=target;g.zombies=[z];g._rebuildFlowField();
    let searches=0;const find=e.context.findPath;
    e.context.findPath=(...args)=>{searches++;return find(...args);};
    runZombie(z,g,30,dt);
    assert.equal(z.exploded,true,`${side} pond side at ${dt}s`);
    assert.ok(target.hp<target.maxHp);
    assert.ok(searches>0&&searches<=3,`cached route should not search each frame: ${searches}`);
  }
});

test('all pursuers retain their human target while routing around terrain',()=>{
  for(const type of ['walker','runner','brute','spitter','exploder','screamer','boss']) {
    const e=engine(),g=fixture(e);
    const human=new e.Unit('soldier',30.5*e.TILE,20.5*e.TILE);
    g.units=[human];g.buildings=[new e.Building('hq',10,10)];
    for(let y=23;y<=28;y++)for(let x=27;x<=33;x++)g.tiles[y][x]=e.TILE_WATER;
    const z=new e.Zombie(type,30.5*e.TILE,29*e.TILE+24);z.atkTarget=human;
    g.zombies=[z];g._rebuildFlowField();
    runZombie(z,g,70,1/30,()=>z.dead||human.hp<human.maxHp||g.projectiles.length>0);
    assert.ok(z.dead||human.hp<human.maxHp||g.projectiles.length>0,type+' must reach attack range');
    assert.equal(z.atkTarget,human,type+' must not abandon the waking unit for an unrelated flow destination');
  }
});

test('blocked pursuit attacks a blocking wall when its original target cannot be reached',()=>{
  const e=engine(),g=fixture(e),human=new e.Unit('soldier',20.5*e.TILE,20.5*e.TILE);
  g.units=[human];
  for(let x=18;x<=22;x++)for(let y=18;y<=22;y++) {
    if(x===18||x===22||y===18||y===22)g.buildings.push(new e.Building('wall',x,y));
  }
  const z=new e.Zombie('exploder',20.5*e.TILE,23.5*e.TILE);z.atkTarget=human;g.zombies=[z];g._rebuildFlowField();
  runZombie(z,g,10);
  assert.equal(z.exploded,true);assert.ok(g.buildings.some(b=>b.hp<b.maxHp));
});

test('cached routes invalidate for new terrain layout, moving targets, destroyed targets and save loads',()=>{
  const e=engine(),g=fixture(e),a=new e.Unit('soldier',25.5*e.TILE,20.5*e.TILE);
  const z=new e.Zombie('walker',25.5*e.TILE,29.5*e.TILE);z.atkTarget=a;g.units=[a];g.zombies=[z];
  g._rebuildFlowField();z._followRoute(.01,g,a,true);const original=z._route;
  assert.ok(original);
  g._rebuildFlowField();z._followRoute(.01,g,a);assert.equal(z._route,null);
  z._followRoute(.01,g,a,true);assert.ok(z._route);a.x+=e.TILE;
  z._followRoute(.01,g,a);assert.equal(z._route,null);
  z._followRoute(.01,g,a,true);const save=g.toSaveData();
  assert.equal('_route' in save.zombies[0],false,'routes are transient, not stale paths serialized into saves');
  assert.equal(e.Game.fromSaveData(save).zombies[0]._route,null);
  const hq=new e.Building('hq',30,30);g.buildings=[hq];a.dead=true;
  z.update(.01,g);assert.notEqual(z.atkTarget,a);
});

test('the ordinary open-ground flow remains fast and never invokes per-zombie A*',()=>{
  const e=engine(),g=fixture(e);g.buildings=[new e.Building('hq',40,40)];g._rebuildFlowField();
  const z=new e.Zombie('walker',30.5*e.TILE,30.5*e.TILE);g.zombies=[z];
  let searches=0,nearestCalls=0;const find=e.context.findPath,nearest=g.nearestBuildingTo.bind(g);
  e.context.findPath=(...args)=>{searches++;return find(...args);};
  g.nearestBuildingTo=(...args)=>{nearestCalls++;return nearest(...args);};
  runZombie(z,g,2,1/60);
  assert.equal(searches,0);assert.equal(nearestCalls,0);
});

test('unreachable searches are throttled rather than scanning the map every frame',()=>{
  const e=engine(),g=fixture(e),human=new e.Unit('soldier',30.5*e.TILE,20.5*e.TILE);
  g.units=[human];for(let y=25;y<=26;y++)g.tiles[y].fill(e.TILE_WATER);
  const z=new e.Zombie('walker',30.5*e.TILE,27*e.TILE+10);z.atkTarget=human;g.zombies=[z];
  let searches=0;const find=e.context.findPath;
  e.context.findPath=(...args)=>{searches++;return find(...args);};
  runZombie(z,g,3,1/60);
  assert.ok(searches>0&&searches<=4,`at most one failed search per second: ${searches}`);
});

test('attack-position goals keep the existing A* corner and blocked-goal contracts',()=>{
  const e=engine(),blocked=(x,y)=>(x===11&&y===10)||(x===10&&y===11);
  const path=e.findPath(10.5*e.TILE,10.5*e.TILE,11.5*e.TILE,11.5*e.TILE,blocked);
  assert.ok(path.length>1,'must go around diagonally touching blocked cells');
  assert.equal(e.findPath(10.5*e.TILE,10.5*e.TILE,11.5*e.TILE,10.5*e.TILE,blocked),null);
  const approach=e.findPath(5.5*e.TILE,10.5*e.TILE,11.5*e.TILE,10.5*e.TILE,blocked,{
    isGoal:(x,y)=>x===9&&y===10,goalRadius:2,maxIterations:e.MAP_W*e.MAP_H,
  });
  assert.equal(approach.at(-1).x,9.5*e.TILE);
});
