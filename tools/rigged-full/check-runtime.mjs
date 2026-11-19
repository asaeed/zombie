import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';
const output=await fs.mkdtemp(path.join(tmpdir(),'zombie-runtime-check-')),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.stack));page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{window.packDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...a){if(this.canvas.id==='scene')packDraws.push(image.src??'canvas');return draw.call(this,image,...a);};});
 await page.route('**/assets/rigged-full/manifest.json',async route=>{await new Promise(resolve=>setTimeout(resolve,900));await route.continue();});
 await page.goto('http://127.0.0.1:8787/docs/art-directions/rigged-full-world.html');
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>!!window.worldReview),false);assert.deepEqual(await page.evaluate(()=>packDraws),[]);
 await page.waitForFunction(()=>window.worldReview&&ART_PACK_STATE.active==='rigged');
 await page.waitForTimeout(250);
 assert.ok(!requests.some(u=>u.includes('/sculpted-pixel/')||u.includes('/diorama-pilot/')));
 assert.equal(await page.evaluate(()=>ZOMBIE_ART_CACHE.size),0);
 const report={output,startup:{noFallbackFrames:true,noPilotImages:true,noLegacyZombieAtlases:true},errors};
 await page.click('#play');
 const suv=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=1200;c.height=560;const ctx=c.getContext('2d'),r=worldReview.renderer,g=worldReview.game,v=g.vehicles[0],record=sculptedActor('suv'),anchor=record.metadata.footAnchor.y;
  ctx.fillStyle='#91a273';ctx.fillRect(0,0,c.width,c.height);ctx.font='16px system-ui';ctx.fillStyle='#17261b';ctx.textAlign='center';
  for(const [i,d]of record.metadata.directions.entries()){
   const x=(i%4)*300,y=Math.floor(i/4)*280;
   for(const [j,label]of ['Before','Grounded'].entries()){
    const foot={x:x+75+j*150,y:y+210};g.camera={x:(v.x-v.y)*ISO_X*1.8-foot.x,y:(v.x+v.y)*ISO_Y*1.8-foot.y,zoom:1.8};v._artFacing=d;v.waypoints=[];record.metadata.footAnchor.y=j?anchor:87;
    ctx.strokeStyle='#5b704d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(foot.x-65,foot.y);ctx.lineTo(foot.x+65,foot.y);ctx.stroke();r._drawVehicle(ctx,g,v);
    ctx.fillStyle='#17261b';ctx.font='16px system-ui';ctx.textAlign='center';ctx.fillText(d+' '+label,foot.x,y+254);
   }
  }
  record.metadata.footAnchor.y=anchor;return c.toDataURL().split(',')[1];
 });
 await fs.writeFile(output+'/suv-grounding.png',Buffer.from(suv,'base64'));
 await page.goto('http://127.0.0.1:8787/?artPack=rigged');await page.waitForFunction(()=>window._game&&SCULPTED_WORLD.ready);
 const scene=await page.evaluate(()=>{
  const g=_game;g.paused=true;g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));g.fogVisible.fill(1);g.fogExplored.fill(1);g.units=[new Unit('soldier',tileCenterX(40),tileCenterY(40))];g.buildings=[new Building('hq',38,37)];g.zombies=[];g.vehicles=[new Vehicle('suv',tileCenterX(42),tileCenterY(40))];g.caches=[new Cache('bin',39,42),new Cache('car',43,42),new Cache('cabin',38,41)];g.gameTime=DAY_LENGTH*.18;g.waveTimer=10;g.waveActive=false;g.waveDirections=[2];g.alerts=[];g.toasts=[];g.addToast('Wave 10 approaching from South','danger','test');g.toasts[0].t=1;g.camera.zoom=2;centerCameraOn(g.camera,tileCenterX(41),tileCenterY(41),innerWidth,innerHeight);return true;
 });
 await page.waitForTimeout(150);await page.screenshot({path:output+'/compass-world-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{_game.camera.zoom=.8;centerCameraOn(_game.camera,tileCenterX(41),tileCenterY(41),innerWidth,innerHeight);});await page.waitForTimeout(200);await page.screenshot({path:output+'/compass-world-mobile.png'});
 report.compass=await page.evaluate(()=>mapCompass(innerWidth));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://127.0.0.1:8787/docs/art-directions/rigged-full-sprites.html');await page.waitForFunction(()=>window.riggedReview);
 await page.evaluate(()=>{let draws=0;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...a){draws++;return original.apply(this,a);};window.reviewDraws=()=>draws;const spacer=document.createElement('div');spacer.style.height='2000px';document.querySelector('main').append(spacer);window.scrollTo(0,document.body.scrollHeight);});
 await page.waitForTimeout(150);const before=await page.evaluate(()=>({frame:riggedReview.state.frame,draws:reviewDraws()}));await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>({frame:riggedReview.state.frame,draws:reviewDraws()})),before);
 report.hiddenPanels={noAnimation:true,noDraws:true};
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/visual-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
