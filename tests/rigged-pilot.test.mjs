import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {FACINGS,CLIPS,phase,targetHands} from '../tools/rigged-pilot/math.mjs';
import {carryRig,backRig} from '../tools/rigged-pilot/weapon-rig.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../assets/rigged-pilot/manifest.json',import.meta.url)));
test('rigged trial is review-only and retains native presentation and eight real directions',()=>{
 assert.equal(manifest.reviewOnly,true);assert.deepEqual(Object.keys(manifest.characters),['soldier','walker']);
 for(const[id,m]of Object.entries(manifest.characters)){
  assert.deepEqual(m.directions,FACINGS);assert.equal(m.bodyHeight*m.renderScale,21.28);assert.deepEqual(m.footAnchor,{x:80,y:136});assert.equal(m.production.method,'artist-rigged-3d-to-png');
  for(const def of CLIPS[id])for(const d of FACINGS){const frames=m.clips[def.name].directions[d];assert.equal(frames.length,16);assert.equal(new Set(frames.map(f=>f.x+','+f.y)).size,16);}
 }
});
test('loops exclude a repeated endpoint while one-shot sequences include recovery',()=>{
 assert.equal(phase(15,16,true),15/16);assert.equal(phase(15,16,false),1);
 for(const type of ['soldier','walker'])for(const action of ['idle','walk','shoot','attack'])assert.deepEqual(targetHands(type,action,0),targetHands(type,action,1));
});
test('emitted poses keep anatomical hands distinct and solver lengths invariant across directions',()=>{
 for(const [id,m]of Object.entries(manifest.characters)){
  for(const r of m.production.measurements){
   const [left,right]=[r.handPositions.l,r.handPositions.r];assert.ok(Math.hypot(...left.map((n,i)=>n-right[i]))>.05,id+'/'+r.action+' duplicated hands');
   for(const measured of Object.values(r.handErrors))assert.ok(measured.lengths.every(n=>n>.20&&n<.28));
  }
 }
});
test('actual idle boots face forward, aimed grips reach their targets and attacks reach head level',()=>{
 const soldier=manifest.characters.soldier.production.measurements;
 for(const r of soldier.filter(r=>r.action==='idle'))for(const boot of Object.values(r.boots))assert.ok(boot[2]>.12);
 for(const r of soldier.filter(r=>r.action==='shoot'))for(const hand of Object.values(r.handErrors))assert.ok(hand.error<1e-5);
 const walker=manifest.characters.walker.production.measurements;
 for(const d of FACINGS){const peak=walker.find(r=>r.action==='attack'&&r.direction===d&&r.frame===8);assert.ok(peak.handPositions.l[1]>1.5);assert.ok(peak.handPositions.r[1]>1.5);}
});
test('carry contacts follow a body transform instead of compensating into fixed world space',()=>{
 const rest=new THREE.Matrix4().makeTranslation(0,1.18,0),inverse=rest.clone().invert();
 const start=carryRig(rest,inverse),delta=new THREE.Matrix4().makeRotationY(.15);delta.setPosition(.025,.04,-.01);
 const moved=carryRig(delta.clone().multiply(rest),inverse);
 assert.ok(moved.position.distanceTo(start.position)>.04);
 assert.ok(moved.position.distanceTo(start.position.clone().applyMatrix4(delta))<1e-8);
 for(const side of ['l','r'])assert.ok(moved.hands[side].palm.distanceTo(start.hands[side].palm.clone().applyMatrix4(delta))<1e-8);
});
test('baked carry cycles move the rifle with the torso and keep both palms on their grips',()=>{
 const measurements=manifest.characters.soldier.production.measurements;
 for(const action of ['idle','walk'])for(const direction of FACINGS){
  const frames=measurements.filter(r=>r.action===action&&r.direction===direction),initial=frames[0].weapon;
  assert.ok(frames.every(r=>r.weapon),'missing body-relative weapon records');
  assert.ok(Math.max(...frames.map(r=>Math.hypot(...r.weapon.position.map((n,i)=>n-initial.position[i]))))>.001,'weapon is world-locked');
  for(const {weapon} of frames){
   assert.ok(Math.hypot(...weapon.bodyLocal.map((n,i)=>n-initial.bodyLocal[i]))<1e-5,'weapon slips relative to torso');
   for(const palm of Object.values(weapon.palms))assert.ok(palm.error<1e-5,'palm misses grip');
  }
 }
});
test('the support elbow keeps forward clearance without changing arm lengths or grip contact',()=>{
 for(const r of manifest.characters.soldier.production.measurements.filter(r=>r.carryArms)){
  const {shoulder,elbow,wrist}=r.carryArms.l;
  assert.ok(elbow[2]-shoulder[2]>.15,'support elbow folds behind the torso');
  assert.ok(elbow[0]>.14,'support elbow folds inward across the chest');
  const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
  assert.ok(Math.abs(distance(shoulder,elbow)-r.handErrors.l.lengths[0])<1e-6);
  assert.ok(Math.abs(distance(elbow,wrist)-r.handErrors.l.lengths[1])<1e-6);
  assert.ok(r.weapon.palms.l.error<1e-5);
 }
});
test('walking cups the left support hand without moving the palm contact, rifle or right hand',()=>{
 const body=new THREE.Matrix4().makeTranslation(0,1.18,0),inverse=body.clone().invert(),idle=carryRig(body,inverse,'idle'),walk=carryRig(body,inverse,'walk');
 assert.deepEqual(walk.position.toArray(),idle.position.toArray());assert.deepEqual(walk.quaternion.toArray(),idle.quaternion.toArray());
 for(const side of ['l','r'])assert.deepEqual(walk.hands[side].palm.toArray(),idle.hands[side].palm.toArray());
 assert.deepEqual(walk.hands.r.wrist.toArray(),idle.hands.r.wrist.toArray());assert.deepEqual(walk.hands.r.quaternion.toArray(),idle.hands.r.quaternion.toArray());
 assert.ok(walk.hands.l.wrist.distanceTo(idle.hands.l.wrist)>.06);
});
test('walking sleeve vertices clear the posed torso and vest, with current source and atlas evidence',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../assets/rigged-pilot/review/mesh-clearance.json',import.meta.url)));
 assert.equal(report.method,'emitted-joint-source-skin-clearance');assert.ok(report.armSamples>100&&report.torsoSamples>100);assert.equal(report.poses.now.length,16);
 for(const [file,hash]of Object.entries(report.hashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hash,'stale clearance evidence: '+file);
 for(const pose of report.poses.now){assert.equal(pose.inTorso,0);assert.equal(pose.inVest,0);assert.ok(pose.minVestGap>0);assert.ok(pose.reconstructionError<1e-5);}
 for(const r of manifest.characters.soldier.production.measurements.filter(r=>r.action==='walk'))assert.ok(r.carryArms.l.elbow[0]-r.carryArms.l.shoulder[0]>.03,'walk support elbow folds inward');
});
test('a stowed rifle sits diagonally behind the torso and follows its translation and rotation',()=>{
 const rest=new THREE.Matrix4().makeTranslation(0,1.18,0),inverse=rest.clone().invert(),start=backRig(rest,inverse);
 const forward=new THREE.Vector3(0,0,1).applyQuaternion(start.quaternion);
 assert.ok(start.position.z<-.2);assert.ok(forward.y>.85&&forward.x>.3&&Math.abs(forward.z)<1e-8);
 const delta=new THREE.Matrix4().makeRotationX(.35);delta.setPosition(.04,-.06,.1);
 const moved=backRig(delta.clone().multiply(rest),inverse);
 assert.ok(moved.position.distanceTo(start.position.clone().applyMatrix4(delta))<1e-8);
 assert.ok(moved.quaternion.angleTo(new THREE.Quaternion().setFromRotationMatrix(delta).multiply(start.quaternion))<1e-7);
});
test('every gathering pose keeps the rifle on the back without constraining either working hand',()=>{
 const frames=manifest.characters.soldier.production.measurements.filter(r=>r.action==='gather');
 assert.equal(frames.length,128);
 for(const r of frames){
  assert.equal(r.weapon.attachment,'back');assert.deepEqual(r.handErrors,{});assert.equal(r.weapon.palms,undefined);
  const first=frames.find(f=>f.direction===r.direction);
  assert.ok(Math.hypot(...r.weapon.bodyLocal.map((n,i)=>n-first.weapon.bodyLocal[i]))<1e-7);
  assert.ok(new THREE.Quaternion().fromArray(r.weapon.bodyOrientation).normalize().angleTo(new THREE.Quaternion().fromArray(first.weapon.bodyOrientation).normalize())<1e-7);
 }
});
