import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const context=vm.createContext({window:{innerWidth:1200,innerHeight:900}});
for(const name of ['config','utils','pathfinding','entities','game','renderer'])
  vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),context);
const {Game,Building,Unit,Zombie,Renderer,TILE,MAP_W,MAP_H,DYING_ACTOR_LIFETIME}=vm.runInContext(
  '({Game,Building,Unit,Zombie,Renderer,TILE,MAP_W,MAP_H,DYING_ACTOR_LIFETIME})',context);
function fixture(){const g=new Game();g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));g.buildings=[new Building('hq',39,39)];g.waveTimer=999;g.fogVisible.fill(1);g.fogExplored.fill(1);return g;}

test('dead actors stop gameplay immediately while one temporary death visual remains',()=>{
  const g=fixture(),human=new Unit('soldier',600,600),zombie=new Zombie('walker',650,600);
  human.carrying=20;human.selected=true;g.units=[human];g.selected=[human];g.zombies=[zombie];
  g.damageEntity(human,1000);g.damageEntity(zombie,1000);g.onEntityDied(human);g.onEntityDied(zombie);
  assert.equal(human.dead,true);assert.equal(zombie.dead,true);assert.equal(g.dyingActors.length,2);
  g.update(.01);
  assert.equal(g.units.length,0);assert.equal(g.zombies.length,0);assert.equal(g.selected.length,0);
  assert.equal(g.stats.humansLost,1);assert.equal(g.stats.zombiesKilled,1);assert.equal(g.bundles[0].amount,20);
  assert.equal(g.dyingActors.length,2);g.update(DYING_ACTOR_LIFETIME);assert.equal(g.dyingActors.length,0);
});

test('death visuals are transient and are not replayed after loading a save',()=>{
  const g=fixture(),human=new Unit('builder',600,600);g.units=[human];g.damageEntity(human,1000);
  const save=g.toSaveData();assert.equal('dyingActors' in save,false);
  const loaded=Game.fromSaveData(save);loaded.update(.01);assert.equal(loaded.dyingActors.length,0);assert.equal(loaded.stats.humansLost,1);
});

test('death sprites advance to the fallen pose, fade, and have no health or selection bars',()=>{
  const frames=Array.from({length:16},(_,index)=>({index}));
  const record={metadata:{clips:{die:{fps:12,loop:false,directions:{SE:frames}}}}};
  context.sculptedActor=()=>({death:record});
  const g=fixture(),actor=new Unit('heavy',600,600),effect={actor,startedAt:0};actor.facing='SE';
  const r=Object.create(Renderer.prototype);let draw,health=0;r._drawActorSprite=(ctx,rec,frame)=>{draw={rec,frame,alpha:ctx.globalAlpha};};r._drawHealthBar=()=>health++;
  for(const [time,index] of [[0,0],[.5,6],[1.5,15],[2,15]]) {
    g.gameTime=time;r._drawDyingActor({globalAlpha:1,save(){},restore(){}},g,effect);
    assert.equal(draw.frame.index,index);assert.equal(draw.rec,record);
    assert.ok(time<1.6?draw.alpha===1:draw.alpha>0&&draw.alpha<1);
  }
  assert.equal(health,0);
});

test('every humanoid has a complete directional death clip without changing live animations',()=>{
  const manifest=JSON.parse(readFileSync(new URL('assets/rigged-full/manifest.json',root),'utf8'));
  for(const [id,metadata] of Object.entries(manifest.characters)) {
    if(id==='suv')continue;
    const death=metadata.death;assert.ok(death,id+' death animation');
    const png=readFileSync(new URL('assets/rigged-full/'+death.image,root)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    assert.equal(death.clips.die.loop,false);
    for(const direction of metadata.directions){
      const frames=death.clips.die.directions[direction];assert.equal(frames.length,16);
      for(const f of frames)assert.ok(f.x>=0&&f.y>=0&&f.x+f.width<=width&&f.y+f.height<=height,id+' '+direction+' frame bounds');
    }
    assert.ok(metadata.clips.walk&&metadata.clips.idle);
  }
});
