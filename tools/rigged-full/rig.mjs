import * as THREE from 'three';
export const V=(...v)=>new THREE.Vector3(...v),Q=()=>new THREE.Quaternion();
export function aimBone(bone,child,point){
 const current=child.getWorldPosition(V()).sub(bone.getWorldPosition(V())).normalize(),desired=point.clone().sub(bone.getWorldPosition(V())).normalize();
 const world=Q().setFromUnitVectors(current,desired).multiply(bone.getWorldQuaternion(Q()));
 bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(world));bone.updateWorldMatrix(false,true);
}
export function armIK(bones,side,target,pole=V(side==='l'?1:-1,-.3,-.65)){
 const upper=bones['upperarm_'+side],lower=bones['lowerarm_'+side],hand=bones['hand_'+side];
 const start=upper.getWorldPosition(V()),middle=lower.getWorldPosition(V()),end=hand.getWorldPosition(V());
 const a=start.distanceTo(middle),b=middle.distanceTo(end),direction=target.clone().sub(start),distance=Math.min(a+b-.001,Math.max(.02,direction.length()));direction.normalize();
 const endpoint=start.clone().addScaledVector(direction,distance),along=(a*a-b*b+distance*distance)/(2*distance);
 const normal=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize(),joint=start.clone().addScaledVector(direction,along).addScaledVector(normal,Math.sqrt(Math.max(0,a*a-along*along)));
 aimBone(upper,lower,joint);aimBone(lower,hand,endpoint);
 return {error:hand.getWorldPosition(V()).distanceTo(target),lengths:[a,b]};
}
export function retarget(source,rest,clip){
 const tracks=[];
 for(const track of clip.tracks){
  const[name,property]=track.name.split('.'),from=source.getObjectByName(name),to=rest[name];if(!from||!to)continue;
  if(property==='quaternion'){
   const offset=to.quaternion.clone().multiply(from.quaternion.clone().invert()),values=new Float32Array(track.values.length);
   for(let i=0;i<values.length;i+=4)offset.clone().multiply(Q().fromArray(track.values,i)).normalize().toArray(values,i);
   tracks.push(new THREE.QuaternionKeyframeTrack(track.name,track.times,values));
  }else if(property==='position'&&name==='pelvis'){
   const values=Float32Array.from(track.values);
   for(let i=0;i<values.length;i+=3)for(let k=0;k<3;k++)values[i+k]=to.position.getComponent(k)+(values[i+k]-from.position.getComponent(k))*1.03;
   tracks.push(new THREE.VectorKeyframeTrack(track.name,track.times,values));
  }
 }
 return new THREE.AnimationClip(clip.name,clip.duration,tracks);
}
export function resetCarryRoll(bones,rest,bodyInverse){
 for(const name of ['clavicle_l','upperarm_l','lowerarm_l'])bones[name].quaternion.copy(rest[name].quaternion);
 bones.spine_02.parent.updateWorldMatrix(true,true);
 const delta=bones.spine_02.matrixWorld.clone().multiply(bodyInverse),clavicle=bones.clavicle_l;
 const world=Q().setFromAxisAngle(V(0,1,0).transformDirection(delta),-.25).multiply(clavicle.getWorldQuaternion(Q()));
 clavicle.quaternion.copy(clavicle.parent.getWorldQuaternion(Q()).invert().multiply(world));clavicle.updateWorldMatrix(false,true);
}
