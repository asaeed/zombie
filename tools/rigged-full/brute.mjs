import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

const V=()=>new THREE.Vector3();
const gaussian=(value,center,radius)=>Math.exp(-(((value-center)/radius)**2));

// A localized bind-pose sculpt of the neutral humanoid, not a scaled actor.
// Bone centers, limb lengths, the head, hands and feet retain their proportions.
export function sculptBrute(object){
 object.updateWorldMatrix(true,true);
 const report={version:'stocky-brute-v1',method:'localized bind-pose mesh sculpt',headVertices:0,maxHeadDisplacement:0,
  alteredVertices:0,belly:{before:{width:0,depth:0},after:{width:0,depth:0}},chest:{before:{width:0,depth:0},after:{width:0,depth:0}},
  features:'stocky humanoid with broader shoulders and upper back, thick arms and a natural waist; original head, torso contours and limb lengths'};
 const bellyBefore=new THREE.Box3(),bellyAfter=new THREE.Box3(),chestBefore=new THREE.Box3(),chestAfter=new THREE.Box3();
 object.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const geometry=mesh.geometry.clone(),positions=geometry.attributes.position,weights=geometry.attributes.skinWeight,indices=geometry.attributes.skinIndex;
  const inverse=mesh.matrixWorld.clone().invert(),bones=mesh.skeleton.bones;
  const limbs=new Map();
  for(const side of ['l','r'])for(const[name,end,bulk]of [['upperarm','lowerarm',.50],['lowerarm','hand',.25],['thigh','calf',.22],['calf','foot',.10]]){
   const a=bones.find(b=>b.name===name+'_'+side),b=bones.find(b=>b.name===end+'_'+side);
   if(a&&b)limbs.set(a.name,{a:a.getWorldPosition(V()),b:b.getWorldPosition(V()),bulk});
  }
  for(let i=0;i<positions.count;i++){
   const point=V().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld),original=point.clone();
   if(point.y>1.52){report.headVertices++;continue;}
   let torso=0;const radial=V();
   for(let k=0;k<4;k++){
    const bone=bones[indices.getComponent(i,k)],weight=weights.getComponent(i,k);if(!weight)continue;
    if(/^(pelvis|spine_0[123])$/.test(bone.name))torso+=weight;
    const limb=limbs.get(bone.name);if(!limb)continue;
    const axis=limb.b.clone().sub(limb.a),t=THREE.MathUtils.clamp(original.clone().sub(limb.a).dot(axis)/axis.lengthSq(),0,1);
    const center=limb.a.clone().addScaledVector(axis,t),offset=original.clone().sub(center);
    // Add radial volume while retaining the longitudinal coordinate and joint centers.
    offset.addScaledVector(axis,-offset.dot(axis)/axis.lengthSq());
    radial.addScaledVector(offset,weight*limb.bulk*(.35+.65*Math.sin(Math.PI*t)));
   }
   point.add(radial);
   if(torso>.01){
    // Preserve the source anatomy: widen the upper back and rib cage gently,
    // rather than replacing the torso with an ellipsoid or projecting the chest.
    const chest=gaussian(original.y,1.35,.20),waist=gaussian(original.y,1.06,.17);
    const taper=THREE.MathUtils.smoothstep(original.y,.88,.98)*(1-THREE.MathUtils.smoothstep(original.y,1.44,1.52));
    point.x*=1+torso*taper*(.28*chest+.06*waist);
    point.z=-.02+(point.z+.02)*(1+torso*taper*(.17*chest+.08*waist));
   }
   if(original.y>.94&&original.y<1.17&&torso>.6){bellyBefore.expandByPoint(original);bellyAfter.expandByPoint(point);}
   if(original.y>1.22&&original.y<1.44&&torso>.6){chestBefore.expandByPoint(original);chestAfter.expandByPoint(point);}
   if(point.distanceToSquared(original)>1e-14)report.alteredVertices++;
   point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
 });
 const before=bellyBefore.getSize(V()),after=bellyAfter.getSize(V());
 report.belly.before={width:before.x,depth:before.z};report.belly.after={width:after.x,depth:after.z};
 const chestBeforeSize=chestBefore.getSize(V()),chestAfterSize=chestAfter.getSize(V());
 report.chest.before={width:chestBeforeSize.x,depth:chestBeforeSize.z};report.chest.after={width:chestAfterSize.x,depth:chestAfterSize.z};
 return report;
}

