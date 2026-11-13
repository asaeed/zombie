'use strict';

const OPTIONS = [
  { width: 6, height: 8 },
  { width: 8, height: 10 },
  { width: 10, height: 12 },
  { width: 12, height: 16 },
  { width: 16, height: 20 },
  { width: 20, height: 26 },
  { width: 24, height: 32 },
  { width: 32, height: 40 },
];
const VISIBLE_OPTIONS = [3, 4, 5, 6, 7];
const ROLES = ['Sniper', 'Medic', 'Builder', 'Torch', 'Walker'];
const DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const COLORS = {
  Sniper: { main: '#5d8c5b', light: '#a5be81', shade: '#36523b', dark: '#1d3028', prop: '#313d39' },
  Medic: { main: '#d86777', light: '#f4a7a4', shade: '#8b4555', dark: '#462c38', prop: '#f4f1d9' },
  Builder: { main: '#e39a39', light: '#f3ce67', shade: '#91602e', dark: '#463727', prop: '#9da49a' },
  Torch: { main: '#d8bd48', light: '#f4d874', shade: '#98752c', dark: '#4b3c22', prop: '#ed663f' },
  Walker: { main: '#779654', light: '#b1c574', shade: '#455c3a', dark: '#2d3a2e', prop: '#e16956' },
};
const BRIGHT_D_COLORS = {
  Sniper: { main: '#79ad67', light: '#c6dc88', shade: '#42694b', dark: '#233d32', prop: '#d1d7a0' },
  Medic: { main: '#e9758b', light: '#ffc0b4', shade: '#a34c66', dark: '#53333e', prop: '#fff4dc' },
  Builder: { main: '#f3a944', light: '#ffdb77', shade: '#a66d31', dark: '#4f3b29', prop: '#c5c7aa' },
  Torch: { main: '#f0ce58', light: '#ffe889', shade: '#aa8134', dark: '#514026', prop: '#ff7147' },
  Walker: { main: '#aeb9b5', light: '#d9e2dc', shade: '#667872', dark: '#34443f', prop: '#ff625b' },
};
let focusRole = 'Sniper';
let facing = 'SE';
const action = 'Idle';
const spriteCache = new Map();
const buildingCache = new Map();

