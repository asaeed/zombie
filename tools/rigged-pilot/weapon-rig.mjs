import * as THREE from 'three';
const V=(...v)=>new THREE.Vector3(...v);
const PALM_OFFSET=V(0,.06,0);
const GRIPS={l:V(0,-.045,.23),r:V(0,-.06,.04)};
const HAND_ORIENTATION=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0));
export const WALK_SUPPORT_YAW=-Math.PI/2;
const WALK_SUPPORT_ORIENTATION=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),WALK_SUPPORT_YAW).multiply(HAND_ORIENTATION);

export function carryRig(bodyMatrix,restBodyInverse,action='idle'){
 const delta=new THREE.Matrix4().multiplyMatrices(bodyMatrix,restBodyInverse);
 const position=V(-.14,1.245,.17).applyMatrix4(delta);
 const forward=V(.832,-.115,.555).normalize();
 const quaternion=new THREE.Quaternion().setFromRotationMatrix(delta).multiply(new THREE.Quaternion().setFromUnitVectors(V(0,0,1),forward));
 const hands={};
 for(const side of ['l','r']){
  const handQuaternion=quaternion.clone().multiply(side==='l'&&action==='walk'?WALK_SUPPORT_ORIENTATION:HAND_ORIENTATION);
  const palm=GRIPS[side].clone().applyQuaternion(quaternion).add(position);
  hands[side]={palm,wrist:palm.clone().sub(PALM_OFFSET.clone().applyQuaternion(handQuaternion)),quaternion:handQuaternion.clone()};
 }
 return {position,quaternion,hands};
}

export function palmPosition(hand){
 return PALM_OFFSET.clone().applyMatrix4(hand.matrixWorld);
}

export function backRig(bodyMatrix,restBodyInverse){
 const delta=new THREE.Matrix4().multiplyMatrices(bodyMatrix,restBodyInverse);
 const forward=V(.42,.907,0).normalize(),up=V(0,0,-1),right=up.clone().cross(forward);
 const orientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
 return {position:V(-.12,1.08,-.25).applyMatrix4(delta),quaternion:new THREE.Quaternion().setFromRotationMatrix(delta).multiply(orientation)};
}
