import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const c=vm.createContext({window:{innerWidth:1200,innerHeight:900,location:{search:''}},URLSearchParams});
for(const id of ['config','utils','pathfinding','entities','game','diorama-art','renderer'])
 vm.runInContext(readFileSync(new URL(`js/${id}.js`,root),'utf8'),c);
const {Game,Building,Unit,Renderer,TILE,MAP_W,MAP_H,buildingGroundRect,buildFlowField,sculptedObjectRect,sculptedObjectHit}=vm.runInContext(
 '({Game,Building,Unit,Renderer,TILE,MAP_W,MAP_H,buildingGroundRect,buildFlowField,sculptedObjectRect,sculptedObjectHit})',c);
function fixture(){const g=new Game();g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));g.supplies=5000;return g;}
test('tower ground contact is smaller without moving its painted south anchor',()=>{
 const b=new Building('tower',20,20),r=buildingGroundRect('tower',20,20),g=fixture();g.buildings=[b];
 assert.equal(b.width,50);assert.equal(b.height,50);assert.equal(r.right,22*TILE);assert.equal(r.bottom,22*TILE);
 assert.equal(g.isTileBlockedForUnits(20,21),false);assert.equal(g.isTileBlockedForUnits(21,21),true);
 assert.equal(g.canOccupyGround(20.5*TILE,21.5*TILE,10),true);
 assert.equal(g.canOccupyGround(20.5*TILE+1,21.5*TILE,10),false);
 assert.equal(g.canOccupyGround(b.x,b.y,10),false);
 const flow=buildFlowField(g.buildings,g.tiles);assert.ok(flow[21][20]);assert.equal(flow[21][21],null);
 const unit=new Unit('soldier',20.5*TILE,21.5*TILE);g.units=[unit];
 assert.equal(g.canPlaceBuilding('tower',20,20),false);g.buildings=[];assert.equal(g.canPlaceBuilding('tower',20,20),true);
 unit.x++;assert.equal(g.canPlaceBuilding('tower',20,20),false);
});
test('a unit arrives beside the tower without overshooting into its base',()=>{
 const g=fixture();g.buildings=[new Building('tower',20,20)];
 const u=new Unit('soldier',19.5*TILE,21.5*TILE);g.units=[u];
 u.moveTo(20.5*TILE,21.5*TILE,g);
 for(let i=0;i<240;i++){g.gameTime+=.05;u.update(.05,g);}
 assert.equal(u.waypoints.length,0);assert.ok(u.x<=20.5*TILE);assert.ok(u.x>20*TILE);
 assert.equal(g.canOccupyGround(u.x,u.y,u.def.radius),true);
});
test('wall footprints and closed diagonal corners are unchanged',()=>{
 const g=fixture();g.buildings=[new Building('wall',20,20),new Building('wall',21,21)];
 assert.equal(g.buildings[0].width,TILE);assert.equal(g.canOccupyGround(21*TILE,21*TILE,10),false);
 assert.equal(g.canOccupyGround(20.5*TILE,21.5*TILE,10),true);
 g.buildings[0].dead=true;assert.equal(g.canOccupyGround(20.5*TILE,20.5*TILE,10),true);
});
test('high-resolution object pixels preserve logical dimensions, pivot and alpha hit testing',()=>{
 const old={metadata:{width:90,height:162,footAnchor:{x:44,y:158}}};
 const fresh={metadata:{width:270,height:486,displaySize:{width:90,height:162},footAnchor:{x:132,y:474}},alpha:new Uint8Array(270*486*4)};
 for(const zoom of [.7,1,2]){
  const a=sculptedObjectRect(old,{x:500,y:400},zoom),b=sculptedObjectRect(fresh,{x:500,y:400},zoom);
  assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
  fresh.alpha[(200*270+100)*4+3]=255;
  assert.equal(sculptedObjectHit(fresh,b,b.x+(100.5/270)*b.width,b.y+(200.5/486)*b.height),true);
  assert.equal(sculptedObjectHit(fresh,b,b.x-1,b.y),false);
 }
});
test('supply meter is above health, thinner, adjacent and absent when empty',()=>{
 const renderer=Object.create(Renderer.prototype),g=fixture(),u=new Unit('soldier',700,700);
 c.unitArtwork={metadata:JSON.parse(readFileSync(new URL('assets/rigged-full/manifest.json',root),'utf8')).characters.soldier};
 vm.runInContext('SCULPTED_WORLD.ready=true; SCULPTED_WORLD.characters.set("soldier",unitArtwork)',c);
 renderer._drawActorSprite=()=>{};
 renderer._groundEllipse=()=>{};
 for(const zoom of [.6,1,2])for(const carrying of [0,10,20]){
  g.camera.zoom=zoom;u.carrying=carrying;
  const fills=[],strokes=[];let health;
  const ctx=new Proxy({fillRect(...r){fills.push({color:this.fillStyle,r});},strokeRect(...r){strokes.push(r);}},
    {get:(target,key)=>key in target?target[key]:()=>{}});
  renderer._drawHealthBar=(_ctx,x,y,w,h,pct)=>{health={x,y,w,h,pct};};
  renderer._drawUnit(ctx,g,u);
  const bars=fills.filter(v=>v.color==='#ffdd44');assert.equal(strokes.length,0);
  if(!carrying){assert.equal(bars.length,0);assert.equal(fills.length,0);}else{
   assert.equal(bars.length,1);const [x,y,w,h]=bars[0].r;
   assert.equal(x,health.x);assert.ok(h<health.h);assert.ok(y+h<health.y);
   assert.ok(Math.abs(health.y-y-h-zoom)<1e-8);assert.ok(Math.abs(w-health.w*carrying/u.carryCapacity)<1e-8);
  }
 }
});
