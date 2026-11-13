import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

test('gameplay telemetry distinguishes resumes, waves, defeat and leaving; failures never stop play', () => {
  const sent = [], listeners = {};
  const window = {addEventListener: (name, fn) => {listeners[name] = fn;}};
  const context = vm.createContext({window, document: {hidden:false}, location: {hostname:'localhost'},
    crypto: {randomUUID: () => 'session-id'}, performance: {now: () => 0}});
  vm.runInContext(readFileSync(new URL('../js/analytics.js', import.meta.url), 'utf8'), context);
  window.gameAnalytics.capture = (event, props) => sent.push({event, ...props});
  const game = {gameTime: 50, waveNum: 2, status:'playing', score:20, stats:{zombiesKilled:3}};
  window.gameAnalytics.begin(game, 'resume');
  assert.equal(sent[0].event, 'dz_session_started');
  assert.equal(sent[0].mode, 'resume');
  game.waveNum = 3; game.gameTime = 55;
  window.gameAnalytics.update(); window.gameAnalytics.update();
  assert.equal(sent.filter(e => e.event === 'dz_wave_reached').length, 1);
  game.status = 'gameover'; window.gameAnalytics.update(); window.gameAnalytics.update();
  listeners.pagehide();
  assert.equal(sent.filter(e => e.event === 'dz_session_ended').length, 1);
  assert.equal(sent.at(-1).reason, 'defeat');
  assert.equal(sent.at(-1).survival_minutes, 55 / 60);
  assert.equal(sent.at(-1).active_minutes, 5 / 60);
  game.status = 'playing'; window.gameAnalytics.begin(game, 'new');
  listeners.pagehide(); listeners.pagehide();
  assert.equal(sent.at(-1).reason, 'leave');
  assert.equal(sent.filter(e => e.event === 'dz_session_started').length, 2);
  listeners.pageshow({persisted:true});
  assert.equal(sent.at(-1).event, 'dz_session_started');
  assert.equal(sent.at(-1).mode, 'resume');
  window.gameAnalytics.capture = () => {throw new Error('blocked');};
  assert.doesNotThrow(() => window.gameAnalytics.begin(game, 'new'));
  assert.doesNotThrow(() => window.gameAnalytics.update());
});
