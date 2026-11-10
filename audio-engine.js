/**
 * ============================================================
 *  HEISENBERG CINEMATIC AUDIO & SFX ENGINE
 * ============================================================
 *  Orchestrates ambient cinematic soundtrack playback,
 *  user volume / mute controls, and real-time Web Audio API
 *  procedural sound design (assembly resonance, chemical chirps,
 *  tactical switch clicks, and atmospheric swells).
 *
 *  Legal & non-copyrighted: SFX are synthesized entirely in real-time
 *  using Web Audio API oscillators, biquad filters & gain envelopes.
 * ============================================================
 */
window.AudioEngine = (function () {
  'use strict';

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  let _audioEl = null;
  let _audioCtx = null;
  let _sfxGain = null;
  let _isMuted = true;
  let _volume = 0.6;
  let _lastActiveVolume = 0.6;
  let _hasInteracted = false;
  let _fadeRafId = null;

  // DOM elements
  let _toggleBtn = null;
  let _volumeSlider = null;
  let _volumeReadout = null;
  let _popover = null;

  /* ── Web Audio Context Init (Deferred to User Interaction) ── */
  function getAudioContext() {
    if (!_audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        _audioCtx = new AudioCtx();
        _sfxGain = _audioCtx.createGain();
        _sfxGain.gain.setValueAtTime(_isMuted ? 0 : _volume * 0.45, _audioCtx.currentTime);
        _sfxGain.connect(_audioCtx.destination);
      }
    }
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    return _audioCtx;
  }

  /* ── Background Music Controls ── */
  function updateBgMusic() {
    if (!_audioEl) return;
    if (_fadeRafId) {
      cancelAnimationFrame(_fadeRafId);
      _fadeRafId = null;
    }

    if (_isMuted) {
      const startVol = _audioEl.volume;
      const startTime = performance.now();
      const fadeOut = (now) => {
        const elapsed = (now - startTime) / 250;
        if (elapsed < 1) {
          _audioEl.volume = Math.max(0, startVol * (1 - elapsed));
          _fadeRafId = requestAnimationFrame(fadeOut);
        } else {
          _audioEl.volume = 0;
          _audioEl.pause();
          _fadeRafId = null;
        }
      };
      _fadeRafId = requestAnimationFrame(fadeOut);
    } else {
      _audioEl.volume = 0;
      const playPromise = _audioEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          const startTime = performance.now();
          const target = _volume;
          const fadeIn = (now) => {
            const elapsed = (now - startTime) / 350;
            if (elapsed < 1) {
              _audioEl.volume = target * elapsed;
              _fadeRafId = requestAnimationFrame(fadeIn);
            } else {
              _audioEl.volume = target;
              _fadeRafId = null;
            }
          };
          _fadeRafId = requestAnimationFrame(fadeIn);
        }).catch(() => {});
      }
    }

    if (_sfxGain && _audioCtx) {
      _sfxGain.gain.setValueAtTime(_isMuted ? 0 : _volume * 0.45, _audioCtx.currentTime);
    }
  }

  /* ── Procedural Sound Design: Web Audio API SFX ── */

  /**
   * 1. Cinematic Assembly Chime & Sub-bass Drone
   * Played when the Heisenberg Voronoi portrait locks into place.
   */
  function playAssemblyChime() {
    if (_isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Sub-bass impact
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(65, t);
    subOsc.frequency.exponentialRampToValueAtTime(36, t + 1.2);
    subGain.gain.setValueAtTime(0.5 * _volume, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    subOsc.connect(subGain);
    subGain.connect(_sfxGain);
    subOsc.start(t);
    subOsc.stop(t + 1.5);

    // Crystalline harmonic glint (two high crystal sine frequencies)
    [880, 1320, 1760].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + delay + 0.6);

      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.linearRampToValueAtTime(0.18 * _volume, t + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + delay + 0.9);

      osc.connect(gain);
      gain.connect(_sfxGain);
      osc.start(t + delay);
      osc.stop(t + delay + 1.0);
    });
  }

  /**
   * 2. Periodic Element Tile Click (Resonant chemical chirp)
   */
  function playTileClick() {
    if (_isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.exponentialRampToValueAtTime(1080, t + 0.09);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.Q.setValueAtTime(4, t);

    gain.gain.setValueAtTime(0.22 * _volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_sfxGain);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  /**
   * 3. Timeline Era Switch (Tactical filmic mechanical click)
   */
  function playTabClick() {
    if (_isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.05);

    gain.gain.setValueAtTime(0.3 * _volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(_sfxGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * 4. Cinematic Return-to-Top Whoosh
   */
  function playWhoosh() {
    if (_isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // White noise filtered whoosh
    const bufferSize = ctx.sampleRate * 0.6;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(1200, t + 0.28);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.6);
    filter.Q.setValueAtTime(2.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.24 * _volume, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(_sfxGain);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.62);
  }

  /* ── UI Sync & State Toggling ── */
  function setMuted(muted, syncSlider = true) {
    _isMuted = muted;
    try {
      localStorage.setItem('heisenberg_muted', _isMuted ? '1' : '0');
    } catch (e) {}

    if (_toggleBtn) {
      _toggleBtn.setAttribute('aria-pressed', String(!_isMuted));
      _toggleBtn.classList.toggle('is-active', !_isMuted);
      const label = _toggleBtn.querySelector ? _toggleBtn.querySelector('.audio-label') : null;
      if (label) {
        label.textContent = _isMuted ? 'OFF' : 'ON';
      }
    }

    if (!_isMuted && _volume === 0) {
      _volume = _lastActiveVolume > 0 ? _lastActiveVolume : 0.6;
      if (_volumeSlider) _volumeSlider.value = _volume;
      if (_volumeReadout) _volumeReadout.textContent = `${Math.round(_volume * 100)}%`;
      updateSliderFill(_volume);
    }

    updateBgMusic();
  }

  function toggleMute() {
    getAudioContext();
    setMuted(!_isMuted);
  }

  function updateSliderFill(val) {
    if (!_volumeSlider) return;
    const pct = Math.round(clamp(val, 0, 1) * 100);
    _volumeSlider.style.background =
      `linear-gradient(to right, #38e879 0%, #38e879 ${pct}%, rgba(142,255,173,0.2) ${pct}%, rgba(142,255,173,0.2) 100%)`;
  }

  function setVolume(val, syncMute = true) {
    const num = parseFloat(val);
    _volume = clamp(isNaN(num) ? 0.6 : num, 0, 1);
    if (_volume > 0) {
      _lastActiveVolume = _volume;
    }

    try {
      localStorage.setItem('heisenberg_vol', String(_volume));
    } catch (e) {}

    // Cancel any active rAF fade so manual slide takes immediate effect
    if (_fadeRafId) {
      cancelAnimationFrame(_fadeRafId);
      _fadeRafId = null;
    }

    // Auto unmute when increasing volume above 0; auto mute when reduced to 0
    if (syncMute) {
      if (_volume > 0 && _isMuted) {
        _isMuted = false;
        try {
          localStorage.setItem('heisenberg_muted', '0');
        } catch (e) {}
        if (_toggleBtn) {
          _toggleBtn.setAttribute('aria-pressed', 'true');
          _toggleBtn.classList.add('is-active');
          const label = _toggleBtn.querySelector ? _toggleBtn.querySelector('.audio-label') : null;
          if (label) label.textContent = 'ON';
        }
      } else if (_volume === 0 && !_isMuted) {
        _isMuted = true;
        try {
          localStorage.setItem('heisenberg_muted', '1');
        } catch (e) {}
        if (_toggleBtn) {
          _toggleBtn.setAttribute('aria-pressed', 'false');
          _toggleBtn.classList.remove('is-active');
          const label = _toggleBtn.querySelector ? _toggleBtn.querySelector('.audio-label') : null;
          if (label) label.textContent = 'OFF';
        }
      }
    }

    if (_volumeSlider) _volumeSlider.value = _volume;
    if (_volumeReadout) _volumeReadout.textContent = `${Math.round(_volume * 100)}%`;
    updateSliderFill(_volume);

    getAudioContext();

    if (!_isMuted && _audioEl) {
      _audioEl.volume = _volume;
      if (_audioEl.paused && _volume > 0) {
        _audioEl.play().catch(() => {});
      }
    } else if (_audioEl && _volume === 0) {
      _audioEl.volume = 0;
      _audioEl.pause();
    }

    if (_sfxGain && _audioCtx) {
      _sfxGain.gain.setValueAtTime(_isMuted ? 0 : _volume * 0.45, _audioCtx.currentTime);
    }
  }

  /* ── User Interaction Hook ── */
  function onFirstInteraction() {
    if (_hasInteracted) return;
    _hasInteracted = true;
    getAudioContext();

    // If user previously left sound unmuted, resume playback
    try {
      const savedMute = localStorage.getItem('heisenberg_muted');
      if (savedMute === '0') {
        setMuted(false);
      }
    } catch (e) {}

    ['pointerdown', 'keydown'].forEach(e =>
      window.removeEventListener(e, onFirstInteraction)
    );
  }

  /* ── Init ── */
  function init() {
    _audioEl = document.getElementById('bg-song');
    _toggleBtn = document.getElementById('audio-toggle-btn');
    _volumeSlider = document.getElementById('audio-volume-slider');
    _volumeReadout = document.getElementById('volume-readout');
    _popover = document.getElementById('audio-volume-popover');

    // Restore saved settings
    try {
      const savedVol = localStorage.getItem('heisenberg_vol');
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed)) {
          _volume = clamp(parsed, 0, 1);
          if (_volume > 0) _lastActiveVolume = _volume;
        }
      }
      const savedMute = localStorage.getItem('heisenberg_muted');
      if (savedMute !== null) _isMuted = savedMute === '1';
    } catch (e) {}

    if (_volumeSlider) {
      _volumeSlider.value = _volume;
      updateSliderFill(_volume);
      ['input', 'change'].forEach(evt => {
        _volumeSlider.addEventListener(evt, e => {
          getAudioContext();
          setVolume(e.target.value);
        });
      });
    }
    if (_volumeReadout) {
      _volumeReadout.textContent = `${Math.round(_volume * 100)}%`;
    }

    if (_toggleBtn) {
      _toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleMute();
      });
      _toggleBtn.setAttribute('aria-pressed', String(!_isMuted));
      _toggleBtn.classList.toggle('is-active', !_isMuted);
      const label = _toggleBtn.querySelector ? _toggleBtn.querySelector('.audio-label') : null;
      if (label) label.textContent = _isMuted ? 'OFF' : 'ON';
    }

    // Keyboard shortcut: 'M' toggles audio
    window.addEventListener('keydown', e => {
      if ((e.key === 'm' || e.key === 'M') && !e.target.matches('input, textarea')) {
        toggleMute();
      }
    });

    ['pointerdown', 'keydown'].forEach(e =>
      window.addEventListener(e, onFirstInteraction, { passive: true, once: true })
    );

    // Initial audio setup
    if (_audioEl) {
      _audioEl.volume = 0;
    }
  }

  return {
    init,
    toggleMute,
    setMuted,
    setVolume,
    playAssemblyChime,
    playTileClick,
    playTabClick,
    playWhoosh,
    isMuted: () => _isMuted,
  };
})();
