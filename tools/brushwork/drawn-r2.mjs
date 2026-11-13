import {source,canvas} from './rig.mjs';
import {measureHeadRoot,rootMotion} from './alignment.mjs';
import {paletteReference,lockPalette} from './palette.mjs';
const ROOT='../../assets/brushwork/source/drawn-r2/',DIRECTIONS=['SE','E','NE','N'],WIDTH=256,HEIGHT=320,BODY=240,SCALE=21.28/BODY;
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
async function cleanSource(url){
  const im=new Image();im.src=url;await im.decode();const c=canvas(im.width,im.height),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);
  const d=g.getImageData(0,0,c.width,c.height);let fringe=0;
  // Discard generated translucent studio matte; only the illustrated silhouettes are exported.
  for(let i=3;i<d.data.length;i+=4)if(d.data[i]<224){if(d.data[i])fringe++;d.data[i]=0;}
  g.putImageData(d,0,0);const loaded=await source(c.toDataURL(),6,2);loaded.metadata.url=url;loaded.metadata.matteCutoff=224;loaded.metadata.mattePixels=fringe;
  loaded.cells.forEach((f,n)=>{if(f.x===0||f.y===0||f.x+f.w===c.width||f.y+f.h===c.height)throw new Error('Source silhouette touches sheet border: '+url+'/'+n);});
  return loaded;
}
export async function buildDrawnR2(){
  const built={},actors={};
  for(const id of ['soldier','walker']){
    const atlas=canvas(WIDTH*12,HEIGHT*4),raw=canvas(atlas.width,atlas.height),g=atlas.getContext('2d'),r=raw.getContext('2d'),probe=canvas(WIDTH,HEIGHT),p=probe.getContext('2d',{willReadFrequently:true}),directions={};let palette=null;
    for(const[row,direction]of DIRECTIONS.entries()){
      const loaded=await cleanSource(ROOT+id+'-'+direction+'.png'),scale=BODY/median(loaded.cells.map(f=>f.h)),frames=[];let target=null;
      for(const[n,f]of loaded.cells.entries()){
        const sourceCenter=(f.col+.5)*loaded.sheet.width/6,dx=WIDTH/2+(f.x-sourceCenter)*scale,dy=300+(f.y-f.bottom)*scale;
        const paint=(x,y)=>{p.clearRect(0,0,WIDTH,HEIGHT);p.imageSmoothingQuality='high';p.drawImage(loaded.sheet,f.x,f.y,f.w,f.h,x,y,f.w*scale,f.h*scale);};
        paint(dx,dy);const before=measureHeadRoot(p.getImageData(0,0,WIDTH,HEIGHT).data,WIDTH,HEIGHT,BODY);target??={x:before.x,y:60};
        const correction={x:target.x-before.x,y:target.y-before.y};let after;
        for(let pass=0;pass<3;pass++){
          paint(dx+correction.x,dy+correction.y);after=measureHeadRoot(p.getImageData(0,0,WIDTH,HEIGHT).data,WIDTH,HEIGHT,BODY);
          if(Math.hypot(target.x-after.x,target.y-after.y)<=.5)break;
          if(pass===2)throw new Error('Registration did not converge: '+id+'/'+direction+'/'+n);
          correction.x+=target.x-after.x;correction.y+=target.y-after.y;
        }
        if(Math.hypot(correction.x,correction.y)>40)throw new Error('Excessive registration: '+id+'/'+direction+'/'+n+' '+JSON.stringify({correction,before,target,rect:f,scale}));
        const pixels=p.getImageData(0,0,WIDTH,HEIGHT),x=n*WIDTH,y=row*HEIGHT;
        if(!palette)palette=paletteReference(pixels.data,id==='soldier'?'blue':'grey');
        r.putImageData(pixels,x,y);const color=lockPalette(pixels.data,palette);g.putImageData(pixels,x,y);
        frames.push({x,y,width:WIDTH,height:HEIGHT,source:{image:id+'-'+direction+'.png',rect:f,scale},alignment:{before,after,correction},color});
      }
      directions[direction]={frames,alignment:{target,before:rootMotion(frames.map(f=>f.alignment.before),SCALE),after:rootMotion(frames.map(f=>f.alignment.after),SCALE)},source:loaded.metadata};
    }
    const metadata={image:id+'.png',ungradedImage:id+'-ungraded.png',cell:{width:WIDTH,height:HEIGHT},footAnchor:{x:128,y:300},bodyHeight:BODY,renderScale:SCALE,fps:id==='soldier'?16:12,loop:true,directions,
      palette,production:{method:'twelve reference-guided paintings per facing; stable head registration; shared material palette',deformation:false,crossfade:false,mirrored:false,tool:'built-in image_gen',model:'not exposed'}};
    built[id]={canvas:atlas,metadata};built[id+'-ungraded']={canvas:raw};actors[id]=metadata;
  }
  return {built,manifest:{version:2,scope:'four-facing walk-only review, not a complete gameplay replacement',imageSmoothing:false,directions:DIRECTIONS,actors,
    limitations:['Only SE, E, NE and N walks are supplied; remaining four facings and other actions await review.','Source detail and leg timing still need aesthetic review; twelve unique frames alone do not prove a smooth gait.','Rear-quarter soldier carries its weapon higher than front views.']}};
}
