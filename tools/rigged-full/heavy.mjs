import * as THREE from 'three';
import {V,Q} from './rig.mjs';
import {palmPosition} from '../rigged-pilot/weapon-rig.mjs';

const SWING_START=11/31,SWING_END=22/31;
const keys=[
 {time:0,carry:true,yaw:0,lean:0},
 {time:7/31,armYaw:-100,armElevation:45,weaponElevation:45,extension:.989,yaw:-.30,lean:-.03},
 {time:SWING_START,armYaw:-90,armElevation:-9,weaponElevation:0,extension:.989,yaw:-.30,lean:0},
 {time:SWING_END,armYaw:90,armElevation:-9,weaponElevation:0,extension:.989,yaw:.65,lean:.035},
 {time:27/31,armYaw:0,armElevation:-25,weaponElevation:-12,extension:.75,yaw:.20,lean:.02},
 {time:1,carry:true,yaw:0,lean:0},
];
const radians=THREE.MathUtils.degToRad;
function segment(t){
 let i=0;while(i<keys.length-2&&t>keys[i+1].time)i++;
 return {a:keys[i],b:keys[i+1],mix:THREE.MathUtils.smoothstep(t,keys[i].time,keys[i+1].time)};
}

export function heavyAttackBody(bones,t){
 const {a,b,mix}=segment(t),yaw=THREE.MathUtils.lerp(a.yaw,b.yaw,mix),lean=THREE.MathUtils.lerp(a.lean,b.lean,mix);
 // Let the chest turn through the hit rather than pulling a bent arm across a fixed torso.
 bones.spine_01.quaternion.multiply(Q().setFromAxisAngle(V(0,1,0),yaw*.4));
 bones.spine_02.quaternion.multiply(Q().setFromAxisAngle(V(0,1,0),yaw*.6))
  .multiply(Q().setFromAxisAngle(V(1,0,0),lean));
}

export function heavyClubAttackPose(bones,restInverse,t){
 const {a,b,mix}=segment(t);
 const rise=THREE.MathUtils.smoothstep(t,0,7/31)*(1-THREE.MathUtils.smoothstep(t,7/31,SWING_START));
 const crossing=THREE.MathUtils.smoothstep(t,SWING_START,SWING_END)*(1-THREE.MathUtils.smoothstep(t,SWING_END,1));
 const clavicle=bones.clavicle_r;
 const shoulderRotation=Q().setFromAxisAngle(V(0,1,0),.22*crossing)
  .multiply(Q().setFromAxisAngle(V(0,0,1),-.10*rise)).multiply(clavicle.getWorldQuaternion(Q()));
 clavicle.quaternion.copy(clavicle.parent.getWorldQuaternion(Q()).invert().multiply(shoulderRotation));
 clavicle.updateWorldMatrix(false,true);
 const delta=bones.spine_02.matrixWorld.clone().multiply(restInverse);
 const carryPosition=V(-.29,1.23,.23).applyMatrix4(delta);
 const carryQuaternion=Q().setFromRotationMatrix(delta).multiply(Q().setFromUnitVectors(V(0,1,0),V(0,.12,1).normalize()));
 const carryHand=carryQuaternion.clone().multiply(Q().setFromAxisAngle(V(0,0,1),-Math.PI/2));
 const carryWrist=carryPosition.clone().sub(V(0,.06,0).applyQuaternion(carryHand));
 const shoulder=bones.upperarm_r.getWorldPosition(V()),elbow=bones.lowerarm_r.getWorldPosition(V()),hand=bones.hand_r.getWorldPosition(V());
 const length=shoulder.distanceTo(elbow)+elbow.distanceTo(hand);
 const carryDirection=carryWrist.clone().sub(shoulder),carryLength=carryDirection.length();carryDirection.normalize();
 const carry={yaw:Math.atan2(carryDirection.x,carryDirection.z),elevation:Math.asin(carryDirection.y),length:carryLength,quaternion:carryQuaternion};
 const control=key=>key.carry?carry:{yaw:radians(key.armYaw),elevation:radians(key.armElevation),length:length*key.extension,
  quaternion:Q().setFromAxisAngle(V(0,1,0),radians(key.armYaw)).multiply(Q().setFromAxisAngle(V(1,0,0),Math.PI/2-radians(key.weaponElevation)))};
 const from=control(a),to=control(b),angle=THREE.MathUtils.lerp(from.yaw,to.yaw,mix),elevation=THREE.MathUtils.lerp(from.elevation,to.elevation,mix),reach=THREE.MathUtils.lerp(from.length,to.length,mix);
 const direction=V(Math.sin(angle)*Math.cos(elevation),Math.sin(elevation),Math.cos(angle)*Math.cos(elevation));
 // The shoulder-to-wrist arc drives the strike. The prop follows the palm afterwards.
 const wrist=shoulder.clone().addScaledVector(direction,reach),quaternion=from.quaternion.clone().slerp(to.quaternion,mix);
 const handQuaternion=quaternion.clone().multiply(Q().setFromAxisAngle(V(0,0,1),-Math.PI/2));
 const position=wrist.clone().add(V(0,.06,0).applyQuaternion(handQuaternion));
 return {position,quaternion,wrist,pole:V(0,-1,.15),
  swing:{phase:t<SWING_START?'windup':t<=SWING_END?'swing':'recovery',angleDegrees:THREE.MathUtils.radToDeg(angle),extension:reach/length}};
}

export function heavyWalkingClubPose(bones,rest){
 // Leave the authored walking arm free. The closed palm drives the club;
 // the club never pulls the wrist toward a fixed carry target.
 for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){
  const bone=bones[finger+'_0'+n+'_r'];
  bone.quaternion.copy(rest[bone.name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),-(n===1?.9:n===2?1.1:.75)));
 }
 const hand=bones.hand_r,forearm=hand.getWorldPosition(V()).sub(bones.lowerarm_r.getWorldPosition(V())).normalize();
 const authored=hand.getWorldQuaternion(Q()),shaft=V(-1,0,0).applyQuaternion(authored);
 // Turn the grip so the club hangs down alongside the forearm. Preserve the
 // source shoulder, elbow and wrist positions and all of their walking swing.
 const grip=Q().setFromUnitVectors(shaft,forearm).multiply(authored);
 hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(grip));
 hand.updateWorldMatrix(false,true);
 return {position:palmPosition(hand),quaternion:hand.getWorldQuaternion(Q()).multiply(Q().setFromAxisAngle(V(0,0,1),Math.PI/2))};
}
