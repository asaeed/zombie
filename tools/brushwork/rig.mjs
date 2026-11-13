import {bind, DIRECTIONS} from '../sculpted-pixel/rig.mjs';
export {DIRECTIONS};
export const canvas=(w=256,h=256)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const point=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const rotate=(p,o,a)=>({x:o.x+(p.x-o.x)*Math.cos(a)-(p.y-o.y)*Math.sin(a),y:o.y+(p.x-o.x)*Math.sin(a)+(p.y-o.y)*Math.cos(a)});
const FORWARD=[[0,.55],[.8,.35],[1,0],[.8,-.35],[0,-.55],[-.8,-.35],[-1,0],[-.8,.35]];

export async function source(url,columns,rows){
  const image=new Image();image.src=url;await image.decode();
  const sheet=canvas(image.width,image.height),g=sheet.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
  const rgba=g.getImageData(0,0,sheet.width,sheet.height),d=rgba.data;
  let cleared=0;
  // Generated alpha sometimes contains very faint colored matte noise in the gutters.
  for(let i=3;i<d.length;i+=4)if(d[i]<96){if(d[i])cleared++;d[i]=0;}
  g.putImageData(rgba,0,0);
  const labels=new Int32Array(sheet.width*sheet.height),components=[],queue=new Int32Array(labels.length);
  for(let start=0;start<labels.length;start++){
    if(labels[start]||d[start*4+3]<128)continue;
    const id=components.length+1;let read=0,write=1;queue[0]=start;labels[start]=id;
    const c={id,left:sheet.width,top:sheet.height,right:0,bottom:0,mass:0};
    while(read<write){
      const at=queue[read++],x=at%sheet.width,y=Math.floor(at/sheet.width);c.mass++;
      c.left=Math.min(c.left,x);c.right=Math.max(c.right,x);c.top=Math.min(c.top,y);c.bottom=Math.max(c.bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy,n=ny*sheet.width+nx;
        if(nx<0||ny<0||nx>=sheet.width||ny>=sheet.height||labels[n]||d[n*4+3]<128)continue;
        labels[n]=id;queue[write++]=n;
      }
    }
    components.push(c);
  }
  const figures=components.sort((a,b)=>b.mass-a.mass).slice(0,columns*rows);
  if(figures.length!==columns*rows||figures.at(-1).mass<200)throw new Error(`Incomplete silhouettes: ${url}`);
  figures.sort((a,b)=>(a.top+a.bottom)-(b.top+b.bottom));
  const ordered=[];
  for(let row=0;row<rows;row++)ordered.push(...figures.slice(row*columns,(row+1)*columns).sort((a,b)=>a.left-b.left));
  const keep=new Set(figures.map(c=>c.id));
  for(const c of components){
    if(keep.has(c.id)||c.mass<8)continue;
    const nearest=figures.find(f=>c.left>=f.left-6&&c.right<=f.right+6&&c.top>=f.top-6&&c.bottom<=f.bottom+6);
    if(nearest)keep.add(c.id);
  }
  for(let i=0;i<labels.length;i++)if(!keep.has(labels[i]))d[i*4+3]=0;
  g.putImageData(rgba,0,0);
  const cells=[];
  for(const[index,c]of ordered.entries()){
    const {left,top,right,bottom}=c,row=Math.floor(index/columns),col=index%columns;
    let bodyTop=top;
    for(let y=top;y<=bottom;y++){
      let n=0;for(let x=left;x<=right;x++)if(d[(y*sheet.width+x)*4+3]>=128)n++;
      if(n>=(right-left+1)*.24){bodyTop=y;break;}
    }
    let feet=0,footX=0;
    for(let y=Math.floor(bottom-(bottom-bodyTop)*.07);y<=bottom;y++)for(let x=left;x<=right;x++)if(d[(y*sheet.width+x)*4+3]>=128){feet++;footX+=x;}
    cells.push({x:left,y:top,w:right-left+1,h:bottom-top+1,bodyTop,bottom,footX:footX/feet,row,col});
  }
  return {sheet,cells,metadata:{url,width:sheet.width,height:sheet.height,columns,rows,alphaThreshold:96,cleared,extraction:'connected silhouettes grouped by row, not assumed equal cells'}};
}
export function view(source,rect,{bodyHeight=76,maxWidth=104,scale=null,joints={hip:83,knee:98,ankle:111}}={}){
  const factor=scale??Math.min(bodyHeight/(rect.bottom-rect.bodyTop+1),maxWidth/rect.w);
  const texture=canvas(320,256),g=texture.getContext('2d');g.imageSmoothingQuality='high';
  g.drawImage(source.sheet,rect.x,rect.y,rect.w,rect.h,2*(80+(rect.x-rect.footX)*factor),2*(116+(rect.y-rect.bottom)*factor),2*rect.w*factor,2*rect.h*factor);
  const body=canvas(),b=body.getContext('2d');b.drawImage(texture,32,0,256,256,0,0,256,256);
  const bound=bind({texture:body,rect,scale:factor},joints),pixels=g.getImageData(0,0,320,256).data,mesh=[];
  // Keep source padding before warping as well as in the final atlas cell.
  for(let y=0;y<128;y+=4)for(let x=-16;x<144;x+=4){
    let occupied=false;
    for(let yy=y*2;yy<(y+4)*2&&!occupied;yy++)for(let xx=(x+16)*2;xx<(x+20)*2;xx++)if(pixels[(yy*320+xx)*4+3]>24){occupied=true;break;}
    if(occupied)mesh.push([{x,y},{x:x+4,y},{x,y:y+4}],[{x:x+4,y:y+4},{x,y:y+4},{x:x+4,y}]);
  }
  return {...bound,texture,mesh};
}
function triangle(ctx,texture,src,dst){
  const [a,b,c]=src,[u,v,w]=dst,den=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);
  const xx=(u.x*(b.y-c.y)+v.x*(c.y-a.y)+w.x*(a.y-b.y))/den;
  const xy=(u.x*(c.x-b.x)+v.x*(a.x-c.x)+w.x*(b.x-a.x))/den;
  const yx=(u.y*(b.y-c.y)+v.y*(c.y-a.y)+w.y*(a.y-b.y))/den;
  const yy=(u.y*(c.x-b.x)+v.y*(a.x-c.x)+w.y*(b.x-a.x))/den;
  ctx.save();ctx.beginPath();
  const center={x:(u.x+v.x+w.x)/3,y:(u.y+v.y+w.y)/3};
  dst.forEach((p,i)=>{const f=.12/(Math.hypot(p.x-center.x,p.y-center.y)||1),x=p.x+(p.x-center.x)*f,y=p.y+(p.y-center.y)*f;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
  ctx.closePath();ctx.clip();ctx.transform(xx,yx,xy,yy,u.x-xx*a.x-xy*a.y,u.y-yx*a.x-yy*a.y);ctx.drawImage(texture,-16,0,160,128);ctx.restore();
}
function warp(ctx,v,deform){for(const t of v.mesh)triangle(ctx,v.texture,t,t.map(deform));}
function bone(p,a,b,ta,tb){const q=rotate(p,a,Math.atan2(tb.y-ta.y,tb.x-ta.x)-Math.atan2(b.y-a.y,b.x-a.x));return {x:q.x+ta.x-a.x,y:q.y+ta.y-a.y};}
function legWarp(p,v,targets){
  const positions=v.legs.map((leg,i)=>{
    const t=targets[i],thigh=bone(p,leg.hip,leg.knee,t.hip,t.knee),shin=bone(p,leg.knee,leg.ankle,t.knee,t.ankle);
    const boot={x:p.x+t.ankle.x-leg.ankle.x,y:p.y+t.ankle.y-leg.ankle.y};
    return point(point(thigh,shin,clamp((p.y-leg.knee.y+2)/4)),boot,clamp((p.y-leg.ankle.y+2)/4));
  });
  return point(p,point(positions[0],positions[1],clamp((p.x-62)/4)),clamp((p.y-v.legs[0].hip.y+2)/7));
}
function paintedWalk(ctx,views,phase){
  // Warp between painted contact/passing drawings, not between whole-sprite offsets.
  const cycle=[views[1],views[0],views[2],views[0]],at=phase*4,index=Math.floor(at)%4,t=at%1,a=cycle[index],b=cycle[(index+1)%4];
  const targets=a.legs.map((l,i)=>Object.fromEntries(['hip','knee','ankle'].map(key=>[key,point(l[key],b.legs[i][key],t)])));
  targets.forEach((leg,i)=>{
    const lift=Math.max(0,Math.sin(phase*Math.PI*2+i*Math.PI));
    leg.knee.y-=lift*1.2;leg.ankle.y-=lift*2.5;
  });
  const v=t<.5?a:b;warp(ctx,v,p=>legWarp(p,v,targets));
}
function walkingTargets(v,direction,phase,type){
  const [fx,fy]=FORWARD[direction],angle=phase*Math.PI*2,runner=type==='runner',amp=runner?5.5:type==='boss'||type==='brute'?3.5:5;
  return v.legs.map((leg,i)=>{
    const wave=Math.sin(angle+i*Math.PI),lift=Math.max(0,Math.cos(angle+i*Math.PI));
    return {hip:{x:leg.hip.x,y:leg.hip.y+.3*Math.cos(angle*2)},
      knee:{x:leg.knee.x+fx*wave*amp*.45,y:leg.knee.y+fy*wave*amp*.35-lift*(runner?2:1.4)},
      ankle:{x:leg.ankle.x+fx*wave*amp,y:leg.ankle.y+fy*wave*amp-lift*(runner?3:2.5)}};
  });
}
export function protectedAction(p,v,direction,reach,kind){
  const hip=v.legs[0].hip.y;
  if(p.y>=hip-1)return p;
  const [fx,fy]=FORWARD[direction],upper=clamp((hip-1-p.y)/15),lean=(kind==='attack'?.035:.025)*reach;
  let q=point(p,rotate(p,{x:64,y:hip},fx*lean),upper);
  const shoulder=hip-22,elbow=hip-12;
  const side=direction<4?1:-1,outer=clamp((side*(p.x-64)-9)/7),band=clamp((p.y-shoulder)/5)*clamp((hip-1-p.y)/3);
  const weight=outer*band;
  if(weight){const rotated=rotate(q,{x:64+side*11,y:shoulder},-fx*reach*.13);rotated.y-=reach*clamp((p.y-elbow)/8)*1.2;q=point(q,rotated,weight);}
  q.y+=(kind==='attack'?-.3:.35)*reach*upper;return q;
}
export function drawPose(ctx,type,views,work,direction,clip,frame,count,strike=null){
  const phase=frame/count,angle=phase*Math.PI*2,neutral=views[0];
  if(clip==='walk'&&views.length>=3){paintedWalk(ctx,views,phase);return;}
  const [fx,fy]=FORWARD[direction];
  if(clip==='walk'){
    const targets=walkingTargets(neutral,direction,phase,type);
    warp(ctx,neutral,p=>{const q=legWarp(p,neutral,targets);if(p.y<neutral.legs[0].hip.y-4){q.y+=.25*Math.cos(angle*2);q.x+=fx*.35*Math.sin(angle);}return q;});return;
  }
  if(clip==='idle'){warp(ctx,neutral,p=>({x:p.x,y:p.y+clamp((neutral.legs[0].hip.y-p.y)/35)*Math.sin(angle)*.3}));return;}
  if(clip==='shoot'){
    const pose=strike??views[3]??neutral,recoil=Math.sin(Math.min(1,frame/(count-1))*Math.PI)**4;
    warp(ctx,pose,p=>{const upper=clamp((pose.legs[0].hip.y-p.y)/15);return {x:p.x-fx*.9*recoil*upper,y:p.y-fy*.5*recoil*upper};});return;
  }
  const peak=strike??views[3];
  const pose=clip==='attack'?(peak&&frame>1&&frame<count-2?peak:neutral):work??neutral;
  const reach=clip==='attack'?Math.sin(frame/(count-1)*Math.PI)**2:.5-.5*Math.cos(angle);
  warp(ctx,pose,p=>protectedAction(p,pose,direction,reach,clip));
}
