import { bake2D } from './atlas-contract.mjs';

const C = {
  ink: '#202a27', oliveDark: '#365236', olive: '#658446', oliveLit: '#a2b766',
  oliveFlash: '#d0d981', strap: '#c4ac6d', skin: '#d9af7d', skinShade: '#916d50',
  leather: '#5f4633', boot: '#303331', steel: '#252e31', steelLit: '#788b83',
  bone: '#c6c1b5', boneLit: '#e5ddcc', boneShade: '#858d87',
  shirt: '#41474b', shirtLit: '#66706f', pant: '#a1aaa6', pantShade: '#717e7d',
  eye: '#f8dc74', ember: '#ffbf59', emberCore: '#fff0ab',
};

function poly(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
  for (const [x, y] of points.slice(1)) ctx.lineTo(Math.round(x), Math.round(y));
  ctx.closePath();
  ctx.fill();
}

function block(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function stroke(ctx, points, width, fill) {
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0][0]) + 0.5, Math.round(points[0][1]) + 0.5);
  for (const [x, y] of points.slice(1)) ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
  ctx.stroke();
}

function depth(dir, ctx) {
  const back = ['N', 'NE', 'NW'].includes(dir);
  const side = dir === 'E' || dir === 'W';
  const mirror = ['W', 'NW', 'SW'].includes(dir);
  if (mirror) { ctx.translate(40, 0); ctx.scale(-1, 1); }
  if (side) { ctx.translate(20, 0); ctx.scale(0.78, 1); ctx.translate(-20, 0); }
  return { back, side, diagonal: !side && !['S', 'N'].includes(dir) };
}

function pixelLeg(ctx, hipX, kneeX, footX, lifted, far, zombie = false) {
  const hipY = zombie ? 30 : 31;
  const kneeY = zombie ? 36 : 37;
  const footY = 43 - lifted;
  const ink = C.ink;
  const upper = zombie ? (far ? C.pantShade : C.pant) : (far ? C.oliveDark : C.olive);
  const lower = zombie ? (far ? C.boneShade : C.pantShade) : C.oliveDark;
  stroke(ctx, [[hipX, hipY], [kneeX, kneeY], [footX, footY - 2]], 5, ink);
  stroke(ctx, [[hipX, hipY], [kneeX, kneeY]], 3, upper);
  stroke(ctx, [[kneeX, kneeY], [footX, footY - 2]], 3, lower);
  block(ctx, kneeX - 1, kneeY - 1, 2, 2, far ? lower : (zombie ? C.boneLit : C.oliveLit));
  poly(ctx, [[footX - 2, footY - 3], [footX + 2, footY - 3], [footX + 4, footY],
    [footX - 3, footY]], zombie ? C.boneShade : C.boot);
  block(ctx, footX - 1, footY - 1, 4, 1, zombie ? C.pant : C.leather);
}

