import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {chromium} from 'playwright-core';

const dir=process.env.BENCH_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(),'dead-zone-bench-'));
const input=process.argv[2]||'http://127.0.0.1:8787/', label=process.argv[3]||'current';
if(!/^[\w-]+$/.test(label))throw Error('Use a simple filename prefix for the benchmark label');
await fs.mkdir(dir,{recursive:true});
console.log(`Benchmark evidence: ${dir}`);
let url=input,server,browser;
if(!input.startsWith('http')){
  server=http.createServer(async(req,res)=>{try{
    const p=decodeURIComponent(new URL(req.url,'http://local').pathname),f=path.resolve(input,'.'+(p==='/'?'/index.html':p));
    if(!f.startsWith(input+path.sep))throw Error('Path');
    const bytes=await fs.readFile(f),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(f)];
    res.writeHead(200,{'Content-Type':mime||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/`;
}
try{
  const chrome=process.env.CHROME_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
  browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:Number(process.env.BENCH_DPR)||2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('start-game').disabled,null,{timeout:90000});
  await page.evaluate(()=>{
    window.benchRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0;
    const render=Renderer.prototype.render;
    Renderer.prototype.render=function(...args){window.benchRenderer=this;return render.apply(this,args);};
    const samples=window.benchMethods={};
    for(const [proto,names] of [[Renderer.prototype,['_drawTiles','_paintTiles','_drawEntities','_addEnvironment','_drawLighting','_drawMinimap']],
      [Game.prototype,['_recomputeFog','zombieSpeed','moveGroundEntity']]]){
      for(const name of names){const fn=proto[name];proto[name]=function(...args){
        const start=performance.now();try{return fn.apply(this,args);}finally{const s=samples[name]??={ms:0,calls:0};s.ms+=performance.now()-start;s.calls++;}
      };}
    }
    window.benchScene=(mode)=>{
      const g=new Game();g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));
      g.buildings=[new Building('hq',39,39)];
      for(let i=0;i<48;i++)g.buildings.push(new Building(i%5===0?'tower':'wall',25+(i%12)*3,25+Math.floor(i/12)*4));
      for(let i=0;i<44;i++)g.caches.push(new Cache(['car','cabin','bin'][i%3],21+(i%11)*4,46+Math.floor(i/11)*3));
      for(let i=0;i<180;i++)g.units.push(new Unit(i%3?'soldier':'medic',tileCenterX(30+i%20),tileCenterY(34+Math.floor(i/20))));
      for(let i=0;i<500;i++){
        const z=new Zombie(i%10===0?'brute':'walker',tileCenterX(25+i%32),tileCenterY(46+Math.floor(i/32)*.55));
        z.dormant=mode==='idle';g.zombies.push(z);
      }
      g.fogVisible.fill(1);g.fogExplored.fill(1);
      const fog=g._recomputeFog;g._recomputeFog=function(){fog.call(this);this.fogVisible.fill(1);this.fogExplored.fill(1);};
      g._rebuildFlowField();g.supplies=100000;g.gameTime=mode==='night'?DAY_LENGTH+30:60;
      g.camera.zoom=.85;centerCameraOn(g.camera,tileCenterX(40),tileCenterY(43),innerWidth,innerHeight);
      _input.game=g;_input.resetTransient();g.paused=true;window._game=g;window.benchMode=mode;
      for(const sample of Object.values(benchMethods)){sample.ms=0;sample.calls=0;}
      return {units:g.units.length,zombies:g.zombies.length,buildings:g.buildings.length,caches:g.caches.length};
    };
  });
  await page.locator('#start-game').click();
  const client=await context.newCDPSession(page);await client.send('Profiler.enable');
  const scenarios=[];
  for(const mode of ['idle','crowd','pan','night']){
    const counts=await page.evaluate(mode=>benchScene(mode),mode);
    await client.send('Profiler.start');
    const report=await page.evaluate(async()=>{
      const updates=[],renders=[],frames=[];let previous;
      for(let frame=0;frame<100;frame++){
        const ts=await new Promise(benchRAF);
        if(frame>=10&&previous!==undefined)frames.push(ts-previous);previous=ts;
        const start=performance.now();
        if(benchMode==='idle')_game.gameTime+=1/60;else _game.update(1/60);
        const middle=performance.now();
        if(benchMode==='pan')_game.camera.x+=3;
        benchRenderer.render(_game,_input);
        const end=performance.now();
        if(frame>=10){updates.push(middle-start);renders.push(end-middle);}
      }
      const stats=xs=>{xs.sort((a,b)=>a-b);return {mean:xs.reduce((a,b)=>a+b,0)/xs.length,p50:xs[Math.floor(xs.length*.5)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)};};
      const saves=[];for(let i=0;i<6;i++){const t=performance.now();localStorage.setItem('bench-save',JSON.stringify(_game.toSaveData()));saves.push(performance.now()-t);}
      return {update:stats(updates),render:stats(renders),frame:stats(frames),save:stats(saves),
        spriteCache:{entries:benchRenderer._actorRasters?.size||0,bytes:(benchRenderer._actorRasterPixels||0)*4},
        methods:structuredClone(benchMethods)};
    });
    const {profile}=await client.send('Profiler.stop');
    const nodes=new Map(profile.nodes.map(n=>[n.id,n])),hot={};
    for(let i=0;i<(profile.samples?.length||0);i++){
      const node=nodes.get(profile.samples[i]),name=node.callFrame.functionName||'(anonymous)';
      hot[name]=(hot[name]||0)+(profile.timeDeltas[i]||0)/1000;
    }
    report.hot=Object.entries(hot).sort((a,b)=>b[1]-a[1]).slice(0,18);
    scenarios.push({mode,counts,...report});
    console.log(JSON.stringify({mode,update:report.update,render:report.render,frame:report.frame,hot:report.hot.slice(0,8)}));
    await fs.writeFile(`${dir}/${label}-${mode}.cpuprofile`,JSON.stringify(profile));
    await page.screenshot({path:`${dir}/${label}-${mode}.png`});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${dir}/${label}.json`,JSON.stringify({url,scenarios,errors},null,2));
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
