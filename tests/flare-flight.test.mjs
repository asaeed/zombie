import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture() {
  const context = vm.createContext({window:{innerWidth:1200, innerHeight:900}});
  for (const name of ['config', 'utils', 'pathfinding', 'entities', 'game']) {
    vm.runInContext(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
  }
  const e = vm.runInContext('({Game, Building, Unit, Zombie, MAP_W, MAP_H, TILE, FLARE_COST, FLARE_COOLDOWN, FLARE_DURATION, FLARE_FIRE_RADIUS, FIRE_DURATION})', context);
  const game = new e.Game();
  game.tiles = Array.from({length:e.MAP_H}, () => new Uint8Array(e.MAP_W));
  const hq = new e.Building('hq',10,10);
  game.buildings = [hq]; game.waveTimer = 999;
  game.fogExplored.fill(1); game.fogVisible.fill(1); game._fogTimer = 100;
  return {e, game, hq};
}

test('a flare launches from HQ, spends once, and waits for landing before lighting or igniting', () => {
  const {e, game, hq} = fixture();
  const zombie = new e.Zombie('brute',900,900); zombie.dormant = true;
  game.zombies = [zombie];
  const supplies = game.supplies;
  assert.equal(game.throwFlare(900,900),true);
  const shot = game.flareShots[0];
  assert.deepEqual([shot.sx,shot.sy,shot.x,shot.y],[hq.x,hq.y,900,900]);
  assert.equal(game.supplies,supplies-e.FLARE_COST); assert.equal(game.flareCooldown,e.FLARE_COOLDOWN);
  assert.equal(game.throwFlare(1000,1000),false); assert.equal(game.supplies,supplies-e.FLARE_COST);
  game.update(shot.duration/2);
  assert.equal(game.flareShots.length,1); assert.equal(game.flares.length,0);
  assert.equal(zombie.dormant,true); assert.equal(zombie.burning,false);
  assert.equal(game.threatEffects.length,0);
  game.update(shot.duration/2+.001);
  assert.equal(game.flareShots.length,0); assert.equal(game.flares.length,1);
  assert.equal(zombie.burning,true); assert.equal(zombie.dormant,false);
  assert.equal(game.threatEffects.filter(e=>e.kind==='blast').length,1);
  assert.ok(game.tileVisible(22,22),'the impact is immediately visible');
});

test('the landing bursts at the chosen point, ignites only nearby live zombies, and leaves allies unharmed', () => {
  const {e, game, hq} = fixture();
  const target = {x:900,y:900}, radius = e.FLARE_FIRE_RADIUS*e.TILE;
  const inside = new e.Zombie('walker',target.x+radius,target.y);
  const outside = new e.Zombie('walker',target.x+radius+.01,target.y);
  const dead = new e.Zombie('walker',target.x,target.y); dead.dead = true;
  const human = new e.Unit('soldier',target.x,target.y);
  game.units = [human]; game.zombies = [inside,outside,dead];
  game.throwFlare(target.x,target.y);
  game._updateFlareShots(game.flareShots[0].duration);
  assert.equal(inside.burning,true); assert.equal(outside.burning,false); assert.equal(dead.burning,false);
  assert.equal(human.hp,human.maxHp); assert.equal(hq.hp,hq.maxHp);
  assert.equal(game.threatEffects.length,1); assert.equal(game.particles.length,16);
  const effect = game.threatEffects[0];
  assert.deepEqual([effect.x,effect.y,effect.radius,effect.kind],[target.x,target.y,radius,'blast']);
  game._updateFlareShots(10);
  assert.equal(game.flares.length,1); assert.equal(game.threatEffects.length,1,'landing cannot repeat');
});

test('a flight survives saving halfway through and lands once after loading', () => {
  const {e, game} = fixture();
  game.throwFlare(900,900); game._updateFlareShots(game.flareShots[0].duration/2);
  const saved = game.toSaveData(), loaded = e.Game.fromSaveData(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.flareShots)),JSON.parse(JSON.stringify(game.flareShots)));
  assert.equal(loaded.flares.length,0);
  const shot = loaded.flareShots[0];
  loaded._updateFlareShots(shot.duration-shot.t+.001);
  assert.equal(loaded.flareShots.length,0); assert.equal(loaded.flares.length,1);
  assert.equal(loaded.flares[0].t,0,'ground lifetime starts on landing');
  loaded._updateFlareShots(2); assert.equal(loaded.flares.length,1);
});

test('legacy saves with landed flares remain compatible', () => {
  const {e, game} = fixture();
  game.throwFlare(900,900); game.update(.1);
  assert.equal(game.flareShots[0].t,.1);
  const data = game.toSaveData(); delete data.flareShots;
  data.flares = [{x:900,y:900,t:3}];
  const loaded = e.Game.fromSaveData(data);
  assert.equal(loaded.flareShots.length,0); assert.equal(loaded.flares[0].t,3);
  assert.equal(loaded.threatEffects.length,0,'existing flares do not explode again');
});

test('rejected launches create no shot or spending, and even short shots have a visible flight', () => {
  for (const reason of ['no-hq','unexplored','insufficient-supplies']) {
    const {game,hq} = fixture();
    if (reason==='no-hq') hq.dead=true;
    if (reason==='unexplored') game.fogExplored.fill(0);
    if (reason==='insufficient-supplies') game.supplies=0;
    const supplies=game.supplies;
    assert.equal(game.throwFlare(900,900),false,reason);
    assert.equal(game.flareShots.length,0); assert.equal(game.supplies,supplies);
    assert.equal(game.flareCooldown,0);
  }
  const {game,hq}=fixture(); game.throwFlare(hq.x,hq.y);
  assert.ok(game.flareShots[0].duration>=.45);
  game._updateFlareShots(.1); assert.equal(game.flareShots.length,1);
});