function pixelSniper(ctx, dir, clip, frame, frames) {
  const { back, side, diagonal } = depth(dir, ctx);
  const phase = frame / frames * Math.PI * 2;
  const stride = clip === 'walk' ? Math.sin(phase) * 3.1 : 0;
  const bounce = clip === 'walk' ? Math.round(Math.abs(Math.cos(phase))) : 0;
  const gathering = clip === 'gather' ? [0, 1, 2, 3, 2, 1][frame] : 0;
  const recoil = clip === 'shoot' ? [0, 0, 1, 2, 1, 0][frame] : 0;
  const shift = diagonal ? 1 : 0;
  const bodyX = 20 + (clip === 'walk' ? Math.round(Math.cos(phase)) : 0);
  const nearFoot = bodyX + (side ? stride : stride * 0.65) + 3;
  const farFoot = bodyX - (side ? stride : stride * 0.65) - 3;
  pixelLeg(ctx, bodyX - 3, bodyX - 3 + stride * 0.42, farFoot, stride > 1.8 ? 2 : 0, true);
  pixelLeg(ctx, bodyX + 3, bodyX + 3 - stride * 0.42, nearFoot, stride < -1.8 ? 2 : 0, false);

  // Packs and webbing are drawn before the silhouette, so the shoulder remains readable.
  poly(ctx, [[bodyX - 8, 19 + bounce], [bodyX - 3, 17 + bounce],
    [bodyX - 2, 28 + bounce], [bodyX - 9, 29 + bounce]], C.ink);
  block(ctx, bodyX - 8, 20 + bounce, 5, 8, C.leather);
  block(ctx, bodyX - 7, 21 + bounce, 2, 4, C.oliveLit);
  poly(ctx, [[bodyX - 6, 18 + bounce + gathering], [bodyX + 5, 17 + bounce + gathering],
    [bodyX + 8, 22 + bounce + gathering], [bodyX + 6, 31 + bounce + gathering],
    [bodyX - 6, 31 + bounce + gathering], [bodyX - 8, 24 + bounce + gathering]], C.ink);
  poly(ctx, [[bodyX - 5, 19 + bounce + gathering], [bodyX + 4, 18 + bounce + gathering],
    [bodyX + 6, 23 + bounce + gathering], [bodyX + 5, 29 + bounce + gathering],
    [bodyX - 5, 29 + bounce + gathering]], C.olive);
  block(ctx, bodyX - 4, 20 + bounce + gathering, 3, 7, C.oliveDark);
  block(ctx, bodyX + 2, 20 + bounce + gathering, 2, 6, C.oliveLit);
  block(ctx, bodyX - 2, 19 + bounce + gathering, 4, 2, C.oliveLit);
  block(ctx, bodyX + 4, 22 + bounce + gathering, 2, 4, C.oliveDark);
  block(ctx, bodyX - 3, 26 + bounce + gathering, 4, 2, C.oliveLit);
  block(ctx, bodyX - 4, 29 + bounce + gathering, 9, 2, C.leather);
  block(ctx, bodyX + 2, 27 + bounce + gathering, 3, 4, C.strap);
  block(ctx, bodyX + 3, 23 + bounce + gathering, 2, 2, C.oliveFlash);
  block(ctx, bodyX - 5, 28 + bounce + gathering, 2, 2, C.oliveDark);
  if (!back) {
    stroke(ctx, [[bodyX - 3, 19 + bounce], [bodyX + 2, 27 + bounce]], 2, C.strap);
    block(ctx, bodyX - 2, 24 + bounce, 2, 3, C.oliveFlash);
  } else {
    block(ctx, bodyX - 4, 21 + bounce, 9, 7, C.oliveDark);
    block(ctx, bodyX - 2, 22 + bounce, 5, 2, C.strap);
  }

  const headY = 10 + bounce + gathering;
  poly(ctx, [[bodyX - 4, headY], [bodyX + 4, headY], [bodyX + 5, headY + 4],
    [bodyX + 3, headY + 8], [bodyX - 4, headY + 8], [bodyX - 5, headY + 4]], C.ink);
  block(ctx, bodyX - 3, headY + 3, 7, 5, back ? C.oliveDark : C.skin);
  if (!back) {
    block(ctx, bodyX + 1, headY + 4, 3, 2, C.skinShade);
    block(ctx, bodyX + (side ? 2 : -1), headY + 5, side ? 1 : 3, 1, C.ink);
  }
  poly(ctx, [[bodyX - 5, headY + 2], [bodyX - 4, headY - 1], [bodyX + 3, headY - 2],
    [bodyX + 5, headY + 2], [bodyX + 4, headY + 4], [bodyX - 5, headY + 4]], C.oliveDark);
  block(ctx, bodyX - 4, headY, 7, 2, C.oliveLit);
  block(ctx, bodyX + 2, headY + 1, 2, 1, C.oliveFlash);
  block(ctx, bodyX - 4, headY + 1, 2, 1, C.oliveFlash);
  block(ctx, bodyX - 5, headY + 3, 11, 1, C.ink);

  const armY = 22 + bounce + gathering;
  const handX = gathering ? bodyX + 7 : bodyX + (side ? 9 : 7);
  const handY = gathering ? armY + 9 : armY + 3;
  stroke(ctx, [[bodyX - 6, armY - 2], [bodyX - 9, armY + 3], [bodyX - 7, armY + 6]], 4, C.ink);
  stroke(ctx, [[bodyX - 6, armY - 2], [bodyX - 9, armY + 3]], 2, C.oliveLit);
  block(ctx, bodyX - 8, armY + 5, 2, 2, C.skin);
  stroke(ctx, [[bodyX + 5, armY - 2], [bodyX + 8, armY + 1], [handX, handY]], 5, C.ink);
  stroke(ctx, [[bodyX + 5, armY - 2], [bodyX + 8, armY + 1]], 3, C.olive);
  block(ctx, handX - 1, handY - 1, 3, 2, C.skin);

  const gunY = gathering ? armY + 8 : armY + (back ? -2 : 2) - recoil;
  const gunStart = bodyX + (back ? -4 : 1);
  const gunEnd = gathering ? bodyX + 8 : bodyX + (side ? 18 : 16);
  if (back) {
    const buttY = gathering ? armY + 11 : armY + 7;
    stroke(ctx, [[bodyX + 7, buttY], [bodyX + 8, headY - 2 - recoil]], 4, C.ink);
    stroke(ctx, [[bodyX + 8, buttY - 5], [bodyX + 8, headY - 3 - recoil]], 2, C.steel);
    block(ctx, bodyX + 6, buttY - 1, 3, 3, C.leather);
    block(ctx, bodyX + 7, headY - 4 - recoil, 2, 2, C.steelLit);
    if (clip === 'shoot' && (frame === 1 || frame === 2)) {
      block(ctx, bodyX + 6, headY - 8 - recoil, 4, 3, C.ember);
      block(ctx, bodyX + 7, headY - 9 - recoil, 2, 2, C.emberCore);
    }
  } else {
    stroke(ctx, [[gunStart, gunY + 1], [gunEnd, gunY]], 4, C.ink);
    stroke(ctx, [[gunStart + 4, gunY], [gunEnd - 1, gunY]], 2, C.steel);
    block(ctx, gunStart + 2, gunY + 1, 6, 2, C.leather);
    block(ctx, gunEnd - 2, gunY - 1, 3, 1, C.steelLit);
    block(ctx, gunStart + 6, gunY - 3, 4, 2, C.steelLit);
    if (clip === 'shoot' && (frame === 1 || frame === 2)) {
      poly(ctx, [[gunEnd + 1, gunY], [gunEnd + 3, gunY - 2], [gunEnd + 4, gunY],
        [gunEnd + 7, gunY + 1], [gunEnd + 3, gunY + 2]], C.ember);
      block(ctx, gunEnd + 2, gunY, 3, 1, C.emberCore);
    }
  }
}

