import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url),base=new URL('assets/rigged-full/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
const production=JSON.parse(readFileSync(new URL('tools/scenery-variants/production.json',root)));
const context=vm.createContext({window:{}});
vm.runInContext(readFileSync(new URL('js/art.js',root),'utf8'),context);
const validate=vm.runInContext('validateArtManifest',context);

test('each scenery family has three real distinct paintings, paired night assets and useful native resolution',()=>{
  validate(manifest);
  for(const family of ['pine','bush','rock']) {
    const ids=manifest.objects[family].variants;
    assert.deepEqual(ids,[family,family+'-2',family+'-3']);
    const hashes=new Set();
    for(const id of ids) {
      const m=manifest.objects[id],day=readFileSync(new URL(m.image,base)),night=readFileSync(new URL(m.nightImage,base));
      hashes.add(createHash('sha256').update(day).digest('hex'));
      assert.equal(day.readUInt32BE(16),m.width);assert.equal(day.readUInt32BE(20),m.height);
      assert.equal(night.readUInt32BE(16),m.width);assert.equal(night.readUInt32BE(20),m.height);
      assert.notDeepEqual(day,night);
      assert.ok(m.footAnchor.x>0&&m.footAnchor.x<m.width);
      assert.ok(m.footAnchor.y>0&&m.footAnchor.y<m.height);
      assert.ok(m.width/m.displaySize.width>=5&&m.height/m.displaySize.height>=5);
    }
    assert.equal(hashes.size,3);
  }
  for(const spec of production.assets) {
    const meta=manifest.objects[spec.id];
    const source=readFileSync(new URL(meta.production.source,root));
    assert.equal(createHash('sha256').update(source).digest('hex'),meta.production.sha256);
    assert.ok(spec.prompt.length>200);
  }
});

test('incomplete extra objects, missing night sheets and invalid variant references block startup',()=>{
  for(const mutate of [
    m=>delete m.objects['pine-2'].nightImage,
    m=>delete m.objects['bush-3'].footAnchor,
    m=>m.objects.rock.variants.push('missing-rock'),
    m=>m.objects.pine.variants.push('hq'),
    m=>m.objects.bush.variants.push('bush-2'),
  ]) {
    const m=structuredClone(manifest);mutate(m);assert.throws(()=>validate(m),/Incomplete object|Missing night artwork|Invalid scenery variants/);
  }
});

test('the revised young pine is smaller and the replacement bush has a full rounded profile',()=>{
  const adult=manifest.objects.pine.displaySize,young=manifest.objects['pine-2'].displaySize;
  assert.ok(young.height<=adult.height*.65&&young.height>=adult.height*.5);
  const bush=manifest.objects['bush-2'].displaySize;
  assert.ok(bush.height/bush.width>.7,'replacement must not be the rejected low horizontal bush');
});

test('variant selection is deterministic, balanced, cached and preserves the original scenery positions and density',()=>{
  const drawn=[];
  const c=vm.createContext({window:{},SCULPTED_WORLD:{ready:true},
    sculptedObject:id=>({metadata:manifest.objects[id],image:id}),
    sculptedObjectRect:(_record,foot)=>({x:foot.x,y:foot.y,width:1,height:1})});
  for(const file of ['config','utils','renderer'])vm.runInContext(readFileSync(new URL(`js/${file}.js`,root),'utf8'),c);
  const {Renderer,MAP_W,MAP_H}=vm.runInContext('({Renderer,MAP_W,MAP_H})',c);
  const r=Object.assign(Object.create(Renderer.prototype),{W:12000,H:12000});
  r._unitOcclusionAlpha=()=>1;
  const g={camera:{x:-6000,y:0,zoom:1},buildings:[],caches:[],tileExplored:()=>true,tileVisible:()=>true,
    tiles:Array.from({length:MAP_H},()=>new Uint8Array(MAP_W))};
  const ctx={globalAlpha:1,drawImage:image=>drawn.push(image)};
  const draw=()=>{const ds=[];r._addEnvironment(ds,ctx,g);for(const d of ds)d.draw();};
  draw();const first=[...drawn],cached=r._environment.props;
  drawn.length=0;draw();assert.deepEqual(drawn,first);assert.equal(r._environment.props,cached);
  r._environment=null;drawn.length=0;draw();assert.deepEqual(drawn,first);
  for(const family of ['pine','bush','rock']) {
    const counts=Object.fromEntries(manifest.objects[family].variants.map(id=>[id,first.filter(name=>name===id).length]));
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    assert.ok(Object.values(counts).every(n=>n/total>.2&&n/total<.45),JSON.stringify(counts));
  }
  const expected=[];
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++) {
    const seed=((Math.imul(x+17,73856093)^Math.imul(y+31,19349663))>>>0)%1000;
    const kind=seed<70?'pine':seed<98?'bush':seed<109?'rock':null;
    if(kind)expected.push(`${x},${y},${kind}`);
  }
  assert.deepEqual(Array.from(cached,p=>`${p.tx},${p.ty},${p.kind}`),expected);
});
