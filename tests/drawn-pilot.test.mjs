import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {measureHeadRoot,rootMotion} from '../tools/brushwork/alignment.mjs';
const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('assets/brushwork/motion-pilot/manifest.json',root),'utf8'));
test('drawn walk pilot has real separately generated frames without changing presentation size',()=>{
  assert.match(manifest.scope,/SE walk-only experiment/);assert.equal(manifest.imageSmoothing,false);
  assert.deepEqual(Object.keys(manifest.actors),['soldier','walker']);
  for(const [id,m]of Object.entries(manifest.actors)){
    assert.equal(m.direction,'SE');assert.equal(m.frames.length,8);assert.equal(m.production.deformation,false);assert.equal(m.production.crossfade,false);
    assert.equal(m.bodyHeight*m.renderScale,21.28);
    const png=readFileSync(new URL('assets/brushwork/motion-pilot/'+m.image,root));assert.equal(png.readUInt32BE(16),8*m.cell.width);assert.equal(png.readUInt32BE(20),m.cell.height);
    assert.equal(new Set(m.frames.map(f=>f.phase)).size,8);
    assert.equal(new Set(m.frames.slice(0,4).map(f=>f.source.scale)).size,1);
    assert.equal(new Set(m.frames.slice(4).map(f=>f.source.scale)).size,1);
    for(const f of m.frames){assert.ok(f.source.rect.w>0&&f.source.rect.h>0);assert.ok(f.source.hip.x>f.source.rect.x&&f.source.hip.x<f.source.rect.x+f.source.rect.w);}
    assert.match(m.alignment.method,/translation only/);
    assert.ok(m.alignment.after.maxStep<.1);assert.ok(m.alignment.after.maxStep<m.alignment.before.maxStep*.05);
    assert.ok(m.alignment.after.wrapStep<.05);
    for(const f of m.frames){assert.ok(Math.hypot(f.alignment.correction.x,f.alignment.correction.y)<=32);assert.ok(Math.hypot(f.alignment.after.x-m.alignment.target.x,f.alignment.after.y-m.alignment.target.y)<=.5);}
  }
  const code=readFileSync(new URL('tools/brushwork/drawn.mjs',root),'utf8');assert.doesNotMatch(code,/drawPose|protectedAction|warp\(/);
});

test('stable head registration ignores the changing foot extent and pose width',()=>{
  const w=60,h=90;
  function pixels(footX,footY){const d=new Uint8ClampedArray(w*h*4);const rect=(x,y,width,height)=>{for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)d[(yy*w+xx)*4+3]=255;};rect(26,12,10,12);rect(18,24,22,32);rect(footX,footY,8,5);return d;}
  assert.deepEqual(measureHeadRoot(pixels(4,79),w,h,70),measureHeadRoot(pixels(47,66),w,h,70));
  assert.throws(()=>measureHeadRoot(new Uint8ClampedArray(w*h*4),w,h,70),/blank sprite/);
});

test('registration statistics include the last-to-first jump and native render scale',()=>{
  assert.deepEqual(rootMotion([{x:0,y:0},{x:3,y:4},{x:0,y:4}],.5),{maxStep:2.5,wrapStep:2,spanX:1.5,spanY:2});
});
