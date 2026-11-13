// Authored from the component paintings; values are fractions of each cropped torso or limb.
const HIPS=[[.38,.62],[.37,.63],[.43,.61],[.65,.38],[.38,.62]];
const SHOULDERS=[[.18,.82],[.18,.80],[.25,.70],[.82,.27],[.17,.83]];
const human=(hip,torso=142)=>({hip:[hip,hip,hip,hip,hip],torso,knee:[.45,.45,.45,.45,.45],ankle:.79});
const zombie=(hip,torso,knee)=>({hip:[hip,hip,hip,hip,hip],torso,knee,ankle:.80});
export const ANATOMY={
 soldier:human(.78),scout:human(.78,140),builder:{...human(.78),nearHand:.78},medic:human(.77,140),
 sniper:human(.77),heavy:{...human(.76,146),nearHand:.57},torchbearer:{...human(.78),nearHand:.68},
 walker:zombie(.88,138,[.31,.34,.34,.36,.44]),
 runner:zombie(.87,132,[.36,.38,.39,.39,.44]),
 brute:zombie(.85,146,[.38,.38,.38,.40,.44]),
 spitter:zombie(.87,138,[.35,.35,.35,.38,.44]),
 exploder:zombie(.85,146,[.37,.37,.38,.39,.44]),
 screamer:zombie(.87,138,[.35,.35,.36,.38,.44]),
 boss:zombie(.85,148,[.38,.38,.39,.40,.44]),
};
export function anatomy(def,row){
 const a=ANATOMY[def.source??def.id];
 if(!a)throw new Error('Missing authored anatomy: '+def.id);
 return {...a,hip:a.hip[row],knee:a.knee[row],hips:HIPS[row],shoulders:SHOULDERS[row],shoulderY:.40};
}
