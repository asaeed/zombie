import { sourceViews, bind, drawFrame, DIRECTIONS } from './rig.mjs';
import { CAST, OBJECTS, clipsFor } from './catalog.mjs';
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const sourceRoot='../../assets/sculpted-pixel/source/';

function muzzleFor(view,direction){
  if(direction===0)return {x:64,y:64};
  const data=view.texture.getContext('2d',{willReadFrequently:true}).getImageData(0,0,256,256).data;
  let best=direction===4?Infinity:direction<4?-Infinity:Infinity,points=[];
  for(let y=15;y<85;y++)for(let x=6;x<122;x++){
    const i=(y*2*256+x*2)*4;
    if(data[i+3]<160||data[i]>105||data[i+1]>115||data[i+2]>140)continue;
    if(direction===4?(x<50||x>77):(direction<4?x<80:x>48))continue;
    const value=direction===4?y:x,better=direction===4||direction>4?value<best:value>best;
    if(better){best=value;points=[{x,y}];}else if(value===best)points.push({x,y});
  }
  return points.length?{x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length}:{x:64,y:62};
}

async function character(type,def){
  const options={bodyHeight:def.bodyHeight??76,maxWidth:def.maxWidth??104};
  const loaded=await sourceViews(sourceRoot+type+'-turnaround.png',4,2,options);
  const views=loaded.frames.map(view=>bind(view,def.joints));
  let gathering=views;
  if(type==='soldier'||type==='scout'){
    const extra=await sourceViews(sourceRoot+type+'-gather-turnaround.png',4,2,options);
    gathering=extra.frames.map(view=>bind(view,def.joints));
    const north=await sourceViews(sourceRoot+type+'-north.png',1,1,options);
    views[4]=bind(north.frames[0],def.joints);
    views.forEach((view,direction)=>{view.muzzle=muzzleFor(view,direction);});
  }
  const paddingX=def.paddingX??0,cellWidth=(128+paddingX*2)*.75;
  const clips=clipsFor(def),sheet=canvas(cellWidth*12,96*8*clips.length),ctx=sheet.getContext('2d');
  const frameCanvas=canvas((128+paddingX*2)*2,256),frameCtx=frameCanvas.getContext('2d'),clipData={};
  for(const[row,clip]of clips.entries()){
    clipData[clip.name]={fps:clip.fps,loop:clip.loop,directions:{}};
    for(let direction=0;direction<8;direction++){
      const frames=[],view=clip.name==='gather'?gathering[direction]:views[direction];
      for(let frame=0;frame<clip.frames;frame++){
        frameCtx.setTransform(1,0,0,1,0,0);frameCtx.clearRect(0,0,frameCanvas.width,frameCanvas.height);
        frameCtx.setTransform(2,0,0,2,paddingX*2,0);
        drawFrame(frameCtx,type,view,direction,clip.name,frame,clip.frames);
        const x=frame*cellWidth,y=(row*8+direction)*96;
        ctx.drawImage(frameCanvas,x,y,cellWidth,96);frames.push({x,y,width:cellWidth,height:96});
      }
      clipData[clip.name].directions[DIRECTIONS[direction]]=frames;
    }
  }
  return {canvas:sheet,metadata:{image:type+'.png',group:def.group,cell:{width:cellWidth,height:96},footAnchor:{x:(64+paddingX)*.75,y:87},
    bodyHeight:(def.bodyHeight??76)*.75,renderScale:def.scale/.75,strike:def.strike??null,work:def.work??null,
    walkStride:type==='runner'?4:def.fps===7?5:type==='scout'?6:4.5,directions:DIRECTIONS,clips:clipData,
    production:{method:'generated directional raster master with articulated texture mesh',source:loaded.source,
      sourceFrames:loaded.frames.map(view=>view.rect),joints:views.map(view=>view.legs)}}};
}
async function object(id,def){
  const image=new Image();image.src=sourceRoot+'world/'+id+'.png';await image.decode();
  const source=canvas(image.naturalWidth,image.naturalHeight),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,source.width,source.height),data=rgba.data;
  let left=source.width,top=source.height,right=0,bottom=0;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const i=(y*source.width+x)*4;
    if(data[i+3]<96)data[i+3]=0;
    if(data[i+3]>160){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
  if(right<=left||bottom<=top)throw new Error('Blank object '+id);
  ctx.putImageData(rgba,0,0);
  let feet=0,footX=0;
  for(let y=Math.floor(bottom-(bottom-top)*.025);y<=bottom;y++)for(let x=left;x<=right;x++)if(data[(y*source.width+x)*4+3]>160){feet++;footX+=x;}
  const scale=Math.min(def.width/(right-left+1),def.height/(bottom-top+1));
  const w=Math.ceil(Math.min(def.width,(right-left+1)*scale)),h=Math.ceil(Math.min(def.height,(bottom-top+1)*scale)),out=canvas(w+8,h+8),g=out.getContext('2d');
  g.imageSmoothingQuality='high';g.drawImage(source,left,top,right-left+1,bottom-top+1,4,4,w,h);
  return {canvas:out,metadata:{image:id+'.png',...def,width:out.width,height:out.height,
    footAnchor:{x:4+(footX/feet-left)*scale,y:h+4},sourceRect:{x:left,y:top,width:right-left+1,height:bottom-top+1}}};
}
export async function buildTerrain(){
  const out=canvas(16*64,3*32),g=out.getContext('2d'),frames=[],baseColors={},palette={
    grass:['#667846','#697b49'],dirt:['#857562','#887865'],water:['#2d6b79','#306e7c'],
  };
  const url=sourceRoot+'world/flat-terrain.png',image=new Image();image.src=url;await image.decode();
  const panelWidth=image.naturalWidth/3;
  for(const[row,type]of['grass','dirt','water'].entries()){
    // Inset the square samples so filtering cannot pick up the adjacent material.
    const left=Math.ceil(row*panelWidth)+1,right=Math.floor((row+1)*panelWidth)-1;
    const side=Math.min(right-left,image.naturalHeight-2),ox=left+(right-left-side)/2,oy=(image.naturalHeight-side)/2;
    // A coarse two-tone mask retains only broad patches, never grain or gradients.
    const material=canvas(8,8),m=material.getContext('2d',{willReadFrequently:true});
    m.imageSmoothingQuality='high';m.drawImage(image,ox,oy,side,side,0,0,8,8);
    const rgba=m.getImageData(0,0,8,8),luminance=[];
    for(let i=0;i<rgba.data.length;i+=4)luminance.push(rgba.data[i]*.2126+rgba.data[i+1]*.7152+rgba.data[i+2]*.0722);
    const threshold=[...luminance].sort((a,b)=>a-b)[Math.floor(luminance.length*.9)];
    const colors=palette[type].map(color=>[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)));
    for(let i=0;i<luminance.length;i++)rgba.data.set([...colors[luminance[i]>threshold?1:0],255],i*4);
    m.putImageData(rgba,0,0);baseColors[type]=palette[type][0];
    for(let variant=0;variant<16;variant++){
      const x=variant*64,y=row*32;
      const patch=canvas(32,32),p=patch.getContext('2d');p.imageSmoothingEnabled=false;
      p.drawImage(material,(variant%4)*2,Math.floor(variant/4)*2,2,2,0,0,32,32);
      g.save();g.beginPath();g.moveTo(x+32,y);g.lineTo(x+64,y+16);g.lineTo(x+32,y+32);g.lineTo(x,y+16);g.closePath();g.clip();
      g.transform(1,.5,-1,.5,x+32,y);g.imageSmoothingEnabled=false;
      g.drawImage(patch,0,0);g.restore();
      frames.push({type,variant,x,y,width:64,height:32});
    }
  }
  return {canvas:out,metadata:{image:'terrain.png',frames,baseColors,palette,production:{
    method:'low-contrast generated panels; coarse two-tone palette without dithering; isometric projection',
    source:{url,width:image.naturalWidth,height:image.naturalHeight},materials:['grass','dirt','water'],sampleSize:32}}};
}
async function vehicle(){
  const loaded=await sourceViews(sourceRoot+'world/suv.png',4,2,{bodyHeight:60,maxWidth:110});
  // The generated NE/SW candidates repeated SE/NW. Mirror the correct diagonals.
  for(const[target,source]of[[3,5],[7,1]]){
    const corrected=canvas(256,256),ctx=corrected.getContext('2d');
    ctx.translate(256,0);ctx.scale(-1,1);ctx.drawImage(loaded.frames[source].texture,0,0);
    loaded.frames[target]={...loaded.frames[source],texture:corrected};
  }
  const out=canvas(96,8*96),g=out.getContext('2d'),directions={};
  for(let i=0;i<8;i++){g.drawImage(loaded.frames[i].texture,0,i*96,96,96);directions[DIRECTIONS[i]]=[{x:0,y:i*96,width:96,height:96}];}
  return {canvas:out,metadata:{image:'suv.png',group:'vehicle',cell:{width:96,height:96},footAnchor:{x:48,y:87},bodyHeight:45,
    renderScale:.4,directions:DIRECTIONS,production:{correctedFacings:['NE','SW'],method:'mirrored correct opposite diagonal masters'},clips:{idle:{fps:1,loop:true,directions}}}};
}
export async function buildWorld(){
  const built={},manifest={version:1,style:'sculpted',characters:{},objects:{},terrain:null};
  for(const type of ['sniper','walker']){
    const metadata=await(await fetch('../../assets/sculpted-pixel/'+type+'.json')).json();
    manifest.characters[type]={...metadata,image:'../'+metadata.image,group:type==='sniper'?'unit':'zombie',
      bodyHeight:76,renderScale:.28,strike:type==='sniper'?'shoot':'attack',walkStride:type==='sniper'?10/3:4};
  }
  for(const[type,def]of Object.entries(CAST)){built[type]=await character(type,def);manifest.characters[type]=built[type].metadata;}
  for(const[id,def]of Object.entries(OBJECTS)){built[id]=await object(id,def);manifest.objects[id]=built[id].metadata;}
  built.terrain=await buildTerrain();manifest.terrain=built.terrain.metadata;
  built.suv=await vehicle();manifest.characters.suv=built.suv.metadata;
  return {built,manifest};
}