export function shadeBrute(object){
 object.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||mesh.name!=='SuperHero_Male')return;
  const p=mesh.geometry.attributes.position,colors=mesh.geometry.attributes.color;
  for(let i=0;i<p.count;i++){
   const y=p.getY(i);
   if(y>.18&&y<.92)new THREE.Color(0x7e877f).toArray(colors.array,i*3);
  }
  colors.needsUpdate=true;
 });
}

export function bruteAttackPhase(t){
 // Give the fast extension more samples and shorten the near-static strike hold.
 const strikeTime=u=>u<=.5?u*.64:.32+(u-.5)*1.36;
 const jabPhase=strikeTime(THREE.MathUtils.clamp(t/.65,0,1));
 const crossPhase=strikeTime(THREE.MathUtils.clamp((t-.36)/.64,0,1));
 const crossWeight=THREE.MathUtils.smoothstep(t,.32,.64),followup=crossWeight>=.5;
 // Recover the jab into the cross wind-up instead of dropping to rest between hits.
 const blend=THREE.MathUtils.smoothstep(t,0,.12)*(1-THREE.MathUtils.smoothstep(t,.88,1));
 return {followup,phase:followup?crossPhase:jabPhase,blend,jabPhase,crossPhase,crossWeight};
}

export function isBruteArmBone(name){
 return /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|pinky|ring)_/.test(name);
}

export function bruteArmPose(bodyMatrix,restInverse,side,action,t){
 const delta=bodyMatrix.clone().multiply(restInverse),sign=side==='l'?1:-1;
 const swing=action==='walk'?Math.sin(2*Math.PI*t)*sign:0;
 // Keep the selected original walking pose; use a forward rest for attacks.
 const walking=action==='walk';
 const target=walking?new THREE.Vector3(sign*.33,1.01+.012*Math.abs(swing),-.02+.045*swing)
  :new THREE.Vector3(sign*.30,1.10,.16);
 const pole=new THREE.Vector3(sign*.8,-.15,walking?-.35:-.25);
 const hand=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),walking?0:-.45)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-sign*Math.PI/2))
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI));
 return {target:target.applyMatrix4(delta),pole:pole.transformDirection(delta),
  quaternion:new THREE.Quaternion().setFromRotationMatrix(delta).multiply(hand)};
}

export async function exportBruteModel(object,shape){
 object.userData={...object.userData,customShape:shape};
 const glb=await new GLTFExporter().parseAsync(object,{binary:true,onlyVisible:true});
 return await new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onerror=()=>reject(reader.error);
  reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([glb],{type:'model/gltf-binary'}));
 });
}

// The sprite inspector numbers frames from 1; frame 6 is the chosen ready guard.
export const BRUTE_READY_FRAME=5;
export function createBruteReadyPose(){
 let guard,recovery;
 const capture=bones=>Object.fromEntries(Object.entries(bones).map(([name,bone])=>[name,{
  position:bone.position.clone(),quaternion:bone.quaternion.clone(),
 }]));
 return (bones,frame,count)=>{
  const recoveryStart=count-9;
  if(frame===BRUTE_READY_FRAME)guard=capture(bones);
  if(frame===recoveryStart)recovery=capture(bones);
  if(frame<=recoveryStart)return null;
  if(!guard||!recovery)throw Error('Missing brute recovery poses');
  const blend=THREE.MathUtils.smoothstep(frame,recoveryStart,count-1);
  for(const[name,bone]of Object.entries(bones)){
   bone.position.copy(recovery[name].position).lerp(guard[name].position,blend);
   bone.quaternion.copy(recovery[name].quaternion).slerp(guard[name].quaternion,blend);
  }
  return {fromFrame:recoveryStart+1,toReadyFrame:BRUTE_READY_FRAME+1,blend};
 };
}

export function selectBruteReadyFrames(frames,measurements){
 const source=new Map(measurements.map((r,i)=>[r.action+'/'+r.direction+'/'+r.frame,{image:frames[i],pose:r}]));
 const last=Math.max(...measurements.filter(r=>r.action==='attack').map(r=>r.frame));
 for(let i=0;i<measurements.length;i++){
  const r=measurements[i];
  if(r.action!=='idle'&&(r.action!=='attack'||(r.frame>=BRUTE_READY_FRAME&&r.frame!==last)))continue;
  const selected=source.get('attack/'+r.direction+'/'+BRUTE_READY_FRAME);
  frames[i]=selected.image;
  measurements[i]={...selected.pose,action:r.action,frame:r.frame,phase:r.phase,
   readyPose:{sourceAction:'attack',sourceFrame:BRUTE_READY_FRAME+1}};
 }
}
