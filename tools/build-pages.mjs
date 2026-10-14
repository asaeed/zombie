import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const projectRoot=path.resolve(fileURLToPath(new URL('../',import.meta.url)));

export async function buildPages(destination,root=projectRoot){
  const output=path.resolve(destination);
  if(output===root||root.startsWith(output+path.sep))throw new Error('Output cannot contain the source repository');
  await fs.mkdir(output,{recursive:true});
  if((await fs.readdir(output)).length)throw new Error('Use an empty output directory to avoid publishing extra files');
  const files=new Set(['index.html','style.css','assets/favicon.svg','assets/favicon-32.png','assets/favicon-64.png',
    'assets/rigged-full/intro.webp',...['config','utils','pathfinding','entities','game','art','renderer','input','main'].map(name=>'js/'+name+'.js')]);
  const registryFile='assets/art-packs/registry.json';files.add(registryFile);
  const registry=JSON.parse(await fs.readFile(path.join(root,registryFile),'utf8'));
  const publicAsset=(relative,base=root+path.sep)=>{
    const url=new URL(relative,new URL('file://'+base));
    if(url.protocol!=='file:'||url.search||url.hash)throw new Error('Invalid public asset URL');
    const source=fileURLToPath(url);
    if(!source.startsWith(path.join(root,'assets')+path.sep))throw new Error('Asset escapes the public assets directory');
    return path.relative(root,source);
  };
  for(const pack of registry.packs){
    if(pack.renderer==='classic')continue;
    const manifestFile=publicAsset(pack.manifest);files.add(manifestFile);
    const manifest=JSON.parse(await fs.readFile(path.join(root,manifestFile),'utf8'));
    for(const record of [...Object.values(manifest.characters),...Object.values(manifest.objects),manifest.terrain]){
      files.add(publicAsset(record.image,path.dirname(path.join(root,manifestFile))+path.sep));
      if(record.nightImage)files.add(publicAsset(record.nightImage,path.dirname(path.join(root,manifestFile))+path.sep));
    }
  }
  const hash=createHash('sha256');let bytes=0;
  for(const file of [...files].sort()){
    const source=path.join(root,file);
    if(!(await fs.lstat(source)).isFile())throw new Error('Only regular public files are allowed: '+file);
    let data=await fs.readFile(source);
    if(file.endsWith('.json')){
      const json=JSON.parse(data);
      if(json.characters&&json.objects&&json.terrain){
        // Source rig measurements are QA evidence, not runtime dependencies.
        delete json.production;
        for(const record of [...Object.values(json.characters),...Object.values(json.objects),json.terrain])delete record.production;
      }
      data=Buffer.from(JSON.stringify(json)+'\n');
    }
    const target=path.join(output,file);
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);
    hash.update(file+'\0');hash.update(data);bytes+=data.length;
  }
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  const release={version:1,release:hash.digest('hex'),files:files.size,bytes};
  await fs.writeFile(path.join(output,'release.json'),JSON.stringify(release,null,2)+'\n');
  return {output,...release};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=process.argv[2]??await fs.mkdtemp(path.join(tmpdir(),'zombie-pages-'));
  console.log(JSON.stringify(await buildPages(output),null,2));
}
