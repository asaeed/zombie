import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildPages} from '../tools/build-pages.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('Pages export contains the current game and every referenced runtime asset, not production sources',async()=>{
  const output=await fs.mkdtemp(path.join(tmpdir(),'zombie-pages-test-'));
  try{
    const result=await buildPages(output);
    assert.equal((await fs.readFile(path.join(output,'index.html'),'utf8')),
      await fs.readFile(path.join(root,'index.html'),'utf8'));
    const meta=JSON.parse(await fs.readFile(path.join(output,'assets/rigged-full/manifest.json'),'utf8'));
    const sourceMeta=JSON.parse(await fs.readFile(path.join(root,'assets/rigged-full/manifest.json'),'utf8'));
    delete sourceMeta.production;
    for(const record of [...Object.values(sourceMeta.characters),...Object.values(sourceMeta.objects),sourceMeta.terrain])delete record.production;
    assert.deepEqual(meta,sourceMeta,'export preserves every runtime field and omits only production telemetry');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,'assets/art-packs/registry.json'),'utf8')),
      JSON.parse(await fs.readFile(path.join(root,'assets/art-packs/registry.json'),'utf8')));
    for(const record of [...Object.values(meta.characters),...Object.values(meta.objects),meta.terrain]){
      const image=path.resolve(output,'assets/rigged-full',record.image);
      assert.ok((await fs.stat(image)).size>0);
      if(record.nightImage)assert.ok((await fs.stat(path.resolve(output,'assets/rigged-full',record.nightImage))).size>0);
    }
    const release=JSON.parse(await fs.readFile(path.join(output,'release.json'),'utf8'));
    assert.equal(release.release,result.release);assert.match(release.release,/^[0-9a-f]{64}$/);
    assert.ok(release.files>40);assert.ok(release.bytes>1000000);
    const expected=new Set(['index.html','style.css','assets/favicon.svg','assets/favicon-32.png','assets/favicon-64.png',
      'assets/rigged-full/intro.webp','assets/art-packs/registry.json','assets/rigged-full/manifest.json',
      ...['config','utils','pathfinding','entities','game','art','renderer','input','main'].map(name=>'js/'+name+'.js')]);
    for(const record of [...Object.values(meta.characters),...Object.values(meta.objects),meta.terrain])
      for(const image of [record.image,record.nightImage].filter(Boolean))expected.add(path.posix.normalize('assets/rigged-full/'+image));
    const exported=[];
    async function list(dir,relative=''){for(const item of await fs.readdir(dir,{withFileTypes:true})){
      const name=path.posix.join(relative,item.name);if(item.isDirectory())await list(path.join(dir,item.name),name);else exported.push(name);
    }}
    await list(output);assert.deepEqual(exported.sort(),[...expected,'.nojekyll','release.json'].sort(),'exact runtime dependency closure; no production assets');
    assert.equal(release.files,expected.size);
    let runtimeBytes=0;for(const file of expected)runtimeBytes+=(await fs.stat(path.join(output,file))).size;
    assert.equal(release.bytes,runtimeBytes);
    for(const script of (await fs.readFile(path.join(output,'index.html'),'utf8')).matchAll(/<script[^>]+src="([^"]+)"/g))
      assert.ok((await fs.stat(path.join(output,script[1].split('?')[0]))).size>0);
    assert.equal((await fs.stat(path.join(output,'.nojekyll'))).size,0);
    for(const excluded of ['docs','tools','tests','node_modules','.git','assets/sculpted-pixel','assets/brushwork',
      'assets/brushwork-full','assets/diorama-pilot','assets/rigged-pilot','js/zombie-art.js','js/diorama-art.js'])
      await assert.rejects(fs.access(path.join(output,excluded)));
  }finally{await fs.rm(output,{recursive:true,force:true});}
});
test('Pages export refuses nonempty output folders and never overwrites the source repository',async()=>{
  await assert.rejects(buildPages(root),/Output cannot contain/);
  const output=await fs.mkdtemp(path.join(tmpdir(),'zombie-pages-test-'));
  try{
    await fs.writeFile(path.join(output,'private-notes.txt'),'not a public asset');
    await assert.rejects(buildPages(output),/empty output directory/);
    assert.equal(await fs.readFile(path.join(output,'private-notes.txt'),'utf8'),'not a public asset');
  }finally{await fs.rm(output,{recursive:true,force:true});}
});
