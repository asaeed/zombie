import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {footPath,solveLeg,walkPose,rigidTransform,bodyBob,MOTION,FACINGS,FRAME_COUNT} from '../tools/brushwork/gait.mjs';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets/brushwork/motion-r5/manifest.json',root))),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('foot travel and lift are periodic with continuous velocities at contact transitions',()=>{
  const h=1e-6;
  for(const at of [0,.6,1]){
    const left=footPath(at-h,18,6),middle=footPath(at,18,6),right=footPath(at+h,18,6);
    for(const key of ['travel','lift','pitch']){assert.ok(Math.abs(left[key]-right[key])<.001);assert.ok(Math.abs((middle[key]-left[key])/h-(right[key]-middle[key])/h)<.01);}
  }
  for(let n=0;n<60;n++)assert.equal(footPath(n/100,18,6).lift,0);
  assert.ok(footPath(.8,18,6).lift>5.9);
});
test('two-bone IK and rigid transforms preserve segment length rather than stretching knees',()=>{
  const hip={x:10,y:20},target={x:45,y:95},pose=solveLeg(hip,target,40,45,-1);
  assert.ok(Math.abs(distance(pose.hip,pose.knee)-40)<1e-9);assert.ok(Math.abs(distance(pose.knee,pose.ankle)-45)<1e-9);
  const m=rigidTransform({x:0,y:0},{x:0,y:40},pose.hip,pose.knee);assert.ok(Math.abs(m.a*m.d-m.b*m.c-1)<1e-9);
});
test('the revised atlas supplies 16 poses, longer/higher steps and coordinated body motion',()=>{
  assert.equal(FRAME_COUNT,16);assert.deepEqual(manifest.directions,FACINGS);
  for(const [kind,actor]of Object.entries(manifest.actors)){
    assert.equal(actor.bodyHeight*actor.renderScale,21.28);assert.equal(actor.production.textureMesh,false);assert.equal(actor.production.independentFrameRedraws,false);assert.equal(actor.production.staticUpperBody,false);assert.deepEqual(actor.production.motion,MOTION[kind]);assert.equal(actor.fps,kind==='soldier'?16:13);
    const png=fs.readFileSync(new URL('assets/brushwork/motion-r5/'+actor.image,root));assert.equal(png.readUInt32BE(16),4096);assert.equal(png.readUInt32BE(20),1280);
    for(const direction of FACINGS){const row=actor.directions[direction];assert.equal(row.frames.length,16);
      for(const [n,frame] of row.frames.entries()){
        const expected=walkPose(row.binding,direction,frame.phase,kind);
        assert.equal(frame.bodyBob,bodyBob(frame.phase,kind));
        frame.joints.forEach((leg,i)=>{assert.equal(leg.planted,expected[i].planted);assert.ok(Math.abs(leg.pitch-expected[i].pitch)<1e-10);for(const joint of ['hip','knee','ankle','requested'])assert.ok(distance(leg[joint],expected[i][joint])<1e-8);});
        frame.joints.forEach((leg,i)=>{const source=row.binding.legs[i];assert.ok(Math.abs(distance(leg.hip,leg.knee)-distance(source.hip,source.knee))<1e-8);assert.ok(Math.abs(distance(leg.knee,leg.ankle)-distance(source.knee,source.ankle))<1e-8);
          // The 16-sample gait must stay continuous at contacts and across the loop.
          for(const joint of ['hip','knee','ankle'])assert.ok(distance(leg[joint],row.frames[(n+1)%16].joints[i][joint])*actor.renderScale<1.25);
        });
      }
      assert.deepEqual(walkPose(row.binding,direction,0,kind),walkPose(row.binding,direction,1,kind));
    }
  }
});
test('opposite legs use alternate support and lift phases without torso repainting',()=>{
  const binding=manifest.actors.soldier.directions.E.binding;
  const a=walkPose(binding,'E',.15,'soldier'),b=walkPose(binding,'E',.65,'soldier');assert.equal(a[0].planted,true);assert.equal(a[1].planted,false);assert.equal(b[0].planted,false);assert.equal(b[1].planted,true);
});
test('body bob is small, twice per cycle, and periodic without changing gait duration',()=>{
  const previous=JSON.parse(fs.readFileSync(new URL('assets/brushwork/motion-r4/manifest.json',root)));
  for(const kind of ['soldier','walker']){const old=previous.actors[kind];assert.ok(Math.abs(MOTION[kind].bob/old.production.motion.bob-.75)<1e-9);assert.ok(MOTION[kind].stride>old.production.motion.stride);assert.ok(MOTION[kind].lift>old.production.motion.lift);assert.equal(manifest.actors[kind].fps,old.fps);}
  for(const kind of ['soldier','walker']){assert.equal(bodyBob(0,kind),bodyBob(1,kind));assert.ok(Math.abs(bodyBob(.25,kind)+MOTION[kind].bob)<1e-9);assert.ok(Math.abs(bodyBob(.5,kind)-MOTION[kind].bob)<1e-9);assert.ok(MOTION[kind].bob*manifest.actors[kind].renderScale<.2);}
  const old=JSON.parse(fs.readFileSync(new URL('assets/brushwork/motion-r3/manifest.json',root)));for(const kind of ['soldier','walker'])assert.equal(16/manifest.actors[kind].fps,32/old.actors[kind].fps);
});
test('the bob moves hips and torso together without translating the ground-foot path',()=>{
  const kind='soldier',binding=manifest.actors[kind].directions.E.binding,phase=.25,pose=walkPose(binding,'E',phase,kind);
  pose.forEach((leg,i)=>{assert.equal(leg.hip.y,binding.legs[i].hip.y+bodyBob(phase,kind));const path=footPath(phase+i*.5,MOTION[kind].stride,MOTION[kind].lift);assert.equal(leg.requested.y,binding.legs[i].ankle.y-path.lift);});
});
