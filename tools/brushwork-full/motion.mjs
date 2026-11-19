import {footPath,solveLeg,rigidTransform} from '../brushwork/gait.mjs';
export {rigidTransform};
const FORWARD={S:[0,.55],SE:[.8,.35],E:[1,0],NE:[.8,-.35],N:[0,-.55]};
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
export function motion(binding,direction,phase,def,action){
  const [fx,fy]=FORWARD[direction],walking=action==='walk',front=direction==='S'||direction==='N';
  const bob=walking?def.bob*Math.cos(phase*Math.PI*4):0;
  const stride=front?9:def.stride,lift=front?2.5:def.lift;
  const legs=binding.legs.map((leg,i)=>{
    if(!walking)return {hip:{...leg.hip},knee:{...leg.knee},ankle:{...leg.ankle},pitch:0,planted:true};
    const path=footPath(phase+i*.5,stride,lift),rest=leg.ankle;
    const target={x:rest.x+fx*path.travel,y:rest.y+fy*path.travel-path.lift};
    // A knee bending toward the camera foreshortens vertically; it must not buckle sideways.
    if(front){
      const hip={x:leg.hip.x,y:leg.hip.y+bob},dy=target.y-leg.ankle.y;
      return {hip,knee:{x:leg.knee.x,y:leg.knee.y+bob*.5+dy*.45},ankle:target,pitch:0,planted:path.planted,projected:true};
    }
    return {...solveLeg({x:leg.hip.x,y:leg.hip.y+bob},target,distance(leg.hip,leg.knee),distance(leg.knee,leg.ankle),leg.bend),pitch:path.pitch,planted:path.planted};
  });
  const looping=['gather','repair','heal'].includes(action),peak=looping?.5-.5*Math.cos(phase*Math.PI*2):Math.sin(phase*Math.PI)**2;
  const arms=binding.arms.map((arm,i)=>{
    let shoulder=0,elbow=0;
    if(walking){shoulder=(i?1:-1)*Math.sin(phase*Math.PI*2)*(def.group==='zombie'?.10:.035);if(def.speed===110){shoulder*=2.7;elbow=.12*Math.sin(phase*Math.PI*2+i*Math.PI);}}
    else if(action==='shoot'){shoulder=-fx*.28+(front?.05:fx*.065)*peak;elbow=i?-.28:0;}
    else if(action==='attack'){shoulder=(i?.45:1)*(-fx*(def.group==='zombie'?.40:.55)*peak);elbow=(i?.12:.25)*peak;}
    else if(looping){shoulder=(i?.06:.35)*(-fx*peak);elbow=(i?.02:.22)*peak;}
    else if(action==='idle')shoulder=.012*Math.sin(phase*Math.PI*2+i*Math.PI);
    const relaxed=direction==='N'?(i?-.12:.12):0;
    return {shoulder:{x:arm.shoulder.x,y:arm.shoulder.y+bob},rotation:shoulder+relaxed,elbowRotation:elbow};
  });
  return {legs,arms,bob,working:looping};
}
