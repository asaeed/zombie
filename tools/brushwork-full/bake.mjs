import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??'/private/tmp/zombie-brushwork-full/output'),only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8787/tools/brushwork-full/bake.html'+(only?'?only='+only:''));await page.waitForFunction(()=>window.fullReady||window.fullError,null,{timeout:300000});const error=await page.evaluate(()=>window.fullError);if(error)throw Error(error);
  for(const id of await page.evaluate(()=>Object.keys(fullBake.built))){const data=await page.evaluate(id=>fullBake.built[id].canvas.toDataURL().split(',')[1],id);await fs.writeFile(path.join(output,id+'.png'),Buffer.from(data,'base64'));console.log('Baked '+id);}
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(await page.evaluate(()=>fullBake.manifest),null,2)+'\n');
}finally{await browser.close();}
