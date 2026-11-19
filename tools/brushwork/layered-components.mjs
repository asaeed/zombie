import {canvas,source} from './rig.mjs';
import {FACINGS,FRAME_COUNT,MOTION,bodyBob,walkPose,rigidTransform} from './gait.mjs';
import {paletteReference,lockPalette} from './palette.mjs';
const ROOT='../../assets/brushwork/';
const WIDTH=256,HEIGHT=320,BODY=240,ANCHOR={x:128,y:300};
const HIPS={
  soldier:[[[225,329],[292,329]],[[246,694],[279,694]],[[269,1057],[227,1057]],[[212,1418],[282,1418]]],
  walker:[[[247,266],[310,266]],[[240,655],[279,655]],[[291,1010],[239,1010]],[[210,1400],[285,1400]]],
};
function bandX(sheet,rect,y){const g=sheet.getContext('2d',{willReadFrequently:true}),data=g.getImageData(rect.x,Math.round(y-3),rect.w,7).data;let sum=0,count=0;for(let n=0;n<data.length;n+=4)if(data[n+3]>=128){sum+=(n/4)%rect.w;count++;}if(!count)throw Error('Empty joint band');return rect.x+sum/count;}
function slice(image,minY=0,maxY=HEIGHT){const c=canvas(WIDTH,HEIGHT),g=c.getContext('2d');g.save();g.beginPath();g.rect(0,minY,WIDTH,maxY-minY);g.clip();g.drawImage(image,0,0);g.restore();return c;}
function transform(g,image,m){g.save();g.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);g.drawImage(image,0,0);g.restore();}
export function renderLayered(g,parts,binding,direction,phase,kind){
  const pose=walkPose(binding,direction,phase,kind);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  for(const i of [1,0]){
    const from=binding.legs[i],to=pose[i],art=parts.legs[i];
    transform(g,art.thigh,rigidTransform(from.hip,from.knee,to.hip,to.knee));
    transform(g,art.shin,rigidTransform(from.knee,from.ankle,to.knee,to.ankle));
    const c=Math.cos(to.pitch),s=Math.sin(to.pitch);transform(g,art.boot,{a:c,b:s,c:-s,d:c,e:to.ankle.x-c*from.ankle.x+s*from.ankle.y,f:to.ankle.y-s*from.ankle.x-c*from.ankle.y});
  }
  g.drawImage(parts.torso,0,bodyBob(phase,kind));return pose;
}
async function components(kind){
  const image=new Image();image.src=ROOT+'source/layered-r3/'+kind+'-parts.png';await image.decode();const cleaned=canvas(image.width,image.height),g=cleaned.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
  const data=g.getImageData(0,0,cleaned.width,cleaned.height);let mattePixels=0;for(let i=3;i<data.data.length;i+=4)if(data.data[i]<224){if(data.data[i])mattePixels++;data.data[i]=0;}g.putImageData(data,0,0);
  const extracted=await source(cleaned.toDataURL(),3,4);extracted.metadata.url=ROOT+'source/layered-r3/'+kind+'-parts.png';extracted.metadata.matteCutoff=224;extracted.metadata.mattePixels=mattePixels;return extracted;
}
function assemble(loaded,kind,row,reference){
  const rects=loaded.cells.slice(row*3,row*3+3),upper=rects[0],hips=HIPS[kind][row],hipY=(hips[0][1]+hips[1][1])/2;
  const scale=125/(hipY-upper.y),headX=bandX(loaded.sheet,upper,upper.y+20),torso=canvas(WIDTH,HEIGHT),g=torso.getContext('2d',{willReadFrequently:true});
  const x=128+(upper.x-headX)*scale,y=60;g.drawImage(loaded.sheet,upper.x,upper.y,upper.w,upper.h,x,y,upper.w*scale,upper.h*scale);
  const upperData=g.getImageData(0,0,WIDTH,HEIGHT);reference??=paletteReference(upperData.data,kind==='soldier'?'blue':'grey');lockPalette(upperData.data,reference);g.putImageData(upperData,0,0);
  const binding={legs:[]},legs=[];
  for(let i=0;i<2;i++){
    const rect=rects[i+1],rawHip={x:bandX(loaded.sheet,rect,rect.y+rect.h*.08),y:rect.y+rect.h*.08},rawKnee={x:bandX(loaded.sheet,rect,rect.y+rect.h*.44),y:rect.y+rect.h*.44},rawAnkle={x:bandX(loaded.sheet,rect,rect.y+rect.h*.76),y:rect.y+rect.h*.76};
    const hip={x:128+(hips[i][0]-headX)*scale,y:60+(hips[i][1]-upper.y)*scale},legScale=(300-hip.y)/(rect.bottom-rawHip.y);
    const point=p=>({x:hip.x+(p.x-rawHip.x)*legScale,y:hip.y+(p.y-rawHip.y)*legScale}),knee=point(rawKnee),ankle=point(rawAnkle),art=canvas(WIDTH,HEIGHT),a=art.getContext('2d',{willReadFrequently:true});
    a.drawImage(loaded.sheet,rect.x,rect.y,rect.w,rect.h,hip.x+(rect.x-rawHip.x)*legScale,hip.y+(rect.y-rawHip.y)*legScale,rect.w*legScale,rect.h*legScale);
    const data=a.getImageData(0,0,WIDTH,HEIGHT);lockPalette(data.data,reference);a.putImageData(data,0,0);
    binding.legs.push({hip,knee,ankle,bend:row===3?(i===0?1:-1):-1,sourceRect:rect,sourceJoints:{hip:rawHip,knee:rawKnee,ankle:rawAnkle},scale:legScale});
    legs.push({thigh:slice(art,0,knee.y+10),shin:slice(art,knee.y-10,ankle.y+8),boot:slice(art,ankle.y-8,HEIGHT)});
  }
  return {parts:{torso,legs},binding,reference,upper:{rect:upper,scale,headX,hipY}};
}
export async function build(){
  const built={},actors={};
  for(const kind of ['soldier','walker']){
    const loaded=await components(kind),atlas=canvas(WIDTH*FRAME_COUNT,HEIGHT*FACINGS.length),g=atlas.getContext('2d'),directions={},masterSheet=canvas(WIDTH*FACINGS.length,HEIGHT),mg=masterSheet.getContext('2d');let reference;
    for(const [row,direction] of FACINGS.entries()){
      const assembled=assemble(loaded,kind,row,reference);reference=assembled.reference;const {parts,binding}=assembled,frames=[];
      for(let n=0;n<FRAME_COUNT;n++){
        const frame=canvas(WIDTH,HEIGHT),f=frame.getContext('2d'),pose=renderLayered(f,parts,binding,direction,n/FRAME_COUNT,kind);g.drawImage(frame,n*WIDTH,row*HEIGHT);if(!n)mg.drawImage(frame,row*WIDTH,0);
        frames.push({x:n*WIDTH,y:row*HEIGHT,width:WIDTH,height:HEIGHT,phase:n/FRAME_COUNT,bodyBob:bodyBob(n/FRAME_COUNT,kind),joints:pose});
      }
      directions[direction]={frames,binding,upper:assembled.upper,alignment:{target:{x:128,y:60}}};
    }
    built[kind]={canvas:atlas};built[kind+'-masters']={canvas:masterSheet};actors[kind]={image:kind+'.png',cell:{width:WIDTH,height:HEIGHT},bodyHeight:BODY,renderScale:21.28/BODY,footAnchor:ANCHOR,fps:MOTION[kind].fps,directions,
      production:{method:'generated complete components, overlapping rigid limbs, periodic two-bone IK gait with synchronized torso/hip bob',independentFrameRedraws:false,textureMesh:false,crossfade:false,staticUpperBody:false,motion:MOTION[kind],source:loaded.metadata,tool:'built-in image_gen',model:'not exposed'}};
  }
  return {built,manifest:{version:1,scope:'four-facing soldier/walker walk review only, unregistered',directions:FACINGS,frameCount:FRAME_COUNT,actors}};
}
