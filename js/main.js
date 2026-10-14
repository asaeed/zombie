'use strict';

(function () {
  const canvas = document.getElementById('canvas');
  const SAVE_KEY_AUTO = 'dead-zone-rts:auto';
  const SAVE_KEY_PREFIX = 'dead-zone-rts:slot:';

  let game       = null;
  const renderer = new Renderer(canvas);
  let input      = null;
  let autoSaveIn = 2;
  const graphicsSetting = document.getElementById('graphics-setting');
  const graphicsSelect = document.getElementById('graphics-pack');
  const graphicsStatus = document.getElementById('graphics-status');

  function positionGraphicsSetting() {
    const panel = mainMenuPanelRect(window.innerWidth);
    graphicsSetting.style.left = `${panel.x + 14}px`;
    graphicsSetting.style.top = `${panel.y + 51}px`;
    graphicsSetting.style.width = `${panel.w - 28}px`;
  }

  function syncGraphicsSetting() {
    graphicsSelect.replaceChildren(...ART_PACK_CATALOG.packs.map(pack => {
      const option = document.createElement('option'); option.value = pack.id; option.textContent = pack.label; return option;
    }));
    graphicsSelect.value = ART_PACK_STATE.pending || ART_PACK_STATE.active || '';
    graphicsSelect.disabled = !!ART_PACK_STATE.pending;
    graphicsStatus.textContent = ART_PACK_STATE.pending ? 'Loading...' : ART_PACK_STATE.error ? 'Load failed' : '';
  }

  window.addEventListener('resize', positionGraphicsSetting);
  window.addEventListener('artpackchange', syncGraphicsSetting);
  graphicsSelect.addEventListener('change', async () => {
    const id = graphicsSelect.value;
    try { await selectArtPack(id); }
    catch { input.notify('Graphics could not load'); }
  });
  graphicsSelect.addEventListener('keydown', event => {
    if (event.code === 'Escape') { input.setMenuOpen(false); canvas.focus(); }
    event.stopPropagation();
  });
  positionGraphicsSetting(); syncGraphicsSetting();

  // Keep renderer.W/H (used by HUD/minimap layout) in sync with the canvas
  window.addEventListener('resize', () => renderer.resize());

  function parseSave(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const save = JSON.parse(raw);
      if (migrateSavedUnitTypes(save?.data)) localStorage.setItem(key, JSON.stringify(save));
      return save;
    } catch (err) {
      console.warn('Failed to read save', key, err);
      return null;
    }
  }

  function saveMetaFor(key) {
    const s = parseSave(key);
    if (!s) return null;
    return { savedAt: s.savedAt, gameTime: s.gameTime, score: s.score, status: s.status };
  }

  function readSaveMeta() {
    return {
      auto: saveMetaFor(SAVE_KEY_AUTO),
      slots: {
        1: saveMetaFor(`${SAVE_KEY_PREFIX}1`),
        2: saveMetaFor(`${SAVE_KEY_PREFIX}2`),
        3: saveMetaFor(`${SAVE_KEY_PREFIX}3`),
      },
    };
  }

  function writeSave(key) {
    const data = game.toSaveData();
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      gameTime: game.gameTime,
      score: game.score,
      status: game.status,
      data,
    }));
    return readSaveMeta();
  }

  function loadSave(key) {
    const save = parseSave(key);
    if (!save?.data) return null;
    return Game.fromSaveData(save.data);
  }

  function installGame(nextGame) {
    game = nextGame;
    input.game = game;
    input.resetTransient();
    input.setSaveMeta(readSaveMeta());
    window._game = game;
    autoSaveIn = 0.2;
  }

  function newGame() {
    const fresh = new Game();
    fresh.start();
    installGame(fresh);
    writeSave(SAVE_KEY_AUTO);
    input.setSaveMeta(readSaveMeta());
  }

  const menuActions = {
    menuVisibility: open => {
      graphicsSetting.hidden = !open;
      if (!open && graphicsSetting.contains(document.activeElement)) document.activeElement.blur();
    },
    saveAuto: () => ({ text: 'Saved', meta: writeSave(SAVE_KEY_AUTO) }),
    loadAuto: () => {
      const loaded = loadSave(SAVE_KEY_AUTO);
      if (!loaded) return { text: 'No save found', meta: readSaveMeta() };
      installGame(loaded);
      return { text: 'Loaded autosave', meta: readSaveMeta(), closeMenu: true };
    },
    saveSlot: slot => ({ text: `Saved slot ${slot}`, meta: writeSave(`${SAVE_KEY_PREFIX}${slot}`) }),
    loadSlot: slot => {
      const loaded = loadSave(`${SAVE_KEY_PREFIX}${slot}`);
      if (!loaded) return { text: 'No save found', meta: readSaveMeta() };
      installGame(loaded);
      return { text: `Loaded slot ${slot}`, meta: readSaveMeta(), closeMenu: true };
    },
    newGame: () => {
      newGame();
      return { text: 'Restarted', meta: readSaveMeta(), closeMenu: true };
    },
    clearSaves: () => {
      localStorage.removeItem(SAVE_KEY_AUTO);
      for (let i = 1; i <= 3; i++) localStorage.removeItem(`${SAVE_KEY_PREFIX}${i}`);
      return { text: 'Saves cleared', meta: readSaveMeta() };
    },
  };

  input = new InputHandler(canvas, new Game(), menuActions);

  try {
    const restored = loadSave(SAVE_KEY_AUTO);
    if (restored) installGame(restored);
    else newGame();
  } catch (err) {
    console.warn('Failed to restore autosave', err);
    localStorage.removeItem(SAVE_KEY_AUTO);
    newGame();
  }

  // Expose for debug / browser validation.
  window._game = game;
  window._input = input;
  window._newGame = newGame;
  window._saveGameNow = () => writeSave(SAVE_KEY_AUTO);
  window._loadAutoSave = () => {
    const loaded = loadSave(SAVE_KEY_AUTO);
    if (loaded) installGame(loaded);
    return !!loaded;
  };

  window.addEventListener('pagehide', () => {
    try { writeSave(SAVE_KEY_AUTO); } catch (err) { console.warn('Autosave failed', err); }
  });

  let lastTime = 0;

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = ts;

    input.updateCamera(dt);
    if (!game.paused) game.update(dt);
    autoSaveIn -= dt;
    if (autoSaveIn <= 0) {
      autoSaveIn = 3;
      try {
        input.setSaveMeta(writeSave(SAVE_KEY_AUTO));
      } catch (err) {
        console.warn('Autosave failed', err);
      }
    }
    renderer.render(game, input);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(ts => {
    lastTime = ts;
    requestAnimationFrame(loop);
  });
})();
