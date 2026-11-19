import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {FACINGS,CLIPS,phase,pulse,targetHands} from './math.mjs';
import {carryRig,backRig,palmPosition,WALK_SUPPORT_YAW} from './weapon-rig.mjs';
const V=(...v)=>new THREE.Vector3(...v),Q=()=>new THREE.Quaternion();
const cell=160,anchor={x:80,y:136},supersample=4;

function recolor(object,type){
 object.traverse(o=>{
  if(!o.isMesh)return;
  if(o.name==='Eyes'){o.material=new THREE.MeshStandardMaterial({color:type==='walker'?0x472829:0x28272a});return;}
  if(o.name==='Eyebrows'){o.material=new THREE.MeshStandardMaterial({color:0x343b38});return;}
  const g=o.geometry.clone(),a=g.attributes.position,colors=new Float32Array(a.count*3);
  for(let i=0;i<a.count;i++){
   const y=a.getY(i),x=Math.abs(a.getX(i));
   const skin=y>1.53||(y>1.35&&x>.71),boot=y<.17;
   const color=new THREE.Color(type==='walker'?(boot?0x777c77:y<.92?0xb7bbb4:0x9ea6a0):(boot?0x29373c:skin?0xd3b28c:y<.96?0x3d5867:0x387788));
   color.toArray(colors,i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));o.geometry=g;
  o.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:0});
 });
}
function gear(type,bones,object){
 const rifle=new THREE.Group();object.add(rifle);
 const material=color=>new THREE.MeshStandardMaterial({color,roughness:.8});
 const add=(shape,color,pos,parent=rifle)=>{const m=new THREE.Mesh(shape,material(color));m.position.set(...pos);parent.add(m);return m;};
 if(type==='soldier'){
  add(new THREE.BoxGeometry(.08,.085,.30),0x263138,[0,0,.12]);
  const barrel=add(new THREE.CylinderGeometry(.018,.021,.24,8),0x263138,[0,.013,.37]);barrel.rotation.x=Math.PI/2;
  add(new THREE.BoxGeometry(.15,.09,.15),0x4b574b,[-.065,.03,-.10]);
  add(new THREE.BoxGeometry(.055,.12,.05),0x293333,[0,-.055,.04]);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.125,20,12,0,Math.PI*2,0,Math.PI*.55),material(0x537770));
  object.add(helmet);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(.35,.29,.20),material(0x405d59));object.add(vest);
  const packs=[];for(const x of [-.10,.02,.13])packs.push(add(new THREE.BoxGeometry(.075,.12,.065),0x667969,[x,-.065,.13],vest));
  return {rifle,update(action,t,attachment){
   rifle.visible=true;
   helmet.position.copy(bones.Head.getWorldPosition(V())).add(V(0,.095,0));helmet.quaternion.copy(bones.Head.getWorldQuaternion(Q()));
   vest.position.copy(bones.spine_02.getWorldPosition(V())).add(V(0,.07,0));
   // Both grips come from one body-relative prop transform during carry cycles.
   vest.quaternion.copy(bones.spine_02.getWorldQuaternion(Q()));
   for(const m of packs)m.visible=action!=='gather';
   if(attachment){rifle.position.copy(attachment.position);rifle.quaternion.copy(attachment.quaternion);}
   else{
    const right=bones.hand_r.getWorldPosition(V()),left=bones.hand_l.getWorldPosition(V());
    rifle.position.copy(right).add(V(.02,.075,0));
    const pose=targetHands('soldier',action,t),forward=pose?V(...pose.forward):left.clone().sub(right).normalize();
    rifle.quaternion.setFromUnitVectors(V(0,0,1),forward);
   }
  }};
 }
 rifle.visible=false;return {update(){}};
}
function aimBone(bone,child,point){
 const current=child.getWorldPosition(V()).sub(bone.getWorldPosition(V())).normalize(),desired=point.clone().sub(bone.getWorldPosition(V())).normalize();
 const world=Q().setFromUnitVectors(current,desired).multiply(bone.getWorldQuaternion(Q()));
 bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(world));bone.updateWorldMatrix(false,true);
}
function armIK(bones,side,target,bendPole){
 const upper=bones['upperarm_'+side],elbow=bones['lowerarm_'+side],hand=bones['hand_'+side];
 const start=upper.getWorldPosition(V()),middle=elbow.getWorldPosition(V()),end=hand.getWorldPosition(V());
 const a=start.distanceTo(middle),b=middle.distanceTo(end),direction=target.clone().sub(start),distance=Math.min(a+b-.001,Math.max(.02,direction.length()));direction.normalize();
 const endpoint=start.clone().addScaledVector(direction,distance),along=(a*a-b*b+distance*distance)/(2*distance);
 const pole=bendPole?bendPole.clone():V(side==='l'?1:-1,-.3,-.65),normal=pole.addScaledVector(direction,-pole.dot(direction)).normalize();
 const joint=start.clone().addScaledVector(direction,along).addScaledVector(normal,Math.sqrt(Math.max(0,a*a-along*along)));
 aimBone(upper,elbow,joint);aimBone(elbow,hand,endpoint);
 return {error:hand.getWorldPosition(V()).distanceTo(target),lengths:[a,b]};
}
function retarget(source,targetRest,clip){
 const tracks=[];
 for(const track of clip.tracks){
  const [name,property]=track.name.split('.'),from=source.getObjectByName(name),to=targetRest[name];if(!from||!to)continue;
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
try{
 const loader=new GLTFLoader(),model=await loader.loadAsync('../../assets/rigged-pilot/source/model.gltf'),library=await loader.loadAsync('../../assets/rigged-pilot/source/animations.glb');
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xd7e8f1,0x5f7052,1.35));
 const sun=new THREE.DirectionalLight(0xf5f0e7,2.8);sun.position.set(-3,6,5);scene.add(sun);
 const fill=new THREE.DirectionalLight(0xb1d3df,.7);fill.position.set(4,3,-3);scene.add(fill);
 const height=2.60,camera=new THREE.OrthographicCamera(-height/2,height/2,height*anchor.y/cell,-height*(cell-anchor.y)/cell,.1,50);camera.position.set(0,5,8.660254);camera.lookAt(0,0,0);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(cell*supersample,cell*supersample);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 const atlases={},report={models:{},frames:0,sourceClips:library.animations.map(a=>a.name),limitations:['Material/blockout costume is not a reproduction of the approved painted appearance.','Two-character review-only pilot; not installed as a game skin.']};
 for(const type of ['soldier','walker']){
  const object=clone(model.scene);recolor(object,type);scene.add(object);object.updateWorldMatrix(true,true);
  const bones={};object.traverse(o=>{if(o.isBone)bones[o.name]=o;});const rest={};for(const[name,b]of Object.entries(bones))rest[name]={position:b.position.clone(),quaternion:b.quaternion.clone()};
  const restBodyInverse=bones.spine_02.matrixWorld.clone().invert();
  const equipment=gear(type,bones,object),mixer=new THREE.AnimationMixer(object);
  const canvas=document.createElement('canvas');canvas.width=cell*16;canvas.height=cell*FACINGS.length*CLIPS[type].length;const g=canvas.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  const weaponCanvas=type==='soldier'?document.createElement('canvas'):null;
  if(weaponCanvas){weaponCanvas.width=canvas.width;weaponCanvas.height=cell*16;}
  const backCanvas=type==='soldier'?document.createElement('canvas'):null;
  if(backCanvas){backCanvas.width=canvas.width;backCanvas.height=cell*8;}
  const metadata={image:type+'.png',cell:{width:cell,height:cell},bodyHeight:96,footAnchor:anchor,renderScale:21.28/96,directions:FACINGS,clips:{},production:{method:'artist-rigged-3d-to-png',model:'Quaternius Universal Base Characters Standard male',animations:'Quaternius Universal Animation Library Standard',cameraElevation:30,supersample,retarget:'rest-relative local quaternion offset, target bone lengths retained'}};
  if(type==='soldier')metadata.production.walkSupport={wristYaw:WALK_SUPPORT_YAW,clavicleYaw:-.25,armRoll:'bind-relative',pole:[1,.2,.3]};
  const measurements=[];
  for(let a=0;a<CLIPS[type].length;a++){
   const def=CLIPS[type][a],clip=library.animations.find(c=>c.name===def.source);if(!clip)throw Error('Missing '+def.source);
   mixer.stopAllAction();for(const[n,b]of Object.entries(bones)){b.position.copy(rest[n].position);b.quaternion.copy(rest[n].quaternion);}
   const animation=mixer.clipAction(retarget(library.scene,rest,clip));metadata.clips[def.name]={fps:def.fps,loop:def.loop,directions:{}};
   for(let d=0;d<FACINGS.length;d++){
    const frames=[];
    for(let frame=0;frame<def.frames;frame++){
     object.rotation.y=0;mixer.stopAllAction();for(const[n,b]of Object.entries(bones)){b.position.copy(rest[n].position);b.quaternion.copy(rest[n].quaternion);}
     const t=phase(frame,def.frames,def.loop);animation.reset().play();animation.time=Math.min(clip.duration-.0001,t*clip.duration);mixer.update(0);
     if(type==='walker'){
      bones.spine_02.quaternion.multiply(Q().setFromAxisAngle(V(1,0,0),def.name==='attack'?.15+.18*pulse(t):.15));
      bones.Head.quaternion.multiply(Q().setFromAxisAngle(V(1,0,0),-.06));
     }
     object.updateWorldMatrix(true,true);
     if(type==='soldier'&&def.name==='walk'){
      // Carrying a rifle must not inherit the free-swing clip's arm twist.
      for(const name of ['clavicle_l','upperarm_l','lowerarm_l'])bones[name].quaternion.copy(rest[name].quaternion);
      object.updateWorldMatrix(true,true);
      const delta=bones.spine_02.matrixWorld.clone().multiply(restBodyInverse),clavicle=bones.clavicle_l;
      const world=Q().setFromAxisAngle(V(0,1,0).transformDirection(delta),metadata.production.walkSupport.clavicleYaw).multiply(clavicle.getWorldQuaternion(Q()));
      clavicle.quaternion.copy(clavicle.parent.getWorldQuaternion(Q()).invert().multiply(world));clavicle.updateWorldMatrix(false,true);
     }
     const carry=type==='soldier'&&['idle','walk'].includes(def.name)?carryRig(bones.spine_02.matrixWorld,restBodyInverse,def.name):null;
     const stowed=type==='soldier'&&def.name==='gather'?backRig(bones.spine_02.matrixWorld,restBodyInverse):null;
     const hands=targetHands(type,def.name,t),errors={};if(hands)for(const side of ['l','r']){
      // Keep the support elbow clear of the chest without moving either grip.
      const bendPole=carry&&side==='l'?(def.name==='walk'?V(...metadata.production.walkSupport.pole):V(1,-.1,.1)):undefined;
      errors[side]=armIK(bones,side,carry?carry.hands[side].wrist:V(...hands[side==='l'?'left':'right']),bendPole);
      if(type==='soldier'||def.name==='attack'){
       const hand=bones['hand_'+side],world=carry?carry.hands[side].quaternion.clone():Q().setFromEuler(new THREE.Euler(Math.PI/2,0,0));
       hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(world));
       for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){
        const name=finger+'_0'+n+'_'+side,b=bones[name];
        b.quaternion.copy(rest[name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),(side==='l'?1:-1)*(type==='walker'?.35:n===1?.9:n===2?1.1:.75)));
       }
       hand.updateWorldMatrix(false,true);
      }
     }
     const boot={};for(const side of ['l','r']){boot[side]=bones['ball_leaf_'+side].getWorldPosition(V()).sub(bones['foot_'+side].getWorldPosition(V())).toArray();}
     equipment.update(def.name,t,carry||stowed);object.updateWorldMatrix(true,true);
     const measurement={action:def.name,direction:FACINGS[d],frame,phase:t,handErrors:errors,handPositions:{l:bones.hand_l.getWorldPosition(V()).toArray(),r:bones.hand_r.getWorldPosition(V()).toArray()},boots:boot};
     if(carry)measurement.weapon={position:equipment.rifle.getWorldPosition(V()).toArray(),quaternion:equipment.rifle.getWorldQuaternion(Q()).toArray(),bodyLocal:bones.spine_02.worldToLocal(equipment.rifle.getWorldPosition(V())).toArray(),palms:Object.fromEntries(['l','r'].map(side=>[side,{actual:palmPosition(bones['hand_'+side]).toArray(),target:carry.hands[side].palm.toArray(),error:palmPosition(bones['hand_'+side]).distanceTo(carry.hands[side].palm)}]))};
     if(stowed)measurement.weapon={attachment:'back',position:equipment.rifle.getWorldPosition(V()).toArray(),quaternion:equipment.rifle.getWorldQuaternion(Q()).toArray(),bodyLocal:bones.spine_02.worldToLocal(equipment.rifle.getWorldPosition(V())).toArray(),bodyOrientation:bones.spine_02.getWorldQuaternion(Q()).invert().multiply(equipment.rifle.getWorldQuaternion(Q())).toArray()};
     if(carry){
      const bodyDeltaInverse=bones.spine_02.matrixWorld.clone().multiply(restBodyInverse).invert();
      measurement.carryArms=Object.fromEntries(['l','r'].map(side=>[side,{shoulder:bones['upperarm_'+side].getWorldPosition(V()).applyMatrix4(bodyDeltaInverse).toArray(),elbow:bones['lowerarm_'+side].getWorldPosition(V()).applyMatrix4(bodyDeltaInverse).toArray(),wrist:bones['hand_'+side].getWorldPosition(V()).applyMatrix4(bodyDeltaInverse).toArray()}]));
     }
     measurements.push(measurement);
     object.rotation.y=-d*Math.PI/4;object.updateWorldMatrix(true,true);renderer.render(scene,camera);
     const x=frame*cell,y=(a*8+d)*cell;g.drawImage(renderer.domElement,x,y,cell,cell);frames.push({x,y,width:cell,height:cell});report.frames++;
     if(carry||stowed){
      const hidden=[];object.traverse(o=>{if(!o.isMesh)return;let parent=o;while(parent&&parent!==equipment.rifle)parent=parent.parent;if(!parent){hidden.push([o,o.visible]);o.visible=false;}});
      renderer.render(scene,camera);(stowed?backCanvas:weaponCanvas).getContext('2d').drawImage(renderer.domElement,x,stowed?d*cell:y,cell,cell);
      for(const[o,visible]of hidden)o.visible=visible;
     }
    }
    metadata.clips[def.name].directions[FACINGS[d]]=frames;
   }
  }
  metadata.production.measurements=measurements;report.models[type]={frames:measurements.length,maxHandError:Math.max(...measurements.flatMap(m=>Object.values(m.handErrors).map(e=>e.error)))};
  atlases[type]={png:canvas.toDataURL('image/png').split(',')[1],metadata};
  if(weaponCanvas)atlases[type].weaponWitness=weaponCanvas.toDataURL('image/png').split(',')[1];
  if(backCanvas)atlases[type].backWitness=backCanvas.toDataURL('image/png').split(',')[1];
  scene.remove(object);
  const preview=document.createElement('canvas');preview.width=cell*8;preview.height=cell*CLIPS[type].length;
  const pg=preview.getContext('2d');for(let a=0;a<CLIPS[type].length;a++)for(let d=0;d<8;d++)pg.drawImage(canvas,8*cell,(a*8+d)*cell,cell,cell,d*cell,a*cell,cell,cell);document.body.append(preview);
 }
 window.pilotAtlases=atlases;window.pilotManifest={version:1,imageSmoothing:true,imageSmoothingQuality:'high',characters:Object.fromEntries(Object.entries(atlases).map(([id,r])=>[id,r.metadata])),reviewOnly:true};
 window.pilotReport=report;window.pilotReady=true;
}catch(error){window.pilotError=error.stack;throw error;}
