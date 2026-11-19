const $=id=>document.getElementById(id),root=new URL('../../assets/rigged-pilot/',import.meta.url),oldRoot=new URL('../../assets/brushwork-full/',import.meta.url);
const state={type:'soldier',action:'walk',frame:0,playing:true},records={},baseline={};let elapsed=0,last=0,filmKey='';
async function load(root,id,metadata){const image=new Image();image.src=new URL(metadata.image,root);await image.decode();return {image,metadata};}
function options(select,values){select.replaceChildren(...values.map(v=>Object.assign(document.createElement('option'),{value:v,textContent:v})));}
function surface(c,w,h){const dpr=Math.min(devicePixelRatio||1,2);c.width=Math.ceil(w*dpr);c.height=Math.ceil(h*dpr);c.style.width=w+'px';c.style.height=h+'px';const g=c.getContext('2d');g.scale(dpr,dpr);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';return g;}
function draw(g,r,f,s,x,y){const a=r.metadata.footAnchor;g.drawImage(r.image,f.x,f.y,f.width,f.height,x-a.x*s,y-a.y*s,f.width*s,f.height*s);}
try{
 const manifest=await(await fetch(new URL('manifest.json',root))).json(),before=await(await fetch(new URL('manifest.json',oldRoot))).json();
 for(const id of ['soldier','walker']){records[id]=await load(root,id,manifest.characters[id]);baseline[id]=await load(oldRoot,id,before.characters[id]);}
 options($('facing'),manifest.characters.soldier.directions);
 const panels=manifest.characters.soldier.directions.map(direction=>{
  const panel=document.createElement('section');panel.className='view';const c=document.createElement('canvas'),native=document.createElement('div'),small=document.createElement('canvas'),caption=document.createElement('div'),label=document.createElement('p');native.className='native';native.append(small);caption.className='caption';caption.innerHTML='<span>Painted</span><span>Rigged Trial</span>';label.className='direction';label.textContent=direction;panel.append(c,caption,native,label);$('views').append(panel);return {panel,c,small,direction};
 });
 function render(){
  const r=records[state.type],old=baseline[state.type],clip=r.metadata.clips[state.action],count=clip.directions.S.length;state.frame=(state.frame+count)%count;$('frame').value=state.frame;$('counter').textContent=`${state.frame+1} / ${count}`;
  for(const p of panels){
   p.panel.classList.toggle('dark',$('light').value==='night');const f=clip.directions[p.direction][state.frame],oldFrames=old.metadata.clips[state.action].directions[p.direction],oldF=oldFrames[Math.min(oldFrames.length-1,Math.round(state.frame/(count-1)*(oldFrames.length-1)))];
   const w=p.panel.clientWidth-8,h=innerWidth<680?160:190,g=surface(p.c,w,h),scale=Math.min(1.4,w/(f.width*2.05));draw(g,old,oldF,scale,w*.25,h-14);draw(g,r,f,scale,w*.75,h-14);
   const ng=surface(p.small,90,42);draw(ng,old,oldF,old.metadata.renderScale,23,38);draw(ng,r,f,r.metadata.renderScale,67,38);
  }
  const key=state.type+'/'+state.action+'/'+$('facing').value;if(key!==filmKey){filmKey=key;const cell=r.metadata.cell.width,a=r.metadata.footAnchor,g=surface($('film'),count*cell,cell*2+16);clip.directions[$('facing').value].forEach((f,i)=>{const fs=old.metadata.clips[state.action].directions[$('facing').value],of=fs[Math.min(fs.length-1,Math.round(i/(count-1)*(fs.length-1)))];draw(g,old,of,1,i*cell+a.x,a.y);draw(g,r,f,1,i*cell+a.x,a.y+cell+8);});}
 }
 function choose(){$('unit').value=state.type;const values=Object.keys(records[state.type].metadata.clips);if(!values.includes(state.action))state.action=values[0];options($('action'),values);$('action').value=state.action;state.frame=0;elapsed=0;render();}
 function play(value){state.playing=value;elapsed=0;$('play').innerHTML=value?'&#10074;&#10074;':'&#9654;';$('play').title=value?'Pause':'Play';$('play').setAttribute('aria-label',$('play').title);}
 $('unit').onchange=()=>{state.type=$('unit').value;choose();};$('action').onchange=()=>{state.action=$('action').value;state.frame=0;elapsed=0;render();};$('play').onclick=()=>play(!state.playing);
 for(const[id,delta]of[['previous',-1],['next',1]])$(id).onclick=()=>{play(false);state.frame+=delta;render();};
 $('frame').oninput=()=>{play(false);state.frame=Number($('frame').value);render();};$('facing').onchange=render;$('light').onchange=render;$('speed').onchange=()=>{elapsed=0;};addEventListener('resize',render);
 choose();window.riggedReview={state,records,baseline,manifest,render,choose,play};
 function tick(now){if(last&&state.playing){elapsed+=Math.min(.1,(now-last)/1000)*Number($('speed').value);const duration=1/records[state.type].metadata.clips[state.action].fps;if(elapsed>=duration){const steps=Math.floor(elapsed/duration);state.frame+=steps;elapsed-=steps*duration;render();}}last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
}catch(error){$('error').hidden=false;$('error').textContent=error.message;throw error;}
