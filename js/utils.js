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

function cacheScreenShape(cache, cam) {
  const x0 = cache.tileX * TILE, y0 = cache.tileY * TILE;
  const x1 = x0 + TILE, y1 = y0 + TILE;
  const h = CACHE_HEIGHTS[cache.kind] * cam.zoom;
  const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam);
  const S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);
  return {
    N, E, S, W, h,
    shell: [
      { x: N.x, y: N.y - h }, { x: E.x, y: E.y - h }, E, S, W,
      { x: W.x, y: W.y - h },
    ],
  };
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > py) !== (b.y > py) &&
        px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
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

function mainMenuButtonRect(W) {
  return { x: W - 88, y: 8, w: 76, h: 28 };
}

function mapCompass(W) {
  const center = { x: W - 50, y: 88 }, cam = { x: 0, y: 0, zoom: 1 };
  // Wave edge labels use map axes, not the screen-facing sprite compass.
  const directions = [[0, 'N', 0, -1], [1, 'E', 1, 0], [2, 'S', 0, 1], [3, 'W', -1, 0]];
  return { center, radius: 36, points: directions.map(([edge, label, x, y]) => {
    const p = worldToScreen(x, y, cam), scale = 29 / Math.hypot(p.x, p.y);
    return { edge, label, x: center.x + p.x * scale, y: center.y + p.y * scale };
  }) };
}

function mainMenuPanelRect(W) {
  const w = Math.min(270, W - 24);
  return { x: W - w - 12, y: 44, w, h: 478 };
}

function mainMenuActionRects(W) {
  const panel = mainMenuPanelRect(W);
  const rows = [
    ['resume'],
    ['save-auto'],
    ['load-auto'],
    ['save-slot-1', 'load-slot-1'],
    ['save-slot-2', 'load-slot-2'],
    ['save-slot-3', 'load-slot-3'],
    ['new-game'],
    ['clear-saves'],
  ];
  const rects = [];
  let y = panel.y + 104;
  for (const row of rows) {
    if (row.length === 1) {
      rects.push({ action: row[0], x: panel.x + 14, y, w: panel.w - 28, h: 34 });
    } else {
      const gap = 8;
      const w = (panel.w - 28 - gap) / 2;
      rects.push({ action: row[0], x: panel.x + 14, y, w, h: 34 });
      rects.push({ action: row[1], x: panel.x + 14 + w + gap, y, w, h: 34 });
    }
    y += 42;
  }
  return rects;
}

function buildButtonRects(W, H) {
  const types = Object.keys(BUILDING_DEFS).filter(type => BUILDING_DEFS[type].canBuild);
  const cols = Math.min(4, Math.max(2, Math.floor((W - 14) / 106)));
  const rows = Math.ceil(types.length / cols);
  const h = 16 + rows * 54;
  const bw = Math.min(100, Math.floor((W - 20 - (cols - 1) * 6) / cols));
  return types.map((type, i) => ({
    type, x: 10 + (i % cols) * (bw + 6), y: H - h + 8 + Math.floor(i / cols) * 54,
    w: bw, h: 48,
  }));
}

function bottomPanelHeight(W) {
  const cols = Math.min(4, Math.max(2, Math.floor((W - 14) / 106)));
  const count = Object.values(BUILDING_DEFS).filter(def => def.canBuild).length;
  return 16 + Math.ceil(count / cols) * 54;
}

// Shared production popover geometry for renderer and hit-testing.
function productionButtonRects(b, cam) {
  const types = b.type === 'mechanics' ? ['suv'] : TRAINABLE_UNITS;
  const BTW = 96, BTH = 58, gap = 6;
  const s = worldToScreen(b.x + b.width / 2, b.y + b.height / 2, cam); // south corner
  const cols = Math.min(4, Math.max(2, Math.floor((window.innerWidth - 16) / (BTW + gap))));
  const rows = Math.ceil(types.length / cols);
  const totalW = Math.min(cols, types.length) * BTW + (Math.min(cols, types.length) - 1) * gap;
  const totalH = rows * BTH + (rows - 1) * gap;
  const startX = clamp(s.x - totalW / 2, 8, Math.max(8, window.innerWidth - totalW - 8));
  const startY = clamp(s.y + 12, 48,
    Math.max(48, window.innerHeight - bottomPanelHeight(window.innerWidth) - totalH - 52));
  return types.map((type, i) => ({
    type, x: startX + (i % cols) * (BTW + gap),
    y: startY + Math.floor(i / cols) * (BTH + gap), w: BTW, h: BTH,
  }));
}

function vehicleUnloadRect(W, H) {
  return { x: 170, y: H - bottomPanelHeight(W) - 33, w: 94, h: 22 };
}

function minimapRect(W, H, selectionVisible = false) {
  const stacked = W < 620 && selectionVisible;
  return { x: W - MINIMAP_W - 10,
    y: H - bottomPanelHeight(W) - MINIMAP_H - 10 - (stacked ? 100 : 0),
    w: MINIMAP_W, h: MINIMAP_H };
}
// The painted ground contact, not the roof envelope, defines occupied space.
function buildingGroundRect(type, tileX, tileY) {
  const def = BUILDING_DEFS[type];
  const right = (tileX + def.tileSize) * TILE, bottom = (tileY + def.tileSize) * TILE;
  const width = (def.footprint?.width ?? def.tileSize) * TILE;
  const height = (def.footprint?.height ?? def.tileSize) * TILE;
  return {left:right-width, top:bottom-height, right, bottom, width, height};
}
