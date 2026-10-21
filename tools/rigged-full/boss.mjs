import * as THREE from 'three';
import {sculptBrute} from './brute.mjs';

export function sculptBoss(object){
 const shape=sculptBrute(object);
 return {...shape,version:'stocky-boss-v1',features:'natural humanoid proportions with local upper-body bulk; unchanged head, hands, feet and limb lengths'};
}

export const isBossFingerBone=name=>/^(thumb|index|middle|pinky|ring)_/.test(name);

export function bossAttackPhase(t){
 return {phase:t,blend:THREE.MathUtils.smoothstep(t,0,.20)*(1-THREE.MathUtils.smoothstep(t,.78,1))};
}

export function bossRestPose(bodyMatrix,restInverse,side,action,t){
 const delta=bodyMatrix.clone().multiply(restInverse),sign=side==='l'?1:-1;
 const walking=action==='walk',sway=walking?Math.sin(2*Math.PI*t)*sign:0;
 // Walking arms hang loosely with a small opposing pendulum swing.
 // Idle is the fighting guard too, so the arms remain ready between punches.
 const target=walking?new THREE.Vector3(sign*.33,1.015+.006*Math.abs(sway),-.015+.05*sway)
  :new THREE.Vector3(sign*.22,1.43,.27);
 const pole=walking?new THREE.Vector3(sign*.7,-.15,-.4):new THREE.Vector3(sign*.18,-1,-.25);
 const hand=walking?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.08*sway)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-sign*Math.PI/2))
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI))
  :new THREE.Quaternion().setFromEuler(new THREE.Euler(1.28,0,0));
 return {target:target.applyMatrix4(delta),pole:pole.transformDirection(delta),
  quaternion:new THREE.Quaternion().setFromRotationMatrix(delta).multiply(hand)};
}

// The inspector is one-based: source frame 6 is the accepted ready pose.
// Retract along the extension instead of using the outward wrist-turn recovery.
export const BOSS_READY_FRAME=5;
export const BOSS_ATTACK_FRAME_INDICES=Object.freeze([
 5,5,5,6,7,8,9,10,11,12,13,14,15,16,17,17,
 17,17,16,15,14,13,12,11,10,9,8,7,6,5,5,5,
]);

export function selectBossFrames(frames,measurements){
 const source=new Map(measurements.map((r,i)=>[r.action+'/'+r.direction+'/'+r.frame,{image:frames[i],pose:r}]));
 for(let i=0;i<measurements.length;i++){
  const r=measurements[i];if(r.action==='walk')continue;
  const sourceFrame=r.action==='idle'?BOSS_READY_FRAME:BOSS_ATTACK_FRAME_INDICES[r.frame];
  const selected=source.get('attack/'+r.direction+'/'+sourceFrame);
  if(!selected)throw Error('Missing boss punch source frame '+sourceFrame);
  frames[i]=selected.image;
  measurements[i]={...selected.pose,action:r.action,frame:r.frame,phase:r.phase,
   armAnimation:{...selected.pose.armAnimation,sourceFrame:sourceFrame+1},
   readyPose:{sourceAction:'attack',sourceFrame:BOSS_READY_FRAME+1}};
 }
}
