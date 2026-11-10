/**
 * ScrollController — Cinematic scroll orchestrator for The Heisenberg Files.
 *
 * Manages all scroll-driven effects BELOW the hero section:
 *   • Staggered section-reveal animations (IntersectionObserver)
 *   • Scroll progress bar
 *   • Active nav highlighting
 *   • Back-to-top button
 *   • Parallax depth effects
 *   • Text mask (clip-path) reveals on h2 headings
 *   • Stat counter animations
 *   • Closing section zoom effect
 *   • Mobile navigation
 *   • Element tiles interaction
 *   • Timeline tabs interaction
 *   • Cursor spotlight
 *   • Footer year
 *
 * Usage:
 *   <script src="scroll-controller.js" defer></script>
 *   <script>document.addEventListener('DOMContentLoaded', () => ScrollController.init());</script>
 *
 * No external dependencies.
 */
;(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Utilities                                                         */
  /* ------------------------------------------------------------------ */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isFinePointer = () =>
    window.matchMedia('(pointer: fine)').matches;

  /* ------------------------------------------------------------------ */
  /*  State                                                              */
  /* ------------------------------------------------------------------ */

  let _initialized = false;
  let _rafId = 0;
  let _scrollY = 0;
  let _ticking = false;
  let _tabHidden = false;
  let _lastSmokeDensity = -1;

  /* Cached DOM refs (populated on init) */
  const dom = {};

  /* Cleanup buckets */
  const _observers = [];
  const _listeners = [];

  /** Register an event listener so we can tear it down later. */
  function listen(target, evt, fn, opts) {
    target.addEventListener(evt, fn, opts);
    _listeners.push({ target, evt, fn, opts });
  }

  /* ------------------------------------------------------------------ */
  /*  1. Section Reveal Animations                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Replace the basic .reveal → .is-visible toggle with a richer
   * staggered child-reveal.  Each `.reveal` container's direct visual
   * children are individually animated in sequence.
   */
  function initSectionReveals() {
    const reduced = prefersReducedMotion();
    const revealItems = $$('.reveal');

    if (reduced) {
      /* Skip animation — make everything visible immediately */
      revealItems.forEach(el => {
        el.classList.add('is-visible');
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    /* Prepare stagger children ------------------------------------------------ */
    revealItems.forEach(container => {
      /* Identify children to stagger.  We pick immediate element children
         that are NOT purely decorative (aria-hidden wrappers are fine if
         they contain visual content).  If a container has zero qualifying
         children we animate the container itself. */
      const kids = [...container.children].filter(
        c => c.nodeType === 1 && getComputedStyle(c).display !== 'none'
      );

      if (kids.length > 1) {
        kids.forEach((child, i) => {
          child.classList.add('sc-stagger-child');
          child.style.transitionDelay = `${i * 95}ms`;
        });
        container.dataset.scStagger = 'true';
      }
    });

    /* Observe ----------------------------------------------------------------- */
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add('is-visible');
          observer.unobserve(el);

          /* Once the stagger has played, release the children so buttons and
             tiles get their own hover/press transitions back (the stagger
             class overrides transform + transition and adds a delay). */
          if (el.dataset.scStagger === 'true') {
            const kids = [...el.children].filter(c => c.classList.contains('sc-stagger-child'));
            setTimeout(() => {
              kids.forEach(c => {
                c.classList.remove('sc-stagger-child');
                c.style.transitionDelay = '';
              });
            }, kids.length * 95 + 800);
          }
        });
      },
      { threshold: 0.10, rootMargin: '0px 0px -36px 0px' }
    );

    revealItems.forEach(item => observer.observe(item));
    _observers.push(observer);
  }

  /* ------------------------------------------------------------------ */
  /*  2. Scroll Progress Bar                                             */
  /* ------------------------------------------------------------------ */

  function updateProgressBar() {
    if (!dom.progressBar) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 0 ? (_scrollY / maxScroll) * 100 : 0;
    dom.progressBar.style.width = `${pct.toFixed(2)}%`;
  }

  /* ------------------------------------------------------------------ */
  /*  3. Active Nav Highlighting                                         */
  /* ------------------------------------------------------------------ */

  const SECTION_IDS = ['story', 'elements', 'quote', 'timeline'];

  function updateActiveNav() {
    if (!dom.navLinks || !dom.navLinks.length) return;
    const marker = _scrollY + window.innerHeight * 0.35;
    let current = '';
    SECTION_IDS.forEach(id => {
      const sec = document.getElementById(id);
      if (sec && sec.offsetTop <= marker) current = id;
    });
    dom.navLinks.forEach(link =>
      link.classList.toggle('active', link.getAttribute('href') === `#${current}`)
    );
  }

  /* ------------------------------------------------------------------ */
  /*  4. Back-to-Top Button                                              */
  /* ------------------------------------------------------------------ */

  function updateBackToTop() {
    if (!dom.backToTop) return;
    dom.backToTop.classList.toggle('visible', _scrollY > 600);
  }

  function scrollToTop() {
    if (window.AudioEngine && window.AudioEngine.playWhoosh) {
      window.AudioEngine.playWhoosh();
    }
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function initBackToTop() {
    /* "#top" points at the fixed header, which the browser can't scroll to,
       so every top-link (logo, closing button, footer) is handled here. */
    $$('a[href="#top"]').forEach(link =>
      listen(link, 'click', e => {
        e.preventDefault();
        scrollToTop();
      })
    );

    if (!dom.backToTop) return;
    listen(dom.backToTop, 'click', scrollToTop);
  }

  /* ------------------------------------------------------------------ */
  /*  5. Parallax Depth Effects                                          */
  /* ------------------------------------------------------------------ */

  function updateParallax() {
    if (prefersReducedMotion()) return;

    /* Quote backdrop — slow vertical parallax */
    if (dom.quoteBackdrop && dom.quoteSection) {
      const rect = dom.quoteSection.getBoundingClientRect();
      const vh = window.innerHeight;
      /* Only process when section is near viewport */
      if (rect.bottom > -vh && rect.top < vh * 2) {
        const travel = rect.top / vh; // ~1 when above, ~0 when centered, negative below
        const ty = travel * 0.3 * vh * -1;
        dom.quoteBackdrop.style.transform = `rotate(-8deg) translateY(${ty.toFixed(1)}px)`;
      }
    }

    /* Quote decorative pseudo-elements via CSS custom property */
    if (dom.quoteSection) {
      const rect = dom.quoteSection.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom > 0 && rect.top < vh) {
        const ratio = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
        dom.quoteSection.style.setProperty('--parallax-ratio', ratio.toFixed(4));
      }
    }

    /* Section backgrounds — very subtle depth (section-shell containers) */
    dom.sectionShells.forEach(shell => {
      const rect = shell.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom > 0 && rect.top < vh) {
        const ratio = (rect.top / vh - 0.5) * 0.08;
        shell.style.setProperty('--bg-shift', `${(ratio * vh).toFixed(1)}px`);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  6. Text Mask Reveals for h2 Headings                               */
  /* ------------------------------------------------------------------ */

  function initTextMaskReveals() {
    if (prefersReducedMotion()) return;

    /* We wrap each h2 (below the hero) in an overflow-hidden container
       and animate a clip-path from right-to-left reveal. */
    const headings = $$('main h2').filter(
      h => !h.closest('.hero')
    );

    headings.forEach(h2 => {
      h2.classList.add('sc-heading-mask');
    });

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('sc-heading-revealed');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -10px 0px' }
    );

    headings.forEach(h => observer.observe(h));
    _observers.push(observer);
  }

  /* ------------------------------------------------------------------ */
  /*  7. Stat Counter Animation                                          */
  /* ------------------------------------------------------------------ */

  function animateCounter(el, target, duration) {
    const isFloat = String(target).includes('.');
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const raw = clamp(elapsed / duration, 0, 1);
      /* ease-out cubic */
      const eased = 1 - Math.pow(1 - raw, 3);
      const current = eased * target;

      if (isFloat) {
        el.innerHTML = current.toFixed(1) + '<span class="tiny">%</span>';
      } else {
        const val = Math.round(current);
        el.textContent = val < 10 ? '0' + val : String(val);
      }

      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        /* Final value — restore original inner HTML exactly */
        if (isFloat) {
          el.innerHTML = target.toFixed(1) + '<span class="tiny">%</span>';
        } else {
          el.textContent = target < 10 ? '0' + target : String(target);
        }
      }
    }

    requestAnimationFrame(tick);
  }

  function initStatCounters() {
    const strip = $('.stat-strip');
    if (!strip) return;

    const reduced = prefersReducedMotion();
    const statValues = $$('.stat-value', strip);

    if (reduced) return; /* Values are already in the HTML */

    /* Reset displayed values to 0 */
    statValues.forEach(sv => {
      const raw = sv.getAttribute('data-count');
      if (raw == null) return; /* purity cell has no data-count */
      sv.textContent = '00';
    });

    /* The purity cell (99.1%) — set to 00.0% initially */
    const purityCell = statValues.find(sv => !sv.hasAttribute('data-count'));
    if (purityCell) {
      purityCell.innerHTML = '00.0<span class="tiny">%</span>';
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);

          /* Animate each stat */
          statValues.forEach(sv => {
            const raw = sv.getAttribute('data-count');
            if (raw != null) {
              animateCounter(sv, parseInt(raw, 10), 1500);
            }
          });

          /* Purity counter (99.1) */
          if (purityCell) {
            animateCounter(purityCell, 99.1, 1500);
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(strip);
    _observers.push(observer);
  }

  /* ------------------------------------------------------------------ */
  /*  8. Closing Section Zoom Effect                                     */
  /* ------------------------------------------------------------------ */

  function updateClosingZoom() {
    if (prefersReducedMotion() || !dom.closingHeading) return;

    const section = dom.closingSection;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight;

    if (rect.bottom > 0 && rect.top < vh) {
      const ratio = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      /* Scale from 0.88 → 1.0 as user scrolls into view */
      const scale = lerp(0.88, 1, ratio);
      dom.closingHeading.style.transform = `scale(${scale.toFixed(4)})`;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  9. Unified Scroll Handler (rAF-throttled)                         */
  /* ------------------------------------------------------------------ */

  function onScrollFrame() {
    _ticking = false;
    if (_tabHidden) return;

    /* Batch DOM reads */
    _scrollY = window.scrollY || window.pageYOffset;

    /* Batch DOM writes */
    dom.siteHeader?.classList.toggle('is-scrolled', _scrollY > 50);
    updateProgressBar();
    updateActiveNav();
    updateBackToTop();
    updateParallax();
    updateClosingZoom();

    /* Modulate atmospheric smoke density (light, subtle, and responsive) */
    if (window.SmokeEngine && window.SmokeEngine.setDensity) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? _scrollY / maxScroll : 0;
      let d = 0.62;
      if (progress > 0.85) d = 0.80;
      else if (progress > 0.45 && progress < 0.65) d = 0.72;
      if (Math.abs(d - _lastSmokeDensity) > 0.01) {
        _lastSmokeDensity = d;
        window.SmokeEngine.setDensity(d);
      }
    }
  }

  function requestScrollUpdate() {
    if (!_ticking) {
      _rafId = requestAnimationFrame(onScrollFrame);
      _ticking = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Tab Visibility                                                     */
  /* ------------------------------------------------------------------ */

  function onVisibilityChange() {
    _tabHidden = document.hidden;
    if (!_tabHidden) {
      /* Resumed — sync immediately */
      requestScrollUpdate();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  10. Mobile Navigation                                              */
  /* ------------------------------------------------------------------ */

  function initMobileNav() {
    const toggle = dom.menuToggle;
    const nav = dom.primaryNav;
    if (!toggle || !nav) return;

    listen(toggle, 'click', () => {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute(
        'aria-label',
        isOpen ? 'Close navigation' : 'Open navigation'
      );
    });

    const closeNav = () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
    };

    $$('a', nav).forEach(link => listen(link, 'click', closeNav));

    listen(document, 'keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav();
        toggle.focus();
      }
    });
    listen(document, 'pointerdown', e => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !toggle.contains(e.target)) closeNav();
    });
    listen(window, 'resize', () => {
      if (window.innerWidth > 760 && nav.classList.contains('is-open')) closeNav();
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /*  11. Element Tiles                                                  */
  /* ------------------------------------------------------------------ */

  const ELEMENTS_DATA = {
    br: {
      symbol: 'Br',
      title: 'A name hidden in plain sight.',
      description:
        'Bromine and Barium. Two symbols that break a title into its most recognisable pieces — a quiet nod to the chemistry at the heart of the story.',
    },
    ba: {
      symbol: 'Ba',
      title: 'The other half of the formula.',
      description:
        'Barium completes the visual wordplay. The periodic table becomes more than a classroom reference: it is the signature of a man whose old life never quite disappears.',
    },
  };

  function initElementTiles() {
    const buttons = $$('.element-tile');
    if (!buttons.length) return;

    buttons.forEach(btn =>
      listen(btn, 'click', () => {
        if (window.AudioEngine && window.AudioEngine.playTileClick) {
          window.AudioEngine.playTileClick();
        }
        buttons.forEach(b =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        const data = ELEMENTS_DATA[btn.dataset.element];
        if (!data) return;
        const sym = $('#element-symbol');
        const title = $('#element-title');
        const desc = $('#element-description');
        if (sym) sym.textContent = data.symbol;
        if (title) title.textContent = data.title;
        if (desc) desc.textContent = data.description;
      })
    );
  }

  /* ------------------------------------------------------------------ */
  /*  12. Timeline Tabs                                                  */
  /* ------------------------------------------------------------------ */

  const ERAS = [
    {
      label: 'THE ORDINARY LIFE',
      title: 'A quiet man<br>with a breaking point.',
      description:
        'A gifted chemist turned high-school teacher faces a future he never planned for. The first step feels like survival — until it becomes something else.',
      core: 'W.W.',
      code: '001',
    },
    {
      label: 'THE FIRST REACTION',
      title: 'The chemistry<br>gets personal.',
      description:
        'A partnership is formed in the desert. What begins as a desperate side path starts to demand more than either man expected.',
      core: 'C₁₀',
      code: '024',
    },
    {
      label: 'THE EMPIRE',
      title: 'A name becomes<br>a warning.',
      description:
        'Precision turns into control. The work expands, the stakes rise, and the man behind the operation becomes harder to separate from the legend.',
      core: 'He',
      code: '056',
    },
    {
      label: 'THE AFTERMATH',
      title: 'Every reaction<br>leaves a residue.',
      description:
        'The choices have run their course. What remains is a complicated legacy, and the truth of what one person can become.',
      core: '∞',
      code: '099',
    },
  ];

  function initTimelineTabs() {
    const tabs = $$('.era-tab');
    if (!tabs.length) return;

    tabs.forEach((tab, index) =>
      listen(tab, 'click', () => {
        if (window.AudioEngine && window.AudioEngine.playTabClick) {
          window.AudioEngine.playTabClick();
        }
        tabs.forEach((item, i) => {
          const active = i === index;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-selected', String(active));
          item.tabIndex = active ? 0 : -1;
        });

        const era = ERAS[index];
        if (!era) return;

        const panel = $('#era-panel');
        if (panel) panel.setAttribute('aria-labelledby', tab.id);

        const num = $('#era-number');
        if (num) num.innerHTML = `0${index + 1}<span>/04</span>`;

        const label = $('#era-label');
        if (label) label.textContent = era.label;

        const title = $('#era-title');
        if (title) title.innerHTML = era.title;

        const desc = $('#era-description');
        if (desc) desc.textContent = era.description;

        const core = $('#visual-core');
        if (core) core.textContent = era.core;

        const code = $('#visual-code');
        if (code) code.textContent = era.code;
      })
    );
  }

  /* ------------------------------------------------------------------ */
  /*  13. Cursor Spotlight                                               */
  /* ------------------------------------------------------------------ */

  function initCursorSpotlight() {
    if (prefersReducedMotion() || !isFinePointer()) return;

    listen(
      window,
      'pointermove',
      e => {
        document.documentElement.style.setProperty(
          '--pointer-x',
          `${e.clientX}px`
        );
        document.documentElement.style.setProperty(
          '--pointer-y',
          `${e.clientY}px`
        );
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------------ */
  /*  14. Footer Year                                                    */
  /* ------------------------------------------------------------------ */

  function initYear() {
    const el = $('#year');
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ------------------------------------------------------------------ */
  /*  CSS Injection — runtime styles for scroll-controller features      */
  /* ------------------------------------------------------------------ */

  function injectStyles() {
    if ($('#sc-runtime-styles')) return;

    const style = document.createElement('style');
    style.id = 'sc-runtime-styles';
    style.textContent = `
/* ---- Stagger children ------------------------------------------------- */
.sc-stagger-child {
  opacity: 0;
  transform: translateY(40px);
  transition:
    opacity 0.7s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.is-visible > .sc-stagger-child {
  opacity: 1;
  transform: translateY(0);
}

/* ---- Heading clip-path mask reveal ------------------------------------ */
.sc-heading-mask {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.9s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sc-heading-mask.sc-heading-revealed,
.is-visible .sc-heading-mask,
.is-visible.sc-heading-mask {
  clip-path: inset(0 0% 0 0);
}

/* ---- Closing zoom origin ---------------------------------------------- */
.closing-inner h2 {
  transform-origin: center center;
  will-change: transform;
}

/* ---- Reduced-motion overrides ----------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .sc-stagger-child {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
  .sc-heading-mask {
    clip-path: none !important;
    transition: none !important;
  }
  .closing-inner h2 {
    transform: none !important;
  }
}
`;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  function init() {
    if (_initialized) return;
    _initialized = true;

    /* Inject runtime styles */
    injectStyles();

    /* Cache DOM references */
    dom.siteHeader = $('.site-header');
    dom.progressBar = $('#progress-bar');
    dom.backToTop = $('#back-to-top');
    dom.navLinks = $$('.primary-nav a');
    dom.menuToggle = $('#menu-toggle');
    dom.primaryNav = $('#primary-nav');
    dom.quoteSection = $('.quote-section');
    dom.quoteBackdrop = $('.quote-backdrop');
    dom.closingSection = $('.closing-section');
    dom.closingHeading = $('.closing-inner h2');
    dom.sectionShells = $$('.section-shell');

    /* Feature modules */
    initSectionReveals();
    initTextMaskReveals();
    initStatCounters();
    initBackToTop();
    initMobileNav();
    initElementTiles();
    initTimelineTabs();
    initCursorSpotlight();
    initYear();

    /* Single scroll listener */
    listen(window, 'scroll', requestScrollUpdate, { passive: true });
    listen(window, 'resize', requestScrollUpdate, { passive: true });
    listen(document, 'visibilitychange', onVisibilityChange);

    /* Initial paint */
    _scrollY = window.scrollY || window.pageYOffset;
    onScrollFrame();
  }

  function destroy() {
    if (!_initialized) return;

    /* Cancel pending rAF */
    if (_rafId) cancelAnimationFrame(_rafId);

    /* Disconnect all observers */
    _observers.forEach(obs => obs.disconnect());
    _observers.length = 0;

    /* Remove all registered listeners */
    _listeners.forEach(({ target, evt, fn, opts }) =>
      target.removeEventListener(evt, fn, opts)
    );
    _listeners.length = 0;

    /* Remove injected styles */
    const runtimeStyle = $('#sc-runtime-styles');
    if (runtimeStyle) runtimeStyle.remove();

    /* Remove runtime classes */
    $$('.sc-stagger-child').forEach(el => {
      el.classList.remove('sc-stagger-child');
      el.style.transitionDelay = '';
    });
    $$('.sc-heading-mask').forEach(el =>
      el.classList.remove('sc-heading-mask', 'sc-heading-revealed')
    );
    $$('[data-sc-stagger]').forEach(el => delete el.dataset.scStagger);

    /* Reset inline styles set by parallax / zoom */
    if (dom.quoteBackdrop) dom.quoteBackdrop.style.transform = '';
    if (dom.closingHeading) dom.closingHeading.style.transform = '';
    dom.sectionShells?.forEach(s => s.style.removeProperty('--bg-shift'));

    /* Clear cached refs */
    Object.keys(dom).forEach(k => delete dom[k]);

    _initialized = false;
    _ticking = false;
    _tabHidden = false;
  }

  /* Expose globally */
  window.ScrollController = { init, destroy };
})();