function unitSprite(optionIndex, role, direction, state, phase) {
  phase = ((phase % 12) + 12) % 12;
  const key = [optionIndex, role, direction, state, phase].join(':');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const { width: w, height: h } = OPTIONS[optionIndex];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const c = optionIndex === 6 ? BRIGHT_D_COLORS[role] : COLORS[role];
  const back = ['N', 'NE', 'NW'].includes(direction);
  const side = ['E', 'W'].includes(direction);
  const left = ['W', 'NW', 'SW'].includes(direction);
  const walking = state === 'Walk';
  const stride = walking ? phase % 2 : 0;
  const r = (x, y, width, height, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
  };
  if (left) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  // Each size has its own anatomy and shape vocabulary. No shared source
  // image is resampled to create the five options.
  if (optionIndex === 0) {
    r(2, 1, 2, 2, c.dark);
    r(2, 0, 2, 1, c.light);
    r(0, 3, 5, 3, c.main);
    r(1, 4, 4, 2, c.shade);
    r(1 + stride, 6, 2, 2, c.dark);
    r(4 - stride, 6, 2, 2, c.dark);
    if (side) r(0, 3, 1, 2, c.main);
    if (back) r(2, 2, 2, 2, c.shade);
    else r(3, 1, 1, 1, role === 'Walker' ? c.prop : '#e7c1a0');
    if (role === 'Sniper') { r(4, 3, 2, 1, c.prop); r(5, 2, 1, 1, c.light); }
    if (role === 'Medic') { r(2, 3, 1, 1, c.prop); r(0, 3, 1, 2, c.shade); }
    if (role === 'Builder') { r(1, 0, 4, 1, c.light); r(5, 3, 1, 2, c.prop); }
    if (role === 'Torch') { r(5, 2, 1, 3, c.dark); r(5, 0, 1, 2, c.prop); }
    if (role === 'Walker') { r(0, 3, 1, 2, c.main); r(5, 4, 1, 2, c.main); }
  } else if (optionIndex === 1) {
    r(2, 0, 4, 3, c.dark);
    r(2, 0, 4, 1, c.light);
    r(3, 1, 3, 2, c.main);
    r(1, 3, 6, 4, c.dark);
    r(2, 3, 5, 3, c.main);
    r(1, 4, 1, 2, c.shade);
    r(2 + stride, 7, 2, 3, c.dark);
    r(5 - stride, 7, 2, 3, c.dark);
    if (back) r(3, 4, 3, 3, c.shade);
    else r(side ? 5 : 3, 2, side ? 1 : 2, 1, role === 'Walker' ? c.prop : '#e8ba93');
    if (role === 'Sniper') { r(5, 5, 3, 1, c.prop); r(6, 4, 1, 1, c.light); }
    if (role === 'Medic') { r(3, 4, 3, 3, c.prop); r(4, 3, 1, 5, c.main); r(2, 5, 5, 1, c.main); }
    if (role === 'Builder') { r(1, 1, 6, 1, c.light); r(7, 4, 1, 3, c.prop); }
    if (role === 'Torch') { r(7, 3, 1, 4, c.dark); r(6, 1, 2, 2, c.prop); r(7, 0, 1, 1, '#ffe388'); }
    if (role === 'Walker') { r(0, 5, 2, 1, c.main); r(7, 4, 1, 3, c.main); }
  } else if (optionIndex === 2) {
    r(3, 0, 4, 4, c.dark);
    r(4, 0, 3, 2, c.light);
    r(3, 2, 4, 2, c.main);
    r(3, 4, 4, 5, c.dark);
    r(4, 4, 3, 4, c.main);
    r(2, 5, 2, 3, c.shade);
    r(7, 5, 1, 3, c.main);
    r(3 + stride, 9, 2, 3, c.dark);
    r(6 - stride, 9, 2, 3, c.dark);
    if (back) { r(3, 5, 4, 3, c.shade); r(4, 6, 2, 2, c.dark); }
    else r(side ? 6 : 4, 2, side ? 1 : 2, 1, role === 'Walker' ? c.prop : '#e8bc99');
    if (role === 'Sniper') { r(7, 5, 3, 1, c.prop); r(6, 4, 2, 1, c.dark); r(9, 6, 1, 1, c.light); }
    if (role === 'Medic') { r(4, 5, 2, 3, c.prop); r(3, 6, 4, 1, c.prop); r(4, 4, 2, 5, c.main); r(1, 5, 1, 3, c.prop); }
    if (role === 'Builder') { r(2, 1, 6, 1, c.light); r(8, 5, 2, 1, c.prop); r(9, 4, 1, 4, c.prop); }
    if (role === 'Torch') { r(8, 3, 1, 5, c.dark); r(8, 1, 2, 2, c.prop); r(9, 0, 1, 2, '#ffe27a'); }
    if (role === 'Walker') { r(1, 6, 2, 1, c.main); r(8, 5, 2, 2, c.main); r(3, 3, 1, 1, c.prop); }
  } else if (optionIndex === 3) {
    r(4, 1, 4, 4, c.dark);
    r(5, 1, 3, 1, c.light);
    r(4, 3, 4, 2, c.main);
    r(3, 5, 6, 6, c.dark);
    r(4, 5, 5, 5, c.main);
    r(2, 6, 2, 5, c.shade);
    r(8, 6, 2, 4, c.shade);
    r(4 + stride, 11, 2, 5, c.dark);
    r(7 - stride, 11, 2, 5, c.dark);
    r(4, 13, 2, 1, c.shade);
    if (back) { r(4, 6, 4, 4, c.shade); r(5, 7, 2, 3, c.dark); }
    else { r(side ? 7 : 5, 3, side ? 1 : 2, 1, role === 'Walker' ? c.prop : '#e5b997'); r(4, 5, 2, 1, c.light); }
    if (role === 'Sniper') { r(7, 7, 5, 2, c.prop); r(8, 6, 2, 1, c.dark); r(11, 8, 1, 1, c.light); }
    if (role === 'Medic') { r(5, 6, 2, 4, c.prop); r(4, 7, 4, 2, c.prop); r(5, 5, 2, 6, c.main); r(1, 7, 2, 4, c.prop); r(5, 2, 2, 1, c.prop); }
    if (role === 'Builder') { r(3, 2, 6, 1, c.light); r(2, 3, 8, 1, c.light); r(9, 7, 2, 2, c.prop); r(10, 5, 1, 6, c.prop); }
    if (role === 'Torch') { r(10, 4, 1, 7, c.dark); r(9, 2, 3, 3, c.prop); r(10, 0, 2, 3, '#ffe27a'); }
    if (role === 'Walker') { r(1, 7, 3, 2, c.main); r(9, 6, 3, 2, c.main); r(4, 4, 1, 1, c.prop); r(7, 4, 1, 1, c.prop); }
  } else if (optionIndex === 4) {
    r(5, 1, 6, 5, c.dark);
    r(6, 1, 4, 2, c.light);
    r(5, 4, 6, 2, c.main);
    r(3, 6, 10, 8, c.dark);
    r(4, 6, 8, 7, c.main);
    r(4, 7, 3, 5, c.light);
    r(9, 7, 3, 6, c.shade);
    r(2, 8, 2, 5, c.shade);
    r(12, 8, 2, 4, c.shade);
    r(5 + stride, 14, 3, 6, c.dark);
    r(9 - stride, 14, 3, 6, c.dark);
    r(5, 17, 3, 1, c.shade);
    if (back) { r(6, 7, 5, 6, c.shade); r(7, 8, 3, 4, c.dark); }
    else { r(side ? 10 : 7, 4, side ? 1 : 2, 1, role === 'Walker' ? c.prop : '#e6bc98'); r(6, 6, 3, 1, c.light); }
    if (role === 'Sniper') { r(10, 9, 6, 2, c.prop); r(11, 8, 3, 1, c.dark); r(14, 11, 2, 1, c.light); }
    if (role === 'Medic') { r(7, 8, 2, 5, c.prop); r(5, 9, 6, 2, c.prop); r(7, 7, 2, 7, c.main); r(1, 8, 2, 5, c.prop); r(7, 2, 2, 2, c.prop); }
    if (role === 'Builder') { r(4, 2, 8, 2, c.light); r(3, 4, 10, 1, c.light); r(12, 9, 3, 2, c.prop); r(14, 7, 2, 7, c.prop); }
    if (role === 'Torch') { r(14, 5, 1, 9, c.dark); r(12, 3, 4, 4, c.prop); r(13, 0, 3, 4, '#ffe27a'); r(14, 1, 1, 2, '#fff0ab'); }
    if (role === 'Walker') { r(1, 9, 3, 2, c.main); r(12, 8, 4, 3, c.main); r(6, 5, 1, 1, c.prop); r(9, 5, 1, 1, c.prop); r(5, 12, 3, 2, c.shade); }
  } else if (optionIndex === 5) {
    // Lean field kit: narrower torso, separate forearms, and long equipment profiles.
    r(7, 1, 6, 6, c.dark);
    r(8, 1, 5, 2, c.light);
    r(7, 4, 6, 2, c.main);
    r(6, 7, 8, 9, c.dark);
    r(7, 7, 5, 8, c.main);
    r(7, 9, 2, 5, c.light);
    r(12, 8, 2, 6, c.shade);
    r(4, 8, 3, 7, c.shade);
    r(14, 8, 2, 7, c.main);
    r(6, 15, 3, 5, c.shade);
    r(11, 15, 3, 5, c.dark);
    r(6 + stride, 20, 3, 6, c.dark);
    r(11 - stride, 20, 3, 6, c.dark);
    r(5 + stride, 24, 4, 2, c.shade);
    r(11 - stride, 24, 4, 2, c.shade);
    if (back) { r(8, 8, 5, 7, c.shade); r(9, 9, 3, 5, c.dark); }
    else { r(side ? 12 : 9, 5, side ? 1 : 2, 1, role === 'Walker' ? c.prop : '#e5ba97'); r(8, 7, 3, 1, c.light); }
    if (role === 'Sniper') { r(14, 10, 5, 2, c.prop); r(16, 9, 2, 1, c.dark); r(18, 12, 2, 1, c.light); r(4, 8, 2, 6, c.dark); }
    if (role === 'Medic') { r(8, 9, 5, 5, c.prop); r(10, 8, 1, 7, c.main); r(7, 11, 7, 1, c.main); r(2, 10, 3, 6, c.prop); r(8, 2, 4, 2, c.prop); }
    if (role === 'Builder') { r(5, 2, 10, 2, c.light); r(4, 4, 12, 1, c.shade); r(16, 11, 3, 2, c.prop); r(18, 8, 2, 10, c.prop); r(6, 13, 2, 4, c.prop); }
    if (role === 'Torch') { r(17, 5, 2, 12, c.dark); r(16, 3, 4, 4, c.prop); r(17, 0, 3, 4, '#ffe789'); r(18, 1, 1, 2, '#fff0b4'); r(5, 10, 2, 6, c.prop); }
    if (role === 'Walker') { r(2, 11, 4, 2, c.main); r(15, 10, 4, 3, c.main); r(8, 5, 1, 1, c.prop); r(12, 5, 1, 1, c.prop); r(7, 14, 6, 2, c.shade); }
  } else if (optionIndex === 6) {
    // Faceted armor: broad bevels and a clear chest panel, not surface noise.
    r(8, 1, 8, 7, c.dark);
    r(9, 1, 6, 2, c.light);
    r(8, 4, 7, 3, c.main);
    r(7, 8, 10, 11, c.dark);
    r(8, 8, 7, 10, c.main);
    r(8, 9, 3, 7, c.light);
    r(14, 9, 3, 8, c.shade);
    r(5, 10, 3, 8, c.main);
    r(3, 11, 2, 7, c.shade);
    r(17, 10, 3, 8, c.shade);
    r(2, 11, 5, 7, c.dark);
    r(3, 11, 4, 5, c.light);
    r(17, 11, 5, 7, c.dark);
    r(18, 11, 3, 5, c.main);
    r(10, 11, 4, 6, c.shade);
    r(10, 11, 2, 5, c.light);
    r(14, 12, 2, 5, c.main);
    r(6, 18, 5, 3, c.shade);
    r(13, 18, 5, 3, c.dark);
    r(7 + stride, 21, 4, 11, c.dark);
    r(13 - stride, 21, 4, 11, c.dark);
    r(6 + stride, 29, 5, 3, c.shade);
    r(13 - stride, 29, 5, 3, c.shade);
    if (back) { r(9, 10, 7, 8, c.shade); r(10, 11, 4, 5, c.dark); r(9, 18, 6, 1, c.light); }
    else { r(side ? 15 : 11, 5, side ? 1 : 2, 2, role === 'Walker' ? c.prop : '#e4b893'); r(10, 8, 4, 1, c.light); }
    if (role === 'Sniper') { r(17, 12, 7, 3, c.prop); r(19, 11, 3, 1, c.dark); r(22, 15, 2, 1, c.light); r(3, 11, 2, 7, c.dark); }
    if (role === 'Medic') { r(10, 11, 5, 6, c.prop); r(12, 10, 1, 8, c.main); r(9, 13, 7, 1, c.main); r(2, 12, 3, 7, c.prop); r(10, 3, 4, 2, c.prop); }
    if (role === 'Builder') { r(6, 3, 12, 2, c.light); r(5, 5, 14, 1, c.shade); r(19, 12, 3, 3, c.prop); r(21, 9, 2, 13, c.prop); r(4, 16, 3, 3, c.prop); }
    if (role === 'Torch') { r(21, 7, 2, 14, c.dark); r(19, 4, 5, 5, c.prop); r(20, 0, 4, 5, '#ffe27a'); r(22, 1, 1, 3, '#fff3ae'); r(4, 12, 3, 7, c.prop); }
    if (role === 'Walker') { r(1, 13, 5, 3, c.main); r(19, 12, 5, 4, c.main); r(10, 5, 2, 1, c.prop); r(14, 5, 2, 1, c.prop); r(8, 17, 8, 3, c.shade); }
  } else {
    // Rendered-miniature study: slimmer figure with layered field coat and kit.
    r(11, 1, 10, 9, c.dark);
    r(12, 2, 7, 3, c.light);
    r(11, 6, 10, 3, c.main);
    r(10, 10, 12, 14, c.dark);
    r(11, 10, 9, 12, c.main);
    r(11, 11, 4, 9, c.light);
    r(19, 12, 3, 10, c.shade);
    r(8, 13, 3, 9, c.main);
    r(5, 14, 3, 9, c.shade);
    r(22, 13, 3, 10, c.shade);
    r(8, 15, 4, 12, c.shade);
    r(9, 24, 5, 4, c.main);
    r(20, 15, 4, 12, c.dark);
    r(20, 24, 4, 4, c.shade);
    r(13, 13, 3, 8, c.light);
    r(18, 13, 3, 8, c.shade);
    r(16, 15, 2, 10, c.dark);
    r(11, 20, 9, 2, c.shade);
    r(11, 23, 5, 4, c.shade);
    r(17, 23, 5, 4, c.dark);
    r(11 + stride, 27, 5, 13, c.dark);
    r(17 - stride, 27, 5, 13, c.dark);
    r(10 + stride, 37, 6, 3, c.shade);
    r(17 - stride, 37, 6, 3, c.shade);
    r(12, 28, 1, 8, c.main);
    r(18, 28, 1, 8, c.shade);
    if (back) { r(13, 13, 8, 10, c.shade); r(14, 14, 5, 7, c.dark); r(13, 22, 8, 2, c.light); }
    else { r(side ? 19 : 14, 7, side ? 2 : 5, 3, role === 'Walker' ? c.prop : '#e3b794'); r(13, 10, 5, 2, c.light); }
    if (role === 'Sniper') { r(22, 16, 10, 3, c.prop); r(24, 15, 5, 1, c.dark); r(29, 19, 3, 1, c.light); r(5, 14, 2, 10, c.dark); r(8, 20, 3, 2, c.prop); }
    if (role === 'Medic') { r(14, 14, 6, 8, c.prop); r(16, 13, 2, 10, c.main); r(13, 17, 8, 2, c.main); r(3, 16, 4, 10, c.prop); r(13, 4, 6, 3, c.prop); r(4, 18, 2, 3, c.light); }
    if (role === 'Builder') { r(8, 4, 16, 3, c.light); r(7, 7, 18, 2, c.shade); r(25, 16, 4, 3, c.prop); r(28, 12, 3, 17, c.prop); r(5, 21, 3, 3, c.prop); r(13, 23, 2, 3, c.prop); }
    if (role === 'Torch') { r(29, 9, 2, 18, c.dark); r(27, 6, 5, 6, c.prop); r(27, 0, 5, 7, '#ffe27a'); r(29, 1, 2, 4, '#fff0ac'); r(5, 16, 3, 9, c.prop); r(7, 14, 1, 8, c.light); }
    if (role === 'Walker') { r(2, 17, 6, 3, c.main); r(25, 15, 7, 5, c.main); r(13, 7, 2, 2, c.prop); r(19, 7, 2, 2, c.prop); r(11, 23, 11, 4, c.shade); r(14, 24, 4, 2, c.dark); }
  }

  if (state === 'Gather' && phase % 3 === 0) {
    r(w - 1, Math.floor(h * .65), 1, 1, '#f2d15e');
  }
  if (state === 'Shoot' && phase % 4 === 0 && role !== 'Medic' && role !== 'Builder') {
    r(w - 1, Math.floor(h * .45), 1, 1, '#ffe895');
  }
  spriteCache.set(key, canvas);
  return canvas;
}

