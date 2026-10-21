export const FACINGS=['S','SE','E','NE','N','NW','W','SW'];
export const CLIPS={
 soldier:[{name:'idle',source:'Idle_Loop',frames:16,fps:8,loop:true},{name:'walk',source:'Walk_Loop',frames:16,fps:16,loop:true},{name:'shoot',source:'Pistol_Shoot',frames:16,fps:24,loop:false},{name:'gather',source:'PickUp_Table',frames:16,fps:12,loop:true}],
 walker:[{name:'idle',source:'Idle_Loop',frames:16,fps:8,loop:true},{name:'walk',source:'Walk_Loop',frames:16,fps:10,loop:true},{name:'attack',source:'Idle_Loop',frames:16,fps:18,loop:false}],
};
export function phase(frame,count,loop){return frame/(loop?count:count-1);}
export function pulse(t){return Math.sin(Math.PI*t)**2;}
function weaponPose(action,t){
 const a=action==='shoot'?Math.max(0,Math.min(1,t/.2,(1-t)/.2)):0,raised=a*a*(3-2*a);
 const recoil=action==='shoot'&&t>.2&&t<.8?.04*pulse((t-.2)/.6):0;
 const right=[-.16+.18*raised,1.10+.20*raised,.17+.05*raised-recoil];
 const forward=[.832*(1-raised),-.115*(1-raised),.555+.445*raised],length=Math.hypot(...forward);for(let i=0;i<3;i++)forward[i]/=length;
 const left=right.map((n,i)=>n+[.02,.06,0][i]+forward[i]*.18);
 return {left,right,forward};
}
export function targetHands(type,action,t){
 const p=pulse(t),s=Math.sin(t*Math.PI*2);
 if(type==='walker'){
  if(action==='attack')return {left:[.24-.06*p,1.15+.43*p,.22+.22*p],right:[-.24+.06*p,1.13+.45*p,.22+.22*p]};
  return {left:[.24,1.14+.02*s,.21],right:[-.24,1.12-.02*s,.21]};
 }
 if(action==='gather')return null;
 return weaponPose(action,t);
}
