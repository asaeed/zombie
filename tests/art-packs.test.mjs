import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('js/diorama-art.js',root),'utf8');
const manifest=JSON.parse(readFileSync(new URL('assets/sculpted-pixel/world/manifest.json',root)));
const sizes=new Map();
for(const record of [...Object.values(manifest.characters),...Object.values(manifest.objects),manifest.terrain]){
  const png=readFileSync(new URL(record.image,new URL('assets/sculpted-pixel/world/',root)));
  sizes.set(record.image.split('/').at(-1),[png.readUInt32BE(16),png.readUInt32BE(20)]);
}

function runtime(search=''){
  const storage=new Map(),requests=[],requestOptions=[];
  const controls={failure:null,gate:null,manifest,registry:null};
  class FakeImage{
    set src(value){this.url=new URL(value,'http://game.test/').href;}
    async decode(){
      if(controls.gate&&this.url.includes('/slow/'))await controls.gate;
      if(controls.failure&&this.url.includes(controls.failure))throw new Error('Image decode failed');
      const size=sizes.get(this.url.split('/').at(-1));
      if(!size)throw new Error('Unknown image');
      [this.naturalWidth,this.naturalHeight]=size;this.complete=true;
    }
  }
  const context=vm.createContext({window:{location:{search}},URL,URLSearchParams,Image:FakeImage,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},console});
  // Install browser APIs after evaluation so tests control boot and switching explicitly.
  vm.runInContext(source,context);
  context.document={baseURI:'http://game.test/',createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8Array(4)})})})};
  context.fetch=async (url,options)=>{
    requests.push(url.href);
    requestOptions.push(options);
    return {ok:true,json:async()=>url.pathname.endsWith('/registry.json')?controls.registry:controls.manifest};
  };
  const evaluate=code=>vm.runInContext(code,context);
  const add=(id,path=id)=>{
    context.entry={id,label:id,manifest:`assets/${path}/manifest.json`};
    evaluate('ART_PACK_CATALOG.packs.push(entry)');
  };
  return {context,evaluate,select:evaluate('selectArtPack'),controls,storage,requests,requestOptions,add};
}

test('packs switch whole units, objects and terrain atomically, preserving state and save keys',async()=>{
  const r=runtime();r.storage.set('dead-zone-rts:auto','existing save');
  r.context.window._game={gameTime:42,selected:['soldier'],carrying:17};
  const game=r.context.window._game;
  assert.equal(await r.select('sculpted'),true);
  assert.equal(r.evaluate('SCULPTED_WORLD.characters.size'),18);
  assert.equal(r.evaluate('SCULPTED_WORLD.objects.size'),14);
  assert.ok(r.evaluate('SCULPTED_WORLD.terrain'));
  assert.equal(r.storage.get('dead-zone-rts:art-pack'),'sculpted');
  const images=r.requests.length;
  await r.select('classic');
  assert.equal(r.evaluate('sculptedActor("soldier")'),null);
  assert.equal(r.evaluate('sculptedObject("hq")'),null);
  assert.equal(r.evaluate('sculptedTerrainFrame(0,1,1)'),null);
  assert.equal(r.evaluate('dioramaPilotImage("sniper")'),null);
  await r.select('sculpted');
  assert.equal(r.requests.length,images,'decoded packs should be reused');
  assert.equal(r.context.window._game,game);
  assert.equal(r.storage.get('dead-zone-rts:auto'),'existing save');
});

test('a failed or incomplete pack keeps the current artwork and preference intact and can retry',async()=>{
  const r=runtime();await r.select('sculpted');r.add('broken');
  const actor=r.evaluate('sculptedActor("soldier")'),terrain=r.evaluate('SCULPTED_WORLD.terrain');
  r.controls.failure='/broken/';
  await assert.rejects(r.select('broken'),/decode failed/);
  assert.equal(r.evaluate('ART_PACK_STATE.active'),'sculpted');
  assert.equal(r.evaluate('sculptedActor("soldier")'),actor);
  assert.equal(r.evaluate('SCULPTED_WORLD.terrain'),terrain);
  assert.equal(r.storage.get('dead-zone-rts:art-pack'),'sculpted');
  r.controls.failure=null;
  const incomplete=structuredClone(manifest);delete incomplete.characters.medic.clips.heal;
  r.controls.manifest=incomplete;
  await assert.rejects(r.select('broken'),/Missing medic\/heal/);
  r.controls.manifest=manifest;
  await r.select('broken');assert.equal(r.evaluate('ART_PACK_STATE.active'),'broken');
});

test('a late pack load never overwrites a newer choice',async()=>{
  const r=runtime();await r.select('sculpted');r.add('slow');
  let finish;r.controls.gate=new Promise(resolve=>{finish=resolve;});
  const slow=r.select('slow');
  await r.select('classic');finish();
  assert.equal(await slow,false);
  assert.equal(r.evaluate('ART_PACK_STATE.active'),'classic');
  assert.equal(r.evaluate('SCULPTED_WORLD.ready'),false);
  assert.equal(r.storage.get('dead-zone-rts:art-pack'),'classic');
});

