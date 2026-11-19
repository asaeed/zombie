import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {paletteReference,lockPalette} from '../tools/brushwork/palette.mjs';
const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('assets/brushwork/motion-r2/manifest.json',root),'utf8'));
const rgba=colors=>new Uint8ClampedArray(colors.flat());
test('drawn revision retains twelve paintings in four real facings without changing unit size',()=>{
  assert.deepEqual(manifest.directions,['SE','E','NE','N']);assert.match(manifest.scope,/not a complete gameplay replacement/);assert.equal(manifest.imageSmoothing,false);
  for(const [id,m]of Object.entries(manifest.actors)){
    assert.equal(m.bodyHeight*m.renderScale,21.28);assert.equal(m.fps,id==='soldier'?16:12);assert.equal(m.production.deformation,false);assert.equal(m.production.crossfade,false);assert.equal(m.production.mirrored,false);
    for(const file of [m.image,m.ungradedImage]){const png=readFileSync(new URL('assets/brushwork/motion-r2/'+file,root));assert.equal(png.readUInt32BE(16),m.cell.width*12);assert.equal(png.readUInt32BE(20),m.cell.height*4);}
    for(const [direction,d]of Object.entries(m.directions)){
      assert.equal(d.frames.length,12);assert.ok(d.alignment.after.maxStep<.1);assert.equal(new Set(d.frames.map(f=>f.source.scale)).size,1);assert.equal(new Set(d.frames.map(f=>f.source.rect.row+'/'+f.source.rect.col)).size,12);
      assert.equal(d.source.matteCutoff,224);
      for(const f of d.frames){assert.equal(f.source.image,id+'-'+direction+'.png');assert.ok(Math.hypot(f.alignment.after.x-d.alignment.target.x,f.alignment.after.y-d.alignment.target.y)<=.5);assert.ok(f.color.pixels>100);}
    }
  }
  const registry=JSON.parse(readFileSync(new URL('assets/art-packs/registry.json',root),'utf8'));assert.ok(!JSON.stringify(registry).includes('motion-r2'));
  const code=readFileSync(new URL('tools/brushwork/drawn-r2.mjs',root),'utf8');assert.doesNotMatch(code,/warp\(|drawPose|protectedAction/);assert.doesNotMatch(code,/f\.footX/);
});
test('uniform palette matching preserves alpha and unrelated warm materials',()=>{
  const reference=paletteReference(rgba([[28,62,90,255],[58,105,143,255],[95,146,184,255]]),'blue'),data=rgba([[12,64,156,255],[25,90,205,200],[56,136,250,255],[220,145,103,255],[12,64,156,0]]),before=data.slice();
  lockPalette(data,reference);for(let n=3;n<data.length;n+=4)assert.equal(data[n],before[n]);assert.deepEqual(data.slice(12),before.slice(12));assert.notDeepEqual(data.slice(0,12),before.slice(0,12));
});
test('shared blue palette removes the frame brightness and saturation shift',()=>{
  const reference=paletteReference(rgba([[28,62,90,255],[58,105,143,255],[95,146,184,255]]),'blue');
  for(const colors of [[[12,64,156,255],[25,90,205,255],[56,136,250,255]],[[20,40,60,255],[31,70,100,255],[80,130,170,255]]]){
    const data=rgba(colors),stats=lockPalette(data,reference);assert.ok(Math.abs(stats.after.mean-reference.mean)<.005);assert.ok(Math.abs(stats.after.h-reference.h)<.01);assert.ok(Math.abs(stats.after.s-reference.s)<.015);
  }
});
test('grey palette retains shading but removes warm zombie tints',()=>{
  const reference=paletteReference(rgba([[30,30,30,255],[100,100,100,255],[180,180,180,255]]),'grey'),data=rgba([[72,57,42,255],[150,123,106,210],[220,194,157,255]]);lockPalette(data,reference);
  for(let n=0;n<data.length;n+=4){assert.equal(data[n],data[n+1]);assert.equal(data[n],data[n+2]);}assert.equal(data[7],210);assert.ok(data[0]<data[4]&&data[4]<data[8]);
});
test('palette references reject blank or missing material samples',()=>{
  assert.throws(()=>paletteReference(new Uint8ClampedArray(40),'blue'),/Missing palette samples/);assert.throws(()=>paletteReference(rgba([[220,145,103,255]]),'blue'),/Missing palette samples/);assert.throws(()=>paletteReference(rgba([[1,2,3,255]]),'unknown'),/Unknown palette material/);
});
