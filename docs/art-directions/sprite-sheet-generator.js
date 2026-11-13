'use strict';

// A deterministic pose pilot. Final art can replace these frames without
// changing the atlas layout or the fixed foot anchor.
const PILOT_DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const PILOT_CLIPS = [
  { name: 'idle', frames: 1, fps: 1, loop: true },
  { name: 'walk', frames: 6, fps: 9, loop: true },
  { name: 'shoot', frames: 4, fps: 10, loop: false },
  { name: 'gather', frames: 4, fps: 6, loop: true },
];
const PILOT_CELL = { width: 16, height: 20, footX: 8, footY: 18 };

function drawSniperPose(ctx, direction, clip, frame) {
  const back = ['N', 'NE', 'NW'].includes(direction);
  const side = ['E', 'W'].includes(direction);
  const diagonal = ['SE', 'NE', 'NW', 'SW'].includes(direction);
  const left = ['W', 'NW', 'SW'].includes(direction);
  if (left) {
    ctx.translate(PILOT_CELL.width, 0);
    ctx.scale(-1, 1);
  }
  const ink = '#202e27';
  const cloth = '#557a51';
  const light = '#9fba7b';
  const shade = '#344d3b';
  const steel = '#343d38';
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const walk = [
    { lx: 3, ly: 15, rx: 10, ry: 14, arm: 2 },
    { lx: 5, ly: 13, rx: 9, ry: 15, arm: 1 },
    { lx: 7, ly: 14, rx: 8, ry: 15, arm: 0 },
    { lx: 10, ly: 15, rx: 3, ry: 14, arm: -2 },
    { lx: 9, ly: 15, rx: 5, ry: 13, arm: -1 },
    { lx: 8, ly: 15, rx: 7, ry: 14, arm: 0 },
  ];
  const pose = clip === 'walk' ? walk[frame] : { lx: 5, ly: 14, rx: 9, ry: 14, arm: 0 };
  const crouch = clip === 'gather' && frame === 2 ? 1 : 0;

  // Legs have a genuine six-pose cycle; one boot lifts while the other plants.
  rect(pose.lx, pose.ly, 2, 3, ink);
  rect(pose.lx, pose.ly, 2, 1, shade);
  rect(pose.rx, pose.ry, 2, 3, ink);
  rect(pose.rx, pose.ry, 2, 1, shade);
  rect(pose.lx - 1, pose.ly + 2, 3, 1, '#212b27');
  rect(pose.rx, pose.ry + 2, 3, 1, '#212b27');

  // Torso, hood, and back gear rotate between front, side, diagonal, and rear.
  ctx.save();
  if (clip === 'walk') ctx.translate([-1, 0, 1, 1, 0, -1][frame], [0, 1, 0, 0, 1, 0][frame]);
  rect(side ? 5 : 4, 7 + crouch, side ? 5 : 7, 7 - crouch, ink);
  rect(side ? 6 : 5, 7 + crouch, side ? 4 : 5, 6 - crouch, cloth);
  rect(5, 9 + crouch, 2, 3, light);
  rect(9, 10 + crouch, 1, 3, shade);
  rect(side ? 6 : 5, 2 + crouch, side ? 4 : 5, 5, ink);
  rect(side ? 6 : 5, 2 + crouch, side ? 3 : 4, 2, light);
  rect(side ? 6 : 5, 4 + crouch, side ? 4 : 5, 2, cloth);
  if (back) {
    rect(6, 4 + crouch, 3, 2, shade);
    rect(5, 8 + crouch, 5, 4, shade);
    rect(6, 8 + crouch, 3, 3, '#293d32');
    if (diagonal) { rect(9, 3 + crouch, 1, 3, light); rect(9, 9 + crouch, 1, 3, cloth); }
  } else {
    rect(side ? 9 : diagonal ? 8 : 6, 5 + crouch, side ? 1 : 2, 1, '#d2ad84');
    if (!side && !diagonal) rect(5, 5 + crouch, 1, 1, '#d2ad84');
  }

  if (clip === 'gather') {
    // Rifle is slung away while both arms work the cache.
    rect(3, 7 + crouch, 1, 6, steel);
    rect(2, 9 + crouch, 2, 1, steel);
    rect(3, 9 + crouch, 2, 3, cloth);
    if (frame === 0) rect(10, 9, 2, 4, cloth);
    if (frame === 1) { rect(10, 10, 4, 2, cloth); rect(13, 11, 2, 1, '#d2ad84'); }
    if (frame === 2) { rect(10, 11, 4, 2, cloth); rect(13, 13, 2, 1, '#d2ad84'); }
    if (frame === 3) { rect(10, 7, 3, 2, cloth); rect(12, 6, 2, 2, '#e8cb61'); }
  } else {
    const shootHeight = clip === 'shoot' ? [9, 8, 7, 10][frame] : clip === 'walk' ? [10, 9, 8, 10, 9, 8][frame] : 9;
    const recoil = clip === 'shoot' && frame === 2 ? -1 : 0;
    rect(3, 9 + pose.arm, 2, 3, cloth);
    rect(10 + recoil, 8 - pose.arm, 2, 3, cloth);
    rect(8 + recoil, shootHeight, 6, 2, steel);
    rect(13 + recoil, shootHeight, 2, 1, ink);
    rect(8 + recoil, shootHeight - 1, 2, 1, '#6d7b6b');
    if (clip === 'shoot' && frame === 1) {
      rect(15, shootHeight - 1, 1, 3, '#ffe177');
      rect(14, shootHeight - 2, 1, 1, '#f7a14d');
    }
  }
  ctx.restore();
}

function buildSniperPilotSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = PILOT_CELL.width * 6;
  canvas.height = PILOT_CELL.height * PILOT_DIRECTIONS.length * PILOT_CLIPS.length;
  const ctx = canvas.getContext('2d');
  const clips = {};
  PILOT_CLIPS.forEach((clip, clipIndex) => {
    clips[clip.name] = { fps: clip.fps, loop: clip.loop, directions: {} };
    PILOT_DIRECTIONS.forEach((direction, directionIndex) => {
      const row = clipIndex * PILOT_DIRECTIONS.length + directionIndex;
      const frames = [];
      for (let frame = 0; frame < clip.frames; frame++) {
        const x = frame * PILOT_CELL.width;
        const y = row * PILOT_CELL.height;
        ctx.save();
        ctx.translate(x, y);
        drawSniperPose(ctx, direction, clip.name, frame);
        ctx.restore();
        frames.push({ x, y, width: PILOT_CELL.width, height: PILOT_CELL.height });
      }
      clips[clip.name].directions[direction] = frames;
    });
  });
  const metadata = {
    image: 'sniper-pilot-sheet.png',
    cell: { width: PILOT_CELL.width, height: PILOT_CELL.height },
    footAnchor: { x: PILOT_CELL.footX, y: PILOT_CELL.footY },
    directions: PILOT_DIRECTIONS,
    clips,
  };
  return { canvas, metadata };
}
