(() => {
  'use strict';
  const canvas = document.getElementById('sample'), host = document.getElementById('map');
  const renderer = new Renderer(canvas), game = new Game();
  const origin = {x: tileCenterX(40), y: tileCenterY(40)};
  const originIso = worldToScreen(origin.x, origin.y, {x:0,y:0,zoom:1});
  const at = (x, y) => screenToWorld(originIso.x+x, originIso.y+y, {x:0,y:0,zoom:1});
  const specimens = [
    {id:'pine', name:'Original pine', x:-290, y:-50},
    {id:'pine-2', name:'Young pine', x:-90, y:-80, revised:true},
    {id:'pine-3', name:'Broad pine', x:140, y:-40},
    {id:'bush', name:'Original bush', x:-180, y:75},
    {id:'bush-2', name:'Rounded bush', x:70, y:80, revised:true},
    {id:'bush-3', name:'Upright bush', x:280, y:150},
    {id:'rock', name:'Original rock', x:-280, y:180},
    {id:'rock-2', name:'Low boulder', x:-30, y:195},
    {id:'rock-3', name:'Stone cluster', x:140, y:225},
  ].map((p, i) => ({...p, number:i+1, world:at(p.x,p.y)}));
  const backdrop = [
    ['pine',-435,-140], ['pine-2',410,-160],
    ['pine-3',440,210], ['pine-2',355,280], ['bush-3',-390,75],
    ['bush-2',360,-70], ['rock-3',-440,190], ['bush',-155,260],
    ['cabin',330,-125], ['car',355,15],
  ].map(([id,x,y]) => ({id,world:at(x,y)}));
  for (const p of specimens) {
    const item = document.createElement('li');
    if (p.revised) item.dataset.revised = '';
    const number = document.createElement('b'); number.textContent = p.number;
    const text = document.createElement('span'); text.textContent = p.name;
    if (p.revised) {const tag = document.createElement('small'); tag.textContent = 'Revised'; text.append(tag);}
    item.append(number,text); document.getElementById('legend').append(item);
  }
  game.tiles = Array.from({length:MAP_H}, (_,ty) => Uint8Array.from({length:MAP_W}, (_,tx) => {
    const p = worldToScreen(tileCenterX(tx),tileCenterY(ty),{x:0,y:0,zoom:1});
    const x = p.x-originIso.x, y = p.y-originIso.y;
    if (((x+340)/170)**2+((y-285)/76)**2<1) return TILE_WATER;
    return Math.abs(y-(x*.25-10))<19 && x>-520 && x<520 ? TILE_DIRT : TILE_GRASS;
  }));
  game.fogVisible.fill(1); game.fogExplored.fill(1); game.gameTime=60; game.paused=true;
  for (const [type,x,y] of [['soldier',235,15],['scout',285,45]]) {
    const p=at(x,y),unit=new Unit(type,p.x,p.y); unit.facing='SW'; game.units.push(unit);
  }
  const state = {ready:false,fitted:true,queued:false,draws:0,labelRects:[],spriteRects:[]};
  renderer._addEnvironment = function(drawables,ctx,g) {
    for(const p of [...backdrop,...specimens]) {
      const record=sculptedObject(p.id),foot=worldToScreen(p.world.x,p.world.y,g.camera);
      const rect=sculptedObjectRect(record,foot,g.camera.zoom);
      drawables.push({key:p.world.x+p.world.y,draw:()=>{
        ctx.imageSmoothingEnabled=record.imageSmoothing;ctx.imageSmoothingQuality=record.imageSmoothingQuality;
        ctx.drawImage(worldArtworkImage(record,g.darkness()),rect.x,rect.y,rect.width,rect.height);
      }});
    }
  };
  function draw() {
    state.queued=false;
    if(!state.ready||document.hidden)return;
    const ctx=renderer.ctx;
    ctx.fillStyle='#43583e';ctx.fillRect(0,0,renderer.W,renderer.H);
    renderer._drawTiles(ctx,game);renderer._drawEntities(ctx,game);
    state.spriteRects=specimens.map(p=>({id:p.id,...sculptedObjectRect(sculptedObject(p.id),worldToScreen(p.world.x,p.world.y,game.camera),game.camera.zoom)}));
    state.labelRects=[];
    if(document.getElementById('labels').checked) {
      ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='11px monospace';
      for(const p of specimens) {
        const foot=worldToScreen(p.world.x,p.world.y,game.camera),x=foot.x,y=foot.y+16;
        const compact=renderer.W<680;
        ctx.fillStyle=p.revised?'#cba55d':'#233b2b';ctx.strokeStyle=p.revised?'#ffe1a0':'#aab99b';ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.textAlign='center';ctx.fillStyle=p.revised?'#222e22':'#f0f5e8';ctx.fillText(String(p.number),x,y+.5);
        let width=18;
        if(!compact) {
          ctx.textAlign='left';width=ctx.measureText(p.name).width+30;
          ctx.fillStyle='rgba(22,37,25,.88)';ctx.fillRect(x+12,y-10,width-22,20);
          ctx.fillStyle='#edf3e5';ctx.fillText(p.name,x+16,y);
        }
        state.labelRects.push({id:p.id,x:x-9,y:y-10,w:width,h:20});
      }
      ctx.restore();
    }
    document.getElementById('zoom-value').value=Math.round(game.camera.zoom*100)+'%';
    state.draws++;
  }
  function schedule() {if(!state.queued){state.queued=true;requestAnimationFrame(draw);}}
  function fit() {
    game.camera.zoom=clamp(Math.min((renderer.W-54)/800,(renderer.H-60)/530),.35,1.7);
    game.camera.x=originIso.x*game.camera.zoom-renderer.W/2;
    game.camera.y=(originIso.y+30)*game.camera.zoom-renderer.H/2;
    state.fitted=true;schedule();
  }
  function zoomBy(factor,x=renderer.W/2,y=renderer.H/2) {
    const world=screenToWorld(x,y,game.camera);
    game.camera.zoom=clamp(game.camera.zoom*factor,.35,3);
    const after=worldToScreen(world.x,world.y,game.camera);
    game.camera.x+=after.x-x;game.camera.y+=after.y-y;state.fitted=false;schedule();
  }
  function resize() {
    const center=screenToWorld(renderer.W/2,renderer.H/2,game.camera);
    renderer.resize(host.clientWidth,host.clientHeight);
    if(state.fitted)fit();else {centerCameraOn(game.camera,center.x,center.y,renderer.W,renderer.H);schedule();}
  }
  document.getElementById('zoom-in').addEventListener('click',()=>zoomBy(1.25));
  document.getElementById('zoom-out').addEventListener('click',()=>zoomBy(.8));
  document.getElementById('fit').addEventListener('click',fit);
  document.getElementById('labels').addEventListener('change',schedule);
  for(const radio of document.querySelectorAll('[name=phase]'))radio.addEventListener('change',()=>{
    const phase=Number(radio.value);
    game.gameTime=phase===0?60:DAY_LENGTH-CYCLE_TRANSITION+phase*CYCLE_TRANSITION;schedule();
  });
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();const r=canvas.getBoundingClientRect();zoomBy(Math.exp(-e.deltaY*.0015),e.clientX-r.x,e.clientY-r.y);
  },{passive:false});
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:game.camera.x,cy:game.camera.y};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    game.camera.x=drag.cx-e.clientX+drag.x;game.camera.y=drag.cy-e.clientY+drag.y;state.fitted=false;schedule();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
  new ResizeObserver(resize).observe(host);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  async function load() {
    const loading=document.getElementById('loading'),message=document.getElementById('load-message'),retry=document.getElementById('retry');
    loading.hidden=false;retry.hidden=true;message.textContent='Loading artwork';
    try {
      const world=await loadArtPack({manifest:'assets/rigged-full/manifest.json'},progress=>{
        document.getElementById('progress').max=progress.total;document.getElementById('progress').value=progress.loaded;
      });
      Object.assign(SCULPTED_WORLD,world,{errors:[]});state.ready=true;loading.hidden=true;resize();fit();
    }catch(error){message.textContent=error.message;retry.hidden=false;}
  }
  document.getElementById('retry').addEventListener('click',load);
  window.sceneryReview={state,game,renderer,specimens,fit,draw};
  load();
})();
