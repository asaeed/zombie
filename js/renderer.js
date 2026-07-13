'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this._tileSprites = this._makeTileSprites();
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
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
    return {
      [TILE_GRASS]: [mk('#2d4a20'), mk('#355524')],
      [TILE_DIRT]:  [mk('#5a4a2a'), mk('#4e3f24')],
      [TILE_WATER]: [mk('#1a3a5c', '#4a7ab0'), mk('#163352', '#4a7ab0')],
    };
  }

  render(game, input) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0c0e14';               // void outside the map diamond
    ctx.fillRect(0, 0, this.W, this.H);

    this._drawTiles(ctx, game);
    if (game.buildMode && input.mouseTile) this._drawBuildGhost(ctx, game, input.mouseTile);
    this._drawEntities(ctx, game);
    this._drawProjectiles(ctx, game);
    this._drawParticles(ctx, game);
    if (input.selectBox) this._drawSelectionBox(ctx, input.selectBox);
    if (game._selectedBuilding && game._selectedBuilding.type === 'barracks' && !game._selectedBuilding.dead) {
      this._drawBarracksButtons(ctx, game, game._selectedBuilding);
    }

    this._drawEdgeScrollHint(ctx, input);
    this._drawHUD(ctx, game, input);
    this._drawMinimap(ctx, game);
    if (game.status === 'gameover') this._drawGameOver(ctx);
    if (game.status === 'victory') this._drawVictory(ctx);
  }

  // ── Tiles ──────────────────────────────────────────────────────────────────
  _drawTiles(ctx, game) {
    const cam = game.camera, z = cam.zoom;
    // World-space bounding box of the viewport (over-covers the diamond; fine)
    const corners = [
      screenToWorld(0, 0, cam), screenToWorld(this.W, 0, cam),
      screenToWorld(0, this.H, cam), screenToWorld(this.W, this.H, cam),
    ];
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    const tx0 = clamp(Math.floor(Math.min(...xs) / TILE) - 1, 0, MAP_W);
    const tx1 = clamp(Math.ceil(Math.max(...xs) / TILE) + 1, 0, MAP_W);
    const ty0 = clamp(Math.floor(Math.min(...ys) / TILE) - 1, 0, MAP_H);
    const ty1 = clamp(Math.ceil(Math.max(...ys) / TILE) + 1, 0, MAP_H);

    const w = 64 * z, h = 32 * z;
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const spr = this._tileSprites[game.tiles[ty][tx]][(tx + ty) % 2];
        const s = worldToScreen(tx * TILE, ty * TILE, cam); // north corner of the diamond
        ctx.drawImage(spr, s.x - w / 2, s.y, w, h);
      }
    }
  }

  // ── Entities ───────────────────────────────────────────────────────────────
  // Back-to-front by (worldX + worldY): what's "behind" in iso draws first
  _drawEntities(ctx, game) {
    const drawables = [];
    for (const b of game.buildings) {
      if (b.dead) continue;
      const ts = b.def.tileSize;
      // ponytail: scalar far-corner key; units beside tall E/W faces can be
      // overdrawn at footprint edges — exact per-tile sort lands with phase-7 sprites
      drawables.push({ key: (b.tileX + ts) * TILE + (b.tileY + ts) * TILE,
                       draw: () => this._drawBuilding(ctx, game, b) });
    }
    for (const u of game.units) {
      if (u.dead) continue;
      drawables.push({ key: u.x + u.y, draw: () => this._drawUnit(ctx, game, u) });
    }
    for (const z of game.zombies) {
      if (z.dead) continue;
      drawables.push({ key: z.x + z.y, draw: () => this._drawZombie(ctx, game, z) });
    }
    drawables.sort((a, b) => a.key - b.key);
    for (const d of drawables) d.draw();
  }

  // Ground-plane circle of world radius r at world point (via projected s)
  _groundEllipse(ctx, s, r, z) {
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.13 * z, r * 0.57 * z, 0, 0, Math.PI * 2);
  }

  _drawBuilding(ctx, game, b) {
    const cam = game.camera, z = cam.zoom;
    const def = b.def, ts = def.tileSize;
    const x0 = b.tileX * TILE, y0 = b.tileY * TILE;
    const x1 = x0 + ts * TILE, y1 = y0 + ts * TILE;
    const h = ISO_HEIGHTS[b.type] * z;
    const N = worldToScreen(x0, y0, cam), E = worldToScreen(x1, y0, cam),
          S = worldToScreen(x1, y1, cam), W = worldToScreen(x0, y1, cam);

    const face = (p1, p2, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p1.x, p1.y - h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    };
    face(E, S, shadeColor(def.color, 0.72)); // sun-side face
    face(S, W, shadeColor(def.color, 0.52)); // shade-side face

    ctx.fillStyle = def.color;               // roof
    ctx.beginPath();
    ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h);
    ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

    // Label on the roof
    const cx = (N.x + S.x) / 2, roofCy = (N.y + S.y) / 2 - h;
    const labels = { hq: 'HQ', wall: '', tower: 'T', barracks: 'B', depot: 'D' };
    if (labels[b.type]) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `bold ${Math.min(12, ts * 8)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[b.type], cx, roofCy);
    }

    // Health bar above the top corner
    const barW = 36 * ts * z;
    const topY = N.y - h;
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
  }

  _drawUnit(ctx, game, u) {
    const cam = game.camera, z = cam.zoom;
    const s = worldToScreen(u.x, u.y, cam);
    const r = u.def.radius * z;

    if (u.selected) {
      this._groundEllipse(ctx, s, u.def.radius + 4, z);
      ctx.strokeStyle = '#44ffff'; ctx.lineWidth = 2; ctx.stroke();
    }
    this._groundEllipse(ctx, s, u.def.radius, z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();       // ground shadow

    ctx.beginPath(); ctx.arc(s.x, s.y - r * 1.2, r, 0, Math.PI * 2); // raised body
    ctx.fillStyle = u.def.color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y - r * 1.2, 3 * z, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();

    this._drawHealthBar(ctx, s.x - r, s.y - r * 2.4 - 6 * z, r * 2, 4, u.hp / u.maxHp);

    if (u.type === 'builder' && u.repairTarget) {
      ctx.fillStyle = '#ffdd44'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('⚙', s.x, s.y - r * 2.4 - 12 * z);
    }
  }

  _drawZombie(ctx, game, zb) {
    const cam = game.camera, z = cam.zoom;
    const s = worldToScreen(zb.x, zb.y, cam);
    const r = zb.def.radius * z;

    this._groundEllipse(ctx, s, zb.def.radius, z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();

    const by = s.y - r * 1.2;
    ctx.beginPath(); ctx.arc(s.x, by, r, 0, Math.PI * 2);
    ctx.fillStyle = zb.def.color; ctx.fill();
    ctx.strokeStyle = '#005500'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = '#ff0000';                              // eyes
    ctx.beginPath();
    ctx.arc(s.x - r * 0.3, by - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.arc(s.x + r * 0.3, by - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();

    this._drawHealthBar(ctx, s.x - r, s.y - r * 2.4 - 5 * z, r * 2, 4, zb.hp / zb.maxHp, '#ff4422');
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

  // ── Barracks Train Buttons (screen space, anchored under the building) ───
  _drawBarracksButtons(ctx, game, b) {
    const rects = barracksButtonRects(b, game.camera);
    const startX = rects[0].x, startY = rects[0].y;
    const BTH = rects[0].h;
    const totalW = rects[2].x + rects[2].w - startX;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, BTH + 20, 6); ctx.fill();
    ctx.strokeStyle = '#883322'; ctx.lineWidth = 2;
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, BTH + 20, 6); ctx.stroke();

    ctx.fillStyle = '#ff8844';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TRAIN UNIT', startX + totalW / 2, startY + BTH + 8);

    for (const [i, rc] of rects.entries()) {
      const udef = UNIT_DEFS[rc.type];
      const canAfford = game.supplies >= udef.cost;

      ctx.fillStyle = canAfford ? 'rgba(70,50,30,0.95)' : 'rgba(20,20,20,0.95)';
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 5); ctx.fill();
      ctx.strokeStyle = canAfford ? udef.color : '#444';
      ctx.lineWidth = canAfford ? 2.5 : 1;
      roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 5); ctx.stroke();

      ctx.beginPath();
      ctx.arc(rc.x + 14, rc.y + rc.h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = canAfford ? udef.color : '#444'; ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = canAfford ? '#eee' : '#555';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(udef.name, rc.x + 26, rc.y + 16);
      ctx.fillStyle = canAfford ? '#ffdd44' : '#444';
      ctx.font = '11px monospace';
      ctx.fillText(`$${udef.cost}`, rc.x + 26, rc.y + 32);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`${udef.trainTime}s  [${i + 6}]`, rc.x + 26, rc.y + 47);
    }

    if (b.trainQueue.length > 0) {
      const pct = b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
      const barY = startY + BTH + 18;
      ctx.fillStyle = '#333';
      ctx.fillRect(startX - 4, barY, totalW + 8, 6);
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(startX - 4, barY, (totalW + 8) * pct, 6);
      ctx.fillStyle = '#aaa'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Training: ${b.trainQueue.map(t => UNIT_DEFS[t].name).join(', ')}`, startX - 4, barY + 16);
    }
  }

  // ── Build Ghost ───────────────────────────────────────────────────────────
  // Projected footprint diamond — no volume; the flat footprint is clearer
  // for placement.
  _drawBuildGhost(ctx, game, tile) {
    const cam = game.camera;
    const def = BUILDING_DEFS[game.buildMode];
    const ts = def.tileSize;
    const x0 = tile.tx * TILE, y0 = tile.ty * TILE;
    const x1 = x0 + ts * TILE, y1 = y0 + ts * TILE;
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

  // ── HUD ───────────────────────────────────────────────────────────────────
  _drawHUD(ctx, game, input) {
    // Top bar background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.W, 44);

    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Supplies: ${game.supplies}`, 12, 22);

    ctx.fillStyle = '#aaffaa';
    ctx.fillText(`Score: ${game.score}`, 180, 22);

    // Wave info
    const timeLeft = game.waveTimer;
    ctx.textAlign = 'center';
    if (!game.waveActive) {
      const warning = timeLeft <= WAVE_WARNING;
      ctx.fillStyle = warning ? (Math.floor(Date.now()/400)%2===0 ? '#ff4444' : '#ff8844') : '#cccccc';
      ctx.fillText(`Wave ${game.waveNum + 1} in ${Math.ceil(timeLeft)}s`, this.W / 2, 22);
    } else {
      const remaining = game.zombiesToSpawn.length + game.zombies.filter(z=>!z.dead).length;
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`WAVE ${game.waveNum} — ${remaining} zombies remaining`, this.W / 2, 22);
    }

    // Survive timer
    const surviveLeft = Math.max(0, game.surviveTarget - game.gameTime);
    ctx.fillStyle = '#88aaff';
    ctx.textAlign = 'right';
    ctx.fillText(`Survive: ${Math.ceil(surviveLeft)}s`, this.W - 200, 22);

    // Game time
    const mins = Math.floor(game.gameTime / 60);
    const secs = Math.floor(game.gameTime % 60);
    ctx.fillStyle = '#888';
    ctx.fillText(`${mins}:${secs.toString().padStart(2,'0')}`, this.W - 12, 22);

    // Bottom panel
    this._drawBottomPanel(ctx, game);

    // Selection info (left side above bottom)
    if (game.selected.length > 0) {
      this._drawSelectionPanel(ctx, game);
    }
  }

  _drawBottomPanel(ctx, game) {
    const PH = 110, PY = this.H - PH;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, PY, this.W, PH);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, PY); ctx.lineTo(this.W, PY);
    ctx.stroke();

    // Build buttons
    const buildables = Object.entries(BUILDING_DEFS).filter(([,d]) => d.canBuild);
    const BW = 100, BH = 80, BX = 10, BY = PY + 14;
    const gap = 8;

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';

    buildables.forEach(([type, def], i) => {
      const x = BX + i * (BW + gap);
      const y = BY;
      const active = game.buildMode === type;
      const canAfford = game.supplies >= def.cost;

      // Button bg
      ctx.fillStyle = active ? 'rgba(68,200,200,0.3)' : canAfford ? 'rgba(60,60,60,0.9)' : 'rgba(30,30,30,0.9)';
      roundRect(ctx, x, y, BW, BH, 4);
      ctx.fill();
      ctx.strokeStyle = active ? '#44cccc' : canAfford ? '#666' : '#333';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, BW, BH, 4);
      ctx.stroke();

      // Color swatch
      ctx.fillStyle = canAfford ? def.color : '#555';
      ctx.fillRect(x + 8, y + 8, 84, 36);

      // Name
      ctx.fillStyle = canAfford ? '#eee' : '#666';
      ctx.fillText(def.name, x + BW/2, y + 58);
      ctx.fillStyle = canAfford ? '#ffdd44' : '#555';
      ctx.fillText(`$${def.cost}`, x + BW/2, y + 72);

      // Hotkey hint
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.fillText(`[${i+1}]`, x + BW - 14, y + 12);
      ctx.font = 'bold 12px monospace';
    });

    // Labels
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('BUILD (1-4) | ESC: cancel | Right-click: move/attack | Box-select: drag', BX + buildables.length * (BW + gap) + 8, PY + 30);
    ctx.fillText('R: builder repair  |  Del: sell selected building  |  Arrows: scroll, click edge: auto-scroll', BX + buildables.length * (BW + gap) + 8, PY + 48);
    ctx.fillText('Click a Barracks building to open TRAIN panel (keys 6/7/8)', BX + buildables.length * (BW + gap) + 8, PY + 66);
  }

  _drawSelectionPanel(ctx, game) {
    const selB  = game._selectedBuilding;
    const sel   = game.selected;

    // ── Building selected ──────────────────────────────────────────────────
    if (selB && !selB.dead) {
      const def = BUILDING_DEFS[selB.type];
      const PH = 68, PW = 220, PX = 10;
      const PY = this.H - 110 - PH - 8;

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
      ctx.fillStyle = '#555'; ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('[Del] sell 50%', PX + PW - 8, PY + 10);
      return;
    }

    // ── Units selected ────────────────────────────────────────────────────
    if (sel.length === 0) return;

    const PX = 10, PH = 86, PY = this.H - 110 - PH - 8, PW = 260;
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
      if (u.type === 'builder') {
        ctx.fillStyle = '#ffaa00'; ctx.font = '10px monospace';
        ctx.fillText('R: repair nearest building', PX + 10, PY + 60);
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
    const top = 44, bottom = H - 110; // world area between HUD bar and panel
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
    const MX = this.W - MINIMAP_W - 10;
    const MY = this.H - 110 - MINIMAP_H - 10;
    const b = mapScreenBounds(1);
    const s = MINIMAP_W / (b.maxX - b.minX); // == MINIMAP_H / b.maxY (2:1 aspect)
    const cam1 = { x: 0, y: 0, zoom: 1 };
    const mp = (wx, wy) => {
      const p = worldToScreen(wx, wy, cam1);
      return [MX + (p.x - b.minX) * s, MY + p.y * s];
    };

    // Backdrop + map diamond
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(MX, MY, MINIMAP_W, MINIMAP_H);
    const cs = [[0, 0], [MAP_W * TILE, 0], [MAP_W * TILE, MAP_H * TILE], [0, MAP_H * TILE]]
      .map(([wx, wy]) => mp(wx, wy));
    ctx.fillStyle = '#1a2a1a';
    ctx.beginPath();
    ctx.moveTo(cs[0][0], cs[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(cs[i][0], cs[i][1]);
    ctx.closePath(); ctx.fill();

    // Water tiles
    ctx.fillStyle = '#163352';
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (game.tiles[ty][tx] === TILE_WATER) {
          const [x, y] = mp(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
          ctx.fillRect(x - 1, y - 1, 3, 2);
        }
      }
    }

    // Buildings
    for (const bd of game.buildings) {
      if (bd.dead) continue;
      ctx.fillStyle = BUILDING_DEFS[bd.type].color;
      const [x, y] = mp(bd.x, bd.y);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    // Units
    ctx.fillStyle = '#4a9eff';
    for (const u of game.units) {
      if (u.dead) continue;
      const [x, y] = mp(u.x, u.y);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    // Zombies
    ctx.fillStyle = '#ff3322';
    for (const z of game.zombies) {
      if (z.dead) continue;
      const [x, y] = mp(z.x, z.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
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
    ctx.font = 'bold 60px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OVERRUN', this.W/2, this.H/2 - 30);
    ctx.fillStyle = '#aaa';
    ctx.font = '22px monospace';
    ctx.fillText('Your base has fallen to the horde.', this.W/2, this.H/2 + 20);
    ctx.fillStyle = '#ffdd44';
    ctx.font = '18px monospace';
    ctx.fillText('Press F5 to restart', this.W/2, this.H/2 + 55);
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
    ctx.font = '16px monospace';
    ctx.fillText('Press F5 to play again', this.W/2, this.H/2 + 88);
  }
}
