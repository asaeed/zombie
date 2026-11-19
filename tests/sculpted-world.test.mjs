import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {CAST,OBJECTS,clipsFor} from '../tools/sculpted-pixel/catalog.mjs';
const root=new URL('../',import.meta.url),base=new URL('assets/sculpted-pixel/world/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
const context=vm.createContext({window:{location:{search:''}},URLSearchParams});
vm.runInContext(readFileSync(new URL('js/diorama-art.js',root),'utf8'),context);
const frameFor=vm.runInContext('sculptedActorFrame',context);
test('sculpted world is the default and explicitly disabled art retains the legacy fallback',()=>{
  assert.equal(vm.runInContext('DIORAMA_PILOT_STYLE',context),'sculpted');
  assert.equal(vm.runInContext('DIORAMA_PILOT_ENABLED',context),true);
  const legacy=vm.createContext({window:{location:{search:'?artPilot=off'}},URLSearchParams});
  vm.runInContext(readFileSync(new URL('js/diorama-art.js',root),'utf8'),legacy);
  assert.equal(vm.runInContext('DIORAMA_PILOT_ENABLED',legacy),false);
});
for(const[type,def]of Object.entries(CAST))test(`${type} has complete actions and runtime frame selection in eight facings`,()=>{
  const metadata=manifest.characters[type],png=readFileSync(new URL(metadata.image,base));
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),record={metadata};
  assert.deepEqual(metadata.footAnchor,{x:(64+(def.paddingX??0))*.75,y:87});
  assert.equal(metadata.cell.width,(128+(def.paddingX??0)*2)*.75);assert.equal(metadata.cell.height,96);
  assert.equal(metadata.group,def.group);assert.ok(Math.abs(metadata.bodyHeight*metadata.renderScale-(def.bodyHeight??76)*def.scale)<.001);
  assert.deepEqual(Object.keys(metadata.clips),clipsFor(def).map(c=>c.name));
  for(const[action,clip]of Object.entries(metadata.clips))for(const direction of metadata.directions){
    assert.equal(clip.directions[direction].length,clipsFor(def).find(c=>c.name===action).frames);
    clip.directions[direction].forEach((frame,index)=>{
      assert.ok(frame.x>=0&&frame.y>=0&&frame.x+frame.width<=width&&frame.y+frame.height<=height);
      const time=(index+.01)/clip.fps;
      const actor={facing:direction,lastMotionAt:action==='walk'?time:-Infinity,
        animDistance:action==='walk'?(index+.01)*metadata.walkStride:0,
        attackAnimStart:action===metadata.strike?0:-Infinity,gatherAnimTime:time};
      assert.deepEqual(JSON.parse(JSON.stringify(frameFor(record,actor,time,['gather','heal','repair'].includes(action)?action:null))),frame);
    });
  }
});
test('all structures, caches, props and the vehicle have anchored raster assets',()=>{
  assert.equal(Object.keys(manifest.objects).length,Object.keys(OBJECTS).length);
  for(const[id,def]of Object.entries(OBJECTS)){
    const meta=manifest.objects[id],png=readFileSync(new URL(meta.image,base));
    assert.equal(png.readUInt32BE(16),meta.width);assert.equal(png.readUInt32BE(20),meta.height);
    assert.ok(meta.width<=def.width+8&&meta.height<=def.height+8);
    assert.ok(meta.footAnchor.x>0&&meta.footAnchor.x<meta.width&&meta.footAnchor.y>0&&meta.footAnchor.y<meta.height);
  }
  assert.equal(manifest.characters.suv.directions.length,8);
  assert.equal(manifest.terrain.frames.length,48);
  for(const type of ['grass','dirt','water'])assert.equal(manifest.terrain.frames.filter(f=>f.type===type).length,16);
});
test('all actors render at half the previous size without moving their anchors',()=>{
  const previous={soldier:.56,scout:.52,builder:.56,medic:.56,heavy:.63,torchbearer:.56,
    runner:.56,brute:.78,spitter:.56,exploder:.61,screamer:.58,boss:.96,
    'walker-cap':.56,'walker-dress':.56,'walker-onearm':.56};
  for(const[type,scale]of Object.entries(previous))assert.equal(CAST[type].scale,scale*.5);
  assert.equal(manifest.characters.suv.renderScale,.4);
  for(const type of ['sniper','walker']){
    const meta=manifest.characters[type];assert.equal(meta.renderScale,.28);
    assert.deepEqual(meta.footAnchor,{x:64,y:116});assert.equal(meta.bodyHeight*meta.renderScale,21.28);
  }
});
test('quiet terrain preserves the tile layout and records its generated source',()=>{
  const meta=manifest.terrain,png=readFileSync(new URL(meta.image,base));
  assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),96);
  assert.match(meta.production.method,/low-contrast/);assert.equal(meta.production.sampleSize,32);
  for(const color of Object.values(meta.baseColors))assert.match(color,/^#[0-9a-f]{6}$/);
  assert.deepEqual(Object.keys(meta.baseColors),['grass','dirt','water']);
  assert.match(meta.production.method,/two-tone/);
  for(const[type,colors]of Object.entries(meta.palette)){
    assert.equal(colors.length,2);assert.equal(colors[0],meta.baseColors[type]);
    colors.forEach(color=>assert.match(color,/^#[0-9a-f]{6}$/));
  }
  const source=readFileSync(new URL(meta.production.source.url,new URL('tools/sculpted-pixel/',root)));
  assert.equal(source.readUInt32BE(16),meta.production.source.width);
  assert.equal(source.readUInt32BE(20),meta.production.source.height);
  for(const[row,type]of ['grass','dirt','water'].entries()){
    for(let variant=0;variant<16;variant++)assert.deepEqual(meta.frames.find(f=>f.type===type&&f.variant===variant),
      {type,variant,x:variant*64,y:row*32,width:64,height:32});
  }
});
