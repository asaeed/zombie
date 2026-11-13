import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({window:{innerWidth:1200,innerHeight:900}});
for (const name of ['config','utils','pathfinding','entities','game']) {
  vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),context);
}
const {Game,Building,Unit,Vehicle,BUILDING_DEFS,MAP_W,MAP_H,EXPLODER_BLAST_RADIUS,EXPLODER_SHOT_RADIUS} =
  vm.runInContext('({Game,Building,Unit,Vehicle,BUILDING_DEFS,MAP_W,MAP_H,EXPLODER_BLAST_RADIUS,EXPLODER_SHOT_RADIUS})',context);
function fixture() {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H},()=>new Uint8Array(MAP_W));
  return game;
}

for (const {premature,radius,buildingDamage,unitDamage,vehicleDamage} of [
  {premature:false,radius:156,buildingDamage:150,unitDamage:105,vehicleDamage:90},
  {premature:true,radius:270,buildingDamage:45,unitDamage:36,vehicleDamage:27},
]) test(`${premature?'shot-down':'contact'} explosions use reduced structural damage with the existing radius and falloff`,()=>{
  assert.equal(premature?EXPLODER_SHOT_RADIUS:EXPLODER_BLAST_RADIUS,radius);
  const game = fixture(),building = new Building('hq',20,20);
  const unit = new Unit('heavy',building.x,building.y),vehicle = new Vehicle('suv',building.x,building.y);
  game.buildings = [building];game.units = [unit];game.vehicles = [vehicle];
  game.explodeZombie(building.x,building.y,premature);
  assert.equal(building.maxHp-building.hp,buildingDamage);
  assert.equal(unit.maxHp-unit.hp,unitDamage);
  assert.equal(vehicle.maxHp-vehicle.hp,vehicleDamage);
  assert.equal(game.threatEffects.at(-1).radius,radius);

  for (const type of Object.keys(BUILDING_DEFS)) {
    const healthy = fixture(), target = new Building(type, 20, 20);
    healthy.buildings = [target];
    healthy.explodeZombie(target.x, target.y, premature);
    assert.equal(target.hp, target.maxHp - buildingDamage, type + ' takes the capped central hit');
    assert.equal(target.dead, false, type + ' survives a single explosion from full health');
  }

  const falloff = fixture();
  falloff.units = [0,radius*.5,radius*.95,radius+1].map(distance=>{
    const target = new Unit('heavy',800,800);
    target.x += distance+target.def.radius;
    return target;
  });
  falloff.explodeZombie(800,800,premature);
  const damage = falloff.units.map(u=>u.maxHp-u.hp);
  assert.equal(damage[0],unitDamage);
  assert.ok(Math.abs(damage[1]-unitDamage*10/17)<1e-9,'same falloff at half radius');
  assert.ok(damage[2]>0&&damage[2]<damage[1],'new outer blast area deals reduced damage');
  assert.equal(damage[3],0,'outside the enlarged radius is safe');
});
