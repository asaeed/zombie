import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.argv[2]??'/private/tmp/dead-zone-sculpted-world');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
const errors=[],screenshots=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/docs/art-directions/sculpted-pixel-sprites.html');
  await page.waitForFunction(()=>window.spriteReview,null,{timeout:30000});
  await page.evaluate(()=>spriteReview.play(false));
  const atlases=await page.evaluate(()=>{
    const result={};
    for(const[type,{metadata,image}]of Object.entries(spriteReview.records)){
      const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,c.width,c.height).data;
      let frames=0,blank=0,edges=0;const uniqueWalk={};
      for(const[action,clip]of Object.entries(metadata.clips))for(const[direction,cells]of Object.entries(clip.directions)){
        const hashes=new Set();
        for(const cell of cells){
          let occupied=0,edge=false,hash=2166136261;
          for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){
            const i=((cell.y+y)*c.width+cell.x+x)*4;
            if(action==='walk')hash=Math.imul(hash^((pixels[i]<<8)|pixels[i+3]),16777619)>>>0;
            if(pixels[i+3]>128){occupied++;if(x===0||y===0||x===cell.width-1||y===cell.height-1)edge=true;}
          }
          frames++;if(!occupied)blank++;if(edge)edges++;hashes.add(hash);
        }
        if(action==='walk')uniqueWalk[direction]=hashes.size;
      }
      result[type]={frames,blank,edges,uniqueWalk,width:c.width,height:c.height,bodyPixels:metadata.bodyHeight*metadata.renderScale};
    }
    return result;
  });
  console.log(JSON.stringify({atlases}));
  assert.equal(Object.keys(atlases).length,18);
  for(const report of Object.values(atlases)){
    assert.equal(report.blank,0);assert.equal(report.edges,0);
    for(const count of Object.values(report.uniqueWalk))assert.equal(count,12);
  }
  for(const type of ['soldier','runner','heavy','medic','torchbearer']){
    await page.evaluate(type=>{spriteReview.state.type=type;spriteReview.state.action=type==='medic'?'heal':type==='heavy'||type==='torchbearer'?'attack':'walk';spriteReview.state.frame=3;spriteReview.choose();spriteReview.state.frame=3;spriteReview.render();},type);
    const filename=`sheet-${type}.png`;await page.screenshot({path:path.join(output,filename),fullPage:true});screenshots.push(filename);
  }
  await page.close();
  let sceneData;
  for(const width of [1440,390]){
    const p=await browser.newPage({viewport:{width,height:1000}});p.on('pageerror',error=>errors.push(error.message));
    await p.goto('http://127.0.0.1:8787/docs/art-directions/sculpted-world.html');
    await p.waitForFunction(()=>window.worldReview&&SCULPTED_WORLD.ready,null,{timeout:30000});
    await p.evaluate(()=>{worldReview.state.playing=false;worldReview.state.time=.25;worldReview.render();});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const light of ['day','night']){
      await p.selectOption('#light',light);
      const filename=`world-${light}-${width}.png`;await p.screenshot({path:path.join(output,filename)});screenshots.push(filename);
      assert.equal(await p.evaluate(()=>worldReview.game.isNight()),light==='night');
    }
    await p.selectOption('#motion','work');
    await p.selectOption('#facing','N');
    await p.selectOption('#light','day');
    const loaded=await p.evaluate(()=>({characters:SCULPTED_WORLD.characters.size,objects:SCULPTED_WORLD.objects.size,errors:SCULPTED_WORLD.errors}));
    assert.deepEqual(loaded,{characters:18,objects:14,errors:[]});
    const worldPixels=await p.evaluate(()=>{
      const objects={};
      for(const[id,record]of SCULPTED_WORLD.objects){
        const {width,height}=record.metadata;let occupied=0,edges=0;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(record.alpha[(y*width+x)*4+3]>128){occupied++;if(!x||!y||x===width-1||y===height-1)edges++;}
        objects[id]={occupied,edges};
      }
      const record=SCULPTED_WORLD.terrain,c=document.createElement('canvas');c.width=record.image.naturalWidth;c.height=record.image.naturalHeight;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(record.image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
      const terrain=record.metadata.frames.map(f=>{
        let occupied=0;const colors=new Set();
        for(let y=0;y<32;y++)for(let x=0;x<64;x++){
          const i=((f.y+y)*c.width+f.x+x)*4;
          if(data[i+3]>128)occupied++;
          if(data[i+3]===255)colors.add('#'+[data[i],data[i+1],data[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''));
        }
        return {type:f.type,variant:f.variant,occupied,colors:[...colors],palette:record.metadata.palette[f.type]};
      });
      return {objects,terrain};
    });
    for(const report of Object.values(worldPixels.objects)){assert.ok(report.occupied>150);assert.equal(report.edges,0);}
    for(const tile of worldPixels.terrain){
      assert.ok(tile.occupied>=900);assert.ok(tile.colors.length<=2);
      for(const color of tile.colors)assert.ok(tile.palette.includes(color));
    }
    if(width===1440)sceneData=await p.evaluate(()=>worldReview.game.toSaveData());
    await p.close();
    const review=await browser.newPage({viewport:{width,height:844}});
    await review.goto('http://127.0.0.1:8787/docs/art-directions/sculpted-pixel-sprites.html');
    await review.waitForFunction(()=>window.spriteReview);
    await review.selectOption('#characters','builder');await review.evaluate(()=>spriteReview.play(false));
    assert.equal(await review.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const filename=`review-${width}.png`;await review.screenshot({path:path.join(output,filename)});screenshots.push(filename);await review.close();
  }
  const gamePage=await browser.newPage({viewport:{width:1440,height:1000}});gamePage.on('pageerror',error=>errors.push(error.message));
  await gamePage.goto('http://127.0.0.1:8787/');
  await gamePage.waitForFunction(()=>window._game&&SCULPTED_WORLD.ready);
  assert.equal(await gamePage.evaluate(()=>DIORAMA_PILOT_STYLE),'sculpted');
  await gamePage.evaluate(()=>{_game.paused=true;});
  await gamePage.screenshot({path:path.join(output,'game-default.png')});screenshots.push('game-default.png');
  await gamePage.evaluate(data=>{
    localStorage.setItem('dead-zone-rts:auto',JSON.stringify({data}));window._loadAutoSave();_game.paused=true;
    _game.gameTime=DAY_LENGTH*.18;_game.fogVisible.fill(1);_game.fogExplored.fill(1);
    _game.zombies.filter(z=>z.type==='walker').forEach((z,i)=>{z._artVariant=i%4;});
    centerCameraOn(_game.camera,tileCenterX(39.5),tileCenterY(41.5),innerWidth,innerHeight);
    window.artDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
      if(image.src?.includes('/assets/sculpted-pixel/')&&artDraws.length<10000)artDraws.push({src:image.src.split('/').at(-1),args});
      return draw.call(this,image,...args);
    };
  },sceneData);
  await gamePage.waitForFunction(()=>artDraws.some(d=>d.src==='boss.png'));
  await gamePage.screenshot({path:path.join(output,'game-crowded.png')});screenshots.push('game-crowded.png');
  const drawTypes=await gamePage.evaluate(()=>[...new Set(artDraws.map(d=>d.src))]);
  for(const type of ['soldier','builder','scout','medic','sniper','heavy','torchbearer','runner','brute','spitter','exploder','screamer','boss','suv','hq','tower','clinic','mechanics','terrain'])assert.ok(drawTypes.includes(type+'.png'));
  const rendering=await gamePage.evaluate(()=>{
    const result={};
    for(const[type,record]of SCULPTED_WORLD.characters){
      const draw=artDraws.find(d=>d.src===record.image.src.split('/').at(-1));
      if(draw)result[type]={scale:draw.args[6]/draw.args[2]/_game.camera.zoom,expected:record.metadata.renderScale};
    }
    return result;
  });
  assert.equal(Object.keys(rendering).length,18);
  for(const report of Object.values(rendering))assert.ok(Math.abs(report.scale-report.expected)<1e-10);
  const occlusion=await gamePage.evaluate(()=>{
    const game=_game,b=game.buildings.find(b=>b.type==='hq'),record=sculptedObject('hq');
    const foot=worldToScreen((b.tileX+b.def.tileSize)*TILE,(b.tileY+b.def.tileSize)*TILE,game.camera),rect=sculptedObjectRect(record,foot,game.camera.zoom);
    const renderer=Object.create(Renderer.prototype),old=game.units,unit=new Unit('soldier',0,0),key=(b.tileX+b.tileY+b.def.tileSize*2)*TILE;
    game.units=[unit];let behind=false;
    for(let y=b.tileY-3;y<=b.tileY+b.def.tileSize;y++)for(let x=b.tileX-3;x<=b.tileX+b.def.tileSize;x++){
      if(x>=b.tileX&&y>=b.tileY&&x<b.tileX+b.def.tileSize&&y<b.tileY+b.def.tileSize)continue;
      unit.x=tileCenterX(x);unit.y=tileCenterY(y);
      if(renderer._unitOcclusionAlpha(game,[],key,record,rect)<1)behind=true;
    }
    unit.x=tileCenterX(b.tileX+b.def.tileSize);unit.y=tileCenterY(b.tileY+1);
    const frontAlpha=renderer._unitOcclusionAlpha(game,[],key,record,rect);
    const s=worldToScreen(unit.x,unit.y,game.camera),hit=_input._getUnitAt(s.x,s.y-20*game.camera.zoom)===unit;
    game.units=old;return {behind,frontAlpha,visibleBodySelectable:hit};
  });
  assert.deepEqual(occlusion,{behind:true,frontAlpha:1,visibleBodySelectable:true});
  const positions=await gamePage.evaluate(()=>{
    const game=_game;game.units=[];game.zombies=[];game.vehicles=[];game.caches=[];game.bundles=[];game.projectiles=[];
    game.buildings=[new Building('hq',35,35)];game.tiles=Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));game.supplies=0;game.waveTimer=10000;game.waveActive=false;game.zombiesToSpawn=[];game.flowDirty=true;
    const unit=game.spawnUnit('soldier',tileCenterX(36),tileCenterY(40));
    const cache=new Cache('bin',36,42);cache.searched=true;cache.amount=180;game.caches=[cache];
    centerCameraOn(game.camera,unit.x,unit.y+TILE,innerWidth,innerHeight);
    const us=worldToScreen(unit.x,unit.y,game.camera),foot=worldToScreen((cache.tileX+1)*TILE,(cache.tileY+1)*TILE,game.camera);
    const rect=sculptedObjectRect(sculptedObject('bin'),foot,game.camera.zoom);
    return {unit:{x:us.x,y:us.y-20*game.camera.zoom},cache:{x:foot.x,y:rect.y-8*game.camera.zoom}};
  });
  await gamePage.mouse.click(positions.unit.x,positions.unit.y);
  assert.equal(await gamePage.evaluate(()=>_game.selected[0]?.type),'soldier');
  await gamePage.mouse.click(positions.cache.x,positions.cache.y,{button:'right'});
  const gathering=await gamePage.evaluate(()=>{
    const g=_game,u=g.units[0];const commanded=u.gatherTarget===g.caches[0]&&!!u.gatherCenter;
    let peak=0,delivered=0;
    for(let i=0;i<800;i++){g.update(.05);peak=Math.max(peak,u.carrying);delivered=g.supplies;if(delivered>=20)break;}
    return {commanded,peak,delivered,capacity:u.carryCapacity,autoGather:!!u.gatherCenter};
  });
  assert.equal(gathering.commanded,true);assert.equal(gathering.peak,gathering.capacity);assert.ok(gathering.delivered>=20);assert.equal(gathering.autoGather,true);
  const saved=await gamePage.evaluate(()=>{_game.paused=true;window._saveGameNow();return {unitId:_game.units[0].id,carrying:_game.units[0].carrying,supplies:_game.supplies};});
  await gamePage.reload();await gamePage.waitForFunction(()=>_game&&SCULPTED_WORLD.ready);
  const restored=await gamePage.evaluate(()=>{_game.paused=true;return {unitId:_game.units[0].id,carrying:_game.units[0].carrying,supplies:_game.supplies};});
  assert.equal(restored.unitId,saved.unitId);assert.equal(restored.supplies,saved.supplies);
  const menu=await gamePage.evaluate(()=>mainMenuButtonRect(innerWidth));
  await gamePage.mouse.click(menu.x+menu.w/2,menu.y+menu.h/2);
  assert.equal(await gamePage.evaluate(()=>_input.menuOpen&&_game.paused),true);
  await gamePage.close();assert.deepEqual(errors,[]);
  const result={atlases,totalFrames:Object.values(atlases).reduce((sum,r)=>sum+r.frames,0),drawTypes,rendering,occlusion,gathering,saveRestored:true,menuPaused:true,errors,screenshots,
    limitations:['Textured 2D mesh poses, not individually painted action frames.','Walker dress master also has a missing arm; runner currently has one appearance.','NE/SW vehicle views mirror correct opposite diagonals, including their baked lighting.','The legacy game HUD has known mobile layout overlap; the new review pages fit both checked widths.','New artwork remains pending user review.']};
  await writeFile(path.join(output,'validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({totalFrames:result.totalFrames,gathering,errors,screenshots}));
}finally{await browser.close();}
