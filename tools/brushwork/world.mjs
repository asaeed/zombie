import {canvas,source,view,drawPose,DIRECTIONS} from './rig.mjs';
import {CAST as EXISTING,OBJECTS,clipsFor} from '../sculpted-pixel/catalog.mjs';
const ROOT='../../assets/brushwork/source/';
const CAST={soldier:EXISTING.soldier,scout:EXISTING.scout,builder:EXISTING.builder,medic:EXISTING.medic,
  sniper:{group:'unit',strike:'shoot',scale:.28,gather:true},heavy:EXISTING.heavy,torchbearer:EXISTING.torchbearer,
  walker:{group:'zombie',strike:'attack',scale:.28,fps:11},...Object.fromEntries(Object.entries(EXISTING).filter(([,d])=>d.group==='zombie'))};
const roleRows=['scout','builder','medic','sniper','heavy','torchbearer'];
const zombieRows=['runner','brute','spitter','exploder','screamer','boss'];
const variantRows=['walker-cap','walker-dress','walker-onearm'];
const strikeRows=['soldier','scout','sniper','builder','heavy','torchbearer'];
async function character(id,def,loaded,rects,working=null,keyPoses=false,striking=null){
  const options={bodyHeight:def.bodyHeight??76,maxWidth:104,joints:def.joints??{hip:83,knee:98,ankle:111}};
  const views=rects.map(cells=>{
    const neutral=view(loaded,cells[0],options);
    return [neutral,...cells.slice(1).map(rect=>view(loaded,rect,{...options,scale:neutral.scale}))];
  });
  const work=working?.cells.map(rect=>view(working.source,rect,options));
  const strikes=striking?.cells.map(rect=>view(striking.source,rect,options));
  const clips=clipsFor(def),cellWidth=['boss','walker','sniper','runner'].includes(id)?160:128;
  const sheet=canvas(cellWidth*12,128*8*clips.length),g=sheet.getContext('2d'),frame=canvas(320,256),f=frame.getContext('2d'),clipData={};
  g.imageSmoothingQuality='high';
  for(const[row,clip]of clips.entries()){
    clipData[clip.name]={fps:clip.fps,loop:clip.loop,directions:{}};
    for(let d=0;d<8;d++){
      const cells=[];
      for(let n=0;n<clip.frames;n++){
        f.setTransform(1,0,0,1,0,0);f.clearRect(0,0,frame.width,frame.height);f.setTransform(2,0,0,2,32,0);
        drawPose(f,id,views[d],work?.[d],d,clip.name,n,clip.frames,strikes?.[d]);
        const x=n*cellWidth,y=(row*8+d)*128;
        g.drawImage(frame,32-(cellWidth-128),0,cellWidth*2,256,x,y,cellWidth,128);
        cells.push({x,y,width:cellWidth,height:128});
      }
      clipData[clip.name].directions[DIRECTIONS[d]]=cells;
    }
  }
  return {canvas:sheet,metadata:{image:id+'.png',group:def.group,cell:{width:cellWidth,height:128},footAnchor:{x:cellWidth/2,y:116},
    bodyHeight:def.bodyHeight??76,renderScale:def.scale,strike:def.strike??null,work:def.work??null,
    directions:DIRECTIONS,walkStride:id==='runner'?4:id==='scout'?6:4.5,clips:clipData,
    production:{method:keyPoses?'painted directional contact/passing/strike sources; joint-aligned inbetweens':'painted directional masters; restrained articulated texture rig',
      source:loaded.metadata,sourceFrames:rects,workSource:working?.source.metadata??null,strikeSource:striking?.source.metadata??null,joints:views.map(v=>v[0].legs),
      feetProtectedInActions:true,tool:'built-in image_gen',model:'not exposed'}}};
}
async function object(id,def,loaded,rect){
  const factor=Math.min(def.width/rect.w,def.height/rect.h),w=Math.round(rect.w*factor),h=Math.round(rect.h*factor),out=canvas(w+8,h+8),g=out.getContext('2d');
  g.imageSmoothingQuality='high';g.drawImage(loaded.sheet,rect.x,rect.y,rect.w,rect.h,4,4,w,h);
  return {canvas:out,metadata:{image:id+'.png',...def,width:out.width,height:out.height,footAnchor:{x:4+(rect.footX-rect.x)*factor,y:h+4},production:{source:loaded.metadata,rect}}};
}
export function terrain(){
  const out=canvas(1024,96),g=out.getContext('2d'),palette={grass:['#8e9b64','#919e67'],dirt:['#b1b0a0','#b4b3a3'],water:['#548d9f','#5790a2']},baseColors={},frames=[];
  for(const[row,type]of['grass','dirt','water'].entries()){
    baseColors[type]=palette[type][0];
    for(let v=0;v<16;v++){
      const tile=g.createImageData(64,32),colors=palette[type].map(c=>[1,3,5].map(n=>parseInt(c.slice(n,n+2),16)));
      for(let y=0;y<32;y++)for(let x=0;x<64;x++){
        if(Math.abs(x+.5-32)/32+Math.abs(y+.5-16)/16>1)continue;
        const broad=v%5===0&&x>38&&y>8&&y<24,at=(y*64+x)*4;tile.data.set([...colors[broad?1:0],255],at);
      }
      g.putImageData(tile,v*64,row*32);frames.push({type,variant:v,x:v*64,y:row*32,width:64,height:32});
    }
  }
  return {canvas:out,metadata:{image:'terrain.png',frames,baseColors,palette,production:{method:'two-tone quiet raster terrain; broad sparse patches; no grain or dithering',reference:'docs/art-directions/next-brushwork-tactics.png'}}};
}
async function vehicle(){
  const loaded=await source(ROOT+'suv.png',4,2),out=canvas(96,768),g=out.getContext('2d'),directions={};
  for(let d=0;d<8;d++){const v=view(loaded,loaded.cells[d],{bodyHeight:60,maxWidth:110});g.drawImage(v.texture,32,0,256,256,0,d*96,96,96);directions[DIRECTIONS[d]]=[{x:0,y:d*96,width:96,height:96}];}
  return {canvas:out,metadata:{image:'suv.png',group:'vehicle',cell:{width:96,height:96},footAnchor:{x:48,y:87},bodyHeight:45,renderScale:.4,directions:DIRECTIONS,clips:{idle:{fps:1,loop:true,directions}},production:{source:loaded.metadata,sourceFrames:loaded.cells}}};
}
export async function build(pilot=false){
  const built={},manifest={version:1,style:'brushwork',imageSmoothing:false,characters:{},objects:{},terrain:null};
  const soldier=await source(ROOT+'soldier-poses.png',4,8),walker=await source(ROOT+'walker-poses.png',4,8),gather=await source(ROOT+'soldier-gather.png',4,2);
  const strikes=await source(ROOT+'survivors-strikes.png',8,6);
  for(const[id,loaded]of[['soldier',soldier],['walker',walker]]){
    built[id]=await character(id,CAST[id],loaded,Array.from({length:8},(_,d)=>loaded.cells.slice(d*4,d*4+4)),id==='soldier'?{source:gather,cells:gather.cells}:null,true,id==='soldier'&&strikes?{source:strikes,cells:strikes.cells.slice(0,8)}:null);
    manifest.characters[id]=built[id].metadata;
  }
  if(pilot)return {built,manifest};
  const survivors=await source(ROOT+'survivors.png',8,6),work=await source(ROOT+'survivors-work-r2.png',8,6),specials=await source(ROOT+'specials.png',8,6),variants=await source(ROOT+'walker-variants.png',8,3);
  for(const[loaded,ids]of[[survivors,roleRows],[specials,zombieRows],[variants,variantRows]])for(const[row,id]of ids.entries()){
    const strikeRow=strikeRows.indexOf(id),strike=strikeRow<0?null:{source:strikes,cells:strikes.cells.slice(strikeRow*8,strikeRow*8+8)};
    const master=id==='scout'?strikes:loaded,masterRow=id==='scout'?strikeRow:row;
    built[id]=await character(id,CAST[id],master,Array.from({length:8},(_,d)=>[master.cells[masterRow*8+d]]),loaded===survivors?{source:work,cells:work.cells.slice(row*8,row*8+8)}:null,false,strike);
    manifest.characters[id]=built[id].metadata;
  }
  const buildings=await source(ROOT+'buildings.png',4,2),props=await source(ROOT+'props.png',3,2);
  for(const[row,id]of['hq','wall','tower','barracks','depot','light','clinic','mechanics'].entries()){
    built[id]=await object(id,OBJECTS[id],buildings,buildings.cells[row]);manifest.objects[id]=built[id].metadata;
  }
  for(const[row,id]of['car','cabin','bin','pine','bush','rock'].entries()){
    built[id]=await object(id,OBJECTS[id],props,props.cells[row]);manifest.objects[id]=built[id].metadata;
  }
  built.terrain=terrain();manifest.terrain=built.terrain.metadata;built.suv=await vehicle();manifest.characters.suv=built.suv.metadata;
  return {built,manifest};
}
