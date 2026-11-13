import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';
const out=await fs.mkdtemp(path.join(tmpdir(),'zombie-layered-review-')),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']}),report={evidence:out,scope:'four-facing walk review, not game replacement'};
async function auditSampling(page){
  return page.evaluate(()=>{
    const saved={...walkReview.state},rows=[];
    for(const unit of ['soldier','walker'])for(const direction of ['SE','E','NE','N']){
      walkReview.state.unit=unit;walkReview.state.direction=direction;
      const alpha=[[],[]],partial=[0,0],canvases=walkReview.panels.slice(1).map(p=>p.n),r=walkReview.actors[unit].current;
      for(let n=0;n<16;n++){walkReview.state.frame=n;walkReview.render();for(let k=0;k<2;k++){const c=canvases[k],data=c.getContext('2d').getImageData(0,0,c.width,c.height).data,a=[];for(let i=3;i<data.length;i+=4){a.push(data[i]);if(data[i]>0&&data[i]<255)partial[k]++;}alpha[k].push(a);}}
      // Quiet upper-body alpha isolates edge shimmer from the moving leg silhouettes.
      const ratio=canvases[0].width/100,limit=Math.ceil((34+(155-r.metadata.footAnchor.y)*r.metadata.renderScale)*ratio)*canvases[0].width;
      const curvature=alpha.map(frames=>{let total=0;for(let n=0;n<16;n++)for(let i=0;i<limit;i++)total+=Math.abs(frames[(n+15)%16][i]-2*frames[n][i]+frames[(n+1)%16][i]);return total;});
      rows.push({unit,direction,sameArt:r===walkReview.actors[unit].previous,temporalAlphaCurvature:{pixel:curvature[0],smooth:curvature[1],ratio:curvature[1]/curvature[0]},partialAlphaPixels:{pixel:partial[0],smooth:partial[1]}});
    }
    Object.assign(walkReview.state,saved);walkReview.render();return rows;
  });
}
function checkSampling(rows){for(const row of rows){assert.equal(row.sameArt,true);assert.ok(row.temporalAlphaCurvature.pixel>0);assert.ok(row.temporalAlphaCurvature.ratio<.95);assert.ok(row.partialAlphaPixels.smooth>row.partialAlphaPixels.pixel);}}
try{
  const context=await browser.newContext({viewport:{width:1180,height:900},deviceScaleFactor:2}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-walk.html');await page.waitForFunction(()=>window.walkReview);await page.evaluate(()=>walkReview.play(false));
  assert.equal(await page.inputValue('#sampling'),'smooth');report.sampling=[{dpr:2,viewport:'desktop',rows:await auditSampling(page)}];checkSampling(report.sampling[0].rows);
  await page.selectOption('#sampling','pixel');assert.equal(await page.evaluate(()=>{const[a,b]=walkReview.panels.slice(1).map(p=>p.n),pixels=c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);return JSON.stringify(pixels(a))===JSON.stringify(pixels(b));}),true);
  await page.selectOption('#sampling','smooth');assert.deepEqual(await page.evaluate(()=>{const p=walkReview.panels[2].c,g=p.getContext('2d');return{enabled:g.imageSmoothingEnabled,quality:g.imageSmoothingQuality,css:getComputedStyle(p).imageRendering};}),{enabled:true,quality:'high',css:'auto'});
  report.pixels=await page.evaluate(async()=>{
    const {measureHeadRoot}=await import('/tools/brushwork/alignment.mjs');
    const result={};for(const [id,a]of Object.entries(walkReview.actors)){
      const r=a.current,c=document.createElement('canvas');c.width=r.image.width;c.height=r.image.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(r.image,0,0);const data=g.getImageData(0,0,c.width,c.height).data,rows={};
      for(const [direction,row]of Object.entries(r.metadata.directions)){
        const hashes=[],heads=[],counts=[],edges=[],frames=[],step=[],roots=[];
        for(const f of row.frames){let hash=2166136261,head=2166136261,count=0,edge=0;const frame=new Uint8ClampedArray(f.width*f.height*4);
          for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const i=((f.y+y)*c.width+f.x+x)*4,j=(y*f.width+x)*4;frame.set(data.subarray(i,i+4),j);for(let k=0;k<4;k++){hash=Math.imul(hash^data[i+k],16777619)>>>0;if(y<160)head=Math.imul(head^data[i+k],16777619)>>>0;}if(data[i+3]>=128){count++;if(!x||!y||x===f.width-1||y===f.height-1)edge++;}}
          hashes.push(hash);heads.push(head);counts.push(count);edges.push(edge);frames.push(frame);roots.push(measureHeadRoot(frame,f.width,f.height,r.metadata.bodyHeight));
        }
        let delta=0;for(let n=0;n<frames.length;n++){const a=frames[n],b=frames[(n+1)%frames.length];let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);delta=Math.max(delta,total/(a.length*255));const p=row.frames[n].joints,q=row.frames[(n+1)%frames.length].joints;for(let k=0;k<2;k++)for(const joint of ['hip','knee','ankle'])step.push(Math.hypot(p[k][joint].x-q[k][joint].x,p[k][joint].y-q[k][joint].y)*r.metadata.renderScale);}
        const residual=roots.map((p,n)=>p.y-row.frames[n].bodyBob),span=values=>(Math.max(...values)-Math.min(...values))*r.metadata.renderScale;
        rows[direction]={headSpanX:span(roots.map(p=>p.x)),headSpanY:span(roots.map(p=>p.y)),expectedBobSpan:span(row.frames.map(f=>f.bodyBob)),bobResidual:span(residual),unique:new Set(hashes).size,upperBodyVersions:new Set(heads).size,counts,edges,maxJointStep:Math.max(...step),maxPixelChange:delta};
      }result[id]={body:r.metadata.bodyHeight*r.metadata.renderScale,rows};
    }return result;
  });
  for(const[id,actor]of Object.entries(report.pixels)){
    assert.equal(actor.body,21.28);await page.selectOption('#unit',id);
    for(const[d,row]of Object.entries(actor.rows)){assert.equal(row.unique,16);assert.ok(row.headSpanX<.1);assert.ok(row.headSpanY>0&&Math.abs(row.headSpanY-row.expectedBobSpan)<.12);assert.ok(row.bobResidual<.12);assert.ok(row.maxJointStep<1.25);row.counts.forEach(n=>assert.ok(n>1000));row.edges.forEach(n=>assert.equal(n,0));await page.selectOption('#direction',d);await page.screenshot({path:out+'/'+id+'-'+d+'.png',fullPage:true});
      for(const n of [0,3,7,11,15]){await page.evaluate(n=>{walkReview.state.frame=n;walkReview.render();},n);await page.locator('#comparison').screenshot({path:out+'/'+id+'-'+d+'-'+n+'.png'});}
    }
  }
  await page.click('#next');assert.equal(await page.evaluate(()=>walkReview.state.frame),0);await page.click('#previous');assert.equal(await page.evaluate(()=>walkReview.state.frame),15);
  await page.selectOption('#unit','soldier');assert.equal(await page.inputValue('#fps'),'16');await page.selectOption('#direction','E');
  await page.evaluate(()=>{const g=walkReview.panels[2].c.getContext('2d'),draw=g.drawImage,image=walkReview.actors.soldier.current.image;window.framesSeen=new Set();g.drawImage=function(...args){if(args[0]===image)framesSeen.add(args[1]);return draw.apply(this,args);};walkReview.state.frame=0;walkReview.play(true);});
  await page.waitForTimeout(1600);report.playbackFrames=await page.evaluate(()=>{walkReview.play(false);return framesSeen.size;});assert.equal(report.playbackFrames,16);
  await page.check('#turn');await page.evaluate(()=>{walkReview.state.frame=15.9;walkReview.state.loops=1;walkReview.play(true);});await page.waitForFunction(()=>walkReview.state.direction==='NE');await page.evaluate(()=>walkReview.play(false));await page.uncheck('#turn');
  await page.check('#contacts');await page.screenshot({path:out+'/contacts.png'});await page.uncheck('#contacts');await page.selectOption('#background','night');await page.selectOption('#zoom','1');await page.screenshot({path:out+'/native-night.png'});
  report.mobile=[];for(const dpr of [1,2]){const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-walk.html');await p.waitForFunction(()=>window.walkReview);await p.evaluate(()=>walkReview.play(false));const sampling={dpr,viewport:'mobile',rows:await auditSampling(p)};checkSampling(sampling.rows);report.sampling.push(sampling);const layout=await p.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,headings:document.querySelectorAll('h1').length}));assert.equal(layout.width,390);assert.equal(layout.headings,1);await p.screenshot({path:out+'/mobile-dpr'+dpr+'.png',fullPage:true,scale:'css'});report.mobile.push({dpr,...layout});await c.close();}
  assert.deepEqual(errors,[]);report.browserErrors=errors;report.controls={stepping:true,autoTurn:true,contacts:true,night:true,fps:true,sampling:true};await fs.writeFile(out+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({evidence:out,playback:report.playbackFrames,sampling:report.sampling.map(s=>({dpr:s.dpr,viewport:s.viewport,ratios:s.rows.map(r=>r.temporalAlphaCurvature.ratio)})),pixels:Object.fromEntries(Object.entries(report.pixels).map(([id,a])=>[id,Object.fromEntries(Object.entries(a.rows).map(([d,r])=>[d,{unique:r.unique,headSpanY:r.headSpanY,bobResidual:r.bobResidual,maxJointStep:r.maxJointStep,maxPixelChange:r.maxPixelChange}]))])),mobile:report.mobile,errors}));
}finally{await browser.close();}
