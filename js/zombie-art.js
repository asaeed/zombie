'use strict';

const ZOMBIE_ART_DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const ZOMBIE_ART_CELL = { width: 40, height: 40, footX: 20, footY: 36 };
const ZOMBIE_ART_CLIPS = { idle: 0, move: 1, attack: 2 };
const ZOMBIE_VARIANTS = [
  { missingArm: null, cap: false, dress: false },
  { missingArm: 'left', cap: false, dress: false },
  { missingArm: null, cap: true, dress: false },
  { missingArm: null, cap: false, dress: true },
  { missingArm: 'right', cap: true, dress: false },
  { missingArm: 'left', cap: false, dress: true },
  { missingArm: 'right', cap: false, dress: false },
  { missingArm: null, cap: true, dress: true },
];
const ZOMBIE_ART_CACHE = new Map();

function zombieAppearance(type, id) {
  if (type !== 'walker' && type !== 'runner') return 0;
  return (Math.imul(Math.abs(id), 5) + 3) % ZOMBIE_VARIANTS.length;
}

function drawZombieArtFrame(ctx, type, variant, direction, clip, frame) {
  ctx.translate(4, 0);
  const mirror = ['W', 'NW', 'SW'].includes(direction);
  const back = ['N', 'NE', 'NW'].includes(direction);
  const side = ['E', 'W'].includes(direction);
  const diagonal = ['SE', 'NE', 'NW', 'SW'].includes(direction);
  if (mirror) { ctx.translate(32, 0); ctx.scale(-1, 1); }
  const box = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const poly = (points, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  };
  const traits = ZOMBIE_VARIANTS[variant % ZOMBIE_VARIANTS.length];
  const special = type !== 'walker' && type !== 'runner';
  const shirt = special ? ({ spitter: '#496759', exploder: '#695443', screamer: '#65546d',
    brute: '#515c61', boss: '#465459' })[type] : '#626c6e';
  const shade = special ? ({ spitter: '#2c4b42', exploder: '#423c37', screamer: '#453b51',
    brute: '#39474a', boss: '#303e42' })[type] : '#475153';
  const trim = special ? '#b4c4bc' : '#8d999a';
  const skin = '#c2cdca';
  const skinLight = '#e0e8e1';
  const skinShade = '#8d9d99';
  const ink = '#293735';
  const pants = special ? '#394741' : '#b1bab8';
  const pantsShade = special ? shade : '#828f8f';
  const moving = clip === 'move';
  const attacking = clip === 'attack';
  const stride = moving ? [-3, -1, 2, 3, 1, -2][frame] : 0;
  const swing = moving ? [-2, -1, 0, 2, 1, 0][frame] : 0;
  const bob = moving ? [0, 1, 0, 0, 1, 0][frame] : 0;
  const lurch = attacking ? [0, 1, 4, 2][frame] : 0;

  if (type === 'runner') {
    // Low, four-point sprint: hands and feet alternate contact with the ground.
    const run = moving ? frame : 0;
    const handX = [7, 10, 13, 19, 17, 11][run];
    const footX = [24, 21, 18, 12, 14, 20][run];
    poly([[12, 22 + bob], [23, 20 + bob], [25, 26 + bob],
      [16, 30 + bob], [9, 27 + bob]], ink);
    poly([[12, 22 + bob], [21, 20 + bob], [23, 25 + bob],
      [16, 28 + bob], [10, 26 + bob]], shirt);
    box(12, 25 + bob, 8, 2, shade);
    if (traits.missingArm !== 'left') {
      poly([[11, 25], [15, 27], [handX + 1, 34], [handX - 2, 34],
        [8, 29]], skinShade);
      box(handX - 2, 33, 5, 2, skinLight);
    } else box(9, 26, 4, 2, skinShade);
    const farHandX = [22, 25, 21, 13, 15, 18][run];
    if (traits.missingArm !== 'right') {
      poly([[19, 24], [23, 26], [farHandX + 2, 33],
        [farHandX - 2, 33], [18, 28]], skinShade);
      box(farHandX - 2, 32, 5, 2, skin);
    } else box(21, 25, 4, 2, skinShade);
    poly([[21, 26], [24, 27], [footX + 2, 34], [footX - 2, 34],
      [18, 30]], pants);
    box(footX - 2, 34, 6, 2, ink);
    const farFootX = [11, 13, 18, 22, 18, 14][run];
    poly([[11, 27], [15, 29], [farFootX + 2, 34],
      [farFootX - 2, 34], [9, 30]], pantsShade);
    box(farFootX - 2, 34, 5, 2, ink);
    poly([[9, 17 + bob], [15, 15 + bob], [20, 19 + bob],
      [17, 24 + bob], [10, 23 + bob]], skinShade);
    box(10, 17 + bob, 7, 4, skin);
    box(10, 17 + bob, 3, 1, skinLight);
    if (!back) box(side ? 16 : diagonal ? 14 : 12, 19 + bob, 2, 1, '#f96764');
    if (attacking) {
      box(21 + lurch, 26, 7, 3, skin);
      box(27 + lurch, 27, 3, 2, skinLight);
    }
    if (traits.dress) {
      poly([[11, 24 + bob], [21, 23 + bob], [25, 30 + bob],
        [8, 31 + bob]], '#737d7e');
      box(9, 30 + bob, 15, 1, '#a3adab');
    }
    if (traits.cap) {
      box(9, 15 + bob, 9, 2, '#4c5557');
      box(17, 17 + bob, 4, 1, '#4c5557');
    }
    return;
  }

  const huge = type === 'brute' || type === 'boss';
  const boss = type === 'boss';
  const shoulder = huge ? (boss ? 3 : 5) : 8;
  const headTop = huge ? (boss ? 3 : 5) : 6;
  const footLeft = 10 + stride;
  const footRight = 20 - stride;
  // Separate thighs, knees, and feet. Brutes spend more time on planted poses.
  poly([[11, 27 + bob], [17, 28 + bob], [16, 33], [footLeft + 2, 35],
    [footLeft - 1, 35], [10, 32]], pants);
  poly([[17, 28 + bob], [23, 27 + bob], [24, 32], [footRight + 3, 35],
    [footRight, 35], [18, 32]], pantsShade);
  box(footLeft - 2, 35, huge ? 7 : 6, 2, ink);
  box(footRight, 35, huge ? 8 : 6, 2, ink);
  box(footLeft, 32, 2, 2, skinShade);
  box(footRight + 1, 32, 2, 2, skinShade);

  const headX = side ? 16 : diagonal ? 14 : 12;
  const headW = huge ? (boss ? 10 : 9) : 8;
  poly([[headX + 1, headTop], [headX + headW - 2, headTop],
    [headX + headW, headTop + 3], [headX + headW - 1, headTop + 10],
    [headX + 1, headTop + 10], [headX, headTop + 4]], ink);
  box(headX + 1, headTop + 1, headW - 2, 7, skin);
  box(headX + 1, headTop + 1, Math.max(2, headW - 4), 2, skinLight);
  box(headX + 1, headTop + 8, headW - 2, 2, skinShade);
  if (!back) {
    box(headX + (side ? headW - 3 : 2), headTop + 4, side ? 2 : 1, 1, '#f56560');
    if (!side) box(headX + headW - 3, headTop + 4, 1, 1, '#f56560');
  } else box(headX + 2, headTop + 3, headW - 3, 2, skinShade);

  poly([[shoulder + 3, 16 + bob], [28 - shoulder / 2, 16 + bob],
    [30 - shoulder / 2, 21 + bob], [25, 30 + bob],
    [9, 30 + bob], [shoulder, 23 + bob]], ink);
  poly([[shoulder + 3, 17 + bob], [26 - shoulder / 2, 17 + bob],
    [27 - shoulder / 2, 22 + bob], [23, 29 + bob],
    [10, 29 + bob], [shoulder + 1, 22 + bob]], shirt);
  poly([[shoulder + 3, 18 + bob], [16, 18 + bob], [15, 28 + bob],
    [10, 28 + bob], [shoulder + 1, 23 + bob]], trim);
  box(18, 19 + bob, 4, 9, shade);
  if (back) {
    box(13, 20 + bob, 8, 7, shade);
    box(14, 21 + bob, 5, 2, shirt);
  }

  if (huge) {
    // Wide dragging arms and asymmetrical shoulders define the heavy types.
    poly([[shoulder + 2, 17 + bob], [shoulder + 7, 19 + bob],
      [shoulder + 4 + swing, 30], [shoulder - 1 + swing, 31],
      [shoulder - 1, 22]], skinShade);
    box(shoulder - 1 + swing, 29, 5, 4, skin);
    poly([[25, 18 + bob], [29, 20 + bob], [30 + lurch - swing, 31],
      [26 + lurch - swing, 32], [23, 23 + bob]], skinShade);
    box(25 + lurch - swing, 29, 6, 5, skin);
    box(shoulder, 17 + bob, 5, 3, shade);
    box(24, 17 + bob, 6, 3, trim);
  } else {
    if (special || traits.missingArm !== 'left') {
      poly([[8, 18 + bob], [12, 19 + bob], [10 + swing, 27],
        [6 + swing, 29], [5, 24]], skinShade);
      box(5 + swing, 27, 5, 3, skin);
      box(8, 18 + bob, 4, 3, shade);
    } else box(7, 19 + bob, 5, 3, skinShade);
    if (special || traits.missingArm !== 'right') {
      poly([[23, 18 + bob], [27, 20 + bob], [29 + lurch - swing, 28],
        [25 + lurch - swing, 29], [22, 23]], skinShade);
      box(25 + lurch - swing, 27, 5, 3, skin);
      box(23, 18 + bob, 4, 3, shirt);
    } else box(24, 19 + bob, 5, 3, skinShade);
  }

  if (!special) {
    box(16, 18 + bob, 2, 10, shade);
    box(18, 19 + bob, 1, 6, trim);
    if (traits.dress) {
      poly([[10, 25 + bob], [23, 25 + bob], [27, 33 + bob],
        [7, 33 + bob]], '#747e7f');
      box(8, 32 + bob, 18, 1, '#a1abaa');
    }
    if (traits.cap) {
      box(headX, headTop - 1, headW + 1, 2, '#4b5557');
      box(headX + headW - 1, headTop + 1, 4, 1, '#4b5557');
    }
    return;
  }

  // Specials retain one fixed costume per type; luminous anatomy is their cue.
  if (type === 'spitter') {
    box(10, 21 + bob, 11, 6, '#a9fb48');
    box(12, 23 + bob, 8, 3, '#e1ff83');
    box(headX + 3, headTop + 7, 6, 3, '#bafc59');
    box(4, 21 + bob, 3, 7, '#86d538');
  } else if (type === 'exploder') {
    poly([[11, 18 + bob], [23, 18 + bob], [27, 25 + bob],
      [22, 30 + bob], [10, 29 + bob], [8, 24 + bob]], '#d95d32');
    box(13, 20 + bob, 9, 7, '#ff9a3c');
    box(15, 21 + bob, 5, 3, '#ffe278');
    box(6, 22 + bob, 3, 5, '#ff823a');
  } else if (type === 'screamer') {
    box(headX + 2, headTop - 2, 2, 4, '#ff5cdb');
    box(headX + headW - 2, headTop - 3, 2, 5, '#ff5cdb');
    box(headX + 3, headTop + 7, 4, 4, '#2d2837');
    box(headX + 4, headTop + 8, 2, 2, '#ff8fea');
    box(14, 19 + bob, 5, 8, '#ec4eb9');
    box(15, 20 + bob, 3, 5, '#ff9bee');
  } else if (type === 'brute') {
    box(5, 17 + bob, 5, 3, '#4bf4e0');
    box(25, 18 + bob, 5, 3, '#4bf4e0');
    box(15, 21 + bob, 5, 4, '#63d7c9');
    box(17, 20 + bob, 2, 3, '#bcfff1');
  } else if (type === 'boss') {
    box(4, 15 + bob, 5, 5, '#e7fa68');
    box(25, 15 + bob, 5, 5, '#e7fa68');
    poly([[14, 20 + bob], [20, 20 + bob], [22, 25 + bob],
      [17, 29 + bob], [12, 25 + bob]], '#e7fa68');
    box(16, 21 + bob, 3, 3, '#fff6ad');
  }
}

