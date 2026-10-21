import * as THREE from 'three';
import {V,Q,armIK} from './rig.mjs';

const ease=(t,a,b)=>THREE.MathUtils.smoothstep(t,a,b);

export function runnerLungePose(bones,t){
 const drive=ease(t,.14,.42)*(1-ease(t,.60,1));
 const windup=ease(t,0,.14)*(1-ease(t,.14,.32));
 const offset=V(0,.035*drive,.28*drive-.035*windup);
 const feet=Object.fromEntries(['l','r'].map(side=>[side,{
  position:bones['foot_'+side].getWorldPosition(V()),
  quaternion:bones['foot_'+side].getWorldQuaternion(Q()),
  pole:bones['calf_'+side].getWorldPosition(V()).sub(bones['thigh_'+side].getWorldPosition(V())),
 }]));
 const pelvis=bones.pelvis,position=pelvis.getWorldPosition(V()).add(offset);
 pelvis.position.copy(pelvis.parent.worldToLocal(position));
 bones.spine_02.quaternion.multiply(Q().setFromAxisAngle(V(1,0,0),.15*drive));
 pelvis.updateWorldMatrix(true,true);
 const errors={};
 for(const side of ['l','r']){
  const target=feet[side].position.clone();
  if(side==='l'){target.z+=.32*drive;target.y+=.065*Math.sin(Math.PI*drive);}
  // Use the existing two-bone solver for the thigh, calf and ankle chain.
  const chain={['upperarm_'+side]:bones['thigh_'+side],['lowerarm_'+side]:bones['calf_'+side],['hand_'+side]:bones['foot_'+side]};
  errors[side]=armIK(chain,side,target,feet[side].pole).error;
  const foot=bones['foot_'+side];
  foot.quaternion.copy(foot.parent.getWorldQuaternion(Q()).invert().multiply(feet[side].quaternion));
  foot.updateWorldMatrix(false,true);
 }
 return {version:'claw-lunge-v1',drive,bodyOffset:offset.toArray(),steppingFoot:'l',plantedFoot:'r',footErrors:errors};
}

export function runnerClawPose(bones,side,t){
 const sign=side==='l'?1:-1,delay=side==='l'?.06:0;
 const time=THREE.MathUtils.clamp((t-delay)/(1-delay),0,1);
 const keys=[
  [0,V(sign*.04,-.10,.21)],
  [.18,V(sign*.17,.10,.15)],
  [.40,V(sign*.10,.04,.43)],
  [.64,V(-sign*.10,-.20,.29)],
  [1,V(sign*.04,-.10,.21)],
 ];
 let index=0;while(index<keys.length-2&&time>keys[index+1][0])index++;
 const [a,from]=keys[index],[b,to]=keys[index+1];
 const reach=from.clone().lerp(to,ease(time,a,b));
 // These samples are solved before facing rotation, so +Z is the actor's travel direction.
 // A crouched chest's local forward axis points down and is unsuitable for the swipe.
 const target=bones['upperarm_'+side].getWorldPosition(V()).add(reach);
 const rake=ease(time,.40,.64)*(1-ease(time,.64,1));
 return {target,pole:V(sign*.8,-1,-.2),
  quaternion:Q().setFromEuler(new THREE.Euler(Math.PI/2+.25*rake,0,-sign*.14))};
}

export function runnerClawFingers(bones,rest,side){
 const sign=side==='l'?1:-1;
 for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){
  const bone=bones[finger+'_0'+n+'_'+side],curl=n===1?.12:n===2?.70:.85;
  bone.quaternion.copy(rest[bone.name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),sign*curl));
 }
}
