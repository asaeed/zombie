import assert from 'node:assert/strict';
import {test} from 'node:test';
import {actionControls,actionArmWeight,actionArmPose,createActionDeformer} from '../tools/sculpted-pixel/action-rig.mjs';
import {poseParameters} from '../tools/sculpted-pixel/rig.mjs';
const view={legs:[
  {hip:{x:57,y:83},knee:{x:53,y:97},ankle:{x:50,y:109}},
  {hip:{x:71,y:83},knee:{x:75,y:97},ankle:{x:78,y:109}},
]};
test('action arm masks never claim knee and thigh vertices',()=>{
  for(const type of ['soldier','scout','sniper','walker','brute'])for(let direction=0;direction<8;direction++){
    const controls=actionControls(type,'gather',direction);
    for(const leg of view.legs)for(const point of [leg.knee,leg.ankle,{x:leg.knee.x+5,y:leg.knee.y-5}])
      assert.equal(actionArmWeight(point,view,direction,type,controls).weight,0);
  }
});
test('working animations leave the resting arm at rest in every facing',()=>{
  for(const type of ['soldier','scout','sniper'])for(const clip of ['gather','heal','repair'])for(let direction=0;direction<8;direction++){
    const inactive=direction<4?0:1;
    assert.deepEqual(actionArmPose(type,direction,clip,inactive,1,direction<4?.8:-.8),{shoulder:0,elbow:0,lift:0});
    assert.ok(actionArmPose(type,direction,clip,1-inactive,1,.8).lift>0);
  }
});
test('attack and work poses keep planted knees and feet fixed for the whole cycle',()=>{
  for(const type of ['soldier','walker','brute','heavy'])for(const clip of ['attack','gather','heal','repair'])for(let direction=0;direction<8;direction++){
    for(let frame=0;frame<12;frame++){
      const deform=createActionDeformer(type,view,direction,clip,poseParameters(type,direction,clip,frame,12));
      for(const leg of view.legs)for(const point of [leg.knee,leg.ankle,{x:leg.knee.x+5,y:leg.knee.y-5}])
        assert.deepEqual(deform(point),point);
    }
  }
});
test('action-specific controls do not leak between characters and actions',()=>{
  assert.notEqual(actionControls('runner','attack',2).shoulder,actionControls('walker','attack',2).shoulder);
  assert.equal(actionControls('heavy','gather',2).bothArms,true);
  assert.equal(actionControls('soldier','gather',2).bothArms,false);
  assert.equal(actionControls('builder','repair',2).shoulder,.24);
  assert.equal(actionControls('builder','gather',2).shoulder,.36);
});
test('gathering assigns brown glove pixels, not blue trouser pixels, to the hand',()=>{
  const pixels=new Uint8ClampedArray(256*256*4),point={x:74,y:84};
  const i=(point.y*2*256+point.x*2)*4,controls=actionControls('soldier','gather',2);
  pixels.set([16,50,130,255],i);
  assert.equal(actionArmWeight(point,{...view,pixels},2,'soldier',controls).weight,0);
  pixels.set([110,65,32,255],i);
  assert.equal(actionArmWeight(point,{...view,pixels},2,'soldier',controls).weight,1);
});
test('walker swipe cannot pull the upper thigh toward the hand',()=>{
  const point={x:79,y:88},controls=actionControls('walker','attack',1);
  assert.equal(actionArmWeight(point,view,1,'walker',controls).weight,0);
  const deform=createActionDeformer('walker',view,1,'attack',poseParameters('walker',1,'attack',3,8));
  assert.deepEqual(deform(point),point);
});
