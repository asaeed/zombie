import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ROLES,DIRECTIONS,withWorldFacings} from './catalog.mjs';
import {V,Q,retarget} from './rig.mjs';
import {appearance,equipment} from './equipment.mjs';
import {palmPosition} from '../rigged-pilot/weapon-rig.mjs';
import {scene,trim} from './render.mjs';
import {sculptBrute,shadeBrute} from './brute.mjs';
import {sculptBoss} from './boss.mjs';
import {renderSkirtLayers} from './skirt.mjs';
let sources;
export async function buildDeath(id) {
  const role=id==='soldier'?{...ROLES.soldier,color:0x387788,hat:'helmet',hatColor:0x537770,bodyColor:0x405d59,packColor:0x667969}:ROLES[id];
  if(!role)throw Error('Unknown character '+id);
  if(!sources){const loader=new GLTFLoader();sources=await Promise.all([
    loader.loadAsync('../../assets/rigged-pilot/source/model.gltf'),loader.loadAsync('../../assets/rigged-pilot/source/animations.glb')]);}
  const [model,library]=sources,cell=288,anchor={x:144,y:200};
  const {world,camera,renderer}=scene(cell,anchor),object=clone(model.scene),frames=[];
  if(id==='brute')sculptBrute(object);else if(id==='boss')sculptBoss(object);
  appearance(object,role);if(id==='brute'||id==='boss')shadeBrute(object);
  world.add(object);object.updateWorldMatrix(true,true);
  const bones={},rest={};object.traverse(o=>{if(o.isBone){bones[o.name]=o;rest[o.name]={position:o.position.clone(),quaternion:o.quaternion.clone()};}});
  const gear=equipment(object,bones,role,id),mixer=new THREE.AnimationMixer(object);
  const source=library.animations.find(c=>c.name==='Death01');
  const action=mixer.clipAction(retarget(library.scene,rest,source));
  const clips=[{name:'die',frames:16,fps:12,loop:false}];
  if(gear.skirt)renderer.localClippingEnabled=true;
  let borderPixels=0;
  try {
    for(let direction=0;direction<8;direction++)for(let frame=0;frame<16;frame++) {
      mixer.stopAllAction();object.rotation.y=0;object.scale.set(1,1,1);
      for(const [name,bone] of Object.entries(bones)){bone.position.copy(rest[name].position);bone.quaternion.copy(rest[name].quaternion);}
      action.reset().play();action.time=Math.min(source.duration-.0001,frame/15*source.duration);mixer.update(0);object.updateWorldMatrix(true,true);
      let attachment=null;
      if(role.gun||role.tool&&role.tool!=='kit') {
        const hand=bones.hand_r;
        attachment={position:palmPosition(hand),quaternion:hand.getWorldQuaternion(Q()).multiply(
          Q().setFromAxisAngle(role.gun?V(1,0,0):V(0,0,1),role.gun?-Math.PI/2:Math.PI/2))};
      }
      gear.update('die',frame/15,attachment);
      object.scale.set(role.width??1,1,1);object.rotation.y=-direction*Math.PI/4;object.updateWorldMatrix(true,true);gear.updateSkirtOcclusion();
      if(gear.skirt)renderSkirtLayers(renderer,world,camera);else renderer.render(world,camera);
      const canvas=document.createElement('canvas');canvas.width=cell;canvas.height=cell;
      const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(renderer.domElement,0,0,cell,cell);
      const pixels=ctx.getImageData(0,0,cell,cell).data;
      for(let n=0;n<cell;n++)for(const index of [n,(cell-1)*cell+n,n*cell,n*cell+cell-1])if(pixels[index*4+3]>8)borderPixels++;
      frames.push(canvas);
    }
    if(borderPixels)throw Error(id+' death silhouette clips its source canvas');
    const packed=trim(frames,clips,cell,anchor);
    const metadata=withWorldFacings(id,{cell:packed.cell,footAnchor:packed.footAnchor,clips:packed.clips,
      production:{method:'authored-rig-death',sourceAnimation:'Death01',sourceDuration:source.duration,frames:16,directions:8,borderPixels}});
    return {png:packed.atlas.toDataURL('image/png').split(',')[1],metadata};
  } finally {renderer.dispose();renderer.forceContextLoss();}
}
