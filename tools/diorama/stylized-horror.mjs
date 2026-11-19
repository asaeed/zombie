import { bake2D } from './atlas-contract.mjs';

const H = {
  ink: '#101719', charcoal: '#252e30', shadow: '#384347', ash: '#697477',
  frost: '#aab7b3', bone: '#d8d7ca', boneLight: '#f2e9d5', olive: '#445a49',
  oliveLight: '#778a67', leather: '#765944', brass: '#d0a56b', rust: '#9b5140',
  steel: '#1c272c', steelLight: '#9ba9a7', ember: '#f8b765',
};

function path(ctx, points, fill, stroke = H.ink, lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function sweep(ctx, points, width, color, outline = 0) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (outline) {
    ctx.lineWidth = width + outline * 2;
    ctx.strokeStyle = H.ink;
    ctx.stroke();
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function oval(ctx, x, y, rx, ry, fill, stroke = H.ink) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.8; ctx.stroke(); }
}

function facing(ctx, direction) {
  const back = ['N', 'NE', 'NW'].includes(direction);
  const side = direction === 'E' || direction === 'W';
  if (['W', 'NW', 'SW'].includes(direction)) { ctx.translate(80, 0); ctx.scale(-1, 1); }
  if (side) { ctx.translate(40, 0); ctx.scale(0.82, 1); ctx.translate(-40, 0); }
  return { back, side };
}

function leg(ctx, hip, knee, foot, upper, lower, shoe, near) {
  sweep(ctx, [hip, knee], near ? 7 : 6, upper, 1.8);
  oval(ctx, knee[0], knee[1], 3.6, 3.4, lower, null);
  sweep(ctx, [knee, [foot[0], foot[1] - 3]], near ? 5.6 : 5, lower, 1.6);
  path(ctx, [[foot[0] - 4, foot[1] - 4], [foot[0] + 3, foot[1] - 4],
    [foot[0] + 7, foot[1]], [foot[0] - 5, foot[1] + 1]], shoe, H.ink, 1.6);
  sweep(ctx, [[hip[0] - 1, hip[1] - 1], [knee[0] - 1, knee[1] - 2]], 1.2,
    near ? H.frost : H.shadow);
}

