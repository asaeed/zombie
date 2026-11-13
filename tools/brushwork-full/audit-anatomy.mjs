import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=process.argv.find(v=>v.startsWith('--repo='))?.slice(7)??fileURLToPath(new URL('../../',import.meta.url));
const candidate=process.argv.find(v=>v.startsWith('--candidate='))?.slice(12);
const only=process.argv.find(v=>v.startsWith('--only='))?.slice(7).split(',');
const review=process.argv.find(v=>v.startsWith('--review='))?.slice(9);
const before=process.argv.find(v=>v.startsWith('--before='))?.slice(9);
const sources=process.argv.find(v=>v.startsWith('--sources='))?.slice(10);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
const dir=process.argv.find(v=>v.startsWith('--output='))?.slice(9)??await fs.mkdtemp(path.join(tmpdir(),'zombie-anatomy-'));
await fs.mkdir(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:1200},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(review)for(const ext of ['mjs','html'])await page.route('**/docs/art-directions/brushwork-full-sprites.'+ext,r=>r.fulfill({contentType:ext==='mjs'?'text/javascript':'text/html',path:path.join(review,'brushwork-full-sprites.'+ext)}));
 if(before)await page.route('**/assets/brushwork-full/review-r2/before/*',r=>r.fulfill({contentType:r.request().url().endsWith('.png')?'image/png':'application/json',path:path.join(before,new URL(r.request().url()).pathname.split('/').at(-1))}));
 if(sources)await page.route('**/assets/brushwork-full/source/repair-r2/*.png',r=>r.fulfill({contentType:'image/png',path:path.join(sources,new URL(r.request().url()).pathname.split('/').at(-1))}));
 if(candidate)await page.route('**/assets/brushwork-full/*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  try{await route.fulfill({contentType:name.endsWith('.png')?'image/png':'application/json',body:await fs.readFile(path.join(candidate,name))});}catch{await route.continue();}
 });
 await page.route('**/assets/brushwork-full/approved/*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  await route.fulfill({contentType:name.endsWith('.png')?'image/png':'application/json',body:await fs.readFile(path.join(root,'assets/brushwork-full/approved',name))});
 });
 await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-full-sprites.html');
 await page.waitForFunction(()=>window.brushReview);
 await page.evaluate(()=>brushReview.play(false));
 const report=await page.evaluate(async()=>{
  const result={actors:{},preservedSoldierWalk:true,soldierChangedFacings:[],buildings:{}};
  const old=await(await fetch('/assets/brushwork/manifest.json')).json();
  for(const[id,r]of Object.entries(brushReview.records)){
   if(id==='suv')continue;const m=r.metadata,c=document.createElement('canvas');c.width=m.cell.width;c.height=m.cell.height;
   const g=c.getContext('2d',{willReadFrequently:true});let checked=0,edge=0,min=Infinity;
   for(const clip of Object.values(m.clips))for(const frames of Object.values(clip.directions))for(const f of frames){
    g.clearRect(0,0,c.width,c.height);g.drawImage(r.image,f.x,f.y,f.width,f.height,0,0,c.width,c.height);
    const p=g.getImageData(0,0,c.width,c.height).data;let occupied=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(p[(y*c.width+x)*4+3]>96){occupied++;if(!x||!y||x===c.width-1||y===c.height-1)edge++;}
    min=Math.min(min,occupied);checked++;
   }
   result.actors[id]={checked,edge,min};
  }
  const meta=await(await fetch('/assets/brushwork-full/approved/soldier-walk.json')).json(),approved=new Image();approved.src='/assets/brushwork-full/approved/soldier-walk.png';await approved.decode();
  const r=brushReview.records.soldier,c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d',{willReadFrequently:true});
  const changed=new Set();
  for(const[d,frames]of Object.entries(meta.clips.walk.directions))for(const[n,f]of frames.entries()){
   g.clearRect(0,0,128,128);g.drawImage(approved,f.x,f.y,128,128,0,0,128,128);const a=g.getImageData(0,0,128,128).data;
   const b=r.metadata.clips.walk.directions[d][n];g.clearRect(0,0,128,128);g.drawImage(r.image,b.x,b.y,128,128,0,0,128,128);const z=g.getImageData(0,0,128,128).data;
   if(a.some((v,i)=>v!==z[i]))changed.add(d);
  }
  result.soldierChangedFacings=[...changed];
  result.preservedSoldierWalk=r.metadata.production.approvedWalk.facings.every(d=>!changed.has(d));
  result.protectedClips={};
  for(const id of ['soldier','scout','sniper']){
   const m=await(await fetch('/assets/brushwork-full/review-r2/before/manifest.json')).json(),image=new Image();
   image.src='/assets/brushwork-full/review-r2/before/'+id+'.png';await image.decode();let checked=0;
   const current=brushReview.records[id];
   for(const [action,clip]of Object.entries(m.characters[id].clips)){
    if(action==='shoot')continue;
    for(const [direction,frames]of Object.entries(clip.directions)){
     if(id==='soldier'&&direction==='S'&&['idle','walk'].includes(action))continue;
     for(const [n,f]of frames.entries()){
      g.clearRect(0,0,128,128);g.drawImage(image,f.x,f.y,128,128,0,0,128,128);const a=g.getImageData(0,0,128,128).data;
      const f2=current.metadata.clips[action].directions[direction][n];g.clearRect(0,0,128,128);g.drawImage(current.image,f2.x,f2.y,128,128,0,0,128,128);const b=g.getImageData(0,0,128,128).data;
      if(a.some((v,i)=>v!==b[i]))throw Error('Protected frame changed: '+id+'/'+action+'/'+direction+'/'+n);
      checked++;
     }
    }
   }result.protectedClips[id]={checked,exact:true};
  }
  const {loadComponents}=await import('/tools/brushwork-full/components.mjs');
  const previous=await loadComponents('builder'),current=await loadComponents('repair-r2/builder-legs',2,5);
  const toe=(loaded,r,ankleX)=>{
   const p=loaded.sheet.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data;let sum=0,mass=0;
   for(let y=Math.floor(r.h*.88);y<r.h;y++)for(let x=0;x<r.w;x++)if(p[(y*r.w+x)*4+3]>224){sum+=x;mass++;}
   return sum/mass-ankleX;
  };
  const oldFar=previous.cells[2*5+4],data=previous.sheet.getContext('2d').getImageData(oldFar.x,Math.round(oldFar.y+oldFar.h*.79-3),oldFar.w,7).data;
  let sum=0,mass=0;for(let i=3;i<data.length;i+=4)if(data[i]>224){sum+=((i-3)/4)%oldFar.w;mass++;}
  result.builderProfileBoots={beforeFar:toe(previous,oldFar,sum/mass),after:current.cells.slice(4,6).map((r,i)=>toe(current,r,r.w*brushReview.records.builder.metadata.production.directionalLegJoints.E[i].ankle[0]))};
  result.shootingLegStability={};
  for(const id of ['soldier','scout','sniper']){
   const r=brushReview.records[id],m=r.metadata;let same=true,maxAlpha=0,maxPremultiplied=0;const differingRows=new Set();
   for(const frames of Object.values(m.clips.shoot.directions)){
    let first;
    for(const f of frames){g.clearRect(0,0,128,128);g.drawImage(r.image,f.x,f.y,128,128,0,0,128,128);const p=g.getImageData(0,82,128,46).data;
     if(!first)first=p;else for(let i=0;i<p.length;i+=4){
      maxAlpha=Math.max(maxAlpha,Math.abs(first[i+3]-p[i+3]));
      for(let k=0;k<3;k++)maxPremultiplied=Math.max(maxPremultiplied,Math.abs(first[i+k]*first[i+3]-p[i+k]*p[i+3])/255);
      if(first.slice(i,i+4).some((v,k)=>v!==p[i+k])){same=false;differingRows.add(82+Math.floor(i/(128*4)));}
     }}
   }result.shootingLegStability[id]={same,maxAlpha,maxPremultiplied,differingRows:[...differingRows].sort((a,b)=>a-b)};
  }
  for(const[id,m]of Object.entries(brushReview.manifest.objects))if(m.displaySize){
   const image=new Image();image.src='/assets/brushwork-full/'+m.image;await image.decode();
   result.buildings[id]={width:image.width,height:image.height,density:image.width/m.displaySize.width,
     displayUnchanged:m.displaySize.width===old.objects[id].width&&m.displaySize.height===old.objects[id].height};
  }
  return result;
 });
 assert.equal(report.preservedSoldierWalk,true);assert.deepEqual(report.soldierChangedFacings,['S']);for(const r of Object.values(report.actors)){assert.equal(r.edge,0);assert.ok(r.min>150);}
 assert.ok(report.builderProfileBoots.beforeFar<0,'reproduces backwards source boot');for(const x of report.builderProfileBoots.after)assert.ok(x>0,'both repaired boots face forward');
 console.log(JSON.stringify({boots:report.builderProfileBoots,shooting:report.shootingLegStability}));
 for(const [id,result]of Object.entries(report.shootingLegStability))assert.equal(result.same,true,id+' independently decoded shooting leg pixels');
 for(const r of Object.values(report.buildings)){assert.ok(r.density>=2);assert.ok(r.displayUnchanged);}
 const inspected=Object.keys(report.actors).filter(id=>!only||only.includes(id));
 for(const id of inspected){
  const data=await page.evaluate(id=>{
   const r=brushReview.records[id],m=r.metadata,c=document.createElement('canvas');c.width=1080;c.height=1190;
   const g=c.getContext('2d');g.imageSmoothingQuality='high';g.fillStyle='#8e9b64';g.fillRect(0,0,c.width,c.height);
   g.font='16px system-ui';g.fillStyle='#17251e';g.fillText(id+' / idle, walk 0/4/8/12, strike',15,22);
   for(const[row,d]of m.directions.entries())for(const[col,pick]of [['idle',0],['walk',0],['walk',4],['walk',8],['walk',12],[m.strike??m.work,4]].entries()){
    const [action,n]=pick,f=m.clips[action].directions[d][n],s=1.1,x=col*180+90,y=row*142+162;
    g.strokeStyle='#506144';g.beginPath();g.moveTo(x-60,y);g.lineTo(x+60,y);g.stroke();
    g.drawImage(r.image,f.x,f.y,f.width,f.height,x-m.footAnchor.x*s,y-m.footAnchor.y*s,f.width*s,f.height*s);
    g.fillStyle='#17251e';g.fillText(d+' '+action+' '+n,col*180+8,row*142+48);
    const z=m.renderScale;g.drawImage(r.image,f.x,f.y,f.width,f.height,x+58-m.footAnchor.x*z,y-m.footAnchor.y*z,f.width*z,f.height*z);
   }
   return c.toDataURL().split(',')[1];
  },id);
  await fs.writeFile(dir+'/'+id+'-contact.png',Buffer.from(data,'base64'));
  const actions=await page.evaluate(id=>Object.keys(brushReview.records[id].metadata.clips),id);
  report.actors[id].filmstrips=[];
  for(const action of actions){
   const bytes=await page.evaluate(({id,action})=>{
    const r=brushReview.records[id],m=r.metadata,clip=m.clips[action],count=clip.directions.S.length;
    const c=document.createElement('canvas');c.width=count*128+48;c.height=m.directions.length*154+30;
    const g=c.getContext('2d');g.imageSmoothingQuality='high';g.fillStyle='#8e9b64';g.fillRect(0,0,c.width,c.height);
    g.fillStyle='#17251e';g.font='14px system-ui';g.fillText(id+' / '+action+' / ALL frames, ALL directions',10,20);
    for(const [row,d]of m.directions.entries()){
     const y=row*154+30;g.fillText(d,5,y+30);
     for(const [n,f]of clip.directions[d].entries()){
      g.fillStyle=n%2?'#a1ab7d':'#929f6a';g.fillRect(48+n*128,y,128,154);
      g.drawImage(r.image,f.x,f.y,f.width,f.height,48+n*128,y,128,128);
      g.fillStyle='#17251e';g.fillText(String(n),54+n*128,y+145);
     }
    }return c.toDataURL().split(',')[1];
   },{id,action});
   const name=id+'-'+action+'-all.png';await fs.writeFile(dir+'/'+name,Buffer.from(bytes,'base64'));report.actors[id].filmstrips.push(name);
  }
 }
 // Full loops in the actual inspector, then deterministic night and mobile states.
 for(const id of inspected){
  report.actors[id].playedActions=await page.evaluate(async id=>{
   const clips=brushReview.records[id].metadata.clips,result={};
   for(const [action,clip]of Object.entries(clips)){
    brushReview.state.type=id;brushReview.state.action=action;brushReview.choose();brushReview.play(true);
    const count=clip.directions.S.length,seen=new Set(),start=performance.now();
    await new Promise((resolve,reject)=>{function watch(){seen.add(brushReview.state.frame);if(seen.size===count)return resolve();if(performance.now()-start>count/clip.fps*4000)return reject(Error(id+'/'+action+' incomplete playback'));requestAnimationFrame(watch);}watch();});
    result[action]=seen.size;brushReview.play(false);
   }return result;
  },id);
 }
 await page.evaluate(()=>{brushReview.play(false);brushReview.state.type='builder';brushReview.state.action='walk';brushReview.choose();brushReview.state.frame=4;brushReview.render();});
 await page.screenshot({path:dir+'/builder-inspector-day.png'});
 await page.selectOption('#background','night');await page.screenshot({path:dir+'/builder-inspector-night.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/inspector-mobile.png'});
 assert.deepEqual(errors,[]);report.errors=errors;
 report.visualReview={required:true,automaticApproval:false,scope:inspected,coverage:'all frames of every action in every facing; no sampled-peak substitution',checks:['source foot toe/heel direction','anatomical facing','shoulder and hip ownership','knee hinge and foot lanes','torso-to-leg ratio','two hands connected to rifle in every shooting view','equipment hand and depth order','all frame transitions and loop seam']};
 await fs.writeFile(dir+'/art-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
