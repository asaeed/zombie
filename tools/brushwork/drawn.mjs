import {source,canvas} from './rig.mjs';
import {measureHeadRoot,rootMotion} from './alignment.mjs';
const ROOT='../../assets/brushwork/source/drawn-pilot/';

export async function buildDrawn(){
  const config=await (await fetch(ROOT+'frames.json')).json(),loaded=new Map(),built={},actors={};
  for(const[id,def]of Object.entries(config.actors)){
    const {width,height}=config.cell,out=canvas(width*def.sources.length,height),g=out.getContext('2d'),frames=[],probe=canvas(width,height),p=probe.getContext('2d',{willReadFrequently:true});
    g.imageSmoothingQuality='high';
    p.imageSmoothingQuality='high';let target=null;
    for(const[n,f]of def.sources.entries()){
      if(!loaded.has(f.image))loaded.set(f.image,await source(ROOT+f.image,f.columns,f.rows));
      const image=loaded.get(f.image),rect=image.cells[f.cell],dx=def.targetHip.x+(rect.x-f.hip.x)*f.scale,dy=def.targetHip.y+(rect.y-f.hip.y)*f.scale;
      const paint=(ctx,x,y)=>ctx.drawImage(image.sheet,rect.x,rect.y,rect.w,rect.h,x,y,rect.w*f.scale,rect.h*f.scale);
      p.clearRect(0,0,width,height);paint(p,dx,dy);
      const before=measureHeadRoot(p.getImageData(0,0,width,height).data,width,height,config.bodyHeight);
      target??={x:before.x,y:before.y};const correction={x:target.x-before.x,y:target.y-before.y};let after=before;
      for(let pass=0;pass<3;pass++){
        p.clearRect(0,0,width,height);paint(p,dx+correction.x,dy+correction.y);
        after=measureHeadRoot(p.getImageData(0,0,width,height).data,width,height,config.bodyHeight);
        if(Math.hypot(target.x-after.x,target.y-after.y)<=.5)break;
        if(pass===2)throw new Error('Frame registration did not converge: '+id+'/'+n);
        correction.x+=target.x-after.x;correction.y+=target.y-after.y;
      }
      if(Math.hypot(correction.x,correction.y)>32)throw new Error('Excessive frame registration: '+id+'/'+n);
      // Render once from the original source; the measurement canvas never feeds the atlas.
      paint(g,n*width+dx+correction.x,dy+correction.y);
      frames.push({x:n*width,y:0,width,height,phase:f.phase,source:{...f,rect},alignment:{before,after,correction}});
    }
    const metadata={image:id+'.png',cell:config.cell,footAnchor:config.footAnchor,bodyHeight:config.bodyHeight,renderScale:def.renderScale,
      direction:config.direction,fps:def.fps,loop:true,frames,alignment:{method:'stable head-root registration; translation only',referenceFrame:0,target,
        before:rootMotion(frames.map(f=>f.alignment.before),def.renderScale),after:rootMotion(frames.map(f=>f.alignment.after),def.renderScale)},
      production:{method:'separately generated poses; common source scale and registered stable upper-body anchor',deformation:false,crossfade:false,tool:'built-in image_gen',model:'not exposed'}};
    built[id]={canvas:out,metadata};actors[id]=metadata;
  }
  return {built,manifest:{version:1,scope:'SE walk-only experiment; not a complete runtime art pack',imageSmoothing:false,actors,
    limitations:['Remaining facings and actions are not generated.','Drawn poses preferred by user, but head shape, paint and equipment details still vary; aligned playback awaits review.','Sheet second halves repeated leading-leg poses and were replaced by targeted single-frame edits.']}};
}
