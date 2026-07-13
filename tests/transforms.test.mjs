// Run: node tests/transforms.test.mjs
// Loads the plain-script game files into a VM context (they aren't modules).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
for (const f of ['js/config.js', 'js/utils.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}
const { worldToScreen, screenToWorld, clampCamera, centerCameraOn,
        mapScreenBounds, shadeColor } = ctx;

const cam0 = { x: 0, y: 0, zoom: 1 };

// One world tile (40 px) projects to a 64×32 diamond
assert.deepEqual(worldToScreen(0, 0, cam0),   { x: 0,   y: 0 });
assert.deepEqual(worldToScreen(40, 0, cam0),  { x: 32,  y: 16 });
assert.deepEqual(worldToScreen(0, 40, cam0),  { x: -32, y: 16 });
assert.deepEqual(worldToScreen(40, 40, cam0), { x: 0,   y: 32 });

// Round-trips at assorted cameras/zooms
for (const cam of [cam0, { x: 137, y: -260, zoom: 0.5 }, { x: -1000, y: 400, zoom: 2 }]) {
  for (const [wx, wy] of [[0, 0], [1600, 1600], [3200, 0], [123.5, 2999.25]]) {
    const s = worldToScreen(wx, wy, cam);
    const w = screenToWorld(s.x, s.y, cam);
    assert.ok(Math.abs(w.x - wx) < 1e-6 && Math.abs(w.y - wy) < 1e-6,
      `round-trip failed for ${wx},${wy} @ zoom ${cam.zoom}`);
  }
}

// centerCameraOn puts the target at the viewport center
{
  const cam = { x: 0, y: 0, zoom: 1.3 };
  centerCameraOn(cam, 1600, 1600, 800, 600);
  const s = worldToScreen(1600, 1600, cam);
  assert.ok(Math.abs(s.x - 400) < 1e-6 && Math.abs(s.y - 300) < 1e-6, 'centerCameraOn off-center');
}

// clampCamera keeps the viewport CENTER over the map (corners reachable)…
{
  const cam = { x: 99999, y: 99999, zoom: 1 }; // way off the SE corner
  clampCamera(cam, 800, 600);
  const c = screenToWorld(400, 300, cam);
  assert.ok(Math.abs(c.x - 3200) < 1e-6 && Math.abs(c.y - 3200) < 1e-6,
    'wild camera should clamp its center to the SE map corner');
}
// …and leaves an already-valid camera untouched
{
  const cam = { x: 0, y: 0, zoom: 1 };
  centerCameraOn(cam, 1600, 1600, 800, 600);
  const before = { x: cam.x, y: cam.y };
  clampCamera(cam, 800, 600);
  assert.ok(Math.abs(cam.x - before.x) < 1e-6 && Math.abs(cam.y - before.y) < 1e-6,
    'in-bounds camera must not move');
}
// …and every map corner can be centered exactly
for (const [wx, wy] of [[0, 0], [3200, 0], [3200, 3200], [0, 3200]]) {
  const cam = { x: 0, y: 0, zoom: 1 };
  centerCameraOn(cam, wx, wy, 800, 600);
  clampCamera(cam, 800, 600);
  const c = screenToWorld(400, 300, cam);
  assert.ok(Math.abs(c.x - wx) < 1e-6 && Math.abs(c.y - wy) < 1e-6,
    `map corner ${wx},${wy} should be centerable`);
}

assert.equal(shadeColor('#ff8800', 0.5), 'rgb(128,68,0)');

console.log('transforms.test: all assertions passed');
