/**
 * ============================================================
 *  HEISENBERG CINEMATIC SHATTER & ASSEMBLY ENGINE
 * ============================================================
 *  Voronoi-based 3D polygonal fragmentation and scroll-driven
 *  physical assembly of the iconic Heisenberg portrait.
 *
 *  Features:
 *  • Mathematically exact Voronoi convex polygon tessellation
 *  • Non-grid, irregular crystalline shards with variable density
 *    (finer detailed shards on Walter White's facial features,
 *     larger structural shards along periphery)
 *  • True 3D perspective projection (depth Z-axis movement,
 *    pitch/yaw/roll tumbling in 3D space)
 *  • Dynamic depth sorting (closer shards correctly occlude deeper shards)
 *  • Crystalline rim specular highlights & edge glints in flight
 *  • 100% seamless, mathematically gapless reassembly at target
 *  • Smooth cubic physical easing with inertia and settling
 *  • Interactive 3D mouse parallax tilt
 *  • Audio synchronization on assembly completion
 *  • High DPR (retina) canvas rendering
 * ============================================================
 */
window.ShatterEngine = (function () {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const IMG_SRC = 'assets/heisenberg-character.webp';

  /* ── State ── */
  let _hero = null;
  let _heroArt = null;
  let _layer = null;
  let _stage = null;
  let _glowEl = null;

  let _canvas = null;
  let _ctx = null;
  let _image = null;
  let _srcCanvas = null;

  let _w = 0;
  let _h = 0;
  let _dpr = 1;
  let _padX = 0;
  let _padY = 0;
  let _layout = null;

  let _shards = [];
  let _rafId = 0;
  let _needsUpdate = true;
  let _prevProgress = -1;
  let _destroyed = false;
  let _hasTriggeredAudio = false;

  let _mouseX = 0;
  let _mouseY = 0;
  let _tiltX = 0;
  let _tiltY = 0;

  // Animation state: ratio goes 0 (fully broken) → 1 (fully assembled)
  // _animDir: +1 = assembling, -1 = breaking
  let _animRatio = 0;       // current assembly ratio (0 = broken, 1 = assembled)
  let _animDir = 0;         // 0 = idle, +1 = assembling, -1 = breaking
  let _animLastTime = 0;    // timestamp of last tick, for delta-time animation
  const ASSEMBLE_DURATION = 2400; // ms: light fast & responsive
  const BREAK_DURATION    = 2400; // ms: equal timing for both assembling and breaking
  let _buttonUsed = false;  // true once button has been clicked at least once

  // Initial intro: show shards slightly scattered at page load
  let _introStart = 0;
  const INTRO_DURATION = 1800;
  const INTRO_AMOUNT   = 0.28; // partial pull-apart so pieces are visible immediately

  /* ── Pseudo-random seeded generator ── */
  function createSeededRandom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ── Voronoi Tessellation via Sutherland-Hodgman Polygon Clipping ── */
  function clipPolygonAgainstBisector(poly, pA, pB) {
    const mx = (pA.x + pB.x) * 0.5;
    const my = (pA.y + pB.y) * 0.5;
    const nx = pA.x - pB.x;
    const ny = pA.y - pB.y;

    const out = [];
    const len = poly.length;
    if (len === 0) return out;

    function isInside(p) {
      return (p.x - mx) * nx + (p.y - my) * ny >= -1e-6;
    }

    function intersect(p1, p2) {
      const d1 = (p1.x - mx) * nx + (p1.y - my) * ny;
      const d2 = (p2.x - mx) * nx + (p2.y - my) * ny;
      const denom = d1 - d2;
      const t = Math.abs(denom) < 1e-9 ? 0.5 : d1 / denom;
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
      };
    }

    for (let i = 0; i < len; i++) {
      const curr = poly[i];
      const prev = poly[(i + len - 1) % len];
      const currIn = isInside(curr);
      const prevIn = isInside(prev);

      if (currIn) {
        if (!prevIn) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(intersect(prev, curr));
      }
    }
    return out;
  }

  function computeCentroid(poly) {
    let cx = 0, cy = 0, area = 0;
    const len = poly.length;
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % len;
      const cross = poly[i].x * poly[j].y - poly[j].x * poly[i].y;
      area += cross;
      cx += (poly[i].x + poly[j].x) * cross;
      cy += (poly[i].y + poly[j].y) * cross;
    }
    area = area * 0.5;
    if (Math.abs(area) < 1e-6) {
      let sx = 0, sy = 0;
      for (let i = 0; i < len; i++) { sx += poly[i].x; sy += poly[i].y; }
      return { cx: sx / len, cy: sy / len, area: 0 };
    }
    return {
      cx: cx / (6 * area),
      cy: cy / (6 * area),
      area: Math.abs(area)
    };
  }

  /* ── Generate Voronoi Seeds & Fragments ── */
  function buildVoronoiShards() {
    _shards = [];
    if (!_layout || !_layout.w || !_layout.h) return;

    const w = _layout.w;
    const h = _layout.h;
    const rand = createSeededRandom(5082008); // Breaking Bad homage seed

    // Generate seed points with density weighting:
    // Core face/glasses/hat brim (dense, small shards) vs outer shoulders/air (larger shards)
    const seeds = [];
    const totalSeeds = window.innerWidth <= 760 ? 26 : 46;

    // 1. Focal cluster (face & eyes: 30% - 70% width, 22% - 68% height)
    const focalCount = Math.round(totalSeeds * 0.60);
    for (let i = 0; i < focalCount; i++) {
      seeds.push({
        x: _layout.x + w * (0.28 + rand() * 0.44),
        y: _layout.y + h * (0.20 + rand() * 0.48),
        isFocal: true
      });
    }

    // 2. Peripheral cluster (shoulders, coat, hat edge, atmosphere)
    const periphCount = totalSeeds - focalCount;
    for (let i = 0; i < periphCount; i++) {
      seeds.push({
        x: _layout.x + w * (0.04 + rand() * 0.92),
        y: _layout.y + h * (0.04 + rand() * 0.92),
        isFocal: false
      });
    }

    // Sutherland-Hodgman Voronoi tessellation
    const boundingBox = [
      { x: _layout.x, y: _layout.y },
      { x: _layout.x + w, y: _layout.y },
      { x: _layout.x + w, y: _layout.y + h },
      { x: _layout.x, y: _layout.y + h }
    ];

    for (let i = 0; i < seeds.length; i++) {
      let poly = boundingBox.map(pt => ({ x: pt.x, y: pt.y }));
      const pA = seeds[i];

      for (let j = 0; j < seeds.length; j++) {
        if (i === j) continue;
        const pB = seeds[j];
        // Distance cull optimization
        const dx = pA.x - pB.x;
        const dy = pA.y - pB.y;
        if (dx * dx + dy * dy > (w * 0.85) * (w * 0.85)) continue;

        poly = clipPolygonAgainstBisector(poly, pA, pB);
        if (poly.length < 3) break;
      }

      if (poly.length >= 3) {
        const { cx, cy, area } = computeCentroid(poly);

        // Vector from portrait center
        const centerX = _layout.x + w * 0.5;
        const centerY = _layout.y + h * 0.5;
        const dirX = (cx - centerX) / (w * 0.5);
        const dirY = (cy - centerY) / (h * 0.5);

        // Physical 3D scatter starting vectors
        const scatterDist = 0.55 + rand() * 0.85;
        const initDx = (dirX * 0.75 + (rand() - 0.5) * 1.1) * w * 0.62 * scatterDist;
        const initDy = (dirY * 0.65 + (rand() - 0.5) * 1.0) * h * 0.58 * scatterDist;
        // 3D Depth: some shards start in front of camera (Z < 0), some deep in background (Z > 0)
        const initDz = (rand() - 0.42) * 850;

        // 3D Tumbling rotations (pitch, yaw, roll)
        const initRotX = (rand() - 0.5) * 1.8;
        const initRotY = (rand() - 0.5) * 2.2;
        const initRotZ = (rand() - 0.5) * 1.4;

        // Radial delay: outer shards initiate flight first, focal face completes last
        const distFromCenter = Math.hypot(dirX, dirY);
        const delay = clamp((1.3 - distFromCenter) * 0.22 + rand() * 0.12, 0, 0.32);

        _shards.push({
          polygon: poly,
          cx, cy, area,
          initDx, initDy, initDz,
          initRotX, initRotY, initRotZ,
          delay,
          isFocal: pA.isFocal,
          // Runtime interpolated values for 3D depth sorting
          currentZ: initDz,
          currentEase: 0,
        });
      }
    }

    // Pre-sort once by initial depth to eliminate per-frame array sorting
    _shards.sort((a, b) => b.initDz - a.initDz);
  }

  /* ── Canvas Setup & Resizing ── */
  function resizeCanvas() {
    if (!_canvas || !_heroArt || !_srcCanvas) return;
    const w = _heroArt.offsetWidth;
    const h = _heroArt.offsetHeight;
    if (!w || !h) return;

    // Generous padding so scattered 3D shards don't clip at edges
    _padX = Math.round(w * 0.42);
    _padY = Math.round(h * 0.45);
    _w = w + _padX * 2;
    _h = h + _padY * 2;
    _dpr = Math.min(window.devicePixelRatio || 1, 2);

    _canvas.style.left   = -_padX + 'px';
    _canvas.style.top    = -_padY + 'px';
    _canvas.style.width  = _w + 'px';
    _canvas.style.height = _h + 'px';

    _canvas.width  = Math.round(_w * _dpr);
    _canvas.height = Math.round(_h * _dpr);

    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
    _layout = { x: _padX, y: _padY, w, h };

    buildVoronoiShards();
  }

  /* ── Load Portrait Image & Prep Offscreen Source ── */
  function loadPortraitImage(fallbackImg) {
    _image = new Image();
    _image.decoding = 'async';
    _image.onload = () => {
      // Bake soft top & bottom vignette into offscreen canvas
      _srcCanvas = document.createElement('canvas');
      _srcCanvas.width = _image.naturalWidth;
      _srcCanvas.height = _image.naturalHeight;
      const c = _srcCanvas.getContext('2d');
      c.drawImage(_image, 0, 0);

      c.globalCompositeOperation = 'destination-in';
      const grad = c.createLinearGradient(0, 0, 0, _srcCanvas.height);
      grad.addColorStop(0,    'rgba(0,0,0,0)');
      grad.addColorStop(0.06, '#000000');
      grad.addColorStop(0.85, '#000000');
      grad.addColorStop(1,    'rgba(0,0,0,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, _srcCanvas.width, _srcCanvas.height);

      resizeCanvas();
      _introStart = performance.now();
      _prevProgress = -1;
      requestUpdate();
    };

    _image.onerror = () => {
      if (fallbackImg) fallbackImg.style.display = '';
      if (_canvas) _canvas.style.display = 'none';
    };
    _image.src = IMG_SRC;
  }

  /* ── Build Portrait DOM Structure ── */
  function buildPortrait(useCanvas) {
    _layer.innerHTML = '';
    _stage = document.createElement('div');
    _stage.className = 'portrait-stage';

    const inner = document.createElement('div');
    inner.className = 'portrait-inner' + (useCanvas ? ' is-shards' : '');

    const img = document.createElement('img');
    img.className = 'portrait-img';
    img.src = IMG_SRC;
    img.alt = 'Heisenberg Portrait';
    img.decoding = 'async';
    img.draggable = false;
    inner.appendChild(img);

    if (useCanvas) {
      img.style.display = 'none';
      _canvas = document.createElement('canvas');
      _canvas.className = 'portrait-canvas';
      _canvas.setAttribute('aria-hidden', 'true');
      _ctx = _canvas.getContext('2d', { alpha: true });
      inner.appendChild(_canvas);
    }

    const sheen = document.createElement('div');
    sheen.className = 'portrait-sheen';
    inner.appendChild(sheen);

    _stage.appendChild(inner);
    _layer.appendChild(_stage);

    if (useCanvas) loadPortraitImage(img);
  }

  /* ── Draw 3D Shards Onto Canvas ── */
  function drawShards(assembledRatio) {
    if (!_layout || !_srcCanvas || !_ctx) return;
    _ctx.clearRect(0, 0, _w, _h);

    const FOCAL_LENGTH = 780; // 3D perspective camera focal distance

    // Faint atmospheric ghost silhouette while fragments are scattered
    if (assembledRatio < 0.96) {
      _ctx.save();
      _ctx.globalAlpha = 0.08 * (1 - assembledRatio);
      _ctx.drawImage(_srcCanvas, _layout.x, _layout.y, _layout.w, _layout.h);
      _ctx.restore();
    }

    // Normalized transition progress (0 = resting broken shape, 1 = assembled)
    const u = clamp((assembledRatio - INTRO_AMOUNT) / (1 - INTRO_AMOUNT), 0, 1);
    const flightSpin = Math.sin(u * Math.PI);

    // 1. Calculate each shard's 3D interpolated state
    for (let i = 0; i < _shards.length; i++) {
      const sh = _shards[i];
      const localT = clamp((assembledRatio - sh.delay) / (1 - sh.delay), 0, 1);
      // Physical cubic ease-out
      const ease = 1 - Math.pow(1 - localT, 3);
      const restProg = 1 - ease;

      // Deterministic dynamic tumble unique to each shard while in flight
      const tumbleX = ((Math.abs(sh.cx) * 17) % 7 - 3) * 0.9;
      const tumbleY = ((Math.abs(sh.cy) * 13) % 7 - 3) * 1.1;
      const tumbleZ = (((Math.abs(sh.cx + sh.cy)) * 19) % 7 - 3) * 0.8;

      sh.currentEase = ease;
      sh.currentZ    = sh.initDz * restProg;
      sh.currentDx   = sh.initDx * restProg;
      sh.currentDy   = sh.initDy * restProg;

      // At rest (u = 0 or 1), flightSpin is 0 -> exact original resting shape & 100% gapless target!
      // In flight (0 < u < 1), flightSpin > 0 -> visibly rotates & tumbles in 3D!
      sh.currentRotX = sh.initRotX * restProg + tumbleX * flightSpin;
      sh.currentRotY = sh.initRotY * restProg + tumbleY * flightSpin;
      sh.currentRotZ = sh.initRotZ * restProg + tumbleZ * flightSpin;
    }

    // 2. Render shards in pre-sorted 3D perspective
    for (let i = 0; i < _shards.length; i++) {
      const sh = _shards[i];
      const ease = sh.currentEase;

      // 3D perspective scale factor
      const sc = FOCAL_LENGTH / (FOCAL_LENGTH + sh.currentZ);

      // 3D Rotation transform matrix components
      const cosX = Math.cos(sh.currentRotX);
      const sinX = Math.sin(sh.currentRotX);
      const cosY = Math.cos(sh.currentRotY);
      const sinY = Math.sin(sh.currentRotY);
      const cosZ = Math.cos(sh.currentRotZ);
      const sinZ = Math.sin(sh.currentRotZ);

      const a = (cosY * cosZ) * sc;
      const b = (sinX * sinY * cosZ + cosX * sinZ) * sc;
      const c = (-cosX * sinY * cosZ + sinX * sinZ) * sc;
      const d = (cosX * cosY) * sc;

      // Projected position with parallax tilt
      const targetCx = sh.cx + sh.currentDx + _tiltX * (1 - ease * 0.7);
      const targetCy = sh.cy + sh.currentDy + _tiltY * (1 - ease * 0.7);

      _ctx.save();
      _ctx.translate(targetCx, targetCy);
      _ctx.transform(a, b, c, d, 0, 0);
      _ctx.translate(-sh.cx, -sh.cy);

      // Create polygon clipping path
      _ctx.beginPath();
      const poly = sh.polygon;
      _ctx.moveTo(poly[0].x, poly[0].y);
      for (let p = 1; p < poly.length; p++) {
        _ctx.lineTo(poly[p].x, poly[p].y);
      }
      _ctx.closePath();

      // Clip & draw texture
      _ctx.save();
      _ctx.clip();
      _ctx.drawImage(_srcCanvas, _layout.x, _layout.y, _layout.w, _layout.h);
      _ctx.restore();

      // Crystalline edge highlight while in flight
      if (ease < 0.992) {
        _ctx.beginPath();
        _ctx.moveTo(poly[0].x, poly[0].y);
        for (let p = 1; p < poly.length; p++) {
          _ctx.lineTo(poly[p].x, poly[p].y);
        }
        _ctx.closePath();

        const edgeAlpha = clamp(0.42 * (1 - ease) + 0.05, 0, 0.75);
        _ctx.strokeStyle = `rgba(142, 255, 173, ${edgeAlpha.toFixed(3)})`;
        _ctx.lineWidth = 1.25;
        _ctx.stroke();

        // Subtle specular light glint on corners
        if (ease > 0.15 && ease < 0.85) {
          const corner = poly[0];
          _ctx.fillStyle = `rgba(215, 255, 230, ${(0.35 * (1 - ease)).toFixed(3)})`;
          _ctx.beginPath();
          _ctx.arc(corner.x, corner.y, 2.2, 0, Math.PI * 2);
          _ctx.fill();
        }
      }

      _ctx.restore();
    }

    // 4. Perfect full image overlay when assembled to eliminate all subpixel seams
    if (assembledRatio >= 0.96) {
      const blendIn = smoothstep(clamp((assembledRatio - 0.96) / 0.04, 0, 1));
      _ctx.save();
      _ctx.globalAlpha = blendIn;
      _ctx.drawImage(_srcCanvas, _layout.x, _layout.y, _layout.w, _layout.h);
      _ctx.restore();
    }
  }

  /* ── Frame Update — Button-Toggled Assembly / Break ── */
  function tick(timestamp) {
    _rafId = 0;
    if (_destroyed) return;
    if (!_needsUpdate) return;
    _needsUpdate = false;

    if (!_hero || !_stage) return;

    const heroRect = _hero.getBoundingClientRect();
    if (heroRect.bottom < -80) return;

    // Smooth parallax tilt follow
    _tiltX += (_mouseX * 18 - _tiltX) * 0.08;
    _tiltY += (_mouseY * 14 - _tiltY) * 0.08;

    _stage.style.transform = 'translate3d(0, 0px, 0) scale(1)';
    _stage.style.opacity   = '1';
    _stage.style.filter    = 'none';
    if (_glowEl) _glowEl.style.opacity = '0.9';

    const now = timestamp || performance.now();

    // ── Phase 1: intro on page load — shards gently pull apart to INTRO_AMOUNT ──
    let introProgress = 1;
    if (_introStart) {
      const raw = Math.min((now - _introStart) / INTRO_DURATION, 1);
      introProgress = 1 - Math.pow(1 - raw, 3); // ease-out
      if (raw < 1) _needsUpdate = true;
    }

    // ── Phase 2: button-driven animation (0 = fully broken, 1 = fully assembled) ──
    if (_animDir !== 0) {
      const dt = _animLastTime ? Math.min((now - _animLastTime) / 1000, 0.05) : 0;
      _animLastTime = now;

      // Equal, deliberate speed over the active travel range (INTRO_AMOUNT ↔ 1.0)
      const travelDist = 1 - INTRO_AMOUNT;
      const speed = travelDist / (ASSEMBLE_DURATION / 1000);

      _animRatio += _animDir * speed * dt;
      _animRatio = Math.max(0, Math.min(1, _animRatio));

      const done = (_animDir > 0 && _animRatio >= 1) || (_animDir < 0 && _animRatio <= INTRO_AMOUNT);
      if (!done) {
        _needsUpdate = true;
      } else {
        // Snap to exact end value
        if (_animDir > 0) _animRatio = 1;
        else              _animRatio = INTRO_AMOUNT;
        _animDir = 0;
        _animLastTime = 0;

        // ── Label flips ONLY when animation fully settles ──
        const btn = document.getElementById('assemble-btn');
        if (btn) {
          const lbl = btn.querySelector('span:not(.mouse-icon):not(.cue-line)');
          if (lbl) lbl.textContent = (_animRatio >= 1) ? 'BREAK' : 'ASSEMBLE';
        }
      }
    }

    // ── Compute final display ratio ──
    // Before any button press: use intro scatter (0 → INTRO_AMOUNT)
    // After button press:      use _animRatio directly
    const assembledRatio = _buttonUsed
      ? _animRatio
      : introProgress * INTRO_AMOUNT;

    // ── Render ──
    drawShards(assembledRatio);

    if (_needsUpdate) {
      _rafId = requestAnimationFrame(tick);
    }

    // ── Audio: fire chime once when fully assembled ──
    if (assembledRatio >= 0.98 && !_hasTriggeredAudio) {
      _hasTriggeredAudio = true;
      if (window.AudioEngine && window.AudioEngine.playAssemblyChime) {
        window.AudioEngine.playAssemblyChime();
      }
    }
    if (assembledRatio < 0.5) _hasTriggeredAudio = false;

    _heroArt.style.setProperty('--assemble-progress', assembledRatio.toFixed(4));
    _heroArt.style.setProperty('--shard-progress',    assembledRatio.toFixed(4));
  }

  function requestUpdate() {
    if (_destroyed) return;
    _needsUpdate = true;
    if (!_rafId) _rafId = requestAnimationFrame(tick);
  }

  function onPointerMove(e) {
    _mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    _mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    requestUpdate();
  }

  /* ── Public API ── */
  function init() {
    _hero = document.querySelector('.hero');
    _heroArt = document.getElementById('hero-art');
    _layer = document.getElementById('hero-shards');

    if (!_hero || !_heroArt || !_layer) {
      console.warn('[ShatterEngine] Required DOM elements not found.');
      return;
    }

    _destroyed = false;

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    buildPortrait(!reduced);
    if (reduced) return;

    _glowEl = document.createElement('div');
    _glowEl.className = 'shatter-glow';
    _glowEl.setAttribute('aria-hidden', 'true');
    _heroArt.appendChild(_glowEl);

    // Wire up the Assemble/Break toggle button
    const assembleBtn = document.getElementById('assemble-btn');
    if (assembleBtn) {
      assembleBtn.addEventListener('click', () => {
        if (_animDir !== 0) return; // ignore clicks mid-animation

        _buttonUsed = true;
        _hasTriggeredAudio = false;
        _animLastTime = performance.now();

        if (_animRatio < 1) {
          // Currently broken / mid-break → ASSEMBLE
          if (_animRatio === 0) _animRatio = INTRO_AMOUNT; // start from scattered position
          _animDir = 1;
        } else {
          // Currently assembled → BREAK
          _animDir = -1;
        }

        requestUpdate();
      }, { passive: true });
    }

    window.addEventListener('resize', () => { resizeCanvas(); requestUpdate(); }, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    _prevProgress = -1;
    requestUpdate();
  }

  function destroy() {
    _destroyed = true;
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = 0;
    }
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('pointermove', onPointerMove);

    if (_layer) _layer.innerHTML = '';
    if (_glowEl) { _glowEl.remove(); _glowEl = null; }

    _hero = _heroArt = _layer = _stage = null;
    _canvas = _ctx = _image = _srcCanvas = _layout = null;
    _shards = [];
    _prevProgress = -1;
    _animRatio = 0;
    _animDir = 0;
    _animLastTime = 0;
    _buttonUsed = false;
    _introStart = 0;
  }

  return { init, destroy };
})();
