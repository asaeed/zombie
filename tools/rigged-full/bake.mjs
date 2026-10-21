import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {ROLES,withDisplayScale,withWorldFacings,withVehicleGrounding} from './catalog.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??path.join(root,'assets/rigged-full'));
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(','),entries=Object.entries(ROLES).filter(([id,r])=>!r.pilot&&(!only||only.includes(id)));
await fs.mkdir(output,{recursive:true});let manifest;
try{manifest=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!manifest){
 const pilot=JSON.parse(await fs.readFile(path.join(root,'assets/rigged-pilot/manifest.json'),'utf8')),world=JSON.parse(await fs.readFile(path.join(root,'assets/brushwork-full/manifest.json'),'utf8'));
 manifest={version:1,style:'rigged',imageSmoothing:true,imageSmoothingQuality:'high',characters:{},objects:{},terrain:null,production:{method:'artist-rigged-3d-to-png',approvedPilot:'../rigged-pilot/manifest.json',retainedWorld:'../brushwork-full/manifest.json',modelLicense:'../rigged-pilot/source/character-license.txt',animationLicense:'../rigged-pilot/source/animation-license.txt',localOnly:true}};
 for(const[id,m]of Object.entries(pilot.characters)){await fs.copyFile(path.join(root,'assets/rigged-pilot',m.image),path.join(output,m.image));manifest.characters[id]={...m,group:ROLES[id].group,strike:ROLES[id].strike,walkStride:ROLES[id].speed/m.clips.walk.fps,production:{...m.production,acceptedPilot:true}};}
 for(const[id,m]of Object.entries(world.objects))manifest.objects[id]={...m,image:path.posix.normalize('../brushwork-full/'+m.image)};
 manifest.terrain={...world.terrain,image:path.posix.normalize('../brushwork-full/'+world.terrain.image)};
 manifest.characters.suv={...world.characters.suv,image:path.posix.normalize('../brushwork-full/'+world.characters.suv.image)};
 // A fresh character bake retains the separately rebuilt native-density world.
 let retained;
 try{retained=JSON.parse(await fs.readFile(path.join(root,'assets/rigged-full/manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(retained?.terrain?.resolutionScale){
  manifest.objects=retained.objects;manifest.terrain=retained.terrain;manifest.characters.suv=retained.characters.suv;
  for(const m of [...Object.values(manifest.objects),manifest.terrain])if(m.image.startsWith('world/')){
   await fs.mkdir(path.dirname(path.join(output,m.image)),{recursive:true});
   await fs.copyFile(path.join(root,'assets/rigged-full',m.image),path.join(output,m.image));
  }
 }
}
for(const[id,m]of Object.entries(manifest.characters))manifest.characters[id]=withDisplayScale(id,withVehicleGrounding(id,withWorldFacings(id,m)));
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const[id]of entries){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await page.goto('http://127.0.0.1:8787/tools/rigged-full/bake.html');await page.waitForFunction(()=>window.bakerReady,null,{timeout:60000});
   const actor=await page.evaluate(async id=>await bakeActor(id),id);if(errors.length)throw Error(errors.join('\n'));
   if(actor.model){
    const model=Buffer.from(actor.model,'base64'),name='source/'+id+'/custom-'+createHash('sha256').update(model).digest('hex').slice(0,12)+'.glb';
    await fs.mkdir(path.dirname(path.join(output,name)),{recursive:true});await fs.writeFile(path.join(output,name),model);
    actor.metadata.production.baseSource=actor.metadata.production.source;actor.metadata.production.source=name;
   }
   const png=Buffer.from(actor.png,'base64'),image=id+'-'+createHash('sha256').update(png).digest('hex').slice(0,12)+'.png';
   await fs.writeFile(path.join(output,image),png);manifest.characters[id]={...actor.metadata,image};
   await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Baked '+id);
  }finally{await page.close();}
 }
}finally{await browser.close();}
console.log(JSON.stringify({output,characters:Object.keys(manifest.characters),frames:Object.values(manifest.characters).reduce((n,m)=>n+Object.values(m.clips).reduce((a,c)=>a+Object.values(c.directions).reduce((b,f)=>b+f.length,0),0),0)}));
