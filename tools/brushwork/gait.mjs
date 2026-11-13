export const FACINGS = ['SE', 'E', 'NE', 'N'];
export const FRAME_COUNT = 16;
export const MOTION = {
  soldier: {stride:24,lift:9,bob:1.5,fps:16},
  walker: {stride:18.5,lift:6.5,bob:1.2,fps:13},
};
const FORWARD = {SE: [.8, .35], E: [1, 0], NE: [.8, -.35], N: [0, -.55]};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const length = (a, b) => Math.hypot(b.x-a.x, b.y-a.y);

export function footPath(phase, stride, lift, stance = .6) {
  const p = ((phase % 1) + 1) % 1;
  if (p < stance) return {travel: stride*(1-2*p/stance), lift: 0, pitch: 0, planted: true};
  const t = (p-stance)/(1-stance), tangent = -2*stride*(1-stance)/stance;
  const travel = (2*t*t*t-3*t*t+1)*(-stride) + (t*t*t-2*t*t+t)*tangent
    + (-2*t*t*t+3*t*t)*stride + (t*t*t-t*t)*tangent;
  return {travel, lift: lift*Math.sin(Math.PI*t)**2, pitch: -.06*Math.sin(2*Math.PI*t)*Math.sin(Math.PI*t), planted: false};
}

export function solveLeg(hip, target, upper, lower, bend) {
  const dx=target.x-hip.x, dy=target.y-hip.y, raw=Math.hypot(dx,dy);
  // A soft reach limit avoids the square-root knee snap near full extension.
  const cap=(upper+lower)*.98, z=(cap-raw)/3;
  const soft=cap-3*(Math.max(z,0)+Math.log1p(Math.exp(-Math.abs(z))));
  const d=clamp(soft,Math.abs(upper-lower)+.01,cap), nx=dx/(raw||1), ny=dy/(raw||1);
  const along=(upper*upper-lower*lower+d*d)/(2*d), out=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {hip, knee:{x:hip.x+nx*along-ny*out*bend,y:hip.y+ny*along+nx*out*bend}, ankle:{x:hip.x+nx*d,y:hip.y+ny*d}};
}

export function bodyBob(phase,kind) {
  return MOTION[kind].bob*Math.cos(phase*Math.PI*4);
}

export function walkPose(binding, direction, phase, kind) {
  const [fx,fy]=FORWARD[direction], frontal=direction==='N';
  const {stride:forwardStride,lift:forwardLift}=MOTION[kind];
  const stride=frontal?8.2:forwardStride, lift=frontal?4.4:forwardLift, bob=bodyBob(phase,kind);
  return binding.legs.map((leg,i)=>{
    const path=footPath(phase+i*.5,stride,lift), rest={x:leg.hip.x+(leg.ankle.x-leg.hip.x)*.45,y:leg.ankle.y};
    const target={x:rest.x+fx*path.travel,y:rest.y+fy*path.travel-path.lift};
    const hip={x:leg.hip.x,y:leg.hip.y+bob};
    const chain=solveLeg(hip,target,length(leg.hip,leg.knee),length(leg.knee,leg.ankle),leg.bend??-1);
    return {...chain,pitch:path.pitch,planted:path.planted,requested:target};
  });
}

export function rigidTransform(a,b,ta,tb) {
  const angle=Math.atan2(tb.y-ta.y,tb.x-ta.x)-Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(angle),s=Math.sin(angle);
  return {a:c,b:s,c:-s,d:c,e:ta.x-c*a.x+s*a.y,f:ta.y-s*a.x-c*a.y};
}

