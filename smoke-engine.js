/**
 * ============================================================
 *  HEISENBERG CINEMATIC VOLUMETRIC SMOKE ENGINE (High-Perf 60FPS)
 * ============================================================
 *  Produces realistic, billowy, atmospheric chemical smoke
 *  inspired by the dark lab cooks of Breaking Bad.
 *
 *  Features:
 *  • Upward convective thermal buoyancy (smoke rises and expands)
 *  • Multi-octave billow fractal noise (puffy, rounded cloud lobes)
 *  • Interactive cursor response: smoke parts, curls, and swirls where pointing
 *  • Reduced, subtle atmospheric density (non-intrusive, moody, dark)
 *  • 60 FPS ultra-low GPU overhead (optimized value/gradient noise)
 *  • Zero CPU overhead on WebGL; Canvas 2D fallback for compatibility
 * ============================================================
 */
window.SmokeEngine = (function () {
  'use strict';

  /* ── Configuration ── */
  const CONFIG = {
    // Optimized internal resolution scaling for buttery 60 FPS
    resolutions: {
      high:   2.4,
      medium: 2.8,
      low:    3.5,
    },
    defaultDensity: 0.62, // Calibrated light smokey touch
  };

  /* ── State ── */
  let _canvas = null;
  let _gl = null;
  let _ctx2d = null;
  let _program = null;
  let _uniforms = {};
  let _quadBuffer = null;
  let _rafId = null;
  let _running = false;
  let _destroyed = false;
  let _isWebGL = false;

  let _quality = 'high';
  let _resScale = CONFIG.resolutions.high;
  let _density = CONFIG.defaultDensity;

  let _vw = 0;
  let _vh = 0;
  let _cw = 0;
  let _ch = 0;

  let _time = 0;
  let _lastFrameTime = 0;
  let _scrollY = 0;
  let _prevScrollY = 0;
  let _scrollVel = 0;
  let _targetScrollVel = 0;

  let _mouseX = 0.5;
  let _mouseY = 0.5;
  let _targetMouseX = 0.5;
  let _targetMouseY = 0.5;

  /* ── 2D Fallback State ── */
  let _puffs2D = [];
  let _sprite2D = null;

  /* ── WebGL Shaders ── */
  const VERT_SRC = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAG_SRC = `
    precision highp float;

    uniform vec2  u_resolution;
    uniform float u_time;
    uniform float u_scroll;
    uniform float u_scroll_vel;
    uniform vec2  u_mouse;
    uniform float u_density;

    // Fast 2D Hash
    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    // High-performance 2D Gradient Noise
    float gnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    // 3-Octave Billow Fractal Noise (Creates rounded, puffy cloud lobes)
    float billowFbm(vec2 p) {
      float val = 0.0;
      float amp = 0.54;
      float freq = 1.0;
      for (int i = 0; i < 3; i++) {
        float n = gnoise(p * freq);
        float lobe = 1.0 - abs(n);
        val += amp * (lobe * lobe);
        freq *= 2.04;
        amp *= 0.46;
      }
      return val;
    }

    // Fast background atmospheric haze
    float hazeFbm(vec2 p) {
      return gnoise(p) * 0.65 + gnoise(p * 2.04) * 0.35;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);

      float t = u_time * 0.14;

      // Continuous upward convective thermal buoyancy (gentle rising motion)
      vec2 smokeP = p * 1.08;
      smokeP.y += t * 0.72;
      smokeP.y -= u_scroll * 0.28;

      // Slow lateral drift — gives a living, breathing sway
      smokeP.x += sin(smokeP.y * 0.42 + t * 0.38) * 0.15;
      smokeP.x += cos(smokeP.y * 0.18 + t * 0.22) * 0.07;

      // DYNAMIC CURSOR INTERACTION:
      // Smoke parts and swirls dynamically where the cursor points (exact aspect ratio matched)
      vec2 m = u_mouse * 2.0 - 1.0;
      m.y = -m.y;
      if (u_resolution.x > u_resolution.y) {
        m.x *= u_resolution.x / u_resolution.y;
      } else {
        m.y *= u_resolution.y / u_resolution.x;
      }

      vec2 toMouse = p - m;
      float mDist = length(toMouse);
      float mRadius = 0.50; // generous interactive radius

      float mInfluence = clamp(1.0 - mDist / mRadius, 0.0, 1.0);
      mInfluence = mInfluence * mInfluence; // smooth quadratic falloff

      // Outward parting push + rotational vortex
      vec2 push = normalize(toMouse + vec2(0.001)) * (mInfluence * 0.40);
      vec2 swirl = vec2(-toMouse.y, toMouse.x) * (mInfluence * 0.52);
      smokeP += push + swirl;

      // Organic low-frequency curling (continuously evolving turbulence)
      vec2 curl = vec2(
        gnoise(smokeP * 0.5 + vec2(0.0, t * 0.32)),
        gnoise(smokeP * 0.5 + vec2(2.6, t * 0.24))
      ) * 0.44;

      // Secondary slow macro-curl for large-scale rolling motion
      vec2 macroCurl = vec2(
        gnoise(smokeP * 0.18 + vec2(5.3, t * 0.14)),
        gnoise(smokeP * 0.18 + vec2(8.1, t * 0.10))
      ) * 0.18;

      // Sample billowy smoke & haze with combined curl distortion
      float billows = billowFbm(smokeP * 0.82 + curl + macroCurl);
      float haze = hazeFbm(smokeP * 0.42 + vec2(t * 0.15, -t * 0.20));

      // Composite density with wide gaseous falloff (shows soft billows & wisps)
      float density = billows * 0.68 + haze * 0.32;
      density = smoothstep(0.18, 0.85, density);

      // Cursor slightly thins smoke directly under pointer
      density *= (1.0 - mInfluence * 0.28);

      // Atmospheric edge vignette
      vec2 vig = uv * (1.0 - uv.yx);
      float v = clamp(pow(vig.x * vig.y * 11.0, 0.36), 0.0, 1.0);
      density *= v * u_density;

      // Breaking Bad Smoke Palette (Light, luminous, misty emerald touch)
      vec3 cShadow = vec3(0.015, 0.040, 0.022); // Charcoal smoke shadow
      vec3 cBody   = vec3(0.065, 0.240, 0.115); // Volumetric light emerald haze
      vec3 cLitRim = vec3(0.240, 0.680, 0.360); // Forward-scattered misty glow
      vec3 cGlow   = vec3(0.420, 0.860, 0.520); // Soft illuminated plume highlight

      vec3 col = mix(cShadow, cBody, clamp(density * 1.5, 0.0, 1.0));
      col = mix(col, cLitRim, clamp(pow(density, 1.7) * 1.35, 0.0, 1.0));
      col = mix(col, cGlow, clamp(pow(density, 3.0) * 0.85, 0.0, 1.0));

      // Delicate, visible gaseous transparency (light smokey ambiance)
      float alpha = clamp(density * 0.72, 0.0, 0.76);

      gl_FragColor = vec4(col * alpha, alpha);
    }
  `;

  /* ── WebGL Initialization ── */
  function initWebGL() {
    try {
      const gl = _canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      }) || _canvas.getContext('experimental-webgl');

      if (!gl) return false;

      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, VERT_SRC);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return false;

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, FRAG_SRC);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return false;

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;

      gl.useProgram(prog);
      _program = prog;
      _gl = gl;

      _quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, _quadBuffer);
      const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      _uniforms = {
        resolution: gl.getUniformLocation(prog, 'u_resolution'),
        time:       gl.getUniformLocation(prog, 'u_time'),
        scroll:     gl.getUniformLocation(prog, 'u_scroll'),
        scrollVel:  gl.getUniformLocation(prog, 'u_scroll_vel'),
        mouse:      gl.getUniformLocation(prog, 'u_mouse'),
        density:    gl.getUniformLocation(prog, 'u_density'),
      };

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      return true;
    } catch (e) {
      console.warn('[SmokeEngine] WebGL fallback to 2D:', e);
      return false;
    }
  }

  /* ── 2D Canvas Fallback (Rising billow puffs) ── */
  function initCanvas2D() {
    _ctx2d = _canvas.getContext('2d');
    if (!_ctx2d) return;

    const spriteSize = 256;
    _sprite2D = document.createElement('canvas');
    _sprite2D.width = spriteSize;
    _sprite2D.height = spriteSize;
    const sctx = _sprite2D.getContext('2d');
    const grad = sctx.createRadialGradient(
      spriteSize / 2, spriteSize / 2, 0,
      spriteSize / 2, spriteSize / 2, spriteSize / 2
    );
    grad.addColorStop(0,    'rgba(30, 115, 55, 0.12)');
    grad.addColorStop(0.40, 'rgba(14, 60, 28, 0.06)');
    grad.addColorStop(0.75, 'rgba(6, 25, 12, 0.02)');
    grad.addColorStop(1,    'rgba(3, 10, 5, 0)');
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(spriteSize / 2, spriteSize / 2, spriteSize / 2, 0, Math.PI * 2);
    sctx.fill();

    _puffs2D = [];
    const count = window.innerWidth < 760 ? 20 : 32;
    for (let i = 0; i < count; i++) {
      _puffs2D.push({
        x: Math.random() * _vw,
        y: Math.random() * _vh,
        size: 280 + Math.random() * 360,
        vy: -0.40 - Math.random() * 0.50,
        vx: (Math.random() - 0.5) * 0.30,
        alpha: 0.10 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.003,
      });
    }
  }

  function renderCanvas2D(dt) {
    if (!_ctx2d) return;
    _ctx2d.clearRect(0, 0, _cw, _ch);
    _ctx2d.save();
    _ctx2d.scale(_cw / _vw, _ch / _vh);

    for (let i = 0; i < _puffs2D.length; i++) {
      const p = _puffs2D[i];
      p.phase += dt * 0.70;
      p.rot += p.vrot * 1.4;

      // Mouse repulsion in 2D
      const dx = p.x - _mouseX * _vw;
      const dy = p.y - _mouseY * _vh;
      const dist = Math.hypot(dx, dy) + 1;
      if (dist < 220) {
        const force = (1 - dist / 220) * 1.5;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 - 0.015;

      p.x += p.vx + Math.sin(p.phase) * 0.50 + Math.cos(p.phase * 0.6) * 0.20;
      p.y += p.vy - _scrollVel * 0.02;

      if (p.y < -p.size) {
        p.y = _vh + p.size * 0.5;
        p.x = Math.random() * _vw;
      }
      if (p.x < -p.size) p.x = _vw + p.size;
      if (p.x > _vw + p.size) p.x = -p.size;

      const currentAlpha = p.alpha * _density * (0.8 + 0.2 * Math.sin(p.phase));
      _ctx2d.save();
      _ctx2d.translate(p.x, p.y);
      _ctx2d.rotate(p.rot);
      _ctx2d.globalAlpha = currentAlpha;
      _ctx2d.drawImage(_sprite2D, -p.size / 2, -p.size / 2, p.size, p.size);
      _ctx2d.restore();
    }
    _ctx2d.restore();
  }

  /* ── Resize & Viewport ── */
  function resize() {
    if (!_canvas) return;
    _vw = window.innerWidth;
    _vh = window.innerHeight;

    _cw = Math.max(320, Math.round(_vw / _resScale));
    _ch = Math.max(180, Math.round(_vh / _resScale));

    _canvas.width  = _cw;
    _canvas.height = _ch;

    if (_isWebGL && _gl) {
      _gl.viewport(0, 0, _cw, _ch);
    }
  }

  /* ── Frame Loop ── */
  function frame(timestamp) {
    if (!_running || _destroyed) return;
    _rafId = requestAnimationFrame(frame);

    const elapsed = timestamp - _lastFrameTime;
    _lastFrameTime = timestamp;
    const dt = Math.min(elapsed / 1000, 0.06);

    _time += dt;

    // Smooth scroll velocity tracking
    const currentScrollY = window.scrollY || window.pageYOffset || 0;
    _targetScrollVel = currentScrollY - _prevScrollY;
    _prevScrollY = currentScrollY;
    _scrollVel += (_targetScrollVel - _scrollVel) * 0.15;
    _scrollY = currentScrollY;

    // Reactive mouse position tracking
    _mouseX += (_targetMouseX - _mouseX) * 0.18;
    _mouseY += (_targetMouseY - _mouseY) * 0.18;

    if (_isWebGL && _gl && _program) {
      _gl.useProgram(_program);
      _gl.uniform2f(_uniforms.resolution, _cw, _ch);
      _gl.uniform1f(_uniforms.time, _time);
      _gl.uniform1f(_uniforms.scroll, _scrollY / Math.max(1, _vh));
      _gl.uniform1f(_uniforms.scrollVel, _scrollVel);
      _gl.uniform2f(_uniforms.mouse, _mouseX, _mouseY);
      _gl.uniform1f(_uniforms.density, _density);

      _gl.drawArrays(_gl.TRIANGLES, 0, 6);
    } else {
      renderCanvas2D(dt);
    }
  }

  /* ── Event Handlers ── */
  function onPointerMove(e) {
    if (_vw > 0 && _vh > 0) {
      _targetMouseX = e.clientX / _vw;
      _targetMouseY = e.clientY / _vh;
    }
  }

  function onVisibilityChange() {
    if (_destroyed) return;
    if (document.hidden) {
      pause();
    } else {
      resume();
    }
  }

  function pause() {
    if (!_running) return;
    _running = false;
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  function resume() {
    if (_running || _destroyed) return;
    _running = true;
    _lastFrameTime = performance.now();
    _rafId = requestAnimationFrame(frame);
  }

  /* ── Public API ── */
  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (_canvas || _running) return;
    _destroyed = false;

    const existing = document.getElementById('heisenberg-smoke-canvas');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    _canvas = document.createElement('canvas');
    _canvas.id = 'heisenberg-smoke-canvas';
    _canvas.setAttribute('aria-hidden', 'true');

    // High performance styling: no expensive CSS blur filter
    const s = _canvas.style;
    s.position       = 'fixed';
    s.top            = '0';
    s.left           = '0';
    s.width          = '100vw';
    s.height         = '100vh';
    s.zIndex         = '1';
    s.pointerEvents  = 'none';
    s.opacity        = '0.88';
    s.transition     = 'opacity 1s ease';

    document.body.prepend(_canvas);

    _isWebGL = initWebGL();
    if (!_isWebGL) {
      initCanvas2D();
    }

    resize();

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    _running = true;
    _lastFrameTime = performance.now();
    _rafId = requestAnimationFrame(frame);
  }

  function destroy() {
    _destroyed = true;
    _running = false;
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibilityChange);

    if (_canvas && _canvas.parentNode) {
      _canvas.parentNode.removeChild(_canvas);
    }
    _canvas = null;
    _gl = null;
    _ctx2d = null;
    _program = null;
    _quadBuffer = null;
    _puffs2D = [];
    _sprite2D = null;
  }

  function setQuality(level) {
    if (CONFIG.resolutions[level]) {
      _quality = level;
      _resScale = CONFIG.resolutions[level];
      resize();
    }
  }

  function setDensity(val) {
    _density = Math.max(0, Math.min(2, val));
  }

  function triggerBurst(x, y) {
    _scrollVel += 30;
    if (x !== undefined && y !== undefined && _vw > 0 && _vh > 0) {
      _targetMouseX = x / _vw;
      _targetMouseY = y / _vh;
    }
  }

  return {
    init,
    destroy,
    setQuality,
    setDensity,
    triggerBurst,
    isWebGL: () => _isWebGL,
  };
})();
