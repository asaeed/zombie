import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';
const out=await fs.mkdtemp(path.join(tmpdir(),'zombie-walk-r2-verify-')),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']}),report={evidence:out,scope:'four-facing walk-only review; no gameplay replacement'};
try{
  const context=await browser.newContext({viewport:{width:1180,height:900},deviceScaleFactor:2}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-walk-r2.html');await page.waitForFunction(()=>window.walkReview);await page.evaluate(()=>walkReview.play(false));
  report.pixels=await page.evaluate(async()=>{
    const {measureHeadRoot,rootMotion}=await import('/tools/brushwork/alignment.mjs'),result={};
    for(const [id,a]of Object.entries(walkReview.actors)){
      const r=a.current,c=document.createElement('canvas');c.width=r.image.width;c.height=r.image.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(r.image,0,0);const data=g.getImageData(0,0,c.width,c.height).data,rows={};g.clearRect(0,0,c.width,c.height);g.drawImage(a.ungraded.image,0,0);const raw=g.getImageData(0,0,c.width,c.height).data;let alphaMismatch=0;for(let n=3;n<data.length;n+=4)if(data[n]!==raw[n])alphaMismatch++;
      for(const [direction,d]of Object.entries(r.metadata.directions)){
        const ranges=[],hashes=[],roots=[],body=240,m=r.metadata;
        for(const f of d.frames){const frame=new Uint8ClampedArray(f.width*f.height*4);let count=0,edge=0,hash=2166136261,grey=0;
          for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const i=((f.y+y)*c.width+f.x+x)*4,j=(y*f.width+x)*4;frame.set(data.subarray(i,i+4),j);for(let k=0;k<4;k++)hash=Math.imul(hash^data[i+k],16777619)>>>0;if(data[i+3]>=128){count++;if(!x||!y||x===f.width-1||y===f.height-1)edge++;if(data[i]===data[i+1]&&data[i]===data[i+2])grey++;}}
          ranges.push({count,edge,grey});hashes.push(hash);roots.push(measureHeadRoot(frame,f.width,f.height,body));
        }
        rows[direction]={ranges,unique:new Set(hashes).size,root:rootMotion(roots,m.renderScale),headWidths:roots.map(r=>r.headWidth),color:{beforeRange:Math.max(...d.frames.map(f=>f.color.before.mean))-Math.min(...d.frames.map(f=>f.color.before.mean)),afterRange:Math.max(...d.frames.map(f=>f.color.after.mean))-Math.min(...d.frames.map(f=>f.color.after.mean))}};
      }
      result[id]={body:r.metadata.bodyHeight*r.metadata.renderScale,alphaMismatch,rows};
    }
    return result;
  });
  for(const [id,a]of Object.entries(report.pixels)){
    assert.equal(a.body,21.28);assert.equal(a.alphaMismatch,0);await page.selectOption('#unit',id);
    for(const [direction,row]of Object.entries(a.rows)){
      assert.equal(row.unique,12);assert.ok(row.root.maxStep<.1);assert.ok(row.root.wrapStep<.1);row.ranges.forEach(r=>{assert.ok(r.count>1000);assert.equal(r.edge,0);if(id==='walker')assert.equal(r.grey,r.count);});
      assert.ok(row.color.afterRange<.02);
      await page.selectOption('#direction',direction);await page.screenshot({path:out+'/'+id+'-'+direction+'-compare.png',fullPage:true});
      for(const n of [0,5,11]){await page.evaluate(n=>{walkReview.state.frame=n;walkReview.render();},n);await page.screenshot({path:out+'/'+id+'-'+direction+'-frame-'+n+'.png'});}
    }
  }
  await page.click('#next');assert.equal(await page.evaluate(()=>walkReview.state.frame),0);await page.click('#previous');assert.equal(await page.evaluate(()=>walkReview.state.frame),11);
  await page.selectOption('#unit','soldier');assert.equal(await page.inputValue('#fps'),'16');await page.selectOption('#direction','SE');await page.uncheck('#palette');await page.screenshot({path:out+'/ungraded-compare.png'});await page.check('#palette');
  await page.check('#anchors');await page.screenshot({path:out+'/anchor-guides.png'});await page.uncheck('#anchors');
  await page.evaluate(()=>{const g=walkReview.panels[2].c.getContext('2d'),original=g.drawImage,im=walkReview.actors.soldier.current.image;window.framesSeen=new Set();g.drawImage=function(...args){if(args[0]===im)framesSeen.add(args[1]);return original.apply(this,args);};walkReview.state.frame=0;walkReview.play(true);});
  await page.waitForTimeout(1200);report.playbackFrames=await page.evaluate(()=>{walkReview.play(false);return framesSeen.size;});assert.equal(report.playbackFrames,12);
  await page.check('#turn');await page.evaluate(()=>{walkReview.state.frame=11.9;walkReview.state.loops=1;walkReview.play(true);});await page.waitForFunction(()=>walkReview.state.direction==='E');await page.evaluate(()=>walkReview.play(false));await page.uncheck('#turn');report.autoTurn=true;
  await page.selectOption('#zoom','1');await page.selectOption('#background','night');await page.screenshot({path:out+'/native-night.png'});
  report.mobile=[];
  for(const dpr of [1,2]){
    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr}),p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-walk-r2.html');await p.waitForFunction(()=>window.walkReview);await p.evaluate(()=>walkReview.play(false));
    const layout=await p.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,headings:document.querySelectorAll('h1').length,controls:Array.from(document.querySelectorAll('.controls label,.controls button')).map(e=>e.getBoundingClientRect().toJSON())}));
    assert.ok(layout.width<=layout.viewport);assert.equal(layout.headings,1);layout.controls.forEach(r=>{assert.ok(r.left>=0);assert.ok(r.right<=layout.viewport);});
    report.mobile.push({dpr,...layout});await p.screenshot({path:out+'/mobile-dpr'+dpr+'.png',fullPage:true,scale:'css'});await mobile.close();
  }
  const dpr1=await browser.newContext({viewport:{width:1180,height:900},deviceScaleFactor:1}),p1=await dpr1.newPage();await p1.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-walk-r2.html');await p1.waitForFunction(()=>window.walkReview);await p1.evaluate(()=>walkReview.play(false));await p1.screenshot({path:out+'/desktop-dpr1.png',fullPage:true});await dpr1.close();
  assert.deepEqual(errors,[]);report.browserErrors=errors;report.controls={stepping:true,paletteToggle:true,anchors:true,dayNight:true,mobileFit:true,dpr:[1,2]};await fs.writeFile(out+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
