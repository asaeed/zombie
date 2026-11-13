import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { CELL, CLIPS, DIRECTIONS, poseParameters } from '../tools/sculpted-pixel/rig.mjs';

const root = new URL('../', import.meta.url);
const code = readFileSync(new URL('js/diorama-art.js', root), 'utf8');
const imageSources = [];
class FakeImage { set src(value) { imageSources.push(value); } }
const context = vm.createContext({ window: { location: { search: '?artPilot=sculpted' } }, URLSearchParams, Image: FakeImage });
vm.runInContext(code, context);
const frameFor = vm.runInContext('dioramaPilotFrame', context);

test('sculpted pilot loads the new atlases without enabling other units', () => {
  assert.equal(vm.runInContext('DIORAMA_PILOT_STYLE', context), 'sculpted');
  assert.deepEqual(imageSources, ['assets/sculpted-pixel/sniper.png', 'assets/sculpted-pixel/walker.png']);
  assert.equal(frameFor('soldier', 'S', false, Infinity, 0), null);
});

test('half-size sculpted presentation preserves the legacy pilot scales', () => {
  assert.equal(vm.runInContext('DIORAMA_PILOT_SCALE', context), .28);
  for (const style of ['diorama', 'pixel', 'horror']) {
    const other = vm.createContext({ window: { location: { search: `?artPilot=${style}` } }, URLSearchParams, Image: FakeImage });
    vm.runInContext(code, other);
    assert.equal(vm.runInContext('DIORAMA_PILOT_SCALE', other), .66);
  }
});

for (const [type, clips] of Object.entries(CLIPS)) {
  const metadata = JSON.parse(readFileSync(new URL(`assets/sculpted-pixel/${type}.json`, root), 'utf8'));
  test(`${type} atlas contains every action and direction with fixed foot anchors`, () => {
    const png = readFileSync(new URL(`assets/sculpted-pixel/${metadata.image}`, root));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), CELL.width * 12);
    assert.equal(png.readUInt32BE(20), CELL.height * 8 * clips.length);
    assert.deepEqual(metadata.footAnchor, { x: CELL.footX, y: CELL.footY });
    assert.deepEqual(metadata.directions, DIRECTIONS);
    assert.deepEqual(Object.keys(metadata.clips), clips.map(clip => clip.name));
    const occupied = new Set();
    clips.forEach((clip, row) => {
      assert.equal(metadata.clips[clip.name].fps, clip.fps);
      assert.equal(metadata.clips[clip.name].loop, clip.loop);
      DIRECTIONS.forEach((direction, index) => {
        const frames = metadata.clips[clip.name].directions[direction];
        assert.equal(frames.length, clip.frames);
        frames.forEach((frame, column) => {
          assert.deepEqual(frame, { x: column * 128, y: (row * 8 + index) * 128, width: 128, height: 128 });
          const key = `${frame.x},${frame.y}`;
          assert.ok(!occupied.has(key)); occupied.add(key);
        });
      });
    });
  });

  for (const [row, clip] of clips.entries()) {
    test(`${type} ${clip.name} runtime selects every baked frame in all facings`, () => {
      DIRECTIONS.forEach((direction, index) => {
        for (let frame = 0; frame < clip.frames; frame++) {
          const attack = clip.name === 'shoot' || clip.name === 'attack';
          const moving = clip.name === 'walk';
          const stride = type === 'sniper' ? 10 / 3 : 4;
          const selected = frameFor(type, direction, moving, attack ? (frame + .01) / clip.fps : Infinity,
            moving ? (frame + .01) * stride : 0, clip.name === 'gather', (frame + .01) / clip.fps, (frame + .01) / clip.fps);
          assert.equal(selected.x, frame * 128);
          assert.equal(selected.y, (row * 8 + index) * 128);
        }
      });
    });
  }
}

test('walk phases alternate and action poses return smoothly to rest', () => {
  for (const type of Object.keys(CLIPS)) for (let direction = 0; direction < 8; direction++) {
    const first = poseParameters(type, direction, 'walk', 3, 12);
    const opposite = poseParameters(type, direction, 'walk', 9, 12);
    assert.ok(first.wave > .99 && opposite.wave < -.99);
    for (const clip of CLIPS[type]) {
      for (let frame = 0; frame < clip.frames; frame++) {
        const pose = poseParameters(type, direction, clip.name, frame, clip.frames);
        for (const value of Object.values(pose)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      }
      if (!clip.loop) {
        const start = poseParameters(type, direction, clip.name, 0, clip.frames);
        const end = poseParameters(type, direction, clip.name, clip.frames - 1, clip.frames);
        assert.ok(start.reach < 1e-10 && end.reach < 1e-10);
        assert.equal(start.recoil, 0); assert.equal(end.recoil, 0);
      }
    }
  }
});
