import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ROLES,DIRECTIONS,withDisplayScale,withWorldFacings,withVehicleGrounding,HUMANOID_DISPLAY_SCALE,VEHICLE_DISPLAY_SCALE,BOSS_DISPLAY_SCALE,BRUTE_DISPLAY_SCALE} from '../tools/rigged-full/catalog.mjs';
const root=new URL('../',import.meta.url),base=new URL('assets/rigged-full/',root),read=f=>JSON.parse(fs.readFileSync(new URL(f,root),'utf8'));
const manifest=read('assets/rigged-full/manifest.json'),pilot=read('assets/rigged-pilot/manifest.json'),old=read('assets/brushwork-full/manifest.json');
const context=vm.createContext({window:{location:{search:''}},URLSearchParams});vm.runInContext(fs.readFileSync(new URL('js/diorama-art.js',root),'utf8'),context);context.manifest=manifest;
const frameFor=vm.runInContext('sculptedActorFrame',context);
test('rigged pack is the only shipped skin and covers every runtime role',()=>{
 const registry=read('assets/art-packs/registry.json');assert.equal(registry.default,'rigged');assert.equal(registry.packs.find(p=>p.id==='rigged').manifest,'assets/rigged-full/manifest.json');
 assert.equal(registry.packs.length,1);
 assert.equal(manifest.style,'rigged');assert.equal(manifest.imageSmoothing,true);assert.equal(manifest.imageSmoothingQuality,'high');vm.runInContext('validateArtManifest(manifest)',context);
 assert.deepEqual(Object.keys(manifest.characters).sort(),Object.keys(old.characters).sort());
 for(const[id,m]of Object.entries(manifest.characters)){
  const multiplier=id==='suv'?VEHICLE_DISPLAY_SCALE:id==='boss'?BOSS_DISPLAY_SCALE:id==='brute'?BRUTE_DISPLAY_SCALE:HUMANOID_DISPLAY_SCALE;
  assert.equal(m.presentationScale,multiplier);
  assert.ok(Math.abs(m.bodyHeight*m.renderScale-old.characters[id].bodyHeight*old.characters[id].renderScale*multiplier)<1e-8,id+' display scale');
 }
});
test('display resizing is idempotent and preserves source geometry, anchors and animation timing',()=>{
 for(const[id,m]of Object.entries(manifest.characters)){
  const original={...m,renderScale:m.renderScale/m.presentationScale};delete original.presentationScale;
  const resized=withDisplayScale(id,original);
  assert.deepEqual(withDisplayScale(id,resized),resized);
  assert.equal(resized.footAnchor,original.footAnchor);assert.equal(resized.clips,original.clips);
  assert.equal(resized.production,original.production);assert.equal(resized.walkStride,original.walkStride);
  assert.equal(resized.bodyHeight,original.bodyHeight);assert.equal(resized.image,original.image);
 }
});
test('vehicle selection follows enlarged artwork without changing physical radius',()=>{
 const sandbox=vm.createContext({worldToScreen:(x,y)=>({x,y}),sculptedActor:()=>({metadata:manifest.characters.suv})});
 vm.runInContext(fs.readFileSync(new URL('js/input.js',root),'utf8'),sandbox);
 const InputHandler=vm.runInContext('InputHandler',sandbox),input=Object.create(InputHandler.prototype);
 const vehicle={x:100,y:100,def:{radius:18},dead:false};input.game={camera:{zoom:1},vehicles:[vehicle]};
 assert.equal(input._getVehicleAt(140,90),vehicle);assert.equal(input._getVehicleAt(155,90),null);
 assert.equal(vehicle.def.radius,18);
});
test('vehicle shadow is half the original size without shrinking selection or the sprite',()=>{
 const sandbox=vm.createContext({worldToScreen:(x,y)=>({x,y}),sculptedActor:()=>({metadata:manifest.characters.suv})});
 vm.runInContext(fs.readFileSync(new URL('js/renderer.js',root),'utf8'),sandbox);
 const Renderer=vm.runInContext('Renderer',sandbox),renderer=Object.create(Renderer.prototype);
 const vehicle={x:100,y:100,def:{radius:18},hp:100,maxHp:100,waypoints:[],passengers:[]};
 const game={camera:{zoom:2},selectedVehicle:vehicle},ellipses=[];let spriteScale;
 renderer._groundEllipse=(_ctx,_point,r,zoom)=>ellipses.push({r,zoom});
 renderer._drawActorSprite=(_ctx,_art,_frame,_point,zoom)=>{spriteScale=zoom;};
 renderer._drawHealthBar=()=>{};
 renderer._drawVehicle({stroke(){},fill(){}},game,vehicle);
 const radius=18*.5*manifest.characters.suv.presentationScale;
 assert.deepEqual(ellipses,[{r:radius+4,zoom:2},{r:(radius+3)*.5,zoom:2}]);
 assert.equal(spriteScale,2);assert.equal(vehicle.def.radius,18);
});
test('all survivors, zombies and vehicles use lighter ground shadows',()=>{
 const sandbox=vm.createContext({worldToScreen:(x,y)=>({x,y}),
  sculptedActor:type=>({metadata:manifest.characters[type]}),sculptedActorFrame:()=>({}),
  dioramaPilotImage:()=>null,zombieAppearance:()=>0});
 vm.runInContext(fs.readFileSync(new URL('js/renderer.js',root),'utf8'),sandbox);
 const Renderer=vm.runInContext('Renderer',sandbox),renderer=Object.create(Renderer.prototype);
 renderer._groundEllipse=()=>{};renderer._drawActorSprite=()=>{};renderer._drawHealthBar=()=>{};
 const game={camera:{zoom:1},gameTime:0,selectedVehicle:null};
 for(const type of ['soldier','scout','builder','medic','sniper','heavy','torchbearer',
  'walker','runner','brute','spitter','exploder','screamer','boss','suv']){
  const actor={type,x:100,y:100,id:1,def:{radius:18},hp:100,maxHp:100,
   waypoints:[],passengers:[],carrying:0,resourcePopups:[]},fills=[];
  const ctx=new Proxy({fill(){fills.push(this.fillStyle);}},
   {get:(target,key)=>key in target?target[key]:()=>{}});
  const method=type==='suv'?'_drawVehicle':ROLES[type].group==='zombie'?'_drawZombie':'_drawUnit';
  renderer[method](ctx,game,actor);
  assert.equal(fills[0],'rgba(0,0,0,0.18)',type+' shadow opacity');
 }
});
test('approved soldier artwork and clip cells remain exact with calibrated direction labels',()=>{
 for(const id of ['soldier']){assert.ok(fs.readFileSync(new URL(manifest.characters[id].image,base)).equals(fs.readFileSync(new URL('assets/rigged-pilot/'+id+'.png',root))));assert.deepEqual(manifest.characters[id].clips,withWorldFacings(id,pilot.characters[id]).clips);assert.equal(manifest.characters[id].production.acceptedPilot,true);}
});
test('world-facing calibration reverses the baked turn order once for every action, but never the SUV',()=>{
 for(const[id,m]of Object.entries(manifest.characters)){
  assert.equal(withWorldFacings(id,m),m);
  if(id==='suv'){assert.deepEqual(m.clips,old.characters.suv.clips);continue;}
  assert.equal(m.production.facingCalibration,'screen-compass-turn-order-v1');
  const raw={...m,production:{...m.production}};delete raw.production.facingCalibration;
  const corrected=withWorldFacings(id,raw);
  for(const[action,clip]of Object.entries(m.clips))for(const[d,frames]of Object.entries(clip.directions))assert.equal(corrected.clips[action].directions[DIRECTIONS[(8-DIRECTIONS.indexOf(d))%8]],frames);
  assert.equal(withWorldFacings(id,corrected),corrected);
 }
});
test('every directional cell is in bounds and the actual runtime selects all delivered frames',()=>{
 for(const m of Object.values(manifest.characters)){
  assert.deepEqual(m.directions,DIRECTIONS);const png=fs.readFileSync(new URL(m.image,base)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  for(const[action,clip]of Object.entries(m.clips))for(const[d,frames]of Object.entries(clip.directions))frames.forEach((f,n)=>{
   assert.ok(f.x>=0&&f.y>=0&&f.x+f.width<=width&&f.y+f.height<=height);
   const time=(n+.01)/clip.fps,actor={facing:d,lastMotionAt:action==='walk'?time:-Infinity,animDistance:action==='walk'?(n+.01)*m.walkStride:0,attackAnimStart:action===m.strike?0:-Infinity,gatherAnimTime:time};
   assert.deepEqual(JSON.parse(JSON.stringify(frameFor({metadata:m},actor,time,['gather','heal','repair'].includes(action)?action:null))),f);
  });
 }
});
test('retargeted rigs retain fixed limb lengths and anatomical ownership throughout motion',()=>{
 const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
 for(const[id,m]of Object.entries(manifest.characters).filter(([,m])=>m.production.measurements&&m.production.retarget&&!m.production.acceptedPilot)){
  const first=m.production.measurements[0];
  for(const r of m.production.measurements)for(const side of ['l','r']){
   for(const[a,b]of [['shoulder','elbow'],['elbow','wrist'],['hip','knee'],['knee','ankle']])assert.ok(Math.abs(distance(r.joints[side][a],r.joints[side][b])-distance(first.joints[side][a],first.joints[side][b]))<1e-6,id+'/'+r.action+'/'+a);
   if(!ROLES[id].missing)assert.ok(distance(r.joints.l.wrist,r.joints.r.wrist)>.04,id+' duplicated hands');
  }
 }
});
test('new rifle users retain palm contacts, a clear walking elbow and back-mounted gathering weapons',()=>{
 for(const id of ['scout','sniper'])for(const r of manifest.characters[id].production.measurements){
  if(r.action==='gather'){assert.equal(r.prop.storage,'back');assert.deepEqual(r.handErrors,{});assert.equal(r.prop.palms,null);}
  if(r.prop.palms)for(const error of Object.values(r.prop.palms))assert.ok(error<1e-5);
  if(r.action==='walk')assert.ok(r.joints.l.elbow[0]-r.joints.l.shoulder[0]>.03);
 }
});
test('heavy keeps the club in his right palm through walking, carrying and attacking',()=>{
 const poses=manifest.characters.heavy.production.measurements.filter(r=>r.action!=='gather');
 assert.equal(poses.length,8*(8+16+32));
 for(const r of poses){
  const label=r.action+'/'+r.direction+'/'+r.frame;
  assert.equal(r.prop.storage,'hands',label);
  assert.ok(r.prop.palms.r<1e-5,label+' palm contact');
  if(r.action!=='walk')assert.ok(r.handErrors.r.error<1e-5,label+' reachable grip');
  if(r.action==='idle'){
   assert.ok(r.prop.bodyLocal[0]<-.25,label+' carry grip outside right torso');
   assert.ok(r.prop.bodyLocal[2]>.20,label+' carried weapon in front of body');
  }
  if(r.action==='attack'){
   for(let i=0;i<=10;i++){
    const p=r.prop.bodyLocal.map((v,n)=>v+(r.prop.bodyTip[n]-v)*i/10);
    assert.ok(p[0]<-.24||p[0]>.20||p[2]>.18,label+' shaft clears the torso on both sides of the sweep');
   }
  }else if(r.action==='idle')assert.ok(r.prop.bodyTip[2]-r.prop.bodyLocal[2]>.46,label+' carried club points forward');
  assert.ok(Math.abs(Math.hypot(...r.prop.tip.map((v,i)=>v-r.prop.position[i]))-.52)<1e-6,label+' stable weapon length');
 }
});
test('walking heavy relaxes his weapon arm and carries the club on a fixed palm attachment',()=>{
 const m=manifest.characters.heavy,poses=m.production.measurements.filter(r=>r.action==='walk');
 assert.equal(poses.length,8*16);
 for(const r of poses){
  const arm=r.bindSpaceArms.r;
  assert.ok(arm.shoulder[1]-arm.wrist[1]>.35,'weapon arm hangs below the shoulder');
  assert.ok(arm.elbow[1]>arm.wrist[1],'forearm hangs naturally');
  assert.deepEqual(r.handErrors,{},'walking arm is free of carry IK constraints');
  assert.equal(r.walkMotion.source,'Walk_Loop');
  r.prop.handLocal.forEach((v,i)=>assert.ok(Math.abs(v-[0,.06,0][i])<1e-6,'weapon stays at the palm'));
  const q=r.prop.handLocalRotation;
  assert.ok(Math.abs(q[0])<1e-6&&Math.abs(q[1])<1e-6,'fixed hand-local grip rotation');
  assert.ok(Math.abs(Math.abs(q[2])-Math.SQRT1_2)<1e-6&&Math.abs(Math.abs(q[3])-Math.SQRT1_2)<1e-6,'fixed shaft rotation in the grip');
  const forearm=r.joints.r.wrist.map((v,i)=>v-r.joints.r.elbow[i]),length=Math.hypot(...forearm);
  assert.ok(forearm.reduce((dot,v,i)=>dot+v/length*r.prop.forward[i],0)>.999,'club hangs along the forearm');
 }
 for(const d of m.directions){
  const cycle=poses.filter(r=>r.direction===d),right=cycle.map(r=>r.bindSpaceArms.r.wrist[2]),left=cycle.map(r=>r.bindSpaceArms.l.wrist[2]);
  assert.ok(Math.max(...right)-Math.min(...right)>.25,'weapon hand swings through the walk');
  const mean=a=>a.reduce((sum,v)=>sum+v,0)/a.length,rm=mean(right),lm=mean(left);
  const covariance=right.reduce((sum,v,i)=>sum+(v-rm)*(left[i]-lm),0),variance=a=>a.reduce((sum,v)=>sum+(v-mean(a))**2,0);
  assert.ok(covariance/Math.sqrt(variance(right)*variance(left))<-.9,'arms swing in opposite phases');
 }
});
test('brute retains its natural body and keeps the selected walk with authored alternating strikes',()=>{
 const m=manifest.characters.brute,shape=m.production.customShape;
 assert.equal(m.production.sourceModel,'custom-stocky-brute');assert.equal(ROLES.brute.customModel,'stocky-brute-v1');
 assert.equal(ROLES.brute.width,undefined);assert.equal(shape.version,'stocky-brute-v1');
 const model=fs.readFileSync(new URL(m.production.source,base));assert.equal(model.toString('ascii',0,4),'glTF');
 const gltf=JSON.parse(model.toString('utf8',20,20+model.readUInt32LE(12)));assert.ok(gltf.skins.length>0);
 assert.ok(gltf.nodes.some(n=>n.extras?.customShape?.version==='stocky-brute-v1'));
 assert.ok(shape.alteredVertices>2000);assert.ok(shape.headVertices>2000);assert.equal(shape.maxHeadDisplacement,0);
 assert.ok(shape.belly.after.width>shape.belly.before.width);
 assert.ok(shape.belly.after.width<shape.belly.before.width*1.2);
 assert.ok(shape.belly.after.depth<shape.belly.before.depth*1.25);
 assert.ok(shape.chest.after.width>shape.belly.after.width*1.35);
 assert.ok(shape.chest.after.width>shape.chest.before.width*1.15);
 assert.ok(shape.chest.after.width<shape.chest.before.width*1.35);
 assert.ok(shape.chest.after.depth<shape.chest.before.depth*1.25);
 for(const r of m.production.measurements){
  assert.deepEqual(r.modelScale,[1,1,1]);
  for(const e of Object.values(r.handErrors))assert.ok(e.error<1e-5);
  if(r.action==='idle'||r.action==='walk')for(const [side,arm] of Object.entries(r.bindSpaceArms)){
   if(r.action==='walk'){
    assert.ok(arm.wrist[1]>1&&arm.wrist[1]<1.04,'selected low walking wrist height');
    assert.ok(Math.abs(arm.wrist[0])>.31&&Math.abs(arm.wrist[0])<.35,side+' walking hand beside torso');
    assert.ok(arm.wrist[1]<arm.elbow[1]&&arm.elbow[1]<arm.shoulder[1],side+' walking arm hangs down');
   }else{
    assert.ok(arm.wrist[1]>1.4,side+' idle fist stays in the frame-six guard');
    assert.ok(arm.wrist[1]>arm.elbow[1]+.15,side+' idle forearm stays raised');
    assert.ok(arm.wrist[2]-arm.shoulder[2]>.18,side+' ready guard is ahead of the body');
   }
  }
 }
 const attackClip=m.clips.attack;
 assert.equal(attackClip.directions.S.length/attackClip.fps,16/12,'same attack duration');
 assert.deepEqual(m.production.motion.attackSources,['Punch_Jab','Punch_Cross']);
 for(const direction of m.directions){
  const poses=m.production.measurements.filter(r=>r.action==='attack'&&r.direction===direction);
  assert.deepEqual([...new Set(poses.map(r=>r.armAnimation.source))],['Punch_Jab','Punch_Cross']);
  for(const side of ['l','r']){
   const wrists=poses.map(r=>r.bindSpaceArms[side].wrist),peak=wrists.reduce((best,p,i)=>p[2]>wrists[best][2]?i:best,0);
   assert.ok(wrists[peak][2]>.45,side+' forward strike');
   assert.equal(peak<poses.length/2,side==='l',side+' separate strike phase');
   assert.ok(Math.hypot(...wrists[0].map((v,i)=>v-wrists.at(-1)[i]))<1e-5,side+' returns to forward rest');
  }
 }
 assert.equal(m.production.measurements.length,8*(8+16+48));
});
test('exploder keeps a forward reach that moves with his jogging shoulders and stride',()=>{
 const m=manifest.characters.exploder,poses=m.production.measurements.filter(r=>r.action==='walk');
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 assert.equal(poses.length,8*16);
 for(const direction of m.directions)for(const side of ['l','r']){
  const cycle=poses.filter(r=>r.direction===direction),offsets=[];
  for(const r of cycle){
   const {shoulder,elbow,wrist}=r.bindSpaceArms[side],length=distance(shoulder,elbow)+distance(elbow,wrist);
   assert.ok(distance(shoulder,wrist)/length>.97,side+' extended arm');
   assert.ok(distance(shoulder,wrist)<length,side+' soft elbow');
   const offset=wrist.map((v,i)=>v-shoulder[i]);offsets.push(offset);
   assert.ok(offset[2]>.43,side+' reaches in front throughout the stride');
   assert.ok(Math.abs(offset[0])<.18,side+' modest lateral sway');
   assert.ok(Math.abs(offset[1])<.10,side+' reach stays near shoulder height');
   assert.equal(r.runArmMotion.source,'Jog_Fwd_Loop');
   assert.ok(r.handErrors[side].error<1e-5,side+' reachable body-relative target');
  }
  assert.ok(Math.max(...offsets.flatMap(a=>offsets.map(b=>distance(a,b))))>.08,side+' hands move relative to the shoulders with the stride');
  const largestStep=Math.max(...offsets.slice(1).map((v,i)=>distance(v,offsets[i])));
  assert.ok(distance(offsets[0],offsets.at(-1))<largestStep*1.1,side+' loop seam stays within normal stride movement');
 }
});
test('role motions and equipment preserve the intended readable distinctions',()=>{
 assert.ok(ROLES.runner.fps>ROLES.brute.fps*2);assert.equal(ROLES.runner.walkSource,'Crouch_Fwd_Loop');assert.ok(ROLES.boss.size>ROLES.brute.size);assert.ok(ROLES.heavy.width>1);
 assert.equal(ROLES.builder.tool,'hammer');assert.equal(ROLES.medic.tool,'kit');assert.equal(ROLES.heavy.tool,'club');assert.equal(ROLES.torchbearer.tool,'torch');
 for(const id of ['spitter','exploder','screamer','boss'])assert.ok(ROLES[id].marker);
 for(const id of ['walker-cap','walker-dress','walker-onearm'])assert.equal(ROLES[id].marker,undefined);
 const poses=manifest.characters.heavy.production.measurements.filter(r=>r.action==='attack');for(const r of poses)for(const side of ['l','r'])for(const joint of ['hip','knee','ankle'])assert.deepEqual(r.joints[side][joint],poses[0].joints[side][joint]);
});
test('native-density props retain their logical display sizes and ground anchors',()=>{
 assert.ok(Object.keys(old.objects).every(id=>manifest.objects[id]));
 for(const id of Object.keys(old.objects)){
  const m=manifest.objects[id];
  const previous=old.objects[id];
  if(!['car','cabin','bin','pine','bush','rock'].includes(id)){assert.ok(fs.readFileSync(new URL(m.image,base)).equals(fs.readFileSync(new URL(previous.image,new URL('assets/brushwork-full/',root)))));continue;}
  assert.deepEqual(m.displaySize,{width:previous.width,height:previous.height});
  assert.ok(m.width>=previous.width*4);assert.ok(m.height>=previous.height*4);
  assert.ok(Math.abs(m.footAnchor.x*m.displaySize.width/m.width-previous.footAnchor.x)<1e-8);
  assert.ok(Math.abs(m.footAnchor.y*m.displaySize.height/m.height-previous.footAnchor.y)<1e-8);
  const png=fs.readFileSync(new URL(m.image,base));assert.equal(png.readUInt32BE(16),m.width);assert.equal(png.readUInt32BE(20),m.height);
 }
});
test('higher-density terrain preserves its two-color palette and 64 by 32 logical footprint',()=>{
 assert.equal(manifest.terrain.resolutionScale,4);assert.deepEqual(manifest.terrain.palette,old.terrain.palette);
 for(const[f,i]of manifest.terrain.frames.map((f,i)=>[f,i])){const previous=old.terrain.frames[i];for(const k of ['x','y','width','height'])assert.equal(f[k],previous[k]*4);assert.equal(f.type,previous.type);assert.equal(f.variant,previous.variant);}
});
test('vehicle grounding moves the visual contact plane, once, without changing scale or atlas',()=>{
 const m=manifest.characters.suv,raw=old.characters.suv;
 assert.equal(m.footAnchor.y,raw.footAnchor.y-8);assert.equal(m.footAnchor.x,raw.footAnchor.x);
 assert.equal(withVehicleGrounding('suv',m),m);
 assert.deepEqual(withVehicleGrounding('suv',raw).footAnchor,m.footAnchor);
 assert.equal(withVehicleGrounding('soldier',pilot.characters.soldier),pilot.characters.soldier);
 assert.ok(fs.readFileSync(new URL(manifest.characters.suv.image,base)).equals(fs.readFileSync(new URL(old.characters.suv.image,new URL('assets/brushwork-full/',root)))));
});

test('brute chains its punches without dropping to rest or jumping between attack frames',()=>{
 const m=manifest.characters.brute,distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 for(const direction of m.directions){
  const poses=m.production.measurements.filter(r=>r.action==='attack'&&r.direction===direction);
  for(const r of poses)for(const side of ['l','r']){
   assert.ok(r.bindSpaceArms[side].wrist[1]>1.4,'fists stay ready throughout the combo and recovery');
  }
  for(let i=1;i<poses.length;i++)for(const side of ['l','r'])for(const joint of ['shoulder','elbow','wrist']){
   assert.ok(distance(poses[i].joints[side][joint],poses[i-1].joints[side][joint])<.22,'no abrupt '+side+' '+joint+' step at frame '+i);
  }
 }
});
test('heavy reaches up and right, sweeps with an extended weapon arm and recovers',()=>{
 const m=manifest.characters.heavy,distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 assert.equal(m.clips.attack.directions.S.length/m.clips.attack.fps,16/12,'attack duration retained');
 for(const direction of m.directions){
  const poses=m.production.measurements.filter(r=>r.action==='attack'&&r.direction===direction);
  const span=side=>Math.max(...poses.flatMap(a=>poses.map(b=>distance(a.bindSpaceArms[side].wrist,b.bindSpaceArms[side].wrist))));
  assert.ok(span('r')>.80,'weapon arm performs the full strike');
  assert.ok(span('l')<1e-5,'empty arm follows the turning torso without punching');
  const windup=poses.filter(r=>r.attackMotion.phase==='windup'),stroke=poses.filter(r=>r.attackMotion.phase==='swing');
  const raised=windup.reduce((best,r)=>r.joints.r.wrist[1]>best.joints.r.wrist[1]?r:best);
  assert.ok(raised.joints.r.wrist[1]-raised.joints.r.shoulder[1]>.30,'wind-up reaches above the shoulder');
  assert.ok(raised.joints.r.wrist[0]-raised.joints.r.shoulder[0]<-.30,'wind-up stretches to his right');
  for(const r of [raised,...stroke]){
   const {shoulder,elbow,wrist}=r.joints.r,length=distance(shoulder,elbow)+distance(elbow,wrist);
   const reach=distance(shoulder,wrist)/length;
   assert.ok(reach>.98&&reach<1,'near-straight arm with a soft elbow');
  }
  const tipHeight=stroke.map(r=>r.prop.tip[1]);
  assert.ok(Math.max(...tipHeight)-Math.min(...tipHeight)<.10,'club sweeps horizontally at chest level');
  let turn=0,armTurn=0;
  for(let i=0;i<stroke.length;i++){
   assert.ok(Math.abs(stroke[i].prop.forward[1])<1e-6,'shaft stays horizontal during the strike');
   if(i){
    const yawStep=(a,b)=>{let step=Math.atan2(b[0],b[2])-Math.atan2(a[0],a[2]);if(step< -Math.PI)step+=2*Math.PI;if(step>Math.PI)step-=2*Math.PI;return step;};
    const step=yawStep(stroke[i-1].prop.forward,stroke[i].prop.forward);
    const arm=r=>r.joints.r.wrist.map((v,j)=>v-r.joints.r.shoulder[j]);
    const armStep=yawStep(arm(stroke[i-1]),arm(stroke[i]));
    assert.ok(step>0&&armStep>0,'whole arm and club sweep continuously across the chest');turn+=step;armTurn+=armStep;
   }
  }
  assert.ok(Math.abs(turn-Math.PI)<1e-5,'club sweeps a full 180 degrees');
  assert.ok(Math.abs(armTurn-Math.PI)<1e-5,'arm itself sweeps a full 180 degrees');
  for(const r of poses)assert.ok(r.prop.palms.r<1e-5,'club remains gripped throughout the swing');
  assert.ok(distance(poses[0].joints.r.wrist,poses.at(-1).joints.r.wrist)<1e-5,'weapon hand recovers to its starting position');
  assert.ok(distance(poses[0].prop.tip,poses.at(-1).prop.tip)<1e-5,'weapon recovers to the carry pose');
 }
});

test('brute holds the exact sixth-frame ready pose before and after attacks in the runtime selector',()=>{
 const m=manifest.characters.brute;
 assert.equal(m.production.motion.readyFrame,6);
 const config=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('js/config.js',root),'utf8'),config);
 const cooldown=1/vm.runInContext('ZOMBIE_DEFS.brute.atkRate',config);
 const duration=m.clips.attack.directions.S.length/m.clips.attack.fps;
 for(const direction of m.directions){
  const guard=m.production.measurements.find(r=>r.action==='attack'&&r.direction===direction&&r.frame===5);
  const actor={facing:direction,attackAnimStart:10,lastMotionAt:-Infinity,animDistance:0};
  for(const elapsed of [-.1,0,.1,duration-.01,duration+.01,cooldown-.01]){
   const frame=frameFor({metadata:m},actor,10+elapsed),action=elapsed>=0&&elapsed<duration?'attack':'idle';
   const index=m.clips[action].directions[direction].findIndex(r=>r.x===frame.x&&r.y===frame.y);
   assert.ok(index>=0,'runtime selects expected action');
   const pose=m.production.measurements.find(r=>r.action===action&&r.direction===direction&&r.frame===index);
   assert.deepEqual(pose.joints,guard.joints,'holds frame six instead of dropping to neutral');
   assert.deepEqual(pose.handDirections,guard.handDirections,'keeps the same ready wrist orientation');
  }
 }
});
