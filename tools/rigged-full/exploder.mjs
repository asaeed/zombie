import * as THREE from 'three';
import {V,Q,armIK} from './rig.mjs';

export function createExploderForwardPose(bones){
 return {bindInverse:bones.spine_02.matrixWorld.clone().invert()};
}

export function applyExploderRunPose(bones,state,rest,t){
 const body=bones.spine_02.matrixWorld.clone().multiply(state.bindInverse),errors={};
 for(const side of ['l','r']){
  const shoulder=bones['upperarm_'+side].getWorldPosition(V()),elbow=bones['lowerarm_'+side].getWorldPosition(V()),hand=bones['hand_'+side];
  const length=shoulder.distanceTo(elbow)+elbow.distanceTo(hand.getWorldPosition(V()));
  // The reach lives in the animated chest's coordinates, so it inherits the
  // jog's bob, lean and twist instead of remaining fixed in world space.
  // A small stride-synced sway keeps the outstretched arms from looking rigid.
  const sway=Math.sin(t*2*Math.PI),bounce=Math.cos(t*4*Math.PI);
  const forward=V(.09*sway,-.08+.045*bounce+(side==='l'?1:-1)*.025*sway,1).transformDirection(body);
  const target=shoulder.clone().addScaledVector(forward,length-.008);
  errors[side]=armIK(bones,side,target,V(side==='l'?1:-1,-.35,0).transformDirection(body));
  const orientation=Q().setFromRotationMatrix(body).multiply(Q().setFromEuler(new THREE.Euler(Math.PI/2,0,0)));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(orientation));
  for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){
   const bone=bones[finger+'_0'+n+'_'+side];
   bone.quaternion.copy(rest[bone.name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),(side==='l'?1:-1)*.35));
  }
  hand.updateWorldMatrix(false,true);
 }
 return {motion:{version:'body-following-reach-v2',source:'Jog_Fwd_Loop',armSpace:'animated chest-local reach',stridePhase:t},handErrors:errors};
}