function sniper(ctx, direction, clip, frame, frames) {
  const { back, side } = facing(ctx, direction);
  const phase = frame / frames * Math.PI * 2;
  const walk = clip === 'walk';
  const step = walk ? Math.sin(phase) * 7 : 0;
  const bob = walk ? Math.abs(Math.cos(phase)) * 1.8 : Math.sin(phase) * 0.4;
  const gather = clip === 'gather' ? [0, 1, 3, 4, 3, 1][frame] : 0;
  const recoil = clip === 'shoot' ? [0, 1, 4, 5, 2, 0][frame] : 0;
  const x = 39 + (walk ? Math.cos(phase) : 0);
  const y = bob + gather * 0.8;
  const coatLight = ctx.createLinearGradient(x - 12, 37 + y, x + 10, 59 + y);
  coatLight.addColorStop(0, '#758b71');
  coatLight.addColorStop(0.48, H.olive);
  coatLight.addColorStop(1, '#273a35');
  const hip = [x, 58 + y];
  leg(ctx, [x - 4, hip[1]], [x - 5 + step * 0.4, 72 + y],
    [x - 6 - step, 83 - Math.max(0, step) * 0.28], H.olive, H.charcoal, H.leather, false);
  leg(ctx, [x + 4, hip[1]], [x + 4 - step * 0.35, 72 + y],
    [x + 6 + step, 83 - Math.max(0, -step) * 0.28], H.oliveLight, H.charcoal, H.leather, true);

  // A long, irregular coat breaks the rigid box silhouette.
  path(ctx, [[x - 11, 36 + y], [x + 8, 35 + y], [x + 13, 48 + y],
    [x + 11, 60 + y], [x + 6, 65 + y], [x + 1, 62 + y],
    [x - 4, 66 + y], [x - 10, 60 + y], [x - 14, 48 + y]], H.charcoal);
  path(ctx, [[x - 10, 37 + y], [x + 7, 37 + y], [x + 10, 48 + y],
    [x + 5, 57 + y], [x - 7, 56 + y], [x - 12, 49 + y]], coatLight, H.ink);
  path(ctx, [[x - 10, 39 + y], [x - 4, 35 + y], [x + 1, 54 + y],
    [x - 7, 58 + y]], H.shadow, null);
  sweep(ctx, [[x - 5, 37 + y], [x + 5, 53 + y]], 3.5, H.leather, 1);
  oval(ctx, x + 3, 47 + y, 2.2, 2.3, H.brass, null);
  path(ctx, [[x - 5, 55 + y], [x + 10, 54 + y], [x + 8, 59 + y], [x - 4, 60 + y]], H.leather);
  for (const [dx, dy] of [[-8, 46], [-7, 51], [5, 42], [4, 61]]) {
    sweep(ctx, [[x + dx, dy + y], [x + dx + 3, dy - 1 + y]], 1, H.oliveLight);
  }
  if (back) {
    path(ctx, [[x - 6, 39 + y], [x + 7, 39 + y], [x + 9, 54 + y],
      [x - 6, 56 + y]], H.leather);
    sweep(ctx, [[x - 3, 40 + y], [x - 2, 53 + y]], 2, H.brass);
  }

  const headY = 29 + y;
  path(ctx, [[x - 10, headY - 2], [x - 6, headY - 9], [x + 5, headY - 10],
    [x + 10, headY - 3], [x + 7, headY + 8], [x - 5, headY + 9],
    [x - 10, headY + 3]], H.charcoal);
  path(ctx, [[x - 6, headY - 5], [x + 5, headY - 6], [x + 8, headY + 1],
    [x + 4, headY + 7], [x - 5, headY + 6]], back ? H.olive : H.ash, null);
  if (!back) {
    path(ctx, [[x - 4, headY], [x + 5, headY - 1], [x + 6, headY + 4],
      [x - 4, headY + 5]], H.ink, null);
    sweep(ctx, [[x - 2, headY + 2], [x + (side ? 5 : 2), headY + 2]], 1.6, H.brass);
  }
  sweep(ctx, [[x - 8, headY - 5], [x + 5, headY - 7]], 2.5, H.oliveLight);
  path(ctx, [[x - 8, headY - 3], [x + 9, headY - 4], [x + 6, headY - 1],
    [x - 8, headY]], H.ink, null);

  const aimY = 47 + y - recoil;
  const hand = gather ? [x + 12, aimY + 13] : [x + 12, aimY + 1];
  sweep(ctx, [[x - 10, 40 + y], [x - 15, 48 + y], [x - 10, 55 + y]], 7, H.shadow, 1.4);
  sweep(ctx, [[x + 8, 40 + y], [x + 14, 44 + y], hand], 8, H.olive, 1.5);
  oval(ctx, hand[0], hand[1], 3.1, 2.8, H.leather);
  sweep(ctx, [[x + 10, 41 + y], [x + 15, 45 + y]], 1.7, H.oliveLight);
  const muzzleX = gather ? x + 22 : x + (side ? 31 : 27);
  const muzzleY = gather ? aimY + 15 : aimY;
  if (back) {
    sweep(ctx, [[x + 12, aimY + 10], [x + 12, headY - 9 - recoil]], 5.3, H.steel, 1.8);
    sweep(ctx, [[x + 10, aimY + 2], [x + 10, headY - 7 - recoil]], 1.7, H.steelLight);
    path(ctx, [[x + 9, aimY + 4], [x + 15, aimY + 4],
      [x + 15, aimY + 10], [x + 9, aimY + 11]], H.leather);
    if (clip === 'shoot' && (frame === 1 || frame === 2)) {
      oval(ctx, x + 12, headY - 12 - recoil, 4, 5, H.ember, null);
    }
  } else {
    sweep(ctx, [[x + 1, aimY + 2], [muzzleX, muzzleY]], 5.3, H.steel, 1.8);
    sweep(ctx, [[x + 8, aimY], [muzzleX - 2, muzzleY - 1]], 1.8, H.steelLight);
    path(ctx, [[x + 4, aimY + 2], [x + 13, aimY + 1],
      [x + 13, aimY + 6], [x + 6, aimY + 7]], H.leather);
    sweep(ctx, [[x + 11, aimY - 4], [x + 18, aimY - 4]], 2.2, H.ink);
    if (clip === 'shoot' && (frame === 1 || frame === 2)) {
      path(ctx, [[muzzleX + 1, muzzleY], [muzzleX + 5, muzzleY - 4],
        [muzzleX + 7, muzzleY], [muzzleX + 12, muzzleY + 1],
        [muzzleX + 5, muzzleY + 4]], H.ember, null);
      sweep(ctx, [[muzzleX + 1, muzzleY], [muzzleX + 6, muzzleY]], 2, H.boneLight);
    }
  }
}

