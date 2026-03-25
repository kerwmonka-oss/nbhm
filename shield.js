/* ============================================
   Velora Shield — Client-Side Protection
   Auto-runs on page load. Include before </body>.
   ============================================ */
(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // 1) Disable Right-Click (Context Menu)
  // ──────────────────────────────────────────────
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // ──────────────────────────────────────────────
  // 2) Disable Keyboard Shortcuts
  // ──────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl‑based shortcuts
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();

      // Ctrl+Shift combos: I, J, C (DevTools)
      if (e.shiftKey && ['i', 'j', 'c'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+U (View Source), Ctrl+S (Save), Ctrl+A (Select All),
      // Ctrl+C (Copy), Ctrl+X (Cut), Ctrl+P (Print)
      if (['u', 's', 'a', 'c', 'x', 'p'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
  }, true);

  // ──────────────────────────────────────────────
  // 3) Prevent Copying / Selecting / Dragging
  // ──────────────────────────────────────────────
  document.addEventListener('copy', function (e) {
    e.preventDefault();
    return false;
  }, true);

  document.addEventListener('cut', function (e) {
    e.preventDefault();
    return false;
  }, true);

  document.addEventListener('selectstart', function (e) {
    e.preventDefault();
    return false;
  }, true);

  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
    return false;
  }, true);

  // CSS: disable text selection and pointer-drag
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }
    /* Allow typing in inputs/selects */
    input, textarea, select {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      user-select: text !important;
    }
    img {
      -webkit-user-drag: none !important;
      user-drag: none !important;
      pointer-events: auto;
    }
  `;
  document.head.appendChild(style);

  // ──────────────────────────────────────────────
  // 4) DevTools Detection
  // ──────────────────────────────────────────────
  const shield = {
    warned: false,
    overlay: null,

    // Show warning overlay
    showWarning() {
      if (this.overlay) return;
      this.overlay = document.createElement('div');
      this.overlay.id = 'shield-overlay';
      this.overlay.innerHTML = `
        <div style="
          position:fixed;inset:0;z-index:999999;
          background:rgba(0,0,0,0.97);
          display:flex;flex-direction:column;
          align-items:center;justify-content:center;
          font-family:'Inter',sans-serif;color:#fff;
          text-align:center;padding:32px;
        ">
          <div style="font-size:48px;margin-bottom:16px;">🛡️</div>
          <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:10px;color:#e50914;">
            Access Denied
          </h2>
          <p style="font-size:0.9rem;color:#aaa;max-width:420px;line-height:1.7;">
            Developer Tools detected. Please close DevTools to continue using Velora.
          </p>
        </div>
      `;
      document.body.appendChild(this.overlay);
    },

    // Remove warning overlay
    hideWarning() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
    },

    // Detection Method 1: Window size difference
    checkSizeDiff() {
      const widthDiff = window.outerWidth - window.innerWidth > 160;
      const heightDiff = window.outerHeight - window.innerHeight > 160;
      return widthDiff || heightDiff;
    },

    // Detection Method 2: debugger timing
    checkDebugger() {
      const start = performance.now();
      // The debugger statement pauses execution when DevTools is open
      // eslint-disable-next-line no-debugger
      debugger;
      return performance.now() - start > 100;
    },

    // Combined detection loop
    startDetection() {
      setInterval(() => {
        if (this.checkSizeDiff()) {
          this.showWarning();
        } else {
          this.hideWarning();
        }
      }, 1000);
    },
  };

  // Start DevTools detection when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => shield.startDetection());
  } else {
    shield.startDetection();
  }

  // ──────────────────────────────────────────────
  // 5) Console warning
  // ──────────────────────────────────────────────
  const warnStyle = 'color:#e50914;font-size:24px;font-weight:bold;';
  const msgStyle = 'color:#aaa;font-size:14px;';
  console.log('%c⚠ STOP!', warnStyle);
  console.log(
    '%cThis browser feature is for developers. If someone told you to copy-paste something here, it is a scam.',
    msgStyle
  );

})();
