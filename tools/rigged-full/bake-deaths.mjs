import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=path.join(root,'assets/rigged-full');
const manifestFile=path.join(output,'manifest.json'),manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
const only=process.argv.find(v=>v.startsWith('--only='))?.slice(7).split(',');
const base=process.env.DEAD_ZONE_BAKE_URL||'http://127.0.0.1:18803/';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await page.goto(new URL('tools/rigged-full/death-bake.html',base).href);await page.waitForFunction(()=>window.bakeDeath);
  for(const id of Object.keys(manifest.characters).filter(id=>id!=='suv'&&(!only||only.includes(id)))) {
    const result=await page.evaluate(id=>bakeDeath(id),id),png=Buffer.from(result.png,'base64');
    const image=`${id}-death-${createHash('sha256').update(png).digest('hex').slice(0,12)}.png`;
    await fs.writeFile(path.join(output,image),png);manifest.characters[id].death={...result.metadata,image};
    await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');console.log('Baked death: '+id+' ('+png.length+' bytes)');
  }
} finally {await browser.close();}