function buildingSprite(optionIndex, kind) {
  const key = `${optionIndex}:${kind}`;
  if (buildingCache.has(key)) return buildingCache.get(key);
  const unit = OPTIONS[optionIndex];
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'hq' ? unit.width * 4 : unit.width * 2;
  canvas.height = kind === 'hq' ? unit.height * 3 : unit.height * 3;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const rect = (x, y, width, height, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, width, height); };
  const polygon = (points, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(point => ctx.lineTo(point[0], point[1]));
    ctx.closePath();
    ctx.fill();
  };
  if (kind === 'hq') {
    const roofY = Math.floor(h * (optionIndex < 2 ? .29 : .23));
    const wallY = Math.floor(h * .53);
    rect(2, wallY, w - 4, h - wallY - 1, '#6d6459');
    rect(3, wallY + 2, w - 6, h - wallY - 4, '#a79479');
    polygon([[1, wallY], [Math.floor(w * .5), roofY], [w - 1, wallY], [Math.floor(w * .5), wallY + Math.floor(h * .19)]], optionIndex < 2 ? '#65498a' : '#6f5299');
    rect(Math.floor(w * .42), Math.floor(h * .7), Math.max(2, Math.floor(w * .16)), Math.floor(h * .3), '#302d31');
    if (optionIndex >= 1) {
      rect(2, wallY + 2, 2, h - wallY - 4, '#4a4e48');
      rect(w - 4, wallY + 2, 2, h - wallY - 4, '#4a4e48');
    }
    if (optionIndex >= 2) {
      rect(Math.floor(w * .2), Math.floor(h * .64), Math.max(2, Math.floor(w * .12)), 2, '#eac979');
      rect(Math.floor(w * .68), Math.floor(h * .64), Math.max(2, Math.floor(w * .12)), 2, '#eac979');
      rect(Math.floor(w * .47), roofY - 2, 2, Math.floor(h * .2), '#3f393f');
    }
    if (optionIndex >= 3) {
      rect(Math.floor(w * .22), wallY - 1, Math.floor(w * .56), 1, '#aa88c4');
      rect(Math.floor(w * .1), h - 3, Math.floor(w * .8), 2, '#4b5650');
    }
    if (optionIndex >= 4) {
      polygon([[Math.floor(w * .5), roofY], [Math.floor(w * .82), wallY - 1], [Math.floor(w * .52), wallY + 2]], '#8469ae');
      rect(Math.floor(w * .31), roofY + 4, 3, 2, '#b18bba');
      rect(Math.floor(w * .67), roofY + 6, 4, 2, '#3e3855');
    }
  } else {
    const stem = Math.max(2, Math.floor(w * .21));
    const middle = Math.floor(w / 2);
    rect(middle - stem / 2, Math.floor(h * .25), stem, Math.floor(h * .68), '#584d3d');
    rect(Math.floor(w * .15), Math.floor(h * .85), Math.floor(w * .7), Math.floor(h * .09), '#7d715c');
    rect(Math.floor(w * .14), Math.floor(h * .18), Math.floor(w * .72), Math.max(2, Math.floor(h * .13)), '#3e4844');
    rect(Math.floor(w * .18), Math.floor(h * .19), Math.floor(w * .64), Math.max(1, Math.floor(h * .08)), '#ffe18a');
    if (optionIndex >= 2) {
      rect(Math.floor(w * .23), Math.floor(h * .56), Math.floor(w * .54), 1, '#96836a');
      rect(Math.floor(w * .2), Math.floor(h * .38), 1, Math.floor(h * .42), '#96836a');
      rect(Math.floor(w * .79), Math.floor(h * .38), 1, Math.floor(h * .42), '#96836a');
    }
    if (optionIndex >= 4) {
      rect(Math.floor(w * .24), Math.floor(h * .16), Math.floor(w * .18), 2, '#fff0ad');
      rect(Math.floor(w * .59), Math.floor(h * .16), Math.floor(w * .18), 2, '#fff0ad');
    }
  }
  buildingCache.set(key, canvas);
  return canvas;
}

