import * as THREE from 'three';
// An open-faced bob, modeled in head-local space. The scalp cap, side/back
// panels and swept fringe form one fitted style rather than a spherical hat.
export function createBobHair(){
 const root=new THREE.Group();root.name='chin-length-bob';
 function surface(rows,columns,point){
  const positions=[],colors=[],indices=[];
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){
   const u=r/rows,v=c/columns;positions.push(...point(u,v));
   const light=.97+.045*Math.sin(v*Math.PI*12)+.025*u;colors.push(.036*light,.025*light,.020*light);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const a=r*(columns+1)+c,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide}));root.add(mesh);
 }
 surface(10,40,(u,v)=>{const phi=u*Math.PI/2,a=v*Math.PI*2,r=Math.sin(phi);return [.106*r*Math.sin(a),.112+.116*Math.cos(phi),.010+.115*r*Math.cos(a)];});
 surface(6,32,(u,v)=>{const a=.88+v*(Math.PI*2-1.76),flare=1+.055*Math.sin(u*Math.PI),bottom=-.019+.006*Math.cos(a*3);return [.106*flare*Math.sin(a),THREE.MathUtils.lerp(.112,bottom,u),.010+.115*flare*Math.cos(a)];});
 // The fringe sweeps diagonally across the forehead above the eyes.
 surface(4,16,(u,v)=>{const a=-.88+v*1.76,top=.177-.012*Math.cos(a),bottom=.118+.026*v,angle=THREE.MathUtils.lerp(.78,Math.PI/2,u),r=Math.sin(angle);return [.108*r*Math.sin(a),THREE.MathUtils.lerp(top,bottom,u),.012+.118*r*Math.cos(a)];});
 root.userData.style='dark chin-length bob with side-swept fringe';return root;
}
