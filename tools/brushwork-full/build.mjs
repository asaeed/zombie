import {canvas} from '../brushwork/rig.mjs';
import {CAST,DIRECTIONS,SOURCE_DIRECTIONS,MIRRORS,clipsFor} from './catalog.mjs';
import {WIDTH,HEIGHT,ANCHOR,loadComponents,assemble,render} from './components.mjs';
import {buildings} from './world-hires.mjs';
import {BUILDER_LEG_JOINTS} from './source-landmarks.mjs';
const CELL={width:128,height:128},FOOT={x:64,y:116},SCALE=.4,BODY=96;
async function approved(){const r=await fetch('../../assets/brushwork/motion-r5/manifest.json'),m=await r.json(),images={};for(const id of ['soldier','walker']){const image=new Image();image.src='../../assets/brushwork/motion-r5/'+id+'.png';await image.decode();images[id]={image,metadata:m.actors[id]};}return images;}
async function approvedSoldier(){
  const metadata=await(await fetch('../../assets/brushwork-full/approved/soldier-walk.json')).json();
  const image=new Image();image.src='../../assets/brushwork-full/approved/'+metadata.image;await image.decode();return{image,metadata};
}
export async function build(only=null){
  const built={},manifest={version:1,style:'brushwork-layered',imageSmoothing:true,imageSmoothingQuality:'high',characters:{},objects:{},terrain:null,production:{method:'authored per-character anatomy, corrected front leg paintings, projected frontal gait and periodic side IK; approved soldier walk copied exactly',sources:'source/generation.json',anatomyRepair:'source/front-legs-generation.json',mirroredFacings:MIRRORS,bodyPixels:BODY,filtering:'high quality',tool:'built-in image_gen',model:'not exposed'}},cache=new Map(),original=await approved();
  const entries=Object.entries(CAST).filter(([id])=>!only||id===only),soldier=entries.some(([id])=>id==='soldier')?await approvedSoldier():null;
  for(const[id,entry]of entries){
    const def={...entry,id};
    const sourceId=def.source??id;if(!cache.has(sourceId))cache.set(sourceId,await loadComponents(sourceId));const loaded=cache.get(sourceId);
    let variants=null;if(['cap','dress'].includes(def.variant)){if(!cache.has('walker-bodies'))cache.set('walker-bodies',await loadComponents('walker-bodies',5,2));variants=cache.get('walker-bodies');}
    let front=null;
    if(def.group==='zombie'){
      if(!cache.has('front-legs'))cache.set('front-legs',await loadComponents('front-legs',2,3));
      const sheet=cache.get('front-legs'),at=def.id==='runner'?2:['brute','boss'].includes(def.id)?4:0;
      front={loaded:sheet,cells:sheet.cells.slice(at,at+2)};
    }
    let builderLegs=null,soldierPoses=null,sniperBack=null;
    if(id==='builder')builderLegs=await loadComponents('repair-r2/builder-legs',2,5);
    if(def.gun)soldierPoses=await loadComponents('repair-r2/'+id+'-poses',2,3);
    if(id==='sniper')sniperBack=await loadComponents('repair-r2/sniper-back',1,1);
    const views=SOURCE_DIRECTIONS.map((d,row)=>assemble(loaded,row,def,
      variants?{loaded:variants,body:variants.cells[row+(def.variant==='dress'?5:0)]}:null,
      builderLegs?{loaded:builderLegs,cells:builderLegs.cells.slice(row*2,row*2+2),joints:BUILDER_LEG_JOINTS[d]}:row===0?front:null,
      sniperBack&&d==='N'?{loaded:sniperBack,indices:{shoot:0},registrations:{shoot:{headTop:.135,headX:.50}}}:
      soldierPoses?{loaded:soldierPoses,indices:{shoot:row,...(id==='soldier'&&row===0?{ready:5}:{})}}:null));
    const clips=clipsFor(def),total=clips.reduce((n,c)=>n+c.frames*8,0),atlas=canvas(CELL.width*8,CELL.height*Math.ceil(total/8)),g=atlas.getContext('2d'),clipData={},bindings={};let at=0;
    for(const clip of clips){clipData[clip.name]={fps:clip.fps,loop:clip.loop,directions:{}};
      for(const direction of DIRECTIONS){const facing=MIRRORS[direction]??direction,flip=direction!==facing,row=SOURCE_DIRECTIONS.indexOf(facing),assembled=views[row];bindings[direction]={sourceFacing:facing,mirrored:flip,...assembled.binding};const frames=[];
        for(let n=0;n<clip.frames;n++){
          const frame=canvas(WIDTH,HEIGHT),f=frame.getContext('2d');if(flip){f.translate(WIDTH,0);f.scale(-1,1);}
          const retained=original[id]?.metadata.directions[facing];
          if(retained&&clip.name==='walk'&&!(id==='soldier'&&direction==='S')){const a=retained.frames[n];f.drawImage(original[id].image,a.x,a.y,a.width,a.height,ANCHOR.x-128,ANCHOR.y-300,a.width,a.height);}
          else render(f,assembled,facing,n/(clip.loop?clip.frames:clip.frames-1),def,clip.name);
          const x=(at%8)*CELL.width,y=Math.floor(at/8)*CELL.height;g.imageSmoothingQuality='high';
          if(id==='soldier'&&clip.name==='walk'&&direction!=='S'){
            const a=soldier.metadata.clips.walk.directions[direction][n];
            g.drawImage(soldier.image,a.x,a.y,a.width,a.height,x,y,CELL.width,CELL.height);
          }else if(clip.name==='shoot'&&def.gun){
            // Sample in local cell coordinates once; large atlas offsets can alter edge rounding.
            const cell=canvas(CELL.width,CELL.height),c=cell.getContext('2d');c.imageSmoothingQuality='high';
            c.drawImage(frame,0,0,WIDTH,HEIGHT,FOOT.x-ANCHOR.x*SCALE,FOOT.y-ANCHOR.y*SCALE,WIDTH*SCALE,HEIGHT*SCALE);
            g.drawImage(cell,x,y);
          }else g.drawImage(frame,0,0,WIDTH,HEIGHT,x+FOOT.x-ANCHOR.x*SCALE,y+FOOT.y-ANCHOR.y*SCALE,WIDTH*SCALE,HEIGHT*SCALE);
          frames.push({x,y,...CELL});at++;
        }clipData[clip.name].directions[direction]=frames;
      }
    }
    const metadata={image:id+'.png',group:def.group,cell:CELL,footAnchor:FOOT,bodyHeight:BODY,renderScale:def.size/BODY,strike:def.strike??null,work:def.work??null,directions:DIRECTIONS,walkStride:def.speed*16/def.fps/16,clips:clipData,
      production:{source:loaded.metadata,sourceId,bodyVariant:variants?.metadata??null,frontLegSource:front?.loaded.metadata??null,method:'authored anatomy and separated foot lanes; articulated cutouts, frontal projected foreshortening, no mesh bending or frame crossfades',motion:def,bindings,anatomy:views.map(v=>v.anatomy),retainedApprovedWalk:!!original[id],approvedWalk:id==='soldier'?{manifest:'approved/soldier-walk.json',facings:DIRECTIONS}:original[id]?{manifest:'../brushwork/motion-r5/manifest.json',facings:['SE','E','NE','N','NW','W','SW']}:null,feetProtectedInActions:true,mirroredFacings:MIRRORS}};
    if(builderLegs){metadata.production.directionalLegSource=builderLegs.metadata;metadata.production.directionalLegJoints=BUILDER_LEG_JOINTS;}
    if(soldierPoses){
      metadata.production.upperPoseSource=soldierPoses.metadata;metadata.production.upperPoseClips={shoot:'complete two-handed aimed painting plus restrained recoil'};
      metadata.production.upperPoseBindings=Object.fromEntries(SOURCE_DIRECTIONS.map((d,i)=>[d,views[i].upperBindings]));
      if(id==='soldier'){Object.assign(metadata.production.upperPoseClips,{idleS:'complete two-handed ready painting',walkS:'ready upper body with projected leg gait'});metadata.production.approvedWalk.facings=DIRECTIONS.filter(d=>d!=='S');}
    }
    built[id]={canvas:atlas,metadata};manifest.characters[id]=metadata;window.buildProgress=id;
  }
  if(!only){
    const r=await fetch('../../assets/brushwork/manifest.json'),world=await r.json();
    // Existing reference-generated world art already matches the approved painted characters.
    for(const[id,m]of Object.entries(world.objects))manifest.objects[id]={...m,image:'../brushwork/'+m.image};
    for(const[id,record]of Object.entries(await buildings(world))){built[id]=record;manifest.objects[id]=record.metadata;}
    manifest.terrain={...world.terrain,image:'../brushwork/'+world.terrain.image};manifest.characters.suv={...world.characters.suv,image:'../brushwork/'+world.characters.suv.image};
    manifest.production.retainedWorld={manifest:'../brushwork/manifest.json',sources:'../brushwork/source/generation.json',objects:Object.keys(world.objects),vehicle:'suv',terrain:['grass','dirt','water']};
  }
  return {built,manifest};
}
