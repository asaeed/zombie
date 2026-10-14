import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const context = vm.createContext({});
for (const file of ['config', 'utils']) {
  vm.runInContext(readFileSync(new URL(`js/${file}.js`, root), 'utf8'), context);
}
const rects = vm.runInContext('buildButtonRects', context);

test('game source is a native, safely opened link outside the canvas', () => {
  assert.match(html, /<\/canvas>\s*<a id="source-code-link" href="https:\/\/github\.com\/asaeed\/zombie" target="_blank" rel="noopener noreferrer" hidden>Source code<\/a>/);
});

test('source link fits the unused HUD corner at mobile and desktop widths', () => {
  const css = readFileSync(new URL('style.css', root), 'utf8');
  assert.match(css, /#source-code-link \{[^}]*right: 12px; bottom: 6px;/);
  for (const width of [320, 390, 430, 560, 800, 1200, 1440]) {
    const height = 844;
    const link = {x: width - 12 - 85, y: height - 30, w: 85, h: 24};
    for (const button of rects(width, height)) {
      const overlaps = link.x < button.x + button.w && link.x + link.w > button.x &&
        link.y < button.y + button.h && link.y + link.h > button.y;
      assert.equal(overlaps, false, `Source link overlaps ${button.type} at ${width}px`);
    }
  }
});

test('keyboard activation of a link cannot restart an overrun game', () => {
  vm.runInContext(readFileSync(new URL('js/input.js', root), 'utf8'), context);
  const InputHandler = vm.runInContext('InputHandler', context);
  let restarts = 0;
  const input = Object.assign(Object.create(InputHandler.prototype), {
    keys: {}, game: {status: 'overrun'}, _runMenuAction: () => restarts++
  });
  input._onKeyDown({code: 'Enter', target: {closest: selector => selector === 'a'}});
  assert.equal(restarts, 0);
  assert.equal(input.keys.Enter, undefined);
});
