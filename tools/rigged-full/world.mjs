import {canvas,source} from '../brushwork/rig.mjs';

export async function world(original){
 const loaded=await source('../../assets/brushwork/source/props.png',3,2),built={};
 for(const[index,id]of ['car','cabin','bin','pine','bush','rock'].entries()){
  const old=original.objects[id],r=loaded.cells[index],size=old.displaySize??old;
  const factor=(size.width-8)/r.w,pad=Math.round(4/factor),width=Math.round(size.width/factor),height=Math.round(size.height/factor);
  const out=canvas(width,height);out.getContext('2d').drawImage(loaded.sheet,r.x,r.y,r.w,r.h,pad,pad,r.w,r.h);
  const anchorScaleX=size.width/old.width,anchorScaleY=size.height/old.height;
  built[id]={canvas:out,metadata:{...old,image:'world/'+id+'.png',width,height,
   displaySize:{width:size.width,height:size.height},
   footAnchor:{x:old.footAnchor.x*anchorScaleX*width/size.width,y:old.footAnchor.y*anchorScaleY*height/size.height},
   production:{source:loaded.metadata,rect:r,method:'native source crop, no intermediate downsample',pixelsPerCSSPixel:width/size.width}}};
 }
 const scale=4,w=64*scale,h=32*scale,out=canvas(w*16,h*3),g=out.getContext('2d'),frames=[];
 const palette=original.terrain.palette;
 for(const[row,type]of ['grass','dirt','water'].entries())for(let variant=0;variant<16;variant++){
  const x=variant*w,y=row*h;g.save();g.translate(x,y);g.beginPath();g.moveTo(w/2,0);g.lineTo(w,h/2);g.lineTo(w/2,h);g.lineTo(0,h/2);g.closePath();g.clip();
  g.fillStyle=palette[type][0];g.fillRect(0,0,w,h);
  if(variant%5===0){g.fillStyle=palette[type][1];g.fillRect(39*scale,8*scale,w,16*scale);}
  g.restore();frames.push({type,variant,x,y,width:w,height:h});
 }
 built.terrain={canvas:out,metadata:{...original.terrain,image:'world/terrain.png',resolutionScale:scale,frames,
  production:{method:'four-times native-density quiet two-tone terrain, antialiased diamond silhouette; no grain or dithering'}}};
 return built;
}
