import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('../../',import.meta.url)),output=await fs.mkdtemp(path.join(tmpdir(),'zombie-cache-reload-'));
const release='20261010-rigged-world-r2',oldRelease='20261008-art-packs';
const currentLoader=await fs.readFile(path.join(root,'js/diorama-art.js'),'utf8');
// Model the previous loader's fixed-density validator while keeping the rest of the runtime identical.
const legacyLoader=currentLoader.replace('frame.width !== 64 * terrainScale || frame.height !== 32 * terrainScale','frame.width !== 64 || frame.height !== 32');
assert.notEqual(legacyLoader,currentLoader);
let phase='legacy',failManifest=false;
const requests=new Map();
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root))throw Error('Outside fixture root');
  requests.set(url.pathname+url.search,(requests.get(url.pathname+url.search)??0)+1);
  if(failManifest&&url.pathname==='/assets/rigged-full/manifest.json'){res.writeHead(503);res.end('Test-only unavailable graphics');return;}
  const ext=path.extname(file),type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[ext]??'application/octet-stream';
  let data=await fs.readFile(file);
  if(ext==='.html'&&phase==='legacy')data=Buffer.from(data.toString().replaceAll('?v='+release,'?v='+oldRelease));
  if(url.pathname==='/js/diorama-art.js'&&url.searchParams.get('v')===oldRelease)data=Buffer.from(legacyLoader);
  res.writeHead(200,{'Content-Type':type,'Cache-Control':ext==='.html'?'no-store':'public, max-age=31536000, immutable'});res.end(data);
 }catch(error){res.writeHead(404);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.assetDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...a){if(['canvas','scene'].includes(this.canvas.id)&&image.src)assetDraws.push(image.src);return draw.call(this,image,...a);};
 });
 const report={output,scenes:{},errors};
 for(const [name,url]of [['game','/?artPack=rigged'],['demo','/docs/art-directions/rigged-full-world.html']]){
  phase='legacy';await page.goto(origin+url);await page.waitForFunction(()=>ART_PACK_STATE.error?.includes('Incomplete terrain: grass/0'));
  assert.equal(await page.evaluate(()=>ART_PACK_STATE.active),null);
  const oldCount=requests.get('/js/diorama-art.js?v='+oldRelease);assert.equal(oldCount,1,'cached legacy loader must really be reused');
  phase='current';await page.reload();await page.waitForFunction(()=>ART_PACK_STATE.active==='rigged'&&SCULPTED_WORLD.ready,null,{timeout:60000});
  if(name==='demo')await page.waitForFunction(()=>window.worldReview);
  await page.waitForTimeout(150);
  const actual=await page.evaluate(()=>({active:ART_PACK_STATE.active,error:ART_PACK_STATE.error,density:SCULPTED_WORLD.terrain.metadata.resolutionScale,
   soldier:sculptedActor('soldier').image.src,loader:[...document.scripts].find(s=>s.src.includes('diorama-art.js')).src,
   draws:[...new Set(assetDraws)],label:document.getElementById('pack')?.value}));
  assert.equal(actual.active,'rigged');assert.equal(actual.error,null);assert.equal(actual.density,4);
  assert.ok(actual.soldier.includes('/assets/rigged-full/soldier.png'));assert.ok(actual.loader.endsWith('?v='+release));
  assert.ok(actual.draws.some(src=>src.includes('/assets/rigged-full/soldier.png')));
  assert.equal(requests.get('/js/diorama-art.js?v='+oldRelease),oldCount);
  if(name==='demo')assert.equal(actual.label,'rigged');
  report.scenes[name]={legacyErrorReproduced:true,ordinaryReloadLoadsNewSkin:true,actual};
  await page.screenshot({path:path.join(output,name+'-after-reload.png')});
 }
 assert.equal(requests.get('/js/diorama-art.js?v='+release),1,'new version remains normally cacheable');
 failManifest=true;await page.reload();await page.waitForFunction(()=>ART_PACK_STATE.error?.includes('HTTP 503'));
 assert.equal(await page.evaluate(()=>!!window.worldReview),false);
 assert.equal(await page.locator('#failure').isVisible(),true);assert.match(await page.locator('#failure').textContent(),/Graphics could not load.*503/);
 assert.equal(await page.evaluate(()=>assetDraws.length),0,'failed startup must not masquerade as an older skin');
 failManifest=false;await page.selectOption('#pack','classic');await page.waitForFunction(()=>window.worldReview&&ART_PACK_STATE.active==='classic');
 await page.selectOption('#pack','rigged');await page.waitForFunction(()=>ART_PACK_STATE.active==='rigged'&&!document.getElementById('pack').disabled);
 assert.equal(await page.locator('#failure').isVisible(),false);
 report.failure={visibleError:true,noFallbackDraws:true,selectionRecovers:true};
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(output,'demo-mobile.png')});
 assert.deepEqual(errors,[]);report.requests=Object.fromEntries(requests);
 await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,scenes:Object.keys(report.scenes),failure:report.failure,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
