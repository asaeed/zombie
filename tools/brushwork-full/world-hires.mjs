import {canvas,source} from '../brushwork/rig.mjs';

export async function buildings(original){
  const loaded=await source('../../assets/brushwork/source/buildings.png',4,2),built={};
  const ids=['hq','wall','tower','barracks','depot','light','clinic','mechanics'];
  for(const [index,id]of ids.entries()){
    const old=original.objects[id],r=loaded.cells[index];
    const factor=(old.width-8)/r.w,pad=4/factor;
    const width=Math.round(old.width/factor),height=Math.round(old.height/factor);
    const out=canvas(width,height),g=out.getContext('2d');
    // Copy the original painting once, at native pixel density, rather than enlarging the low-res export.
    g.drawImage(loaded.sheet,r.x,r.y,r.w,r.h,Math.round(pad),Math.round(pad),r.w,r.h);
    built[id]={canvas:out,metadata:{...old,image:id+'.png',width,height,
      displaySize:{width:old.width,height:old.height},
      footAnchor:{x:old.footAnchor.x*width/old.width,y:old.footAnchor.y*height/old.height},
      production:{source:loaded.metadata,rect:r,method:'native source crop, no intermediate downsample',
        pixelsPerCSSPixel:width/old.width,previousImage:'../brushwork/'+old.image}}};
  }
  return built;
}
