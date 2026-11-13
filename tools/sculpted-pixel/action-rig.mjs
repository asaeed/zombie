const clamp=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
function rotate(point,pivot,angle){
  const x=point.x-pivot.x,y=point.y-pivot.y,c=Math.cos(angle),s=Math.sin(angle);
  return {x:pivot.x+x*c-y*s,y:pivot.y+x*s+y*c};
}
function segmentDistance(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1));
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}
function glovePixel(view,point){
  if(!view.pixels)return 1;
  const x=Math.round(point.x*2),y=Math.round(point.y*2);
  for(const[dx,dy]of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
    const px=x+dx,py=y+dy;if(px<0||py<0||px>=256||py>=256)continue;
    const i=(py*256+px)*4,p=view.pixels;
    if(p[i+3]<48)continue;
    return p[i]>p[i+1]*1.3&&p[i+1]>p[i+2]*1.05?1:0;
  }
  return 1;
}

const WORK={lean:.055,shoulder:.36,elbow:.12,lift:2.5,bothArms:false,legRadius:8};
const ATTACK={lean:.085,shoulder:.42,elbow:.15,lift:3,bothArms:false,legRadius:8};
const RIFLE_ARMS=[
  [[79,65],[80,76],[81,84]],[[79,65],[81,74],[84,81]],
  [[67,64],[67,76],[74,84]],[[68,64],[71,76],[78,83]],
  [[48,66],[48,77],[47,84]],[[57,64],[52,74],[47,80]],
  [[66,65],[60,76],[55,84]],[[55,65],[50,75],[47,83]],
];
const WALKER_ARMS=[
  [[81,64],[84,76],[84,86]],[[81,64],[86,75],[90,82]],
  [[70,64],[71,75],[84,83]],[[75,64],[80,76],[84,84]],
  [[47,65],[43,77],[42,86]],[[60,64],[51,75],[44,81]],
  [[63,65],[54,76],[47,82]],[[48,65],[39,76],[34,81]],
];
const WALKER_INNER_EDGES=[[80,78],[78,84],[78,79],[78,79],[80,50],[78,50],[78,56],[78,43]];
const RUNNER_ARMS=[
  [[80,85],[82,100],[84,113]],[[80,85],[88,98],[95,110]],
  [[80,88],[88,102],[99,111]],[[79,87],[87,97],[92,103]],
  [[47,84],[45,93],[43,100]],[[58,83],[47,94],[39,103]],
  [[57,86],[48,98],[39,109]],[[50,84],[43,97],[40,109]],
];
export const ACTION_OVERRIDES={
  walker:{attack:{shoulder:.16,elbow:0,lift:.5}},
  runner:{attack:{lean:.04,shoulder:.22,elbow:.1,lift:2,legRadius:7}},
  heavy:{attack:{bothArms:true,shoulder:.35,elbow:.1,lift:3},gather:{bothArms:true,shoulder:.16,elbow:.06}},
  builder:{repair:{shoulder:.24,elbow:.1}},
  medic:{heal:{shoulder:.2,elbow:.08}},
};
export function actionControls(type,clip,direction){
  const override=ACTION_OVERRIDES[type.startsWith('walker-')?'walker':type]?.[clip];
  return {...(clip==='attack'?ATTACK:WORK),...override,...override?.facings?.[direction]};
}

