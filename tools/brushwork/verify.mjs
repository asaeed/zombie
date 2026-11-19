import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {buildPages} from '../build-pages.mjs';
const evidence=await fs.mkdtemp(path.join(tmpdir(),'zombie-brushwork-verify-'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const report={evidence,atlases:{},reviews:{},game:{},limitations:[
  'First-pass painted animation candidate; user appearance and motion review pending.',
  'Soldier/walker have painted contact/strike sources. Other actors use restrained baked texture rigs, not individually painted frames.',
  'Some generated direction/weapon poses still merit visual refinement; frame uniqueness is not an aesthetic guarantee.',
  'Legacy mobile game HUD remains crowded; the two new review pages are responsive.',
  'Local only; no commit, push or GitHub Pages publication performed.'
]};
const snapshot=()=>{const data=_game.toSaveData();delete data.savedAt;return JSON.stringify(data);};
try{
  await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-sprites.html');await page.waitForFunction(()=>window.brushReview);
  await page.evaluate(()=>brushReview.play(false));
  report.atlases=await page.evaluate(()=>{
    const result={};
    for(const[id,{image,metadata}]of Object.entries(brushReview.records)){
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
      const pixels=g.getImageData(0,0,c.width,c.height).data;let count=0,blank=0,edges=0;const uniqueWalk={};
      for(const[action,clip]of Object.entries(metadata.clips))for(const[d,frames]of Object.entries(clip.directions)){
        const hashes=new Set();
        for(const f of frames){
          let occupied=0,edge=false,hash=2166136261;
          for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
            const i=((f.y+y)*c.width+f.x+x)*4;
            hash=Math.imul(hash^((pixels[i]<<8)|pixels[i+3]),16777619)>>>0;
            if(pixels[i+3]>128){occupied++;if(!x||!y||x===f.width-1||y===f.height-1)edge=true;}
          }
          count++;if(!occupied)blank++;if(edge)edges++;hashes.add(hash);
        }
        if(action==='walk')uniqueWalk[d]=hashes.size;
      }
      result[id]={frames:count,blank,edges,uniqueWalk,bodyPixels:metadata.bodyHeight*metadata.renderScale};
    }
    return result;
  });
  assert.equal(Object.keys(report.atlases).length,18);
  await fs.writeFile(evidence+'/atlas-audit.json',JSON.stringify(report.atlases,null,2)+'\n');
  for(const [id,r]of Object.entries(report.atlases)){assert.equal(r.blank,0,id+' blank frames');assert.equal(r.edges,0,id+' clipped frames');for(const [d,n]of Object.entries(r.uniqueWalk))assert.equal(n,12,id+'/'+d+' walk phases');}
  report.totalFrames=Object.values(report.atlases).reduce((n,r)=>n+r.frames,0);
  for(const[id,action]of[['soldier','walk'],['soldier','gather'],['walker','attack'],['runner','walk'],['medic','heal'],['builder','repair'],['sniper','shoot']]){
    await page.selectOption('#unit',id);await page.selectOption('#action',action);await page.evaluate(()=>{brushReview.state.frame=3;brushReview.render();});
    await page.screenshot({path:evidence+`/sprite-${id}-${action}.png`,fullPage:true});
  }
  const beforeFrame=await page.evaluate(()=>brushReview.state.frame);await page.click('#next');assert.equal(await page.evaluate(()=>brushReview.state.frame),beforeFrame+1);
  await page.click('#play');await page.waitForTimeout(90);assert.equal(await page.evaluate(()=>brushReview.state.playing),true);await page.evaluate(()=>brushReview.play(false));
  await page.selectOption('#background','night');await page.screenshot({path:evidence+'/sprites-night.png'});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:evidence+'/sprites-mobile.png',fullPage:true});report.reviews.spriteControls=true;report.reviews.spriteMobileFits=true;
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:8787/docs/art-directions/brushwork-world.html');await page.waitForFunction(()=>window.worldReview&&ART_PACK_STATE.active==='brushwork'&&SCULPTED_WORLD.ready);
  await page.evaluate(()=>{worldReview.state.playing=false;worldReview.state.time=.25;worldReview.game.camera.zoom=1;worldReview.renderer.resize();worldReview.render();});
  const worldPixels=await page.evaluate(()=>{
    const objects={};for(const[id,r]of SCULPTED_WORLD.objects){let occupied=0,edge=0;const w=r.metadata.width,h=r.metadata.height;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(r.alpha[(y*w+x)*4+3]>128){occupied++;if(!x||!y||x===w-1||y===h-1)edge++;}objects[id]={occupied,edge};}
    const r=SCULPTED_WORLD.terrain,c=document.createElement('canvas');c.width=r.image.width;c.height=r.image.height;const g=c.getContext('2d');g.drawImage(r.image,0,0);const pixels=g.getImageData(0,0,c.width,c.height).data;
    const terrain=r.metadata.frames.map(f=>{const colors=new Set();let occupied=0;for(let y=0;y<32;y++)for(let x=0;x<64;x++){const i=((f.y+y)*c.width+f.x+x)*4;if(pixels[i+3]>128)occupied++;if(pixels[i+3]===255)colors.add('#'+[pixels[i],pixels[i+1],pixels[i+2]].map(n=>n.toString(16).padStart(2,'0')).join(''));}return {type:f.type,variant:f.variant,occupied,colors:[...colors],palette:r.metadata.palette[f.type]};});
    return {objects,terrain};
  });
  for(const r of Object.values(worldPixels.objects)){assert.ok(r.occupied>100);assert.equal(r.edge,0);}
  for(const r of worldPixels.terrain){assert.ok(r.occupied>=900);assert.ok(r.colors.length<=2);r.colors.forEach(c=>assert.ok(r.palette.includes(c)));}
  report.worldPixels=worldPixels;
  for(const light of ['day','night']){await page.selectOption('#light',light);await page.screenshot({path:evidence+`/outpost-${light}-native.png`});}
  await page.selectOption('#light','day');
  for(const state of ['walk','strike','work'])for(const facing of ['S','SE','E','NE','N','NW','W','SW']){await page.selectOption('#motion',state);await page.selectOption('#facing',facing);}
  await page.selectOption('#pack','sculpted');await page.waitForFunction(()=>ART_PACK_STATE.active==='sculpted');
  await page.selectOption('#pack','brushwork');await page.waitForFunction(()=>ART_PACK_STATE.active==='brushwork');report.reviews.wholePackComparison=true;
  const scene=await page.evaluate(()=>worldReview.game.toSaveData());
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:evidence+'/outpost-mobile.png'});report.reviews.worldMobileFits=true;
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:8787/?artPack=brushwork');await page.waitForFunction(()=>window._game&&ART_PACK_STATE.active==='brushwork'&&SCULPTED_WORLD.ready);
  await page.evaluate(data=>{
    localStorage.setItem('dead-zone-rts:auto',JSON.stringify({data}));_loadAutoSave();_game.paused=true;_game.gameTime=DAY_LENGTH*.18;
    _game.fogVisible.fill(1);_game.fogExplored.fill(1);_game.zombies.filter(z=>z.type==='walker').forEach((z,i)=>z._artVariant=i%4);
    centerCameraOn(_game.camera,tileCenterX(39.5),tileCenterY(41.5),innerWidth,innerHeight);
    window.artDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage,seen=new Set();
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
      if(image.src?.includes('/assets/brushwork/')&&!seen.has(image.src)){seen.add(image.src);artDraws.push({src:image.src.split('/').at(-1),args});}
      return draw.call(this,image,...args);
    };
  },scene);
  await page.waitForFunction(()=>artDraws.some(d=>d.src==='boss.png'));
  await page.screenshot({path:evidence+'/game-crowded-day.png'});
  report.game.drawTypes=await page.evaluate(()=>[...new Set(artDraws.map(d=>d.src))]);
  report.game.scales=await page.evaluate(()=>Object.fromEntries([...SCULPTED_WORLD.characters].map(([id,r])=>{const d=artDraws.find(d=>d.src===id+'.png');return [id,{actual:d?.args[6]/d?.args[2]/_game.camera.zoom,expected:r.metadata.renderScale}];})));
  for(const r of Object.values(report.game.scales))assert.ok(Math.abs(r.actual-r.expected)<1e-8);
  const selected=await page.evaluate(()=>{const u=_game.units[0];u.selected=true;u.carrying=13;_game.selected=[u];return u.id;});
  const menu=await page.evaluate(()=>mainMenuButtonRect(innerWidth));await page.mouse.click(menu.x+menu.w/2,menu.y+menu.h/2);
  await page.waitForFunction(()=>_input.menuOpen&&_game.paused&&!document.getElementById('graphics-setting').hidden);
  const savedBefore=await page.evaluate(snapshot),time=await page.evaluate(()=>_game.gameTime);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>_game.gameTime),time);
  for(const pack of ['sculpted','classic','brushwork']){await page.selectOption('#graphics-pack',pack);await page.waitForFunction(pack=>ART_PACK_STATE.active===pack,pack);assert.equal(await page.evaluate(snapshot),savedBefore);}
  assert.equal(await page.evaluate(()=>sculptedActor('soldier').image.src.includes('/assets/brushwork/')),true);
  await page.screenshot({path:evidence+'/game-menu.png'});await page.evaluate(()=>{_saveGameNow();_input.setMenuOpen(false);});
  await page.goto('http://127.0.0.1:8787/');await page.waitForFunction(()=>window._game&&ART_PACK_STATE.active==='brushwork'&&SCULPTED_WORLD.ready);
  assert.equal(await page.evaluate(()=>_game.selected[0]?.id),selected);assert.equal(await page.evaluate(()=>_game.selected[0]?.carrying),13);
  report.game.menuPause=true;report.game.atomicSwitchPreservesState=true;report.game.preferenceRefresh=true;report.game.saveRestoration=true;
  const positions=await page.evaluate(()=>{
    const g=_game;g.units=[];g.zombies=[];g.vehicles=[];g.caches=[];g.bundles=[];g.projectiles=[];
    g.buildings=[new Building('hq',35,35)];g.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));g.supplies=0;g.waveTimer=10000;g.waveActive=false;g.zombiesToSpawn=[];g.flowDirty=true;
    g.fogVisible.fill(1);g.fogExplored.fill(1);g.gameTime=DAY_LENGTH*.18;
    const u=g.spawnUnit('soldier',tileCenterX(36),tileCenterY(40)),cache=new Cache('bin',36,42);cache.searched=true;cache.amount=180;g.caches=[cache];
    centerCameraOn(g.camera,u.x,u.y+TILE,innerWidth,innerHeight);const us=worldToScreen(u.x,u.y,g.camera),foot=worldToScreen((cache.tileX+1)*TILE,(cache.tileY+1)*TILE,g.camera),r=sculptedObjectRect(sculptedObject('bin'),foot,g.camera.zoom);
    return {unit:{x:us.x,y:us.y-14*g.camera.zoom},cache:{x:foot.x,y:r.y-8*g.camera.zoom}};
  });
  await page.mouse.click(positions.unit.x,positions.unit.y);assert.equal(await page.evaluate(()=>_game.selected[0]?.type),'soldier');
  await page.mouse.click(positions.cache.x,positions.cache.y,{button:'right'});
  report.game.gathering=await page.evaluate(()=>{const g=_game,u=g.units[0],commanded=u.gatherTarget===g.caches[0]&&!!u.gatherCenter;let peak=0;for(let n=0;n<1000;n++){g.update(.05);peak=Math.max(peak,u.carrying);if(g.supplies>=20)break;}return {commanded,peak,delivered:g.supplies,capacity:u.carryCapacity,autoGather:!!u.gatherCenter};});
  assert.equal(report.game.gathering.commanded,true);assert.equal(report.game.gathering.peak,20);assert.ok(report.game.gathering.delivered>=20);assert.equal(report.game.gathering.autoGather,true);
  await page.screenshot({path:evidence+'/game-gathering.png'});
  const pixels=await page.evaluate(()=>{const d=document.getElementById('canvas').getContext('2d').getImageData(0,0,innerWidth,innerHeight).data;let n=0;for(let i=0;i<d.length;i+=16)if(d[i]+d[i+1]+d[i+2]>60)n++;return n;});assert.ok(pixels>10000);report.game.nonblankPixels=pixels;
  const output=await fs.mkdtemp(path.join(tmpdir(),'zombie-brushwork-pages-'));report.export=await buildPages(output);
  const exported=JSON.parse(await fs.readFile(output+'/assets/brushwork/manifest.json','utf8'));
  for(const m of [...Object.values(exported.characters),...Object.values(exported.objects),exported.terrain])assert.ok((await fs.stat(output+'/assets/brushwork/'+m.image)).size>0);
  await assert.rejects(fs.access(output+'/assets/brushwork/source'));report.export.sourceExcluded=true;
  const fingerprints=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11)??'/private/tmp/zombie-brushwork/original-hashes.json';
  try{const hashes=JSON.parse(await fs.readFile(fingerprints,'utf8'));for(const [rel,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(await fs.readFile(new URL('../../'+rel,import.meta.url))).digest('hex'),hash);report.originalFilesUnchanged=Object.keys(hashes).length;}catch(error){if(error.code!=='ENOENT')throw error;}
  assert.deepEqual(errors,[]);report.browserErrors=errors;
  await fs.writeFile(evidence+'/validation.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({evidence,totalFrames:report.totalFrames,reviews:report.reviews,game:report.game,originalFilesUnchanged:report.originalFilesUnchanged,export:report.export,browserErrors:errors},null,2));
}finally{await browser.close();}
