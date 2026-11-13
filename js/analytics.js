'use strict';

// ponytail: lifecycle events only; no per-frame network traffic or replay.
(function () {
  let game = null, session = null, sdk = null;
  const queue = [];
  const analytics = window.gameAnalytics = {
    capture(event, properties) {
      const entry = [event, {...properties, app: 'dead-zone-rts',
        environment: location.hostname === 'asaeed.github.io' ? 'production' : 'local',
        host: location.hostname}];
      if (sdk) sdk.capture(...entry, {send_instantly: true, transport: 'sendBeacon'});
      else if (queue.length < 50) queue.push(entry);
    },
    begin(nextGame, mode = 'resume') {
      finish(mode === 'new' ? 'restart' : 'load');
      game = nextGame;
      session = {id: crypto.randomUUID(), wave: game.waveNum, start: game.gameTime,
        ended: game.status === 'gameover'};
      if (!session.ended) emit('dz_session_started', {mode});
    },
    update() {
      if (!session || session.ended) return;
      if (game.waveNum > session.wave) {
        session.wave = game.waveNum;
        emit('dz_wave_reached', {wave: game.waveNum});
      }
      if (game.status === 'gameover') finish('defeat');
    },
  };
  function emit(event, props = {}) {
    try {
      analytics.capture(event, {...props, session_id: session.id,
        wave: game.waveNum, survival_minutes: game.gameTime / 60,
        active_minutes: Math.max(0, game.gameTime - session.start) / 60,
        score: game.score, zombies_killed: game.stats?.zombiesKilled || 0});
    } catch { /* Analytics must never interrupt gameplay or saving. */ }
  }
  function finish(reason) {
    if (!session || session.ended) return;
    if (game.status === 'gameover') reason = 'defeat';
    session.ended = true;
    emit('dz_session_ended', {reason});
  }
  window.addEventListener('pagehide', () => finish('leave'));
  window.addEventListener('pageshow', event => {
    if (event.persisted && game) analytics.begin(game);
  });
  // Configuration is generated from deployment environment variables.
  if (typeof fetch !== 'function') return;
  fetch('analytics-config.json').then(response => response.ok ? response.json() : null).then(config => {
    if (!config?.token || !config.apiHost || !config.assetHost) return;
    const script = document.createElement('script');
    script.src = `${config.assetHost}/static/array.js`;
    script.async = true;
    script.onload = () => {
      try {
        window.posthog.init(config.token, {
          defaults: '2026-08-30', api_host: config.apiHost, persistence: 'localStorage', person_profiles: 'never',
          autocapture: false, capture_pageview: false, capture_pageleave: false,
          disable_session_recording: true, capture_exceptions: false,
          capture_performance: false, enable_heatmaps: false, disable_surveys: true,
          loaded(client) {
            sdk = client;
            for (const entry of queue.splice(0)) {
              try {sdk.capture(...entry, {send_instantly:true, transport:'sendBeacon'});} catch {}
            }
          },
        });
      } catch {}
    };
    document.head.append(script);
  }).catch(() => {});
})();
