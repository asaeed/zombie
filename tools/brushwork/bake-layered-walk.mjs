import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??'/private/tmp/zombie-layered-walk');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8787/tools/brushwork/layered-walk.html');await page.waitForFunction(()=>window.walkReady||window.walkError,null,{timeout:120000});
  const error=await page.evaluate(()=>window.walkError);if(error)throw new Error(error);
  for(const id of await page.evaluate(()=>Object.keys(walkBake.built))){const png=await page.evaluate(id=>walkBake.built[id].canvas.toDataURL().split(',')[1],id);await fs.writeFile(path.join(output,id+'.png'),Buffer.from(png,'base64'));}
  const manifest=await page.evaluate(()=>walkBake.manifest);
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({output,frames:manifest.frameCount,directions:manifest.directions.length,actors:Object.keys(manifest.actors).length}));
}finally{await browser.close();}
