import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const context=vm.createContext({ISO_X:1,ISO_Y:.5,WAVE_WARNING:30,sculptedActor:()=>({metadata:{cell:{width:160,height:160},footAnchor:{x:80,y:136},renderScale:.3}})});
for(const f of ['utils','renderer'])vm.runInContext(readFileSync(new URL('../js/'+f+'.js',import.meta.url),'utf8'),context);
const compass=vm.runInContext('mapCompass',context),Renderer=vm.runInContext('Renderer',context);
for(const width of [320,390,1440])test('compass follows wave map axes and fits below the menu at width '+width,()=>{
 const {center,radius,points}=compass(width),menu=vm.runInContext(`mainMenuButtonRect(${width})`,context);
 assert.ok(center.x-radius>=0&&center.x+radius<=width);assert.ok(center.y-radius>menu.y+menu.h);
 assert.equal(points[2].label,'S');assert.ok(points[2].x<center.x&&points[2].y>center.y);
 assert.ok(points[0].x>center.x&&points[0].y<center.y);
 assert.ok(points[1].x>center.x&&points[1].y>center.y);
 assert.ok(points[3].x<center.x&&points[3].y<center.y);
});
test('actor culling respects complete sprites and overlays at viewport boundaries',()=>{
 const r=Object.assign(Object.create(Renderer.prototype),{W:390,H:500}),g={camera:{x:0,y:0,zoom:1}};
 const actor=(x,y)=>({type:'soldier',x,y});
 assert.equal(r._actorOnScreen(g,actor(100,100)),true);
 assert.equal(r._actorOnScreen(g,actor(420,0)),false);
 assert.equal(r._actorOnScreen(g,actor(410,20)),true);
 assert.equal(r._actorOnScreen(g,actor(540,540)),true,'body above a foot just below viewport still visible');
 assert.equal(r._actorOnScreen(g,actor(1200,1200)),false);
 assert.equal(r._actorOnScreen(g,actor(-1000,1000)),false);
});
test('mobile toasts wrap inside the space reserved beside the compass',()=>{
 const texts=[],rects=[],r=Object.assign(Object.create(Renderer.prototype),{W:390});
 const ctx=new Proxy({measureText:t=>({width:t.length*7}),fillText:(...a)=>texts.push(a),moveTo:(...a)=>rects.push(a)}, {get:(o,k)=>k in o?o[k]:()=>{}});
 r._drawToasts(ctx,{waveActive:true,waveDirections:[2],toasts:[{text:'Wave 10 approaching from South + West',t:1,life:4,kind:'danger'}]});
 assert.ok(texts.length>=2);for(const [text,x]of texts){assert.ok(x<=290);assert.ok(x-text.length*7>=0);}
 assert.ok(rects.every(([x])=>x>=0&&x<304));
});
