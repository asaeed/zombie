import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright-core';

const args=process.argv.slice(2),option=(key,fallback)=>args.find(a=>a.startsWith('--'+key+'='))?.split('=').slice(1).join('=')??fallback;
const phase=option('phase','both');
if(!['even','odd','both'].includes(phase))throw Error('Use --phase=even, odd, or both');
const output=option('output',await fs.mkdtemp(path.join(tmpdir(),'rigged-cycle-grids-')));
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/docs/art-directions/rigged-full-sprites.html');await page.waitForFunction(()=>window.riggedReview);await page.evaluate(()=>riggedReview.play(false));
 const roles=args.filter(a=>!a.startsWith('--'));
 if(!roles.length)roles.push(...await page.evaluate(()=>Object.keys(riggedReview.records)));
 for(const id of roles){
  const grids=await page.evaluate(({id,phase})=>{
   const r=riggedReview.records[id];if(!r)throw Error('Unknown role '+id);
   const images={};
   for(const [action,clip]of Object.entries(r.metadata.clips)){
    const count=clip.directions.S.length,parities=count<=8?['all']:phase==='both'?['even','odd']:[phase];
    for(const parity of parities){
     const a=r.metadata.footAnchor,scale=1.45,w=Math.max(190,Math.ceil(2*Math.max(a.x,r.metadata.cell.width-a.x)*scale+16)),h=Math.max(190,Math.ceil(r.metadata.cell.height*scale+32));
     const c=document.createElement('canvas');c.width=8*w;c.height=8*h;const g=c.getContext('2d');g.fillStyle='#8b9978';g.fillRect(0,0,c.width,c.height);g.imageSmoothingQuality='high';
     r.metadata.directions.forEach((d,row)=>{const frames=clip.directions[d];for(let n=0;n<Math.min(8,count);n++){
      const index=count<=8?n:n*2+(parity==='odd'?1:0),f=frames[index];
      g.fillStyle='#18201c';g.font='13px system-ui';g.fillText(`${id} ${action} ${d} ${index+1}`,n*w+3,row*h+16);
      g.drawImage(r.image,f.x,f.y,f.width,f.height,n*w+w/2-a.x*scale,row*h+28,f.width*scale,f.height*scale);
     }});
     images[action+'-'+parity]=c.toDataURL('image/png').split(',')[1];
    }
   }
   return images;
  },{id,phase});
  for(const [action,png]of Object.entries(grids))await fs.writeFile(path.join(output,id+'-'+action+'.png'),Buffer.from(png,'base64'));
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({output,roles,phase}));
}finally{await browser.close();}
