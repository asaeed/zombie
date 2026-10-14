'use strict';

(function () {
  const canvas = document.getElementById('canvas');
  const SAVE_KEY_AUTO = 'dead-zone-rts:auto';
  const SAVE_KEY_PREFIX = 'dead-zone-rts:slot:';

  let game       = null;
  let renderer  = null;
  let input      = null;
  let autoSaveIn = 2;
  const startScreen = document.getElementById('start-screen');
  const startButton = document.getElementById('start-game');
  const retryButton = document.getElementById('retry-assets');
  const loading = document.querySelector('.start-loading');
  const assetStatus = document.getElementById('asset-status');
  const assetDetail = document.getElementById('asset-detail');
  const assetPercent = document.getElementById('asset-percent');
  const assetProgress = document.getElementById('asset-progress');
  const sourceLink = document.getElementById('source-code-link');

  function syncLoading() {
    const {loaded, total} = ART_PACK_STATE.progress;
    const ready = SCULPTED_WORLD.ready && !ART_PACK_STATE.pending && !ART_PACK_STATE.error;
    const failed = !!ART_PACK_STATE.error;
    startButton.disabled = !ready;
    retryButton.hidden = !failed;
    loading.toggleAttribute('data-error', failed);
    loading.setAttribute('aria-busy', String(!ready && !failed));
    assetProgress.max = total || 1; assetProgress.value = loaded;
    assetPercent.textContent = `${total ? Math.floor(loaded / total * 100) : 0}%`;
    const status = failed ? 'Download interrupted' : ready ? 'Assets ready' : 'Loading assets...';
    if (assetStatus.textContent !== status) assetStatus.textContent = status;
    assetDetail.textContent = failed ? 'Some artwork could not load. Retry to continue.'
      : total ? `${loaded} / ${total} assets ${ready ? 'ready' : 'downloaded and prepared'}.` : 'Preparing the final game artwork.';
  }

  try {
    if (JSON.parse(localStorage.getItem(SAVE_KEY_AUTO))?.data) startButton.textContent = 'Continue game';
  } catch {}
  window.addEventListener('artpackchange', syncLoading);
  retryButton.addEventListener('click', async () => {
    retryButton.hidden = true;
    try {await startArtPacks();} catch {}
    syncLoading();
  });
  syncLoading(); ART_PACK_READY.then(syncLoading);

  // Keep renderer.W/H (used by HUD/minimap layout) in sync with the canvas
  window.addEventListener('resize', () => renderer?.resize());

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

  startButton.addEventListener('click', () => {
    if (startButton.disabled || game || !SCULPTED_WORLD.ready) return;
    renderer = new Renderer(canvas);
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

    // Expose for debug / browser validation only after the player enters.
    window._game = game;
    window._input = input;
    window._newGame = newGame;
    window._saveGameNow = () => writeSave(SAVE_KEY_AUTO);
    window._loadAutoSave = () => {
      const loaded = loadSave(SAVE_KEY_AUTO);
      if (loaded) installGame(loaded);
      return !!loaded;
    };
    renderer.render(game, input);
    canvas.hidden = false; sourceLink.hidden = false; startScreen.hidden = true;
    canvas.focus();
    requestAnimationFrame(ts => {lastTime = ts; requestAnimationFrame(loop);});
  });

  window.addEventListener('pagehide', () => {
    if (!game) return;
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

})();
