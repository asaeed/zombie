import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture(side = 0) {
  const context = vm.createContext({window:{innerWidth:1200, innerHeight:900}});
  for (const name of ['config', 'utils', 'pathfinding', 'entities', 'game'])
    vm.runInContext(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
  vm.runInContext('randFloat = (a, b) => (a + b) / 2', context);
  const {Game, Building, Unit, MAP_W, MAP_H} = vm.runInContext('({Game, Building, Unit, MAP_W, MAP_H})', context);
  const game = new Game();
  game.tiles = Array.from({length:MAP_H}, () => new Uint8Array(MAP_W));
  game.buildings = [new Building('hq', 39, 39)];
  game.waveDirections = [side];
  game.waveActive = true;
  game._rebuildFlowField();
  game._spawnZombieFromEdge('screamer');
  return {game, Game, Building, Unit, leader:game.zombies[0]};
}

test('each screamer spawns six nearby walker escorts on every map edge', () => {
  for (let side = 0; side < 4; side++) {
    const {game, leader} = fixture(side);
    assert.equal(game.zombies.length, 7);
    assert.equal(leader.escorts.length, 6);
    for (const walker of leader.escorts) {
      assert.equal(walker.type, 'walker');
      assert.equal(walker.escortLeader, leader);
      assert.ok(Math.hypot(walker.x-leader.x, walker.y-leader.y) < 80);
      assert.ok(game.canOccupyGround(walker.x, walker.y, walker.def.radius));
    }
  }
});

test('escorts surround a moving screamer, turn with it, and promote survivors to the front', () => {
  const {game, leader, Building} = fixture();
  const startY = leader.y;
  const advance = () => {for (let i=0; i<200; i++) game.update(.05);};
  const check = () => {
    const target = game.buildings[0];
    const dx=target.x-leader.x, dy=target.y-leader.y;
    const escorts=leader.escorts.filter(z=>!z.dead);
    assert.ok(escorts.every(z=>Math.hypot(z.x-leader.x,z.y-leader.y)<100));
    assert.ok(escorts.slice(0,2).some(z=>(z.x-leader.x)*dx+(z.y-leader.y)*dy>0), 'a living escort stays ahead');
  };
  advance(); check();
  assert.ok(leader.y > startY+200, 'the group advances rather than waiting forever');
  game.buildings=[new Building('hq', 15, 15)];
  game._rebuildFlowField();
  advance(); check();
  leader.escorts[0].takeDamage(1000);
  leader.escorts[1].takeDamage(1000);
  advance(); check();
});

test('escort links survive saves, combat still works, and a dead leader releases its walkers', () => {
  const {game, Game, Unit, leader} = fixture();
  const loaded = Game.fromSaveData(game.toSaveData());
  const restored=loaded.zombies.find(z=>z.type==='screamer');
  assert.equal(restored.escorts.length, 6);
  assert.ok(restored.escorts.every(z=>z.escortLeader===restored));
  const walker=leader.escorts[0];
  const human=new Unit('soldier', walker.x+5, walker.y);
  game.units=[human];
  walker.update(.1,game);
  assert.ok(human.hp<human.maxHp, 'escorts can attack instead of insisting on their slot');
  leader.takeDamage(1000);
  const before={x:walker.x,y:walker.y};
  game.units=[]; walker.atkTarget=null;
  walker.update(.1,game);
  assert.ok(Math.hypot(walker.x-before.x,walker.y-before.y)>0);
  assert.equal(game.zombies.length,7, 'escorts never respawn');
});

test('the group gets around water without the formation freezing its progress', () => {
  const {game, leader} = fixture();
  for (let y=6; y<=12; y++) for (let x=36; x<=43; x++) game.tiles[y][x]=2;
  game._rebuildFlowField();
  for (let i=0; i<1000; i++) game.update(.05);
  assert.ok(leader.y>700, `screamer must pass the pond, reached ${leader.x},${leader.y}`);
  assert.ok(leader.escorts.every(z=>Math.hypot(z.x-leader.x,z.y-leader.y)<150), `escorts regroup after the pond: ${JSON.stringify(game.zombies.map(z=>[z.type,Math.round(z.x),Math.round(z.y),!!z._route]))}`);
  assert.ok(game.zombies.every(z=>game.canOccupyGround(z.x,z.y,z.def.radius)), 'no walking through water');
});
