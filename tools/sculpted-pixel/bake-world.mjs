import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(new URL('../../assets/sculpted-pixel/world/',import.meta.url).pathname);
const terrainOnly=process.argv.includes('--terrain-only');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8787/tools/sculpted-pixel/world-bake.html'+(terrainOnly?'?terrain':''));
  await page.waitForFunction(()=>window.worldReady||window.worldError,null,{timeout:180000});
  const error=await page.evaluate(()=>window.worldError);if(error)throw new Error(error);
  const ids=await page.evaluate(()=>Object.keys(worldBake.built));
  for(const id of ids){
    const result=await page.evaluate(id=>({png:worldBake.built[id].canvas.toDataURL().split(',')[1],metadata:worldBake.built[id].metadata}),id);
    await fs.writeFile(path.join(output,id+'.png'),Buffer.from(result.png,'base64'));
    await fs.writeFile(path.join(output,id+'.json'),JSON.stringify(result.metadata,null,2)+'\n');
    console.log('Baked '+id);
  }
  const manifest=terrainOnly?JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'))
    :await page.evaluate(()=>worldBake.manifest);
  if(terrainOnly)manifest.terrain=await page.evaluate(()=>worldBake.built.terrain.metadata);
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}finally{await browser.close();}