function walker(ctx, direction, clip, frame, frames) {
  const { back, side } = facing(ctx, direction);
  const phase = frame / frames * Math.PI * 2;
  const walk = clip === 'walk';
  const step = walk ? Math.sin(phase) * 8 : 0;
  const sway = walk ? Math.cos(phase) * 2.6 : Math.sin(phase) * 0.6;
  const lunge = clip === 'attack' ? [0, 2, 6, 9, 5, 1][frame] : 0;
  const x = 39 + sway + lunge;
  const y = walk ? Math.abs(Math.cos(phase)) * 1.7 : 0;
  const rag = ctx.createLinearGradient(x - 13, 37 + y, x + 11, 59 + y);
  rag.addColorStop(0, '#75817f');
  rag.addColorStop(0.38, H.charcoal);
  rag.addColorStop(1, '#171e20');
  leg(ctx, [x - 4, 59 + y], [x - 7 + step * 0.4, 72 + y],
    [x - 8 - step, 84 - Math.max(0, step) * 0.25], H.ash, H.shadow, H.charcoal, false);
  leg(ctx, [x + 4, 59 + y], [x + 6 - step * 0.35, 72 + y],
    [x + 5 + step, 84 - Math.max(0, -step) * 0.25], H.frost, H.ash, H.charcoal, true);

  // The shoulder line slants; torn fabric exposes a long, bent neck.
  path(ctx, [[x - 14, 39 + y], [x + 5, 35 + y], [x + 12, 40 + y],
    [x + 11, 52 + y], [x + 5, 62 + y], [x - 7, 59 + y],
    [x - 14, 50 + y]], H.ink, H.ink, 2.3);
  path(ctx, [[x - 12, 41 + y], [x + 4, 37 + y], [x + 10, 42 + y],
    [x + 8, 52 + y], [x + 4, 58 + y], [x - 7, 56 + y]], rag, null);
  path(ctx, [[x - 10, 40 + y], [x - 3, 38 + y], [x - 4, 54 + y],
    [x - 9, 55 + y]], H.shadow, null);
  path(ctx, [[x + 4, 44 + y], [x + 11, 42 + y], [x + 9, 50 + y],
    [x + 2, 52 + y]], H.ash, null);
  for (const [dx, dy] of [[-10, 45], [-6, 51], [2, 54], [6, 48]]) {
    sweep(ctx, [[x + dx, dy + y], [x + dx + 3, dy + 3 + y]], 1, H.ink);
  }
  sweep(ctx, [[x - 1, 38 + y], [x + 4, 30 + y]], 6, H.bone, 1.4);
  const hx = x + 6 + (side ? 3 : 0) + lunge * 0.14;
  const hy = 24 + y + lunge * 0.12;
  const skull = ctx.createLinearGradient(hx - 8, hy - 9, hx + 8, hy + 9);
  skull.addColorStop(0, '#f3eddb');
  skull.addColorStop(0.48, H.bone);
  skull.addColorStop(1, H.ash);
  path(ctx, [[hx - 8, hy - 8], [hx - 2, hy - 12], [hx + 5, hy - 10],
    [hx + 10, hy - 3], [hx + 9, hy + 6], [hx + 4, hy + 12],
    [hx - 5, hy + 9], [hx - 9, hy + 2]], skull, H.ink, 2.5);
  path(ctx, [[hx - 6, hy - 5], [hx - 2, hy - 9], [hx + 5, hy - 8],
    [hx + 2, hy - 1], [hx - 6, hy + 1]], H.boneLight, null);
  path(ctx, [[hx + 5, hy - 3], [hx + 8, hy], [hx + 7, hy + 7],
    [hx + 3, hy + 9]], H.ash, null);
  if (!back) {
    oval(ctx, hx - 3, hy + 1, side ? 2.7 : 3.5, 3, H.ink, null);
    if (!side) oval(ctx, hx + 5, hy, 2.4, 3, H.ink, null);
    oval(ctx, hx - 2, hy, 0.9, 0.9, H.ember, null);
    sweep(ctx, [[hx - 1, hy + 7], [hx + 5, hy + 8]], 2.5, H.ink);
    sweep(ctx, [[hx + 1, hy + 9], [hx + 5, hy + 9]], 1, H.boneLight);
  }

  const reach = lunge * 1.4;
  const rearElbow = [x - 20 - sway, 52 + y + step * 0.3];
  const rearHand = [x - 23 + reach * 0.35, 71 + y - reach * 0.6];
  sweep(ctx, [[x - 10, 42 + y], rearElbow], 7, H.charcoal, 1.6);
  sweep(ctx, [rearElbow, rearHand], 5, H.bone, 1.5);
  oval(ctx, rearHand[0], rearHand[1], 3.8, 3.2, H.bone);
  sweep(ctx, [[rearHand[0] + 2, rearHand[1] + 1],
    [rearHand[0] + 6, rearHand[1] + 4]], 1.5, H.boneLight);
  const nearElbow = [x + 18 + reach * 0.5, 48 + y - step * 0.22];
  const nearHand = [x + 24 + reach, 69 + y - reach];
  sweep(ctx, [[x + 9, 41 + y], nearElbow], 8.5, H.charcoal, 2);
  sweep(ctx, [[x + 10, 42 + y], [nearElbow[0] - 2, nearElbow[1] - 1]], 2, H.ash);
  sweep(ctx, [nearElbow, nearHand], 5.4, H.bone, 1.6);
  oval(ctx, nearHand[0], nearHand[1], 4.2, 3.2, H.boneLight);
  for (let n = -1; n <= 1; n++) {
    sweep(ctx, [[nearHand[0] + 2, nearHand[1] + n],
      [nearHand[0] + 6, nearHand[1] + n + 2]], 1.1, H.boneLight);
  }
}

function drawFrame(ctx, type, direction, clip, frame, frames) {
  ctx.save();
  if (type === 'sniper') sniper(ctx, direction, clip, frame, frames);
  else walker(ctx, direction, clip, frame, frames);
  ctx.restore();
}

export function buildHorrorAtlas(type) {
  return bake2D(type, 'horror', { width: 80, height: 96 }, drawFrame);
}
