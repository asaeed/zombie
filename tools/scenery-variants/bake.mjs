import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(path.join(process.env.MODULE_ROOT || root, 'package.json'));
const {chromium} = require('playwright-core');
const production = JSON.parse(await fs.readFile(new URL('production.json', import.meta.url)));
const requested = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
if (requested?.some(id => !production.assets.some(spec => spec.id === id))) throw Error('Unknown scenery variant');
const specs = requested ? production.assets.filter(spec => requested.includes(spec.id)) : production.assets;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/') {res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Scenery baker</title>'); return;}
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    const bytes = await fs.readFile(file);
    res.setHeader('Content-Type', file.endsWith('.mjs') ? 'text/javascript' : 'image/png'); res.end(bytes);
  } catch {res.writeHead(404); res.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const results = await page.evaluate(async specs => {
    const {nightColor} = await import('/tools/night-world.mjs');
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), {width:w, height:h});
    const output = {};
    for (const spec of specs) {
      const image = new Image(); image.src = `/tools/scenery-variants/source/${spec.id}.png`; await image.decode();
      const source = canvas(image.naturalWidth, image.naturalHeight), g = source.getContext('2d', {willReadFrequently:true});
      g.drawImage(image, 0, 0);
      const pixels = g.getImageData(0, 0, source.width, source.height), data = pixels.data;
      let left=source.width, top=source.height, right=0, bottom=0, occupied=0, cleared=0;
      for (let y=0; y<source.height; y++) for (let x=0; x<source.width; x++) {
        const i = (y*source.width+x)*4;
        // Match the existing source-extraction threshold for faint generated matte pixels.
        if (data[i+3] < 96) {if (data[i+3]) cleared++; data[i+3]=0; continue;}
        occupied++; left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
      }
      if (occupied<1000 || !left || !top || right===source.width-1 || bottom===source.height-1) throw Error('Blank or clipped source: '+spec.id);
      let contactX=0, contactPixels=0;
      for (let y=Math.floor(bottom-(bottom-top)*.035); y<=bottom; y++) for (let x=left; x<=right; x++) {
        if (data[(y*source.width+x)*4+3]>=128) {contactX+=x; contactPixels++;}
      }
      g.putImageData(pixels,0,0);
      const crop={x:left,y:top,width:right-left+1,height:bottom-top+1};
      const density=6, pad=12, scale=Math.min(spec.maxWidth/crop.width,spec.maxHeight/crop.height)*density;
      if (scale>1) throw Error('Insufficient source resolution: '+spec.id);
      const day=canvas(Math.ceil(crop.width*scale)+pad*2,Math.ceil(crop.height*scale)+pad*2);
      const ctx=day.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';
      ctx.drawImage(source,left,top,crop.width,crop.height,pad,pad,crop.width*scale,crop.height*scale);
      const night=canvas(day.width,day.height), n=night.getContext('2d');
      const graded=ctx.getImageData(0,0,day.width,day.height), original=new Uint8ClampedArray(graded.data);
      for(let i=0;i<graded.data.length;i+=4) {
        if(!graded.data[i+3])continue;
        graded.data.set(nightColor(graded.data[i],graded.data[i+1],graded.data[i+2]),i);
      }
      let alphaDifferences=0;
      for(let i=3;i<original.length;i+=4)if(original[i]!==graded.data[i])alphaDifferences++;
      n.putImageData(graded,0,0);
      const filename=spec.fileStem||spec.id;
      output[spec.id]={day:day.toDataURL().split(',')[1],night:night.toDataURL().split(',')[1],
        metadata:{image:`world/${filename}.png`,nightImage:`night/${filename}.png`,group:'decoration',
          width:day.width,height:day.height,displaySize:{width:day.width/density,height:day.height/density},
          footAnchor:{x:pad+(contactX/contactPixels-left)*scale,y:pad+(bottom-top+.5)*scale},
          production:{source:`tools/scenery-variants/source/${spec.id}.png`,crop,sourceSize:{width:source.width,height:source.height},
            pixelsPerCSSPixel:density,alphaThreshold:96,cleared,method:'Authored raster silhouette, one high-quality reduction, ground-contact registration'}},
        stats:{width:day.width,height:day.height,alphaDifferences,litPixels:0,occupied,cleared}};
    }
    return output;
  }, specs);
  const assetRoot=path.join(root,'assets/rigged-full');
  const manifestFile=path.join(assetRoot,'manifest.json'), validationFile=path.join(assetRoot,'night/validation.json');
  const manifest=JSON.parse(await fs.readFile(manifestFile)), validation=JSON.parse(await fs.readFile(validationFile));
  for(const spec of specs) {
    const result=results[spec.id];
    const raw=await fs.readFile(path.join(root,'tools/scenery-variants/source',spec.id+'.png'));
    result.metadata.production.sha256=createHash('sha256').update(raw).digest('hex');
    for(const [key,filename]of [['day',result.metadata.image],['night',result.metadata.nightImage]]) {
      await fs.mkdir(path.dirname(path.join(assetRoot,filename)),{recursive:true});
      await fs.writeFile(path.join(assetRoot,filename),Buffer.from(result[key],'base64'));
    }
    manifest.objects[spec.id]=result.metadata;validation.stats[spec.id]=result.stats;
  }
  for(const family of ['pine','bush','rock'])manifest.objects[family].variants=[family,`${family}-2`,`${family}-3`];
  await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(validationFile,JSON.stringify(validation,null,2)+'\n');
  console.log(JSON.stringify({assets:Object.fromEntries(Object.entries(results).map(([id,r])=>[id,{...r.stats,displaySize:r.metadata.displaySize}]))},null,2));
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
