import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets/rigged-full/manifest.json',root)));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('zombies reach forward with loose downward wrists; skirt idle keeps its inward pose',()=>{
 for(const id of ['walker-cap','walker-dress','walker','spitter','walker-onearm']){
  const m=manifest.characters[id];
  assert.equal(m.production.motion.version,id==='walker-dress'?'skirt-downward-wrists-v7':'downward-loose-wrists-v3');
  for(const r of m.production.measurements)for(const side of Object.keys(r.handAnatomy)){
   const hand=r.handAnatomy[side],arm=r.bindSpaceArms[side],length=distance(arm.shoulder,arm.elbow)+distance(arm.elbow,arm.wrist);
   if(id!=='walker-dress'||r.action!=='idle'){
    assert.ok(hand.palm[1]<-.85,'palm faces mostly downward');
    assert.ok(hand.palm[0]*(side==='l'?-1:1)>.20,'palm retains a small inward component');
    assert.ok(hand.thumb[1]>.25,'thumb remains above the palm');
    const forearm=arm.wrist.map((v,i)=>v-arm.elbow[i]),forearmLength=Math.hypot(...forearm);
    const angle=Math.acos(Math.max(-1,Math.min(1,forearm.reduce((sum,v,i)=>sum+v/forearmLength*hand.fingers[i],0))));
    assert.ok(angle>.45&&angle<.8,'hand relaxes at the wrist rather than following a rigid forearm line');
    assert.ok(hand.fingers[1]<forearm[1]/forearmLength-.20,'wrist droops below the forearm');
   }else{
    assert.ok(hand.thumb[1]>.8,'skirt thumb stays mostly upright');
    assert.ok(hand.palm[0]*(side==='l'?-1:1)>.90,'skirt palm keeps its inward component');
    assert.ok(hand.palm[1]<-.22&&hand.palm[1]>-.35,'skirt palm keeps its accepted slight downward roll');
   }
   assert.ok(hand.fingers[2]>.85,'fingers point ahead');
   for(const finger of Object.values(hand.digits)){
    assert.ok(finger.extension>.97&&finger.extension<1,'relaxed fingers stay open');
    assert.ok(finger.palmCurl>.01&&finger.palmCurl<.05,'fingers curl slightly toward the palm');
   }
   const extension=distance(arm.shoulder,arm.wrist)/length;
   assert.ok(extension>.96&&extension<.99,'arm reaches ahead with a soft elbow');
   assert.ok(arm.wrist[2]-arm.shoulder[2]>.37,'forward reach');
   if(r.action!=='attack')assert.ok(arm.wrist[1]-arm.shoulder[1]>-.006,'higher resting and walking reach');
   assert.ok(r.handErrors[side].error<1e-5,'reachable hand pose');
  }
 }
});

