import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({window: {
  innerWidth:1200, innerHeight:900, addEventListener() {}
}});
for (const file of ['config', 'utils', 'renderer', 'input']) {
  vm.runInContext(readFileSync(new URL(`js/${file}.js`, root), 'utf8'), context,
    {filename:`js/${file}.js`});
}
const {InputHandler, Renderer, mainMenuActionRects, mainMenuPanelRect} = vm.runInContext(
  '({InputHandler, Renderer, mainMenuActionRects, mainMenuPanelRect})', context);

test('the compact menu exposes exactly three manual save/load pairs and no autosave actions', () => {
  const expected = ['resume', 'save-slot-1', 'load-slot-1', 'save-slot-2', 'load-slot-2',
    'save-slot-3', 'load-slot-3', 'new-game', 'clear-saves'];
  for (const width of [320, 390, 1200, 1440]) {
    const panel = mainMenuPanelRect(width), buttons = mainMenuActionRects(width);
    assert.deepEqual(buttons.map(b => b.action), vm.runInContext(JSON.stringify(expected), context));
    assert.ok(panel.h < 424);
    for (const b of buttons) {
      assert.ok(b.x >= panel.x && b.x + b.w <= panel.x + panel.w);
      assert.ok(b.y >= panel.y && b.y + b.h <= panel.y + panel.h);
    }
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i], b = buttons[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x ||
        a.y + a.h <= b.y || b.y + b.h <= a.y, 'menu buttons must not overlap');
    }
  }
});

test('all three manual slots still save and load, with pause while the menu is open', () => {
  const calls = [], meta = {auto:{}, slots:{1:{}, 2:{}, 3:{}}};
  const game = {paused:false};
  const input = new InputHandler({style:{}, addEventListener() {}}, game, {
    saveSlot: slot => { calls.push(`save ${slot}`); return {meta}; },
    loadSlot: slot => { calls.push(`load ${slot}`); return {meta, closeMenu:true}; },
  });
  input.setSaveMeta(meta);
  const buttons = mainMenuActionRects(1200);
  for (let slot = 1; slot <= 3; slot++) {
    input.setMenuOpen(true);
    assert.equal(game.paused, true);
    const save = buttons.find(b => b.action === `save-slot-${slot}`);
    input._handleMainMenuClick(save.x + save.w / 2, save.y + save.h / 2);
    assert.equal(input.menuOpen, true);
    const load = buttons.find(b => b.action === `load-slot-${slot}`);
    input._handleMainMenuClick(load.x + load.w / 2, load.y + load.h / 2);
    assert.equal(input.menuOpen, false);
    assert.equal(game.paused, false);
  }
  assert.deepEqual(calls, ['save 1','load 1','save 2','load 2','save 3','load 3']);
});

test('the renderer draws slot controls without Save Now, Load Auto or the auto timestamp', () => {
  const text = [];
  const ctx = new Proxy({fillText: value => text.push(value)}, {
    get: (target, key) => target[key] ?? (() => {}),
  });
  const renderer = Object.create(Renderer.prototype);
  renderer.W = 1200;
  renderer._drawMainMenu(ctx, {saveMeta:{auto:{savedAt:0}, slots:{}}});
  assert.ok(!text.some(value => /SAVE NOW|LOAD AUTO|^Auto:/.test(value)));
  for (let slot = 1; slot <= 3; slot++) {
    assert.ok(text.includes(`SAVE ${slot}`));
    assert.ok(text.includes(`LOAD ${slot}`));
  }
});
