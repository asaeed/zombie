'use strict';

// A* pathfinding - returns array of {x,y} world-space waypoints, or null if no path
function findPath(startX, startY, goalX, goalY, blockedFn) {
  const sx = Math.floor(startX / TILE);
  const sy = Math.floor(startY / TILE);
  const gx = Math.floor(goalX / TILE);
  const gy = Math.floor(goalY / TILE);

  if (sx === gx && sy === gy) return [];
  if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return null;
  if (blockedFn(gx, gy)) {
    // Try to find a nearby open tile
    return null;
  }

  const encode = (x, y) => y * MAP_W + x;
  const H = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);

  const gScore = new Map();
  const fScore = new Map();
  const came  = new Map();
  const openSet = new Set();

  const startKey = encode(sx, sy);
  gScore.set(startKey, 0);
  fScore.set(startKey, H(sx, sy));
  openSet.add(startKey);

  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.41], [-1, 1, 1.41], [1, -1, 1.41], [-1, -1, 1.41],
  ];

  let iters = 0;
  while (openSet.size > 0 && iters++ < 3000) {
    // Pick node with lowest fScore
    let current = -1, bestF = Infinity;
    for (const k of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) { bestF = f; current = k; }
    }

    const cx = current % MAP_W;
    const cy = Math.floor(current / MAP_W);

    if (cx === gx && cy === gy) {
      // Reconstruct path
      const path = [];
      let k = current;
      while (came.has(k)) {
        const x = k % MAP_W;
        const y = Math.floor(k / MAP_W);
        path.unshift({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
        k = came.get(k);
      }
      return path;
    }

    openSet.delete(current);

    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (blockedFn(nx, ny)) continue;
      // Prevent diagonal through corners
      if (dx !== 0 && dy !== 0) {
        if (blockedFn(cx + dx, cy) || blockedFn(cx, cy + dy)) continue;
      }

      const nk = encode(nx, ny);
      const tentG = (gScore.get(current) ?? 0) + cost;
      if (tentG < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, current);
        gScore.set(nk, tentG);
        fScore.set(nk, tentG + H(nx, ny));
        openSet.add(nk);
      }
    }
  }

  return null;
}

// Flow field for zombies - BFS from open tiles beside non-wall buildings.
// Every intact building blocks traversal, including the destination itself.
function buildFlowField(buildings, tiles) {
  const field = [];
  const distArr = [];
  for (let y = 0; y < MAP_H; y++) {
    field.push(new Array(MAP_W).fill(null));
    distArr.push(new Float32Array(MAP_W).fill(Infinity));
  }

  const blocked = new Uint8Array(MAP_W * MAP_H);
  for (const b of buildings) {
    if (b.dead) continue;
    const r = buildingGroundRect(b.type, b.tileX, b.tileY);
    for (let ty = Math.ceil(r.top / TILE - .5); ty < Math.ceil(r.bottom / TILE - .5); ty++) {
      for (let tx = Math.ceil(r.left / TILE - .5); tx < Math.ceil(r.right / TILE - .5); tx++) {
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
          blocked[ty * MAP_W + tx] = 1;
        }
      }
    }
  }

  const queue = [];

  const D4 = [[1,0],[-1,0],[0,1],[0,-1]];
  // Seed only reachable perimeter tiles, never the building footprint.
  for (const b of buildings) {
    if (b.dead || b.type === 'wall') continue;
    const r = buildingGroundRect(b.type, b.tileX, b.tileY);
    const lx = Math.ceil(r.left / TILE - .5), rx = Math.ceil(r.right / TILE - .5);
    const ly = Math.ceil(r.top / TILE - .5), ry = Math.ceil(r.bottom / TILE - .5);
    for (let ty = ly - 1; ty <= ry; ty++) {
      for (let tx = lx - 1; tx <= rx; tx++) {
        if (tx >= lx && tx < rx && ty >= ly && ty < ry) continue;
        if ((tx < lx || tx >= rx) && (ty < ly || ty >= ry)) continue;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (tiles[ty][tx] === TILE_WATER || blocked[ty * MAP_W + tx] || distArr[ty][tx] === 0) continue;
        distArr[ty][tx] = 0;
        field[ty][tx] = { dx: 0, dy: 0 };
        queue.push(tx, ty);
      }
    }
  }

  let head = 0;

  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];
    const d = distArr[y][x];

    for (const [ddx, ddy] of D4) {
      const nx = x + ddx, ny = y + ddy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (tiles[ny][nx] === TILE_WATER) continue;
      if (blocked[ny * MAP_W + nx]) continue;

      if (d + 1 < distArr[ny][nx]) {
        distArr[ny][nx] = d + 1;
        // Direction points from this new tile back toward the source
        field[ny][nx] = { dx: x - nx, dy: y - ny };
        queue.push(nx, ny);
      }
    }
  }

  return field;
}
