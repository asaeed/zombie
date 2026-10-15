import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({window:{innerWidth:1200, innerHeight:900}});
for (const file of ['config','utils','pathfinding','entities','game','art','renderer']) {
  vm.runInContext(readFileSync(new URL(`js/${file}.js`, root), 'utf8'), context,
    {filename:`js/${file}.js`});
}
const {SpatialGrid, Game, Building, Zombie, Renderer, sculptedActorFrame, MAP_W, MAP_H} =
  vm.runInContext('({SpatialGrid, Game, Building, Zombie, Renderer, sculptedActorFrame, MAP_W, MAP_H})', context);

function fixture() {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq',39,39)];
  game.fogVisible.fill(1); game.fogExplored.fill(1);
  return game;
}

test('the spatial broad phase never omits nearby entities, including negative and boundary cells', () => {
  const grid = new SpatialGrid(80), entities = [];
  for (let i=0; i<800; i++) {
    const entity = {x:(i*139)%3500-150, y:(i*271)%3500-150};
    entities.push(entity); grid.add(entity);
  }
  for (const radius of [0,24,44,165,390]) for (let i=0; i<80; i++) {
    const x=(i*163)%3300-80, y=(i*313)%3300-80;
    const candidates = new Set(grid.near(x,y,radius));
    for (const entity of entities) if (Math.hypot(entity.x-x,entity.y-y)<=radius) {
      assert.ok(candidates.has(entity));
    }
    assert.equal([...grid.near(x,y,radius)].length, candidates.size, 'no duplicate candidates');
  }
  const moved = entities[0]; moved.x=2500; moved.y=2500; grid.move(moved);
  assert.ok([...grid.near(2500,2500,1)].includes(moved));
  assert.ok(![...grid.near(-150,-150,1)].includes(moved));
});

test('indexed targeting retains exact ranges, dormant eligibility, special priorities and fog rules', () => {
  const g=fixture();
  g.zombies = [new Zombie('walker',600,600), new Zombie('spitter',650,600),
    new Zombie('walker',610,600), new Zombie('boss',3000,3000)];
  g.zombies[2].dormant=true;
  const expected = [];
  for (const [x,y,r] of [[550,600,100],[650,650,200],[3000,2900,100]]) {
    expected.push([g.nearestZombie(x,y,r),g.nearestZombie(x,y,r,true),g.priorityZombie(x,y,r)]);
  }
  g._zombieGrid=new SpatialGrid(80);
  for (const z of g.zombies) g._zombieGrid.add(z);
  let i=0;
  for (const [x,y,r] of [[550,600,100],[650,650,200],[3000,2900,100]]) {
    assert.deepEqual([g.nearestZombie(x,y,r),g.nearestZombie(x,y,r,true),g.priorityZombie(x,y,r)],expected[i++]);
  }
  g.gameTime=210; g.fogVisible.fill(0);
  assert.equal(g.nearestZombie(600,600,100,true),null);
  assert.equal(g.priorityZombie(600,600,100),null);
});

test('later zombies query the updated bucket when an earlier zombie crosses cells in a tick', () => {
  const g=fixture(), first=new Zombie('walker',600,600), second=new Zombie('walker',1000,600);
  g.zombies=[first,second];
  first.update=()=>{first.x=1001;};
  let found=false;
  second.update=()=>{found=[...g.nearbyZombies(1000,600,10)].includes(first);};
  g.update(.05);
  assert.equal(found,true);
  assert.equal(g._zombieGrid,null, 'the index is not reused after its simulation tick');
  assert.equal(g._screamers,null);
});

test('the cached screamer set still includes a screamer that wakes during the tick', () => {
  const g=fixture(), screamer=new Zombie('screamer',600,600), walker=new Zombie('walker',620,600);
  screamer.dormant=true; g.zombies=[screamer,walker];
  screamer.update=()=>{screamer.dormant=false;};
  let speed=0; walker.update=()=>{speed=g.zombieSpeed(walker);};
  g.update(.05);
  assert.equal(speed,walker.def.speed*1.35);
});

