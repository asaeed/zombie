import * as THREE from 'three';
import {V} from './rig.mjs';

export const SKIRT_STEP_WEIGHT=.5;
export function measureSkirtFit(skirt){
 if(!skirt.userData.fit)throw Error('Skirt must be fitted to the body before measurement');
 return skirt.userData.fit;
}
export function shortenSkirtSteps(bones,idlePose){
 const floor=Math.min(...['l','r'].map(side=>bones['foot_'+side].getWorldPosition(V()).y));
 for(const [name,bone]of Object.entries(bones))if(/^(thigh|calf|foot|ball)_/.test(name))bone.quaternion.copy(idlePose[name].quaternion.clone().slerp(bone.quaternion,SKIRT_STEP_WEIGHT));
 bones.pelvis.updateWorldMatrix(true,true);
 const raised=Math.min(...['l','r'].map(side=>bones['foot_'+side].getWorldPosition(V()).y));
 const pelvis=bones.pelvis,position=pelvis.getWorldPosition(V());position.y+=floor-raised;
 pelvis.position.copy(pelvis.parent.worldToLocal(position));pelvis.updateWorldMatrix(true,true);
 return {version:'short-skirt-steps-v1',stepWeight:SKIRT_STEP_WEIGHT,source:'Walk_Loop'};
}

export function coverSkirtLegs(object,bindWaistY){
 const legMeshes=[],hemPlane=new THREE.Plane(),sources=[];
 object.traverse(mesh=>{if(mesh.isSkinnedMesh)sources.push(mesh);});
 for(const mesh of sources){
  // Clip the torso along the fixed bind-pose waist surface. The same triangles
  // carry the garment anchors, so the seam cannot slide as the body rotates.
  const material=mesh.material.clone();material.clippingPlanes=[hemPlane];
  const lower=new THREE.SkinnedMesh(mesh.geometry.clone(),material);lower.name='SkirtCoveredLegs';
  lower.position.copy(mesh.position);lower.quaternion.copy(mesh.quaternion);lower.scale.copy(mesh.scale);lower.bindMode=mesh.bindMode;
  const heights=Float32Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>{
   const p=V().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,p);return p.applyMatrix4(mesh.matrixWorld).y;
  });
  mesh.geometry.setAttribute('skirtBindY',new THREE.BufferAttribute(heights,1));
  mesh.material.onBeforeCompile=shader=>{
   shader.uniforms.skirtBindWaist={value:bindWaistY-.008};
   shader.vertexShader='attribute float skirtBindY; varying float vSkirtBindY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSkirtBindY = skirtBindY;');
   shader.fragmentShader='uniform float skirtBindWaist; varying float vSkirtBindY;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (vSkirtBindY < skirtBindWaist) discard;');
  };
  mesh.material.customProgramCacheKey=()=>'skin-bound-skirt-waist-v5';
  lower.layers.set(1);
  mesh.parent.add(lower);lower.bind(mesh.skeleton,mesh.bindMatrix);legMeshes.push(lower);
 }
 return {meshes:legMeshes,triangles:legMeshes.reduce((sum,m)=>sum+m.geometry.index.count/3,0),
  update(skirt){
   const fit=skirt.userData.fit;
   if(!fit)throw Error('Fit skirt to body before setting garment masks');
   const hem=V(...fit.hem).applyMatrix4(skirt.matrixWorld);
   hemPlane.setFromNormalAndCoplanarPoint(V(0,-1,0).transformDirection(skirt.matrixWorld),hem);
  }};
}

export function renderSkirtLayers(renderer,world,camera){
 world.traverse(o=>{if(o.isLight)o.layers.enable(1);});
 camera.layers.set(1);renderer.render(world,camera);renderer.clearDepth();
 renderer.autoClear=false;camera.layers.set(0);renderer.render(world,camera);renderer.autoClear=true;
}
const auditMaterials=new WeakMap();
export function auditSkirtCoverage(renderer,world,camera,skirt,lowerMeshes){
 const saved=[];world.traverse(mesh=>{if(mesh.isMesh){saved.push({mesh,visible:mesh.visible,material:mesh.material});mesh.visible=false;}});
 if(!auditMaterials.has(renderer))auditMaterials.set(renderer,{cloth:new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}),legs:new THREE.MeshBasicMaterial({color:0xff0000})});
 const {cloth,legs}=auditMaterials.get(renderer);legs.clippingPlanes=lowerMeshes[0].material.clippingPlanes;
 const read=()=>{const c=document.createElement('canvas');c.width=renderer.domElement.width;c.height=renderer.domElement.height;const g=c.getContext('2d');g.drawImage(renderer.domElement,0,0);return g.getImageData(0,0,c.width,c.height).data;};
 try{
  skirt.visible=true;skirt.material=cloth;camera.layers.set(0);renderer.render(world,camera);const mask=read();  skirt.visible=false;for(const m of lowerMeshes){m.visible=true;m.material=legs;}camera.layers.set(1);renderer.render(world,camera);const raw=read();
  skirt.visible=true;renderSkirtLayers(renderer,world,camera);const composited=read();
  let projectedOverlap=0,visibleThroughGarment=0,garmentPixels=0;
  for(let i=0;i<mask.length;i+=4)if(mask[i+3]>250){garmentPixels++;if(raw[i]>80&&raw[i+1]<20&&raw[i+3]>250)projectedOverlap++;if(composited[i]>80&&composited[i+1]<20&&composited[i+3]>250)visibleThroughGarment++;}
  return {method:'decoded flat-color garment and leg render passes',projectedOverlap,visibleThroughGarment,garmentPixels};
 }finally{
  for(const s of saved){s.mesh.visible=s.visible;s.mesh.material=s.material;}camera.layers.set(0);renderer.autoClear=true;
 }
}
