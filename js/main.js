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

  const game     = new Game();
  const renderer = new Renderer(canvas);
  const input    = new InputHandler(canvas, game);

  // Expose for debug / victory screen score
  window._game = game;

  game.start();

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