function sprite(ctx, source, x, baseline, width, height) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, Math.round(x - width / 2), Math.round(baseline - height), width, height);
}

function terrain(ctx) {
  ctx.fillStyle = '#2a4534';
  ctx.fillRect(0, 0, 640, 290);
  for (let x = -3; x < 13; x++) for (let y = -3; y < 13; y++) {
    const sx = 320 + (x - y) * 32;
    const sy = -35 + (x + y) * 16;
    if (sx < -32 || sx > 672 || sy < -16 || sy > 306) continue;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 16);
    ctx.lineTo(sx + 32, sy);
    ctx.lineTo(sx, sy + 16);
    ctx.lineTo(sx - 32, sy);
    ctx.closePath();
    ctx.fillStyle = (x * 7 + y * 11 + 80) % 14 < 3 ? '#625540' : (x + y) % 2 ? '#35543a' : '#3e5e40';
    ctx.fill();
    ctx.strokeStyle = '#2c4935';
    ctx.stroke();
  }
}

const PEOPLE = [
  { role: 'Sniper', x: 2.1, y: 5.6, direction: 'SE' },
  { role: 'Medic', x: 3.5, y: 5.0, direction: 'SW' },
  { role: 'Builder', x: 5.0, y: 4.9, direction: 'E' },
  { role: 'Torch', x: 6.4, y: 5.3, direction: 'NE' },
  { role: 'Sniper', x: 1.9, y: 7.0, direction: 'E' },
  { role: 'Medic', x: 3.3, y: 7.2, direction: 'N' },
  { role: 'Builder', x: 5.3, y: 6.8, direction: 'SE' },
  { role: 'Torch', x: 7.1, y: 6.2, direction: 'SW' },
  { role: 'Walker', x: 7.6, y: 5.3, direction: 'W' },
  { role: 'Walker', x: 8.0, y: 6.5, direction: 'SW' },
  { role: 'Walker', x: 6.6, y: 7.5, direction: 'NW' },
  { role: 'Walker', x: 4.3, y: 8.0, direction: 'N' },
  { role: 'Walker', x: 3.0, y: 8.3, direction: 'NE' },
];