function getZombieArtAtlas(type, variant = 0) {
  const fixedVariant = type === 'walker' || type === 'runner' ? variant % ZOMBIE_VARIANTS.length : 0;
  const key = `${type}:${fixedVariant}`;
  if (ZOMBIE_ART_CACHE.has(key)) return ZOMBIE_ART_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = ZOMBIE_ART_CELL.width * 6;
  canvas.height = ZOMBIE_ART_CELL.height * ZOMBIE_ART_DIRECTIONS.length * 3;
  const ctx = canvas.getContext('2d');
  for (const [clip, clipIndex] of Object.entries(ZOMBIE_ART_CLIPS)) {
    for (const [directionIndex, direction] of ZOMBIE_ART_DIRECTIONS.entries()) {
      const count = clip === 'move' ? 6 : clip === 'attack' ? 4 : 1;
      for (let frame = 0; frame < count; frame++) {
        ctx.save();
        ctx.translate(frame * ZOMBIE_ART_CELL.width,
          (clipIndex * 8 + directionIndex) * ZOMBIE_ART_CELL.height);
        ctx.beginPath();
        ctx.rect(0, 0, ZOMBIE_ART_CELL.width, ZOMBIE_ART_CELL.height);
        ctx.clip();
        drawZombieArtFrame(ctx, type, fixedVariant, direction, clip, frame);
        ctx.restore();
      }
    }
  }
  ZOMBIE_ART_CACHE.set(key, canvas);
  return canvas;
}

function zombieArtFrame(type, facing, moving, attackElapsed, distance) {
  const direction = Math.max(0, ZOMBIE_ART_DIRECTIONS.indexOf(facing));
  let clip = ZOMBIE_ART_CLIPS.idle;
  let frame = 0;
  if (attackElapsed >= 0 && attackElapsed < (type === 'brute' || type === 'boss' ? .72 : .36)) {
    clip = ZOMBIE_ART_CLIPS.attack;
    frame = Math.min(3, Math.floor(attackElapsed / (type === 'brute' || type === 'boss' ? .18 : .09)));
  } else if (moving) {
    clip = ZOMBIE_ART_CLIPS.move;
    const distancePerFrame = type === 'runner' ? 7 : type === 'brute' || type === 'boss' ? 9 : 8;
    frame = Math.floor(distance / distancePerFrame) % 6;
  }
  return { x: frame * ZOMBIE_ART_CELL.width,
    y: (clip * 8 + direction) * ZOMBIE_ART_CELL.height,
    width: ZOMBIE_ART_CELL.width, height: ZOMBIE_ART_CELL.height };
}
