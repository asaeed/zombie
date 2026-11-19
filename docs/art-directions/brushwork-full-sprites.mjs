const $=id=>document.getElementById(id),root=new URL('../../assets/brushwork-full/',import.meta.url);
const state={type:'soldier',action:'walk',frame:0,playing:true},records={},dpr=Math.min(devicePixelRatio||1,2);
const baseline={};
const options=(select,values)=>select.replaceChildren(...values.map(value=>Object.assign(document.createElement('option'),{value,textContent:value.replaceAll('-',' ')})));
function surface(c,width,height){c.style.width=width+'px';c.style.height=height+'px';c.width=Math.ceil(width*dpr);c.height=Math.ceil(height*dpr);const g=c.getContext('2d');g.scale(dpr,dpr);return g;}
try{
 const response=await fetch(new URL('manifest.json',root));if(!response.ok)throw Error(`Manifest HTTP ${response.status}`);
 const manifest=await response.json();
 for(const[id,metadata]of Object.entries(manifest.characters)){const image=new Image();image.src=new URL(metadata.image,root);await image.decode();records[id]={image,metadata};}
 const beforeRoot=new URL('review-r2/before/',root),before=await(await fetch(new URL('manifest.json',beforeRoot))).json();
 for(const id of ['soldier','builder','scout','sniper']){const metadata=before.characters[id],image=new Image();image.src=new URL(id+'.png',beforeRoot);await image.decode();baseline[id]={image,metadata};}
 options($('unit'),Object.keys(records));
 options($('strip-facing'),manifest.characters.soldier.directions);$('strip-facing').value='S';
 const panels=manifest.characters.soldier.directions.map(direction=>{
  const panel=document.createElement('section');panel.className='view';const c=document.createElement('canvas'),native=document.createElement('div'),small=document.createElement('canvas'),caption=document.createElement('p');native.className='native';native.append(small);caption.className='caption';caption.textContent=direction;panel.append(c,native,caption);$('views').append(panel);return {direction,panel,canvas:c,native:small};
 });
 function draw(g,r,f,scale,x,y){g.imageSmoothingEnabled=manifest.imageSmoothing;g.imageSmoothingQuality=manifest.imageSmoothingQuality??'low';const a=r.metadata.footAnchor;g.drawImage(r.image,f.x,f.y,f.width,f.height,x-a.x*scale,y-a.y*scale,f.width*scale,f.height*scale);}
 let stripKey='';
 function render(){
  const r=records[state.type],clip=r.metadata.clips[state.action],count=clip.directions.S.length;state.frame%=count;$('frame').max=count-1;$('frame').value=state.frame;$('counter').textContent=`${state.frame+1} / ${count}`;
  $('compare').disabled=!baseline[state.type];const before=$('compare').checked&&baseline[state.type];
  for(const p of panels){p.panel.classList.toggle('dark',$('background').value==='night');const f=clip.directions[p.direction][state.frame],w=p.panel.clientWidth-8,h=innerWidth<=650?155:190,g=surface(p.canvas,w,h);draw(g,r,f,Math.min(1.45,120/r.metadata.bodyHeight),w/2,h-18);
   if(before){
    g.clearRect(0,0,w,h);const old=before.metadata.clips[state.action].directions[p.direction][state.frame],scale=Math.min(1.1,w/(f.width*2));
    draw(g,before,old,scale,w*.25,h-28);draw(g,r,f,scale,w*.75,h-28);
    g.fillStyle=$('background').value==='night'?'#dce5e0':'#17251e';g.font='11px system-ui';g.textAlign='center';g.fillText('Before',w*.25,h-8);g.fillText('Now',w*.75,h-8);
   }
   const scale=r.metadata.renderScale,a=r.metadata.footAnchor,ng=surface(p.native,f.width*scale*(before?2:1),f.height*scale);
   if(before){const old=before.metadata.clips[state.action].directions[p.direction][state.frame];draw(ng,before,old,scale,a.x*scale,a.y*scale);}
   draw(ng,r,f,scale,a.x*scale+(before?f.width*scale:0),a.y*scale);
  }
  const key=state.type+'/'+state.action+'/'+$('strip-facing').value;if(key!==stripKey){stripKey=key;const width=r.metadata.cell.width,height=r.metadata.cell.height,g=surface($('strip'),count*width,height+16);clip.directions[$('strip-facing').value].forEach((f,i)=>draw(g,r,f,1,i*width+r.metadata.footAnchor.x,r.metadata.footAnchor.y+8));}
 }
 let elapsed=0;
 function choose(){$('unit').value=state.type;const actions=Object.keys(records[state.type].metadata.clips);if(!actions.includes(state.action))state.action=actions[0];options($('action'),actions);$('action').value=state.action;state.frame=0;elapsed=0;render();}
 function play(value){state.playing=value;elapsed=0;$('play').innerHTML=value?'&#10074;&#10074;':'&#9654;';$('play').title=value?'Pause':'Play';$('play').setAttribute('aria-label',$('play').title);}
 $('unit').onchange=()=>{state.type=$('unit').value;choose();};$('action').onchange=()=>{state.action=$('action').value;state.frame=0;elapsed=0;render();};$('play').onclick=()=>play(!state.playing);$('background').onchange=render;
 for(const[id,delta]of[['previous',-1],['next',1]])$(id).onclick=()=>{play(false);const n=records[state.type].metadata.clips[state.action].directions.S.length;state.frame=(state.frame+delta+n)%n;render();};
 $('frame').oninput=()=>{play(false);state.frame=Number($('frame').value);render();};window.addEventListener('resize',render);
 $('strip-facing').onchange=render;
 $('compare').onchange=render;$('speed').onchange=()=>{elapsed=0;};
 choose();let last=0;
 function tick(now){if(last&&state.playing){elapsed+=Math.min(.1,(now-last)/1000)*Number($('speed').value);const duration=1/records[state.type].metadata.clips[state.action].fps;if(elapsed>=duration){const steps=Math.floor(elapsed/duration);state.frame+=steps;elapsed-=duration*steps;render();}}last=now;requestAnimationFrame(tick);}
 window.brushReview={state,records,manifest,render,choose,play};requestAnimationFrame(tick);
}catch(error){$('error').hidden=false;$('error').textContent=error.message;throw error;}
