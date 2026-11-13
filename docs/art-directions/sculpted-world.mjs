const byId=id=>document.getElementById(id),canvas=byId('scene');
const renderer=new Renderer(canvas),game=new Game();
game.tiles=Array.from({length:MAP_H},(_,y)=>Uint8Array.from({length:MAP_W},(_,x)=>
  x>=32&&x<=48&&y>=33&&y<=50?TILE_DIRT:TILE_GRASS));
for(let y=37;y<=42;y++)for(let x=25;x<=29;x++)game.tiles[y][x]=TILE_WATER;
game.fogExplored.fill(1);game.fogVisible.fill(1);
for(const[type,x,y]of[['hq',36,35],['tower',41,35],['barracks',32,39],['depot',36,40],['clinic',41,39],['mechanics',45,35],['light',45,40],
  ['wall',33,35],['wall',33,36],['wall',33,37]])game.buildings.push(new Building(type,x,y));
for(const[type,x,y]of[['car',47,43],['cabin',30,44],['bin',46,46]]){
  const cache=new Cache(type,x,y);cache.searched=true;cache.amount=180;game.caches.push(cache);
}
Object.keys(UNIT_DEFS).forEach((type,i)=>{
  const u=new Unit(type,tileCenterX(33+i*2.1),tileCenterY(44));
  u.carrying=type==='builder'||type==='scout'?u.carryCapacity*.5:0;game.units.push(u);
});
Object.keys(ZOMBIE_DEFS).forEach((type,i)=>game.zombies.push(new Zombie(type,tileCenterX(33+i*2.1),tileCenterY(49))));
for(let i=1;i<=3;i++){
  const zombie=new Zombie('walker',tileCenterX(33+i*2.1),tileCenterY(46.8));
  zombie._artVariant=i;game.zombies.push(zombie);
}
const vehicle=new Vehicle('suv',tileCenterX(46),tileCenterY(39));game.vehicles.push(vehicle);
const state={playing:true,time:0,motion:'walk',facing:'SE',light:'day'};
renderer.resize=()=>{
  Renderer.prototype.resize.call(renderer,canvas.clientWidth,canvas.clientHeight);
  centerCameraOn(game.camera,tileCenterX(39.5),tileCenterY(41.5),renderer.W,renderer.H);
};
function render(){
  const time=state.time;game.gameTime=state.light==='night'?DAY_LENGTH+NIGHT_LENGTH*.4:DAY_LENGTH*.18;
  game.gameTime+=time%30;
  for(const actor of [...game.units,...game.zombies]){
    actor.facing=state.facing;actor.lastMotionAt=state.motion==='walk'?game.gameTime:-Infinity;
    actor.animDistance=time*(actor.def.speed??90);actor.attackAnimStart=state.motion==='strike'?game.gameTime-time%.8:-Infinity;
    actor.gatherAnimTime=time;
    const art=sculptedActor(actor.type);
    actor.gatherTarget=state.motion==='work'&&art?.metadata.clips.gather&&!art.metadata.work?{}:null;
    actor.repairTarget=state.motion==='work'&&actor.type==='builder'?game.buildings[0]:null;
    actor.supportHome=state.motion==='work'&&actor.type==='medic'?{x:actor.x,y:actor.y}:null;
    actor.healCooldown=actor.supportHome?1:0;
  }
  vehicle._artFacing=state.facing;
  const ctx=renderer.ctx;ctx.fillStyle='#253221';ctx.fillRect(0,0,renderer.W,renderer.H);
  renderer._drawTiles(ctx,game);renderer._drawEntities(ctx,game);renderer._drawLighting(ctx,game);
  ctx.textAlign='center';ctx.font='12px system-ui';ctx.fillStyle='#f0f3dc';ctx.strokeStyle='#151d16';ctx.lineWidth=3;
  for(const actor of game.camera.zoom>=1?[...game.units,...game.zombies,vehicle]:[]){
    const s=worldToScreen(actor.x,actor.y,game.camera),label=actor.type==='suv'?'White SUV':actor.type[0].toUpperCase()+actor.type.slice(1);
    ctx.strokeText(label,s.x,s.y+18*game.camera.zoom);ctx.fillText(label,s.x,s.y+18*game.camera.zoom);
  }
}
for(const id of['motion','facing','light'])byId(id).onchange=()=>{state[id]=byId(id).value;render();};
byId('zoom').oninput=()=>{game.camera.zoom=Number(byId('zoom').value);renderer.resize();render();};
byId('play').onclick=()=>{
  state.playing=!state.playing;const label=state.playing?'Pause':'Play';byId('play').title=label;byId('play').setAttribute('aria-label',label);
  byId('play').querySelector('path').setAttribute('d',state.playing?'M6 3h4v18H6zM14 3h4v18h-4z':'m6 3 14 9-14 9z');
};
window.addEventListener('resize',()=>{renderer.resize();render();});
game.camera.zoom=innerWidth<600?.4:1.5;byId('zoom').value=game.camera.zoom;renderer.resize();
let drag=null;
canvas.onpointerdown=event=>{drag={x:event.clientX,y:event.clientY,cx:game.camera.x,cy:game.camera.y};canvas.setPointerCapture(event.pointerId);};
canvas.onpointermove=event=>{if(drag){game.camera.x=drag.cx-(event.clientX-drag.x);game.camera.y=drag.cy-(event.clientY-drag.y);render();}};
canvas.onpointerup=()=>{drag=null;};canvas.onpointercancel=()=>{drag=null;};
let last=0;
function tick(now){if(state.playing&&last)state.time+=Math.min(.05,(now-last)/1000);last=now;render();requestAnimationFrame(tick);}
window.worldReview={game,renderer,state,render};requestAnimationFrame(tick);
