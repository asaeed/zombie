import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

test('renderer uses physical pixels while retaining CSS-sized world and HUD coordinates',()=>{
  for(const dpr of [1,1.5,2,3]){
    const context=vm.createContext({window:{innerWidth:800,innerHeight:600,devicePixelRatio:dpr}});
    vm.runInContext(readFileSync(new URL('../js/renderer.js',import.meta.url),'utf8'),context);
    const resize=vm.runInContext('Renderer.prototype.resize',context),transforms=[];
    const make=()=>({getContext:()=>({setTransform:(...args)=>transforms.push(args)})});
    const renderer={canvas:make(),_lightCanvas:make()};resize.call(renderer);
    const ratio=Math.min(2,dpr);
    assert.equal(renderer.W,800);assert.equal(renderer.H,600);
    for(const c of [renderer.canvas,renderer._lightCanvas]){assert.equal(c.width,800*ratio);assert.equal(c.height,600*ratio);}
    assert.deepEqual(transforms,[[ratio,0,0,ratio,0,0],[ratio,0,0,ratio,0,0]]);
    resize.call(renderer,390,720);assert.equal(renderer.W,390);assert.equal(renderer.H,720);assert.equal(renderer.canvas.width,390*ratio);
  }
});
