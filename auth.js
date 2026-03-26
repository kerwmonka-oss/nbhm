/* ============================================
   Velora Auth — Supabase Login Gate
   Strict single-device enforcement per user.
   Include BEFORE app.js in every HTML page.
   ============================================ */
(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // Supabase Configuration
  // ──────────────────────────────────────────────
  const SUPABASE_URL = 'https://zzxxtgevzofgabemgsov.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_XYsVFaiV6OWr8j5vGe06tw_2ggjivNa';
  const AUTH_TABLE = 'users';

  // ──────────────────────────────────────────────
  // Local Storage Keys
  // ──────────────────────────────────────────────
  const SESSION_STATUS_KEY = 'velora_auth_status';
  const SESSION_EMAIL_KEY = 'velora_auth_email';
  const REMEMBER_KEY = 'velora_auth_remember';
  const SESSION_ID_KEY = 'velora_session_id';      // persisted in localStorage for cross-tab sharing

  // ──────────────────────────────────────────────
  // Session ID — unique per device
  // Persists in localStorage so ALL tabs/windows on
  // the same device share the exact same session_id.
  // ──────────────────────────────────────────────
  function getOrCreateSessionId() {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = generateSessionId();
      localStorage.setItem(SESSION_ID_KEY, id);
      console.log('[Auth] New session_id generated:', id);
    }
    return id;
  }

  function generateSessionId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // Fallback for browsers without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ──────────────────────────────────────────────
  // Network Constants
  // ──────────────────────────────────────────────
  const AUTH_TIMEOUT = 10000;
  const AUTH_RETRY_DELAY = 1000;
  const SESSION_CHECK_INTERVAL = 30000; // validate session every 30 seconds

  // ──────────────────────────────────────────────
  // Supabase Helpers — GET and PATCH with retry
  // ──────────────────────────────────────────────
  const supabaseHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
  };

  async function supabaseRequest(url, options, maxAttempts = 2) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT);

      try {
        console.log(`[Auth] ${options.method || 'GET'} attempt ${attempt}: ${url}`);
        const res = await fetch(url, {
          ...options,
          headers: { ...supabaseHeaders, ...(options.headers || {}) },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log(`[Auth] Response status: ${res.status}`);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error(`[Auth] HTTP ${res.status}:`, errText);

          if (res.status === 401 || res.status === 403) {
            return { ok: false, error: 'server', message: 'Server configuration error' };
          }
          if (res.status === 404) {
            return { ok: false, error: 'server', message: 'Database configuration error' };
          }
          throw new Error(`HTTP_${res.status}`);
        }

        const data = await res.json();
        return { ok: true, data };
      } catch (err) {
        clearTimeout(timeoutId);
        const msg = err.name === 'AbortError' ? 'Timeout' : err.message;
        console.warn(`[Auth] ${msg} (attempt ${attempt})`);

        if (attempt < maxAttempts) {
          console.log(`[Auth] Retrying in ${AUTH_RETRY_DELAY}ms...`);
          await new Promise(r => setTimeout(r, AUTH_RETRY_DELAY));
        }
      }
    }

    console.error('[Auth] All attempts failed');
    return { ok: false, error: 'network', message: 'Network connection error' };
  }

  // ──────────────────────────────────────────────
  // Core Auth Logic — Strict Single-Device Enforcement
  // ──────────────────────────────────────────────

  /**
   * Attempt login:
   * 1. Check if email exists in the users table
   * 2. Check session_id in DB:
   *    - null → allow login, claim session
   *    - matches this device's session_id → allow (same device re-login)
   *    - different → DENY (another device is active)
   */
  async function attemptLogin(email) {
    const sessionId = getOrCreateSessionId();

    // Step 1: Fetch user row including session_id
    const url = `${SUPABASE_URL}/rest/v1/${AUTH_TABLE}?email=eq.${encodeURIComponent(email)}&select=email,session_id`;
    const result = await supabaseRequest(url, { method: 'GET' });

    if (!result.ok) return result;

    if (!result.data || result.data.length === 0) {
      return { ok: false, error: 'not_found', message: 'Email not registered' };
    }

    const user = result.data[0];
    const dbSessionId = user.session_id;

    console.log(`[Auth] DB session_id: ${dbSessionId || '(null)'}`);
    console.log(`[Auth] This device session_id: ${sessionId}`);

    // Step 2: Strict single-device constraint
    if (dbSessionId && dbSessionId !== sessionId) {
      // ❌ Another device is active — DENY access
      console.warn('[Auth] Login DENIED — another device has an active session');
      return {
        ok: false,
        error: 'device_conflict',
        message: 'This account is already in use on another device. Please log out first.',
      };
    }

    // Step 3: session_id is NULL or matches → claim/re-claim the session
    const patchUrl = `${SUPABASE_URL}/rest/v1/${AUTH_TABLE}?email=eq.${encodeURIComponent(email)}`;
    const patchResult = await supabaseRequest(patchUrl, {
      method: 'PATCH',
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!patchResult.ok) {
      console.error('[Auth] Failed to claim session in DB');
      return { ok: false, error: 'server', message: 'Could not establish session. Try again.' };
    }

    console.log('[Auth] Session claimed successfully');
    return { ok: true };
  }

  /**
   * Release session_id in Supabase (on logout).
   * Sets session_id to NULL so another device can login.
   */
  async function releaseSession(email) {
    if (!email) return;

    const url = `${SUPABASE_URL}/rest/v1/${AUTH_TABLE}?email=eq.${encodeURIComponent(email)}`;
    const result = await supabaseRequest(url, {
      method: 'PATCH',
      body: JSON.stringify({ session_id: null }),
    }, 1); // single attempt — don't block the user

    if (result.ok) {
      console.log('[Auth] Session released in DB (session_id set to NULL)');
    } else {
      console.warn('[Auth] Could not release session in DB (non-blocking)');
    }
  }

  /**
   * Validate that this device still owns the active session.
   * Called on page load AND periodically while user is on the page.
   *
   * Rules:
   * - DB session_id matches this device → VALID
   * - DB session_id is NULL → session was cleared (admin/logout), reclaim it
   * - DB session_id is different → INVALID (another device logged in)
   * - Network error → allow offline access (don't force logout)
   */
  async function validateSession(email) {
    const sessionId = getOrCreateSessionId();
    const url = `${SUPABASE_URL}/rest/v1/${AUTH_TABLE}?email=eq.${encodeURIComponent(email)}&select=session_id`;
    const result = await supabaseRequest(url, { method: 'GET' }, 1);

    if (!result.ok) {
      // Network error — don't force logout, allow offline usage
      console.warn('[Auth] Session validation failed (network). Allowing offline access.');
      return true;
    }

    if (!result.data || result.data.length === 0) {
      // User was deleted from DB
      console.warn('[Auth] User no longer exists in DB');
      return false;
    }

    const dbSessionId = result.data[0].session_id;

    if (dbSessionId === sessionId) {
      console.log('[Auth] Session valid — session_id matches');
      return true;
    }

    if (!dbSessionId) {
      // Session was cleared (e.g., admin cleared it) — reclaim it
      console.log('[Auth] Session was cleared. Reclaiming...');
      const patchUrl = `${SUPABASE_URL}/rest/v1/${AUTH_TABLE}?email=eq.${encodeURIComponent(email)}`;
      await supabaseRequest(patchUrl, {
        method: 'PATCH',
        body: JSON.stringify({ session_id: sessionId }),
      }, 1);
      return true;
    }

    // Another device took over — session is invalid
    console.warn('[Auth] Session INVALIDATED — another device took over');
    return false;
  }

  // ──────────────────────────────────────────────
  // Periodic Session Validation
  // Checks every 30s that this device still owns the session.
  // If another device logged in, force-logout immediately.
  // ──────────────────────────────────────────────
  let sessionCheckTimer = null;

  function startSessionMonitor() {
    stopSessionMonitor(); // clear any existing timer

    sessionCheckTimer = setInterval(async () => {
      const email = Session.getEmail();
      if (!email || !Session.isLoggedIn()) {
        stopSessionMonitor();
        return;
      }

      console.log('[Auth] Periodic session check...');
      const valid = await validateSession(email);

      if (!valid) {
        stopSessionMonitor();
        forceLogout();
      }
    }, SESSION_CHECK_INTERVAL);

    console.log(`[Auth] Session monitor started (every ${SESSION_CHECK_INTERVAL / 1000}s)`);
  }

  function stopSessionMonitor() {
    if (sessionCheckTimer) {
      clearInterval(sessionCheckTimer);
      sessionCheckTimer = null;
      console.log('[Auth] Session monitor stopped');
    }
  }

  // ──────────────────────────────────────────────
  // Session Management (localStorage + sessionStorage)
  // ──────────────────────────────────────────────
  const Session = {
    isLoggedIn() {
      if (localStorage.getItem(SESSION_STATUS_KEY) === 'authenticated') return true;
      if (sessionStorage.getItem(SESSION_STATUS_KEY) === 'authenticated') return true;
      return false;
    },

    save(email, remember) {
      if (remember) {
        localStorage.setItem(SESSION_STATUS_KEY, 'authenticated');
        localStorage.setItem(SESSION_EMAIL_KEY, email);
        localStorage.setItem(REMEMBER_KEY, 'true');
      } else {
        sessionStorage.setItem(SESSION_STATUS_KEY, 'authenticated');
        sessionStorage.setItem(SESSION_EMAIL_KEY, email);
        localStorage.removeItem(SESSION_STATUS_KEY);
        localStorage.removeItem(SESSION_EMAIL_KEY);
        localStorage.removeItem(REMEMBER_KEY);
      }
      // session_id is ALWAYS in localStorage so all tabs share it
    },

    getEmail() {
      return localStorage.getItem(SESSION_EMAIL_KEY) || sessionStorage.getItem(SESSION_EMAIL_KEY) || '';
    },

    getSessionId() {
      return localStorage.getItem(SESSION_ID_KEY) || '';
    },

    clear() {
      localStorage.removeItem(SESSION_STATUS_KEY);
      localStorage.removeItem(SESSION_EMAIL_KEY);
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
      sessionStorage.removeItem(SESSION_STATUS_KEY);
      sessionStorage.removeItem(SESSION_EMAIL_KEY);
      // session_id is removed on logout so a fresh one is generated on next login
    }
  };

  // ──────────────────────────────────────────────
  // Email Validation
  // ──────────────────────────────────────────────
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ──────────────────────────────────────────────
  // Login Gate UI
  // ──────────────────────────────────────────────
  const LoginGate = {
    overlay: null,
    emailInput: null,
    rememberCheckbox: null,
    errorBox: null,
    submitBtn: null,
    btnText: null,
    btnSpinner: null,

    create() {
      this.overlay = document.createElement('div');
      this.overlay.id = 'authOverlay';
      this.overlay.className = 'auth-overlay';

      this.overlay.innerHTML = `
        <div class="auth-modal" id="authModal">
          <div class="auth-modal__glow"></div>

          <div class="auth-modal__logo">
            <svg viewBox="0 0 32 32" fill="currentColor">
              <path d="M4 4h24v24H4V4zm3 3v18h18V7H7zm4 4l10 5-10 5V11z"/>
            </svg>
            <span>Velora</span>
          </div>

          <h2 class="auth-modal__title">Welcome Back</h2>
          <p class="auth-modal__subtitle">Sign in to access movies & TV shows</p>

          <form class="auth-modal__form" id="authForm" autocomplete="off">
            <div class="auth-field" id="authField">
              <div class="auth-field__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <input
                type="email"
                id="authEmail"
                class="auth-field__input"
                placeholder="Enter your email address"
                required
                autocomplete="email"
                spellcheck="false"
              />
              <div class="auth-field__focus-bar"></div>
            </div>

            <div class="auth-error" id="authError" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span id="authErrorText"></span>
            </div>

            <label class="auth-remember" for="authRemember">
              <input type="checkbox" id="authRemember" class="auth-remember__checkbox" />
              <span class="auth-remember__custom"></span>
              <span class="auth-remember__label">Remember Me</span>
            </label>

            <button type="submit" class="auth-btn" id="authSubmit">
              <span class="auth-btn__text" id="authBtnText">Enter</span>
              <div class="auth-btn__spinner" id="authBtnSpinner"></div>
              <svg class="auth-btn__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </form>

          <p class="auth-modal__footer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Secure single-device access
          </p>
        </div>
      `;

      document.body.appendChild(this.overlay);

      this.emailInput = document.getElementById('authEmail');
      this.rememberCheckbox = document.getElementById('authRemember');
      this.errorBox = document.getElementById('authError');
      this.submitBtn = document.getElementById('authSubmit');
      this.btnText = document.getElementById('authBtnText');
      this.btnSpinner = document.getElementById('authBtnSpinner');

      this.bindEvents();

      requestAnimationFrame(() => {
        this.overlay.classList.add('auth-overlay--visible');
      });
    },

    bindEvents() {
      const form = document.getElementById('authForm');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });

      this.emailInput.addEventListener('input', () => {
        this.hideError();
        document.getElementById('authField').classList.remove('auth-field--error');
      });

      this.emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleLogin();
        }
      });
    },

    async handleLogin() {
      const email = this.emailInput.value.trim();
      const remember = this.rememberCheckbox.checked;
      const field = document.getElementById('authField');

      this.hideError();
      field.classList.remove('auth-field--error');

      if (!email) {
        this.showError('Please enter your email address');
        field.classList.add('auth-field--error');
        this.emailInput.focus();
        return;
      }

      if (!isValidEmail(email)) {
        this.showError('Invalid email format');
        field.classList.add('auth-field--error');
        this.emailInput.focus();
        return;
      }

      this.setLoading(true);

      // Attempt login with strict single-device check
      const result = await attemptLogin(email);

      if (result.ok) {
        // ✅ Login approved — save session locally
        Session.save(email, remember);
        this.grantAccess();
      } else if (result.error === 'not_found') {
        // ❌ Email not in database
        this.setLoading(false);
        this.showError(result.message);
        field.classList.add('auth-field--error');
        this.emailInput.focus();
      } else if (result.error === 'device_conflict') {
        // 🚫 Another device is active — strict deny
        this.setLoading(false);
        this.showError(result.message);
      } else {
        // ⚠️ Network or server error
        this.setLoading(false);
        this.showError(result.message);
      }
    },

    showError(message) {
      document.getElementById('authErrorText').textContent = message;
      this.errorBox.classList.add('auth-error--visible');
    },

    hideError() {
      this.errorBox.classList.remove('auth-error--visible');
    },

    setLoading(loading) {
      if (loading) {
        this.submitBtn.classList.add('auth-btn--loading');
        this.submitBtn.disabled = true;
        this.emailInput.disabled = true;
      } else {
        this.submitBtn.classList.remove('auth-btn--loading');
        this.submitBtn.disabled = false;
        this.emailInput.disabled = false;
      }
    },

    grantAccess() {
      this.submitBtn.classList.remove('auth-btn--loading');
      this.submitBtn.classList.add('auth-btn--success');
      this.btnText.textContent = '✓ Welcome';

      setTimeout(() => {
        this.overlay.classList.add('auth-overlay--exit');
        setTimeout(() => {
          this.overlay.remove();
          this.unlock();
          injectLogoutButton();
          startSessionMonitor(); // begin periodic validation
        }, 600);
      }, 800);
    },

    lock() {
      document.body.classList.add('auth-locked');
    },

    unlock() {
      document.body.classList.remove('auth-locked');
    },
  };

  // ──────────────────────────────────────────────
  // Logout — inject button & handle with DB cleanup
  // ──────────────────────────────────────────────
  function injectLogoutButton() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (sidebar.querySelector('.sidebar__logout-section')) return;

    const email = Session.getEmail();
    const displayEmail = email || 'User';

    const section = document.createElement('div');
    section.className = 'sidebar__logout-section';
    section.innerHTML = `
      <div class="sidebar__divider"></div>
      <div class="sidebar__user-info">
        <div class="sidebar__user-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div class="sidebar__user-details">
          <span class="sidebar__user-email" title="${displayEmail}">${displayEmail}</span>
        </div>
      </div>
      <button class="sidebar__logout-btn" id="logoutBtn" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Log Out</span>
      </button>
    `;

    sidebar.appendChild(section);
    section.querySelector('#logoutBtn').addEventListener('click', handleLogout);
  }

  async function handleLogout() {
    const email = Session.getEmail();

    // Stop periodic session checks
    stopSessionMonitor();

    // Release session in Supabase (set session_id to null)
    await releaseSession(email);

    // Clear local session data
    Session.clear();
    console.log('[Auth] User logged out — session released, local data cleared');

    // Remove logout button
    const logoutSection = document.querySelector('.sidebar__logout-section');
    if (logoutSection) logoutSection.remove();

    // Re-lock and show login
    LoginGate.lock();
    LoginGate.create();
    setTimeout(() => {
      if (LoginGate.emailInput) LoginGate.emailInput.focus();
    }, 600);
  }

  // ──────────────────────────────────────────────
  // Force-logout (session invalidated by another device)
  // ──────────────────────────────────────────────
  function forceLogout() {
    stopSessionMonitor();
    Session.clear();
    console.warn('[Auth] Session invalidated — forcing logout');

    const logoutSection = document.querySelector('.sidebar__logout-section');
    if (logoutSection) logoutSection.remove();

    LoginGate.lock();
    LoginGate.create();

    // Show the "kicked" message after modal renders
    setTimeout(() => {
      if (LoginGate.errorBox) {
        LoginGate.showError('Your session was ended because another device logged in. Please re-login.');
      }
      if (LoginGate.emailInput) LoginGate.emailInput.focus();
    }, 700);
  }

  // ──────────────────────────────────────────────
  // Visibility-based session re-validation
  // When user returns to the tab, immediately validate
  // ──────────────────────────────────────────────
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (!Session.isLoggedIn()) return;

    const email = Session.getEmail();
    if (!email) return;

    console.log('[Auth] Tab became visible — re-validating session...');
    const valid = await validateSession(email);

    if (!valid) {
      forceLogout();
    }
  });

  // ──────────────────────────────────────────────
  // Storage event listener — sync across tabs
  // If another tab logs out (clears session), this tab
  // should also recognize the logout immediately.
  // ──────────────────────────────────────────────
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_STATUS_KEY && !e.newValue) {
      // Session was cleared in another tab
      if (Session.isLoggedIn()) return; // still logged in via sessionStorage
      console.log('[Auth] Session cleared in another tab — showing login gate');
      stopSessionMonitor();
      const logoutSection = document.querySelector('.sidebar__logout-section');
      if (logoutSection) logoutSection.remove();
      LoginGate.lock();
      LoginGate.create();
    }
  });

  // ──────────────────────────────────────────────
  // Initialize Auth Gate
  // ──────────────────────────────────────────────
  async function initAuth() {
    if (Session.isLoggedIn()) {
      const email = Session.getEmail();

      // Validate this device still owns the session in Supabase
      const valid = await validateSession(email);

      if (valid) {
        // ✅ Session valid on this device
        injectLogoutButton();
        startSessionMonitor(); // begin periodic checks
        return;
      } else {
        // 🚫 Another device took over — force logout
        forceLogout();
        return;
      }
    }

    // No local session — show login gate
    LoginGate.lock();
    LoginGate.create();
    setTimeout(() => {
      if (LoginGate.emailInput) LoginGate.emailInput.focus();
    }, 600);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

})();
