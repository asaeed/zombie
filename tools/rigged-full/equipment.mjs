import * as THREE from 'three';
import {V,Q} from './rig.mjs';
import {palmPosition} from '../rigged-pilot/weapon-rig.mjs';
import {coverSkirtLegs} from './skirt.mjs';
import {createTailoredSkirt} from './tailored-skirt.mjs';
import {createBobHair} from './hair.mjs';
import {pulse} from '../rigged-pilot/math.mjs';
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.8});
function add(parent,shape,color,pos=[0,0,0]){const mesh=new THREE.Mesh(shape,material(color));mesh.position.set(...pos);parent.add(mesh);return mesh;}
const box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
export function appearance(object,role){
 object.traverse(o=>{
  if(!o.isMesh)return;
  if(o.name==='Eyes'){o.material=material(role.group==='zombie'?0x472829:0x28272a);return;}
  if(o.name==='Eyebrows'){o.material=material(0x343b38);return;}
  const g=o.geometry.clone(),p=g.attributes.position,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
   const y=p.getY(i),x=Math.abs(p.getX(i)),skin=y>1.53||(y>1.35&&x>.71),boot=y<.17;
   new THREE.Color(role.group==='zombie'?(boot?0x777c77:y<.92?0xb7bbb4:role.color):(boot?0x29373c:skin?0xd3b28c:y<.96?role.tool==='club'?0x4a5053:0x3d5867:role.color)).toArray(colors,i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));o.geometry=g;o.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9});
  if(role.missing&&o.isSkinnedMesh){
   const weights=g.attributes.skinWeight,indices=g.attributes.skinIndex,removed=new Set();
   for(let i=0;i<p.count;i++){let weight=0;for(let k=0;k<4;k++)if(/^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb).*_l$/.test(o.skeleton.bones[indices.getComponent(i,k)].name))weight+=weights.getComponent(i,k);if(weight>.45)removed.add(i);}
   const index=g.index.array,kept=[];for(let i=0;i<index.length;i+=3)if(![index[i],index[i+1],index[i+2]].some(n=>removed.has(n)))kept.push(index[i],index[i+1],index[i+2]);g.setIndex(kept);
  }
 });
}
export function equipment(object,bones,role,id){
 const body=new THREE.Group();object.add(body);
 const hat=new THREE.Group();object.add(hat);
 const hair=role.hair==='bob'?createBobHair():null;if(hair)hat.add(hair);
 if(role.hat){
  const grey=role.hat==='grey-cap',color=grey?0x777e78:role.hat==='medic'?0xe7e9df:role.color;
  add(hat,new THREE.SphereGeometry(.125,20,12,0,Math.PI*2,0,Math.PI*.55),color,[0,.095,0]);
  if(role.hat.includes('cap'))add(hat,box(.19,.02,.15),color,[0,.075,.105]);
  if(role.hat==='hardhat')add(hat,box(.26,.025,.25),color,[0,.045,0]);
 }
 if(role.group==='unit'){
  add(body,box(.35,.29,role.tool==='kit'?.30:.20),role.tool==='kit'?0xe2e6df:role.color,[0,role.gun?0:.07,role.tool==='kit'?.035:0]);
  if(role.tool==='kit'){add(body,box(.04,.12,.01),0xd45468,[0,.08,.191]);add(body,box(.12,.04,.01),0xd45468,[0,.08,.194]);}
  else for(const x of [-.10,.02,.13])add(body,box(.075,.12,.065),0x697668,[x,role.gun?-.065:0,.13]);
 }
 if(role.marker){
  const positions=id==='spitter'?[[0,.23,.105],[.16,.13,0],[-.16,.13,0],[0,.23,-.12]]:id==='screamer'?[[0,.29,.12],[0,.29,-.12]]:id==='boss'?[[.25,.23,.02],[-.25,.23,.02],[.16,.24,-.15],[-.16,.24,-.15]]:[[.12,.02,.14],[-.12,.02,.14],[0,.14,.17],[.13,.10,-.15],[-.13,.10,-.15]];
  for(const p of positions){const m=add(body,new THREE.SphereGeometry(id==='screamer'?.08:.075,12,8),role.marker,p);m.material.emissive.set(role.marker);m.material.emissiveIntensity=.35;}
 }
 if(id==='exploder')add(body,new THREE.SphereGeometry(.19,16,12),0x7f8980,[0,.02,.025]);
 if(role.missing)add(body,new THREE.SphereGeometry(.066,12,8),0x9ea6a0,[.24,.26,0]);
 const tailored=role.skirt?createTailoredSkirt(object,bones):null,skirt=tailored?add(object,tailored.geometry,0xb4b9b1):null;
 if(skirt)skirt.material.side=THREE.DoubleSide;
 const skirtOcclusion=skirt?coverSkirtLegs(object,tailored.bindWaistY):null;
 const prop=new THREE.Group();object.add(prop);
 if(role.gun){
  add(prop,box(.08,.085,.30),0x263138,[0,0,.12]);
  const barrel=add(prop,new THREE.CylinderGeometry(.018,.021,role.scope?.34:.24,8),0x263138,[0,.013,role.scope?.42:.37]);barrel.rotation.x=Math.PI/2;
  add(prop,box(.15,.09,.15),0x4b574b,[-.065,.03,-.10]);add(prop,box(.055,.12,.05),0x293333,[0,-.055,.04]);
  if(role.scope){const scope=add(prop,new THREE.CylinderGeometry(.028,.028,.18,12),0x1f2c30,[0,.08,.10]);scope.rotation.x=Math.PI/2;}
 }else if(role.tool==='hammer'){
  add(prop,new THREE.CylinderGeometry(.018,.021,.26,8),0x8e795a,[0,.07,0]);add(prop,box(.16,.07,.07),0xa3adb0,[0,.20,0]);
 }else if(role.tool==='club'){
  add(prop,new THREE.CylinderGeometry(.025,.03,.42,10),0x675d52,[0,.15,0]);add(prop,box(.15,.24,.12),0x7f898d,[0,.40,0]);
 }else if(role.tool==='torch'){
  add(prop,new THREE.CylinderGeometry(.022,.025,.35,8),0x685e4a,[0,.12,0]);
  const flame=add(prop,new THREE.SphereGeometry(.06,12,8),0xff9e36,[0,.34,0]);flame.scale.set(1,1.9,1);flame.material.emissive.set(0xff7d25);flame.material.emissiveIntensity=1;
  const core=add(prop,new THREE.SphereGeometry(.035,10,8),0xffe18b,[0,.33,.022]);core.scale.set(1,1.8,1);core.material.emissive.set(0xffd86a);core.material.emissiveIntensity=.7;
 }else if(role.tool==='kit'){
  add(prop,box(.18,.14,.09),0xd8dfd6,[0,-.06,0]);add(prop,box(.03,.09,.015),0xd45468,[0,-.06,.051]);add(prop,box(.09,.03,.015),0xd45468,[0,-.06,.053]);
 }
 return {prop,skirt,skirtOcclusion,measureHair(){if(!hair)return null;const local=bones.Head.matrixWorld.clone().invert().multiply(hair.matrixWorld),identity=new THREE.Matrix4();return {style:hair.userData.style,bone:'Head',headLocalMatrix:local.toArray(),attachmentError:Math.max(...local.elements.map((v,i)=>Math.abs(v-identity.elements[i])))};},updateSkirtOcclusion(){if(skirtOcclusion)skirtOcclusion.update(skirt);},update(action,t,attachment){
  body.position.copy(bones.spine_02.getWorldPosition(V()));if(role.gun)body.position.add(V(0,.07,0));body.quaternion.copy(bones.spine_02.getWorldQuaternion(Q()));
  hat.position.copy(bones.Head.getWorldPosition(V()));hat.quaternion.copy(bones.Head.getWorldQuaternion(Q()));
  if(skirt)tailored.update(skirt);
  if(attachment){prop.position.copy(attachment.position);prop.quaternion.copy(attachment.quaternion);}
  else if(role.tool){
   const hand=role.tool==='hammer'&&action==='repair'?bones.hand_l:bones.hand_r;
   prop.position.copy(palmPosition(hand));
   prop.quaternion.copy(hand.getWorldQuaternion(Q())).multiply(Q().setFromAxisAngle(V(0,0,1),hand===bones.hand_l?-Math.PI/2:Math.PI/2));
   if(action==='gather'||role.tool==='kit'&&action!=='heal'){
    prop.position.copy(V(-.21,-.12,role.tool==='torch'?-.26:-.08).applyMatrix4(bones.spine_02.matrixWorld));prop.quaternion.copy(bones.spine_02.getWorldQuaternion(Q()));
   }
   if(role.tool==='torch'&&action!=='gather')prop.quaternion.setFromAxisAngle(V(1,0,0),action==='attack'?.85*pulse(t):0);
  }
  prop.visible=!!(role.gun||role.tool);
  if(role.tool==='torch')prop.children.filter(m=>m.material.emissiveIntensity>.5).forEach((m,i)=>{m.scale.y=(i?1.8:1.9)*(1+.10*Math.sin(t*Math.PI*4));});
 }};
}