test('idle sprites are fixed while walk, strike and work clips retain their timing', () => {
  const make=name=>({loop:true,fps:10,directions:{S:[{name,index:0},{name,index:1}]}});
  const record={metadata:{directions:['S'],strike:'shoot',walkStride:10,
    clips:{idle:make('idle'),walk:make('walk'),shoot:make('shoot'),gather:make('gather')}}};
  const actor={facing:'S',lastMotionAt:-Infinity,attackAnimStart:-Infinity,animDistance:0};
  for (const time of [0,.15,12.9,10000]) assert.equal(sculptedActorFrame(record,actor,time).index,0);
  actor.lastMotionAt=1; actor.animDistance=15;
  assert.equal(sculptedActorFrame(record,actor,1).name,'walk');
  assert.equal(sculptedActorFrame(record,actor,1).index,1);
  actor.attackAnimStart=5;
  assert.equal(sculptedActorFrame(record,actor,5.15).name,'shoot');
  assert.equal(sculptedActorFrame(record,actor,5.15).index,1);
  actor.gatherAnimTime=.15;
  assert.equal(sculptedActorFrame(record,actor,10,'gather').name,'gather');
  assert.equal(sculptedActorFrame(record,actor,10,'gather').index,1);
});

test('nonoverlapping units never cause bitmap sampling during structure occlusion checks', () => {
  const r=Object.create(Renderer.prototype), rect={x:0,y:0,width:10,height:10};
  r._occlusionUnits=Array.from({length:500},(_,i)=>({key:0,left:100+i,right:105+i,top:0,bottom:10,
    samples:[[100+i,5]]}));
  let reads=0;
  const record={metadata:{width:10,height:10},alpha:new Proxy([],{get(){reads++;return 255;}})};
  assert.equal(r._unitOcclusionAlpha({},[],100,record,rect),1);
  assert.equal(reads,0);
  r._occlusionUnits.push({key:0,left:0,right:10,top:0,bottom:10,
    samples:Array.from({length:9},()=>[5,5])});
  assert.equal(r._unitOcclusionAlpha({},[],100,record,rect),.42);
  assert.equal(reads,9);
});

test('terrain invalidation marks bounded screen blocks and skips tiles outside them', () => {
  const r=Object.create(Renderer.prototype);
  const dirty={columns:10,rows:8,width:1200,height:900,cells:new Uint8Array(80),changed:false};
  r._markGroundDirty(dirty,1197,0,3,900);
  assert.equal(dirty.changed,true);
  assert.equal(dirty.cells.filter(Boolean).length,8);
  assert.equal(r._groundTileDirty(dirty,100,100,64,32),false);
  assert.equal(r._groundTileDirty(dirty,1180,100,64,32),true);
  r._markGroundDirty(dirty,-100,-100,10,10);
  assert.equal(dirty.cells.filter(Boolean).length,8);
});

test('display-resolution sprite rasters are reused, density-aware, and bounded by a 24 MiB LRU', () => {
  const canvases=[], draws=[];
  context.document={createElement(){
    const paint={drawImage(){}};
    const canvas={width:0,height:0,getContext:()=>paint,paint};
    canvases.push(canvas);return canvas;
  }};
  try {
    const r=Object.assign(Object.create(Renderer.prototype),{pixelRatio:1});
    const record={image:{},imageSmoothing:true,imageSmoothingQuality:'high',
      metadata:{renderScale:1,footAnchor:{x:0,y:0}}};
    const ctx={drawImage:(...args)=>draws.push(args)}, foot={x:100,y:200};
    const frame=i=>({x:i*512,y:0,width:512,height:512});
    for(let i=0;i<40;i++)r._drawActorSprite(ctx,record,frame(i),foot,1);
    assert.equal(r._actorRasters.size,24);
    assert.equal(r._actorRasterPixels*4,24*1024*1024);
    r._drawActorSprite(ctx,record,frame(39),foot,1);
    assert.equal(canvases.length,40,'identical poses share the prepared pixels');
    r._drawActorSprite(ctx,record,frame(0),foot,1);
    assert.equal(canvases.length,41,'oldest poses are evicted and can be rebuilt');
    assert.equal(r._actorRasterPixels*4,24*1024*1024);
    r._drawActorSprite(ctx,record,frame(0),foot,.5);
    assert.equal(r._actorRasters.size,1);
    assert.equal(canvases.at(-1).width,256);
    assert.equal(canvases.at(-1).paint.imageSmoothingQuality,'high');
    assert.deepEqual(draws.at(-1).slice(1),[100,200,256,256]);
    r.pixelRatio=2;r._drawActorSprite(ctx,record,frame(0),foot,.5);
    assert.equal(r._actorRasters.size,1);
    assert.equal(canvases.at(-1).width,512);
    r._drawActorSprite(ctx,{...record,image:{}},frame(0),foot,.5);
    assert.equal(r._actorRasters.size,2,'different artwork records never share stale pixels');
    const count=canvases.length;
    r._drawActorSprite(ctx,record,{x:0,y:0,width:10000,height:10000},foot,1);
    assert.equal(canvases.length,count,'oversized sprites bypass the bounded cache');
    assert.equal(draws.at(-1).length,9);
  } finally {delete context.document;}
});
