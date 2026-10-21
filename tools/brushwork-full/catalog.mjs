export const DIRECTIONS=['S','SE','E','NE','N','NW','W','SW'];
export const SOURCE_DIRECTIONS=['S','SE','E','NE','N'];
export const MIRRORS={NW:'NE',W:'E',SW:'SE'};
export const CAST={
  soldier:{group:'unit',strike:'shoot',size:21.28,speed:90,stride:24,lift:9,bob:1.5,fps:16,gun:true},
  scout:{group:'unit',strike:'shoot',size:19.76,speed:180,stride:27,lift:11,bob:1.3,fps:20,gun:true},
  builder:{group:'unit',strike:'attack',work:'repair',size:21.28,speed:70,stride:22,lift:8,bob:1.2,fps:14},
  medic:{group:'unit',work:'heal',size:21.28,speed:100,stride:23,lift:8,bob:1.2,fps:16},
  sniper:{group:'unit',strike:'shoot',size:21.28,speed:78,stride:22,lift:8,bob:1.2,fps:14,gun:true},
  heavy:{group:'unit',strike:'attack',size:23.94,speed:62,stride:18,lift:7,bob:1.2,fps:10},
  torchbearer:{group:'unit',strike:'attack',size:21.28,speed:85,stride:22,lift:8,bob:1.2,fps:15},
  walker:{group:'zombie',strike:'attack',size:21.28,speed:35,stride:18.5,lift:6.5,bob:1.2,fps:13},
  runner:{group:'zombie',strike:'attack',size:15.12,speed:110,stride:27,lift:12,bob:2.2,fps:22},
  brute:{group:'zombie',strike:'attack',size:29.64,speed:18,stride:16,lift:5,bob:1.8,fps:7},
  spitter:{group:'zombie',strike:'attack',size:21.28,speed:30,stride:17,lift:6,bob:1.1,fps:12},
  exploder:{group:'zombie',strike:'attack',size:23.18,speed:72,stride:23,lift:8,bob:1.6,fps:17},
  screamer:{group:'zombie',strike:'attack',size:22.04,speed:42,stride:19,lift:7,bob:1.2,fps:14},
  boss:{group:'zombie',strike:'attack',size:36.48,speed:20,stride:15,lift:5,bob:1.8,fps:7},
};
for(const [id,variant]of [['walker-cap','cap'],['walker-dress','dress'],['walker-onearm','onearm']])CAST[id]={...CAST.walker,source:'walker',variant};
export function clipsFor(def){
  const clips=[{name:'idle',frames:4,fps:4,loop:true},{name:'walk',frames:16,fps:def.fps,loop:true}];
  if(def.strike)clips.push({name:def.strike,frames:8,fps:def.fps<=10?10:16,loop:false});
  if(def.group==='unit')clips.push({name:'gather',frames:12,fps:10,loop:true});
  if(def.work)clips.push({name:def.work,frames:12,fps:10,loop:true});
  return clips;
}
