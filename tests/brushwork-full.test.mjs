import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {motion} from '../tools/brushwork-full/motion.mjs';
const root=new URL('../',import.meta.url),base=new URL('assets/brushwork-full/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
const original=JSON.parse(readFileSync(new URL('assets/brushwork/manifest.json',root),'utf8'));
const context=vm.createContext({window:{location:{search:''}},URLSearchParams});
vm.runInContext(readFileSync(new URL('js/diorama-art.js',root),'utf8'),context);
const frameFor=vm.runInContext('sculptedActorFrame',context);
test('layered Brushwork covers the full skin without replacing legacy art or changing unit sizes',()=>{
 const registry=JSON.parse(readFileSync(new URL('assets/art-packs/registry.json',root),'utf8'));
 assert.equal(registry.default,'rigged');assert.equal(registry.packs.some(p=>p.id==='brushwork'),false);
 assert.equal(registry.packs.some(p=>p.id==='brushwork-layered'),false);
 context.manifest=manifest;vm.runInContext('validateArtManifest(manifest)',context);
 assert.equal(manifest.style,'brushwork-layered');assert.equal(manifest.imageSmoothing,true);assert.equal(manifest.imageSmoothingQuality,'high');
 assert.deepEqual(Object.keys(manifest.characters).sort(),Object.keys(original.characters).sort());assert.deepEqual(Object.keys(manifest.objects).sort(),Object.keys(original.objects).sort());
 for(const[id,m]of Object.entries(manifest.characters))assert.ok(Math.abs(m.bodyHeight*m.renderScale-original.characters[id].bodyHeight*original.characters[id].renderScale)<1e-8,id+' display size');
 assert.equal(manifest.terrain.frames.length,48);for(const colors of Object.values(manifest.terrain.palette))assert.equal(colors.length,2);
});
test('every atlas frame is in bounds and runtime selects all directions and actions correctly',()=>{
 for(const m of [...Object.values(manifest.characters),...Object.values(manifest.objects),manifest.terrain]){
  const url=new URL(m.image,base);assert.ok(url.pathname.startsWith(new URL('assets/',root).pathname));
  const png=readFileSync(url),w=png.readUInt32BE(16),h=png.readUInt32BE(20);
  for(const f of m.frames??Object.values(m.clips??{}).flatMap(c=>Object.values(c.directions).flat()))assert.ok(f.x>=0&&f.y>=0&&f.x+f.width<=w&&f.y+f.height<=h);
  if(m.width){assert.equal(m.width,w);assert.equal(m.height,h);}if(!m.clips)continue;
  if(m.group!=='vehicle'){assert.equal(m.bodyHeight,96);for(const frames of Object.values(m.clips.walk.directions))assert.equal(frames.length,16);}
  for(const[action,c]of Object.entries(m.clips))for(const[d,frames]of Object.entries(c.directions))frames.forEach((f,n)=>{
   const time=(n+.01)/c.fps,actor={facing:d,lastMotionAt:action==='walk'?time:-Infinity,animDistance:action==='walk'?(n+.01)*m.walkStride:0,attackAnimStart:action===m.strike?0:-Infinity,gatherAnimTime:time};
   assert.deepEqual(JSON.parse(JSON.stringify(frameFor({metadata:m},actor,time,['gather','heal','repair'].includes(action)?action:null))),f);
  });
 }
});
test('action poses keep feet and leg joints fixed; walks are periodic with constant bone lengths',()=>{
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 for(const[id,m]of Object.entries(manifest.characters).filter(([,m])=>m.production.bindings))for(const direction of ['S','SE','E','NE','N']){
  const b=m.production.bindings[direction],def=m.production.motion;
  for(const action of Object.keys(m.clips).filter(a=>a!=='walk'))for(const phase of [0,.125,.25,.5,.75,.99]){
   const pose=motion(b,direction,phase,def,action);pose.legs.forEach((leg,i)=>{for(const joint of ['hip','knee','ankle'])assert.deepEqual(leg[joint],b.legs[i][joint],id+'/'+action+'/'+joint);assert.equal(leg.pitch,0);});
  }
  const first=motion(b,direction,0,def,'walk'),last=motion(b,direction,1,def,'walk');
  first.legs.forEach((leg,i)=>{for(const joint of ['hip','knee','ankle'])assert.ok(distance(leg[joint],last.legs[i][joint])<1e-8);assert.ok(Math.abs(leg.pitch-last.legs[i].pitch)<1e-8);});
  first.arms.forEach((arm,i)=>assert.ok(Math.abs(arm.rotation-last.arms[i].rotation)<1e-8));
  for(let n=0;n<16;n++)motion(b,direction,n/16,def,'walk').legs.forEach((leg,i)=>{
   if(leg.projected){
    assert.equal(leg.ankle.x,b.legs[i].ankle.x);assert.equal(leg.knee.x,b.legs[i].knee.x);
    assert.ok(Math.abs(distance(leg.hip,leg.knee)-distance(b.legs[i].hip,b.legs[i].knee))<7);
    assert.ok(Math.abs(distance(leg.knee,leg.ankle)-distance(b.legs[i].knee,b.legs[i].ankle))<7);
   }else{assert.ok(Math.abs(distance(leg.hip,leg.knee)-distance(b.legs[i].hip,b.legs[i].knee))<1e-8);assert.ok(Math.abs(distance(leg.knee,leg.ankle)-distance(b.legs[i].knee,b.legs[i].ankle))<1e-8);}
  });
 }
});
test('authored limb ownership, proportions and frontal foot lanes do not invert',()=>{
 for(const[id,m]of Object.entries(manifest.characters).filter(([,m])=>m.production.bindings)){
  assert.equal(m.production.anatomy.length,5);
  const s=m.production.bindings.S,se=m.production.bindings.SE;
  assert.ok(s.arms[0].shoulder.x<s.arms[1].shoulder.x,id+' front shoulder ownership');
  assert.ok(se.legs[0].hip.x<se.legs[1].hip.x,id+' SE hip ownership');
  for(const d of ['S','N']){
   const b=m.production.bindings[d];
   for(let n=0;n<16;n++){
    const p=motion(b,d,n/16,m.production.motion,'walk');
    assert.equal(Math.sign(p.legs[0].ankle.x-p.legs[1].ankle.x),Math.sign(b.legs[0].ankle.x-b.legs[1].ankle.x));
   }
  }
  for(const b of Object.values(m.production.bindings))for(const l of b.legs){
   assert.ok(l.hip.y>=175&&l.hip.y<=211,id+' hip proportion');
   assert.ok(l.ankle.y-l.hip.y>85,id+' usable leg length');
  }
 }
 assert.deepEqual(manifest.characters.soldier.production.approvedWalk.facings,['SE','E','NE','N','NW','W','SW']);
});
test('buildings retain original source pixels without growing their display footprint',()=>{
 for(const[id,m]of Object.entries(manifest.objects).filter(([,m])=>m.group==='building')){
  assert.equal(m.displaySize.width,original.objects[id].width);assert.equal(m.displaySize.height,original.objects[id].height);
  assert.ok(m.width/m.displaySize.width>=2,id+' actual pixel density');
  assert.equal(m.production.method,'native source crop, no intermediate downsample');
 }
});
test('aimed poses bind two-handed upper paintings, with separate head registration for the rear sniper',()=>{
 for(const id of ['soldier','scout','sniper']){
  const p=manifest.characters[id].production;
  assert.equal(p.upperPoseSource.columns,2);assert.equal(p.upperPoseSource.rows,3);
  for(const d of ['S','SE','E','NE','N']){
   const b=p.upperPoseBindings[d].shoot;assert.deepEqual(b.anchor,{x:192,y:80});assert.ok(b.scale>0);
   assert.match(b.source,/source\/repair-r2\//);
  }
 }
 const back=manifest.characters.sniper.production.upperPoseBindings.N.shoot;
 assert.match(back.source,/sniper-back\.png$/);assert.ok(back.headTop>back.rect.y,'barrel above cap is not the head landmark');
 assert.ok(manifest.characters.soldier.production.upperPoseBindings.S.ready);
});
test('builder replacement records actual directional leg paintings and per-view joint landmarks',()=>{
 const p=manifest.characters.builder.production;assert.equal(p.directionalLegSource.columns,2);assert.equal(p.directionalLegSource.rows,5);
 for(const d of ['S','SE','E','NE','N'])for(const leg of p.directionalLegJoints[d]){
  assert.ok(leg.hip[1]<leg.knee[1]&&leg.knee[1]<leg.ankle[1]);
  for(const point of Object.values(leg))assert.ok(point.every(v=>v>=0&&v<=1));
 }
});
test('sources, preserved approval and left-facing mirrors are recorded honestly',()=>{
 for(const id of ['soldier','walker'])assert.equal(manifest.characters[id].production.retainedApprovedWalk,true);
 for(const id of ['walker-cap','walker-dress'])assert.match(manifest.characters[id].production.bodyVariant.url,/walker-bodies\.png$/);
 assert.equal(manifest.characters['walker-onearm'].production.motion.variant,'onearm');
 for(const m of Object.values(manifest.characters).filter(m=>m.production.bindings)){
  assert.equal(m.production.source.columns,5);assert.equal(m.production.source.rows,5);assert.equal(m.production.source.matteCutoff,224);
  for(const[left,right]of Object.entries({NW:'NE',W:'E',SW:'SE'})){assert.equal(m.production.bindings[left].sourceFacing,right);assert.equal(m.production.bindings[left].mirrored,true);}
 }
});
