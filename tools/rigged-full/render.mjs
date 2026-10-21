import * as THREE from 'three';
import {DIRECTIONS} from './catalog.mjs';
export const CELL=160,ANCHOR={x:80,y:136};
export function trim(frames,clips,cell=CELL,anchor=ANCHOR){
 let left=cell,top=cell,right=0,bottom=0;
 for(const c of frames){const p=c.getContext('2d').getImageData(0,0,cell,cell).data;for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(p[(y*cell+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
 left=Math.max(0,left-7);top=Math.max(0,top-7);right=Math.min(cell,right+8);bottom=Math.min(cell,bottom+8);
 const w=right-left,h=bottom-top,atlas=document.createElement('canvas');atlas.width=w*8;atlas.height=h*Math.ceil(frames.length/8);const g=atlas.getContext('2d');
 frames.forEach((c,n)=>g.drawImage(c,left,top,w,h,n%8*w,Math.floor(n/8)*h,w,h));
 let at=0;const metadata={};for(const clip of clips){metadata[clip.name]={fps:clip.fps,loop:clip.loop,directions:{}};for(const d of DIRECTIONS){metadata[clip.name].directions[d]=Array.from({length:clip.frames},()=>{const n=at++;return {x:n%8*w,y:Math.floor(n/8)*h,width:w,height:h};});}}
 return {atlas,cell:{width:w,height:h},footAnchor:{x:anchor.x-left,y:anchor.y-top},clips:metadata};
}
export function scene(cell=CELL,anchor=ANCHOR){
 const world=new THREE.Scene();world.add(new THREE.HemisphereLight(0xd7e8f1,0x5f7052,1.35));
 const sun=new THREE.DirectionalLight(0xf5f0e7,2.8);sun.position.set(-3,6,5);world.add(sun);
 const fill=new THREE.DirectionalLight(0xb1d3df,.7);fill.position.set(4,3,-3);world.add(fill);
 const height=2.60*cell/CELL,camera=new THREE.OrthographicCamera(-height/2,height/2,height*anchor.y/cell,-height*(cell-anchor.y)/cell,.1,50);camera.position.set(0,5,8.660254);camera.lookAt(0,0,0);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(cell*4,cell*4);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 return {world,camera,renderer};
}
