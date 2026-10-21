import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const manifest=JSON.parse(readFileSync(new URL('../assets/rigged-full/manifest.json',import.meta.url)));
const runner=manifest.characters.runner;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('Runner claws reach forward and rake inward/down without unreachable raised-arm targets',()=>{
  assert.equal(runner.clips.attack.directions.S.length/runner.clips.attack.fps,16/24);
  for(const direction of runner.directions){
    const poses=runner.production.measurements.filter(r=>r.action==='attack'&&r.direction===direction);
    for(const side of ['l','r']){
      const reach=poses.map(r=>r.joints[side].wrist.map((v,i)=>v-r.joints[side].shoulder[i]));
      const peak=reach.reduce((best,p,i)=>p[2]>reach[best][2]?i:best,0);
      const rake=reach.reduce((best,p,i)=>i>peak&&p[1]<reach[best][1]?i:best,peak);
      assert.ok(reach[peak][2]>.40,side+' reaches toward the target');
      assert.ok(reach[peak][1]-reach[rake][1]>.20,side+' rakes downward after reaching');
      assert.ok(Math.abs(reach[peak][0]-reach[rake][0])>.15,side+' rakes across the target');
      for(const [i,r]of poses.entries()){
        assert.ok(reach[i][1]<.12,side+' hand stays near chest height');
        assert.ok(r.handErrors[side].error<1e-5,side+' reachable wrist target');
        assert.ok(r.handDirections[side][2]>.9,side+' claws point forward');
      }
    }
  }
});

test('Runner lunges from a planted rear foot, steps forward and recovers its stance',()=>{
  for(const direction of runner.directions){
    const poses=runner.production.measurements.filter(r=>r.action==='attack'&&r.direction===direction);
    const first=poses[0],last=poses.at(-1),peak=poses.reduce((a,b)=>a.attackMotion.drive>b.attackMotion.drive?a:b);
    assert.ok(peak.joints.r.hip[2]-first.joints.r.hip[2]>.25,'body drives forward');
    assert.ok(peak.joints.l.ankle[2]-first.joints.l.ankle[2]>.30,'lead foot steps into lunge');
    for(const r of poses){
      assert.ok(distance(r.joints.r.ankle,first.joints.r.ankle)<1e-5,'rear foot remains planted');
      for(const error of Object.values(r.attackMotion.footErrors))assert.ok(error<1e-5,'reachable foot placement');
    }
    for(const side of ['l','r'])for(const joint of ['shoulder','elbow','wrist','hip','knee','ankle'])assert.ok(distance(first.joints[side][joint],last.joints[side][joint])<1e-5,'returns to starting stance');
  }
});
