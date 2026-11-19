import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??'/private/tmp/zombie-brushwork/assets/brushwork');
const pilot=process.argv.includes('--pilot');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const page=await browser.newPage();page.on('pageerror',error=>console.error(error.message));
  await page.goto('http://127.0.0.1:8787/tools/brushwork/bake.html'+(pilot?'?pilot':''));
  await page.waitForFunction(()=>window.brushReady||window.brushError,null,{timeout:240000});
  const error=await page.evaluate(()=>window.brushError);if(error)throw new Error(error);
  for(const id of await page.evaluate(()=>Object.keys(brushBake.built))){
    const asset=await page.evaluate(id=>({png:brushBake.built[id].canvas.toDataURL().split(',')[1],metadata:brushBake.built[id].metadata}),id);
    await fs.writeFile(path.join(output,id+'.png'),Buffer.from(asset.png,'base64'));console.log('Baked '+id);
  }
  await fs.writeFile(path.join(output,pilot?'pilot-manifest.json':'manifest.json'),JSON.stringify(await page.evaluate(()=>brushBake.manifest),null,2)+'\n');
}finally{await browser.close();}
