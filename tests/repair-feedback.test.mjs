import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),context=vm.createContext({window:{innerWidth:1200,innerHeight:900}});
for(const name of ['config','utils','pathfinding','entities','game','renderer'])vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),context);
const {Game,Building,Unit,Renderer,TILE,MAP_W,MAP_H}=vm.runInContext('({Game,Building,Unit,Renderer,TILE,MAP_W,MAP_H})',context);
function fixture(){
  const game=new Game();game.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));game.supplies=1;
  const building=new Building('light',25,25),builder=new Unit('builder',building.x-TILE,building.y);building.hp=118;
  game.buildings=[building];game.units=[builder];return {game,building,builder};
}

test('unaffordable auto repairs explain the shortage once and resume automatically after funding',()=>{
  const {game,building,builder}=fixture();
  for(let i=0;i<100;i++){game.gameTime+=.05;builder.update(.05,game);}
  assert.equal(builder.repairTarget,building);assert.equal(building.hp,118);assert.equal(game.supplies,1);
  assert.equal(builder.canRepairBuilding(building,game),false);assert.equal(builder.repairCooldown,0);
  assert.equal(game.toasts.filter(t=>t.text==='Repairs paused: need 2 supplies').length,1);
  game.supplies=2;assert.equal(builder.canRepairBuilding(building,game),true);builder.update(.05,game);
  assert.equal(building.hp,138);assert.equal(game.supplies,0);assert.equal(builder._repairWaitingForSupplies,false);
});

test('repair animation is shown only when the builder can actually repair its target',()=>{
  const {game,building,builder}=fixture(),renderer=Object.create(Renderer.prototype);builder.repairTarget=building;
  let working;
  context.sculptedActor=()=>({metadata:{bodyHeight:96,renderScale:.266}});
  context.sculptedActorFrame=(_record,_actor,_time,state)=>{working=state;return {};};
  renderer._groundEllipse=()=>{};renderer._drawActorSprite=()=>{};renderer._drawHealthBar=()=>{};
  const ctx=new Proxy({},{get:(t,k)=>k in t?t[k]:()=>{}});
  renderer._drawUnit(ctx,game,builder);assert.equal(working,null,'no pretend repair when supplies are below two');
  game.supplies=2;renderer._drawUnit(ctx,game,builder);assert.equal(working,'repair');
  builder.x-=4*TILE;renderer._drawUnit(ctx,game,builder);assert.equal(working,null,'no repair pose before reaching the building');
  builder.x=building.x;building.hp=building.maxHp;renderer._drawUnit(ctx,game,builder);assert.equal(working,null);
});
