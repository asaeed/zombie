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

// ── Isometric projection ──────────────────────────────────────────────────────
// The ONLY place iso math is allowed to exist. cam = {x, y, zoom};
// cam.x/cam.y are the camera offset in projected (screen) space.
function worldToScreen(wx, wy, cam) {
  return {
    x: (wx - wy) * ISO_X * cam.zoom - cam.x,
    y: (wx + wy) * ISO_Y * cam.zoom - cam.y,
  };
}

function screenToWorld(sx, sy, cam) {
  const ix = (sx + cam.x) / (ISO_X * cam.zoom);
  const iy = (sy + cam.y) / (ISO_Y * cam.zoom);
  return { x: (iy + ix) / 2, y: (iy - ix) / 2 };
}

// Screen-px radius of a ground circle r tiles wide (approximation for light pools)
function tilesToScreenRadius(tiles, zoom) { return tiles * TILE * ISO_X * zoom; }

// Projected bounding box of the full map diamond at a given zoom
function mapScreenBounds(zoom) {
  const wpx = MAP_W * TILE, hpx = MAP_H * TILE;
  return {
    minX: -hpx * ISO_X * zoom,
    maxX:  wpx * ISO_X * zoom,
    minY: 0,
    maxY: (wpx + hpx) * ISO_Y * zoom,
  };
}

// Keep the viewport CENTER over the map: every point of the map — corners
// included — can be brought to screen center, and at most half a screen of
// off-map wasteland is ever visible.
function clampCamera(cam, viewW, viewH) {
  const c = screenToWorld(viewW / 2, viewH / 2, cam);
  const wx = clamp(c.x, 0, MAP_W * TILE);
  const wy = clamp(c.y, 0, MAP_H * TILE);
  if (wx !== c.x || wy !== c.y) centerCameraOn(cam, wx, wy, viewW, viewH);
}

function centerCameraOn(cam, wx, wy, viewW, viewH) {
  cam.x = (wx - wy) * ISO_X * cam.zoom - viewW / 2;
  cam.y = (wx + wy) * ISO_Y * cam.zoom - viewH / 2;
}

// Multiply a '#rrggbb' color's brightness by f (0..1 darkens, >1 lightens)
function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Screen-space "play again" button on the end screens
// (renderer draws it, input hit-tests it)
function endScreenButtonRect(W, H) {
  return { x: W / 2 - 90, y: H / 2 + 80, w: 180, h: 44 };
}

// Screen-space rects for the barracks train buttons, anchored under the
// building's projected south corner. Renderer draws these; input hit-tests
// them — keep this the single source of truth for that layout.
function barracksButtonRects(b, cam) {
  const BTW = 96, BTH = 58, gap = 6;
  const s = worldToScreen(b.x + b.width / 2, b.y + b.height / 2, cam); // south corner
  const totalW = 3 * BTW + 2 * gap;
  const startX = s.x - totalW / 2;
  const startY = s.y + 12;
  return ['soldier', 'builder', 'scout'].map((type, i) => ({
    type, x: startX + i * (BTW + gap), y: startY, w: BTW, h: BTH,
  }));
}
