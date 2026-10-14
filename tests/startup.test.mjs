import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

function fixture(saved = null, cached = false) {
  const storage = new Map(saved ? [['dead-zone-rts:auto', saved]] : []);
  const frames = [], events = new Map(), counts = {renderers: 0, inputs: 0, draws: 0, updates: 0, starts: 0};
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const listeners = new Map();
      elements.set(id, {hidden: ['canvas', 'source-code-link', 'retry-assets'].includes(id),
        disabled: id === 'start-game', textContent: id === 'start-game' ? 'Start game' : '',
        addEventListener: (event, callback) => listeners.set(event, callback),
        fire: event => listeners.get(event)?.(), focus() {}, setAttribute() {}, toggleAttribute() {}});
    }
    return elements.get(id);
  };
  const context = vm.createContext({document: {getElementById: element, querySelector: element},
    window: {addEventListener: (event, callback) => events.set(event, callback)},
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)}, requestAnimationFrame: callback => frames.push(callback),
    ART_PACK_STATE: {pending: cached ? null : 'rigged', error: null, progress: {loaded: cached ? 33 : 0, total: 33}},
    SCULPTED_WORLD: {ready: cached}, ART_PACK_READY: Promise.resolve(cached), migrateSavedUnitTypes: () => false,
    Renderer: class {constructor() {counts.renderers++;} resize() {} render() {counts.draws++;}},
    InputHandler: class {constructor() {counts.inputs++;} resetTransient() {} setSaveMeta() {} updateCamera() {}},
    Game: class {
      constructor() {this.gameTime = 0; this.score = 0; this.status = 'playing';}
      start() {counts.starts++;}
      update() {counts.updates++;}
      toSaveData() {return {gameTime: this.gameTime, score: this.score};}
      static fromSaveData(data) {return Object.assign(new this(), data);}
    }, console});
  context.startArtPacks = async () => {
    context.ART_PACK_STATE.error = null; context.ART_PACK_STATE.pending = null;
    context.ART_PACK_STATE.progress.loaded = 33; context.SCULPTED_WORLD.ready = true;
    events.get('artpackchange')();
  };
  vm.runInContext(source, context);
  return {context, storage, frames, counts, element, events,
    ready: () => context.startArtPacks(), click: () => element('start-game').fire('click')};
}

test('loading and ready screens never initialize, render, tick, or overwrite a save before Start', async () => {
  const saved = JSON.stringify({data: {gameTime: 42, score: 123, units: [{carrying: 7}]}});
  const f = fixture(saved);
  assert.equal(f.element('start-game').disabled, true); f.click();
  assert.equal(f.context.window._game, undefined);
  assert.equal(f.frames.length, 0); assert.equal(f.counts.renderers, 0); assert.equal(f.counts.inputs, 0);
  assert.equal(f.element('canvas').hidden, true); assert.equal(f.element('source-code-link').hidden, true);
  assert.equal(f.element('start-game').textContent, 'Continue game');
  f.events.get('pagehide')(); assert.equal(f.storage.get('dead-zone-rts:auto'), saved);
  await f.ready(); await Promise.resolve();
  assert.equal(f.element('start-game').disabled, false); assert.equal(f.element('asset-status').textContent, 'Assets ready');
  assert.equal(f.frames.length, 0); assert.equal(f.counts.draws, 0); assert.equal(f.counts.updates, 0);
  f.events.get('pagehide')(); assert.equal(f.storage.get('dead-zone-rts:auto'), saved);
});

test('Continue restores once, paints before revealing the canvas, and starts one loop', async () => {
  const f = fixture(JSON.stringify({data: {gameTime: 42, score: 123, units: [{carrying: 7}]}}));
  await f.ready(); f.click(); f.click();
  assert.equal(f.context.window._game.gameTime, 42); assert.equal(f.context.window._game.score, 123);
  assert.equal(f.context.window._game.units[0].carrying, 7);
  assert.equal(f.counts.renderers, 1); assert.equal(f.counts.inputs, 1); assert.equal(f.counts.draws, 1);
  assert.equal(f.frames.length, 1); assert.equal(f.counts.starts, 0);
  assert.equal(f.element('canvas').hidden, false); assert.equal(f.element('start-screen').hidden, true);
  assert.equal(f.element('source-code-link').hidden, false);
});

test('a cached pack still requires explicit Start rather than auto-playing', async () => {
  const f = fixture(null, true); await Promise.resolve();
  assert.equal(f.element('start-game').disabled, false); assert.equal(f.frames.length, 0);
  assert.equal(f.counts.starts, 0); assert.equal(f.storage.has('dead-zone-rts:auto'), false);
  f.click(); assert.equal(f.counts.starts, 1); assert.equal(f.frames.length, 1);
  assert.equal(f.storage.has('dead-zone-rts:auto'), true);
});

test('failure leaves Start disabled and Retry recovers without exposing fallback gameplay', async () => {
  const f = fixture(); f.context.ART_PACK_STATE.error = 'Decode failed'; f.context.ART_PACK_STATE.pending = null;
  f.events.get('artpackchange')();
  assert.equal(f.element('retry-assets').hidden, false); assert.equal(f.element('start-game').disabled, true);
  assert.equal(f.element('asset-status').textContent, 'Download interrupted');
  f.click(); assert.equal(f.frames.length, 0); assert.equal(f.counts.inputs, 0);
  await f.element('retry-assets').fire('click');
  assert.equal(f.element('retry-assets').hidden, true); assert.equal(f.element('start-game').disabled, false);
  assert.equal(f.context.window._game, undefined); assert.equal(f.frames.length, 0);
});