test('hand rollout preserves the accepted cap and all actors outside the requested scope',()=>{
 const expected=JSON.parse(fs.readFileSync(new URL('assets/rigged-full/review/zombie-hands-v4/unchanged-actors.json',root)));
 for(const [id,record]of Object.entries(expected)){assert.equal(manifest.characters[id].image,record.image,id+' was not included in the hand pilot');const bytes=fs.readFileSync(new URL('assets/rigged-full/'+record.image,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,id+' artwork stays unchanged');}
});

test('skirt walker uses shorter, quicker steps at the same movement speed',()=>{
 const m=manifest.characters['walker-dress'],baseline=JSON.parse(fs.readFileSync(new URL('assets/rigged-full/review/skirt-short-steps-v1/reference-gait.json',root)));
 assert.equal(m.clips.walk.fps,baseline.fps*2);
 assert.ok(Math.abs(m.walkStride*m.clips.walk.fps-baseline.walkStride*baseline.fps)<1e-8,'same movement speed');
 const cycle=m.production.measurements.filter(r=>r.action==='walk'&&r.direction==='S');
 for(const side of ['l','r']){
  const span=poses=>{const values=poses.map(r=>r.joints[side].ankle[2]-r.joints[side].hip[2]);return Math.max(...values)-Math.min(...values);};
  const ratio=span(cycle)/span(baseline.poses);
  assert.ok(ratio>.35&&ratio<.60,'shorter ankle travel');
 }
 for(const r of m.production.measurements.filter(r=>r.action==='walk')){
  assert.equal(r.skirtWalk.stepWeight,.5);
  assert.ok(r.skirtWalk.coveredLegTriangles>3000,'garment-covered leg submesh is retained for hem clipping');
 }
});

test('skirt waistband stays fixed in hip space and fits the skin through every pose',()=>{
 const poses=manifest.characters['walker-dress'].production.measurements,bindings=poses[0].skirtFit.attachment.anchors;
 for(const r of poses){
  const fit=r.skirtFit;
  assert.equal(fit.version,'hip-bound-waist-v6');assert.equal(fit.attachment.samples,32);
  assert.equal(fit.attachment.bone,'pelvis');
  assert.ok(fit.attachment.pinnedVertices>60,'a continuous skin band shares the hip attachment');
  for(const [i,a]of fit.attachment.anchors.entries()){
   assert.deepEqual(a.triangle,bindings[i].triangle,'same waist triangle each frame');assert.deepEqual(a.bary,bindings[i].bary,'same point on the skinned triangle');
   assert.deepEqual(a.hipLocal,bindings[i].hipLocal,'waist shape is constant relative to the hip');
   assert.ok(distance(a.posedHipLocal,bindings[i].hipLocal)<1e-6,'no hip-relative waistband sliding');
   assert.ok(a.skinFitError<1e-6,'the actual skinned body band matches the hip seam');
   assert.ok(Math.abs(distance(a.body,a.cloth)-.002)<3e-7,'waist seam stays against the body');
   const offset=a.cloth.map((v,k)=>v-a.body[k]),outward=a.body.map((v,k)=>k===1?0:v-fit.waist[k]);
   assert.ok(offset.reduce((sum,v,k)=>sum+v*outward[k],0)>0,'fabric sits outside the skin');
  }
  assert.ok(fit.waistRadius<.18,'waist fits the torso');
  assert.ok(Math.abs(fit.waist[1]-fit.hem[1]-.56)<1e-7,'consistent length below the attached waist');
  assert.ok(fit.shape.minPanelAlignment>.999999,'panels do not twist across the body below the waist');
  assert.ok(r.garmentPixels.garmentPixels>500,'actual garment mask was rendered');
  assert.equal(r.garmentPixels.visibleThroughGarment,0,'rendered legs do not show through opaque fabric');
 }
 assert.ok(poses.filter(r=>r.action==='walk').reduce((n,r)=>n+r.garmentPixels.projectedOverlap,0)>0,'pixel check exercises actual leg/garment overlap');
});

test('screamer retains every shoulder, elbow and wrist position with relaxed downward hands',()=>{
 const m=manifest.characters.screamer,baseline=JSON.parse(fs.readFileSync(new URL('assets/rigged-full/review/zombie-hands-v4/screamer-original-joints.json',root)));
 assert.equal(m.production.motion.version,'screamer-loose-wrists-v4');
 for(const r of m.production.measurements){
  const old=baseline.find(p=>p.action===r.action&&p.direction===r.direction&&p.frame===r.frame);assert.deepEqual(r.joints,old.joints);
  for(const hand of Object.values(r.handAnatomy)){
   assert.ok(hand.palm[1]<-.85,'palms mostly downward');
   for(const finger of Object.values(hand.digits))assert.ok(finger.extension>.97&&finger.palmCurl>.01,'loose fingers');
  }
 }
 assert.deepEqual(Object.keys(manifest.characters['walker-onearm'].production.measurements[0].handAnatomy),['r'],'only the existing right arm is posed');
});

test('decoded skirt walk has no detached leg components and regular walker retains its lower-body pixels',()=>{
 for(const [id,folder]of [['walker','zombie-hands-v4'],['walker-dress','skirt-loose-wrists-v7']]){
  const m=manifest.characters[id],report=JSON.parse(fs.readFileSync(new URL('assets/rigged-full/review/'+folder+'/'+id+'-leg-check.json',root)));
  assert.equal(report.image,m.image);assert.equal(report.imageSha256,createHash('sha256').update(fs.readFileSync(new URL('assets/rigged-full/'+m.image,root))).digest('hex'));
  if(id==='walker'){assert.equal(report.checkedFrames,384);assert.equal(report.lowerBodyPixelDifferences,0);}
  else assert.deepEqual(report.detachedLegFrames.updated,[]);
 }
});

test('regular walker preserves the accepted animation timing and movement stride',()=>{
 const m=manifest.characters.walker,pilot=JSON.parse(fs.readFileSync(new URL('assets/rigged-pilot/manifest.json',root))).characters.walker;
 assert.equal(m.walkStride,3.5);
 for(const [action,clip]of Object.entries(m.clips)){
  assert.equal(clip.fps,pilot.clips[action].fps);assert.equal(clip.loop,pilot.clips[action].loop);
  for(const d of m.directions)assert.equal(clip.directions[d].length,pilot.clips[action].directions[d].length);
 }
});


test('skirt walker bob stays attached to the animated head',()=>{
 const m=manifest.characters['walker-dress'];assert.equal(m.production.role.hair,'bob');
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 for(const pose of m.production.measurements){
  assert.equal(pose.hair.bone,'Head');assert.ok(pose.hair.attachmentError<1e-6,'hair follows the head without drifting');
  assert.ok(pose.hair.headLocalMatrix.every((v,i)=>Math.abs(v-identity[i])<1e-6),'consistent head-local attachment through attacks and walking');
 }
});


test('skirt wrist edit preserves accepted body, hip fit, hair and idle hands',()=>{
 const poses=manifest.characters['walker-dress'].production.measurements,baseline=JSON.parse(fs.readFileSync(new URL('assets/rigged-full/review/skirt-loose-wrists-v7/accepted-pose-fingerprints.json',root)));
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 assert.equal(hash(poses.map(r=>({joints:r.joints,armReach:r.bindSpaceArms,skirt:r.skirtFit,hair:r.hair}))),baseline.body);
 assert.equal(hash(poses.filter(r=>r.action==='idle').map(r=>r.handAnatomy)),baseline.idleHands);
});
