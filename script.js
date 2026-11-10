/**
 * THE HEISENBERG FILES — Main Application Entry Point
 * Orchestrates SmokeEngine, ShatterEngine, and ScrollController.
 */
(() => {
  'use strict';

  function boot() {
    // 0. Initialise cinematic audio engine (Mute, Volume, SFX, BG Music)
    if (window.AudioEngine) {
      window.AudioEngine.init();
    } else {
      initSong();
    }

    // 1. Initialise the realistic volumetric smoke engine
    if (window.SmokeEngine) {
      window.SmokeEngine.init();
    }

    // 2. Initialise the Voronoi shatter & assembly engine for Heisenberg portrait
    if (window.ShatterEngine) {
      window.ShatterEngine.init();
    }

    // 2.5. Initialise the cook section (cursor intensity & crystal purity)
    if (window.CookController) {
      window.CookController.init();
    }

    // 3. Initialise the scroll storytelling controller for all sections below hero
    if (window.ScrollController) {
      window.ScrollController.init();
    }

    // Optional testing / deep-link support via ?scroll=px
    const params = new URLSearchParams(window.location.search);
    if (params.has('scroll')) {
      window.scrollTo({ top: parseFloat(params.get('scroll')), behavior: 'instant' });
    }
  }


  /* ── Background song: plays when the site opens ──
     Put your file in assets/ named song.mp3 (or song.m4a / song.ogg / song.wav).
     Browsers block sound autoplay until the visitor interacts, so if the
     first attempt is blocked, the song starts on the first click / tap / key. */
  function initSong() {
    const audio = document.getElementById('bg-song');
    if (!audio) return;
    const TARGET_VOLUME = 0.6;
    audio.volume = 0;
    let started = false;

    function fadeIn() {
      const step = () => {
        audio.volume = Math.min(TARGET_VOLUME, audio.volume + 0.03);
        if (audio.volume < TARGET_VOLUME) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    function start() {
      if (started) return;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { started = true; unbind(); fadeIn(); })
         .catch(() => { /* blocked or file missing: wait for next interaction */ });
      } else {
        started = true; unbind(); fadeIn();
      }
    }

    const events = ['pointerdown', 'keydown', 'touchend', 'click'];
    function unbind() { events.forEach(e => window.removeEventListener(e, start)); }
    events.forEach(e => window.addEventListener(e, start, { passive: true }));

    start(); // try immediately on open
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