test('URL selection takes precedence, saved preference survives refresh, and old pilot URLs still work',async()=>{
  for(const[search,stored,expected]of [['','classic','classic'],['?artPack=sculpted','classic','sculpted'],
    ['?artPilot=off','sculpted','classic'],['?artPilot=sculpted','classic','sculpted'],['?artPack=unknown','classic','sculpted']]){
    const r=runtime(search);r.storage.set('dead-zone-rts:art-pack',stored);
    r.controls.registry=JSON.parse(JSON.stringify(r.evaluate('ART_PACK_CATALOG')));
    await r.evaluate('startArtPacks()');
    assert.equal(r.evaluate('ART_PACK_STATE.active'),expected);
    assert.equal(r.storage.get('dead-zone-rts:art-pack'),stored,'boot must not rewrite preferences');
  }
  const pilot=runtime('?artPilot=horror');
  pilot.controls.registry=JSON.parse(JSON.stringify(pilot.evaluate('ART_PACK_CATALOG')));
  await pilot.evaluate('startArtPacks()');assert.equal(pilot.evaluate('ART_PACK_STATE.active'),null);
});

test('registry and image paths cannot escape public assets or accept partial frames',async()=>{
  const r=runtime();
  for(const path of ['../../private.png','https://other.test/assets/a.png','/index.html','assets/a.png?x=1']){
    r.context.path=path;assert.throws(()=>r.evaluate('artPackAssetURL(path)'),/assets directory/);
  }
  assert.equal(r.evaluate('artPackAssetURL("../sniper.png", "http://game.test/assets/sculpted-pixel/world/manifest.json").pathname'),'/assets/sculpted-pixel/sniper.png');
  r.add('out-of-bounds');r.controls.manifest=structuredClone(manifest);
  r.controls.manifest.characters.soldier.clips.idle.directions.S[0].x=100000;
  await assert.rejects(r.select('out-of-bounds'),/frame outside image/);
  assert.equal(r.evaluate('ART_PACK_STATE.active'),null);
  await assert.rejects(r.select('absent'),/Unknown graphics pack/);
});

test('per-pack smoothing is consumed by terrain and actors without changing scale',async()=>{
  const r=runtime();r.controls.manifest={...manifest,imageSmoothing:true,imageSmoothingQuality:'high'};await r.select('sculpted');
  assert.equal(r.evaluate('sculptedActor("soldier").imageSmoothing'),true);
  assert.equal(r.evaluate('sculptedObject("hq").imageSmoothing'),true);
  assert.equal(r.evaluate('sculptedTerrainFrame(0,0,0).imageSmoothing'),true);
  for(const expr of ['sculptedActor("soldier")','sculptedObject("hq")','sculptedTerrainFrame(0,0,0)'])assert.equal(r.evaluate(expr+'.imageSmoothingQuality'),'high');
  assert.equal(r.evaluate('sculptedActor("soldier").metadata.bodyHeight*sculptedActor("soldier").metadata.renderScale'),21.28);
});

test('sampling quality defaults to legacy low and rejects invalid values before replacing a pack',async()=>{
  const r=runtime();await r.select('sculpted');assert.equal(r.evaluate('sculptedActor("soldier").imageSmoothingQuality'),'low');
  r.add('invalid-quality');r.controls.manifest={...manifest,imageSmoothingQuality:'ultra'};
  await assert.rejects(r.select('invalid-quality'),/sampling quality/);assert.equal(r.evaluate('ART_PACK_STATE.active'),'sculpted');
});

test('terrain density is explicit, bounded and retains the logical isometric aspect',()=>{
 const r=runtime();const high=structuredClone(manifest);high.terrain.resolutionScale=4;
 for(const f of high.terrain.frames)for(const k of ['x','y','width','height'])f[k]*=4;
 r.context.high=high;assert.doesNotThrow(()=>r.evaluate('validateArtManifest(high)'));
 for(const scale of [0,-1,1.5,9]){high.terrain.resolutionScale=scale;assert.throws(()=>r.evaluate('validateArtManifest(high)'),/terrain resolution/);}
 high.terrain.resolutionScale=4;high.terrain.frames[0].height=32;
 assert.throws(()=>r.evaluate('validateArtManifest(high)'),/Incomplete terrain/);
});

test('modern pack startup never preloads obsolete pilot images; explicit pilot URLs remain supported',()=>{
 for(const search of ['', '?artPack=sculpted', '?artPack=sculpted&artPilot=horror'])assert.equal(runtime(search).evaluate('DIORAMA_PILOT_IMAGES.size'),0);
 assert.equal(runtime('?artPilot=horror').evaluate('DIORAMA_PILOT_IMAGES.size'),2);
});

test('registry and manifests revalidate across refresh instead of silently reusing outdated metadata',async()=>{
 const r=runtime();r.controls.registry=JSON.parse(JSON.stringify(r.evaluate('ART_PACK_CATALOG')));
 await r.evaluate('startArtPacks()');assert.ok(r.requests.length>=2);
 assert.ok(r.requestOptions.every(options=>options.cache==='no-cache'));
});