function pixelWalker(ctx, dir, clip, frame, frames) {
  const { back, side } = depth(dir, ctx);
  const phase = frame / frames * Math.PI * 2;
  const stride = clip === 'walk' ? Math.sin(phase) * 3.6 : 0;
  const drag = clip === 'walk' ? Math.cos(phase) * 1.4 : 0;
  const lunge = clip === 'attack' ? [0, 1, 3, 4, 2, 0][frame] : 0;
  const bodyX = 20 + Math.round(drag) + lunge;
  const bob = clip === 'walk' ? Math.round(Math.abs(drag)) : 0;
  pixelLeg(ctx, bodyX - 3, bodyX - 4 + stride * 0.5, bodyX - 4 - stride, stride > 2 ? 1 : 0, true, true);
  pixelLeg(ctx, bodyX + 3, bodyX + 2 - stride * 0.35, bodyX + 3 + stride, stride < -2 ? 1 : 0, false, true);

  // The ragged overshirt is intentionally uneven rather than a mirrored block.
  poly(ctx, [[bodyX - 7, 18 + bob], [bodyX + 3, 17 + bob], [bodyX + 8, 21 + bob],
    [bodyX + 6, 30 + bob], [bodyX + 1, 31 + bob], [bodyX - 6, 29 + bob],
    [bodyX - 9, 24 + bob]], C.ink);
  poly(ctx, [[bodyX - 6, 19 + bob], [bodyX + 3, 18 + bob], [bodyX + 6, 22 + bob],
    [bodyX + 4, 29 + bob], [bodyX - 5, 28 + bob]], C.shirt);
  block(ctx, bodyX - 5, 19 + bob, 3, 5, C.shirtLit);
  block(ctx, bodyX + 2, 25 + bob, 4, 2, C.shirtLit);
  block(ctx, bodyX - 3, 28 + bob, 4, 2, C.pantShade);
  block(ctx, bodyX - 5, 25 + bob, 2, 1, C.boneShade);
  block(ctx, bodyX + 3, 21 + bob, 2, 1, C.boneShade);

  const headX = bodyX + (side ? 2 : 0) + lunge * 0.2;
  const headY = 9 + bob + lunge * 0.35;
  poly(ctx, [[headX - 4, headY + 1], [headX - 2, headY - 1], [headX + 2, headY - 1],
    [headX + 5, headY + 2], [headX + 5, headY + 7], [headX + 2, headY + 9],
    [headX - 3, headY + 8], [headX - 5, headY + 5]], C.ink);
  poly(ctx, [[headX - 3, headY + 1], [headX + 2, headY], [headX + 4, headY + 3],
    [headX + 3, headY + 7], [headX - 3, headY + 7]], C.bone);
  block(ctx, headX - 2, headY + 1, 3, 2, C.boneLit);
  block(ctx, headX + 2, headY + 4, 2, 3, C.boneShade);
  block(ctx, headX - 3, headY + 2, 1, 2, C.boneShade);
  if (!back) {
    block(ctx, headX - 2, headY + 4, side ? 2 : 3, 2, C.ink);
    if (!side) block(ctx, headX + 2, headY + 4, 2, 2, C.ink);
    block(ctx, headX + (side ? -1 : 0), headY + 4, 1, 1, C.eye);
    block(ctx, headX - 1, headY + 7, 4, 1, C.ink);
    block(ctx, headX, headY + 8, 2, 1, C.boneLit);
  }

  const shoulderY = 20 + bob;
  const reach = lunge * 1.1;
  const leftElbow = [bodyX - 9 - reach * 0.3, shoulderY + 6 + drag];
  const leftHand = [bodyX - 7 + reach, shoulderY + 11 - reach];
  stroke(ctx, [[bodyX - 6, shoulderY], leftElbow, leftHand], 5, C.ink);
  stroke(ctx, [[bodyX - 6, shoulderY], leftElbow], 3, C.shirt);
  stroke(ctx, [leftElbow, leftHand], 2, C.boneShade);
  block(ctx, leftHand[0] - 1, leftHand[1] - 1, 3, 3, C.bone);
  const rightElbow = [bodyX + 10 + reach * 0.6, shoulderY + 5 - drag];
  const rightHand = [bodyX + 9 + reach * 1.3, shoulderY + 11 - reach];
  stroke(ctx, [[bodyX + 6, shoulderY], rightElbow, rightHand], 5, C.ink);
  stroke(ctx, [[bodyX + 6, shoulderY], rightElbow], 3, C.shirtLit);
  stroke(ctx, [rightElbow, rightHand], 2, C.bone);
  block(ctx, rightHand[0] - 1, rightHand[1] - 1, 3, 3, C.boneLit);
  block(ctx, rightHand[0] + 1, rightHand[1] + 1, 1, 2, C.boneShade);
}

function drawFrame(ctx, type, direction, clip, frame, frames) {
  ctx.save();
  if (type === 'sniper') pixelSniper(ctx, direction, clip, frame, frames);
  else pixelWalker(ctx, direction, clip, frame, frames);
  ctx.restore();
}

export function buildPixelAtlas(type) {
  return bake2D(type, 'pixel', { width: 40, height: 48 }, drawFrame);
}
