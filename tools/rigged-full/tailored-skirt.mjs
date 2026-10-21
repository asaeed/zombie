import * as THREE from 'three';
import {V} from './rig.mjs';
const SEGMENTS=32,HEIGHT=.56,EASE=.002,ROWS=9;
const cross=(a,b)=>a.x*b.z-a.z*b.x;
function surfacePoint(source,index){
 // CPU sampling occurs before render updates attached-mesh bind inverses.
 // Refresh it here so the previous facing cannot rotate the measured skin.
 if(source.mesh.bindMode==='attached')source.mesh.bindMatrixInverse.copy(source.mesh.matrixWorld).invert();
 const p=V().fromBufferAttribute(source.mesh.geometry.attributes.position,index);source.mesh.applyBoneTransform(index,p);return p.applyMatrix4(source.mesh.matrixWorld);
}
export function createTailoredSkirt(object,bones){
 const bindWaistY=bones.spine_01.getWorldPosition(V()).y-.01,sources=[],segments=[];
 object.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const source={mesh},g=mesh.geometry,{skinWeight,skinIndex}=g.attributes;
  const arm=Array.from({length:skinWeight.count},(_,i)=>{
   let weight=0;for(let k=0;k<4;k++)if(/^(clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)_/.test(mesh.skeleton.bones[skinIndex.getComponent(i,k)].name))weight+=skinWeight.getComponent(i,k);return weight;
  });
  const points=new Map();function point(i){if(!points.has(i))points.set(i,surfacePoint(source,i));return points.get(i);}
  for(let i=0;i<g.index.count;i+=3){
   const indices=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];if(indices.some(v=>arm[v]>=.1))continue;
   const triangle=indices.map(point),cut=[];
   for(const[a,b]of [[0,1],[1,2],[2,0]]){
    const p=triangle[a],q=triangle[b];if((p.y<=bindWaistY&&q.y>bindWaistY)||(q.y<=bindWaistY&&p.y>bindWaistY))cut.push(p.clone().lerp(q,(bindWaistY-p.y)/(q.y-p.y)));
   }
   if(cut.length===2)segments.push({source,indices,triangle,a:cut[0],b:cut[1]});
  }sources.push(source);
 });
 if(!segments.length)throw Error('No bind-pose waist surface');
 const all=segments.flatMap(s=>[s.a,s.b]),center=V((Math.min(...all.map(p=>p.x))+Math.max(...all.map(p=>p.x)))/2,bindWaistY,(Math.min(...all.map(p=>p.z))+Math.max(...all.map(p=>p.z)))/2);
 const anchors=Array.from({length:SEGMENTS},(_,i)=>{
  const direction=V(Math.sin(i/SEGMENTS*Math.PI*2),0,Math.cos(i/SEGMENTS*Math.PI*2));let best=null;
  for(const s of segments){const edge=s.b.clone().sub(s.a),a=s.a.clone().sub(center),den=cross(direction,edge);if(Math.abs(den)<1e-10)continue;const r=cross(a,edge)/den,t=cross(a,direction)/den;if(r>0&&t>=-1e-7&&t<=1+1e-7&&(!best||r>best.radius))best={...s,radius:r,point:s.a.clone().lerp(s.b,THREE.MathUtils.clamp(t,0,1))};}
  if(!best)throw Error('Missing waistband binding '+i);
  const bary=new THREE.Triangle(...best.triangle).getBarycoord(best.point,V());return {...best,bary,direction};
 });
 // Pin the waist skin and its seam to the same hip bone. Spine/thigh blending
 // otherwise makes even a skin-sampled seam drift around the pelvis.
 const pelvis=bones.pelvis,hipInverse=pelvis.matrixWorld.clone().invert();
 let pinnedVertices=0,transitionVertices=0;
 for(const source of sources){
  const g=source.mesh.geometry,pinned=new Set(segments.filter(s=>s.source===source).flatMap(s=>s.indices));if(!pinned.size)continue;
  const neighbors=new Set();for(let i=0;i<g.index.count;i+=3){const tri=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];if(tri.some(v=>pinned.has(v)))for(const v of tri)if(!pinned.has(v))neighbors.add(v);}
  const hip=source.mesh.skeleton.bones.indexOf(pelvis);if(hip<0)throw Error('Missing pelvis in waist skeleton');
  const si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
  for(const v of new Set([...pinned,...neighbors])){
   const influence=pinned.has(v)?1:.45,weights=new Map([[hip,influence]]);
   for(let k=0;k<4;k++){const bone=si.getComponent(v,k);weights.set(bone,(weights.get(bone)||0)+sw.getComponent(v,k)*(1-influence));}
   const sorted=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((n,p)=>n+p[1],0);
   for(let k=0;k<4;k++){si.setComponent(v,k,sorted[k]?.[0]??hip);sw.setComponent(v,k,(sorted[k]?.[1]??0)/sum);}
  }
  si.needsUpdate=true;sw.needsUpdate=true;pinnedVertices+=pinned.size;transitionVertices+=neighbors.size;
 }
 for(const a of anchors){
  a.hipLocal=a.point.clone().applyMatrix4(hipInverse);
  a.hipNormal=V().crossVectors(a.triangle[1].clone().sub(a.triangle[0]),a.triangle[2].clone().sub(a.triangle[0])).normalize();if(a.hipNormal.dot(a.direction)<0)a.hipNormal.negate();a.hipNormal.transformDirection(hipInverse);
 }
 const positions=new Float32Array(SEGMENTS*ROWS*3),geometry=new THREE.BufferGeometry(),indices=[];geometry.parameters={height:HEIGHT};geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 for(let row=0;row<ROWS-1;row++)for(let i=0;i<SEGMENTS;i++){const j=(i+1)%SEGMENTS,a=row*SEGMENTS+i,b=(row+1)*SEGMENTS+i,c=row*SEGMENTS+j,d=(row+1)*SEGMENTS+j;indices.push(a,b,c,c,b,d);}geometry.setIndex(indices);
 return {geometry,bindWaistY,update(skirt){
  const inverse=pelvis.matrixWorld.clone().invert(),seam=[],records=[];
  for(const a of anchors){
   const triangle=a.indices.map(i=>surfacePoint(a.source,i)),skin=triangle.reduce((p,v,i)=>p.addScaledVector(v,a.bary.getComponent(i)),V());
   const p=a.hipLocal.clone().applyMatrix4(pelvis.matrixWorld),normal=a.hipNormal.clone().transformDirection(pelvis.matrixWorld),q=p.clone().addScaledVector(normal,EASE);
   seam.push(q);records.push({mesh:a.source.mesh.name,triangle:a.indices,bary:a.bary.toArray(),hipLocal:a.hipLocal.toArray(),posedHipLocal:p.clone().applyMatrix4(inverse).toArray(),body:skin.toArray(),cloth:q.toArray(),skinFitError:skin.distanceTo(p)});
  }
  const waist=seam.reduce((c,p)=>c.add(p),V()).multiplyScalar(1/SEGMENTS),hem=waist.clone().add(V(0,-HEIGHT,0));
  for(let row=0;row<ROWS;row++)for(let i=0;i<SEGMENTS;i++){
   const t=row/(ROWS-1),d=V(seam[i].x-waist.x,0,seam[i].z-waist.z).normalize(),end=d.multiplyScalar(.29).add(hem),p=seam[i].clone().lerp(end,t);
   if(row&&row<ROWS-1){const outward=V(p.x-waist.x,0,p.z-waist.z).normalize();p.addScaledVector(outward,.009*Math.sin(t*Math.PI));}
   p.toArray(positions,(row*SEGMENTS+i)*3);
  }
  geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const error=records.map(a=>V(...a.cloth).distanceTo(V(...a.body))),waistRadius=Math.max(...seam.map(p=>Math.hypot(p.x-waist.x,p.z-waist.z)));
  skirt.userData.fit={version:'hip-bound-waist-v6',waist:waist.toArray(),hem:hem.toArray(),waistRadius,hemRadius:.29,
   attachment:{method:'rigid pelvis-local seam and matching pelvis-weighted skin band',bone:'pelvis',pinnedVertices,transitionVertices,bindWaistY,samples:SEGMENTS,minGap:Math.min(...error),maxGap:Math.max(...error),anchors:records},
   shape:{method:'stable flared panels from the hip-anchored waistband to a gravity-aligned hem',rows:ROWS,hemRadius:.29,minPanelAlignment:Math.min(...seam.map((p,i)=>{const a=V(p.x-waist.x,0,p.z-waist.z).normalize(),end=V().fromArray(positions,((ROWS-1)*SEGMENTS+i)*3);return a.dot(V(end.x-hem.x,0,end.z-hem.z).normalize());}))},
   layering:'lower legs rendered behind the opaque garment; upper body and hands retain normal depth'};
 }};
}
