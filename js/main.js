'use strict';

(function () {
  const canvas = document.getElementById('canvas');

  // Resize canvas to fill window
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  let game       = new Game();
  const renderer = new Renderer(canvas);
  const input    = new InputHandler(canvas, game);

  // Keep renderer.W/H (used by HUD/minimap layout) in sync with the canvas
  window.addEventListener('resize', () => renderer.resize());

  // Expose for debug / victory screen score
  window._game = game;

  game.start();

  window._newGame = function () {
    game = new Game();
    input.game = game;
    input.attackMoveArm = false;
    input.flareArm = false;
    input.canvas.style.cursor = '';
    input.groups = {};
    input._lastGroupTap = null;
    input._panStart = null;
    window._game = game;
    game.start();
  };

  let lastTime = 0;

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = ts;

    input.updateCamera(dt);
    game.update(dt);
    renderer.render(game, input);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(ts => {
    lastTime = ts;
    requestAnimationFrame(loop);
  });
})();
