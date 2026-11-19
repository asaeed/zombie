import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {protectedAction} from '../tools/brushwork/rig.mjs';
const root=new URL('../',import.meta.url),base=new URL('assets/brushwork/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
const original=JSON.parse(readFileSync(new URL('assets/sculpted-pixel/world/manifest.json',root),'utf8'));
const context=vm.createContext({window:{location:{search:''}},URLSearchParams});
vm.runInContext(readFileSync(new URL('js/diorama-art.js',root),'utf8'),context);
const frameFor=vm.runInContext('sculptedActorFrame',context);
test('archived Brushwork retains its gameplay-scale contract but is not shipped',()=>{
  const registry=JSON.parse(readFileSync(new URL('assets/art-packs/registry.json',root),'utf8'));
  assert.equal(registry.default,'rigged');assert.equal(registry.packs.some(p=>p.id==='brushwork'),false);
  context.manifest=manifest;vm.runInContext('validateArtManifest(manifest)',context);
  assert.equal(manifest.style,'brushwork');assert.equal(manifest.imageSmoothing,false);
  assert.deepEqual(Object.keys(manifest.characters).sort(),Object.keys(original.characters).sort());
  assert.deepEqual(Object.keys(manifest.objects).sort(),Object.keys(original.objects).sort());
  for(const[id,m]of Object.entries(manifest.characters))assert.ok(Math.abs(m.bodyHeight*m.renderScale-original.characters[id].bodyHeight*original.characters[id].renderScale)<1e-8);
  assert.equal(manifest.characters.soldier.bodyHeight*manifest.characters.soldier.renderScale,21.28);
  assert.equal(manifest.terrain.frames.length,48);
  for(const m of Object.values(manifest.characters).filter(m=>m.group!=='vehicle'))assert.equal(m.cell.height,128);
});
test('Brushwork cells fit their own images and every requested action/facing selects the correct frame',()=>{
  for(const m of [...Object.values(manifest.characters),...Object.values(manifest.objects),manifest.terrain]){
    assert.match(m.image,/^[a-z-]+\.png$/);
    const png=readFileSync(new URL(m.image,base)),w=png.readUInt32BE(16),h=png.readUInt32BE(20);
    for(const f of m.frames??Object.values(m.clips??{}).flatMap(c=>Object.values(c.directions).flat()))assert.ok(f.x>=0&&f.y>=0&&f.x+f.width<=w&&f.y+f.height<=h);
    if(m.width){assert.equal(m.width,w);assert.equal(m.height,h);}
    if(!m.clips)continue;
    assert.ok(m.footAnchor.x>0&&m.footAnchor.x<m.cell.width&&m.footAnchor.y<m.cell.height);
    for(const[action,c]of Object.entries(m.clips))for(const[d,frames]of Object.entries(c.directions))frames.forEach((f,n)=>{
      const time=(n+.01)/c.fps,actor={facing:d,lastMotionAt:action==='walk'?time:-Infinity,
        animDistance:action==='walk'?(n+.01)*m.walkStride:0,attackAnimStart:action===m.strike?0:-Infinity,gatherAnimTime:time};
      assert.deepEqual(JSON.parse(JSON.stringify(frameFor({metadata:m},actor,time,['gather','heal','repair'].includes(action)?action:null))),f);
    });
  }
});
test('Brushwork actions never stretch hips, thighs, knees or feet',()=>{
  for(const m of Object.values(manifest.characters).filter(m=>m.production.joints))for(const[d,legs]of m.production.joints.entries()){
    const hip=legs[0].hip.y,v={legs};
    for(const clip of ['attack','gather','repair','heal'])for(const reach of [0,.25,.5,.75,1])for(let y=hip-1;y<=127;y+=2)for(let x=10;x<120;x+=3){
      const p={x,y};assert.deepEqual(protectedAction(p,v,d,reach,clip),p);
    }
  }
});
test('Brushwork sources record real extraction and dedicated work/strike drawings, not recolored existing art',()=>{
  for(const id of ['soldier','walker'])assert.match(manifest.characters[id].production.method,/painted directional contact/);
  for(const id of ['soldier','scout','builder','medic','sniper','heavy','torchbearer'])assert.ok(manifest.characters[id].production.workSource);
  for(const id of ['soldier','scout','builder','sniper','heavy','torchbearer'])assert.ok(manifest.characters[id].production.strikeSource);
  for(const m of Object.values(manifest.characters).filter(m=>m.production.source))assert.match(m.production.source.extraction,/connected silhouettes/);
  for(const [type,colors]of Object.entries(manifest.terrain.palette)){assert.equal(colors.length,2);assert.equal(colors[0],manifest.terrain.baseColors[type]);}
});