function drawScene(index, sourceIndex) {
  const canvas = document.getElementById(`scene-${index}`);
  const ctx = canvas.getContext('2d');
  terrain(ctx);
  const things = [
    { kind: 'hq', x: 3.8, y: 2.5 },
    { kind: 'tower', x: 7.1, y: 2.1 },
    ...PEOPLE.map((person, order) => ({ ...person, order })),
  ].sort((a, b) => a.x + a.y - b.x - b.y);
  for (const thing of things) {
    const x = 320 + (thing.x - thing.y) * 32;
    const y = -35 + (thing.x + thing.y) * 16;
    const structure = !!thing.kind;
    const image = structure ? buildingSprite(sourceIndex, thing.kind) : unitSprite(sourceIndex, thing.role, thing.role === focusRole ? facing : thing.direction, action, 0);
    const width = structure ? (thing.kind === 'hq' ? 124 : 45) : 30;
    const height = structure ? (thing.kind === 'hq' ? 87 : 78) : 40;
    ctx.fillStyle = 'rgba(7,19,13,.38)';
    ctx.beginPath();
    ctx.ellipse(x, y + 7, structure ? width * .35 : 11, structure ? 13 : 4, 0, 0, Math.PI * 2);
    ctx.fill();
    sprite(ctx, image, x, y + 7, width, height);
    const focusedOrder = focusRole === 'Walker' ? 8 : ROLES.indexOf(focusRole);
    if (thing.role === focusRole && thing.order === focusedOrder) {
      ctx.strokeStyle = '#f5d267';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 7, 18, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const [x, y] of [[410, 155], [228, 206], [540, 214]]) {
    ctx.fillStyle = '#8a7650';
    ctx.fillRect(x, y, 8, 6);
    ctx.fillStyle = '#c19d5e';
    ctx.fillRect(x, y, 8, 2);
  }
}

function drawLineup(index, sourceIndex) {
  const ctx = document.getElementById(`lineup-${index}`).getContext('2d');
  ctx.fillStyle = '#1c2b25';
  ctx.fillRect(0, 0, 640, 85);
  ROLES.forEach((role, order) => {
    const x = 72 + order * 125;
    ctx.fillStyle = '#354b3a';
    ctx.fillRect(x - 22, 58, 44, 1);
    sprite(ctx, unitSprite(sourceIndex, role, facing, action, 0), x, 58, 30, 40);
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d5dfd2';
    ctx.fillText(role, x, 76);
  });
}

function drawDetail(index, sourceIndex) {
  const native = unitSprite(sourceIndex, focusRole, facing, action, 0);
  const zoomCanvas = document.getElementById(`zoom-${index}`);
  const zoom = zoomCanvas.getContext('2d');
  zoom.fillStyle = '#25342c';
  zoom.fillRect(0, 0, 150, 135);
  const scale = Math.floor(Math.min(110 / native.width, 108 / native.height));
  const width = native.width * scale;
  const height = native.height * scale;
  zoom.imageSmoothingEnabled = false;
  zoom.drawImage(native, Math.floor((150 - width) / 2), Math.floor((135 - height) / 2), width, height);
  const small = document.getElementById(`native-${index}`).getContext('2d');
  small.fillStyle = '#25342c';
  small.fillRect(0, 0, 90, 90);
  sprite(small, native, 45, 67, 30, 40);
  small.fillStyle = '#62735c';
  small.fillRect(24, 70, 42, 1);
}

function controls(containerId, values, getter, setter) {
  const container = document.getElementById(containerId);
  values.forEach(value => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = value;
    button.setAttribute('aria-pressed', String(value === getter()));
    button.addEventListener('click', () => {
      setter(value);
      container.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      render();
    });
    container.append(button);
  });
}

function render() {
  VISIBLE_OPTIONS.forEach((sourceIndex, index) => {
    drawScene(index, sourceIndex);
    drawLineup(index, sourceIndex);
    drawDetail(index, sourceIndex);
  });
}

controls('roles', ROLES, () => focusRole, value => { focusRole = value; });
controls('directions', DIRECTIONS, () => facing, value => { facing = value; });
render();
