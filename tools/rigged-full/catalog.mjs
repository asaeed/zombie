import {CAST} from '../brushwork-full/catalog.mjs';
export const DIRECTIONS=['S','SE','E','NE','N','NW','W','SW'];
const FACING_CALIBRATION='screen-compass-turn-order-v1';
export function withWorldFacings(id,metadata){
 if(id==='suv'||metadata.production?.facingCalibration===FACING_CALIBRATION)return metadata;
 const sourceFacing=d=>DIRECTIONS[(8-DIRECTIONS.indexOf(d))%8];
 const clips=Object.fromEntries(Object.entries(metadata.clips).map(([name,clip])=>[name,{...clip,
  directions:Object.fromEntries(DIRECTIONS.map(d=>[d,clip.directions[sourceFacing(d)]]))}]));
 const production={...metadata.production,facingCalibration:FACING_CALIBRATION};
 if(production.measurements)production.measurements=production.measurements.map(r=>({...r,direction:sourceFacing(r.direction)}));
 return {...metadata,clips,production};
}
export const HUMANOID_DISPLAY_SCALE=1.2,VEHICLE_DISPLAY_SCALE=2.5;
export const BRUTE_DISPLAY_SCALE=HUMANOID_DISPLAY_SCALE*.8;
export const BOSS_DISPLAY_SCALE=HUMANOID_DISPLAY_SCALE*CAST.brute.size*1.5/CAST.boss.size;
export function withVehicleGrounding(id,metadata){
 if(id!=='suv'||metadata.production?.groundCalibration==='wheel-plane-v1')return metadata;
 return {...metadata,footAnchor:{...metadata.footAnchor,y:metadata.footAnchor.y-8},
  production:{...metadata.production,groundCalibration:'wheel-plane-v1'}};
}
export function withDisplayScale(id,metadata){
 const multiplier=id==='suv'?VEHICLE_DISPLAY_SCALE:id==='boss'?BOSS_DISPLAY_SCALE:id==='brute'?BRUTE_DISPLAY_SCALE:HUMANOID_DISPLAY_SCALE;
 return {...metadata,renderScale:metadata.renderScale/(metadata.presentationScale??1)*multiplier,presentationScale:multiplier};
}
export const ROLES={
 soldier:{...CAST.soldier,pilot:true},walker:{...CAST.walker,color:0x9ea6a0,lean:.15,fps:10,idleFrames:16,idleFps:8,attackFps:18},
 scout:{...CAST.scout,color:0x35bda3,gun:true,hat:'cap'},
 builder:{...CAST.builder,color:0xe9943f,tool:'hammer',hat:'hardhat'},
 medic:{...CAST.medic,color:0xd684a5,tool:'kit',hat:'medic'},
 sniper:{...CAST.sniper,color:0x509867,gun:true,hat:'cap',scope:true},
 heavy:{...CAST.heavy,color:0x353f44,tool:'club',hat:'helmet',width:1.28,attackSource:'Idle_Loop',attackFrames:32,attackFps:24},
 torchbearer:{...CAST.torchbearer,color:0xdfc846,tool:'torch',hat:'cap'},
 runner:{...CAST.runner,color:0x9ea6a0,lean:.08,walkSource:'Crouch_Fwd_Loop',width:.9},
 brute:{...CAST.brute,color:0x969e97,lean:.18,customModel:'stocky-brute-v1',attackSource:'Punch_Jab',attackFollowup:'Punch_Cross',attackFrames:48,attackFps:36},
 spitter:{...CAST.spitter,color:0x9ea6a0,lean:.20,marker:0xadf257},
 exploder:{...CAST.exploder,color:0x9ea6a0,lean:.18,width:1.12,marker:0xffa04c,walkSource:'Jog_Fwd_Loop'},
 screamer:{...CAST.screamer,color:0x9ea6a0,lean:.15,marker:0xf568cf},
 boss:{...CAST.boss,color:0x87938d,lean:.18,customModel:'stocky-boss-v1',marker:0x5eece4,attackSource:'Punch_Cross',attackFrames:32,attackFps:24},
 'walker-cap':{...CAST['walker-cap'],color:0x9ea6a0,lean:.15,hat:'grey-cap'},
 'walker-dress':{...CAST['walker-dress'],fps:26,color:0x9ea6a0,lean:.15,skirt:true,hair:'bob'},
 'walker-onearm':{...CAST['walker-onearm'],color:0x9ea6a0,lean:.15,missing:'l'},
};
export function clipsFor(role){
 const clips=[{name:'idle',source:role.tool==='torch'?'Idle_Torch_Loop':role.walkSource==='Crouch_Fwd_Loop'?'Crouch_Idle_Loop':'Idle_Loop',frames:role.idleFrames??8,fps:role.idleFps??4,loop:true},
  {name:'walk',source:role.walkSource??'Walk_Loop',frames:16,fps:role.fps,loop:true}];
 if(role.strike)clips.push({name:role.strike,source:role.attackSource??(role.gun?'Pistol_Shoot':role.tool==='club'?'Sword_Attack':role.tool==='hammer'?'Punch_Cross':role.walkSource==='Crouch_Fwd_Loop'?'Crouch_Idle_Loop':'Idle_Loop'),frames:role.attackFrames??16,fps:role.attackFps??(role.fps<=10?12:24),loop:false});
 if(role.group==='unit')clips.push({name:'gather',source:'PickUp_Table',frames:16,fps:12,loop:true});
 if(role.work)clips.push({name:role.work,source:role.work==='repair'?'Interact':'PickUp_Table',frames:16,fps:12,loop:true});
 return clips;
}
