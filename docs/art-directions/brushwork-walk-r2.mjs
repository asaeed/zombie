const $=id=>document.getElementById(id),root=new URL('../../assets/brushwork/',import.meta.url),state={unit:'soldier',direction:'SE',frame:0,playing:true,fps:16,loops:0},actors={},panels=[],facings=[];
async function manifest(path){const r=await fetch(new URL(path,root));if(!r.ok)throw new Error('Manifest HTTP '+r.status);return r.json();}
async function record(m,path){const image=new Image();image.src=new URL(path,root);await image.decode();return {image,metadata:m};}
function setup(c,w,h){const ratio=Math.min(2,devicePixelRatio||1);if(c.width!==w*ratio||c.height!==h*ratio){c.width=w*ratio;c.height=h*ratio;}c.style.width=w+'px';const g=c.getContext('2d');g.setTransform(ratio,0,0,ratio,0,0);g.clearRect(0,0,w,h);g.imageSmoothingEnabled=false;return g;}
function frames(r,direction){return r.metadata.directions?.[direction]?.frames??r.metadata.frames??r.metadata.clips.walk.directions[direction];}
function frame(r,direction){const list=frames(r,direction);return list[Math.floor(state.frame*list.length/12)%list.length];}
function draw(g,r,direction,zoom,x,y){const f=frame(r,direction),m=r.metadata,s=m.renderScale*zoom;g.drawImage(r.image,f.x,f.y,f.width,f.height,x-m.footAnchor.x*s,y-m.footAnchor.y*s,f.width*s,f.height*s);}
try{
  const runtime=await manifest('manifest.json'),previous=await manifest('motion-pilot/manifest.json'),current=await manifest('motion-r2/manifest.json'),scout=await record(runtime.characters.scout,'scout.png');
  for(const id of ['soldier','walker'])actors[id]={scout,previous:await record(previous.actors[id],'motion-pilot/'+id+'.png'),mesh:await record(runtime.characters[id],id+'.png'),current:await record(current.actors[id],'motion-r2/'+id+'.png'),ungraded:await record(current.actors[id],'motion-r2/'+id+'-ungraded.png')};
  for(const[index,title]of ['Scout Reference','Previous Drawn','New Drawn'].entries()){
    const p=document.createElement('section');p.className='sample';const h=document.createElement('h2');h.textContent=title;const c=document.createElement('canvas'),n=document.createElement('canvas');n.className='native';const caption=document.createElement('p');caption.className='caption';caption.textContent='Game Size';p.append(h,c,n,caption);$('comparison').append(p);panels.push({p,h,c,n,index});
  }
  for(const direction of current.directions){const p=document.createElement('section');p.className='facing';const h=document.createElement('h3');h.textContent=direction;const c=document.createElement('canvas');p.append(h,c);$('facings').append(p);facings.push({c,direction});}
  function render(){
    state.frame=(state.frame+12)%12;const actor=actors[state.unit],newRecord=$('palette').checked?actor.current:actor.ungraded,rs=[actor.scout,state.direction==='SE'?actor.previous:actor.mesh,newRecord],dark=$('background').value==='night',zoom=Number($('zoom').value);
    $('frame').value=Math.floor(state.frame);$('counter').textContent=`${Math.floor(state.frame)+1} / 12`;$('rate').textContent=state.fps;
    panels[1].h.textContent=state.direction==='SE'?'Previous Drawn (8)':'Previous Mesh (12)';panels[2].h.textContent='New Drawn (12)';
    for(const p of panels){p.p.classList.toggle('dark',dark);const r=rs[p.index],g=setup(p.c,320,260);draw(g,r,state.direction,zoom,160,232);draw(setup(p.n,100,40),r,state.direction,1,50,34);
      if($('anchors').checked){g.strokeStyle='#eef4ee';g.lineWidth=1;g.beginPath();g.moveTo(130,232);g.lineTo(190,232);if(p.index===2){const m=r.metadata,t=m.directions[state.direction].alignment.target,s=m.renderScale*zoom,x=160+(t.x-m.footAnchor.x)*s,y=232+(t.y-m.footAnchor.y)*s;g.moveTo(x-5,y);g.lineTo(x+5,y);g.moveTo(x,y-5);g.lineTo(x,y+5);}g.stroke();}
    }
    $('facings').classList.toggle('dark',dark);for(const f of facings)draw(setup(f.c,180,130),newRecord,f.direction,4,90,116);
    const g=setup($('strip'),12*128,168),list=frames(newRecord,state.direction),m=newRecord.metadata,s=m.renderScale*5;
    list.forEach((f,n)=>g.drawImage(newRecord.image,f.x,f.y,f.width,f.height,n*128+64-m.footAnchor.x*s,144-m.footAnchor.y*s,f.width*s,f.height*s));
  }
  function play(value){state.playing=value;$('play').innerHTML=value?'&#10074;&#10074;':'&#9654;';$('play').title=value?'Pause':'Play';$('play').setAttribute('aria-label',$('play').title);}
  $('unit').onchange=()=>{state.unit=$('unit').value;state.frame=0;state.fps=actors[state.unit].current.metadata.fps;$('fps').value=state.fps;render();};
  $('direction').onchange=()=>{state.direction=$('direction').value;state.frame=0;state.loops=0;render();};
  $('play').onclick=()=>play(!state.playing);for(const[id,delta]of [['previous',-1],['next',1]])$(id).onclick=()=>{play(false);state.frame=Math.floor(state.frame)+delta;render();};
  $('frame').oninput=()=>{play(false);state.frame=Number($('frame').value);render();};$('fps').oninput=()=>{state.fps=Number($('fps').value);render();};
  for(const id of ['zoom','background','palette','anchors'])$(id).onchange=render;
  let last=0;function tick(now){if(last&&state.playing){const next=state.frame+Math.min(.1,(now-last)/1000)*state.fps;if(next>=12){state.loops++;if($('turn').checked&&state.loops%2===0){const n=current.directions.indexOf(state.direction);state.direction=current.directions[(n+1)%current.directions.length];$('direction').value=state.direction;}}state.frame=next;render();}last=now;requestAnimationFrame(tick);}
  window.walkReview={state,actors,panels,facings,manifest:current,frames,render,play};render();requestAnimationFrame(tick);
}catch(error){$('error').hidden=false;$('error').textContent=error.message;throw error;}
