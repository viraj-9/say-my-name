/**
 * ============================================================
 *  THE COOK — CURSOR INTENSITY & PURITY CONTROLLER
 * ============================================================
 *  Controls cursor intensity, purity readout, preview crystal glow,
 *  and interactive click-scatter crystal particle effects.
 * ============================================================
 */
window.CookController = (function () {
  'use strict';

  let _slider = null;
  let _readout = null;
  let _crystalPreview = null;
  let _crystalShadow = null;
  let _crystalGroup = null;
  let _intensity = 1.0;

  function generateCursorSvg(intensity) {
    const stdDev = (0.4 + intensity * 2.2).toFixed(1);
    const floodOp = (0.2 + intensity * 0.8).toFixed(2);
    const bodyOp = (0.35 + intensity * 0.65).toFixed(2);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
      `<defs>` +
        `<filter id="c-glow" x="-35%" y="-35%" width="170%" height="170%">` +
          `<feDropShadow dx="0" dy="0.6" stdDeviation="${stdDev}" flood-color="#00f0ff" flood-opacity="${floodOp}"/>` +
        `</filter>` +
      `</defs>` +
      `<g filter="url(#c-glow)" opacity="${bodyOp}">` +
        `<polygon points="2,2 5,14 11,26 8,13" fill="#009edb" />` +
        `<polygon points="2,2 8,13 11,26 15,11" fill="#00e5ff" />` +
        `<polygon points="2,2 15,11 11,26 19,10" fill="#7ceeff" />` +
        `<polygon points="2,2 9,6 15,11 8,7" fill="#e8fcff" />` +
        `<polygon points="2,2 6,4 4,6" fill="#ffffff" />` +
        `<polyline points="2,2 8,13 11,26" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.9" />` +
        `<polyline points="2,2 15,11 11,26" fill="none" stroke="#bdf6ff" stroke-width="0.75" opacity="0.9" />` +
        `<polygon points="2,2 5,14 11,26 19,10" fill="none" stroke="#d4f9ff" stroke-width="0.8" />` +
      `</g>` +
    `</svg>`;
  }

  function applyCursorIntensity(val) {
    _intensity = Math.max(0.1, Math.min(1.0, val / 100));

    // 1. Update text readout
    if (_readout) {
      _readout.textContent = val.toFixed(1);
    }

    // 2. Update slider track fill
    if (_slider) {
      _slider.style.background = `linear-gradient(to right, #00f0ff 0%, #00f0ff ${val}%, rgba(0, 240, 255, 0.2) ${val}%, rgba(0, 240, 255, 0.2) 100%)`;
    }

    // 3. Update preview crystal glow and brightness
    if (_crystalShadow) {
      const dev = (4 + _intensity * 20).toFixed(0);
      const op = (0.2 + _intensity * 0.75).toFixed(2);
      _crystalShadow.setAttribute('stdDeviation', dev);
      _crystalShadow.setAttribute('flood-opacity', op);
    }
    if (_crystalGroup) {
      _crystalGroup.style.opacity = (0.4 + _intensity * 0.6).toFixed(2);
    }
    if (_crystalPreview) {
      _crystalPreview.style.filter = `drop-shadow(0 0 ${(8 + _intensity * 24).toFixed(0)}px rgba(0, 240, 255, ${(0.25 + _intensity * 0.65).toFixed(2)}))`;
    }

    // 4. Update CSS custom property for global cursor lighting
    document.documentElement.style.setProperty('--cursor-intensity', _intensity.toFixed(3));

    // 5. Update custom cursor SVG on documentElement and body
    const svgStr = generateCursorSvg(_intensity);
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    document.documentElement.style.cursor = `url("${dataUri}") 2 2, auto`;
    document.body.style.cursor = `url("${dataUri}") 2 2, auto`;

    try {
      localStorage.setItem('heisenberg_cursor_intensity', String(val));
    } catch (e) {}
  }

  // Click anywhere to scatter crystals
  function scatterCrystals(x, y) {
    const shardCount = 8;
    for (let i = 0; i < shardCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'crystal-scatter-particle';
      const size = 3 + Math.random() * 5;
      particle.style.width = size + 'px';
      particle.style.height = (size * (1 + Math.random() * 1.5)).toFixed(1) + 'px';
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';

      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 65;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const rot = (Math.random() - 0.5) * 360;

      particle.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      particle.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      particle.style.setProperty('--rot', `${rot.toFixed(1)}deg`);

      const colors = ['#00f0ff', '#7ceeff', '#009edb', '#e8fcff'];
      const col = colors[Math.floor(Math.random() * colors.length)];
      particle.style.background = col;
      particle.style.boxShadow = `0 0 6px ${col}`;

      document.body.appendChild(particle);
      setTimeout(() => {
        if (particle.parentNode) particle.parentNode.removeChild(particle);
      }, 700);
    }
  }

  function init() {
    _slider = document.getElementById('cursor-purity-slider');
    _readout = document.getElementById('cook-purity-num');
    _crystalPreview = document.getElementById('cook-crystal-preview');
    _crystalShadow = document.getElementById('cook-shadow');
    _crystalGroup = document.getElementById('cook-crystal-group');

    let saved = 100;
    try {
      const val = localStorage.getItem('heisenberg_cursor_intensity');
      if (val !== null) {
        const p = parseFloat(val);
        if (!isNaN(p) && p >= 10 && p <= 100) saved = p;
      }
    } catch (e) {}

    if (_slider) {
      _slider.value = saved;
      ['input', 'change'].forEach(evt => {
        _slider.addEventListener(evt, (e) => {
          applyCursorIntensity(parseFloat(e.target.value));
        });
      });
    }

    applyCursorIntensity(saved);

    // Click anywhere on page to scatter crystals (skip interactive elements)
    window.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a, select, textarea, [role="button"]')) return;
      scatterCrystals(e.clientX, e.clientY);
    });
  }

  return { init, setIntensity: applyCursorIntensity };
})();
