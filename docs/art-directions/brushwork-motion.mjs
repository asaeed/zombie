const $=id=>document.getElementById(id),root=new URL('../../assets/brushwork/',import.meta.url);
const state={unit:'soldier',frame:0,playing:true,fps:10,reference:'scout'},records={},baselines={},panels=[];
async function manifest(path){const r=await fetch(new URL(path,root));if(!r.ok)throw new Error('Manifest HTTP '+r.status);return r.json();}
async function record(m,path){const im=new Image();im.src=new URL(path,root);await im.decode();return {image:im,metadata:m};}
function setup(c,width,height){const dpr=Math.min(2,devicePixelRatio||1);c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);c.style.width=width+'px';const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);return g;}
try{
  const old=await manifest('motion-pilot/old-manifest.json'),sharp=await manifest('manifest.json'),before=await manifest('motion-pilot/before-manifest.json'),drawn=await manifest('motion-pilot/manifest.json');
  const scout=await record(sharp.characters.scout,'scout.png');
  for(const id of ['soldier','walker']){
    baselines[id]={scout,original:await record(old.characters[id],'motion-pilot/old-'+id+'.png'),mesh:await record(sharp.characters[id],id+'.png')};
    records[id]=[scout,await record(before.actors[id],'motion-pilot/before-'+id+'.png'),await record(drawn.actors[id],'motion-pilot/'+id+'.png')];
  }
  for(const[index,title]of ['Scout Reference','Before Alignment','Aligned Drawn'].entries()){
    const p=document.createElement('section');p.className='sample';const h=document.createElement('h2');h.textContent=title;
    const c=document.createElement('canvas'),n=document.createElement('canvas');n.className='native';
    const caption=document.createElement('p');caption.className='caption';caption.textContent='Game Size';p.append(h,c,n,caption);$('comparison').append(p);
    panels.push({p,c,n,h,index});
  }
  function draw(g,r,f,zoom,x,y,smooth){const m=r.metadata,scale=m.renderScale*zoom;g.imageSmoothingEnabled=smooth;g.drawImage(r.image,f.x,f.y,f.width,f.height,x-m.footAnchor.x*scale,y-m.footAnchor.y*scale,f.width*scale,f.height*scale);}
  function frame(r,index){const frames=r.metadata.frames??r.metadata.clips.walk.directions.SE;return frames[Math.floor(index*frames.length/8)%frames.length];}
  function render(){
    const rs=records[state.unit];rs[0]=baselines[state.unit][state.reference];state.frame=(state.frame+8)%8;const index=Math.floor(state.frame);$('frame').value=index;$('counter').textContent=`${index+1} / 8`;$('rate').textContent=state.fps;
    panels[0].h.textContent={scout:'Scout Reference',original:'Original (filtered)',mesh:'Sharp (mesh)'}[state.reference];
    for(const p of panels){const r=rs[p.index],f=frame(r,state.frame),zoom=Number($('zoom').value),g=setup(p.c,320,240),smooth=p.index===0&&state.reference==='original';p.p.classList.toggle('dark',$('background').value==='night');
      draw(g,r,f,zoom,160,212,smooth);
      draw(setup(p.n,100,40),r,f,1,50,34,smooth);
      if($('anchors').checked){const m=r.metadata,scale=m.renderScale*zoom,target=records[state.unit][2].metadata.alignment.target;
        g.strokeStyle='#eef4ee';g.lineWidth=1;g.beginPath();g.moveTo(130,212);g.lineTo(190,212);
        if(p.index){const x=160+(target.x-m.footAnchor.x)*scale,y=212+(target.y-m.footAnchor.y)*scale;g.moveTo(x-5,y);g.lineTo(x+5,y);g.moveTo(x,y-5);g.lineTo(x,y+5);}
        g.stroke();
      }
    }
    const r=rs[2],c=$('strip'),g=setup(c,8*128,168);
    r.metadata.frames.forEach((f,n)=>draw(g,r,f,5,n*128+64,144,false));
  }
  function play(value){state.playing=value;$('play').innerHTML=value?'&#10074;&#10074;':'&#9654;';$('play').title=value?'Pause':'Play';$('play').setAttribute('aria-label',$('play').title);}
  $('unit').onchange=()=>{state.unit=$('unit').value;state.frame=0;state.fps=records[state.unit][2].metadata.fps;$('fps').value=state.fps;render();};
  $('play').onclick=()=>play(!state.playing);
  for(const[id,delta]of [['previous',-1],['next',1]])$(id).onclick=()=>{play(false);state.frame=Math.floor(state.frame)+delta;render();};
  $('frame').oninput=()=>{play(false);state.frame=Number($('frame').value);render();};$('fps').oninput=()=>{state.fps=Number($('fps').value);render();};
  for(const id of ['zoom','background'])$(id).onchange=render;
  $('reference').onchange=()=>{state.reference=$('reference').value;render();};$('anchors').onchange=render;
  let last=0;
  // Preserve each reference's complete cycle, including the scout's twelve frames.
  function tick(now){if(last&&state.playing){state.frame+=Math.min(.1,(now-last)/1000)*state.fps;render();}last=now;requestAnimationFrame(tick);}
  window.motionReview={state,records,baselines,panels,drawn,render,play};render();requestAnimationFrame(tick);
}catch(error){$('error').hidden=false;$('error').textContent=error.message;throw error;}
