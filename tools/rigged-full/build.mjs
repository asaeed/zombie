import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ROLES,DIRECTIONS,clipsFor,withDisplayScale,withWorldFacings} from './catalog.mjs';
import {V,Q,retarget,armIK,resetCarryRoll} from './rig.mjs';
import {appearance,equipment} from './equipment.mjs';
import {phase,pulse,targetHands} from '../rigged-pilot/math.mjs';
import {carryRig,backRig,palmPosition} from '../rigged-pilot/weapon-rig.mjs';
import {CELL,ANCHOR,scene,trim} from './render.mjs';
import {sculptBrute,shadeBrute,bruteArmPose,bruteAttackPhase,createBruteReadyPose,selectBruteReadyFrames,BRUTE_READY_FRAME,isBruteArmBone as isArmBone,exportBruteModel as exportCustomModel} from './brute.mjs';
import {shortenSkirtSteps,measureSkirtFit,renderSkirtLayers,auditSkirtCoverage} from './skirt.mjs';
import {createWalkerHandFrames,walkerArmPose,relaxedWalkerFingers,measureWalkerHands} from './walker.mjs';
import {createExploderForwardPose,applyExploderRunPose} from './exploder.mjs';
import {heavyAttackBody,heavyClubAttackPose,heavyWalkingClubPose} from './heavy.mjs';
import {runnerLungePose,runnerClawPose,runnerClawFingers} from './runner.mjs';
import {sculptBoss,isBossFingerBone,bossAttackPhase,bossRestPose,selectBossFrames,BOSS_READY_FRAME,BOSS_ATTACK_FRAME_INDICES} from './boss.mjs';
let source;
async function sources(){if(!source){const loader=new GLTFLoader();source={model:await loader.loadAsync('../../assets/rigged-pilot/source/model.gltf'),library:await loader.loadAsync('../../assets/rigged-pilot/source/animations.glb')};}return source;}
export async function build(id){
 const role=ROLES[id],isBrute=id==='brute',walkerPilot=['walker-cap','walker-dress','walker','spitter','walker-onearm'].includes(id),walkerHandsFixed=walkerPilot||id==='screamer';if(!role||role.pilot)throw Error('No new bake for '+id);
 const bakeCell=id==='heavy'?224:CELL,bakeAnchor={x:ANCHOR.x+(bakeCell-CELL)/2,y:ANCHOR.y+(bakeCell-CELL)/2};
 const {model,library}=await sources(),{world,camera,renderer}=scene(),object=clone(model.scene),customShape=isBrute?sculptBrute(object):id==='boss'?sculptBoss(object):null;appearance(object,role);if(customShape)shadeBrute(object);const customModel=customShape?await exportCustomModel(object,customShape):null;world.add(object);object.updateWorldMatrix(true,true);
 const bones={};object.traverse(o=>{if(o.isBone)bones[o.name]=o;});const rest={};for(const[n,b]of Object.entries(bones))rest[n]={position:b.position.clone(),quaternion:b.quaternion.clone()};
 const inverse=bones.spine_02.matrixWorld.clone().invert(),gear=equipment(object,bones,role,id),mixer=new THREE.AnimationMixer(object),frames=[],measurements=[],clips=clipsFor(role);
 if(role.skirt)renderer.localClippingEnabled=true;
 const exploderPose=id==='exploder'?createExploderForwardPose(bones):null,walkerHands=walkerHandsFixed?createWalkerHandFrames(bones):null;
 const idle=mixer.clipAction(retarget(library.scene,rest,library.animations.find(c=>c.name==='Idle_Loop')));idle.reset().play();mixer.update(0);
 const idlePose=(customShape||id==='boss'||id==='walker-dress')?Object.fromEntries(Object.entries(bones).map(([n,b])=>[n,{position:b.position.clone(),quaternion:b.quaternion.clone()}])):null;
 const bruteReady=isBrute?createBruteReadyPose():null;
 const followup=isBrute?mixer.clipAction(retarget(library.scene,rest,library.animations.find(c=>c.name===role.attackFollowup))):null;
 let bossFists=null;
 if(id==='boss'){const fist=mixer.clipAction(retarget(library.scene,rest,library.animations.find(c=>c.name===role.attackSource)));mixer.stopAllAction();fist.reset().play();fist.time=fist.getClip().duration*.5;mixer.update(0);bossFists=Object.fromEntries(Object.entries(bones).filter(([n])=>isBossFingerBone(n)).map(([n,b])=>[n,b.quaternion.clone()]));}
 const planted=Object.fromEntries(Object.entries(bones).filter(([n])=>n==='pelvis'||/^(thigh|calf|foot|ball)/.test(n)).map(([n,b])=>[n,{position:b.position.clone(),quaternion:b.quaternion.clone()}]));mixer.stopAllAction();
 try{
  for(const def of clips){
   const renderCell=id==='heavy'&&def.name==='attack'?bakeCell:CELL;
   const renderAnchor={x:ANCHOR.x+(renderCell-CELL)/2,y:ANCHOR.y+(renderCell-CELL)/2};
   const height=2.60*renderCell/CELL;
   camera.left=-height/2;camera.right=height/2;camera.top=height*renderAnchor.y/renderCell;
   camera.bottom=-height*(renderCell-renderAnchor.y)/renderCell;camera.updateProjectionMatrix();
   renderer.setSize(renderCell*4,renderCell*4);
   const clip=library.animations.find(c=>c.name===def.source);if(!clip)throw Error('Missing source '+def.source);const animation=mixer.clipAction(retarget(library.scene,rest,clip));
   for(let d=0;d<8;d++)for(let frame=0;frame<def.frames;frame++){
    object.rotation.y=0;object.scale.set(1,1,1);mixer.stopAllAction();for(const[n,b]of Object.entries(bones)){b.position.copy(rest[n].position);b.quaternion.copy(rest[n].quaternion);}
    const t=phase(frame,def.frames,def.loop),authoredAttack=def.name==='attack'?(isBrute?bruteAttackPhase(t):id==='boss'?bossAttackPhase(t):null):null;
    const sampled=authoredAttack?.followup?followup:animation,sampledClip=sampled.getClip();
    if(isBrute&&authoredAttack){
     animation.reset().setEffectiveWeight(1-authoredAttack.crossWeight).play();
     animation.time=Math.min(animation.getClip().duration-.0001,authoredAttack.jabPhase*animation.getClip().duration);
     followup.reset().setEffectiveWeight(authoredAttack.crossWeight).play();
     followup.time=Math.min(followup.getClip().duration-.0001,authoredAttack.crossPhase*followup.getClip().duration);
    }else{
     sampled.reset().setEffectiveWeight(1).play();
     sampled.time=Math.min(sampledClip.duration-.0001,((id==='runner'||id==='heavy')&&def.name==='attack'?0:(authoredAttack?.phase??t))*sampledClip.duration);
    }
    mixer.update(0);object.updateWorldMatrix(true,true);
    const skirtWalk=id==='walker-dress'&&def.name==='walk'?shortenSkirtSteps(bones,idlePose):null;
    const authoredArms=authoredAttack?Object.fromEntries(Object.entries(bones).filter(([n])=>isArmBone(n)).map(([n,b])=>[n,b.quaternion.clone()])):null;
    if(authoredAttack)for(const[n,b]of Object.entries(bones))if(!isArmBone(n)){const rotation=b.quaternion.clone(),position=b.position.clone();b.quaternion.copy(idlePose[n].quaternion).slerp(rotation,authoredAttack.blend);b.position.copy(idlePose[n].position).lerp(position,authoredAttack.blend);}

    if(role.tool==='club'&&def.name==='attack')for(const[n,p]of Object.entries(planted)){bones[n].position.copy(p.position);bones[n].quaternion.copy(p.quaternion);}
    if(id==='heavy'&&def.name==='attack')heavyAttackBody(bones,t);
    if(role.group==='zombie'){bones.spine_02.quaternion.multiply(Q().setFromAxisAngle(V(1,0,0),(role.lean??.15)+(def.name==='attack'&&!authoredAttack&&id!=='runner' ? .18*pulse(t) : 0)));bones.Head.quaternion.multiply(Q().setFromAxisAngle(V(1,0,0),-.06));}
    object.updateWorldMatrix(true,true);
    const runnerAttack=id==='runner'&&def.name==='attack',lunge=runnerAttack?runnerLungePose(bones,t):null;
    if(role.gun&&def.name==='walk')resetCarryRoll(bones,rest,inverse);
    const carry=role.gun&&['idle','walk'].includes(def.name)?carryRig(bones.spine_02.matrixWorld,inverse,def.name):null;
    const stowed=role.gun&&def.name==='gather'?backRig(bones.spine_02.matrixWorld,inverse):null;
    if(isBrute||runnerAttack||id==='boss'||walkerPilot){for(const side of ['l','r'].filter(s=>s!==role.missing))for(const name of ['clavicle','upperarm','lowerarm'])bones[name+'_'+side].quaternion.copy(rest[name+'_'+side].quaternion);object.updateWorldMatrix(true,true);}
    const exploderRunning=id==='exploder'&&def.name==='walk';
    const targets=exploderRunning?null:role.gun?targetHands('soldier',def.name,t):role.group==='zombie'&&(id!=='runner'||def.name==='attack')?targetHands('walker',def.name,t):null,errors={};
    if(targets)for(const side of ['l','r']){
     if(side===role.missing)continue;
     let target=carry?carry.hands[side].wrist:V(...targets[side==='l'?'left':'right']);
     if(id==='screamer'&&def.name==='attack')target=V(side==='l'?.20:-.20,1.15+.47*pulse(t),.22+.12*pulse(t));
     const armPose=isBrute?bruteArmPose(bones.spine_02.matrixWorld,inverse,side,def.name,t)
      :runnerAttack?runnerClawPose(bones,side,t)
      :id==='boss'?bossRestPose(bones.spine_02.matrixWorld,inverse,side,def.name,t)
      :walkerPilot?walkerArmPose(bones,inverse,walkerHands,side,def.name,t,id==='walker-dress'&&def.name==='idle'?'inward':'downward'):null;
     if(armPose)target=armPose.target;
     errors[side]=armIK(bones,side,target,armPose?.pole??(carry&&side==='l'?(def.name==='walk'?V(1,.2,.3):V(1,-.1,.1)):undefined));
     const hand=bones['hand_'+side],orientation=(id==='screamer'?walkerArmPose(bones,inverse,walkerHands,side,def.name,t,'downward').quaternion:armPose?.quaternion)??(carry?carry.hands[side].quaternion.clone():Q().setFromEuler(new THREE.Euler(Math.PI/2,0,0)));
     hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(orientation));
     if(runnerAttack)runnerClawFingers(bones,rest,side);
     if(walkerHandsFixed)relaxedWalkerFingers(bones,rest,walkerHands,side);
     if(id!=='boss'&&!runnerAttack&&!walkerHandsFixed)for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){const b=bones[finger+'_0'+n+'_'+side];b.quaternion.copy(rest[b.name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),(side==='l'?1:-1)*(isBrute ? .16 : role.group==='zombie'?.35:n===1?.9:n===2?1.1:.75)));}
     hand.updateWorldMatrix(false,true);
    }
    const exploderArms=exploderRunning?applyExploderRunPose(bones,exploderPose,rest,t):null;
    if(bossFists){for(const[n,rotation]of Object.entries(bossFists))bones[n].quaternion.copy(rotation);object.updateWorldMatrix(true,true);}
    if(authoredAttack){
     for(const[n,rotation]of Object.entries(authoredArms))bones[n].quaternion.slerp(rotation,authoredAttack.blend);
     object.updateWorldMatrix(true,true);
     // The attack uses authored rotations; baseline IK is only its transition pose.
     for(const side of ['l','r'])delete errors[side];
    }
    if(role.tool==='torch'&&def.name!=='gather'){
     for(const name of ['clavicle_r','upperarm_r','lowerarm_r'])bones[name].quaternion.copy(rest[name].quaternion);object.updateWorldMatrix(true,true);
     const p=def.name==='attack'?pulse(t):0,target=V(-.23,1.20+.16*p,.25+.16*p);
     errors.r=armIK(bones,'r',target,V(-1,.0,.25));
     const hand=bones.hand_r;hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(Q().setFromEuler(new THREE.Euler(Math.PI/2,0,0))));hand.updateWorldMatrix(false,true);
     hand.quaternion.premultiply(hand.parent.getWorldQuaternion(Q()).invert().multiply(Q().setFromAxisAngle(V(1,0,0),.85*p)).multiply(hand.parent.getWorldQuaternion(Q())));
     for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){const b=bones[finger+'_0'+n+'_r'];b.quaternion.copy(rest[b.name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),-(n===1?.9:n===2?1.1:.75)));}hand.updateWorldMatrix(false,true);
    }
    // Walking attaches the club to the relaxed palm. Idle and attack solve
    // the arm to the carry or strike grip instead.
    let club=null;
    if(role.tool==='club'&&def.name==='walk'){
     club=heavyWalkingClubPose(bones,rest);
    }else if(role.tool==='club'&&def.name!=='gather'){
     for(const name of ['clavicle_r','upperarm_r','lowerarm_r'])bones[name].quaternion.copy(rest[name].quaternion);object.updateWorldMatrix(true,true);
     const delta=bones.spine_02.matrixWorld.clone().multiply(inverse),p=def.name==='attack'?pulse(t):0;
     const attack=def.name==='attack'?heavyClubAttackPose(bones,inverse,t):null;
     const position=attack?.position??V(-.29,1.23+.12*p,.23+.10*p).applyMatrix4(delta);
     const quaternion=attack?.quaternion??Q().setFromRotationMatrix(delta).multiply(Q().setFromUnitVectors(V(0,1,0),V(0,.12-.55*p,1).normalize()));
     const handQuaternion=quaternion.clone().multiply(Q().setFromAxisAngle(V(0,0,1),-Math.PI/2));
     const wrist=attack?.wrist??position.clone().sub(V(0,.06,0).applyQuaternion(handQuaternion));
     errors.r=armIK(bones,'r',wrist,attack?.pole??V(-1,0,.25).transformDirection(delta));
     const hand=bones.hand_r;hand.quaternion.copy(hand.parent.getWorldQuaternion(Q()).invert().multiply(handQuaternion));
     for(const finger of ['index','middle','pinky','ring'])for(let n=1;n<=3;n++){const b=bones[finger+'_0'+n+'_r'];b.quaternion.copy(rest[b.name].quaternion).multiply(Q().setFromAxisAngle(V(0,0,1),-(n===1?.9:n===2?1.1:.75)));}hand.updateWorldMatrix(false,true);
     club={position,quaternion,...(attack?{swing:attack.swing}:{})};
    }
    let attachment=carry||stowed||club;
    if(role.gun&&!attachment){const pose=targetHands('soldier',def.name,t);attachment={position:bones.hand_r.getWorldPosition(V()).add(V(.02,.075,0)),quaternion:Q().setFromUnitVectors(V(0,0,1),V(...pose.forward))};}
    const bruteRecovery=isBrute&&def.name==='attack'?bruteReady(bones,frame,def.frames):null;
    gear.update(def.name,t,attachment);object.updateWorldMatrix(true,true);
    const joints={};for(const side of ['l','r'])joints[side]=Object.fromEntries([['shoulder','upperarm'],['elbow','lowerarm'],['wrist','hand'],['hip','thigh'],['knee','calf'],['ankle','foot']].map(([joint,b])=>[joint,bones[b+'_'+side].getWorldPosition(V()).toArray()]));
    const record={action:def.name,direction:DIRECTIONS[d],frame,phase:t,joints,handErrors:errors};
    if(lunge)record.attackMotion=lunge;
    if(gear.skirt){record.skirtFit=measureSkirtFit(gear.skirt,bones);record.hair=gear.measureHair();}
    if(skirtWalk)record.skirtWalk={...skirtWalk,coveredLegTriangles:gear.skirtOcclusion.triangles,occlusion:'body clipped at its bind-pose waist, lower legs layered behind the garment'};
    if(exploderArms){record.runArmMotion=exploderArms.motion;Object.assign(record.handErrors,exploderArms.handErrors);}
    if(bruteRecovery)record.recovery=bruteRecovery;
    if(authoredAttack)record.armAnimation={source:sampledClip.name,phase:authoredAttack.phase,blend:authoredAttack.blend,method:id==='boss'?'authored cross strike from a sustained raised guard':'overlapping authored jab and cross with a continuous guard'};
    if(isBrute&&authoredAttack)record.armAnimation.mix={jabPhase:authoredAttack.jabPhase,crossPhase:authoredAttack.crossPhase,crossWeight:authoredAttack.crossWeight};
    if(id==='heavy'&&def.name==='walk')record.walkMotion={source:def.source,attachment:'right palm',arm:'authored relaxed walking swing'};
    if(id==='heavy'&&def.name==='attack')record.attackMotion={version:'extended-arm-sweep-v3',weaponHand:'r',...club.swing};
    if(walkerHandsFixed||customShape||runnerAttack||(id==='heavy'&&['attack','walk'].includes(def.name))||(id==='exploder'&&def.name==='walk')){const bodyInverse=bones.spine_02.matrixWorld.clone().multiply(inverse).invert();record.bindSpaceArms=Object.fromEntries(['l','r'].map(side=>[side,Object.fromEntries(['shoulder','elbow','wrist'].map(joint=>[joint,V(...joints[side][joint]).applyMatrix4(bodyInverse).toArray()]))]));}
    if(walkerHandsFixed){const bodyInverse=bones.spine_02.matrixWorld.clone().multiply(inverse).invert();record.handAnatomy=measureWalkerHands(bones,walkerHands,bodyInverse);if(role.missing)delete record.handAnatomy[role.missing];}
    if(id==='boss'||runnerAttack||(isBrute&&def.name==='attack')){const bodyInverse=bones.spine_02.matrixWorld.clone().multiply(inverse).invert();record.handDirections=Object.fromEntries(['l','r'].map(side=>[side,(runnerAttack?V(0,1,0).applyQuaternion(bones['hand_'+side].getWorldQuaternion(Q())):V(0,1,0).applyQuaternion(bones['hand_'+side].getWorldQuaternion(Q())).transformDirection(bodyInverse)).toArray()]));}
    if(attachment)record.prop={storage:stowed?'back':'hands',position:gear.prop.getWorldPosition(V()).toArray(),bodyLocal:bones.spine_02.worldToLocal(gear.prop.getWorldPosition(V())).toArray(),palms:carry?Object.fromEntries(['l','r'].map(side=>[side,palmPosition(bones['hand_'+side]).distanceTo(carry.hands[side].palm)])):null};
    if(club){
     record.prop.palms={r:palmPosition(bones.hand_r).distanceTo(club.position)};
     record.prop.forward=V(0,1,0).applyQuaternion(club.quaternion).toArray();
     record.prop.tip=V(0,.52,0).applyMatrix4(gear.prop.matrixWorld).toArray();
     record.prop.bodyTip=bones.spine_02.worldToLocal(V(...record.prop.tip)).toArray();
     if(id==='heavy'&&def.name==='walk'){record.prop.handLocal=bones.hand_r.worldToLocal(gear.prop.getWorldPosition(V())).toArray();record.prop.handLocalRotation=bones.hand_r.getWorldQuaternion(Q()).invert().multiply(gear.prop.getWorldQuaternion(Q())).toArray();}
    }
    measurements.push(record);
    object.scale.set(role.width??1,1,1);if(customShape)record.modelScale=object.scale.toArray();object.rotation.y=-d*Math.PI/4;object.updateWorldMatrix(true,true);gear.updateSkirtOcclusion();
    if(gear.skirt){
     // Preserve leg self-occlusion, then paint the garment and upper body over
     // their projected overlap, as a continuous layered sprite.
     renderSkirtLayers(renderer,world,camera);
    }else renderer.render(world,camera);
    const c=document.createElement('canvas');c.width=bakeCell;c.height=bakeCell;const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(renderer.domElement,(bakeCell-renderCell)/2,(bakeCell-renderCell)/2,renderCell,renderCell);frames.push(c);if(gear.skirt)record.garmentPixels=auditSkirtCoverage(renderer,world,camera,gear.skirt,gear.skirtOcclusion.meshes);
   }
  }
  if(isBrute)selectBruteReadyFrames(frames,measurements);
  if(id==='boss')selectBossFrames(frames,measurements);
  const packed=trim(frames,clips,bakeCell,bakeAnchor),metadata={image:id+'.png',group:role.group,cell:packed.cell,footAnchor:packed.footAnchor,bodyHeight:96,renderScale:role.size/96,strike:role.strike??null,work:role.work??null,directions:DIRECTIONS,walkStride:role.speed/role.fps,clips:packed.clips,
   production:{method:'artist-rigged-3d-to-png',role,...(walkerHandsFixed?{motion:{version:id==='walker-dress'?'skirt-downward-wrists-v7':id==='screamer'?'screamer-loose-wrists-v4':'downward-loose-wrists-v3',scope:id,handPose:id!=='walker-dress'?'mostly downward palms with relaxed drooping wrists and loose fingers':'palms down with relaxed drooping wrists in walk and attack; inward palms in idle',...(id==='walker-dress'?{gaitVersion:'short-skirt-steps-v1',walkSource:'Walk_Loop',stepWeight:.5,garmentVersion:'hip-bound-waist-v6',garment:'pelvis-local waistband and matching hip-weighted skin with covered stepping legs',hair:'head-attached chin-length bob'}:{}),armSpace:id==='screamer'?'existing arm targets and bend planes preserved':'animated chest-local reach'}}:{}),...(id==='exploder'?{motion:{version:'body-following-reach-v2',walkSource:'Jog_Fwd_Loop',armSpace:'animated chest-local with stride-synced sway'}}:{}),...(id==='heavy'?{motion:{version:'extended-arm-sweep-v3',weaponHand:'r',walkSource:'Walk_Loop',walkAttachment:'right palm with authored arm swing',attackDuration:role.attackFrames/role.attackFps}}:{}),...(id==='runner'?{motion:{version:'claw-lunge-v1',attackSource:'Crouch_Idle_Loop',attackDuration:16/24}}:{}),...(id==='boss'?{motion:{version:'frame-six-ready-recoil-v4',attackSource:role.attackSource,attackDuration:role.attackFrames/role.attackFps,readyFrame:BOSS_READY_FRAME+1,sourceFrames:BOSS_ATTACK_FRAME_INDICES.map(n=>n+1),recovery:'retraced extension to the frame-six guard'}}:{}),...(customShape?{sourceModel:'custom-stocky-'+id,customShape,...(isBrute?{motion:{version:'frame-six-ready-combo-v3',readyFrame:BRUTE_READY_FRAME+1,attackSources:[role.attackSource,role.attackFollowup],attackDuration:role.attackFrames/role.attackFps}}:{}),customizationSource:'../../tools/rigged-full/'+id+'.mjs'}:{}),source:'../rigged-pilot/source/model.gltf',animationSource:'../rigged-pilot/source/animations.glb',retarget:'immutable rest-relative quaternion offsets',cameraElevation:30,supersample:4,measurements,facings:'eight real orthographic model rotations, no mirroring',packing:'one fixed measured envelope per actor, 7px padding, no per-frame recentering'}};
  return {...(customModel?{model:customModel}:{}),png:packed.atlas.toDataURL('image/png').split(',')[1],metadata:withDisplayScale(id,withWorldFacings(id,metadata))};
 }finally{renderer.dispose();world.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
}
