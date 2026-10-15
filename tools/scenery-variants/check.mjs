import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {chromium} from 'playwright-core';

const input=process.argv[2]||'http://127.0.0.1:8787/';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||await fs.mkdtemp(path.join(os.tmpdir(),'scenery-review-')));
await fs.mkdir(output,{recursive:true});
let url=input,server,browser;
if(!input.startsWith('http')) {
  server=http.createServer(async(req,res)=>{try {
    const p=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(input,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(input+path.sep))throw Error('Invalid path');
    const data=await fs.readFile(file),mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)];
    res.writeHead(200,{'Content-Type':mime||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/`;
}
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('start-game').disabled,null,{timeout:90000});
  const audit=await page.evaluate(()=>{
    const records={},canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
    for(const family of ['pine','bush','rock'])for(const id of sculptedObject(family).metadata.variants) {
      const r=sculptedObject(id),m=r.metadata,c=canvas(m.width,m.height),g=c.getContext('2d',{willReadFrequently:true});
      g.drawImage(r.image,0,0);const day=g.getImageData(0,0,c.width,c.height).data;
      g.clearRect(0,0,c.width,c.height);g.drawImage(r.nightImage,0,0);const night=g.getImageData(0,0,c.width,c.height).data;
      let alphaDifferences=0,edgePixels=0,occupied=0,maxBlendAlphaDifference=0;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++) {
        const i=(y*c.width+x)*4;
        if(day[i+3]!==night[i+3])alphaDifferences++;
        if(day[i+3]) {occupied++;if(!x||!y||x===c.width-1||y===c.height-1)edgePixels++;}
      }
      for(const phase of [.25,.5,.75]) {
        g.clearRect(0,0,c.width,c.height);g.drawImage(worldArtworkImage(r,phase),0,0);
        const blended=g.getImageData(0,0,c.width,c.height).data;
        for(let i=3;i<day.length;i+=4)maxBlendAlphaDifference=Math.max(maxBlendAlphaDifference,Math.abs(day[i]-blended[i]));
      }
      records[id]={width:m.width,height:m.height,displaySize:m.displaySize,alphaDifferences,edgePixels,occupied,maxBlendAlphaDifference};
    }
    return {records,progress:structuredClone(ART_PACK_STATE.progress),objects:SCULPTED_WORLD.objects.size};
  });
  assert.equal(audit.objects,20);assert.deepEqual(audit.progress,{loaded:60,total:60});
  for(const [id,r]of Object.entries(audit.records)) {
    assert.equal(r.alphaDifferences,0,id);assert.equal(r.edgePixels,0,id);assert.ok(r.occupied>500,id);
    assert.ok(r.maxBlendAlphaDifference<=1,`${id}: blend alpha ${r.maxBlendAlphaDifference}`);
  }
  for(const phase of [0,1]) {
    const png=await page.evaluate(phase=>{
      const c=document.createElement('canvas');c.width=1000;c.height=1100;const ctx=c.getContext('2d');
      ctx.fillStyle=phase?'#18252b':'#526343';ctx.fillRect(0,0,c.width,c.height);
      ctx.font='bold 14px monospace';ctx.fillStyle='#eef4ed';ctx.fillText(phase?'NIGHT - 3x and native size':'DAY - 3x and native size',16,24);
      const families=['pine','bush','rock'],starts=[50,570,830],heights=[500,240,220],largeOffsets=[350,140,130];
      for(let row=0;row<families.length;row++) {
        const family=families[row],y=starts[row],height=heights[row];
        sculptedObject(family).metadata.variants.forEach((id,col)=>{
          const r=sculptedObject(id),cx=col*333+166;
          ctx.fillStyle='#eef4ed';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(id,cx,y+12);
          for(const zoom of [3,1]) {
            const foot={x:cx,y:y+(zoom===3?largeOffsets[row]:height-10)};
            const rect=sculptedObjectRect(r,foot,zoom);
            ctx.imageSmoothingEnabled=r.imageSmoothing;ctx.imageSmoothingQuality=r.imageSmoothingQuality;
            ctx.drawImage(worldArtworkImage(r,phase),rect.x,rect.y,rect.width,rect.height);
            ctx.strokeStyle='#d6e9d266';ctx.beginPath();ctx.moveTo(foot.x-16,foot.y);ctx.lineTo(foot.x+16,foot.y);ctx.stroke();
            ctx.fillStyle='#d4dfd0';ctx.font='9px monospace';ctx.fillText(`${zoom}x`,foot.x,foot.y+13);
          }
        });
      }
      return c.toDataURL().split(',')[1];
    },phase);
    await fs.writeFile(path.join(output,phase?'contact-night.png':'contact-day.png'),Buffer.from(png,'base64'));
  }
  await page.locator('#start-game').click();
  await page.evaluate(()=>{
    _input.resetTransient();_game.paused=true;_game.gameTime=60;
    _game.fogVisible.fill(1);_game.fogExplored.fill(1);
    _game.selected=[];_game._selectedBuilding=null;_game.buildMode=null;
  });
  const scenes=[];
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:width===1440?1000:844});
    for(const zoom of (width===1440?[.5,1,2]:[1]))for(const phase of [0,.5,1]) {
      await page.evaluate(({zoom,phase})=>{
        const g=_game;g.gameTime=phase===0?60:DAY_LENGTH-CYCLE_TRANSITION+phase*CYCLE_TRANSITION;
        g.camera.zoom=zoom;centerCameraOn(g.camera,tileCenterX(20),tileCenterY(22),innerWidth,innerHeight);
      },{zoom,phase});
      await page.waitForTimeout(120);
      await page.screenshot({path:path.join(output,`game-${width}-zoom-${zoom}-phase-${phase}.png`)});
      scenes.push({width,zoom,phase});
    }
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'audit.json'),JSON.stringify({url,audit,scenes,errors},null,2));
  console.log(JSON.stringify({output,assets:Object.keys(audit.records),progress:audit.progress,scenes:scenes.length,errors},null,2));
} finally {
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
}
