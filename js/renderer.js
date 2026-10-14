'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._lightCanvas = document.createElement('canvas');   // offscreen; sized in resize()
    this.resize();
    this._tileSprites = this._makeTileSprites();

    this._mmLayer = document.createElement('canvas');
    this._mmLayer.width = MINIMAP_W; this._mmLayer.height = MINIMAP_H;
    this._mmLayerAt = -1;   // gameTime of last rebuild
  }

  resize(width = window.innerWidth, height = window.innerHeight) {
    this.W = width;
    this.H = height;
    this.pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    for (const canvas of [this.canvas, this._lightCanvas]) {
      canvas.width = Math.round(width * this.pixelRatio);
      canvas.height = Math.round(height * this.pixelRatio);
      canvas.getContext('2d').setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }
  }

  // Pre-render one 64×32 diamond per tile type × 2 checker shades
  _makeTileSprites() {
    const mk = (fill, accent) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(32, 0); g.lineTo(64, 16); g.lineTo(32, 32); g.lineTo(0, 16);
      g.closePath(); g.fill();
      if (accent) { // subtle inner sheen (water)
        g.globalAlpha = 0.25; g.fillStyle = accent;
        g.beginPath();
        g.moveTo(32, 5); g.lineTo(55, 16); g.lineTo(32, 27); g.lineTo(9, 16);
        g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      return c;
    };
    const sprites = {
      [TILE_GRASS]: [mk('#2d4a20'), mk('#355524')],
      [TILE_DIRT]:  [mk('#5a4a2a'), mk('#4e3f24')],
      [TILE_WATER]: [mk('#1a3a5c', '#4a7ab0'), mk('#163352', '#4a7ab0')],
    };
    sprites.waste = [mk('#1c2415'), mk('#171e11')]; // off-map wasteland skirt
    sprites.unexplored = [mk('#0a0d08'), mk('#0a0d08')];   // in-map, never seen
    const dim = document.createElement('canvas');
    dim.width = 64; dim.height = 32;
    const dg = dim.getContext('2d');
    dg.fillStyle = 'rgba(8,10,24,0.45)';
    dg.beginPath();
    dg.moveTo(32, 0); dg.lineTo(64, 16); dg.lineTo(32, 32); dg.lineTo(0, 16);
    dg.closePath(); dg.fill();
    sprites.dim = dim;                                     // explored-not-visible overlay
    return sprites;
  }

  render(game, input) {
    const ctx = this.ctx;
    ctx.fillStyle = '#12180d';               // far wasteland beyond the skirt band
    ctx.fillRect(0, 0, this.W, this.H);

    this._drawTiles(ctx, game);
    this._drawSupportRanges(ctx, game);
    this._drawEntities(ctx, game);
    this._drawThreatEffects(ctx, game);
    this._drawProjectiles(ctx, game);
    this._drawParticles(ctx, game);
    this._drawBundles(ctx, game);
    this._drawFlares(ctx, game);
    this._drawLighting(ctx, game);
    if (game.buildMode && input.mouseTile) this._drawBuildGhost(ctx, game, input.mouseTile);
    if (input.selectBox) this._drawSelectionBox(ctx, input.selectBox);

    this._drawEdgeScrollHint(ctx, input);
    this._drawHUD(ctx, game, input);
    this._drawCompass(ctx, game);
    this._drawToasts(ctx, game);
    this._drawMinimap(ctx, game);
    if (game._selectedBuilding && !game._selectedBuilding.dead &&
        (game._selectedBuilding.type === 'barracks' || game._selectedBuilding.type === 'mechanics')) {
      this._drawProductionButtons(ctx, game, game._selectedBuilding);
    }
    if (game.status === 'gameover') this._drawGameOver(ctx);
    this._drawMainMenuButton(ctx, input);
    if (input.menuOpen) this._drawMainMenu(ctx, input);
    if (input.menuNotice) this._drawMenuNotice(ctx, input);
  }

  _drawSupportRanges(ctx, game) {
    const z = game.camera.zoom;
    ctx.save();
    ctx.lineWidth = 1;
    for (const u of game.selected) {
      if (u.dead || u.vehicle || (u.type !== 'medic' && u.type !== 'builder')) continue;
      const radius = u.type === 'medic' ? MEDIC_HEAL_RADIUS : BUILDER_REPAIR_RADIUS;
      const r = Math.ceil(radius / TILE);
      const ux = Math.floor(u.x / TILE), uy = Math.floor(u.y / TILE);
      ctx.fillStyle = u.type === 'medic' ? 'rgba(255,119,170,0.13)' : 'rgba(255,170,0,0.13)';
      ctx.strokeStyle = u.type === 'medic' ? 'rgba(255,119,170,0.38)' : 'rgba(255,170,0,0.38)';
      for (let ty = uy - r; ty <= uy + r; ty++) {
        for (let tx = ux - r; tx <= ux + r; tx++) {
          if (!game.tileExplored(tx, ty) ||
              dist2(u.x, u.y, tileCenterX(tx), tileCenterY(ty)) > radius * radius) continue;
          const s = worldToScreen(tx * TILE, ty * TILE, game.camera);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + 32 * z, s.y + 16 * z);
          ctx.lineTo(s.x, s.y + 32 * z);
          ctx.lineTo(s.x - 32 * z, s.y + 16 * z);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // ── Tiles ──────────────────────────────────────────────────────────────────
  _tileViewport(cam) {
    // World-space bounding box of the viewport (over-covers the diamond; fine)
    const corners = [
      screenToWorld(0, 0, cam), screenToWorld(this.W, 0, cam),
      screenToWorld(0, this.H, cam), screenToWorld(this.W, this.H, cam),
    ];
    // ponytail: textured wasteland extends SKIRT tiles past the map edge, then
    // gives way to the flat base fill — bounded per-frame cost at any zoom
    const SKIRT = 12;
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    const tx0 = clamp(Math.floor(Math.min(...xs) / TILE) - 1, -SKIRT, MAP_W + SKIRT);
    const tx1 = clamp(Math.ceil(Math.max(...xs) / TILE) + 1, -SKIRT, MAP_W + SKIRT);
    const ty0 = clamp(Math.floor(Math.min(...ys) / TILE) - 1, -SKIRT, MAP_H + SKIRT);
    const ty1 = clamp(Math.ceil(Math.max(...ys) / TILE) + 1, -SKIRT, MAP_H + SKIRT);
    return { tx0, tx1, ty0, ty1 };
  }

  _drawTiles(ctx, game) {
    const cam = game.camera, bounds = this._tileViewport(cam);
    const { tx0, tx1, ty0, ty1 } = bounds, count = (tx1 - tx0) * (ty1 - ty0);
    const terrain = typeof SCULPTED_WORLD !== 'undefined' && SCULPTED_WORLD.ready ? SCULPTED_WORLD.terrain : null;
    const cache = this._groundCache;
    let changed = !cache || cache.game !== game || cache.terrain !== terrain ||
      cache.x !== cam.x || cache.y !== cam.y || cache.zoom !== cam.zoom ||
      cache.width !== this.W || cache.height !== this.H || cache.ratio !== this.pixelRatio;
    const states = cache?.states.length === count ? cache.states : new Uint16Array(count);
    // Exact visible tile/fog comparison keeps the cache valid as exploration changes.
    let n = 0;
    for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
      const inMap = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
      const value = inMap ? game.tiles[ty][tx] | (game.tileExplored(tx, ty) ? 256 : 0) |
        (game.tileVisible(tx, ty) ? 512 : 0) : 1024;
      if (states[n] !== value) changed = true;
      states[n++] = value;
    }
    if (changed) {
      const layer = this._groundLayer ??= document.createElement('canvas');
      if (layer.width !== this.canvas.width || layer.height !== this.canvas.height) {
        layer.width = this.canvas.width; layer.height = this.canvas.height;
      }
      const ground = layer.getContext('2d');
      ground.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ground.clearRect(0, 0, this.W, this.H);
      this._paintTiles(ground, game, bounds);
      if (terrain?.nightImage) {
        const nightLayer = this._nightGroundLayer ??= document.createElement('canvas');
        if (nightLayer.width !== layer.width || nightLayer.height !== layer.height) {nightLayer.width = layer.width; nightLayer.height = layer.height;}
        const nightGround = nightLayer.getContext('2d');
        nightGround.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        nightGround.clearRect(0, 0, this.W, this.H);
        this._paintTiles(nightGround, game, bounds, true);
        const blend = this._groundBlend ??= {revision: 0};
        Object.assign(blend, {image: layer, nightImage: nightLayer, revision: blend.revision + 1});
      }
      this._groundCache = { game, terrain, states, x:cam.x, y:cam.y, zoom:cam.zoom,
        width:this.W, height:this.H, ratio:this.pixelRatio };
    }
    ctx.save(); ctx.imageSmoothingEnabled = false;
    const groundImage = terrain?.nightImage ? worldArtworkImage(this._groundBlend, game.darkness()) : this._groundLayer;
    ctx.drawImage(groundImage, 0, 0, this.W, this.H);
    ctx.restore();
  }

  _paintTiles(ctx, game, { tx0, tx1, ty0, ty1 }, night = false) {
    const cam = game.camera, z = cam.zoom;

    const w = 64 * z, h = 32 * z;
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const inMap = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
        const shade = (((tx + ty) % 2) + 2) % 2;
        const s = worldToScreen(tx * TILE, ty * TILE, cam);
        if (!inMap) {
          ctx.drawImage(this._tileSprites.waste[shade], s.x - w / 2, s.y, w, h);
          continue;
        }
        if (!game.tileExplored(tx, ty)) {
          ctx.drawImage(this._tileSprites.unexplored[shade], s.x - w / 2, s.y, w, h);
          continue;
        }
        const terrain = sculptedTerrainFrame(game.tiles[ty][tx], tx, ty, night);
        if (terrain?.baseColor) {
          // Match the textured surface and overlap subpixel edges to avoid dark seams.
          ctx.fillStyle = terrain.baseColor;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - .75);
          ctx.lineTo(s.x + w / 2 + .75, s.y + h / 2);
          ctx.lineTo(s.x, s.y + h + .75);
          ctx.lineTo(s.x - w / 2 - .75, s.y + h / 2);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.drawImage(this._tileSprites[game.tiles[ty][tx]][shade], s.x - w / 2, s.y, w, h);
        }
        if (terrain) {
          const frame = terrain.frame;
          ctx.save(); ctx.imageSmoothingEnabled = terrain.imageSmoothing;
          ctx.imageSmoothingQuality = terrain.imageSmoothingQuality;
          ctx.drawImage(terrain.image, frame.x, frame.y, frame.width, frame.height, s.x - w / 2, s.y, w + .5, h + .5);
          ctx.restore();
        }
        if (!game.tileVisible(tx, ty)) {
          ctx.drawImage(this._tileSprites.dim, s.x - w / 2, s.y, w, h);
        }
      }
    }
  }

  // ── Entities ───────────────────────────────────────────────────────────────
  // Back-to-front by (worldX + worldY): what's "behind" in iso draws first
  _drawEntities(ctx, game) {
    const drawables = [];
    this._unitDepths = new Map();
    for (const c of game.caches) {
      if (!game.tileExplored(c.tileX, c.tileY)) continue;
      drawables.push({ key: (c.tileX + 1) * TILE + (c.tileY + 1) * TILE,
                       draw: () => this._drawCache(ctx, game, c) });
    }
    for (const b of game.buildings) {
      if (b.dead) continue;
      const ts = b.def.tileSize;
      // Draw the shell at its far corner; front-adjacent units get a later key.
      drawables.push({ key: (b.tileX + ts) * TILE + (b.tileY + ts) * TILE,
                       draw: () => this._drawBuilding(ctx, game, b) });
    }
    for (const u of game.units) {
      if (u.dead || u.vehicle) continue;
      if (!this._actorOnScreen(game, u)) continue;
      const key = this._unitDrawKey(game, u);
      this._unitDepths.set(u, key);
      drawables.push({ key, draw: () => this._drawUnit(ctx, game, u) });
    }
    for (const v of game.vehicles) {
      if (!v.dead && this._actorOnScreen(game, v)) drawables.push({ key: this._unitDrawKey(game, v), draw: () => this._drawVehicle(ctx, game, v) });
    }
    for (const z of game.zombies) {
      if (z.dead) continue;
      if (!game.tileVisible(Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;
      if (!this._actorOnScreen(game, z)) continue;
      drawables.push({ key: this._unitDrawKey(game, z), draw: () => this._drawZombie(ctx, game, z) });
    }
    this._addEnvironment(drawables, ctx, game);
    drawables.sort((a, b) => a.key - b.key);
    for (const d of drawables) d.draw();
    this._unitDepths = null;
  }

  _actorOnScreen(game, actor) {
    if (!Number.isFinite(this.W) || !Number.isFinite(this.H)) return true;
    const s = worldToScreen(actor.x, actor.y, game.camera), zoom = game.camera.zoom;
    const meta = sculptedActor(actor.type)?.metadata;
    const scale = (meta?.renderScale ?? 1) * zoom;
    const left = s.x - (meta?.footAnchor.x ?? 80) * scale;
    const top = s.y - (meta?.footAnchor.y ?? 140) * scale - 30 * zoom;
    const right = left + (meta?.cell.width ?? 160) * scale;
    const bottom = s.y + 30 * zoom;
    return right >= 0 && left <= this.W && bottom >= 0 && top <= this.H;
  }

  _unitDrawKey(game, u) {
    let key = u.x + u.y;
    const inFrontOf = ({left:x0, top:y0, right:x1, bottom:y1}) => {
      const r = u.def.radius;
      return (u.x >= x1 && u.x <= x1 + TILE && u.y >= y0 - r && u.y <= y1 + r) ||
        (u.y >= y1 && u.y <= y1 + TILE && u.x >= x0 - r && u.x <= x1 + r);
    };
    for (const b of game.buildings) {
      if (!b.dead && inFrontOf(buildingGroundRect(b.type, b.tileX, b.tileY))) {
        key = Math.max(key, (b.tileX + b.def.tileSize + b.tileY + b.def.tileSize) * TILE + 0.1);
      }
    }
    for (const c of game.caches) {
      if (inFrontOf({left:c.tileX*TILE,top:c.tileY*TILE,right:(c.tileX+1)*TILE,bottom:(c.tileY+1)*TILE})) {
        key = Math.max(key, (c.tileX + c.tileY + 2) * TILE + 0.1);
      }
    }
    return key;
  }

  _addEnvironment(drawables, ctx, game) {
    if (!SCULPTED_WORLD.ready || !sculptedObject('pine')) return;
    const cam = game.camera, corners = [screenToWorld(-100, -160, cam), screenToWorld(this.W + 100, -160, cam),
      screenToWorld(-100, this.H + 160, cam), screenToWorld(this.W + 100, this.H + 160, cam)];
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x)) / TILE));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y)) / TILE));
    const x1 = Math.min(MAP_W, Math.ceil(Math.max(...corners.map(p => p.x)) / TILE));
    const y1 = Math.min(MAP_H, Math.ceil(Math.max(...corners.map(p => p.y)) / TILE));
    const hq = game.buildings.find(b => b.type === 'hq');
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      if (!game.tileExplored(tx, ty) || game.tiles[ty][tx] !== TILE_GRASS) continue;
      const hash = Math.imul(tx + 17, 73856093) ^ Math.imul(ty + 31, 19349663);
      const seed = (hash >>> 0) % 1000;
      const away = !hq || Math.hypot(tileCenterX(tx) - hq.x, tileCenterY(ty) - hq.y) > TILE * 10;
      const kind = away && seed < 70 ? 'pine' : seed >= 70 && seed < 98 ? 'bush' : seed >= 98 && seed < 109 ? 'rock' : null;
      if (!kind) continue;
      const clearance = kind === 'pine' ? 1 : 0;
      if (game.buildings.some(b => !b.dead && tx >= b.tileX - clearance && ty >= b.tileY - clearance &&
          tx < b.tileX + b.def.tileSize + clearance && ty < b.tileY + b.def.tileSize + clearance) ||
          game.caches.some(c => Math.abs(c.tileX - tx) <= clearance && Math.abs(c.tileY - ty) <= clearance)) continue;
      const x = tileCenterX(tx), y = tileCenterY(ty), key = x + y;
      const record = sculptedObject(kind), foot = worldToScreen(x, y, cam), rect = sculptedObjectRect(record, foot, cam.zoom);
      if (rect.x + rect.width < 0 || rect.y + rect.height < 0 || rect.x > this.W || rect.y > this.H) continue;
      drawables.push({ key, draw: () => {
        ctx.save();
        ctx.globalAlpha = (game.tileVisible(tx, ty) ? 1 : .55) * this._unitOcclusionAlpha(game, [], key, record, rect);
        ctx.imageSmoothingEnabled = record.imageSmoothing; ctx.imageSmoothingQuality = record.imageSmoothingQuality;
        ctx.drawImage(record.nightImage ? worldArtworkImage(record, game.darkness()) : record.image, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      } });
    }
  }

  _unitOcclusionAlpha(game, poly, drawKey, bitmap = null, rect = null) {
    const cam = game.camera;
    for (const u of game.units) {
      if (u.dead || u.vehicle || (this._unitDepths?.get(u) ?? this._unitDrawKey(game, u)) >= drawKey) continue;

      const s = worldToScreen(u.x, u.y, cam);
      const actor = sculptedActor(u.type);
      const r = Math.max(4, u.def.radius * cam.zoom * (actor ? .5 : 1));
      const bodyY = s.y - (actor ? actor.metadata.bodyHeight * actor.metadata.renderScale * cam.zoom * .5 : r * 1.2);
      const ry = actor ? actor.metadata.bodyHeight * actor.metadata.renderScale * cam.zoom * .3 : r * .7;
      const samples = [
        [s.x, bodyY],
        [s.x - r * 0.7, bodyY],
        [s.x + r * 0.7, bodyY],
        [s.x, bodyY - ry],
        [s.x, bodyY + ry],
        [s.x - r * 0.5, bodyY - ry * .7],
        [s.x + r * 0.5, bodyY - ry * .7],
        [s.x - r * 0.5, bodyY + ry * .7],
        [s.x + r * 0.5, bodyY + ry * .7],
      ];
      const covered = samples.filter(([x, y]) => bitmap ? sculptedObjectHit(bitmap, rect, x, y) : pointInPolygon(x, y, poly)).length;
      if (covered > samples.length / 2) return 0.42;
    }
    return 1;
  }

  // Ground-plane circle of world radius r at world point (via projected s)
  _groundEllipse(ctx, s, r, z) {
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.13 * z, r * 0.57 * z, 0, 0, Math.PI * 2);
  }

  _drawBuilding(ctx, game, b) {
    const cam = game.camera, z = cam.zoom;
    const def = b.def, ts = def.tileSize;
    const {left:x0,top:y0,right:x1,bottom:y1} = buildingGroundRect(b.type, b.tileX, b.tileY);
    const h = ISO_HEIGHTS[b.type] * z;
    const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam),
          S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);
    const shell = [
      { x: N.x, y: N.y - h },
      { x: E.x, y: E.y - h },
      { x: E.x, y: E.y },
      { x: S.x, y: S.y },
      { x: W.x, y: W.y },
      { x: W.x, y: W.y - h },
    ];
    const drawKey = (b.tileX + ts) * TILE + (b.tileY + ts) * TILE;
    const artwork = sculptedObject(b.type);
    const rect = artwork ? sculptedObjectRect(artwork, S, z) : null;
    const occlusionAlpha = this._unitOcclusionAlpha(game, shell, drawKey, artwork, rect);
    const cx = (N.x + S.x) / 2;

    const face = (p1, p2, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p1.x, p1.y - h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    };
    if (occlusionAlpha < 1) {
      ctx.save();
      ctx.globalAlpha *= occlusionAlpha;
    }
    if (artwork) {
      ctx.save(); ctx.imageSmoothingEnabled = artwork.imageSmoothing;
      ctx.imageSmoothingQuality = artwork.imageSmoothingQuality;
      ctx.drawImage(artwork.nightImage ? worldArtworkImage(artwork, game.darkness()) : artwork.image, rect.x, rect.y, rect.width, rect.height); ctx.restore();
    } else {
    face(E, S, shadeColor(def.color, 0.72)); // sun-side face
    face(S, W, shadeColor(def.color, 0.52)); // shade-side face

    ctx.fillStyle = def.color;               // roof
    ctx.beginPath();
    ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h);
    ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

    // Label on the roof
    const roofCy = (N.y + S.y) / 2 - h;
    const labels = { hq: 'HQ', wall: '', tower: 'T', barracks: 'B', depot: 'D', light: 'L', clinic: '+', mechanics: 'M' };
    if (labels[b.type]) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `bold ${Math.min(12, ts * 8)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[b.type], cx, roofCy);
    }
    }
    if (occlusionAlpha < 1) ctx.restore();

    // Health bar above the top corner
    const barW = 36 * ts * z;
    const topY = artwork ? rect.y : N.y - h;
    this._drawHealthBar(ctx, cx - barW / 2, topY - 10 * z, barW, 5, b.hp / b.maxHp);

    // Barracks queue indicator + progress
    if (b.type === 'barracks' && b.trainQueue.length > 0) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`[${b.trainQueue.length}]`, cx, topY - 16 * z);
      if (b.trainProgress > 0) {
        const pct = b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
        this._drawHealthBar(ctx, cx - barW / 2, topY - 24 * z, barW, 4, pct, '#44aaff');
      }
    }

    if (b.type === 'barracks' && b.rally && game._selectedBuilding === b) {
      const rp = worldToScreen(b.rally.x, b.rally.y, cam);
      this._groundEllipse(ctx, rp, 8, z);
      ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#ffdd44';
      ctx.beginPath(); ctx.moveTo(rp.x, rp.y); ctx.lineTo(rp.x, rp.y - 18 * z); ctx.stroke();
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      ctx.moveTo(rp.x, rp.y - 18 * z); ctx.lineTo(rp.x + 10 * z, rp.y - 14 * z); ctx.lineTo(rp.x, rp.y - 10 * z);
      ctx.closePath(); ctx.fill();
    }
  }

  _drawCache(ctx, game, c) {
    const cam = game.camera, z = cam.zoom;
    const colors = { car: '#8a4a30', cabin: '#7a5c3e', bin: '#3e5e46' };
    const color = colors[c.kind];
    const base = c.empty ? shadeColor(color, 0.45) : color;
    const { N, E, S, W, h, shell } = cacheScreenShape(c, cam);
    const drawKey = (c.tileX + c.tileY + 2) * TILE;
    const artwork = sculptedObject(c.kind), rect = artwork ? sculptedObjectRect(artwork, S, z) : null;
    const occlusionAlpha = this._unitOcclusionAlpha(game, shell, drawKey, artwork, rect);
    const face = (p1, p2, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p1.x, p1.y - h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    };
    if (occlusionAlpha < 1) {
      ctx.save();
      ctx.globalAlpha *= occlusionAlpha;
    }
    if (artwork) {
      ctx.save(); ctx.imageSmoothingEnabled = artwork.imageSmoothing;
      ctx.imageSmoothingQuality = artwork.imageSmoothingQuality;
      if (c.empty) ctx.globalAlpha *= .45;
      ctx.drawImage(artwork.nightImage ? worldArtworkImage(artwork, game.darkness()) : artwork.image, rect.x, rect.y, rect.width, rect.height); ctx.restore();
    } else {
    face(E, S, shadeColor(base, 0.72));
    face(S, W, shadeColor(base, 0.52));
    ctx.fillStyle = base; ctx.beginPath();
    ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h);
    ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    }
    if (occlusionAlpha < 1) ctx.restore();

    const cx = (N.x + S.x) / 2, topY = artwork ? rect.y : N.y - h;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!c.searched) {
      ctx.fillStyle = '#ffdd44'; ctx.font = `bold ${Math.max(10, 12 * z)}px monospace`;
      ctx.fillText('?', cx, topY - 8 * z);
      if (c.searchProgress > 0) {
        this._drawHealthBar(ctx, cx - 16 * z, topY - 18 * z, 32 * z, 4, c.searchProgress / SEARCH_TIME, '#ffdd44');
      }
    } else if (!c.empty) {
      ctx.fillStyle = '#ffdd44'; ctx.font = `${Math.max(9, 10 * z)}px monospace`;
      ctx.fillText(`${c.amount}`, cx, topY - 8 * z);
    }
  }

  _drawUnit(ctx, game, u) {
    const cam = game.camera, z = cam.zoom;
    const s = worldToScreen(u.x, u.y, cam);
    const artwork = sculptedActor(u.type);
    if (!artwork) return;
    const visualRadius = u.def.radius * (artwork ? .5 : 1);
    const r = visualRadius * z;

    if (u.selected) {
      this._groundEllipse(ctx, s, visualRadius + 3, z);
      ctx.strokeStyle = '#44ffff'; ctx.lineWidth = 2; ctx.stroke();
    }
    this._groundEllipse(ctx, s, visualRadius, z);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();       // ground shadow

    const stationary = u.waypoints.length === 0;
    const working = stationary && (u.gatherTarget || u.bundleTarget) ? 'gather'
      : stationary && u.repairTarget ? 'repair'
      : stationary && u.type === 'medic' && u.supportHome && !u._supportReturning && u.healCooldown > 0 ? 'heal' : null;
    this._drawActorSprite(ctx, artwork, sculptedActorFrame(artwork, u, game.gameTime, working), s, z);

    const barW = Math.max(12 * z, r * 2);
    const barX = s.x - barW / 2;
    const cargoY = s.y - (artwork.metadata.bodyHeight * artwork.metadata.renderScale + 12) * z;
    const cargoH = Math.max(1, 1.5 * z);
    const healthY = cargoY + cargoH + z;
    this._drawHealthBar(ctx, barX, healthY, barW, 4, u.hp / u.maxHp);

    if (u.carryCapacity > 0 && u.carrying > 0) {
      ctx.fillStyle = '#ffdd44';
      ctx.fillRect(barX, cargoY, barW * u.cargoRatio, cargoH);
    }

    if (u.carrying > 0) {
      ctx.fillStyle = '#b08040';
      ctx.fillRect(s.x + r * 0.7, s.y - r * 1.6, 5 * z, 5 * z);
    }

    for (const p of u.resourcePopups) {
      const alpha = clamp(1 - p.t / p.life, 0, 1);
      const y = cargoY - 11 * z - p.t * 22 * z;
      const text = `${p.amount > 0 ? '+' : ''}${p.amount}`;
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.max(12, 13 * z)}px monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(2, 2 * z);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, s.x, y);
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(text, s.x, y);
      ctx.globalAlpha = 1;
    }

    if (u.type === 'builder' && u.repairTarget) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('⚙', s.x, cargoY - 6 * z);
    }

    if (u.gatherCenter) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('G', s.x, cargoY - 6 * z);
    } else if (u.bundleGatherCenter) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('S', s.x, cargoY - 6 * z);
    }
  }

  _drawVehicle(ctx, game, v) {
    const s = worldToScreen(v.x, v.y, game.camera);
    const z = game.camera.zoom;
    const artwork = sculptedActor('suv');
    if (!artwork) return;
    const displayScale = artwork?.metadata.presentationScale ?? 1;
    const visualRadius = v.def.radius * (artwork ? .5 * displayScale : 1);
    if (game.selectedVehicle === v) {
      this._groundEllipse(ctx, s, visualRadius + 4, z);
      ctx.strokeStyle = '#44ffff'; ctx.lineWidth = 2; ctx.stroke();
    }
    this._groundEllipse(ctx, s, (visualRadius + 3) * .5, z);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    if (artwork) {
      const target = v.waypoints[0];
      if (target) {
        const dx = target.x - v.x, dy = target.y - v.y;
        if (Math.hypot(dx, dy) > .1) {
          const headings = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
          v._artFacing = headings[(Math.round(Math.atan2((dx + dy) * .5, dx - dy) / (Math.PI / 4)) + 8) % 8];
        }
      }
      const frame = artwork.metadata.clips.idle.directions[v._artFacing ?? 'SE'][0];
      this._drawActorSprite(ctx, artwork, frame, s, z);
    } else {
    ctx.save();
    ctx.translate(s.x, s.y - 11 * z);
    ctx.scale(z, z);

    ctx.fillStyle = '#1a1c20';
    ctx.fillRect(-19, 1, 8, 7);
    ctx.fillRect(12, 1, 8, 7);
    ctx.fillStyle = '#eef2ee';
    ctx.beginPath();
    ctx.moveTo(-25, -7); ctx.lineTo(-17, -15); ctx.lineTo(11, -15);
    ctx.lineTo(25, -7); ctx.lineTo(23, 4); ctx.lineTo(-23, 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5d6669'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#779aaa';
    ctx.beginPath();
    ctx.moveTo(-13, -14); ctx.lineTo(8, -14); ctx.lineTo(16, -7);
    ctx.lineTo(-19, -7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#dce5e2'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(1, -7); ctx.stroke();
    ctx.fillStyle = '#f6dc8d';
    ctx.fillRect(20, -5, 4, 3);
    ctx.fillStyle = '#9ea9a9';
    ctx.fillRect(-23, 0, 46, 2);
    ctx.restore();

    }

    const topY = artwork ? s.y - (artwork.metadata.bodyHeight * artwork.metadata.renderScale + 10) * z : s.y - 36 * z;
    const barW = (artwork ? 22 * displayScale : 44) * z;
    this._drawHealthBar(ctx, s.x - barW / 2, topY, barW, 4, v.hp / v.maxHp);
    if (v.passengers.length > 0) {
      ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.max(10, 11 * z)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${v.passengers.length}/${v.def.capacity}`, s.x, topY - 7 * z);
    }
  }

  _drawZombie(ctx, game, zb) {
    const cam = game.camera, z = cam.zoom;
    const s = worldToScreen(zb.x, zb.y, cam);
    const variant = zombieAppearance(zb.type, zb.id);
    let top, by;
    const walkerStyles = ['walker', 'walker-onearm', 'walker-cap', 'walker-dress'];
    const artwork = sculptedActor(zb.type === 'walker' ? walkerStyles[(zb._artVariant ?? variant) % walkerStyles.length] : zb.type);
    if (!artwork) return;
    const visualRadius = zb.def.radius * (artwork ? .5 : 1);
    const r = visualRadius * z;
    this._groundEllipse(ctx, s, visualRadius, z);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    ctx.save();
    ctx.globalAlpha = zb.dormant ? .43 : 1;
    this._drawActorSprite(ctx, artwork, sculptedActorFrame(artwork, zb, game.gameTime), s, z);
    top = s.y - artwork.metadata.bodyHeight * artwork.metadata.renderScale * z;
    by = s.y - artwork.metadata.bodyHeight * artwork.metadata.renderScale * z * .5;
    ctx.restore();
    if (zb.dormant) return;

    if (zb.burning) {
      const flicker = 0.75 + 0.25 * Math.sin((game.gameTime + zb.id) * 24);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,120,20,${0.35 * flicker})`;
      ctx.beginPath(); ctx.arc(s.x, by, r * 1.45, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = `rgba(255,210,80,${0.9 * flicker})`;
      for (let i = -1; i <= 1; i++) {
        const fx = s.x + i * r * 0.35;
        const fy = by - r * (0.55 + 0.15 * Math.sin(game.gameTime * 18 + i));
        ctx.beginPath();
        ctx.moveTo(fx, fy - r * 0.95);
        ctx.quadraticCurveTo(fx + r * 0.35, fy - r * 0.25, fx, fy + r * 0.35);
        ctx.quadraticCurveTo(fx - r * 0.35, fy - r * 0.25, fx, fy - r * 0.95);
        ctx.fill();
      }
    }

    const barW = Math.max(12 * z, r * 2);
    this._drawHealthBar(ctx, s.x - barW / 2, top - 6 * z, barW, 4, zb.hp / zb.maxHp, '#ff4422');
  }

  _drawActorSprite(ctx, record, frame, foot, zoom) {
    const scale = record.metadata.renderScale * zoom, anchor = record.metadata.footAnchor;
    ctx.save(); ctx.imageSmoothingEnabled = record.imageSmoothing;
    ctx.imageSmoothingQuality = record.imageSmoothingQuality;
    ctx.drawImage(record.image, frame.x, frame.y, frame.width, frame.height,
      foot.x - anchor.x * scale, foot.y - anchor.y * scale, frame.width * scale, frame.height * scale);
    ctx.restore();
  }

  _drawThreatEffects(ctx, game) {
    const z = game.camera.zoom;
    for (const effect of game.threatEffects) {
      if (!game.tileVisible(Math.floor(effect.x / TILE), Math.floor(effect.y / TILE))) continue;
      const s = worldToScreen(effect.x, effect.y, game.camera);
      const progress = effect.t / effect.life;
      ctx.strokeStyle = effect.kind === 'blast'
        ? `rgba(255,122,51,${1 - progress})`
        : `rgba(255,188,239,${0.8 * (1 - progress)})`;
      ctx.lineWidth = (effect.kind === 'blast' ? 5 : 3) * z;
      this._groundEllipse(ctx, s, effect.radius * progress, z);
      ctx.stroke();
    }
  }

  // ── Projectiles ───────────────────────────────────────────────────────────
  _drawProjectiles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const p of game.projectiles) {
      if (p.dead) continue;
      const s = worldToScreen(p.x, p.y, cam);
      const py = s.y - 10 * z;
      ctx.beginPath(); ctx.arc(s.x, py, 3 * z, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.beginPath(); ctx.arc(s.x, py, 5 * z, 0, Math.PI * 2);
      ctx.fillStyle = p.color + '55'; ctx.fill();
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  _drawParticles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const p of game.particles) {
      const alpha = p.life / p.maxLife;
      const s = worldToScreen(p.x, p.y, cam);
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(s.x, s.y - 10 * z, 2 * z, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Bundles (death-drop supply sacks) ─────────────────────────────────────
  _drawBundles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const bd of game.bundles) {
      // Remembered once seen: you know where your hauler fell
      if (!game.tileExplored(Math.floor(bd.x / TILE), Math.floor(bd.y / TILE))) continue;
      const s = worldToScreen(bd.x, bd.y, cam);
      ctx.fillStyle = '#b08040';
      ctx.beginPath(); ctx.arc(s.x, s.y - 3 * z, 5 * z, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffdd44'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${bd.amount}`, s.x, s.y - 12 * z);
    }
  }

  // ── Flares (thrown signal flares — ground stick + flickering flame) ────────
  _drawFlares(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    for (const f of game.flares) {
      const s = worldToScreen(f.x, f.y, cam);
      const flicker = 0.75 + 0.25 * Math.sin(f.t * 30);
      ctx.fillStyle = '#c03028';
      ctx.fillRect(s.x - 1.5 * z, s.y - 6 * z, 3 * z, 6 * z);       // stick
      ctx.fillStyle = `rgba(255,240,190,${flicker})`;
      ctx.beginPath(); ctx.arc(s.x, s.y - 7 * z, 2.5 * z, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Darkness + light pools (night only) ────────────────────────────────────
  _drawLighting(ctx, game) {
    const dk = game.darkness();
    if (dk < 0.02) return;
    const cam = game.camera, z = cam.zoom;
    const lc = this._lightCanvas;
    const g = lc.getContext('2d');

    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.W, this.H);
    g.fillStyle = `rgba(7, 10, 32, ${0.82 * dk})`;
    g.fillRect(0, 0, this.W, this.H);

    // Punch light pools out of the darkness — same radii the fog uses
    g.globalCompositeOperation = 'destination-out';
    const punch = (wx, wy, radiusTiles, coreAlpha = 1) => {
      const s = worldToScreen(wx, wy, cam);
      const r = tilesToScreenRadius(radiusTiles, z);
      const grad = g.createRadialGradient(s.x, s.y, r * 0.15, s.x, s.y, r);
      grad.addColorStop(0, `rgba(0,0,0,${coreAlpha})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.fill();
    };
    for (const u of game.units) {
      if (!u.dead && !u.vehicle) punch(u.x, u.y, game.visionRadius(u.type));
    }
    for (const v of game.vehicles) {
      if (!v.dead) punch(v.x, v.y, game.visionRadius(v.type));
    }
    for (const b of game.buildings) {
      if (!b.dead) punch(b.x, b.y, game.visionRadius(b.type));
    }
    for (const f of (game.flares || [])) punch(f.x, f.y, FLARE_LIGHT_RADIUS);
    for (const zmb of game.zombies) {
      if (!zmb.dead && zmb.burning) punch(zmb.x, zmb.y, FIRE_LIGHT_RADIUS, 0.85);
    }

    ctx.drawImage(lc, 0, 0, this.W, this.H);

    // Warm glows on the strongest sources
    ctx.globalCompositeOperation = 'lighter';
    const warm = (wx, wy, radiusTiles, color) => {
      const s = worldToScreen(wx, wy, cam);
      const r = tilesToScreenRadius(radiusTiles, z) * 0.6;
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const b of game.buildings) {
      if (b.dead) continue;
      if (b.type === 'hq')    warm(b.x, b.y, VISION.hq,    `rgba(255,170,70,${0.16 * dk})`);
      if (b.type === 'light') warm(b.x, b.y, VISION.light, `rgba(255,225,140,${0.14 * dk})`);
    }
    for (const u of game.units) {
      if (!u.dead && !u.vehicle && u.type === 'torchbearer') {
        warm(u.x, u.y, TORCH_LIGHT_RADIUS, `rgba(255,145,55,${0.22 * dk})`);
      }
    }
    for (const f of (game.flares || [])) warm(f.x, f.y, FLARE_LIGHT_RADIUS, `rgba(255,120,40,${0.4 * dk})`);
    for (const zmb of game.zombies) {
      if (!zmb.dead && zmb.burning) warm(zmb.x, zmb.y, FIRE_LIGHT_RADIUS, `rgba(255,95,20,${0.28 * dk})`);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Cold night tint
    ctx.fillStyle = `rgba(40, 60, 140, ${0.08 * dk})`;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  // ── Production popover ────────────────────────────────────────────────────
  _drawProductionButtons(ctx, game, b) {
    const rects = productionButtonRects(b, game.camera);
    const startX = rects[0].x, startY = rects[0].y;
    const right = Math.max(...rects.map(rc => rc.x + rc.w));
    const bottom = Math.max(...rects.map(rc => rc.y + rc.h));
    const totalW = right - startX;
    const hotkeys = { soldier:'Z', builder:'X', scout:'C', medic:'V', sniper:'Q', heavy:'E', torchbearer:'Y', suv:'U' };
    const isBay = b.type === 'mechanics';

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, bottom - startY + 44, 6); ctx.fill();
    ctx.strokeStyle = b.def.color; ctx.lineWidth = 2;
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, bottom - startY + 44, 6); ctx.stroke();

    ctx.fillStyle = '#ff8844';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(isBay ? 'BUILD VEHICLE' : 'TRAIN UNIT', startX + totalW / 2, bottom + 9);

    for (const rc of rects) {
      const def = isBay ? VEHICLE_DEFS[rc.type] : UNIT_DEFS[rc.type];
      const unlocked = isBay || game.canTrainUnit(rc.type);
      const canAfford = game.supplies >= def.cost;
      const enabled = unlocked && canAfford;
      const color = isBay ? '#edf2ef' : def.color;

      ctx.fillStyle = enabled ? 'rgba(70,50,30,0.95)' : 'rgba(20,20,20,0.95)';
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 5); ctx.fill();
      ctx.strokeStyle = enabled ? color : '#444';
      ctx.lineWidth = enabled ? 2 : 1;
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 5); ctx.stroke();

      ctx.beginPath();
      ctx.arc(rc.x + 14, rc.y + rc.h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = enabled ? color : '#444'; ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = enabled ? '#eee' : '#777';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(def.name, rc.x + 26, rc.y + 16, rc.w - 30);
      ctx.fillStyle = canAfford ? '#ffdd44' : '#555';
      ctx.font = '11px monospace';
      ctx.fillText(`$${def.cost}`, rc.x + 26, rc.y + 32);
      ctx.fillStyle = unlocked ? '#888' : '#d98b8b';
      ctx.font = '9px monospace';
      const detail = unlocked ? `${def.trainTime}s [${hotkeys[rc.type]}]` : `Need ${BUILDING_DEFS[def.requires].name}`;
      ctx.fillText(detail, rc.x + 26, rc.y + 47, rc.w - 30);
    }

    const queued = isBay ? b.vehicleQueue : b.trainQueue.length;
    if (queued > 0) {
      const pct = isBay ? b.vehicleProgress / VEHICLE_DEFS.suv.trainTime
        : b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
      const barY = bottom + 18;
      ctx.fillStyle = '#333';
      ctx.fillRect(startX - 4, barY, totalW + 8, 6);
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(startX - 4, barY, (totalW + 8) * pct, 6);
    }
  }

  // ── Build Ghost ───────────────────────────────────────────────────────────
  // Keep the ground footprint visible below the artwork preview.
  _drawBuildGhost(ctx, game, tile) {
    const cam = game.camera;
    const def = BUILDING_DEFS[game.buildMode];
    const {left:x0,top:y0,right:x1,bottom:y1} = buildingGroundRect(game.buildMode, tile.tx, tile.ty);
    const valid = game.canPlaceBuilding(game.buildMode, tile.tx, tile.ty);
    const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam),
          S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = valid ? def.color : '#ff2222';
    ctx.beginPath();
    ctx.moveTo(N.x, N.y); ctx.lineTo(E.x, E.y); ctx.lineTo(S.x, S.y); ctx.lineTo(W.x, W.y);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = valid ? '#ffffff' : '#ff0000'; ctx.lineWidth = 2; ctx.stroke();
    const artwork = sculptedObject(game.buildMode);
    if (artwork) {
      const rect = sculptedObjectRect(artwork, S, cam.zoom);
      ctx.save(); ctx.globalAlpha = valid ? .55 : .28; ctx.imageSmoothingEnabled = artwork.imageSmoothing;
      ctx.imageSmoothingQuality = artwork.imageSmoothingQuality;
      ctx.drawImage(artwork.image, rect.x, rect.y, rect.width, rect.height); ctx.restore();
    }
  }

  // ── Selection Box ─────────────────────────────────────────────────────────
  // Body is coordinate-agnostic — Task 3 changes the producer to screen-space.
  _drawSelectionBox(ctx, box) {
    const { x1, y1, x2, y2 } = box;
    const lx = Math.min(x1,x2), ly = Math.min(y1,y2);
    const rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
    ctx.strokeStyle = '#44ffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(lx, ly, rw, rh);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(68,255,255,0.05)';
    ctx.fillRect(lx, ly, rw, rh);
  }

  // ── Health Bar ────────────────────────────────────────────────────────────
  _drawHealthBar(ctx, x, y, w, h, pct, color) {
    pct = clamp(pct, 0, 1);
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
    if (!color) {
      color = pct > 0.6 ? '#33ff55' : pct > 0.3 ? '#ffaa00' : '#ff2222';
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * pct, h);
  }

  _drawCompass(ctx, game) {
    const { center, radius, points } = mapCompass(this.W);
    const warning = game.waveActive || game.waveTimer <= WAVE_WARNING;
    ctx.save();
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9,17,14,0.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(205,221,207,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of points) {
      const dx = p.x - center.x, dy = p.y - center.y;
      ctx.beginPath(); ctx.moveTo(center.x + dx * .15, center.y + dy * .15);
      ctx.lineTo(center.x + dx * .65, center.y + dy * .65);
      ctx.strokeStyle = p.label === 'N' ? '#f07665' : '#b8ccbd'; ctx.lineWidth = p.label === 'N' ? 3 : 1.5; ctx.stroke();
      ctx.fillStyle = warning && game.waveDirections.includes(p.edge) ? '#ffbd69' : p.label === 'N' ? '#ffb7a4' : '#e7efe4';
      ctx.fillText(p.label, p.x, p.y);
    }
    ctx.restore();
  }

  _drawToasts(ctx, game) {
    if (!game.toasts || game.toasts.length === 0) return;
    const palette = {
      info:    { stroke: '#88aaff', fill: 'rgba(14,20,32,0.9)', text: '#dbe6ff' },
      warning: { stroke: '#ffdd44', fill: 'rgba(38,30,10,0.92)', text: '#ffea8a' },
      danger:  { stroke: '#ff6644', fill: 'rgba(42,16,12,0.92)', text: '#ffc7b8' },
      success: { stroke: '#55dd88', fill: 'rgba(12,34,20,0.92)', text: '#c9ffd8' },
    };
    const visible = game.toasts.slice(-4);
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px monospace';
    const warningBanner = !game.waveActive && game.waveTimer <= WAVE_WARNING;
    let y = this.W < 1100 ? (warningBanner ? 116 : 80) : (warningBanner ? 88 : 52);
    for (let i = 0; i < visible.length; i++) {
      const toast = visible[i];
      const style = palette[toast.kind] || palette.info;
      const alpha = clamp(Math.min(1, toast.t / 0.18, (toast.life - toast.t) / 0.5), 0, 1);
      const w = Math.min(420, this.W - 112, Math.max(220, ctx.measureText(toast.text).width + 28));
      const lines = [], words = toast.text.split(/\s+/); let line = '';
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > w - 24) { lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
      const h = Math.max(30, lines.length * 16 + 14), x = this.W - 100 - w;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = style.fill;
      roundRect(ctx, x, y, w, h, 5); ctx.fill();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, h, 5); ctx.stroke();
      ctx.fillStyle = style.text;
      lines.forEach((text, n) => ctx.fillText(text, x + w - 12, y + 15 + n * 16));
      y += h + 6;
    }
    ctx.restore();
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  _drawHUD(ctx, game, input) {
    if (this.W < 1100) this._drawCompactHeader(ctx, game);
    else {
    // Top bar background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.W, 44);

    const cap = game.storageCap();
    ctx.fillStyle = game.supplies >= cap ? '#ff8866' : '#ffdd44';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Supplies: ${game.supplies} / ${cap}`, 12, 22);
    if (game.supplies >= cap) {
      ctx.fillStyle = '#ff6644';
      ctx.font = '10px monospace';
      ctx.fillText('storage full — spend supplies or build a depot', 12, 37);
      ctx.font = 'bold 15px monospace';
    }

    ctx.fillStyle = '#aaffaa';
    ctx.fillText(`Score: ${game.score}`, 250, 22);

    ctx.fillStyle = game.flareCooldown > 0 ? '#777777'
                   : game.supplies >= FLARE_COST ? '#ff8866' : '#775544';
    ctx.fillText(game.flareCooldown > 0 ? `Flare ${Math.ceil(game.flareCooldown)}s` : 'Flare ready [F]', 385, 22);

    // Wave info
    const timeLeft = game.waveTimer;
    ctx.textAlign = 'center';
    if (!game.waveActive) {
      const warning = timeLeft <= WAVE_WARNING;
      ctx.fillStyle = warning ? (Math.floor(Date.now()/400)%2===0 ? '#ff4444' : '#ff8844') : '#cccccc';
      ctx.fillText(`Wave ${game.waveNum + 1} in ${Math.ceil(timeLeft)}s`, this.W / 2, 22);
      if (warning && game.waveDirections.length > 0) {
        const fullLabel = game.waveDirectionLabel().toUpperCase();
        const label = `INCOMING: ${this.W < 600 ? game.waveDirections.map(d => ['N', 'E', 'S', 'W'][d]).join(' + ') : fullLabel}`;
        const width = Math.min(290, this.W - 112), x = Math.min(this.W / 2 - width / 2, this.W - 100 - width);
        ctx.fillStyle = 'rgba(49,16,12,0.9)';
        roundRect(ctx, x, 48, width, 28, 4); ctx.fill();
        ctx.strokeStyle = '#ff6740'; ctx.lineWidth = 1.5;
        roundRect(ctx, x, 48, width, 28, 4); ctx.stroke();
        ctx.fillStyle = '#ffd3a8'; ctx.font = 'bold 13px monospace';
        ctx.fillText(label, x + width / 2, 62);
        ctx.font = 'bold 15px monospace';
      }
    } else {
      const remaining = game.zombiesToSpawn.length + game.zombies.filter(z => !z.dead && !z.dormant).length;
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`WAVE ${game.waveNum} — ${remaining} zombies remaining`, this.W / 2, 22);
    }

    // Day/night indicator
    const t = game.cycleTime();
    const night = t >= DAY_LENGTH;
    const nextIn = Math.ceil(night ? DAY_LENGTH + NIGHT_LENGTH - t : DAY_LENGTH - t);
    ctx.textAlign = 'right';
    ctx.fillStyle = night ? '#88aaff' : '#ffd870';
    ctx.fillText(night ? `NIGHT — dawn in ${nextIn}s` : `Day — night in ${nextIn}s`, this.W - 340, 22);

    // Endless survival timer
    ctx.fillStyle = '#88aaff';
    ctx.textAlign = 'right';
    ctx.fillText('Endless', this.W - 200, 22);

    // Game time
    const mins = Math.floor(game.gameTime / 60);
    const secs = Math.floor(game.gameTime % 60);
    ctx.fillStyle = '#888';
    ctx.fillText(`${mins}:${secs.toString().padStart(2,'0')}`, this.W - 104, 22);
    }

    if (input.attackMoveArm) {
      ctx.fillStyle = '#ff8866';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ATTACK-MOVE', this.W / 2, this.W < 1100 ? 130 : 92);
    }

    if (input.flareArm) {
      ctx.fillStyle = '#ff8866';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FLARE', this.W / 2, this.W < 1100 ? 130 : 92);
    }

    // Bottom panel
    this._drawBottomPanel(ctx, game);

    // Selection info (left side above bottom)
    if (game.selected.length > 0 || game._selectedBuilding || game.selectedVehicle) {
      this._drawSelectionPanel(ctx, game);
    }
  }

  _drawCompactHeader(ctx, game) {
    const available = this.W - 112, cap = game.storageCap();
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, this.W, 76);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 13px monospace';
    ctx.fillStyle = game.supplies >= cap ? '#ff8866' : '#ffdd44';
    ctx.fillText(`Supplies: ${game.supplies} / ${cap}`, 12, 18, available);
    const night = game.cycleTime() >= DAY_LENGTH;
    const remaining = game.zombiesToSpawn.length + game.zombies.filter(z => !z.dead && !z.dormant).length;
    const wave = game.waveActive ? `Wave ${game.waveNum}: ${remaining} left` : `Wave ${game.waveNum + 1} in ${Math.ceil(game.waveTimer)}s`;
    ctx.fillStyle = game.waveActive || game.waveTimer <= WAVE_WARNING ? '#ff8866' : '#d8e5d9';
    ctx.font = 'bold 12px monospace'; ctx.fillText(`${wave} | ${night ? 'Night' : 'Day'}`, 12, 41, available);
    const flare = game.flareCooldown > 0 ? `${Math.ceil(game.flareCooldown)}s` : 'ready';
    ctx.font = '11px monospace'; ctx.fillStyle = '#b5ccbd'; ctx.fillText(`Score: ${game.score} | Flare ${flare}`, 12, 64, available);
    if (!game.waveActive && game.waveTimer <= WAVE_WARNING && game.waveDirections.length) {
      const width = Math.min(290, available), x = 12;
      ctx.fillStyle = 'rgba(49,16,12,0.9)'; roundRect(ctx, x, 80, width, 28, 4); ctx.fill();
      ctx.strokeStyle = '#ff6740'; ctx.lineWidth = 1.5; roundRect(ctx, x, 80, width, 28, 4); ctx.stroke();
      const label = this.W < 600 ? game.waveDirections.map(d => ['N', 'E', 'S', 'W'][d]).join(' + ') : game.waveDirectionLabel().toUpperCase();
      ctx.fillStyle = '#ffd3a8'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText('INCOMING: ' + label, x + width / 2, 94, width - 20);
    }
  }

  _drawBottomPanel(ctx, game) {
    const PH = bottomPanelHeight(this.W), PY = this.H - PH;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, PY, this.W, PH);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, PY); ctx.lineTo(this.W, PY);
    ctx.stroke();

    const hotkeys = { wall:'W', tower:'T', barracks:'B', depot:'D', light:'L', clinic:'K', mechanics:'M' };
    for (const rc of buildButtonRects(this.W, this.H)) {
      const def = BUILDING_DEFS[rc.type];
      const active = game.buildMode === rc.type;
      const canAfford = game.supplies >= def.cost;
      ctx.fillStyle = active ? 'rgba(68,200,200,0.3)' : canAfford ? 'rgba(60,60,60,0.9)' : 'rgba(30,30,30,0.9)';
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 4); ctx.fill();
      ctx.strokeStyle = active ? '#44cccc' : canAfford ? '#666' : '#333';
      ctx.lineWidth = 1.5;
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 4); ctx.stroke();
      ctx.fillStyle = canAfford ? def.color : '#555';
      ctx.fillRect(rc.x + 6, rc.y + 7, 18, 18);
      ctx.fillStyle = canAfford ? '#eee' : '#666';
      ctx.textAlign = 'left'; ctx.font = 'bold 10px monospace';
      ctx.fillText(def.name, rc.x + 29, rc.y + 19, rc.w - 33);
      ctx.fillStyle = canAfford ? '#ffdd44' : '#555';
      ctx.fillText(`$${def.cost}`, rc.x + 6, rc.y + 39);
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText(`[${hotkeys[rc.type]}]`, rc.x + rc.w - 6, rc.y + 39);
    }
  }

  _drawSelectionPanel(ctx, game) {
    const selB  = game._selectedBuilding;
    const sel   = game.selected;

    // ── Building selected ──────────────────────────────────────────────────
    if (selB && !selB.dead) {
      const def = BUILDING_DEFS[selB.type];
      const hasProduction = selB.type === 'barracks' || selB.type === 'mechanics';
      const PH = hasProduction ? 84 : 68, PW = 260, PX = 10;
      const PY = this.H - bottomPanelHeight(this.W) - PH - 8;

      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      roundRect(ctx, PX, PY, PW, PH, 6); ctx.fill();
      ctx.strokeStyle = def.color; ctx.lineWidth = 2;
      roundRect(ctx, PX, PY, PW, PH, 6); ctx.stroke();

      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = def.color; ctx.font = 'bold 13px monospace';
      ctx.fillText(def.name.toUpperCase(), PX + 10, PY + 10);
      ctx.fillStyle = '#aaa'; ctx.font = '11px monospace';
      ctx.fillText(`HP: ${Math.ceil(selB.hp)} / ${selB.maxHp}`, PX + 10, PY + 28);
      this._drawHealthBar(ctx, PX + 10, PY + 46, PW - 20, 6, selB.hp / selB.maxHp);
      if (hasProduction) {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText(selB.type === 'barracks' ? 'Right-click ground: set rally' : 'Produce armored truck', PX + 10, PY + 62);
      }
      ctx.fillStyle = '#555'; ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('[Del] sell 50%', PX + PW - 8, PY + 10);
      return;
    }

    if (game.selectedVehicle && !game.selectedVehicle.dead) {
      const v = game.selectedVehicle;
      const PH = 84, PX = 10, PY = this.H - bottomPanelHeight(this.W) - PH - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      roundRect(ctx, PX, PY, 270, PH, 6); ctx.fill();
      ctx.strokeStyle = '#edf2ef'; ctx.lineWidth = 2;
      roundRect(ctx, PX, PY, 270, PH, 6); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#edf2ef'; ctx.font = 'bold 13px monospace';
      ctx.fillText(v.def.name.toUpperCase(), PX + 10, PY + 10);
      ctx.fillStyle = '#aaa'; ctx.font = '11px monospace';
      ctx.fillText(`HP: ${Math.ceil(v.hp)} / ${v.maxHp}   Seats: ${v.passengers.length}/${v.def.capacity}`, PX + 10, PY + 30);
      this._drawHealthBar(ctx, PX + 10, PY + 49, 250, 6, v.hp / v.maxHp);
      const rc = vehicleUnloadRect(this.W, this.H);
      ctx.fillStyle = v.passengers.length ? '#354e4d' : '#252a2a';
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 4); ctx.fill();
      ctx.fillStyle = v.passengers.length ? '#edf2ef' : '#68706e';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px monospace';
      ctx.fillText('Unload [E]', rc.x + rc.w / 2, rc.y + rc.h / 2);
      return;
    }

    // ── Units selected ────────────────────────────────────────────────────
    if (sel.length === 0) return;

    const PX = 10, PH = 86, PY = this.H - bottomPanelHeight(this.W) - PH - 8, PW = 260;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, PX, PY, PW, PH, 6); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    roundRect(ctx, PX, PY, PW, PH, 6); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    if (sel.length === 1) {
      const u = sel[0];
      ctx.fillStyle = u.def.color; ctx.font = 'bold 13px monospace';
      ctx.fillText(u.def.name, PX + 10, PY + 10);
      ctx.fillStyle = '#aaa'; ctx.font = '11px monospace';
      ctx.fillText(`HP: ${Math.ceil(u.hp)} / ${u.maxHp}`, PX + 10, PY + 28);
      this._drawHealthBar(ctx, PX + 10, PY + 44, PW - 20, 7, u.hp / u.maxHp);
      if (u.gatherCenter) {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText('Auto-gathering cache · S: stop', PX + 10, PY + 60);
      } else if (u.bundleGatherCenter) {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText('Recovering dropped supplies · S: stop', PX + 10, PY + 60);
      } else if (u.type === 'builder') {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText('Auto-repairs nearby buildings · R: nearest', PX + 10, PY + 60);
      } else if (u.type === 'medic') {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText('Auto-heals wounded allies nearby', PX + 10, PY + 60);
      } else {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText('A + click: attack-move · S: stop', PX + 10, PY + 60);
      }
    } else {
      ctx.fillStyle = '#eee'; ctx.font = 'bold 13px monospace';
      ctx.fillText(`${sel.length} units selected`, PX + 10, PY + 10);
      const counts = {};
      for (const u of sel) counts[u.type] = (counts[u.type] || 0) + 1;
      let row = 28;
      for (const [type, n] of Object.entries(counts)) {
        ctx.fillStyle = UNIT_DEFS[type].color; ctx.font = '11px monospace';
        ctx.fillText(`${UNIT_DEFS[type].name}: ${n}`, PX + 10, PY + row);
        row += 16;
      }
      ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
      ctx.fillText('A + click: attack-move · S: stop · Shift+1-9: group', PX + 10, PY + PH - 16);
    }
  }

  // ── Edge-scroll affordance ────────────────────────────────────────────────
  // Subtle glow along the hovered screen edge: hints the hot zone is clickable,
  // brightens slightly once armed (scrolling active).
  _drawEdgeScrollHint(ctx, input) {
    if (!input._inEdgeZone(input.mouseX, input.mouseY)) return;
    const armed = input._edgeScrollArmed;
    const a = armed ? 0.13 : 0.06;
    const W = this.W, H = this.H, M = EDGE_SCROLL_MARGIN;
    const top = 44, bottom = H - bottomPanelHeight(W);
    const mx = input.mouseX, my = input.mouseY;

    const band = (x, y, w, h, x2, y2) => {
      const g = ctx.createLinearGradient(x, y, x2, y2);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x, x2), Math.min(y, y2),
                   w || Math.abs(x2 - x), h || Math.abs(y2 - y));
    };
    const arrow = (cx, cy, dx, dy) => {
      ctx.fillStyle = `rgba(255,255,255,${armed ? 0.45 : 0.25})`;
      ctx.beginPath();
      ctx.moveTo(cx + dx * 7, cy + dy * 7);
      ctx.lineTo(cx - dx * 3 + dy * 6, cy - dy * 3 + dx * 6);
      ctx.lineTo(cx - dx * 3 - dy * 6, cy - dy * 3 - dx * 6);
      ctx.closePath(); ctx.fill();
    };

    if (mx < M) {
      band(0, top, 0, bottom - top, M, top);
      arrow(12, clamp(my, top + 12, bottom - 12), -1, 0);
    }
    if (mx > W - M) {
      band(W, top, 0, bottom - top, W - M, top);
      arrow(W - 12, clamp(my, top + 12, bottom - 12), 1, 0);
    }
    if (my < M + top) {
      band(0, top, W, 0, 0, top + M);
      arrow(clamp(mx, 12, W - 12), top + 12, 0, -1);
    }
    if (my > bottom - M) {
      band(0, bottom, W, 0, 0, bottom - M);
      arrow(clamp(mx, 12, W - 12), bottom - 12, 0, 1);
    }
  }

  // ── Minimap ───────────────────────────────────────────────────────────────
  // Drawn in projected (zoom-1 iso) space, so minimap directions match screen
  // directions and the camera viewport is an EXACT rectangle — true aspect
  // ratio and true relative size. The map itself reads as a diamond.
  _drawMinimap(ctx, game) {
    const selected = !!(game.selected.length || game._selectedBuilding || game.selectedVehicle);
    const { x: MX, y: MY } = minimapRect(this.W, this.H, selected);
    const b = mapScreenBounds(1);
    const s = MINIMAP_W / (b.maxX - b.minX); // == MINIMAP_H / b.maxY (2:1 aspect)
    const cam1 = { x: 0, y: 0, zoom: 1 };
    const mp = (wx, wy) => {
      const p = worldToScreen(wx, wy, cam1);
      return [MX + (p.x - b.minX) * s, MY + p.y * s];
    };

    // Backdrop
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(MX, MY, MINIMAP_W, MINIMAP_H);

    // Fog-masked static layer: unexplored dark diamond + explored terrain/water,
    // rebuilt at most 4×/sim-second rather than filled fresh every frame.
    // gameTime < _mmLayerAt ⇒ clock regressed (restart reuses the renderer) — force rebuild;
    // first frame (_mmLayerAt = -1) is caught by 0 - (-1) > 0.25.
    if (game.gameTime < this._mmLayerAt || game.gameTime - this._mmLayerAt > 0.25) {
      this._mmLayerAt = game.gameTime;
      const g = this._mmLayer.getContext('2d');
      g.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
      const lmp = (wx, wy) => {           // layer-local mp (no MX/MY offset)
        const p = worldToScreen(wx, wy, cam1);
        return [(p.x - b.minX) * s, p.y * s];
      };
      // Map diamond, dark (unexplored base)
      const lcs = [[0, 0], [MAP_W * TILE, 0], [MAP_W * TILE, MAP_H * TILE], [0, MAP_H * TILE]]
        .map(([wx, wy]) => lmp(wx, wy));
      g.fillStyle = '#0a0d08';
      g.beginPath(); g.moveTo(lcs[0][0], lcs[0][1]);
      for (let i = 1; i < 4; i++) g.lineTo(lcs[i][0], lcs[i][1]);
      g.closePath(); g.fill();
      // Explored tiles: terrain green / water blue
      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          if (!game.tileExplored(tx, ty)) continue;
          g.fillStyle = game.tiles[ty][tx] === TILE_WATER ? '#163352' : '#1a2a1a';
          const [x, y] = lmp(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
          g.fillRect(x - 1, y - 1, 3, 2);
        }
      }
    }
    ctx.drawImage(this._mmLayer, MX, MY);

    if (!game.waveActive && game.waveTimer <= WAVE_WARNING && game.waveDirections.length > 0) {
      const maxX = MAP_W * TILE, maxY = MAP_H * TILE;
      const edges = [
        [[0, 0], [maxX, 0]], [[maxX, 0], [maxX, maxY]],
        [[0, maxY], [maxX, maxY]], [[0, 0], [0, maxY]],
      ];
      ctx.save();
      ctx.beginPath(); ctx.rect(MX, MY, MINIMAP_W, MINIMAP_H); ctx.clip();
      ctx.strokeStyle = `rgba(255,103,64,${0.55 + 0.4 * Math.sin(game.gameTime * 8)})`;
      ctx.lineWidth = 4;
      for (const side of game.waveDirections) {
        const [a, b] = edges[side];
        const [ax, ay] = mp(...a), [bx, by] = mp(...b);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.restore();
    }

    // Buildings
    for (const bd of game.buildings) {
      if (bd.dead) continue;
      ctx.fillStyle = BUILDING_DEFS[bd.type].color;
      const [x, y] = mp(bd.x, bd.y);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    // Dropped bundles (remembered once seen — recoverable indefinitely)
    ctx.fillStyle = '#ffdd44';
    for (const bd of game.bundles) {
      if (!game.tileExplored(Math.floor(bd.x / TILE), Math.floor(bd.y / TILE))) continue;
      const [x, y] = mp(bd.x, bd.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    // Caches
    for (const c of game.caches) {
      if (!game.tileExplored(c.tileX, c.tileY)) continue;
      ctx.fillStyle = c.empty ? '#555555' : '#c9a94a';
      const [x, y] = mp(c.x, c.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    // Units
    ctx.fillStyle = '#4a9eff';
    for (const u of game.units) {
      if (u.dead || u.vehicle) continue;
      const [x, y] = mp(u.x, u.y);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    ctx.fillStyle = '#eef3f0';
    for (const v of game.vehicles) {
      if (v.dead) continue;
      const [x, y] = mp(v.x, v.y);
      ctx.fillRect(x - 2, y - 2, 5, 4);
    }

    // Zombies
    ctx.fillStyle = '#ff3322';
    for (const z of game.zombies) {
      if (z.dead) continue;
      if (!game.tileVisible(Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;
      const [x, y] = mp(z.x, z.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    // Alert pings — fading pulsing rings
    for (const a of game.alerts) {
      const age = game.gameTime - a.t;
      const [ax, ay] = mp(a.x, a.y);
      ctx.strokeStyle = `rgba(255,64,48,${Math.max(0, 0.9 - age / 8)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 3 + (age % 1.2) * 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Camera viewport — exact: the screen rect mapped into zoom-1 projected space
    ctx.save();
    ctx.beginPath(); ctx.rect(MX, MY, MINIMAP_W, MINIMAP_H); ctx.clip();
    const vz = game.camera.zoom;
    ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1;
    ctx.strokeRect(
      MX + (game.camera.x / vz - b.minX) * s,
      MY + (game.camera.y / vz) * s,
      (this.W / vz) * s,
      (this.H / vz) * s
    );
    ctx.restore();

    // Border
    ctx.strokeStyle = '#446644';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(MX, MY, MINIMAP_W, MINIMAP_H);

    // Label
    ctx.fillStyle = '#668866';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MAP', MX + MINIMAP_W/2, MY - 3);
  }

  // ── Game Over / Victory ───────────────────────────────────────────────────
  _drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#ff2222';
    ctx.font = this.W < 600 ? 'bold 48px monospace' : 'bold 60px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OVERRUN', this.W/2, this.H/2 - 30);
    ctx.fillStyle = '#aaa';
    ctx.font = this.W < 600 ? '16px monospace' : '22px monospace';
    ctx.fillText('Your base has fallen to the horde.', this.W/2, this.H/2 + 20);
    this._drawRestartButton(ctx);
  }

  _drawMainMenuButton(ctx, input) {
    const r = mainMenuButtonRect(this.W);
    const active = input.menuOpen;
    ctx.fillStyle = active ? 'rgba(255,221,68,0.22)' : 'rgba(20,24,18,0.92)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 5); ctx.fill();
    ctx.strokeStyle = active ? '#ffdd44' : '#667755';
    ctx.lineWidth = 1.5;
    roundRect(ctx, r.x, r.y, r.w, r.h, 5); ctx.stroke();
    ctx.fillStyle = active ? '#ffdd44' : '#d8e0c8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MENU', r.x + r.w / 2, r.y + r.h / 2);
  }

  _saveStamp(meta) {
    if (!meta) return 'empty';
    const mins = Math.floor((meta.gameTime || 0) / 60);
    const secs = Math.floor((meta.gameTime || 0) % 60);
    const clock = new Date(meta.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${clock}  ${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _drawMainMenu(ctx, input) {
    const panel = mainMenuPanelRect(this.W);
    ctx.fillStyle = 'rgba(7,10,8,0.94)';
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 6); ctx.fill();
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 1.5;
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 6); ctx.stroke();

    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MAIN MENU', panel.x + 14, panel.y + 14);

    ctx.fillStyle = '#99aa88';
    ctx.font = '10px monospace';
    ctx.fillText(`Auto: ${this._saveStamp(input.saveMeta.auto)}`, panel.x + 14, panel.y + 33);

    const labels = {
      'resume': 'RESUME',
      'save-auto': 'SAVE NOW',
      'load-auto': 'LOAD AUTO',
      'save-slot-1': 'SAVE 1',
      'load-slot-1': 'LOAD 1',
      'save-slot-2': 'SAVE 2',
      'load-slot-2': 'LOAD 2',
      'save-slot-3': 'SAVE 3',
      'load-slot-3': 'LOAD 3',
      'new-game': 'RESTART',
      'clear-saves': 'CLEAR SAVES',
    };
    const hasSave = action => {
      if (action === 'load-auto') return !!input.saveMeta.auto;
      const m = /^load-slot-(\d)$/.exec(action);
      return !m || !!input.saveMeta.slots[m[1]];
    };

    for (const rc of mainMenuActionRects(this.W)) {
      const disabled = !hasSave(rc.action);
      const danger = rc.action === 'new-game' || rc.action === 'clear-saves';
      ctx.fillStyle = disabled ? 'rgba(22,22,22,0.82)'
                    : danger ? 'rgba(70,30,24,0.9)'
                    : 'rgba(50,58,42,0.92)';
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 4); ctx.fill();
      ctx.strokeStyle = disabled ? '#333333' : danger ? '#aa5544' : '#6f825f';
      ctx.lineWidth = 1;
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 4); ctx.stroke();
      ctx.fillStyle = disabled ? '#555555' : danger ? '#ffb09a' : '#e4ead8';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sm = /^save-slot-(\d)$/.exec(rc.action);
      if (sm) {
        ctx.fillText(labels[rc.action], rc.x + rc.w / 2, rc.y + 12);
        ctx.fillStyle = '#7f8f72';
        ctx.font = '8px monospace';
        ctx.fillText(this._saveStamp(input.saveMeta.slots[sm[1]]), rc.x + rc.w / 2, rc.y + 25);
      } else {
        ctx.fillText(labels[rc.action], rc.x + rc.w / 2, rc.y + rc.h / 2);
      }
    }
  }

  _drawMenuNotice(ctx, input) {
    const msg = input.menuNotice;
    const alpha = clamp(1 - msg.t / msg.life, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    const w = Math.min(360, Math.max(160, msg.text.length * 8 + 32));
    const panel = mainMenuPanelRect(this.W);
    const x = this.W / 2 - w / 2;
    const y = input.menuOpen ? Math.min(this.H - 40, panel.y + panel.h + 8) : 58;
    roundRect(ctx, x, y, w, 32, 5); ctx.fill();
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, 32, 5); ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg.text, this.W / 2, y + 16);
    ctx.globalAlpha = 1;
  }

  _drawVictory(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#44ff88';
    ctx.font = 'bold 55px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SURVIVED', this.W/2, this.H/2 - 30);
    ctx.fillStyle = '#eee';
    ctx.font = '22px monospace';
    ctx.fillText('You held the base for 10 minutes!', this.W/2, this.H/2 + 20);
    ctx.fillStyle = '#ffdd44';
    ctx.font = '20px monospace';
    ctx.fillText(`Final Score: ${window._game ? window._game.score : 0}`, this.W/2, this.H/2 + 55);
    this._drawRestartButton(ctx);
  }

  _drawRestartButton(ctx) {
    const r = endScreenButtonRect(this.W, this.H);
    ctx.fillStyle = 'rgba(255,221,68,0.15)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RESTART', r.x + r.w / 2, r.y + r.h / 2);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#aa9944';
    ctx.fillText('[Enter]', r.x + r.w / 2, r.y + r.h + 14);
  }
}
