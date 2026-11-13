import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),output=path.join(root,'assets/rigged-pilot');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
 }catch{res.writeHead(404).end();}
});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/tools/rigged-pilot/bake.html`);await page.waitForFunction(()=>window.pilotReady||window.pilotError,null,{timeout:120000});
 const error=await page.evaluate(()=>window.pilotError);if(error||errors.length)throw Error(error||errors.join('\n'));
 const atlases=await page.evaluate(()=>window.pilotAtlases);await fs.mkdir(output,{recursive:true});
 for(const[id,r]of Object.entries(atlases)){
  await fs.writeFile(path.join(output,id+'.png'),Buffer.from(r.png,'base64'));
  await fs.writeFile(path.join(output,id+'.json'),JSON.stringify(r.metadata,null,2)+'\n');
  if(r.weaponWitness){await fs.mkdir(path.join(output,'review'),{recursive:true});await fs.writeFile(path.join(output,'review',id+'-weapon-witness.png'),Buffer.from(r.weaponWitness,'base64'));}
  if(r.backWitness){await fs.mkdir(path.join(output,'review'),{recursive:true});await fs.writeFile(path.join(output,'review',id+'-back-witness.png'),Buffer.from(r.backWitness,'base64'));}
 }
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(await page.evaluate(()=>window.pilotManifest),null,2)+'\n');
 const report=await page.evaluate(()=>window.pilotReport);await fs.writeFile(path.join(output,'bake-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
