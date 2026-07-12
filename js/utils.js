'use strict';

function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx*dx + dy*dy);
}

function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx*dx + dy*dy;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function lerp(a, b, t) { return a + (b - a) * t; }

function normalize(dx, dy) {
  const len = Math.sqrt(dx*dx + dy*dy);
  return len > 0 ? { dx: dx/len, dy: dy/len } : { dx: 0, dy: 0 };
}

function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

function randFloat(lo, hi) { return Math.random() * (hi - lo) + lo; }

function worldToTile(wx, wy) {
  return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
}

function tileCenterX(tx) { return tx * TILE + TILE / 2; }
function tileCenterY(ty) { return ty * TILE + TILE / 2; }

// Draw a rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// HSL color helper
function hslColor(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }
