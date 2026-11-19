import {createActionDeformer} from './action-rig.mjs';
export const DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
export const CELL = { width: 128, height: 128, footX: 64, footY: 116 };
export const CLIPS = {
  sniper: [{ name: 'idle', frames: 6, fps: 6, loop: true }, { name: 'walk', frames: 12, fps: 12, loop: true },
    { name: 'shoot', frames: 8, fps: 16, loop: false }, { name: 'gather', frames: 12, fps: 10, loop: true }],
  walker: [{ name: 'idle', frames: 6, fps: 6, loop: true }, { name: 'walk', frames: 12, fps: 11, loop: true },
    { name: 'attack', frames: 8, fps: 15, loop: false }],
};
const FORWARD = [[0,.55],[.8,.35],[1,0],[.8,-.35],[0,-.55],[-.8,-.35],[-1,0],[-.8,.35]];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const lerpPoint = (a, b, t) => ({x: mix(a.x,b.x,t), y: mix(a.y,b.y,t)});
function rotate(point, pivot, angle) {
  const c=Math.cos(angle),s=Math.sin(angle),x=point.x-pivot.x,y=point.y-pivot.y;
  return {x:pivot.x+x*c-y*s,y:pivot.y+x*s+y*c};
}
function surface(width = 256, height = 256) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
}
function runs(counts, support, mergeGap = 8) {
  const found=[];let start=-1;
  for(let i=0;i<=counts.length;i++){
    if(counts[i]>=support&&start<0)start=i;
    if((counts[i]<support||i===counts.length)&&start>=0){
      const prior=found.at(-1);
      if(prior&&start-prior[1]<=mergeGap)prior[1]=i-1;else found.push([start,i-1]);
      start=-1;
    }
  }
  return found;
}

export async function sourceViews(url, columns = 4, rows = 2, options = {}) {
  const image=new Image();image.src=url;await image.decode();
  const source=surface(image.naturalWidth,image.naturalHeight),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,source.width,source.height),pixels=rgba.data;
  let cleanedPixels=0;
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]<48||(pixels[i]>220&&pixels[i+1]<80&&pixels[i+2]<80)){
      if(pixels[i+3])cleanedPixels++;pixels[i+3]=0;
    }
  }
  ctx.putImageData(rgba,0,0);
  const rowCounts=new Uint32Array(source.height);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]>128)rowCounts[y]++;
  let bands=runs(rowCounts,5,12).filter(([a,b])=>b-a>source.height*.12);
  if(bands.length!==rows)throw new Error(url+': expected '+rows+' separated row bands, found '+bands.length);
  const frames=[];
  for(const [bandTop,bandBottom] of bands){
    const columnsCount=new Uint32Array(source.width);
    for(let x=0;x<source.width;x++)for(let y=bandTop;y<=bandBottom;y++)if(pixels[(y*source.width+x)*4+3]>128)columnsCount[x]++;
    const spans=runs(columnsCount,3,8).filter(([a,b])=>b-a>source.width*.04);
    if(spans.length!==columns)throw new Error(url+': expected '+columns+' separated silhouettes, found '+spans.length);
    for(const [left,right] of spans){
      let top=source.height,bottom=0,footMass=0,footX=0;
      for(let x=left;x<=right;x++)for(let y=bandTop;y<=bandBottom;y++)if(pixels[(y*source.width+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y);}
      // Thin rifle barrels above the helmet must not shrink the character's body.
      let bodyTop=top;
      for(let y=top;y<bottom;y++){
        let occupied=0;for(let x=left;x<=right;x++)if(pixels[(y*source.width+x)*4+3]>128)occupied++;
        if(occupied>=(right-left+1)*.22){bodyTop=y;break;}
      }
      for(let y=Math.floor(bottom-(bottom-bodyTop)*.08);y<=bottom;y++)for(let x=left;x<=right;x++)if(pixels[(y*source.width+x)*4+3]>128){footX+=x;footMass++;}
      const originX=footX/footMass,scale=Math.min((options.bodyHeight??76)/(bottom-bodyTop+1),
        (options.maxWidth??Infinity)/(right-left+1)),texture=surface(),out=texture.getContext('2d');
      out.imageSmoothingEnabled=true;out.imageSmoothingQuality='high';
      out.drawImage(source,left,top,right-left+1,bottom-top+1,
        2*(64+(left-originX)*scale),2*(116+(top-bottom)*scale),2*(right-left+1)*scale,2*(bottom-top+1)*scale);
      frames.push({texture,rect:{x:left,y:top,w:right-left+1,h:bottom-top+1},bodyTop,originX,scale});
    }
  }
  return {frames,source:{url,width:source.width,height:source.height,cleanedPixels}};
}

