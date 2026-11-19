import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {carryRig,palmPosition} from './weapon-rig.mjs';

globalThis.ProgressEvent ||= class{constructor(type,init){Object.assign(this,{type},init);}};
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),dir=path.join(root,'assets/rigged-pilot/source');
const outputArg=process.argv.find(a=>a.startsWith('--output=')),baselineArg=process.argv.find(a=>a.startsWith('--baseline='));
const output=outputArg?outputArg.slice(9):path.join(root,'assets/rigged-pilot/review/mesh-clearance.json');
const V=(...v)=>new THREE.Vector3(...v),Q=()=>new THREE.Quaternion();
const modelPath='assets/rigged-pilot/source/model.gltf',json=JSON.parse(await fs.readFile(path.join(root,modelPath),'utf8'));
const buffers=json.buffers.map(b=>'assets/rigged-pilot/source/'+b.uri);
for(const b of json.buffers)b.uri='data:application/octet-stream;base64,'+(await fs.readFile(path.join(dir,b.uri))).toString('base64');
const loader=new GLTFLoader(),model=await loader.parseAsync(JSON.stringify(json),'');
const data=await fs.readFile(path.join(dir,'animations.glb')),library=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const object=model.scene,bones={},rest={};object.updateWorldMatrix(true,true);
object.traverse(o=>{if(o.isBone){bones[o.name]=o;rest[o.name]={position:o.position.clone(),quaternion:o.quaternion.clone()};}});
const restInverse=bones.spine_02.matrixWorld.clone().invert(),mixer=new THREE.AnimationMixer(object),source=library.animations.find(c=>c.name==='Walk_Loop');
const tracks=[];
for(const track of source.tracks){
 const [name,property]=track.name.split('.'),from=library.scene.getObjectByName(name),to=rest[name];if(!from||!to)continue;
 if(property==='quaternion'){
  const offset=to.quaternion.clone().multiply(from.quaternion.clone().invert()),values=new Float32Array(track.values.length);
  for(let i=0;i<values.length;i+=4)offset.clone().multiply(Q().fromArray(track.values,i)).normalize().toArray(values,i);
  tracks.push(new THREE.QuaternionKeyframeTrack(track.name,track.times,values));
 }else if(property==='position'&&name==='pelvis'){
  const values=Float32Array.from(track.values);for(let i=0;i<values.length;i+=3)for(let k=0;k<3;k++)values[i+k]=to.position.getComponent(k)+(values[i+k]-from.position.getComponent(k))*1.03;
  tracks.push(new THREE.VectorKeyframeTrack(track.name,track.times,values));
 }
}
const animation=mixer.clipAction(new THREE.AnimationClip('audit-walk',source.duration,tracks));
const mesh=object.getObjectByName('SuperHero_Male'),positions=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
const arm=[],torso=[];mesh.skeleton.update();
const point=i=>mesh.applyBoneTransform(i,V().fromBufferAttribute(positions,i)).applyMatrix4(mesh.matrixWorld);
for(let i=0;i<positions.count;i++){
 const p=point(i);let aw=0,tw=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[indices.getComponent(i,k)].name,w=weights.getComponent(i,k);if(['upperarm_l','lowerarm_l','hand_l'].includes(name))aw+=w;if(['spine_01','spine_02','spine_03'].includes(name))tw+=w;}
 // Exclude the naturally connected shoulder seam, not the elbow or forearm.
 if(aw>.5&&p.x>.29)arm.push(i);
 if(tw>.5&&Math.abs(p.x)<.18&&p.y>1&&p.y<1.47)torso.push(i);
}
function aim(bone,child,target){
 const old=child.getWorldPosition(V()).sub(bone.getWorldPosition(V())).normalize(),direction=target.clone().sub(bone.getWorldPosition(V())).normalize();
 const world=Q().setFromUnitVectors(old,direction).multiply(bone.getWorldQuaternion(Q()));bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(world));bone.updateWorldMatrix(false,true);
}
const report={version:1,method:'emitted-joint-source-skin-clearance',armSamples:arm.length,torsoSamples:torso.length,limitations:'Vertex sampling against a core torso convex hull and vest box, excluding the shoulder seam. Not triangle collision, projected readability, or aesthetic approval.',hashes:{},poses:{}};
for(const f of ['assets/rigged-pilot/manifest.json','assets/rigged-pilot/soldier.png',modelPath,...buffers,'assets/rigged-pilot/source/animations.glb','tools/rigged-pilot/weapon-rig.mjs','tools/rigged-pilot/bake.mjs','tools/rigged-pilot/audit-clearance.mjs'])report.hashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
const variants=[['now',path.join(root,'assets/rigged-pilot/manifest.json')]];if(baselineArg)variants.unshift(['before',baselineArg.slice(11)]);
for(const[label,file]of variants){
 const metadata=JSON.parse(await fs.readFile(file,'utf8')),actor=metadata.characters.soldier,support=actor.production.walkSupport;report.poses[label]=[];
 for(const r of actor.production.measurements.filter(r=>r.action==='walk'&&r.direction==='S')){
  mixer.stopAllAction();for(const[n,b]of Object.entries(bones)){b.position.copy(rest[n].position);b.quaternion.copy(rest[n].quaternion);}animation.reset().play();animation.time=r.phase*source.duration;mixer.update(0);object.updateWorldMatrix(true,true);
  const delta=bones.spine_02.matrixWorld.clone().multiply(restInverse);
  if(support?.armRoll==='bind-relative'){
   for(const name of ['clavicle_l','upperarm_l','lowerarm_l'])bones[name].quaternion.copy(rest[name].quaternion);object.updateWorldMatrix(true,true);
   const bone=bones.clavicle_l,world=Q().setFromAxisAngle(V(0,1,0).transformDirection(delta),support.clavicleYaw).multiply(bone.getWorldQuaternion(Q()));bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(world));bone.updateWorldMatrix(false,true);
  }
  const carry=carryRig(bones.spine_02.matrixWorld,restInverse,support?'walk':'idle');let reconstructionError=0;
  for(const side of ['l','r']){
   const pose=r.carryArms[side],upper=bones['upperarm_'+side],lower=bones['lowerarm_'+side],hand=bones['hand_'+side],elbow=V(...pose.elbow).applyMatrix4(delta),wrist=V(...pose.wrist).applyMatrix4(delta);
   aim(upper,lower,elbow);aim(lower,hand,wrist);
   const orientation=side==='l'&&support?Q().fromArray(r.weapon.quaternion).multiply(Q().setFromAxisAngle(V(0,1,0),support.wristYaw)).multiply(Q().setFromEuler(new THREE.Euler(Math.PI/2,0,0))):carry.hands[side].quaternion;
   hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(orientation));
   for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){const name=finger+'_0'+n+'_'+side,b=bones[name];b.quaternion.copy(rest[name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),(side==='l'?1:-1)*(n===1?.9:n===2?1.1:.75)));}
   hand.updateWorldMatrix(false,true);reconstructionError=Math.max(reconstructionError,lower.getWorldPosition(V()).distanceTo(elbow),hand.getWorldPosition(V()).distanceTo(wrist),palmPosition(hand).distanceTo(V(...r.weapon.palms[side].target)));
  }
  object.updateWorldMatrix(true,true);mesh.skeleton.update();
  const hull=new ConvexHull().setFromPoints(torso.map(point)),vestInverse=new THREE.Matrix4().compose(bones.spine_02.getWorldPosition(V()).add(V(0,.07,0)),bones.spine_02.getWorldQuaternion(Q()),V(1,1,1)).invert();
  let inTorso=0,inVest=0,maxTorsoDepth=0,maxVestDepth=0,minVestGap=Infinity;
  for(const i of arm){const p=point(i);if(hull.containsPoint(p)){inTorso++;maxTorsoDepth=Math.max(maxTorsoDepth,Math.min(...hull.faces.map(f=>-f.distanceToPoint(p))));}
   p.applyMatrix4(vestInverse);const offset=[Math.abs(p.x)-.175,Math.abs(p.y)-.145,Math.abs(p.z)-.1];
   if(offset.every(n=>n<0)){inVest++;const depth=Math.min(...offset.map(n=>-n));maxVestDepth=Math.max(maxVestDepth,depth);minVestGap=Math.min(minVestGap,-depth);}else minVestGap=Math.min(minVestGap,Math.hypot(...offset.map(n=>Math.max(0,n))));
  }
  report.poses[label].push({frame:r.frame,inTorso,inVest,maxTorsoDepth,maxVestDepth,minVestGap,reconstructionError});
 }
}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
assert.equal(report.poses.now.length,16);assert.ok(report.armSamples>100&&report.torsoSamples>100);
assert.ok(report.poses.now.every(p=>p.reconstructionError<1e-5&&p.inTorso===0&&p.inVest===0),'walk sleeve still penetrates the sampled torso or vest');
console.log(JSON.stringify({armSamples:report.armSamples,torsoSamples:report.torsoSamples,poses:16,minVestGap:Math.min(...report.poses.now.map(p=>p.minVestGap)),maxReconstructionError:Math.max(...report.poses.now.map(p=>p.reconstructionError)),output},null,2));
