import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const assetDir = new URL('../assets/diorama-pilot/', import.meta.url);
const directions = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const clipCounts = { sniper: { idle: 4, walk: 8, shoot: 6, gather: 6 },
  walker: { idle: 4, walk: 8, attack: 6 } };

for (const style of ['diorama', 'pixel', 'horror']) {
  for (const [type, clips] of Object.entries(clipCounts)) {
  test(`${style} ${type} atlas has complete directional frames and fixed anchors`, () => {
    const prefix = style === 'diorama' ? '' : `${style}-`;
    const metadata = JSON.parse(readFileSync(new URL(`${prefix}${type}.json`, assetDir), 'utf8'));
    const png = readFileSync(new URL(metadata.image, assetDir));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width, 640);
    assert.equal(height, 96 * 8 * Object.keys(clips).length);
    assert.deepEqual(metadata.cell, { width: 80, height: 96 });
    assert.deepEqual(metadata.footAnchor, { x: 40, y: 86 });
    assert.equal(metadata.style, style);
    assert.deepEqual(metadata.directions, directions);
    const occupied = new Set();
    for (const [clipName, count] of Object.entries(clips)) {
      const clip = metadata.clips[clipName];
      assert.ok(clip.fps > 0);
      for (const direction of directions) {
        const frames = clip.directions[direction];
        assert.equal(frames.length, count);
        for (const frame of frames) {
          assert.equal(frame.width, 80);
          assert.equal(frame.height, 96);
          assert.ok(frame.x >= 0 && frame.y >= 0);
          assert.ok(frame.x + frame.width <= width && frame.y + frame.height <= height);
          const key = `${frame.x},${frame.y}`;
          assert.ok(!occupied.has(key), `overlapping ${type} frame ${key}`);
          occupied.add(key);
        }
      }
    }
    assert.equal(occupied.size, Object.values(clips).reduce((total, count) => total + count * 8, 0));
  });
  }
}

const context = vm.createContext({ window: { location: { search: '?artPilot=off' } }, URLSearchParams });
vm.runInContext(readFileSync(new URL('js/diorama-art.js', root), 'utf8'), context);
const { frame, enabled } = vm.runInContext(
  '({ frame: dioramaPilotFrame, enabled: DIORAMA_PILOT_ENABLED })', context);

test('legacy art can be selected and animation state selects the expected atlas row', () => {
  assert.equal(enabled, false);
  assert.equal(frame('soldier', 'S', false, Infinity, 0), null);
  const idle = frame('sniper', 'S', false, Infinity, 0);
  const walk = frame('sniper', 'S', true, Infinity, 16);
  const shoot = frame('sniper', 'S', false, 0.21, 0);
  const gather = frame('sniper', 'S', false, Infinity, 0, true, 0.5);
  const walkerAttack = frame('walker', 'NW', false, 0.21, 0);
  assert.equal(idle.y, 0);
  assert.equal(walk.x, 240);
  assert.equal(walk.y, 8 * 96);
  assert.equal(shoot.y, 16 * 96);
  assert.equal(gather.y, 24 * 96);
  assert.equal(gather.x, 320);
  assert.equal(walkerAttack.y, (2 * 8 + 5) * 96);
  assert.notEqual(shoot.x, idle.x);
});

for (const style of ['pixel', 'horror']) {
  test(`${style} uses its own authored atlas`, () => {
    const code = readFileSync(new URL('js/diorama-art.js', root), 'utf8');
    const imageSources = [];
    class FakeImage {
      set src(value) { imageSources.push(value); }
    }
    const styleContext = vm.createContext({
      window: { location: { search: `?artPilot=${style}` } }, URLSearchParams, Image: FakeImage,
    });
    vm.runInContext(code, styleContext);
    assert.equal(vm.runInContext('DIORAMA_PILOT_STYLE', styleContext), style);
    assert.deepEqual(imageSources, [
      `assets/diorama-pilot/${style}-sniper.png`,
      `assets/diorama-pilot/${style}-walker.png`,
    ]);
    const source = readFileSync(new URL(`tools/diorama/${style === 'pixel' ? 'sculpted-pixel' : 'stylized-horror'}.mjs`, root), 'utf8');
    assert.ok(!source.includes('model-v2.mjs'));
    assert.ok(source.includes('bake2D'));
  });
}
