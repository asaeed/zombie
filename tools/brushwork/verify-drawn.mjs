import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';
const out=await fs.mkdtemp(path.join(tmpdir(),'zombie-drawn-verify-'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']}),report={evidence:out,scope:'SE walk-only alignment experiment; not gameplay replacement',limitations:['Different paint detail and brightness between individually drawn frames.','Drawn poses preferred by user; aligned playback and remaining directions/actions await review.']};
try{
  const context=await browser.newContext({viewport:{width:1180,height:820},deviceScaleFactor:2}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-motion.html');await page.waitForFunction(()=>window.motionReview);
  await page.evaluate(()=>motionReview.play(false));
  report.pilot=await page.evaluate(async()=>{
    const {measureHeadRoot,rootMotion}=await import('/tools/brushwork/alignment.mjs');
    function roots(r){const m=r.metadata,c=document.createElement('canvas');c.width=m.cell.width;c.height=m.cell.height;const g=c.getContext('2d',{willReadFrequently:true});
      const frames=m.frames??m.clips.walk.directions.SE;
      return frames.map(f=>{g.clearRect(0,0,c.width,c.height);g.drawImage(r.image,f.x,f.y,f.width,f.height,0,0,f.width,f.height);return measureHeadRoot(g.getImageData(0,0,c.width,c.height).data,c.width,c.height,m.bodyHeight);});
    }
    const result={};
    for(const[id,rs]of Object.entries(motionReview.records)){
      const r=rs[2],c=document.createElement('canvas');c.width=r.image.width;c.height=r.image.height;const g=c.getContext('2d');g.drawImage(r.image,0,0);const d=g.getImageData(0,0,c.width,c.height).data,hashes=[],ranges=[];
      for(const f of r.metadata.frames){let count=0,edge=0,hash=2166136261,l=f.width,t=f.height,right=0,bottom=0;
        for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const i=((f.y+y)*c.width+f.x+x)*4;hash=Math.imul(hash^((d[i]<<8)|d[i+3]),16777619)>>>0;if(d[i+3]>128){count++;l=Math.min(l,x);t=Math.min(t,y);right=Math.max(right,x);bottom=Math.max(bottom,y);if(!x||!y||x===f.width-1||y===f.height-1)edge++;}}
        hashes.push(hash);ranges.push({count,edge,left:l,top:t,right,bottom});
      }
      result[id]={unique:new Set(hashes).size,ranges,body:r.metadata.bodyHeight*r.metadata.renderScale,
        alignment:{before:rootMotion(roots(rs[1]),rs[1].metadata.renderScale),after:rootMotion(roots(r),r.metadata.renderScale),roots:roots(r)}};
    }
    const contrast=[];
    for(let index=0;index<2;index++){
      const r=motionReview.baselines.soldier[index?'mesh':'original'],m=r.metadata,f=m.clips.walk.directions.SE[0],c=document.createElement('canvas');c.width=120;c.height=140;const g=c.getContext('2d');g.imageSmoothingEnabled=index===0;
      const scale=m.renderScale*2*2;g.drawImage(r.image,f.x,f.y,f.width,f.height,60-m.footAnchor.x*scale,130-m.footAnchor.y*scale,f.width*scale,f.height*scale);
      const d=g.getImageData(0,0,c.width,c.height).data;let sum=0,n=0,soft=0,opaque=0;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width-1;x++){const i=(y*c.width+x)*4,j=i+4;if(d[i+3]>200&&d[j+3]>200){for(let k=0;k<3;k++)sum+=Math.abs(d[i+k]-d[j+k]);n+=3;}if(d[i+3]>128)opaque++;if(d[i+3]>0&&d[i+3]<200)soft++;}
      contrast.push({kind:index?'sharp':'original',meanAdjacentRGB:sum/n,softPixels:soft,occupiedPixels:opaque});
    }
    const scout=motionReview.baselines.soldier.scout;
    return {...result,contrast,scout:rootMotion(roots(scout),scout.metadata.renderScale)};
  });
  for(const id of ['soldier','walker']){const actor=report.pilot[id];assert.equal(actor.unique,8);assert.equal(actor.body,21.28);actor.ranges.forEach(r=>{assert.ok(r.count>1000);assert.equal(r.edge,0);});
    assert.ok(actor.alignment.after.maxStep<.1);assert.ok(actor.alignment.after.maxStep<actor.alignment.before.maxStep*.05);assert.ok(actor.alignment.after.wrapStep<.05);
    assert.ok(actor.alignment.after.maxStep<report.pilot.scout.maxStep);
    await page.selectOption('#unit',id);await page.screenshot({path:out+'/'+id+'-compare.png',fullPage:true});
    for(let n=0;n<8;n++){await page.evaluate(n=>{motionReview.state.frame=n;motionReview.render();},n);await page.screenshot({path:out+'/'+id+'-frame-'+n+'.png'});}
  }
  await page.click('#next');assert.equal(await page.evaluate(()=>motionReview.state.frame),0);await page.click('#previous');assert.equal(await page.evaluate(()=>motionReview.state.frame),7);
  await page.click('#play');await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>motionReview.state.playing),true);assert.notEqual(await page.evaluate(()=>motionReview.state.frame),7);await page.evaluate(()=>motionReview.play(false));
  for(const [reference,title]of [['original','Original (filtered)'],['mesh','Sharp (mesh)'],['scout','Scout Reference']]){await page.selectOption('#reference',reference);assert.equal(await page.locator('#comparison h2').first().textContent(),title);}
  await page.selectOption('#unit','soldier');await page.check('#anchors');await page.screenshot({path:out+'/alignment-guides.png'});await page.uncheck('#anchors');
  await page.evaluate(()=>{const g=motionReview.panels[0].c.getContext('2d'),original=g.drawImage,scout=motionReview.baselines.soldier.scout.image;window.scoutFramesSeen=new Set();g.drawImage=function(...args){if(args[0]===scout)scoutFramesSeen.add(args[1]);return original.apply(this,args);};motionReview.state.frame=0;motionReview.play(true);});
  await page.waitForTimeout(1200);report.scoutPlaybackFrames=await page.evaluate(()=>{motionReview.play(false);return scoutFramesSeen.size;});assert.equal(report.scoutPlaybackFrames,12);
  await page.selectOption('#zoom','1');await page.selectOption('#background','night');await page.screenshot({path:out+'/native-night.png'});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/mobile-compare.png',fullPage:true});report.reviewControls=true;
  await page.setViewportSize({width:1180,height:820});
  await page.goto('http://127.0.0.1:8787/?artPack=brushwork');await page.waitForFunction(()=>window._game&&SCULPTED_WORLD.ready&&ART_PACK_STATE.active==='brushwork');
  report.retina=await page.evaluate(()=>{
    _game.paused=true;const c=document.getElementById('canvas'),r=c.getBoundingClientRect(),t=c.getContext('2d').getTransform();
    return {dpr:devicePixelRatio,physical:[c.width,c.height],css:[r.width,r.height],transform:[t.a,t.d],body:sculptedActor('soldier').metadata.bodyHeight*sculptedActor('soldier').metadata.renderScale};
  });
  assert.deepEqual(report.retina.physical,[2360,1640]);assert.deepEqual(report.retina.css,[1180,820]);assert.deepEqual(report.retina.transform,[2,2]);assert.equal(report.retina.body,21.28);
  const pos=await page.evaluate(()=>{const g=_game;g.units=[];g.zombies=[];g.vehicles=[];g.caches=[];g.bundles=[];g.projectiles=[];g.buildings=[new Building('hq',35,35)];g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));g.fogVisible.fill(1);g.fogExplored.fill(1);g.supplies=0;g.waveTimer=10000;g.flowDirty=true;g.gameTime=DAY_LENGTH*.18;const u=g.spawnUnit('soldier',tileCenterX(36),tileCenterY(40));const cache=new Cache('bin',36,42);cache.searched=true;cache.amount=180;g.caches=[cache];centerCameraOn(g.camera,u.x,u.y+TILE,innerWidth,innerHeight);const s=worldToScreen(u.x,u.y,g.camera);return {x:s.x,y:s.y-14*g.camera.zoom};});
  await page.waitForTimeout(100);await page.mouse.click(pos.x,pos.y);assert.equal(await page.evaluate(()=>_game.selected[0]?.type),'soldier');
  const cachePos=await page.evaluate(()=>{const c=_game.caches[0],s=worldToScreen((c.tileX+1)*TILE,(c.tileY+1)*TILE,_game.camera),r=sculptedObjectRect(sculptedObject('bin'),s,_game.camera.zoom);return {x:s.x,y:r.y-8*_game.camera.zoom};});
  await page.mouse.click(cachePos.x,cachePos.y,{button:'right'});assert.ok(await page.evaluate(()=>!!_game.selected[0].gatherCenter));
  const cargo=await page.evaluate(()=>{const g=_game,u=g.selected[0];let peak=0;for(let n=0;n<1000;n++){g.update(.05);peak=Math.max(peak,u.carrying);if(g.supplies>=20)break;}return {peak,delivered:g.supplies};});assert.equal(cargo.peak,20);assert.ok(cargo.delivered>=20);report.retina.gathering=cargo;
  await page.screenshot({path:out+'/retina-game.png'});
  const menu=await page.evaluate(()=>mainMenuButtonRect(innerWidth));await page.mouse.click(menu.x+menu.w/2,menu.y+menu.h/2);await page.waitForFunction(()=>_input.menuOpen&&!document.getElementById('graphics-setting').hidden);
  const panel=await page.evaluate(()=>{const p=mainMenuPanelRect(innerWidth),r=document.getElementById('graphics-setting').getBoundingClientRect();return {expected:p.x+14,actual:r.x};});assert.equal(panel.actual,panel.expected);report.retina.menuLogicalCoordinates=true;
  await page.screenshot({path:out+'/retina-menu.png'});
  await page.setViewportSize({width:980,height:700});assert.deepEqual(await page.evaluate(()=>[document.getElementById('canvas').width,document.getElementById('canvas').height]),[1960,1400]);report.retina.resize=true;
  await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-world.html');await page.waitForFunction(()=>window.worldReview&&SCULPTED_WORLD.ready);
  for(const light of ['day','night']){await page.selectOption('#light',light);await page.evaluate(()=>{worldReview.state.playing=false;worldReview.game.camera.zoom=2;worldReview.renderer.resize();worldReview.render();});await page.screenshot({path:out+'/retina-outpost-'+light+'.png'});}
  assert.deepEqual(errors,[]);report.browserErrors=errors;await fs.writeFile(out+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
