import * as THREE from 'three';
import {V,Q} from './rig.mjs';
import {pulse} from '../rigged-pilot/math.mjs';

export function createWalkerHandFrames(bones){
 return Object.fromEntries(['l','r'].map(side=>{
  const hand=bones['hand_'+side],local=name=>hand.worldToLocal(bones[name+'_'+side].getWorldPosition(V()));
  const fingers=local('middle_01').normalize(),thumb=local('thumb_01').sub(local('pinky_01'));
  thumb.addScaledVector(fingers,-thumb.dot(fingers)).normalize();
  const normal=thumb.clone().cross(fingers).normalize();
  return [side,{inverse:Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumb,fingers,normal)).invert(),palmNormal:normal.multiplyScalar(side==='l'?-1:1)}];
 }));
}

export function walkerArmPose(bones,restInverse,frames,side,action,t,profile='inward'){
 const sign=side==='l'?1:-1,body=bones.spine_02.matrixWorld.clone().multiply(restInverse);
 const shoulder=bones['upperarm_'+side].getWorldPosition(V()),elbow=bones['lowerarm_'+side].getWorldPosition(V()),wrist=bones['hand_'+side].getWorldPosition(V());
 const length=shoulder.distanceTo(elbow)+elbow.distanceTo(wrist),strike=action==='attack'?pulse(t):0,sway=action==='walk'?Math.sin(t*2*Math.PI):0;
 const reach=V(sign*.04+.04*sway,.02+.025*sign*sway+.76*strike,1).normalize();
 const target=shoulder.addScaledVector(reach.clone().transformDirection(body),length*(.975+.01*strike));
 // Anatomical frames keep mirrored hands consistent. The downward profile
 // relaxes at the wrist with a small stride-following droop.
 const relaxed=profile==='downward',droop=relaxed?.42+.035*sign*sway:.14;
 const fingers=reach.clone().add(V(0,-droop,0)).normalize(),thumb=V(0,1,0);
 thumb.addScaledVector(fingers,-thumb.dot(fingers)).normalize();
 thumb.applyAxisAngle(fingers,sign*THREE.MathUtils.degToRad(relaxed?72:18));
 const normal=thumb.clone().cross(fingers).normalize();
 const quaternion=Q().setFromRotationMatrix(body).multiply(Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumb,fingers,normal))).multiply(frames[side].inverse);
 return {target,quaternion,pole:V(sign*.45,-1,.15).transformDirection(body)};
}

export function relaxedWalkerFingers(bones,rest,frames,side){
 for(const finger of ['thumb','index','middle','ring','pinky'])for(let n=1;n<=3;n++){
  const b=bones[finger+'_0'+n+'_'+side];b.quaternion.copy(rest[b.name].quaternion);
 }
 const hand=bones['hand_'+side];hand.updateWorldMatrix(false,true);
 const palm=frames[side].palmNormal.clone().applyQuaternion(hand.getWorldQuaternion(Q()));
 for(const [finger,curl]of Object.entries({index:.10,middle:.14,ring:.18,pinky:.22}))for(let n=1;n<=3;n++){
  const b=bones[finger+'_0'+n+'_'+side],child=bones[finger+(n===3?'_04_leaf':'_0'+(n+1))+'_'+side];
  const forward=child.getWorldPosition(V()).sub(b.getWorldPosition(V())).normalize(),axis=forward.clone().cross(palm).normalize();
  const rotation=Q().setFromAxisAngle(axis,curl*(n===1?1:n===2?.8:.6)).multiply(b.getWorldQuaternion(Q()));
  b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(rotation));b.updateWorldMatrix(false,true);
 }
}

export function measureWalkerHands(bones,frames,bodyInverse){
 return Object.fromEntries(['l','r'].map(side=>{
  const hand=bones['hand_'+side],fingers=bones['middle_01_'+side].getWorldPosition(V()).sub(hand.getWorldPosition(V())).normalize();
  const thumb=bones['thumb_01_'+side].getWorldPosition(V()).sub(bones['pinky_01_'+side].getWorldPosition(V()));
  thumb.addScaledVector(fingers,-thumb.dot(fingers)).normalize();
  const palm=frames[side].palmNormal.clone().applyQuaternion(hand.getWorldQuaternion(Q()));
  const digits=Object.fromEntries(['index','middle','ring','pinky'].map(finger=>{
   const joints=[1,2,3,4].map(n=>bones[finger+(n===4?'_04_leaf':'_0'+n)+'_'+side].getWorldPosition(V()));
   const length=joints.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(joints[i]),0),span=joints.at(-1).clone().sub(joints[0]);
   return [finger,{extension:span.length()/length,palmCurl:span.dot(palm)}];
  }));
  return [side,{fingers:fingers.transformDirection(bodyInverse).toArray(),thumb:thumb.transformDirection(bodyInverse).toArray(),palm:palm.transformDirection(bodyInverse).toArray(),digits}];
 }));
}
