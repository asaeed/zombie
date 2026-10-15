import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {nightColor,NIGHT_LIGHTS} from '../tools/night-world.mjs';

const root=new URL('../',import.meta.url),base=new URL('assets/rigged-full/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));

test('night world sheets preserve dimensions, shared anchors and alpha validation without adding unit sheets',()=>{
  const validation=JSON.parse(readFileSync(new URL('night/validation.json',base)));
  assert.equal(manifest.nightVariants,true);
  for(const [id,meta]of [...Object.entries(manifest.objects),['terrain',manifest.terrain]]){
    const day=readFileSync(new URL(meta.image,base)),night=readFileSync(new URL(meta.nightImage,base));
    assert.equal(day.readUInt32BE(16),night.readUInt32BE(16),id+' width');
    assert.equal(day.readUInt32BE(20),night.readUInt32BE(20),id+' height');
    assert.equal(validation.stats[id].alphaDifferences,0,id+' silhouette');
    assert.notDeepEqual(day,night,id+' has a distinct night palette');
  }
  assert.ok(Object.values(manifest.characters).every(meta=>!meta.nightImage));
  for(const type of ['grass','dirt','water']){
    const day=manifest.terrain.baseColors[type],rgb=[1,3,5].map(i=>parseInt(day.slice(i,i+2),16));
    assert.equal(manifest.terrain.nightBaseColors[type],'#'+nightColor(...rgb).map(n=>n.toString(16).padStart(2,'0')).join(''));
  }
});

test('lights are restricted to world assets and preserve the original material detail',()=>{
  assert.ok(Object.keys(NIGHT_LIGHTS).every(id=>manifest.objects[id]));
  for(const id of ['hq','wall','light','barracks','clinic','mechanics','cabin'])assert.ok(NIGHT_LIGHTS[id].length);
  assert.equal(NIGHT_LIGHTS.bin,undefined);
});

test('rock eligibility is halved while existing tree and bush choices stay unchanged',()=>{
  const requested=[];
  const c=vm.createContext({window:{},SCULPTED_WORLD:{ready:true},
    sculptedObject:kind=>{requested.push(kind);return{image:kind};},
    sculptedObjectRect:(_record,foot)=>({x:foot.x,y:foot.y,width:1,height:1})});
  for(const file of ['config','utils','renderer'])vm.runInContext(readFileSync(new URL(`js/${file}.js`,root),'utf8'),c);
  const {Renderer,TILE,MAP_W,MAP_H}=vm.runInContext('({Renderer,TILE,MAP_W,MAP_H})',c);
  const r=Object.assign(Object.create(Renderer.prototype),{W:12000,H:12000});
  const g={camera:{x:-6000,y:0,zoom:1},buildings:[],caches:[],tileExplored:()=>true,
    tiles:Array.from({length:MAP_H},()=>new Uint8Array(MAP_W))};
  r._addEnvironment([],{},g);
  let previous=0,expected=0,trees=0,bushes=0;
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const seed=((Math.imul(x+17,73856093)^Math.imul(y+31,19349663))>>>0)%1000;
    if(seed>=98&&seed<120)previous++;
    if(seed>=98&&seed<109)expected++;
    if(seed<70)trees++;if(seed>=70&&seed<98)bushes++;
  }
  assert.equal(requested.filter(id=>id==='rock').length,expected);
  assert.ok(Math.abs(expected/previous-.5)<.1);
  assert.equal(requested.filter(id=>id==='pine').length,trees+1);
  assert.equal(requested.filter(id=>id==='bush').length,bushes);
});

test('dusk and dawn blend cached day/night terrain without repainting the whole map',()=>{
  const layers=[],draws=[];
  const create=()=>{const layer={width:0,height:0,getContext:()=>({setTransform(){},clearRect(){},drawImage(){},
    save(){},restore(){},beginPath(){},rect(){},clip(){}})};layers.push(layer);return layer;};
  const c=vm.createContext({document:{createElement:create},TILE:32,MAP_W:20,MAP_H:20,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),screenToWorld:(x,y,cam)=>({x:x/ cam.zoom+cam.x,y:y/cam.zoom+cam.y}),
    SCULPTED_WORLD:{ready:true,terrain:{nightImage:{}}},worldArtworkImage:(record,phase)=>phase?record.nightImage:record.image});
  vm.runInContext(readFileSync(new URL('js/renderer.js',root),'utf8'),c);
  const Renderer=vm.runInContext('Renderer',c),r=Object.assign(Object.create(Renderer.prototype),
    {W:64,H:48,pixelRatio:2,canvas:{width:128,height:96}});
  let paints=0,phase=0;r._paintTiles=()=>paints++;
  const g={camera:{x:0,y:0,zoom:1},tiles:Array.from({length:20},()=>new Uint8Array(20)),
    tileExplored:()=>true,tileVisible:()=>true,darkness:()=>phase};
  const ctx={save(){},restore(){},drawImage:(...args)=>draws.push(args)};
  for(const value of [0,.25,.5,.75,1,.75,.5,.25,0]){phase=value;r._drawTiles(ctx,g);}
  assert.equal(paints,2);assert.equal(draws.length,9);assert.equal(layers.length,2);
  assert.ok(layers.every(layer=>layer.width===132&&layer.height===100));
  const revision=r._groundBlend.revision;g.camera.x+=1;r._drawTiles(ctx,g);
  assert.equal(paints,3);assert.equal(r._groundCache.revision,revision+1);
  const previous=r._groundRevision;r._groundCache=null;phase=.5;r._drawTiles(ctx,g);
  assert.ok(r._groundBlend.revision>previous,'clearing the cache cannot reuse an old blended image');
});
