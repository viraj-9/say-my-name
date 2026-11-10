/**
 * CrystalEngine removed per user request.
 * Retained as a safe no-op stub for backward compatibility.
 */
;(function () {
  'use strict';
  function init() {
    const el = document.getElementById('crystal-canvas');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function destroy() {
    init();
  }
  window.CrystalEngine = { init, destroy };
})();
