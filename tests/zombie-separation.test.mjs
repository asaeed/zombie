import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const context=vm.createContext({window:{innerWidth:1440,innerHeight:1000}});
for(const name of ['config','utils','pathfinding','entities','game'])vm.runInContext(readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8'),context);
const {Game,Building,Unit,Zombie,MAP_W,MAP_H}=vm.runInContext('({Game,Building,Unit,Zombie,MAP_W,MAP_H})',context);
function fixture(){
 const game=new Game();game.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));game.buildings=[new Building('hq',40,40)];game.waveTimer=999;game._rebuildFlowField();return game;
}

for(const mode of ['flow','pursuit'])test(`adjacent Brutes ${mode==='flow'?'approaching the base':'pursuing a unit'} walk without rapid steering oscillation`,()=>{
 for(const dt of [1/120,1/60,1/30,.05])for(const spacing of [20,29,36]){
  const game=fixture(),target=new Unit('soldier',1660,1620);
  game.zombies=[new Zombie('brute',1220-spacing/2,1020),new Zombie('brute',1220+spacing/2,1020)];
  if(mode==='pursuit'){game.units=[target];for(const z of game.zombies)z.atkTarget=target;}
  const state=game.zombies.map(z=>({x:z.x,y:z.y,heading:null,direction:null,changes:0,sharpTurns:0,pathLength:0}));
  for(let frame=0;frame<Math.round(10/dt);frame++){
   const positions=game.zombies.map(z=>({x:z.x,y:z.y}));game.update(dt);
   for(let i=0;i<2;i++){
    const z=game.zombies[i],s=state[i],dx=z.x-positions[i].x,dy=z.y-positions[i].y,d=Math.hypot(dx,dy);
    assert.ok(game.canOccupyGround(z.x,z.y,z.def.radius));s.pathLength+=d;
    if(d<.01)continue;
    const direction={x:dx/d,y:dy/d};
    if(frame*dt>.5){
     if(s.heading&&s.heading!==z.facing)s.changes++;
     if(s.direction&&direction.x*s.direction.x+direction.y*s.direction.y<Math.cos(Math.PI/9))s.sharpTurns++;
    }
    s.heading=z.facing;s.direction=direction;
   }
  }
  for(let i=0;i<2;i++){
   const s=state[i],z=game.zombies[i],label=`${mode}, dt=${dt}, spacing=${spacing}, brute=${i}`;
   assert.ok(s.changes<20,label+': direction must not alternate every few frames');
   assert.ok(s.sharpTurns<12,label+': steering remains smooth across spacing boundaries');
   assert.ok(Math.hypot(z.x-s.x,z.y-s.y)>160,label+': both Brutes keep advancing');
   assert.ok(Math.abs(s.pathLength-180)<1e-7,label+': walking speed is preserved');
  }
  assert.ok(Math.hypot(game.zombies[0].x-game.zombies[1].x,game.zombies[0].y-game.zombies[1].y)>29,'avoidance still keeps the bodies apart');
 }
});

test('separation steering is continuous as neighbors cross the body and comfort distances',()=>{
 for(const method of ['_flowMove','_directMoveToward'])for(const neighborType of ['walker','brute','boss']){
  const stepAt=distance=>{
   const game=fixture(),zombie=new Zombie('brute',1000,1000),neighbor=new Zombie(neighborType,1000+distance,1000),target=new Unit('soldier',1000,1600);
   game.zombies=[zombie,neighbor];zombie.atkTarget=target;
   if(method==='_flowMove')zombie._flowMove(1/60,game);
   else zombie._directMoveToward(target.x,target.y,1/60,game);
   return {x:(zombie.x-1000)/.3,y:(zombie.y-1000)/.3,radius:neighbor.def.radius};
  };
  const bodyDistance=15+stepAt(100).radius;
  for(const distance of [bodyDistance,bodyDistance+4]){
   const a=stepAt(distance-.01),b=stepAt(distance+.01);
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.01,method+' '+neighborType+': no sudden steering jump at '+distance);
  }
 }
});
