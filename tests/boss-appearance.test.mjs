import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {BOSS_DISPLAY_SCALE,ROLES} from '../tools/rigged-full/catalog.mjs';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('assets/rigged-full/manifest.json',root)));
test('Boss preserves its display size and gameplay stats with the authored attack',()=>{
  const {boss,brute}=manifest.characters;
  assert.equal(boss.renderScale,.55575);
  assert.equal(boss.presentationScale,BOSS_DISPLAY_SCALE);
  assert.equal(boss.bodyHeight,96);
  assert.ok(Math.abs(brute.renderScale-.2964)<1e-12);
  const context=vm.createContext({});
  vm.runInContext(readFileSync(new URL('js/config.js',root),'utf8'),context);
  const def=vm.runInContext('ZOMBIE_DEFS.boss',context);
  assert.equal(def.radius,22);assert.equal(def.maxHp,3600);assert.equal(def.atkDmg,140);
});

test('Boss uses a forward cross strike with the punching fist aimed at its target',()=>{
  const boss=manifest.characters.boss,clip=boss.clips.attack;
  assert.equal(clip.directions.S.length/clip.fps,16/12,'attack duration retained');
  assert.equal(boss.production.motion.attackSource,'Punch_Cross');
  assert.equal(boss.production.motion.readyFrame,6);
  assert.ok(boss.production.motion.sourceFrames.every(n=>n>=6&&n<=18),'excluded opening and wrist-turn recovery frames');
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const direction of boss.directions){
    const poses=boss.production.measurements.filter(r=>r.action==='attack'&&r.direction===direction);
    assert.equal(poses.length,32);
    assert.ok(poses.every(r=>r.armAnimation.source==='Punch_Cross'));
    const peak=poses.reduce((a,b)=>a.bindSpaceArms.r.wrist[2]>b.bindSpaceArms.r.wrist[2]?a:b);
    const arm=peak.bindSpaceArms.r;
    assert.ok(peak.phase>.2&&peak.phase<.8,'wind-up and recovery around strike');
    assert.ok(arm.wrist[2]-arm.shoulder[2]>.4,'strike reaches forward');
    assert.ok(distance(arm.shoulder,arm.wrist)/(distance(arm.shoulder,arm.elbow)+distance(arm.elbow,arm.wrist))>.9,'arm extends on impact');
    assert.ok(peak.handDirections.r[2]>.9,'fist points at target');
    assert.ok(Math.abs(peak.handDirections.r[0])<.25,'fist is not turned sideways');
    for(const side of ['l','r'])assert.ok(distance(poses[0].bindSpaceArms[side].wrist,poses.at(-1).bindSpaceArms[side].wrist)<1e-5,'returns to the ready guard');
  }
});

test('Boss keeps its natural rig, subtly swings walking arms and holds a raised fighting guard',()=>{
  const boss=manifest.characters.boss,shape=boss.production.customShape;
  assert.equal(ROLES.boss.width,undefined,'no whole-model width stretch');
  assert.equal(boss.production.sourceModel,'custom-stocky-boss');
  assert.equal(shape.version,'stocky-boss-v1');
  assert.ok(shape.headVertices>2800);assert.equal(shape.maxHeadDisplacement,0);
  const source=readFileSync(new URL('assets/rigged-full/'+boss.production.source,root));
  assert.equal(source.toString('ascii',0,4),'glTF');
  const gltf=JSON.parse(source.toString('utf8',20,20+source.readUInt32LE(12)));
  assert.ok(gltf.skins.length>0);
  assert.ok(gltf.nodes.some(n=>n.extras?.customShape?.version==='stocky-boss-v1'));
  for(const r of boss.production.measurements){
    assert.deepEqual(r.modelScale,[1,1,1]);
    for(const side of ['l','r']){
      const {shoulder,elbow,wrist}=r.bindSpaceArms[side];
      if(r.action==='walk'){
        assert.ok(shoulder[1]>elbow[1]&&elbow[1]>wrist[1],side+' walking arm hangs down');
        assert.ok(wrist[1]>1&&wrist[1]<1.08,side+' walking hand beside thigh');
        continue;
      }
      assert.ok(wrist[1]>1.35,side+' fist stays raised throughout attack and idle');
      if(r.action==='attack'&&r.frame!==0&&r.frame!==31)continue;
      assert.ok(shoulder[1]-elbow[1]>.12,side+' guard elbow below shoulder');
      assert.ok(Math.abs(elbow[0]-shoulder[0])<.12,side+' guard elbow close to body');
      assert.ok(wrist[1]-elbow[1]>.15,side+' forearm raised for next punch');
      assert.ok(wrist[2]-shoulder[2]>.18,side+' guard in front of body');
      assert.ok(r.handDirections[side][1]>.7,side+' fist retains the sixth-frame ready orientation');
    }
  }
  for(const direction of boss.directions){
    const walk=boss.production.measurements.filter(r=>r.action==='walk'&&r.direction===direction);
    for(const side of ['l','r']){
      const z=walk.map(r=>r.bindSpaceArms[side].wrist[2]);
      const swing=Math.max(...z)-Math.min(...z);
      assert.ok(swing>.08&&swing<.12,'small forward/backward walking swing');
    }
    const quarter=walk.find(r=>r.frame===4).bindSpaceArms;
    const threeQuarter=walk.find(r=>r.frame===12).bindSpaceArms;
    assert.ok(quarter.l.wrist[2]>threeQuarter.l.wrist[2]&&quarter.r.wrist[2]<threeQuarter.r.wrist[2],'walking arms swing in opposition');
  }
});

test('Boss stays punch-ready when the actual renderer selects idle between attacks',()=>{
  const boss=manifest.characters.boss;
  const context=vm.createContext({window:{location:{search:''}},URLSearchParams});
  vm.runInContext(readFileSync(new URL('js/config.js',root),'utf8'),context);
  vm.runInContext(readFileSync(new URL('js/diorama-art.js',root),'utf8'),context);
  const frameFor=vm.runInContext('sculptedActorFrame',context);
  const cooldown=1/vm.runInContext('ZOMBIE_DEFS.boss.atkRate',context);
  const duration=boss.clips.attack.directions.S.length/boss.clips.attack.fps;
  assert.ok(cooldown>duration,'there is an idle gap before the next punch');
  for(const direction of boss.directions){
    const actor={facing:direction,attackAnimStart:10,lastMotionAt:-Infinity,animDistance:0};
    const ready=boss.production.measurements.find(r=>r.action==='attack'&&r.direction===direction&&r.frame===0);
    for(const elapsed of [-.01,0,.15,.6,duration-.01,duration+.01,cooldown-.01]){
      const frame=frameFor({metadata:boss},actor,10+elapsed);
      const action=elapsed>=0&&elapsed<duration?'attack':'idle';
      const index=boss.clips[action].directions[direction].findIndex(r=>r.x===frame.x&&r.y===frame.y);
      assert.ok(index>=0,'renderer selects '+action+' for elapsed '+elapsed);
      const pose=boss.production.measurements.find(r=>r.action===action&&r.direction===direction&&r.frame===index);
      for(const side of ['l','r'])assert.ok(pose.bindSpaceArms[side].wrist[1]>1.35,side+' stays raised before and after punch');
      if(action==='idle'){
        assert.deepEqual(pose.bindSpaceArms,ready.bindSpaceArms,'same ready arm pose between attacks');
        assert.deepEqual(pose.handDirections,ready.handDirections,'no wrist swivel after punch');
        assert.equal(pose.armAnimation.sourceFrame,6);
      }
    }
  }
});