function bandCenter(pixels, y, side, radius = 2, spread = 22) {
  let sum=0,count=0;
  for(let yy=Math.max(0,Math.floor(y-radius)*2);yy<Math.min(256,Math.ceil(y+radius)*2);yy++){
    for(let xx=Math.max(0,(64-spread)*2);xx<Math.min(256,(64+spread)*2);xx++){
      if((side===0?xx>=128:xx<128)||pixels[(yy*256+xx)*4+3]<128)continue;
      sum+=xx/2;count++;
    }
  }
  return count?sum/count:64+(side?8:-8);
}
export function bind(view, joints = { hip:83, knee:97, ankle:109 }) {
  const pixels=view.texture.getContext('2d',{willReadFrequently:true}).getImageData(0,0,256,256).data;
  const legs=[0,1].map(side=>({
    hip:{x:bandCenter(pixels,joints.hip,side),y:joints.hip},knee:{x:bandCenter(pixels,joints.knee,side),y:joints.knee},
    ankle:{x:bandCenter(pixels,joints.ankle,side,2,36),y:joints.ankle},
  }));
  const makeMesh=step=>{
    const mesh=[];
    for(let y=0;y<128;y+=step)for(let x=0;x<128;x+=step){
      let occupied=false;
      for(let yy=y*2;yy<(y+step)*2&&!occupied;yy++)for(let xx=x*2;xx<(x+step)*2;xx++)if(pixels[(yy*256+xx)*4+3]>24){occupied=true;break;}
      if(occupied)mesh.push([{x,y},{x:x+step,y},{x,y:y+step}],[{x:x+step,y:y+step},{x,y:y+step},{x:x+step,y}]);
    }
    return mesh;
  };
  return {...view,legs,pixels,mesh:makeMesh(4),actionMesh:makeMesh(1)};
}
function ik(hip, ankle, upperLength, lowerLength, sign) {
  const dx=ankle.x-hip.x,dy=ankle.y-hip.y,raw=Math.hypot(dx,dy),distance=clamp(raw,.01,upperLength+lowerLength-.001);
  const nx=dx/(raw||1),ny=dy/(raw||1),projection=(upperLength*upperLength-lowerLength*lowerLength+distance*distance)/(2*distance);
  const offset=Math.sqrt(Math.max(0,upperLength*upperLength-projection*projection));
  return {knee:{x:hip.x+nx*projection-ny*offset*sign,y:hip.y+ny*projection+nx*offset*sign},
    ankle:{x:hip.x+nx*distance,y:hip.y+ny*distance}};
}
function bonePoint(point, a, b, targetA, targetB) {
  const angle=Math.atan2(targetB.y-targetA.y,targetB.x-targetA.x)-Math.atan2(b.y-a.y,b.x-a.x);
  const rotated=rotate(point,a,angle);return {x:rotated.x+targetA.x-a.x,y:rotated.y+targetA.y-a.y};
}

