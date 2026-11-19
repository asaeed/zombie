import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const context = vm.createContext({window:{innerWidth:1200,innerHeight:900}});
for (const name of ['config','utils','pathfinding','entities','game']) {
  vm.runInContext(readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8'),context);
}
const {Game,Unit,Zombie,Building,Vehicle,MAP_W,MAP_H,TILE,DAY_LENGTH} = vm.runInContext(
  '({Game,Unit,Zombie,Building,Vehicle,MAP_W,MAP_H,TILE,DAY_LENGTH})',context);
function fixture() {
  const game = new Game();
  game.tiles = Array.from({length:MAP_H},() => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq',3,3)];
  game.gameTime = DAY_LENGTH + 20;
  return game;
}
function visible(game,entity) {return game.tileVisible(Math.floor(entity.x/TILE),Math.floor(entity.y/TILE));}

test('a sniper returns fire at a Spitter beyond the old night sight radius',() => {
  const game=fixture(),sniper=new Unit('sniper',1220,1220),spitter=new Zombie('spitter',1395,1220);
  game.units=[sniper];game.zombies=[spitter];spitter.atkTarget=sniper;sniper.atkCooldown=1.2;
  game._recomputeFog();assert.ok(visible(game,spitter));
  for(let frame=0;frame<120;frame++)game.update(1/30);
  assert.ok(sniper.hp<sniper.maxHp,'acid reaches the sniper before his first return shot');
  assert.equal(sniper.dead,false);assert.equal(spitter.dead,true,'the sniper automatically fires back and kills the attacker');
});

test('weapon range remains visible at every facing and sub-tile position, day and night',() => {
  const game=fixture();game.buildings=[];
  for(const type of ['sniper','soldier'])for(const offset of [.01,.5,.99])for(const time of [0,DAY_LENGTH-2,DAY_LENGTH+20]) {
    const unit=new Unit(type,(30+offset)*TILE,(30+1-offset)*TILE);game.units=[unit];game.gameTime=time;game._recomputeFog();
    for(let step=0;step<32;step++) {
      const angle=step*Math.PI/16,distance=unit.def.atkRange-.001;
      const zombie=new Zombie('spitter',unit.x+Math.cos(angle)*distance,unit.y+Math.sin(angle)*distance);
      assert.ok(visible(game,zombie),`${type}, offset ${offset}, time ${time}, angle ${step}`);
    }
  }
});

test('visibility does not grant extra weapon range or reveal distant threats',() => {
  const game=fixture(),sniper=new Unit('sniper',1220,1220);
  game.units=[sniper];game.buildings=[];game._recomputeFog();
  const outOfRange=new Zombie('spitter',sniper.x+sniper.def.atkRange+1,sniper.y),distant=new Zombie('spitter',sniper.x+600,sniper.y);
  game.zombies=[outOfRange,distant];
  assert.equal(visible(game,distant),false);
  sniper.update(.1,game);assert.equal(game.projectiles.length,0);
});

test('a sniper in an armored truck can see and shoot an attacking Spitter at night',() => {
  const game=fixture(),truck=new Vehicle('suv',1220,1220),sniper=new Unit('sniper',1220,1220),spitter=new Zombie('spitter',1395,1220);
  game.vehicles=[truck];game.units=[sniper];game.zombies=[spitter];truck.passengers=[sniper];sniper.vehicle=truck;spitter.atkTarget=truck;
  game._recomputeFog();assert.ok(visible(game,spitter));
  sniper.update(.1,game);assert.equal(game.projectiles.length,1);assert.equal(game.projectiles[0].target,spitter);
  truck.passengers=[];sniper.dead=true;spitter.x=truck.x+215;game._recomputeFog();assert.equal(visible(game,spitter),false,'an empty truck retains its normal night sight');
});

test('a guard tower can see and return fire across its full range at night',() => {
  const game=fixture(),tower=new Building('tower',30,30),spitter=new Zombie('spitter',0,0);
  game.buildings=[tower];spitter.x=tower.x+175;spitter.y=tower.y;game.zombies=[spitter];game._recomputeFog();
  assert.ok(visible(game,spitter));tower.update(.1,game);
  assert.equal(game.projectiles.length,1);assert.equal(game.projectiles[0].target,spitter);
});
