const $=id=>document.getElementById(id),root=new URL('../../assets/brushwork/',import.meta.url);
const state={type:'soldier',action:'walk',frame:0,playing:true},records={};
const options=(select,values)=>select.replaceChildren(...values.map(value=>Object.assign(document.createElement('option'),{value,textContent:value.replaceAll('-',' ')})));
try {
  const response=await fetch(new URL('manifest.json',root));if(!response.ok)throw new Error(`Manifest HTTP ${response.status}`);
  const manifest=await response.json();
  for(const[id,metadata]of Object.entries(manifest.characters)){
    const image=new Image();image.src=new URL(metadata.image,root);await image.decode();records[id]={image,metadata};
  }
  options($('unit'),Object.keys(records));
  const panels=manifest.characters.soldier.directions.map(direction=>{
    const panel=document.createElement('section');panel.className='view';
    const c=document.createElement('canvas');c.width=256;c.height=210;
    const caption=document.createElement('p');caption.className='caption';caption.textContent=direction;
    const native=document.createElement('div');native.className='native';const small=document.createElement('canvas');native.append(small);
    panel.append(c,native,caption);$('views').append(panel);return {direction,panel,canvas:c,native:small};
  });
  function draw(ctx,record,frame,scale,centerX,footY){
    const {footAnchor}=record.metadata;ctx.imageSmoothingEnabled=manifest.imageSmoothing===true;
    ctx.drawImage(record.image,frame.x,frame.y,frame.width,frame.height,centerX-footAnchor.x*scale,footY-footAnchor.y*scale,frame.width*scale,frame.height*scale);
  }
  function render(){
    const r=records[state.type],clip=r.metadata.clips[state.action],count=clip.directions.S.length;state.frame%=count;
    $('frame').max=count-1;$('frame').value=state.frame;$('counter').textContent=`${state.frame+1} / ${count}`;
    const dark=$('background').value==='night';
    for(const p of panels){
      p.panel.classList.toggle('dark',dark);const f=clip.directions[p.direction][state.frame],g=p.canvas.getContext('2d');g.clearRect(0,0,256,210);
      draw(g,r,f,Math.min(2.2,180/r.metadata.bodyHeight),128,188);
      const small=p.native;small.width=Math.ceil(f.width*r.metadata.renderScale);small.height=Math.ceil(f.height*r.metadata.renderScale);
      draw(small.getContext('2d'),r,f,r.metadata.renderScale,r.metadata.footAnchor.x*r.metadata.renderScale,r.metadata.footAnchor.y*r.metadata.renderScale);
    }
    const c=$('strip'),width=r.metadata.cell.width,height=r.metadata.cell.height;c.width=count*width;c.height=height+16;const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);
    clip.directions.SE.forEach((f,i)=>draw(g,r,f,1,i*width+r.metadata.footAnchor.x,r.metadata.footAnchor.y+8));
  }
  function choose(){const actions=Object.keys(records[state.type].metadata.clips);if(!actions.includes(state.action))state.action=actions[0];options($('action'),actions);$('action').value=state.action;state.frame=0;render();}
  function play(value){state.playing=value;$('play').innerHTML=value?'&#10074;&#10074;':'&#9654;';$('play').title=value?'Pause':'Play';$('play').setAttribute('aria-label',$('play').title);}
  $('unit').onchange=()=>{state.type=$('unit').value;choose();};$('action').onchange=()=>{state.action=$('action').value;state.frame=0;render();};
  $('play').onclick=()=>play(!state.playing);$('background').onchange=render;
  for(const[id,delta]of[['previous',-1],['next',1]])$(id).onclick=()=>{play(false);const n=records[state.type].metadata.clips[state.action].directions.S.length;state.frame=(state.frame+delta+n)%n;render();};
  $('frame').oninput=()=>{play(false);state.frame=Number($('frame').value);render();};
  choose();let last=0,elapsed=0;
  function tick(now){if(last&&state.playing){elapsed+=(now-last)/1000;const duration=1/records[state.type].metadata.clips[state.action].fps;while(elapsed>=duration){state.frame++;elapsed-=duration;}render();}last=now;requestAnimationFrame(tick);}
  window.brushReview={state,records,manifest,render,choose,play};requestAnimationFrame(tick);
}catch(error){$('error').hidden=false;$('error').textContent=error.message;throw error;}
