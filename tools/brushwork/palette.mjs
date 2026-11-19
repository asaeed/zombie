const clamp=n=>Math.max(0,Math.min(1,n));
function hsl(r,g,b){r/=255;g/=255;b/=255;const lo=Math.min(r,g,b),hi=Math.max(r,g,b),d=hi-lo,l=(hi+lo)/2;let h=0;
  if(d){if(hi===r)h=((g-b)/d+6)%6;else if(hi===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;}
  return {h,s:d?d/(1-Math.abs(2*l-1)):0,l};
}
function rgb(h,s,l){const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return [f(0),f(8),f(4)];}
function sample(data,i,kind){if(data[i+3]<128)return null;const r=data[i],g=data[i+1],b=data[i+2];
  if(kind==='grey')return {h:0,s:0,l:(.2126*r+.7152*g+.0722*b)/255};
  if(!(b>40&&b>r*1.2&&b>g*1.02))return null;const color=hsl(r,g,b);return color.s>.18&&color.h>.5&&color.h<.72?color:null;
}
function distribution(data,kind){const bins=Array(256).fill(0);let count=0,h=0,s=0,total=0;
  for(let i=0;i<data.length;i+=4){const c=sample(data,i,kind);if(!c)continue;bins[Math.round(c.l*255)]++;count++;h+=c.h;s+=c.s;total+=c.l;}
  if(!count)throw new Error('Missing palette samples: '+kind);
  return {kind,bins,count,h:h/count,s:s/count,mean:total/count};
}
export function paletteReference(data,kind){if(!['blue','grey'].includes(kind))throw new Error('Unknown palette material: '+kind);return distribution(data,kind);}
export function lockPalette(data,reference){
  const source=distribution(data,reference.kind),sourceMid=[],targetCDF=[];let sum=0;
  for(let n=0;n<256;n++){sourceMid[n]=(sum+source.bins[n]/2)/source.count;sum+=source.bins[n];}
  sum=0;for(const n of reference.bins){sum+=n;targetCDF.push(sum/reference.count);}
  const lookup=sourceMid.map(q=>{let n=0;while(n<255&&targetCDF[n]<q)n++;return n/255;});
  for(let i=0;i<data.length;i+=4){const c=sample(data,i,reference.kind);if(!c)continue;const l=clamp(lookup[Math.round(c.l*255)]);data.set(rgb(reference.h,reference.s,l),i);}
  const after=distribution(data,reference.kind);
  return {before:{mean:source.mean,h:source.h,s:source.s},after:{mean:after.mean,h:after.h,s:after.s},pixels:source.count};
}