export function poseParameters(type, direction, clip, frame, count) {
  const working=['gather','heal','repair'].includes(clip);
  const angle=frame/count*Math.PI*2,wave=Math.sin(angle),reach=working?.5-.5*Math.cos(angle):
    clip==='attack'?Math.sin(frame/(count-1)*Math.PI)**2:0;
  const recoil=clip==='shoot'?[0,1,.8,.55,.3,.12,.03,0][frame]:0;
  const [fx,fy]=FORWARD[direction];
  return {angle,wave,reach,recoil,fx,fy,bob:clip==='walk'?1.4+Math.cos(angle*2)*.6:working?reach*2:0,
    lean:clip==='walk'?fx*.025:working?fx*.16*reach:clip==='attack'?fx*.18*reach:clip==='shoot'?-fx*.025*recoil:0,
    breathe:clip==='idle'?Math.sin(angle)*.012:0,freeArms:!['sniper','soldier','scout'].includes(type)||working};
}
function armRegion(point, direction, type) {
  if(type==='runner'){
    const side=point.x<64?0:1,profile=direction===2||direction===6;
    const forward=direction<4?1:0;
    if(profile&&side!==forward)return {weight:0,side};
    return {side,weight:clamp((Math.abs(point.x-64)-(profile?10:12))/6)*clamp((point.y-79)/10)};
  }
  if(point.y<59||point.y>95)return {weight:0,side:0};
  const profile=direction===2||direction===6,backDiagonal=direction===3||direction===5;
  const side=point.x<64?0:1;
  if((profile||backDiagonal)&&side!==(direction<4?1:0))return {weight:0,side};
  const inner=profile?7:backDiagonal?12:13;
  const weight=clamp((Math.abs(point.x-64)-inner)/5)*clamp((point.y-59)/7)*clamp((96-point.y)/5);
  return {weight,side};
}
function deformer(type, view, direction, clip, frame, count) {
  const p=poseParameters(type,direction,clip,frame,count),root={x:64,y:view.legs[0].hip.y};
  const bodyPoint=point=>{
    let out=rotate(point,root,p.lean);
    out.y+=p.bob+(root.y-point.y)*p.breathe;
    if(clip==='shoot'){out.x-=p.fx*1.6*p.recoil;out.y-=p.fy*.7*p.recoil;}
    if(clip==='attack'){out.x+=p.fx*4*p.reach;out.y+=p.fy*2*p.reach;}
    return out;
  };
  const legs=view.legs.map((leg,side)=>{
    const phase=p.angle+side*Math.PI,swing=Math.sin(phase),lift=Math.max(0,Math.cos(phase));
    const hip=bodyPoint(leg.hip);
    const target={x:leg.ankle.x+p.fx*swing*(type==='sniper'?6.5:5.5),y:leg.ankle.y+p.fy*swing*4-lift*3.8};
    if(clip!=='walk')return {hip:bodyPoint(leg.hip),knee:bodyPoint(leg.knee),ankle:leg.ankle};
    const bend=Math.abs(p.fx)>.3?-Math.sign(p.fx):(side===0?1:-1);
    const chain=ik(hip,target,Math.hypot(leg.knee.x-leg.hip.x,leg.knee.y-leg.hip.y),Math.hypot(leg.ankle.x-leg.knee.x,leg.ankle.y-leg.knee.y),bend);
    return {hip,knee:chain.knee,ankle:chain.ankle,lift};
  });
  function legPoint(point,side){
    const source=view.legs[side],target=legs[side];
    const thigh=bonePoint(point,source.hip,source.knee,target.hip,target.knee);
    const shin=bonePoint(point,source.knee,source.ankle,target.knee,target.ankle);
    const foot={x:point.x+target.ankle.x-source.ankle.x,y:point.y+target.ankle.y-source.ankle.y};
    let result=lerpPoint(thigh,shin,clamp((point.y-source.knee.y+3)/6));
    result=lerpPoint(result,foot,clamp((point.y-source.ankle.y+3)/6));return result;
  }
  return point=>{
    const body=bodyPoint(point),arm=armRegion(point,direction,type);
    const legWeight=clamp((point.y-root.y+3)/8)*(1-(p.freeArms?arm.weight:0));
    let result=body;
    if(legWeight){
      const left=legPoint(point,0),right=legPoint(point,1);
      result=lerpPoint(body,lerpPoint(left,right,clamp((point.x-62)/4)),legWeight);
    }
    if(p.freeArms&&arm.weight){
      const side=arm.side,profile=direction===2||direction===6;
      const shoulder={x:64+(side?1:-1)*(profile?10:16),y:type==='runner'?80:63},elbow={x:64+(side?1:-1)*(profile?13:20),y:type==='runner'?96:77};
      const swing=clip==='walk'?Math.sin(p.angle+side*Math.PI)*.13:0;
      const frontalReach=Math.abs(p.fx)<.3?(side?1:-1)*p.reach*.4:0;
      const shoulderAngle=swing-p.fx*p.reach*(clip==='attack'?.9:.58)+frontalReach;
      let hand=rotate(point,shoulder,shoulderAngle);
      const movingElbow=rotate(elbow,shoulder,shoulderAngle);
      const elbowY=type==='runner'?96:73;
      const elbowAngle=(clip==='walk'?Math.cos(p.angle+side*Math.PI)*.06:-p.fx*p.reach*.3+frontalReach*.8)*clamp((point.y-elbowY)/6);
      hand=rotate(hand,movingElbow,elbowAngle);
      hand.y+=p.fy*p.reach*8*clamp((point.y-elbowY)/10);
      if(type==='runner'&&clip==='walk')hand.y-=Math.max(0,Math.sin(p.angle+side*Math.PI))*5*clamp((point.y-96)/12);
      result=lerpPoint(result,bodyPoint(hand),arm.weight);
    }
    return result;
  };
}
function texturedTriangle(ctx, texture, source, target) {
  const [a,b,c]=source,[u,v,w]=target;
  const denominator=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);
  const xx=(u.x*(b.y-c.y)+v.x*(c.y-a.y)+w.x*(a.y-b.y))/denominator;
  const xy=(u.x*(c.x-b.x)+v.x*(a.x-c.x)+w.x*(b.x-a.x))/denominator;
  const yx=(u.y*(b.y-c.y)+v.y*(c.y-a.y)+w.y*(a.y-b.y))/denominator;
  const yy=(u.y*(c.x-b.x)+v.y*(a.x-c.x)+w.y*(b.x-a.x))/denominator;
  const tx=u.x-xx*a.x-xy*a.y,ty=u.y-yx*a.x-yy*a.y;
  ctx.save();ctx.beginPath();
  const center={x:(u.x+v.x+w.x)/3,y:(u.y+v.y+w.y)/3};
  for(let i=0;i<3;i++){
    const q=target[i],distance=Math.hypot(q.x-center.x,q.y-center.y),pad=distance? .18/distance:0;
    const x=q.x+(q.x-center.x)*pad,y=q.y+(q.y-center.y)*pad;
    if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
  }
  ctx.closePath();ctx.clip();ctx.transform(xx,yx,xy,yy,tx,ty);ctx.drawImage(texture,0,0,128,128);ctx.restore();
}
const MUZZLES=[{x:64,y:66},{x:110,y:68},{x:121,y:61},{x:94,y:46},{x:62,y:26},{x:24,y:48},{x:18,y:57},{x:25,y:71}];
function flash(ctx,direction,frame,deform,muzzle=MUZZLES[direction]){
  if(frame!==1&&frame!==2)return;
  const point=deform(muzzle),r=frame===1?4.2:2.5;
  ctx.fillStyle='#fff4bb';ctx.beginPath();
  for(let i=0;i<8;i++){const angle=i*Math.PI/4,scale=i%2?.35:1,x=point.x+Math.cos(angle)*r*scale,y=point.y+Math.sin(angle)*r*scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
  ctx.closePath();ctx.fill();
}
export function drawFrame(ctx,type,view,direction,clip,frame,count){
  const action=['attack','gather','heal','repair'].includes(clip);
  const deform=action?createActionDeformer(type,view,direction,clip,poseParameters(type,direction,clip,frame,count))
    :deformer(type,view,direction,clip,frame,count);
  for(const triangle of action?view.actionMesh:view.mesh)texturedTriangle(ctx,view.texture,triangle,triangle.map(deform));
  if(['sniper','soldier','scout'].includes(type)&&clip==='shoot')flash(ctx,direction,frame,deform,view.muzzle);
}

export async function buildCharacter(type) {
  const loaded=await sourceViews('../../assets/sculpted-pixel/source/'+type+'-turnaround.png');
  const views=loaded.frames.map(view=>bind(view)),sources=[loaded.source];
  let gather=views;
  if(type==='sniper'){
    const alternate=await sourceViews('../../assets/sculpted-pixel/source/sniper-gather-turnaround.png');gather=alternate.frames.map(view=>bind(view));sources.push(alternate.source);
    const north=await sourceViews('../../assets/sculpted-pixel/source/sniper-north.png',1,1);views[4]=bind(north.frames[0]);sources.push(north.source);
  }
  const clips=CLIPS[type],canvas=surface(128*12,128*8*clips.length),ctx=canvas.getContext('2d');
  const frameCanvas=surface(),frameCtx=frameCanvas.getContext('2d'),clipData={};
  for(const [ci,clip] of clips.entries()){
    clipData[clip.name]={fps:clip.fps,loop:clip.loop,directions:{}};
    for(let direction=0;direction<8;direction++){
      const frames=[],view=clip.name==='gather'?gather[direction]:views[direction];
      for(let frame=0;frame<clip.frames;frame++){
        frameCtx.setTransform(2,0,0,2,0,0);frameCtx.clearRect(0,0,128,128);drawFrame(frameCtx,type,view,direction,clip.name,frame,clip.frames);
        const x=frame*128,y=(ci*8+direction)*128;ctx.drawImage(frameCanvas,x,y,128,128);
        frames.push({x,y,width:128,height:128});
      }
      clipData[clip.name].directions[DIRECTIONS[direction]]=frames;
    }
  }
  const contact=surface(128*4,128*2),contactCtx=contact.getContext('2d');
  for(let i=0;i<8;i++)contactCtx.drawImage(views[i].texture,(i%4)*128,Math.floor(i/4)*128,128,128);
  return {canvas,contact,metadata:{image:type+'.png',style:'sculpted',cell:{width:128,height:128},
    footAnchor:{x:64,y:116},directions:DIRECTIONS,clips:clipData,
    production:{method:'reference-generated raster masters with a two-dimensional articulated texture rig',sources,
      sourceFrames:loaded.frames.map(view=>({rect:view.rect,bodyTop:view.bodyTop,originX:view.originX,scale:view.scale})),
      joints:views.map(view=>view.legs),generationTool:'built-in image_gen',bodyHeight:76}}};
}
