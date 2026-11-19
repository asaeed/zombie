export const CAST = {
  soldier: { group:'unit', strike:'shoot', scale:.28, gather:true },
  scout: { group:'unit', strike:'shoot', scale:.26, gather:true, fps:16 },
  builder: { group:'unit', strike:'attack', scale:.28, gather:true, work:'repair' },
  medic: { group:'unit', scale:.28, gather:true, work:'heal' },
  heavy: { group:'unit', strike:'attack', scale:.315, gather:true, fps:9 },
  torchbearer: { group:'unit', strike:'attack', scale:.28, gather:true },
  runner: { group:'zombie', strike:'attack', scale:.28, bodyHeight:54, fps:20, joints:{hip:94,knee:103,ankle:111} },
  brute: { group:'zombie', strike:'attack', scale:.39, fps:7 },
  spitter: { group:'zombie', strike:'attack', scale:.28 },
  exploder: { group:'zombie', strike:'attack', scale:.305, fps:15 },
  screamer: { group:'zombie', strike:'attack', scale:.29 },
  boss: { group:'zombie', strike:'attack', scale:.48, fps:7, paddingX:16 },
  'walker-cap': { group:'zombie', strike:'attack', scale:.28 },
  'walker-dress': { group:'zombie', strike:'attack', scale:.28 },
  'walker-onearm': { group:'zombie', strike:'attack', scale:.28 },
};
export const OBJECTS = {
  hq:{group:'building',tiles:3,width:192,height:166}, wall:{group:'building',tiles:1,width:64,height:48},
  tower:{group:'building',tiles:2,width:128,height:154}, barracks:{group:'building',tiles:2,width:128,height:118},
  depot:{group:'building',tiles:2,width:128,height:100}, light:{group:'building',tiles:1,width:64,height:112},
  clinic:{group:'building',tiles:2,width:128,height:112}, mechanics:{group:'building',tiles:2,width:128,height:124},
  car:{group:'cache',width:64,height:40}, cabin:{group:'cache',width:64,height:70}, bin:{group:'cache',width:48,height:36},
  pine:{group:'decoration',width:72,height:108}, bush:{group:'decoration',width:40,height:28}, rock:{group:'decoration',width:34,height:26},
};
export function clipsFor(def) {
  const clips=[{name:'idle',frames:6,fps:6,loop:true},{name:'walk',frames:12,fps:def.fps??12,loop:true}];
  if(def.strike)clips.push({name:def.strike,frames:8,fps:def.fps===7?10:16,loop:false});
  if(def.gather)clips.push({name:'gather',frames:12,fps:10,loop:true});
  if(def.work)clips.push({name:def.work,frames:12,fps:10,loop:true});
  return clips;
}