export function actionArmWeight(point,view,direction,type,controls){
  const side=point.x<64?0:1,profile=direction===2||direction===6,backDiagonal=direction===3||direction===5;
  const rifle=['soldier','scout','sniper'].includes(type),walker=type==='walker'||type.startsWith('walker-'),runner=type==='runner';
  const chain=(rifle?RIFLE_ARMS:walker?WALKER_ARMS:runner?RUNNER_ARMS:null)?.[direction];
  if(chain){
    const activeSide=direction<4?1:0;
    const [shoulder,elbow,hand]=chain.map(([x,y])=>({x,y})),radius=rifle?6:runner?7:8;
    const distance=Math.min(segmentDistance(point,shoulder,elbow),segmentDistance(point,elbow,hand));
    const handDistance=Math.hypot(point.x-hand.x,point.y-hand.y),handRadius=rifle?7:runner?10:11;
    let weight=Math.max(clamp((radius+1.5-distance)/1.5),clamp((handRadius+1.5-handDistance)/1.5));
    if(rifle&&point.y>=elbow.y+2)weight*=glovePixel(view,point);
    if(walker){
      const [y,x]=WALKER_INNER_EDGES[direction];
      if(point.y>=y&&(activeSide===1?point.x<=x:point.x>=x))weight=0;
    }
    // Rifle gloves can cover the hip; bare zombie hands use full thigh protection.
    for(const leg of view.legs){
      if(point.y<(rifle?leg.knee.y-7:leg.hip.y))continue;
      const legDistance=Math.min(segmentDistance(point,leg.hip,leg.knee),segmentDistance(point,leg.knee,leg.ankle));
      if(legDistance<controls.legRadius)weight=0;
    }
    return {side:activeSide,weight,shoulder,elbow,hand};
  }
  if((profile||backDiagonal)&&side!==(direction<4?1:0))return {side,weight:0};
  const top=59,bottom=94;
  if(point.y<=top||point.y>=bottom)return {side,weight:0};
  const inner=profile?7:backDiagonal?12:13;
  let weight=clamp((Math.abs(point.x-64)-inner)/5)*clamp((point.y-top)/7)*clamp((bottom-point.y)/4);
  // Knees and thighs retain anatomical ownership even where a hand hangs beside them.
  for(const leg of view.legs){
    const distance=Math.min(segmentDistance(point,leg.hip,leg.knee),segmentDistance(point,leg.knee,leg.ankle));
    const belowHip=clamp((point.y-leg.hip.y+2)/4);
    weight*=1-belowHip*(1-clamp((distance-controls.legRadius)/3));
  }
  return {side,weight};
}

export function actionArmPose(type,direction,clip,side,reach,fx,controls=actionControls(type,clip,direction)){
  const active=controls.bothArms||side===(direction<4?1:0);
  if(!active)return {shoulder:0,elbow:0,lift:0};
  return {shoulder:-fx*reach*controls.shoulder,elbow:-fx*reach*controls.elbow,lift:reach*controls.lift};
}

export function createActionDeformer(type,view,direction,clip,pose){
  const controls=actionControls(type,clip,direction),root={x:64,y:view.legs[0].hip.y};
  function body(point){
    const upper=clamp((root.y-point.y)/14),rotated=rotate(point,root,pose.fx*controls.lean*pose.reach);
    rotated.y+=(clip==='attack'?-.6:.8)*pose.reach;
    return blend(point,rotated,upper);
  }
  return point=>{
    const base=body(point),arm=actionArmWeight(point,view,direction,type,controls);
    if(!arm.weight)return base;
    const profile=direction===2||direction===6,runner=type==='runner';
    const shoulder=arm.shoulder??{x:64+(arm.side?1:-1)*(profile?10:16),y:runner?80:63};
    const elbow=arm.elbow??{x:64+(arm.side?1:-1)*(profile?13:20),y:runner?96:77};
    const motion=actionArmPose(type,direction,clip,arm.side,pose.reach,pose.fx,controls);
    let hand=rotate(point,shoulder,motion.shoulder),movingElbow=rotate(elbow,shoulder,motion.shoulder);
    const forearm=clamp((point.y-elbow.y+2)/4);
    hand=rotate(hand,movingElbow,motion.elbow*forearm);hand.y-=motion.lift*forearm;
    const movedShoulder=body(shoulder);
    hand.x+=movedShoulder.x-shoulder.x;hand.y+=movedShoulder.y-shoulder.y;
    return blend(base,hand,arm.weight);
  };
}
