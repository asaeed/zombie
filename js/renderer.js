'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
  }

  render(game, input) {
    const ctx = this.ctx;
    const cam = game.camera;

    ctx.clearRect(0, 0, this.W, this.H);

    // ── World space (translated by camera) ──────────────────────────────────
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    this._drawTiles(ctx, game, cam);
    this._drawBuildings(ctx, game);
    this._drawUnits(ctx, game);
    this._drawZombies(ctx, game);
    this._drawProjectiles(ctx, game);
    this._drawParticles(ctx, game);

    // Build mode ghost
    if (game.buildMode && input.mouseTile) {
      this._drawBuildGhost(ctx, game, input.mouseTile);
    }

    // Selection box
    if (input.selectBox) {
      this._drawSelectionBox(ctx, input.selectBox);
    }

    // Barracks train buttons (rendered in world space, attached to building)
    if (game._selectedBuilding && game._selectedBuilding.type === 'barracks' && !game._selectedBuilding.dead) {
      this._drawBarracksButtons(ctx, game, game._selectedBuilding);
    }

    ctx.restore();

    // ── Screen space (HUD) ───────────────────────────────────────────────────
    this._drawHUD(ctx, game, input);
    this._drawMinimap(ctx, game);

    if (game.status === 'gameover') this._drawGameOver(ctx);
    if (game.status === 'victory') this._drawVictory(ctx);
  }

  // ── Tiles ──────────────────────────────────────────────────────────────────
  _drawTiles(ctx, game, cam) {
    const startTX = Math.max(0, Math.floor(cam.x / TILE));
    const startTY = Math.max(0, Math.floor(cam.y / TILE));
    const endTX   = Math.min(MAP_W, Math.ceil((cam.x + this.W) / TILE) + 1);
    const endTY   = Math.min(MAP_H, Math.ceil((cam.y + this.H) / TILE) + 1);

    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        const tile = game.tiles[ty][tx];
        const px = tx * TILE, py = ty * TILE;

        // Checkerboard variation for grass
        const shade = (tx + ty) % 2 === 0;

        if (tile === TILE_GRASS) {
          ctx.fillStyle = shade ? '#2d4a20' : '#355524';
        } else if (tile === TILE_DIRT) {
          ctx.fillStyle = shade ? '#5a4a2a' : '#4e3f24';
        } else { // WATER
          ctx.fillStyle = shade ? '#1a3a5c' : '#163352';
        }
        ctx.fillRect(px, py, TILE, TILE);

        // Water shimmer
        if (tile === TILE_WATER) {
          ctx.fillStyle = 'rgba(100,160,220,0.15)';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  // ── Buildings ─────────────────────────────────────────────────────────────
  _drawBuildings(ctx, game) {
    for (const b of game.buildings) {
      if (b.dead) continue;
      const def = BUILDING_DEFS[b.type];
      const ts = def.tileSize;
      const px = b.tileX * TILE, py = b.tileY * TILE;
      const pw = ts * TILE, ph = ts * TILE;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px + 3, py + 3, pw, ph);

      // Building body
      ctx.fillStyle = def.color;
      ctx.fillRect(px, py, pw, ph);

      // Highlight top/left
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(px, py, pw, 3);
      ctx.fillRect(px, py, 3, ph);

      // Dark border
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

      // Building icon / label
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `bold ${Math.min(12, ts * 8)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labels = { hq:'HQ', wall:'', tower:'T', barracks:'B', depot:'D' };
      const label = labels[b.type] || '';
      if (label) ctx.fillText(label, b.x, b.y);

      // Health bar
      this._drawHealthBar(ctx, px, py - 8, pw, 5, b.hp / b.maxHp);

      // Barracks queue indicator
      if (b.type === 'barracks' && b.trainQueue.length > 0) {
        ctx.fillStyle = '#ffdd44';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[${b.trainQueue.length}]`, b.x, py - 14);
        // Progress bar
        if (b.trainProgress > 0) {
          const pct = b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
          this._drawHealthBar(ctx, px, py - 16, pw, 4, pct, '#44aaff');
        }
      }

      // Tower range ring (when hovered / selected - optional, skip for perf)
    }
  }

  // ── Units ─────────────────────────────────────────────────────────────────
  _drawUnits(ctx, game) {
    for (const u of game.units) {
      if (u.dead) continue;
      const def = u.def;

      // Selection circle
      if (u.selected) {
        ctx.beginPath();
        ctx.arc(u.x, u.y, def.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#44ffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Direction tick
      }

      // Unit body
      ctx.beginPath();
      ctx.arc(u.x, u.y, def.radius, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Type indicator dot
      ctx.beginPath();
      ctx.arc(u.x, u.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();

      // Health bar
      this._drawHealthBar(ctx, u.x - def.radius, u.y - def.radius - 8, def.radius*2, 4, u.hp / u.maxHp);

      // Builder repair icon
      if (u.type === 'builder' && u.repairTarget) {
        ctx.fillStyle = '#ffdd44';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚙', u.x, u.y - def.radius - 14);
      }
    }
  }

  // ── Zombies ───────────────────────────────────────────────────────────────
  _drawZombies(ctx, game) {
    for (const z of game.zombies) {
      if (z.dead) continue;
      const def = z.def;

      ctx.save();
      ctx.translate(z.x, z.y);

      // Zombie body - irregular shape
      ctx.beginPath();
      ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();

      // Dark outline
      ctx.strokeStyle = '#005500';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Eyes
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(-def.radius*0.3, -def.radius*0.2, def.radius*0.2, 0, Math.PI*2);
      ctx.arc( def.radius*0.3, -def.radius*0.2, def.radius*0.2, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();

      // Health bar
      this._drawHealthBar(ctx, z.x - def.radius, z.y - def.radius - 7, def.radius*2, 4, z.hp / z.maxHp, '#ff4422');
    }
  }

  // ── Projectiles ───────────────────────────────────────────────────────────
  _drawProjectiles(ctx, game) {
    for (const p of game.projectiles) {
      if (p.dead) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      // Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.color + '55';
      ctx.fill();
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  _drawParticles(ctx, game) {
    for (const p of game.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Barracks Train Buttons (world space, on the building) ────────────────
  _drawBarracksButtons(ctx, game, b) {
    const BTW = 96, BTH = 58, gap = 6;
    const totalW = 3 * BTW + 2 * gap;
    const startX = b.x - totalW / 2;
    const startY = b.y + b.height / 2 + 10;
    const trainable = ['soldier', 'builder', 'scout'];

    // Panel background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, BTH + 20, 6);
    ctx.fill();
    ctx.strokeStyle = '#883322';
    ctx.lineWidth = 2;
    roundRect(ctx, startX - 8, startY - 6, totalW + 16, BTH + 20, 6);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ff8844';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TRAIN UNIT', b.x, startY + BTH + 8);

    trainable.forEach((type, i) => {
      const udef      = UNIT_DEFS[type];
      const canAfford = game.supplies >= udef.cost;
      const bx        = startX + i * (BTW + gap);
      const by        = startY;

      ctx.fillStyle = canAfford ? 'rgba(70,50,30,0.95)' : 'rgba(20,20,20,0.95)';
      roundRect(ctx, bx, by, BTW, BTH, 5); ctx.fill();
      ctx.strokeStyle = canAfford ? udef.color : '#444';
      ctx.lineWidth = canAfford ? 2.5 : 1;
      roundRect(ctx, bx, by, BTW, BTH, 5); ctx.stroke();

      // Color dot
      ctx.beginPath();
      ctx.arc(bx + 14, by + BTH / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = canAfford ? udef.color : '#444';
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = canAfford ? '#eee' : '#555';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(udef.name, bx + 26, by + 16);
      ctx.fillStyle = canAfford ? '#ffdd44' : '#444';
      ctx.font = '11px monospace';
      ctx.fillText(`$${udef.cost}`, bx + 26, by + 32);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`${udef.trainTime}s  [${i + 6}]`, bx + 26, by + 47);
    });

    // Training progress bar
    if (b.trainQueue.length > 0) {
      const pct  = b.trainProgress / UNIT_DEFS[b.trainQueue[0]].trainTime;
      const barY = startY + BTH + 18;
      ctx.fillStyle = '#333';
      ctx.fillRect(startX - 4, barY, totalW + 8, 6);
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(startX - 4, barY, (totalW + 8) * pct, 6);
      ctx.fillStyle = '#aaa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Training: ${b.trainQueue.map(t => UNIT_DEFS[t].name).join(', ')}`, startX - 4, barY + 16);
    }
  }

  // ── Build Ghost ───────────────────────────────────────────────────────────
  _drawBuildGhost(ctx, game, tile) {
    const type = game.buildMode;
    const def = BUILDING_DEFS[type];
    const ts = def.tileSize;
    const px = tile.tx * TILE, py = tile.ty * TILE;
    const pw = ts * TILE, ph = ts * TILE;
    const valid = game.canPlaceBuilding(type, tile.tx, tile.ty);

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = valid ? def.color : '#ff2222';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = valid ? '#ffffff' : '#ff0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.globalAlpha = 1;
  }

  // ── Selection Box ─────────────────────────────────────────────────────────
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
    ctx.fillText('R: builder repair  |  Del: sell selected building  |  Arrows/edges: scroll', BX + buildables.length * (BW + gap) + 8, PY + 48);
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

  // ── Minimap ───────────────────────────────────────────────────────────────
  _drawMinimap(ctx, game) {
    const MX = this.W - MINIMAP_W - 10;
    const MY = this.H - 110 - MINIMAP_H - 10;
    const scaleX = MINIMAP_W / (MAP_W * TILE);
    const scaleY = MINIMAP_H / (MAP_H * TILE);

    // Background
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(MX, MY, MINIMAP_W, MINIMAP_H);

    // Water tiles
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (game.tiles[ty][tx] === TILE_WATER) {
          ctx.fillStyle = '#163352';
          ctx.fillRect(MX + tx * MINIMAP_W / MAP_W, MY + ty * MINIMAP_H / MAP_H,
                       MINIMAP_W / MAP_W + 1, MINIMAP_H / MAP_H + 1);
        }
      }
    }

    // Buildings
    for (const b of game.buildings) {
      if (b.dead) continue;
      ctx.fillStyle = BUILDING_DEFS[b.type].color;
      const ts = BUILDING_DEFS[b.type].tileSize;
      ctx.fillRect(MX + b.tileX * MINIMAP_W/MAP_W, MY + b.tileY * MINIMAP_H/MAP_H,
                   ts * MINIMAP_W/MAP_W + 1, ts * MINIMAP_H/MAP_H + 1);
    }

    // Units
    ctx.fillStyle = '#4a9eff';
    for (const u of game.units) {
      if (u.dead) continue;
      ctx.fillRect(MX + u.x * scaleX - 1, MY + u.y * scaleY - 1, 3, 3);
    }

    // Zombies
    ctx.fillStyle = '#ff3322';
    for (const z of game.zombies) {
      if (z.dead) continue;
      ctx.fillRect(MX + z.x * scaleX - 1, MY + z.y * scaleY - 1, 2, 2);
    }

    // Camera viewport rect
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      MX + game.camera.x * scaleX,
      MY + game.camera.y * scaleY,
      this.W * scaleX,
      this.H * scaleY
    );

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
