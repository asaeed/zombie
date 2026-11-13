import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const output=await fs.mkdtemp(path.join(tmpdir(),'zombie-runtime-profile-')),phase=process.argv[2]??'current';
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/docs/art-directions/rigged-full-world.html');
 await page.waitForFunction(()=>window.worldReview&&ART_PACK_STATE.active==='rigged'&&SCULPTED_WORLD.ready);
 const report={output,phase,viewport:{width:1440,height:1000,dpr:2},conditions:{warmupMs:800,sampleMs:1600,gameSimulationPaused:true},demo:{},game:{},errors};
 await page.waitForTimeout(800);
 const sample=async(mode)=>await page.evaluate(async mode=>{
  const r=Renderer.prototype,samples={},methods=['_drawTiles','_drawEntities','_addEnvironment','_drawUnit','_drawZombie','_drawActorSprite','_drawLighting'],originals={};
  for(const name of methods){originals[name]=r[name];r[name]=function(...args){const t=performance.now(),result=originals[name].apply(this,args);(samples[name]??=[]).push(performance.now()-t);return result;};}
  let count=0;const canvas=CanvasRenderingContext2D.prototype,draw=canvas.drawImage;canvas.drawImage=function(...a){count++;return draw.apply(this,a);};
  const intervals=[];let last;
  await new Promise(resolve=>{const start=performance.now();function tick(t){if(last)intervals.push(t-last);last=t;if(t-start>1600)return resolve();requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  for(const name of methods)r[name]=originals[name];canvas.drawImage=draw;
  const statistics=values=>{values.sort((a,b)=>a-b);return {count:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)]};};
  return {mode,frames:intervals.length,fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),intervals:statistics(intervals),draws:count,stages:Object.fromEntries(Object.entries(samples).map(([n,a])=>[n,statistics(a)]))};
 },mode);
 report.demo.day=await sample('demo-day');
 await page.selectOption('#light','night');report.demo.night=await sample('demo-night');
 await page.selectOption('#light','day');
 const scene=await page.evaluate(()=>worldReview.game.toSaveData());
 await page.evaluate(()=>{worldReview.state.playing=false;worldReview.state.motion='idle';worldReview.state.time=0;worldReview.render();});
 await page.screenshot({path:output+'/'+phase+'-demo.png'});
 await page.goto('http://127.0.0.1:8787/docs/art-directions/rigged-full-sprites.html');
 await page.waitForFunction(()=>window.riggedReview);
 await page.evaluate(()=>{riggedReview.play(false);riggedReview.state.type='soldier';riggedReview.state.action='idle';riggedReview.state.frame=0;riggedReview.choose();});
 await page.screenshot({path:output+'/'+phase+'-directions.png',fullPage:true});
 await page.goto('http://127.0.0.1:8787/?artPack=rigged');
 await page.waitForFunction(()=>window._game&&ART_PACK_STATE.active==='rigged'&&SCULPTED_WORLD.ready);
 await page.evaluate(data=>{localStorage.setItem('dead-zone-rts:auto',JSON.stringify({data}));_loadAutoSave();_game.paused=true;_game.fogVisible.fill(1);_game.fogExplored.fill(1);centerCameraOn(_game.camera,tileCenterX(39.5),tileCenterY(41.5),innerWidth,innerHeight);},scene);
 await page.waitForTimeout(800);
 report.game.day=await sample('game-day');
 await page.evaluate(()=>{_game.gameTime=DAY_LENGTH+NIGHT_LENGTH*.4;});report.game.night=await sample('game-night');
 await fs.writeFile(output+'/'+phase+'-profile.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
