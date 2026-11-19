import {canvas,source} from '../brushwork/rig.mjs';
import {motion,rigidTransform} from './motion.mjs';
import {anatomy} from './anatomy.mjs';
export const WIDTH=384,HEIGHT=352,ANCHOR={x:192,y:320};
const transform=(g,image,m)=>{g.save();g.transform(m.a,m.b,m.c,m.d,m.e,m.f);g.drawImage(image,0,0);g.restore();};
function boneTransform(a,b,c,d,projected){
  const m=rigidTransform(a,b,c,d);if(!projected)return m;
  const length=Math.hypot(b.x-a.x,b.y-a.y),u=(b.x-a.x)/length,v=(b.y-a.y)/length;
  const k=Math.hypot(d.x-c.x,d.y-c.y)/length-1;
  const xx=1+k*u*u,xy=k*u*v,yy=1+k*v*v;
  const out={a:m.a*xx+m.c*xy,b:m.b*xx+m.d*xy,c:m.a*xy+m.c*yy,d:m.b*xy+m.d*yy};
  out.e=c.x-out.a*a.x-out.c*a.y;out.f=c.y-out.b*a.x-out.d*a.y;return out;
}
function band(sheet,r,y,fallback){const data=sheet.getContext('2d',{willReadFrequently:true}).getImageData(r.x,Math.round(y-3),r.w,7).data;let sum=0,count=0;for(let i=3;i<data.length;i+=4)if(data[i]>=128){sum+=((i-3)/4)%r.w;count++;}return count?r.x+sum/count:r.x+r.w*fallback;}
function slice(image,y0,y1){const c=canvas(WIDTH,HEIGHT),g=c.getContext('2d');g.save();g.beginPath();g.rect(0,y0,WIDTH,y1-y0);g.clip();g.drawImage(image,0,0);g.restore();return c;}
function paint(loaded,r,at,raw,scale){const c=canvas(WIDTH,HEIGHT),g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(loaded.sheet,r.x,r.y,r.w,r.h,at.x+(r.x-raw.x)*scale,at.y+(r.y-raw.y)*scale,r.w*scale,r.h*scale);return c;}
export async function loadComponents(id,columns=5,rows=5){
  const url='../../assets/brushwork-full/source/'+id+'.png',image=new Image();image.src=url;await image.decode();
  const c=canvas(image.width,image.height),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height);
  // These generated sources have a translucent studio matte; keep the originals intact.
  for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]<224)pixels.data[i]=0;g.putImageData(pixels,0,0);
  const loaded=await source(c.toDataURL(),columns,rows);loaded.metadata.url=url;loaded.metadata.matteCutoff=224;return loaded;
}
export function assemble(loaded,row,def,override=null,frontLegs=null,upperPoses=null){
  const profile=anatomy(def,row);
  const [baseBody,...limbs]=loaded.cells.slice(row*5,row*5+5),body=override?.body??baseBody,bodySource=override?.loaded??loaded;
  const hipFraction=def.variant==='dress'?.69:profile.hip;
  const hipRawY=body.y+body.h*hipFraction,scale=(def.variant==='dress'?174:profile.torso)/body.h,headX=band(bodySource.sheet,body,body.y+body.h*.06,.5);
  const convert=p=>({x:192+(p.x-headX)*scale,y:80+(p.y-body.y)*scale}),torso=paint(bodySource,body,{x:192,y:80},{x:headX,y:body.y},scale);
  const binding={legs:[],arms:[]},parts={torso,legs:[],arms:[]};
  for(let i=0;i<2;i++){
    const legLoaded=frontLegs?.loaded??loaded,r=frontLegs?.cells[i]??limbs[i+2],hip=convert({x:body.x+body.w*profile.hips[i],y:hipRawY});
    const kneeFraction=frontLegs?(def.id==='runner'?.37:.44):profile.knee,ankleFraction=frontLegs?.84:profile.ankle;
    const authored=frontLegs?.joints?.[i],joint=(key,fraction)=>authored?
      {x:r.x+r.w*authored[key][0],y:r.y+r.h*authored[key][1]}:
      {x:band(legLoaded.sheet,r,r.y+r.h*fraction,.5),y:r.y+r.h*fraction};
    const rawHip=joint('hip',.08),rawKnee=joint('knee',kneeFraction),rawAnkle=joint('ankle',ankleFraction);
    const legScale=(320-hip.y)/(r.bottom-rawHip.y),point=p=>({x:hip.x+(p.x-rawHip.x)*legScale,y:hip.y+(p.y-rawHip.y)*legScale}),knee=point(rawKnee),ankle=point(rawAnkle),art=paint(legLoaded,r,hip,rawHip,legScale);
    binding.legs.push({hip,knee,ankle,bend:-1});parts.legs.push({thigh:slice(art,0,knee.y+7),shin:slice(art,knee.y-7,ankle.y+6),boot:slice(art,ankle.y-6,HEIGHT)});
    const a=limbs[i],shoulder=convert({x:body.x+body.w*profile.shoulders[i],y:body.y+body.h*profile.shoulderY});
    const rawShoulder={x:band(loaded.sheet,a,a.y+a.h*.1,.5),y:a.y+a.h*.1},handFraction=!i?(profile.nearHand??(def.gun?.64:.87)):.87,rawHandY=a.y+a.h*handFraction;
    const armScale=(def.group==='zombie'?82:74)/(rawHandY-rawShoulder.y),rawElbow={x:band(loaded.sheet,a,a.y+a.h*.45,.5),y:a.y+a.h*.45},elbow={x:shoulder.x+(rawElbow.x-rawShoulder.x)*armScale,y:shoulder.y+(rawElbow.y-rawShoulder.y)*armScale};
    const armArt=paint(loaded,a,shoulder,rawShoulder,armScale);binding.arms.push({shoulder,elbow});parts.arms.push({whole:armArt,upper:slice(armArt,0,elbow.y+9),lower:slice(armArt,elbow.y-9,HEIGHT)});
  }
  const upper={},upperBindings={};
  for(const [action,index]of Object.entries(upperPoses?.indices??{})){
    const r=upperPoses.loaded.cells[index],landmark=upperPoses.registrations?.[action];
    const headTop=r.y+r.h*(landmark?.headTop??0),head=landmark?
      r.x+r.w*landmark.headX:band(upperPoses.loaded.sheet,r,r.y+r.h*.06,.5);
    const scale=profile.torso/(r.bottom-headTop+1);
    upper[action]=paint(upperPoses.loaded,r,{x:192,y:80},{x:head,y:headTop},scale);
    upperBindings[action]={source:upperPoses.loaded.metadata.url,rect:r,headTop,headX:head,scale,anchor:{x:192,y:80}};
  }
  return {parts,binding,upper,upperBindings,sourceBody:body,bodySource:bodySource.metadata.url,anatomy:profile};
}
function arm(g,art,bind,pose,rigid=false){
  g.save();g.translate(pose.shoulder.x,pose.shoulder.y);g.rotate(pose.rotation);g.translate(-bind.shoulder.x,-bind.shoulder.y);
  if(rigid)g.drawImage(art.whole,0,0);
  else {g.drawImage(art.upper,0,0);g.translate(bind.elbow.x,bind.elbow.y);g.rotate(pose.elbowRotation);g.translate(-bind.elbow.x,-bind.elbow.y);g.drawImage(art.lower,0,0);}
  g.restore();
}
export function render(g,assembled,direction,phase,def,action){
  const {parts,binding}=assembled,p=motion(binding,direction,phase,def,action);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  for(const i of [1,0]){const from=binding.legs[i],to=p.legs[i],a=parts.legs[i];transform(g,a.thigh,boneTransform(from.hip,from.knee,to.hip,to.knee,to.projected));transform(g,a.shin,boneTransform(from.knee,from.ankle,to.knee,to.ankle,to.projected));const c=Math.cos(to.pitch),s=Math.sin(to.pitch);transform(g,a.boot,{a:c,b:s,c:-s,d:c,e:to.ankle.x-c*from.ankle.x+s*from.ankle.y,f:to.ankle.y-s*from.ankle.x-c*from.ankle.y});}
  const upper=assembled.upper[action==='shoot'?'shoot':['idle','walk'].includes(action)?'ready':action];
  if(upper){
    const peak=action==='shoot'?Math.sin(phase*Math.PI)**4:0;
    const forward={S:[0,.55],SE:[.8,.35],E:[1,0],NE:[.8,-.35],N:[0,-.55]}[direction];
    g.drawImage(upper,-forward[0]*2*peak,p.bob-forward[1]*2*peak);return p;
  }
  const workHand=action==='gather',drawArm=i=>{if(def.variant==='onearm'&&i===1)return;const index=workHand&&i===0?1:i;arm(g,parts.arms[index],binding.arms[index],{...p.arms[i],shoulder:p.arms[i].shoulder},def.gun&&!workHand&&i===0);};
  const frontal=direction==='S'||direction==='N';if(!frontal)drawArm(1);g.drawImage(parts.torso,0,p.bob);if(frontal)drawArm(1);drawArm(0);return p;
}
