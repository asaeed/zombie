const root='../../assets/sculpted-pixel/';
const directions=['S','SE','E','NE','N','NW','W','SW'];
const records={};
const state={type:'sniper',action:'walk',direction:'SE',background:'terrain',frame:0,playing:true,speed:1};
const byId=id=>document.getElementById(id);
const canvasIds=['large','game','directions','contact','strip'];
let last=0;
function ground(ctx,w,h){
  ctx.fillStyle={terrain:'#34483a',dark:'#1e2421',light:'#d8dfd6'}[state.background];ctx.fillRect(0,0,w,h);
  if(state.background!=='terrain')return;
  ctx.strokeStyle='#3e5744';ctx.lineWidth=1;
  for(let y=-32;y<h+32;y+=32)for(let x=-64;x<w+64;x+=64){const ox=x+(Math.floor(y/32)%2)*32;ctx.beginPath();ctx.moveTo(ox,y);ctx.lineTo(ox+32,y+16);ctx.lineTo(ox,y+32);ctx.lineTo(ox-32,y+16);ctx.closePath();ctx.stroke();}
}
function sprite(ctx,type,action,direction,frame,x,y,scale){
  const record=records[type],clip=record.metadata.clips[action],cells=clip.directions[direction],cell=cells[frame%cells.length];
  const anchor=record.metadata.footAnchor;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(record.image,cell.x,cell.y,cell.width,cell.height,x-anchor.x*scale,y-anchor.y*scale,cell.width*scale,cell.height*scale);
}
function render(){
  const record=records[state.type],clip=record.metadata.clips[state.action],count=clip.directions[state.direction].length;
  state.frame%=count;
  const gameCanvas=byId('game'),gameWidth=Math.round(gameCanvas.clientWidth)||420;
  if(gameCanvas.width!==gameWidth)gameCanvas.width=gameWidth;
  for(const id of canvasIds){const canvas=byId(id);ground(canvas.getContext('2d'),canvas.width,canvas.height);}
  const normalized=128/record.metadata.cell.height;
  const spacing=Math.round(record.metadata.cell.width*normalized);
  const enlargedScale=Math.min(3*normalized,360/record.metadata.cell.width,320/record.metadata.cell.height);
  sprite(byId('large').getContext('2d'),state.type,state.action,state.direction,state.frame,192,348,enlargedScale);
  const game=byId('game').getContext('2d');
  const shadow=(type,x,y)=>{const meta=records[type].metadata,r=meta.bodyHeight*meta.renderScale*.33;game.fillStyle='rgba(0,0,0,.3)';game.beginPath();game.ellipse(x,y,r,r*.43,0,0,Math.PI*2);game.fill();};
  const positions=[.19,.5,.81].map(fraction=>gameWidth*fraction);
  for(const [i,x]of positions.entries()){shadow(state.type,x,126);sprite(game,state.type,state.action,directions[(directions.indexOf(state.direction)+i*2)%8],state.frame,x,126,record.metadata.renderScale);}
  for(const [i,x]of positions.entries()){const type=record.metadata.group==='zombie'?'sniper':'walker';shadow(type,x,252);sprite(game,type,'walk',directions[(i*3+1)%8],state.frame,x,252,records[type].metadata.renderScale);}
  const all=byId('directions').getContext('2d'),contact=byId('contact').getContext('2d');
  for(let i=0;i<8;i++){
    const x=(i%4)*spacing+record.metadata.footAnchor.x*normalized,y=Math.floor(i/4)*128+116;
    sprite(all,state.type,state.action,directions[i],state.frame,x,y,normalized);
    sprite(contact,state.type,'idle',directions[i],0,x,y,normalized);
    all.fillStyle=contact.fillStyle=state.background==='light'?'#314530':'#d3dfc8';all.font=contact.font='12px system-ui';all.fillText(directions[i],x-7,y+10);contact.fillText(directions[i],x-7,y+10);
  }
  const strip=byId('strip'),stripCtx=strip.getContext('2d');
  for(let i=0;i<count;i++){
    sprite(stripCtx,state.type,state.action,state.direction,i,i*spacing+record.metadata.footAnchor.x*normalized,116,normalized);
    if(i===state.frame){stripCtx.strokeStyle='#d3de9a';stripCtx.lineWidth=2;stripCtx.strokeRect(i*spacing+2,2,spacing-4,124);}
  }
  byId('frame').value=state.frame;byId('frameName').textContent=(state.frame+1)+' / '+count;
  byId('fps').textContent=clip.fps+' fps';
}
function choose(){
  const record=records[state.type];
  if(!record.metadata.clips[state.action])state.action=record.metadata.clips.walk?'walk':'idle';
  state.frame=0;last=0;
  byId('actions').replaceChildren(...Object.keys(record.metadata.clips).map(action=>{
    const button=document.createElement('button');button.textContent=action[0].toUpperCase()+action.slice(1);button.type='button';button.dataset.action=action;button.setAttribute('aria-pressed',String(action===state.action));button.onclick=()=>{state.action=action;choose();};return button;
  }));
  byId('characters').value=state.type;
  const count=record.metadata.clips[state.action].directions[state.direction].length;
  const spacing=Math.round(record.metadata.cell.width*128/record.metadata.cell.height);
  byId('frame').max=count-1;byId('strip').width=count*spacing;
  byId('directions').width=byId('contact').width=spacing*4;
  byId('png').href=record.image.src;byId('json').href=record.metadataURL;
  const total=Object.values(record.metadata.clips).reduce((sum,clip)=>sum+Object.values(clip.directions).flat().length,0);
  byId('status').textContent=total+' frames / 8 facings / '+record.metadata.cell.width+' x '+record.metadata.cell.height+' cells';render();
}
function play(value){
  state.playing=value;last=0;
  byId('play').title=value?'Pause':'Play';byId('play').setAttribute('aria-label',byId('play').title);
  byId('play').querySelector('path').setAttribute('d',value?'M6 3h4v18H6zM14 3h4v18h-4z':'m6 3 14 9-14 9z');
}
function tick(time){
  if(state.playing&&time-last>=1000/records[state.type].metadata.clips[state.action].fps/state.speed){state.frame++;last=time;render();}
  requestAnimationFrame(tick);
}
try{
  const manifest=await(await fetch(root+'world/manifest.json')).json();
  await Promise.all(Object.entries(manifest.characters).map(async([type,metadata])=>{
    const image=new Image();image.src=root+'world/'+metadata.image;await image.decode();
    const metadataURL=root+(type==='sniper'||type==='walker'?'':'world/')+type+'.json';
    records[type]={metadata,image,metadataURL};
  }));
  byId('characters').replaceChildren(...['unit','zombie','vehicle'].map(group=>{
    const element=document.createElement('optgroup');element.label={unit:'Player units',zombie:'Zombies',vehicle:'Vehicles'}[group];
    for(const[type,record]of Object.entries(records))if(record.metadata.group===group){const option=new Option(type==='suv'?'White SUV':type[0].toUpperCase()+type.slice(1),type);element.append(option);}
    return element;
  }));
  byId('characters').onchange=()=>{state.type=byId('characters').value;choose();};
  for(const button of document.querySelectorAll('[data-bg]'))button.onclick=()=>{state.background=button.dataset.bg;for(const b of document.querySelectorAll('[data-bg]'))b.setAttribute('aria-pressed',String(b===button));render();};
  byId('direction').onchange=()=>{state.direction=byId('direction').value;render();};
  byId('play').onclick=()=>play(!state.playing);
  byId('previous').onclick=()=>{play(false);const count=records[state.type].metadata.clips[state.action].directions[state.direction].length;state.frame=(state.frame+count-1)%count;render();};
  byId('next').onclick=()=>{play(false);state.frame++;render();};
  byId('frame').oninput=()=>{play(false);state.frame=Number(byId('frame').value);render();};
  byId('speed').oninput=()=>{state.speed=Number(byId('speed').value);byId('speedName').textContent=state.speed+'x';};
  byId('strip').onclick=event=>{const rect=event.currentTarget.getBoundingClientRect();play(false);const count=records[state.type].metadata.clips[state.action].directions[state.direction].length;state.frame=Math.min(count-1,Math.floor((event.clientX-rect.left)/rect.width*count));render();};
  window.addEventListener('resize',render);
  choose();requestAnimationFrame(tick);window.spriteReview={state,records,render,choose,play};
}catch(error){byId('failure').hidden=false;byId('failure').textContent=error.message;throw error;}
