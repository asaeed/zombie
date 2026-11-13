function median(values){const a=values.slice().sort((a,b)=>a-b);return a[Math.floor(a.length/2)];}

export function measureHeadRoot(rgba,width,height,bodyHeight){
  let top=height;
  for(let y=0;y<height;y++){
    let n=0;for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=128)n++;
    if(n>=3){top=y;break;}
  }
  if(top===height)throw new Error('Cannot align a blank sprite');
  const centers=[],widths=[];
  for(let y=top+Math.max(1,Math.round(bodyHeight*.015));y<=top+Math.max(2,Math.round(bodyHeight*.05));y++){
    let left=width,right=-1;
    for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=128){left=Math.min(left,x);right=x;}
    if(right>=left){centers.push((left+right)/2);widths.push(right-left+1);}
  }
  if(!centers.length)throw new Error('Missing head silhouette');
  return {x:median(centers),y:top,headWidth:median(widths)};
}

export function rootMotion(roots,scale=1){
  const steps=roots.map((a,n)=>{const b=roots[(n+1)%roots.length];return Math.hypot(a.x-b.x,a.y-b.y)*scale;});
  return {maxStep:Math.max(...steps),wrapStep:steps.at(-1),spanX:(Math.max(...roots.map(p=>p.x))-Math.min(...roots.map(p=>p.x)))*scale,
    spanY:(Math.max(...roots.map(p=>p.y))-Math.min(...roots.map(p=>p.y)))*scale};
}
