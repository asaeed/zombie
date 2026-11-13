import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const c=vm.createContext({window:{innerWidth:1200,innerHeight:900},sculptedObject:()=>null,
  worldArtworkImage:(record,darkness)=>darkness>=1?record.nightImage:record.image});
for(const name of ['config','utils','pathfinding','entities','game','renderer','input'])
  vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),c);
const {Game,Building,Renderer,InputHandler,wallShape,TILE,MAP_W,MAP_H,worldToScreen,screenToWorld}=vm.runInContext(
  '({Game,Building,Renderer,InputHandler,wallShape,TILE,MAP_W,MAP_H,worldToScreen,screenToWorld})',c);
const offsets=[[-1,0],[0,-1],[1,0],[0,1]];
const simple=value=>JSON.parse(JSON.stringify(value));

test('wall ends, straight runs, corners and junctions meet exactly at neighboring tile edges',()=>{
  for(let mask=1;mask<16;mask++) {
    const walls=[new Building('wall',20,20),...offsets.flatMap(([x,y],i)=>mask&(1<<i)?[new Building('wall',20+x,20+y)]:[])];
    const shape=wallShape(walls,20,20);
    for(const [i,[dx,dy]] of offsets.entries()) if(mask&(1<<i)) {
      const axis=dx?'x':'y',seam=(20+(dx>0||dy>0?1:0))*TILE;
      const edgePoints=shape.roofs.flat().filter(p=>p[axis]===seam);
      const neighbor=wallShape(walls,20+dx,20+dy).roofs.flat().filter(p=>p[axis]===seam);
      const orthogonal=dx?'y':'x';
      assert.deepEqual([...new Set(edgePoints.map(p=>p[orthogonal]))].sort(),
        [...new Set(neighbor.map(p=>p[orthogonal]))].sort(),`mask ${mask}, side ${i}`);
      assert.ok(edgePoints.length,'wall extends to the shared edge');
      assert.ok(!shape.edges.some(e=>e.a[axis]===seam&&e.b[axis]===seam),'shared edge has no end cap');
    }
  }
});

test('previews connect existing neighbors exactly as placement does and destroyed walls disconnect',()=>{
  const west=new Building('wall',19,20),north=new Building('wall',20,19),walls=[west,north];
  const preview=wallShape(walls,19,20,{tx:20,ty:20});
  const placed=new Building('wall',20,20);walls.push(placed);
  assert.deepEqual(simple(preview),simple(wallShape(walls,19,20)));
  placed.dead=true;
  assert.deepEqual(simple(wallShape(walls,19,20)),simple(wallShape([west,north],19,20)));
  assert.deepEqual(simple(wallShape([new Building('wall',19,19),new Building('tower',21,20)],20,20)),
    simple(wallShape([],20,20)),'only living cardinal walls connect');
});

test('build ghosts and placed walls draw the same connected wall geometry',()=>{
  const g=new Game();g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));g.supplies=500;
  g.buildings=[new Building('wall',19,20),new Building('wall',20,19)];g.buildMode='wall';
  const r=Object.create(Renderer.prototype),calls=[];
  const ctx=new Proxy({moveTo:(...p)=>calls.push(['move',...p]),lineTo:(...p)=>calls.push(['line',...p])},
    {get:(t,k)=>k in t?t[k]:()=>{}});
  r._drawWall(ctx,g,20,20);const expected=simple(calls);calls.length=0;
  r._drawBuildGhost(ctx,g,{tx:20,ty:20});
  assert.deepEqual(calls.slice(-expected.length),expected);
});

test('wall tops and faces remain selectable after changing their connected orientation',()=>{
  const g=new Game(),b=new Building('wall',20,20);g.buildings=[b,new Building('wall',20,21)];
  const roof=wallShape(g.buildings,20,20).roofs[0];
  const point=worldToScreen(roof.reduce((s,p)=>s+p.x,0)/4,roof.reduce((s,p)=>s+p.y,0)/4,g.camera);
  const world=screenToWorld(point.x,point.y-18*g.camera.zoom,g.camera);
  assert.equal(InputHandler.prototype._getBuildingAt.call({game:g},world.x,world.y),b);
});


test('wall bodies are slim beside characters and corner posts do not repeat on every straight tile',()=>{
  const walls=[20,21,22].map(x=>new Building('wall',x,20));
  const shape=wallShape(walls,21,20),points=shape.roofs.flat();
  const thickness=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  assert.ok(thickness<8,'wall body is thinner than a character body');
  assert.equal(shape.posts.length,0,'straight walls have occasional support posts');
  assert.equal(wallShape(walls,20,20).posts.length,1,'the exposed end retains its stone post');
});

test('connected walls reuse the existing painted wall texture and its night variant',()=>{
  const day={width:259,height:250},night={width:259,height:250};
  c.sculptedObject=()=>({image:day,nightImage:night,imageSmoothing:true,imageSmoothingQuality:'high'});
  const g=new Game();g.buildings=[new Building('wall',20,20),new Building('wall',21,20)];
  const r=Object.create(Renderer.prototype);
  for(const darkness of [0,1]) {
    const draws=[];g.darkness=()=>darkness;
    const ctx=new Proxy({drawImage:(...args)=>draws.push(args)}, {get:(t,k)=>k in t?t[k]:()=>{}});
    r._drawWall(ctx,g,20,20);
    assert.ok(draws.length>2,'painted artwork covers faces, caps and posts');
    assert.ok(draws.every(args=>args[0]===(darkness?night:day)));
    assert.equal(ctx.imageSmoothingEnabled,true);
  }
  c.sculptedObject=()=>null;
});
