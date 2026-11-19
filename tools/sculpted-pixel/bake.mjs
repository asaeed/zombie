import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const output=path.join(root,'assets/sculpted-pixel');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/tools/sculpted-pixel/bake.html');
  await page.waitForFunction(()=>window.sculptedReady||window.sculptedError,null,{timeout:60000});
  if(errors.length)throw new Error(errors.join('\n'));
  const built=await page.evaluate(()=>Object.fromEntries(Object.entries(window.sculptedBake).map(([type,value])=>[type,{
    png:value.canvas.toDataURL('image/png').split(',')[1],contact:value.contact.toDataURL('image/png').split(',')[1],metadata:value.metadata}])));
  for(const [type,value] of Object.entries(built)){
    await fs.writeFile(path.join(output,type+'.png'),Buffer.from(value.png,'base64'));
    await fs.writeFile(path.join(output,type+'-directions.png'),Buffer.from(value.contact,'base64'));
    await fs.writeFile(path.join(output,type+'.json'),JSON.stringify(value.metadata,null,2)+'\n');
    console.log(type+': '+Object.values(value.metadata.clips).reduce((sum,clip)=>sum+Object.values(clip.directions).flat().length,0)+' frames in 8 facings');
  }
}finally{await browser.close();}
