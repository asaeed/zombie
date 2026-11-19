import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const assetDir = new URL('../docs/art-directions/', import.meta.url);
const metadata = JSON.parse(readFileSync(new URL('sniper-pilot-sheet.json', assetDir), 'utf8'));
const png = readFileSync(new URL(metadata.image, assetDir));

test('sniper pilot atlas matches its frame metadata', () => {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 96);
  assert.equal(height, 640);
  assert.deepEqual(metadata.cell, { width: 16, height: 20 });
  assert.deepEqual(metadata.footAnchor, { x: 8, y: 18 });
  assert.deepEqual(metadata.directions, ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']);

  const expected = { idle: 1, walk: 6, shoot: 4, gather: 4 };
  const occupied = new Set();
  for (const [name, count] of Object.entries(expected)) {
    const clip = metadata.clips[name];
    assert.ok(clip.fps > 0);
    for (const direction of metadata.directions) {
      const frames = clip.directions[direction];
      assert.equal(frames.length, count, `${name}/${direction}`);
      for (const frame of frames) {
        assert.equal(frame.width, metadata.cell.width);
        assert.equal(frame.height, metadata.cell.height);
        assert.ok(frame.x >= 0 && frame.y >= 0);
        assert.ok(frame.x + frame.width <= width);
        assert.ok(frame.y + frame.height <= height);
        const key = `${frame.x},${frame.y}`;
        assert.ok(!occupied.has(key), `overlapping frame at ${key}`);
        occupied.add(key);
      }
    }
  }
  assert.equal(occupied.size, 120);
});
