import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??'/private/tmp/zombie-rigged-world');
await fs.mkdir(path.join(output,'world'),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8787/tools/rigged-full/world.html');
 await page.waitForFunction(()=>window.worldBakeReady||window.worldBakeError,null,{timeout:60000});
 const error=await page.evaluate(()=>window.worldBakeError);if(error)throw Error(error);
 const metadata={};
 for(const id of await page.evaluate(()=>Object.keys(worldBake))){
  const asset=await page.evaluate(id=>({png:worldBake[id].canvas.toDataURL().split(',')[1],metadata:worldBake[id].metadata}),id);
  await fs.writeFile(path.join(output,asset.metadata.image),Buffer.from(asset.png,'base64'));metadata[id]=asset.metadata;
 }
 await fs.writeFile(path.join(output,'world.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify({output,assets:Object.keys(metadata)}));
}finally{await browser.close();}
