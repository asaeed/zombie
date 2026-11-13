import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),output=path.join(root,'assets/rigged-pilot/review');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2}),errors=[],report={technical:{},controls:{},visualReview:{automaticApproval:false,required:true}};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://127.0.0.1:8787/docs/art-directions/rigged-motion.html');await page.waitForFunction(()=>window.riggedReview,null,{timeout:60000});await page.evaluate(()=>riggedReview.play(false));
 report.technical=await page.evaluate(()=>{
  const result={};for(const[id,r]of Object.entries(riggedReview.records)){
   const c=document.createElement('canvas');c.width=r.image.width;c.height=r.image.height;const g=c.getContext('2d');g.drawImage(r.image,0,0);const data=g.getImageData(0,0,c.width,c.height).data;
   let blank=0,edge=0,count=0;const distinct={};
   for(const[action,clip]of Object.entries(r.metadata.clips))for(const[direction,frames]of Object.entries(clip.directions)){
    const hashes=new Set();for(const f of frames){let n=0,hit=false,hash=2166136261;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const i=((f.y+y)*c.width+f.x+x)*4;hash=Math.imul(hash^((data[i]<<8)|data[i+3]),16777619)>>>0;if(data[i+3]>128){n++;if(!x||!y||x===f.width-1||y===f.height-1)hit=true;}}count++;if(!n)blank++;if(hit)edge++;hashes.add(hash);}if(action==='walk')distinct[direction]=hashes.size;
   }result[id]={count,blank,edge,distinct,bodyCSS:r.metadata.bodyHeight*r.metadata.renderScale};
  }return result;
 });
 for(const r of Object.values(report.technical)){assert.equal(r.blank,0);assert.equal(r.edge,0);assert.equal(r.bodyCSS,21.28);for(const n of Object.values(r.distinct))assert.equal(n,16);}
 report.carryWeapon=await page.evaluate(async()=>{
  const image=new Image();image.src='../../assets/rigged-pilot/review/soldier-weapon-witness.png';await image.decode();
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height).data;
  const result={};for(const action of ['idle','walk'])for(const [direction,frames]of Object.entries(riggedReview.records.soldier.metadata.clips[action].directions)){
   const centroids=[],hashes=new Set();let blank=0,edge=0;
   for(const f of frames){let mass=0,sx=0,sy=0,hash=2166136261;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const i=((f.y+y)*c.width+f.x+x)*4,a=pixels[i+3];hash=Math.imul(hash^a,16777619)>>>0;mass+=a;sx+=x*a;sy+=y*a;if(a>128&&(!x||!y||x===f.width-1||y===f.height-1))edge++;}if(!mass)blank++;centroids.push([sx/mass,sy/mass]);hashes.add(hash);}
   const steps=centroids.map((p,i)=>Math.hypot(...p.map((n,k)=>n-centroids[(i+1)%frames.length][k])));
   result[action+'/'+direction]={blank,edge,distinct:hashes.size,centroidSpan:Math.max(...centroids.map(p=>Math.hypot(...p.map((n,k)=>n-centroids[0][k])))),seam:steps.at(-1),maxAdjacent:Math.max(...steps.slice(0,-1))};
  }return result;
 });
 for(const r of Object.values(report.carryWeapon)){assert.equal(r.blank,0);assert.equal(r.edge,0);assert.ok(r.distinct>=8);assert.ok(r.centroidSpan>.05,'rendered rifle is stationary');assert.ok(r.seam<r.maxAdjacent+.6,'carry loop jumps');}
 report.stowedWeapon=await page.evaluate(async()=>{
  const image=new Image();image.src='../../assets/rigged-pilot/review/soldier-back-witness.png';await image.decode();
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height).data;
  const clip=riggedReview.records.soldier.metadata.clips.gather,offset=clip.directions.S[0].y,result={};
  for(const [direction,frames]of Object.entries(clip.directions)){
   const centroids=[];let blank=0,edge=0;
   for(const f of frames){let mass=0,sx=0,sy=0;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const a=pixels[((f.y-offset+y)*c.width+f.x+x)*4+3];mass+=a;sx+=x*a;sy+=y*a;if(a>128&&(!x||!y||x===f.width-1||y===f.height-1))edge++;}if(!mass)blank++;centroids.push([sx/mass,sy/mass]);}
   const steps=centroids.map((p,i)=>Math.hypot(...p.map((n,k)=>n-centroids[(i+1)%frames.length][k])));
   result[direction]={frames:frames.length,blank,edge,centroidSpan:Math.max(...centroids.map(p=>Math.hypot(...p.map((n,k)=>n-centroids[0][k])))),seam:steps.at(-1),maxAdjacent:Math.max(...steps.slice(0,-1))};
  }return result;
 });
 for(const r of Object.values(report.stowedWeapon)){assert.equal(r.frames,16);assert.equal(r.blank,0);assert.equal(r.edge,0);assert.ok(r.centroidSpan>.05,'stowed rifle is world-locked');assert.ok(r.seam<r.maxAdjacent+.6,'stowed rifle loop jumps');}
 for(const [id,actions]of [['soldier',['idle','walk','shoot','gather']],['walker',['idle','walk','attack']]])for(const action of actions){
  await page.selectOption('#unit',id);await page.selectOption('#action',action);
  for(const direction of ['S','SE','E','NE','N','NW','W','SW']){
   await page.selectOption('#facing',direction);const png=await page.locator('#film').evaluate(c=>c.toDataURL('image/png').split(',')[1]);await fs.writeFile(path.join(output,`${id}-${action}-${direction}.png`),Buffer.from(png,'base64'));
  }
  await page.evaluate(()=>{riggedReview.state.frame=8;riggedReview.render();});await page.screenshot({path:path.join(output,`${id}-${action}-all.png`),fullPage:true});
 }
 const before=await page.evaluate(()=>riggedReview.state.frame);await page.click('#next');assert.equal(await page.evaluate(()=>riggedReview.state.frame),before+1);await page.click('#previous');assert.equal(await page.evaluate(()=>riggedReview.state.frame),before);
 await page.selectOption('#unit','soldier');await page.selectOption('#action','walk');await page.selectOption('#speed','0.25');
 await page.evaluate(()=>{riggedReview.state.frame=0;riggedReview.render();riggedReview.play(true);});await page.waitForTimeout(280);const slow=await page.evaluate(()=>riggedReview.state.frame);assert.ok(slow>=1&&slow<=2);
 await page.evaluate(()=>riggedReview.play(false));await page.selectOption('#speed','1');
 report.controls.step=true;report.controls.slowPlayback=true;
 report.playback=await page.evaluate(async()=>{const result={};for(const id of ['soldier','walker']){riggedReview.state.type=id;riggedReview.state.action='walk';riggedReview.choose();riggedReview.play(true);const seen=new Set(),start=performance.now();await new Promise((resolve,reject)=>{function watch(){seen.add(riggedReview.state.frame);if(seen.size===16)return resolve();if(performance.now()-start>7000)return reject(Error('missing playback phases'));requestAnimationFrame(watch);}watch();});riggedReview.play(false);result[id]=seen.size;}return result;});
 await page.selectOption('#light','night');await page.screenshot({path:path.join(output,'night.png')});
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto('http://127.0.0.1:8787/docs/art-directions/rigged-motion.html');await mobile.waitForFunction(()=>window.riggedReview);await mobile.evaluate(()=>riggedReview.play(false));
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const mobilePixels=await mobile.locator('.view>canvas').evaluateAll(cs=>cs.map(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>128)pixels++;return pixels;}));assert.equal(mobilePixels.length,8);assert.ok(mobilePixels.every(n=>n>100));
 await mobile.screenshot({path:path.join(output,'mobile.png'),fullPage:true});await mobile.close();report.controls.mobileFits=true;report.controls.mobileCanvasPixels=mobilePixels;
 const baselineArg=process.argv.find(a=>a.startsWith('--baseline='));if(baselineArg){const baseline=JSON.parse(await fs.readFile(baselineArg.slice(11),'utf8'));let count=0;for(const[file,hash]of Object.entries(baseline)){assert.equal(createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex'),hash,file);count++;}report.existingAssetsAndGameUnchanged=count;}
 assert.deepEqual(errors,[]);report.browserErrors=errors;await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
