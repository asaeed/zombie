import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture(){
 const transforms=[],draws=[],layers=[];
 const make=()=>{const ctx={setTransform:(...a)=>transforms.push(a),clearRect(){},drawImage(){},
  save(){},restore(){},beginPath(){},rect(){},clip(){}};
  const layer={width:0,height:0,getContext:()=>ctx};layers.push(layer);return layer;};
 const context=vm.createContext({document:{createElement:make},TILE:32,MAP_W:20,MAP_H:20,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),screenToWorld:(x,y,c)=>({x:x/c.zoom+c.x,y:y/c.zoom+c.y}),
  worldToScreen:(x,y,c)=>({x:(x-c.x)*c.zoom,y:(y-c.y)*c.zoom}),SCULPTED_WORLD:{ready:true,terrain:{}}});
 vm.runInContext(readFileSync(new URL('../js/renderer.js',import.meta.url),'utf8'),context);
 const Renderer=vm.runInContext('Renderer',context),renderer=Object.create(Renderer.prototype);
 Object.assign(renderer,{W:64,H:48,pixelRatio:2,canvas:{width:128,height:96}});
 renderer.paints=0;renderer._paintTiles=()=>renderer.paints++;
 const visible=new Uint8Array(400).fill(1),explored=new Uint8Array(400).fill(1);
 const game={camera:{x:0,y:0,zoom:1},tiles:Array.from({length:20},()=>new Uint8Array(20)),
  tileVisible:(x,y)=>visible[y*20+x],tileExplored:(x,y)=>explored[y*20+x]};
 const ctx={save(){},restore(){},drawImage:(...a)=>draws.push(a)};
 const fixture={renderer,game,visible,explored,context,draws,layers,transforms};
 fixture.draw=()=>renderer._drawTiles(ctx,fixture.game);return fixture;
}
test('unchanged terrain paints once and reuses one DPR-aware layer on subsequent frames',()=>{
 const f=fixture();for(let n=0;n<10;n++)f.draw();
 assert.equal(f.renderer.paints,1);assert.equal(f.draws.length,10);assert.equal(f.layers.length,1);
 assert.equal(f.layers[0].width,132);assert.equal(f.layers[0].height,100);
 assert.deepEqual(f.transforms,[[2,0,0,2,0,0]]);
});
test('repeated panning reuses two buffers rather than allocating a canvas each frame',()=>{
 const f=fixture();f.draw();
 for(let n=0;n<100;n++){f.game.camera.x+=.5;f.draw();}
 assert.equal(f.layers.length,2);
 assert.ok(f.renderer._groundScratch);
});
for(const [name,change]of Object.entries({
 terrain:f=>f.game.tiles[1][1]=1,
 visibility:f=>f.visible[21]=0,
 exploration:f=>f.explored[21]=0,
 camera:f=>f.game.camera.x+=1,
 zoom:f=>f.game.camera.zoom=1.5,
 pack:f=>vm.runInContext('SCULPTED_WORLD.terrain={}',f.context),
 viewport:f=>{f.renderer.W=80;f.renderer.canvas.width=160;},
 density:f=>{f.renderer.pixelRatio=1;f.renderer.canvas.width=64;f.renderer.canvas.height=48;},
 game:f=>f.game={...f.game},
}))test(`ground cache invalidates for changed ${name}`,()=>{
 const f=fixture();f.draw();change(f);f.draw();f.draw();assert.equal(f.renderer.paints,2);
});
