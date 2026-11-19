import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??'/private/tmp/zombie-drawn-r2');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8787/tools/brushwork/drawn-r2.html');
  await page.waitForFunction(()=>window.drawnReady||window.drawnError,null,{timeout:120000});
  const error=await page.evaluate(()=>window.drawnError);if(error)throw new Error(error);
  for(const id of await page.evaluate(()=>Object.keys(drawnBake.built))){
    const png=await page.evaluate(id=>drawnBake.built[id].canvas.toDataURL().split(',')[1],id);
    await fs.writeFile(path.join(output,id+'.png'),Buffer.from(png,'base64'));
  }
  const manifest=await page.evaluate(()=>drawnBake.manifest);await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({output,actors:Object.keys(manifest.actors),directions:manifest.directions}));
}finally{await browser.close();}
