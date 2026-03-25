/* ============================================
   Velora Streaming — Sidebar + Categories
   ============================================ */

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const CONFIG = {
  TMDB_API_KEY: '183c4a796098898273e63da18d5ae4af',
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  IMAGE_BASE_URL: 'https://image.tmdb.org/t/p',
  VIDKING_BASE_URL: 'https://www.vidking.net/embed',

  POSTER_SIZE: '/w500',
  BACKDROP_SIZE: '/original',

  CATEGORIES: [
    { label: 'Action',    icon: '⚡', movieGenreId: 28,    tvGenreId: 10759 },
    { label: 'Drama',     icon: '🎭', movieGenreId: 18,    tvGenreId: 18    },
    { label: 'Comedy',    icon: '😂', movieGenreId: 35,    tvGenreId: 35    },
    { label: 'Horror',    icon: '👻', movieGenreId: 27,    tvGenreId: 9648  },
    { label: 'Adventure', icon: '🗺️', movieGenreId: 12,    tvGenreId: 10759 },
    { label: 'Romance',   icon: '💕', movieGenreId: 10749, tvGenreId: 18    },
    { label: 'Anime',     icon: '🎮', movieGenreId: 16,    tvGenreId: 16    },
  ],

  HERO_SLIDE_INTERVAL: 6000,
  HERO_SLIDE_COUNT: 6,
};

// ──────────────────────────────────────────────
// API — with retry, timeout & debug logging
// ──────────────────────────────────────────────
const FETCH_TIMEOUT = 15000; // 15 seconds
const RETRY_DELAY = 1000;    // 1 second before retry

const API = {
  /**
   * Core fetch with automatic retry.
   * Returns parsed JSON on success, or null on failure.
   * NEVER shows UI or throws — callers decide what to do with null.
   */
  async fetch(endpoint, params = {}) {
    const url = new URL(`${CONFIG.TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', CONFIG.TMDB_API_KEY);
    url.searchParams.set('language', 'en-US');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    // Attempt up to 2 times (initial + 1 retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      try {
        console.log(`[API] Attempt ${attempt}: ${endpoint}`);
        const res = await fetch(url.toString(), { signal: controller.signal });
        clearTimeout(timeoutId);

        console.log(`[API] Status ${res.status} for ${endpoint}`);

        if (!res.ok) {
          throw new Error(`HTTP_${res.status}`);
        }

        const json = await res.json();
        return json;
      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          console.warn(`[API] Timeout (attempt ${attempt}): ${endpoint}`);
        } else {
          console.warn(`[API] Error (attempt ${attempt}): ${err.message} — ${endpoint}`);
        }

        // If first attempt failed, wait then retry
        if (attempt < 2) {
          console.log(`[API] Retrying in ${RETRY_DELAY}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
      }
    }

    // Both attempts failed — return null (caller handles gracefully)
    console.error(`[API] All attempts failed for ${endpoint}`);
    return null;
  },

  getTrending(type = 'movie', tw = 'week', page = 1) { return this.fetch(`/trending/${type}/${tw}`, { page }); },
  discoverMovies(gid, page = 1) { return this.fetch('/discover/movie', { with_genres: gid, sort_by: 'popularity.desc', page }); },
  discoverTV(gid, page = 1) { return this.fetch('/discover/tv', { with_genres: gid, sort_by: 'popularity.desc', page }); },
  getPopularMovies(page = 1) { return this.fetch('/movie/popular', { page }); },
  getPopularTV(page = 1) { return this.fetch('/tv/popular', { page }); },
  getMovieDetails(id) { return this.fetch(`/movie/${id}`, { append_to_response: 'credits,similar,videos' }); },
  getTVDetails(id) { return this.fetch(`/tv/${id}`, { append_to_response: 'credits,similar,videos' }); },
  searchMulti(q, page = 1) { return this.fetch('/search/multi', { query: q, page }); },
};

// ──────────────────────────────────────────────
// Network Error UI — Global overlay with retry
// Only shown when explicitly called by page logic
// ──────────────────────────────────────────────
const NetworkErrorUI = {
  _overlay: null,
  _retryCallback: null,

  show(retryCallback) {
    if (this._overlay) {
      this._retryCallback = retryCallback;
      return;
    }

    this._retryCallback = retryCallback;

    const overlay = document.createElement('div');
    overlay.className = 'net-error-overlay';
    overlay.id = 'netErrorOverlay';
    overlay.innerHTML = `
      <div class="net-error-box">
        <div class="net-error-box__glow"></div>
        <div class="net-error-box__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M1 1l22 22"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <h2 class="net-error-box__title">Network Error</h2>
        <p class="net-error-box__message">
          A network error occurred. Please check your connection and try again.
        </p>
        <button class="net-error-box__retry" id="netErrorRetry">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          <span>Retry</span>
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    this._overlay = overlay;

    requestAnimationFrame(() => {
      overlay.classList.add('net-error-overlay--visible');
    });

    overlay.querySelector('#netErrorRetry').addEventListener('click', () => {
      this.hide();
      if (this._retryCallback) this._retryCallback();
    });
  },

  hide() {
    if (!this._overlay) return;
    this._overlay.classList.add('net-error-overlay--exit');
    const el = this._overlay;
    setTimeout(() => { el.remove(); }, 500);
    this._overlay = null;
    this._retryCallback = null;
  },

  isVisible() {
    return !!this._overlay;
  }
};

// Auto-hide error overlay when connection returns
window.addEventListener('online', () => {
  if (NetworkErrorUI.isVisible()) {
    NetworkErrorUI.hide();
    location.reload();
  }
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function getImageUrl(p, s = CONFIG.POSTER_SIZE) {
  if (!p) return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9Ijc1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTJlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZpbGw9IiM2YjZiODAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
  return `${CONFIG.IMAGE_BASE_URL}${s}${p}`;
}
function getYear(d) { return d ? new Date(d).getFullYear() : 'N/A'; }
function getTitle(i) { return i.title || i.name || 'Untitled'; }
function getMediaType(i) { return i.media_type || (i.first_air_date ? 'tv' : 'movie'); }
function getDate(i) { return i.release_date || i.first_air_date || ''; }
function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function getUrlParams() { return Object.fromEntries(new URLSearchParams(window.location.search)); }

// ──────────────────────────────────────────────
// Toast
// ──────────────────────────────────────────────
const Toast = {
  container: null,
  init() {
    if (!document.querySelector('.toast-container')) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    } else this.container = document.querySelector('.toast-container');
  },
  show(msg, type = 'info') {
    if (!this.container) this.init();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = msg;
    this.container.appendChild(el);
    setTimeout(() => { el.classList.add('toast-exit'); setTimeout(() => el.remove(), 300); }, 3000);
  },
};

// ──────────────────────────────────────────────
// SVG Icons
// ──────────────────────────────────────────────
const Icons = {
  star: `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
};

// ──────────────────────────────────────────────
// UI Components
// ──────────────────────────────────────────────
const Components = {
  createCard(item, explicitType) {
    const type = explicitType || getMediaType(item);
    const id = item.id;
    const title = getTitle(item);
    const poster = getImageUrl(item.poster_path);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const year = getYear(getDate(item));

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__poster-wrapper">
        <img class="card__poster" src="${poster}" alt="${title}" loading="lazy" />
        <span class="card__type-badge card__type-badge--${type}">${type === 'tv' ? 'TV' : 'Movie'}</span>
        <div class="card__overlay">
          <button class="card__watch-btn">${Icons.play} Watch Now</button>
        </div>
      </div>
      <div class="card__info">
        <div class="card__title">${title}</div>
        <div class="card__meta">
          <span class="card__rating">${Icons.star}${rating}</span>
          <span class="card__year">${year}</span>
        </div>
      </div>`;
    card.addEventListener('click', () => { window.location.href = `details.html?id=${id}&type=${type}`; });
    return card;
  },

  createSkeletonCard() {
    const el = document.createElement('div');
    el.className = 'skeleton-card';
    el.innerHTML = `<div class="skeleton skeleton-card__poster"></div><div class="skeleton skeleton-card__title"></div><div class="skeleton skeleton-card__meta"></div>`;
    return el;
  },

  createSentinel() {
    const el = document.createElement('div');
    el.className = 'slider-sentinel';
    el.setAttribute('aria-hidden', 'true');
    return el;
  },

  createSlider(id) {
    const w = document.createElement('div');
    w.className = 'slider-wrapper';
    w.innerHTML = `
      <button class="slider-btn slider-btn--left" aria-label="Scroll left">${Icons.chevronLeft}</button>
      <div class="slider" id="${id}"></div>
      <button class="slider-btn slider-btn--right" aria-label="Scroll right">${Icons.chevronRight}</button>`;
    const slider = w.querySelector('.slider');
    w.querySelector('.slider-btn--left').addEventListener('click', () => slider.scrollBy({ left: -600, behavior: 'smooth' }));
    w.querySelector('.slider-btn--right').addEventListener('click', () => slider.scrollBy({ left: 600, behavior: 'smooth' }));
    return { wrapper: w, slider };
  },

  showSkeletons(sl, n = 8) { sl.innerHTML = ''; for (let i = 0; i < n; i++) sl.appendChild(this.createSkeletonCard()); },
  appendSkeletons(sl, n = 4) { for (let i = 0; i < n; i++) sl.appendChild(this.createSkeletonCard()); },

  populateSlider(sl, items, type) {
    sl.innerHTML = '';
    items.forEach(i => { if (i.media_type !== 'person') sl.appendChild(this.createCard(i, type)); });
  },

  appendToSlider(sl, items, type) {
    sl.querySelectorAll('.skeleton-card').forEach(e => e.remove());
    items.forEach(i => { if (i.media_type !== 'person') sl.appendChild(this.createCard(i, type)); });
  },

  // ── Grid Components (vertical layout for category pages) ──

  createGridCard(item, explicitType) {
    const type = explicitType || getMediaType(item);
    const id = item.id;
    const title = getTitle(item);
    const poster = getImageUrl(item.poster_path);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const year = getYear(getDate(item));

    const card = document.createElement('div');
    card.className = 'grid-card';
    card.innerHTML = `
      <div class="grid-card__poster-wrap">
        <img class="grid-card__poster" src="${poster}" alt="${title}" loading="lazy" />
        <span class="grid-card__badge grid-card__badge--${type}">${type === 'tv' ? 'TV' : 'Movie'}</span>
        <div class="grid-card__overlay">
          <div class="grid-card__play">${Icons.play}</div>
        </div>
      </div>
      <div class="grid-card__info">
        <div class="grid-card__title">${title}</div>
        <div class="grid-card__meta">
          <span class="grid-card__rating">${Icons.star} ${rating}</span>
          <span class="grid-card__year">${year}</span>
        </div>
      </div>`;
    card.addEventListener('click', () => { window.location.href = `details.html?id=${id}&type=${type}`; });
    return card;
  },

  createGridSkeleton() {
    const el = document.createElement('div');
    el.className = 'grid-card grid-card--skeleton';
    el.innerHTML = `<div class="skeleton grid-card__poster-wrap" style="aspect-ratio:2/3"></div>
      <div class="skeleton" style="height:14px;margin:10px 0 6px;width:75%;border-radius:4px"></div>
      <div class="skeleton" style="height:12px;width:50%;border-radius:4px"></div>`;
    return el;
  },

  showGridSkeletons(grid, count = 12) {
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) grid.appendChild(this.createGridSkeleton());
  },

  populateGrid(grid, items, type) {
    grid.innerHTML = '';
    items.forEach(i => { if (i.media_type !== 'person') grid.appendChild(this.createGridCard(i, type)); });
  },

  appendToGrid(grid, items, type) {
    grid.querySelectorAll('.grid-card--skeleton').forEach(e => e.remove());
    items.forEach(i => { if (i.media_type !== 'person') grid.appendChild(this.createGridCard(i, type)); });
  },
};

// ──────────────────────────────────────────────
// Infinite Scroll
// ──────────────────────────────────────────────
const InfiniteScroll = {
  setup(slider, fetcherFn, type) {
    const state = { page: 1, loading: false, done: false };
    const sentinel = Components.createSentinel();
    slider.appendChild(sentinel);

    const obs = new IntersectionObserver(async (entries) => {
      if (!entries[0].isIntersecting || state.loading || state.done) return;
      state.loading = true;
      state.page++;
      Components.appendSkeletons(slider, 4);
      slider.appendChild(sentinel);

      const data = await fetcherFn(state.page);
      if (!data || !data.results || data.results.length === 0) {
        state.done = true;
        slider.querySelectorAll('.skeleton-card').forEach(e => e.remove());
        sentinel.remove();
        state.loading = false;
        return;
      }
      if (state.page >= (data.total_pages || 500)) state.done = true;
      Components.appendToSlider(slider, data.results, type);
      if (!state.done) slider.appendChild(sentinel); else sentinel.remove();
      state.loading = false;
    }, { root: slider, rootMargin: '0px 400px 0px 0px', threshold: 0 });

    obs.observe(sentinel);
    return { destroy() { obs.disconnect(); sentinel.remove(); } };
  },
};

// ──────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────
const Sidebar = {
  isOpen: false,

  init() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    const close = document.getElementById('sidebarClose');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;

    // Populate genre buttons
    this.buildGenres();

    // Remember state from localStorage
    const saved = localStorage.getItem('velora_sidebar');
    if (saved === 'open' && window.innerWidth > 1024) {
      this.open(false);
    }

    toggle?.addEventListener('click', () => this.toggle());
    close?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', () => this.close());

    // Close on resize if mobile
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 1024 && this.isOpen) this.close(false);
    });
  },

  open(animate = true) {
    const sidebar = document.getElementById('sidebar');
    const wrapper = document.getElementById('appWrapper');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;

    this.isOpen = true;
    sidebar.classList.add('open');
    overlay?.classList.add('open');

    if (window.innerWidth > 1024) {
      wrapper?.classList.add('shifted');
    }

    document.body.classList.add('sidebar-open');
    localStorage.setItem('velora_sidebar', 'open');
  },

  close(animate = true) {
    const sidebar = document.getElementById('sidebar');
    const wrapper = document.getElementById('appWrapper');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;

    this.isOpen = false;
    sidebar.classList.remove('open');
    overlay?.classList.remove('open');
    wrapper?.classList.remove('shifted');
    document.body.classList.remove('sidebar-open');
    localStorage.setItem('velora_sidebar', 'closed');
  },

  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  buildGenres() {
    const container = document.getElementById('sidebarGenres');
    if (!container) return;

    const page = document.body.dataset.page; // home, movies, tv

    CONFIG.CATEGORIES.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.className = 'sidebar__genre-btn';
      btn.innerHTML = `<span class="sidebar__genre-icon">${cat.icon}</span><span>${cat.label}</span>`;
      btn.addEventListener('click', () => {
        // Highlight active genre
        container.querySelectorAll('.sidebar__genre-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Close sidebar on mobile
        if (window.innerWidth <= 1024) this.close();

        // Load filtered content
        loadGenreContent(cat, page);
      });
      container.appendChild(btn);
    });
  },
};

// ──────────────────────────────────────────────
// Genre Content Loader — VERTICAL GRID LAYOUT
// When a sidebar genre is clicked, load a responsive grid into #mainContent
// ──────────────────────────────────────────────
let currentGenreObserver = null;
let currentGenreSentinel = null;

function loadGenreContent(category, page) {
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  // Determine the media type based on the current page
  let mediaType = 'movie';
  if (page === 'tv') mediaType = 'tv';
  else if (page === 'movies') mediaType = 'movie';
  else mediaType = 'movie';

  // Cleanup previous observer
  if (currentGenreObserver) { currentGenreObserver.disconnect(); currentGenreObserver = null; }
  if (currentGenreSentinel) { currentGenreSentinel.remove(); currentGenreSentinel = null; }

  mainContent.innerHTML = '';

  // Hide hero slider if on home page
  const heroSlider = document.getElementById('heroSlider');
  if (heroSlider) heroSlider.style.display = 'none';

  // Build header with title + toggle
  const section = document.createElement('section');
  section.className = 'section genre-page-section';

  const header = document.createElement('div');
  header.className = 'section__header';
  header.innerHTML = `
    <h2 class="section__title">${category.icon} ${category.label}</h2>
    <div class="category-toggle">
      <button class="category-toggle__btn ${mediaType === 'movie' ? 'active' : ''}" data-mode="movie">Movies</button>
      <button class="category-toggle__btn ${mediaType === 'tv' ? 'active' : ''}" data-mode="tv">TV Shows</button>
    </div>
  `;
  section.appendChild(header);

  // Vertical grid container
  const grid = document.createElement('div');
  grid.className = 'content-grid';
  grid.id = 'genreGrid';
  section.appendChild(grid);

  // Sentinel for infinite vertical scroll
  const sentinel = document.createElement('div');
  sentinel.className = 'grid-sentinel';
  sentinel.innerHTML = '<div class="loading-spinner"></div>';
  section.appendChild(sentinel);
  currentGenreSentinel = sentinel;

  mainContent.appendChild(section);

  let currentMode = mediaType;

  async function load(mode) {
    currentMode = mode;

    // Cleanup previous observer
    if (currentGenreObserver) { currentGenreObserver.disconnect(); currentGenreObserver = null; }

    // Update header title
    const titleEl = header.querySelector('.section__title');
    if (titleEl) titleEl.textContent = `${category.icon} ${category.label} ${mode === 'tv' ? 'TV Shows' : 'Movies'}`;

    // Show skeletons
    Components.showGridSkeletons(grid, 12);
    sentinel.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const gid = mode === 'movie' ? category.movieGenreId : category.tvGenreId;
    const fetcher = mode === 'movie'
      ? (p) => API.discoverMovies(gid, p)
      : (p) => API.discoverTV(gid, p);

    // Fetch first page
    const data = await fetcher(1);
    if (!data || !data.results) {
      // Graceful fallback — show empty state with working retry
      grid.innerHTML = '';
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'net-error-inline';
      emptyMsg.innerHTML = `
        <p>No content available. Try again later.</p>
        <button class="net-error-inline__retry">Retry</button>`;
      emptyMsg.querySelector('button').addEventListener('click', () => load(mode));
      grid.appendChild(emptyMsg);
      return;
    }
    Components.populateGrid(grid, data.results, mode);

    // Setup infinite vertical scroll
    const state = { page: 1, loading: false, done: false };

    if (data && data.total_pages && data.total_pages > 1) {
      sentinel.style.display = 'flex';

      currentGenreObserver = new IntersectionObserver(async (entries) => {
        if (!entries[0].isIntersecting || state.loading || state.done) return;
        state.loading = true;
        state.page++;

        // Append skeleton placeholders
        for (let i = 0; i < 8; i++) grid.appendChild(Components.createGridSkeleton());

        const next = await fetcher(state.page);
        if (!next || !next.results || next.results.length === 0) {
          state.done = true;
          sentinel.style.display = 'none';
          grid.querySelectorAll('.grid-card--skeleton').forEach(e => e.remove());
          state.loading = false;
          return;
        }

        if (state.page >= (next.total_pages || 500)) state.done = true;
        Components.appendToGrid(grid, next.results, mode);
        if (state.done) sentinel.style.display = 'none';
        state.loading = false;
      }, { rootMargin: '0px 0px 400px 0px', threshold: 0 });

      currentGenreObserver.observe(sentinel);
    }
  }

  // Toggle handlers
  header.querySelectorAll('.category-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === currentMode) return;
      header.querySelectorAll('.category-toggle__btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      load(mode);
    });
  });

  load(mediaType);
}

// ──────────────────────────────────────────────
// Hero Slider
// ──────────────────────────────────────────────
const HeroSlider = {
  idx: 0, slides: [], timer: null, container: null,

  async init(sel = '#heroSlider') {
    this.container = document.querySelector(sel);
    if (!this.container) return;
    const data = await API.getTrending('movie', 'week');
    if (!data || !data.results) {
      // Hero failed — hide the skeleton, rest of page still loads
      console.warn('[HeroSlider] No data, hiding hero section');
      this.container.innerHTML = '';
      this.container.style.display = 'none';
      return;
    }
    this.slides = data.results.filter(i => i.backdrop_path).slice(0, CONFIG.HERO_SLIDE_COUNT);
    if (this.slides.length === 0) {
      this.container.innerHTML = '';
      this.container.style.display = 'none';
      return;
    }
    this.render();
    this.startAuto();
  },

  render() {
    const track = document.createElement('div');
    track.className = 'hero-slider__track';

    this.slides.forEach((item, i) => {
      const type = getMediaType(item);
      const title = getTitle(item);
      const backdrop = getImageUrl(item.backdrop_path, CONFIG.BACKDROP_SIZE);
      const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
      const year = getYear(getDate(item));

      const slide = document.createElement('div');
      slide.className = `hero-slide${i === 0 ? ' active' : ''}`;
      slide.innerHTML = `
        <img class="hero-slide__backdrop" src="${backdrop}" alt="${title}" />
        <div class="hero-slide__overlay"></div>
        <div class="hero-slide__overlay-left"></div>
        <div class="hero-slide__content">
          <div class="hero-slide__tag">${Icons.star} #${i + 1} Trending</div>
          <h2 class="hero-slide__title">${title}</h2>
          <p class="hero-slide__description">${item.overview || ''}</p>
          <div class="hero-slide__meta">
            <span class="hero-slide__rating">${Icons.star} ${rating}</span>
            <span class="hero-slide__year">${year}</span>
          </div>
          <div class="hero-slide__actions">
            <a href="details.html?id=${item.id}&type=${type}" class="btn btn--primary">${Icons.play} Watch Now</a>
            <a href="details.html?id=${item.id}&type=${type}" class="btn btn--ghost">More Info</a>
          </div>
        </div>`;
      track.appendChild(slide);
    });

    const arrowL = document.createElement('button');
    arrowL.className = 'hero-slider__arrow hero-slider__arrow--left';
    arrowL.innerHTML = Icons.chevronLeft;
    arrowL.addEventListener('click', () => this.prev());

    const arrowR = document.createElement('button');
    arrowR.className = 'hero-slider__arrow hero-slider__arrow--right';
    arrowR.innerHTML = Icons.chevronRight;
    arrowR.addEventListener('click', () => this.next());

    const dots = document.createElement('div');
    dots.className = 'hero-slider__dots';
    this.slides.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = `hero-slider__dot${i === 0 ? ' active' : ''}`;
      d.addEventListener('click', () => this.goTo(i));
      dots.appendChild(d);
    });

    this.container.innerHTML = '';
    this.container.append(track, arrowL, arrowR, dots);
    this.container.addEventListener('mouseenter', () => this.stopAuto());
    this.container.addEventListener('mouseleave', () => this.startAuto());
  },

  goTo(i) {
    const sl = this.container.querySelectorAll('.hero-slide');
    const dt = this.container.querySelectorAll('.hero-slider__dot');
    sl[this.idx]?.classList.remove('active');
    dt[this.idx]?.classList.remove('active');
    this.idx = (i + this.slides.length) % this.slides.length;
    sl[this.idx]?.classList.add('active');
    dt[this.idx]?.classList.add('active');
    this.restartAuto();
  },
  next() { this.goTo(this.idx + 1); },
  prev() { this.goTo(this.idx - 1); },
  startAuto() { this.stopAuto(); this.timer = setInterval(() => this.next(), CONFIG.HERO_SLIDE_INTERVAL); },
  stopAuto() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  restartAuto() { this.stopAuto(); this.startAuto(); },
};

// ──────────────────────────────────────────────
// Search Setup
// ──────────────────────────────────────────────
function setupSearch() {
  const searchBar = document.querySelector('.search-bar');
  const searchIcon = document.querySelector('.search-bar__icon');
  const searchInput = document.querySelector('.search-bar__input');
  const searchResults = document.querySelector('.search-results');

  if (searchIcon && searchBar) {
    searchIcon.addEventListener('click', () => {
      searchBar.classList.toggle('expanded');
      if (searchBar.classList.contains('expanded')) searchInput.focus();
      else { searchInput.value = ''; searchResults?.classList.remove('visible'); }
    });
  }

  if (searchInput && searchResults) {
    const doSearch = debounce(async (query) => {
      if (query.length < 2) { searchResults.classList.remove('visible'); return; }
      const data = await API.searchMulti(query);
      if (!data || !data.results || data.results.length === 0) {
        searchResults.innerHTML = `<div class="search-results__empty">No results for "${query}"</div>`;
        searchResults.classList.add('visible');
        return;
      }
      const filtered = data.results.filter(r => r.media_type !== 'person').slice(0, 10);
      searchResults.innerHTML = filtered.map(item => {
        const type = getMediaType(item);
        const title = getTitle(item);
        const year = getYear(getDate(item));
        const poster = getImageUrl(item.poster_path);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        return `
          <div class="search-results__item" data-id="${item.id}" data-type="${type}">
            <img class="search-results__poster" src="${poster}" alt="${title}" loading="lazy"/>
            <div class="search-results__info">
              <div class="search-results__title">${title}</div>
              <div class="search-results__meta">
                <span class="search-results__type ${type === 'tv' ? 'search-results__type--tv' : ''}">${type === 'tv' ? 'TV' : 'Movie'}</span>
                <span>★ ${rating}</span><span>${year}</span>
              </div>
            </div>
          </div>`;
      }).join('');
      searchResults.classList.add('visible');
      searchResults.querySelectorAll('.search-results__item').forEach(el => {
        el.addEventListener('click', () => {
          window.location.href = `details.html?id=${el.dataset.id}&type=${el.dataset.type}`;
        });
      });
    }, 350);
    searchInput.addEventListener('input', (e) => doSearch(e.target.value.trim()));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        searchResults.classList.remove('visible');
        searchBar?.classList.remove('expanded');
        if (searchInput) searchInput.value = '';
      }
    });
  }
}

// ──────────────────────────────────────────────
// Build default section (no genre filter)
// ──────────────────────────────────────────────
function buildSection(container, title, sliderId, fetcher, type) {
  const section = document.createElement('section');
  section.className = 'section';
  const hdr = document.createElement('div');
  hdr.className = 'section__header';
  hdr.innerHTML = `<h2 class="section__title">${title}</h2>`;
  section.appendChild(hdr);

  const { wrapper, slider } = Components.createSlider(sliderId);
  section.appendChild(wrapper);
  container.appendChild(section);

  return { slider, fetcher, type };
}

async function buildDefaultSections(container, configs) {
  const entries = configs.map(c => buildSection(container, c.title, c.id, c.fetcher, c.type));
  entries.forEach(e => Components.showSkeletons(e.slider));

  const results = await Promise.all(entries.map(e => e.fetcher(1)));
  results.forEach((data, i) => {
    if (data && data.results) Components.populateSlider(entries[i].slider, data.results, entries[i].type);
    InfiniteScroll.setup(entries[i].slider, entries[i].fetcher, entries[i].type);
  });
}

// ──────────────────────────────────────────────
// HOME PAGE — each section loads independently
// ──────────────────────────────────────────────
async function initHomePage() {
  Sidebar.init();
  setupSearch();
  Toast.init();

  // Hero loads independently — failure just hides it
  HeroSlider.init('#heroSlider');

  const main = document.getElementById('mainContent');
  if (!main) return;

  const configs = [
    { title: 'Trending Now', id: 'trending', fetcher: (p) => API.getTrending('all', 'week', p) },
    { title: '🎬 Popular Movies', id: 'pop-movies', fetcher: (p) => API.getPopularMovies(p), type: 'movie' },
    { title: '📺 Popular TV Shows', id: 'pop-tv', fetcher: (p) => API.getPopularTV(p), type: 'tv' },
  ];

  // Each section loads independently — no single try/catch blocking everything
  configs.forEach(c => {
    const sec = document.createElement('section');
    sec.className = 'section';
    const hdr = document.createElement('div');
    hdr.className = 'section__header';
    hdr.innerHTML = `<h2 class="section__title">${c.title}</h2>`;
    sec.appendChild(hdr);
    const { wrapper, slider } = Components.createSlider(c.id);
    sec.appendChild(wrapper);
    main.appendChild(sec);

    Components.showSkeletons(slider);
    c.fetcher(1).then(data => {
      if (data && data.results) {
        Components.populateSlider(slider, data.results, c.type);
      } else {
        // Section failed — just clear skeletons, don't block
        slider.innerHTML = '';
        console.warn(`[Home] Section "${c.title}" returned no data`);
      }
      InfiniteScroll.setup(slider, c.fetcher, c.type);
    });
  });

  // Build category sections with toggle
  CONFIG.CATEGORIES.forEach((cat, i) => buildCategoryWithToggle(main, cat, i));
}

function buildCategoryWithToggle(container, category, index) {
  const section = document.createElement('section');
  section.className = 'section category-section';

  const header = document.createElement('div');
  header.className = 'section__header';
  header.innerHTML = `
    <h2 class="section__title">${category.icon} ${category.label}</h2>
    <div class="category-toggle">
      <button class="category-toggle__btn active" data-mode="movie">Movies</button>
      <button class="category-toggle__btn" data-mode="tv">TV Shows</button>
    </div>`;
  section.appendChild(header);

  const { wrapper, slider } = Components.createSlider(`cat-${index}`);
  section.appendChild(wrapper);
  container.appendChild(section);

  let currentMode = 'movie';
  let handle = null;

  async function load(mode) {
    currentMode = mode;
    if (handle) handle.destroy();
    Components.showSkeletons(slider);
    slider.scrollLeft = 0;
    const gid = mode === 'movie' ? category.movieGenreId : category.tvGenreId;
    const fetcher = mode === 'movie' ? (p) => API.discoverMovies(gid, p) : (p) => API.discoverTV(gid, p);
    const data = await fetcher(1);
    if (data && data.results) Components.populateSlider(slider, data.results, mode);
    handle = InfiniteScroll.setup(slider, fetcher, mode);
  }

  header.querySelectorAll('.category-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === currentMode) return;
      header.querySelectorAll('.category-toggle__btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      load(btn.dataset.mode);
    });
  });

  load('movie');
}

// ──────────────────────────────────────────────
// MOVIES PAGE — sections load independently
// ──────────────────────────────────────────────
async function initMoviesPage() {
  Sidebar.init();
  setupSearch();
  Toast.init();

  const main = document.getElementById('mainContent');
  if (!main) return;

  // No connectivity gate — just load sections, each handles its own nulls
  await buildDefaultSections(main, [
    { title: '🔥 Popular Movies', id: 'pop-m', fetcher: (p) => API.getPopularMovies(p), type: 'movie' },
    { title: '⚡ Action', id: 'action-m', fetcher: (p) => API.discoverMovies(28, p), type: 'movie' },
    { title: '🎭 Drama', id: 'drama-m', fetcher: (p) => API.discoverMovies(18, p), type: 'movie' },
    { title: '😂 Comedy', id: 'comedy-m', fetcher: (p) => API.discoverMovies(35, p), type: 'movie' },
    { title: '👻 Horror', id: 'horror-m', fetcher: (p) => API.discoverMovies(27, p), type: 'movie' },
    { title: '🗺️ Adventure', id: 'adv-m', fetcher: (p) => API.discoverMovies(12, p), type: 'movie' },
    { title: '💕 Romance', id: 'romance-m', fetcher: (p) => API.discoverMovies(10749, p), type: 'movie' },
  ]);
}

// ──────────────────────────────────────────────
// TV SHOWS PAGE — sections load independently
// ──────────────────────────────────────────────
async function initTVPage() {
  Sidebar.init();
  setupSearch();
  Toast.init();

  const main = document.getElementById('mainContent');
  if (!main) return;

  await buildDefaultSections(main, [
    { title: '🔥 Popular TV Shows', id: 'pop-tv', fetcher: (p) => API.getPopularTV(p), type: 'tv' },
    { title: '⚡ Action & Adventure', id: 'action-tv', fetcher: (p) => API.discoverTV(10759, p), type: 'tv' },
    { title: '🎭 Drama', id: 'drama-tv', fetcher: (p) => API.discoverTV(18, p), type: 'tv' },
    { title: '😂 Comedy', id: 'comedy-tv', fetcher: (p) => API.discoverTV(35, p), type: 'tv' },
    { title: '👻 Crime', id: 'crime-tv', fetcher: (p) => API.discoverTV(80, p), type: 'tv' },
    { title: '🗺️ Adventure', id: 'adv-tv', fetcher: (p) => API.discoverTV(10759, p), type: 'tv' },
    { title: '💕 Romance', id: 'romance-tv', fetcher: (p) => API.discoverTV(18, p), type: 'tv' },
  ]);
}

// ──────────────────────────────────────────────
// DETAILS PAGE — no global try/catch, graceful null
// ──────────────────────────────────────────────
async function initDetailsPage() {
  setupSearch();
  Toast.init();

  const { id, type } = getUrlParams();
  if (!id || !type) { window.location.href = 'index.html'; return; }

  const detailsFn = type === 'tv' ? API.getTVDetails : API.getMovieDetails;
  const data = await detailsFn.call(API, id);

  if (!data) {
    // Data fetch failed after retries — show error with retry
    console.warn('[DetailsPage] Could not load details for', id);
    NetworkErrorUI.show(() => location.reload());
    return;
  }

  document.title = `${getTitle(data)} — Velora`;

  const backdropEl = document.getElementById('detailsBackdrop');
  if (backdropEl) {
    backdropEl.innerHTML = `
      <img class="details-backdrop__img" src="${getImageUrl(data.backdrop_path, CONFIG.BACKDROP_SIZE)}" alt="${getTitle(data)}" />
      <div class="details-backdrop__overlay"></div>`;
  }

  const contentEl = document.getElementById('detailsContent');
  if (contentEl) {
    const title = getTitle(data);
    const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
    const year = getYear(getDate(data));
    const genres = (data.genres || []).map(g => `<span class="details-info__genre">${g.name}</span>`).join('');
    const runtime = type === 'movie'
      ? (data.runtime ? `${data.runtime} min` : '')
      : (data.number_of_seasons ? `${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}` : '');

    contentEl.innerHTML = `
      <div class="details-poster"><img src="${getImageUrl(data.poster_path)}" alt="${title}" /></div>
      <div class="details-info">
        <h1 class="details-info__title">${title}</h1>
        <div class="details-info__meta">
          <span class="details-info__rating">${Icons.star} ${rating}</span>
          <span class="details-info__dot"></span>
          <span class="details-info__year">${year}</span>
          ${runtime ? `<span class="details-info__dot"></span><span class="details-info__runtime">${runtime}</span>` : ''}
        </div>
        <div class="details-info__genres">${genres}</div>
        <p class="details-info__overview">${data.overview || 'No overview available.'}</p>
        <div class="details-info__actions">
          <a href="player.html?id=${id}&type=${type}" class="btn btn--primary">${Icons.play} Watch Now</a>
        </div>
      </div>`;
  }

  if (data.similar && data.similar.results && data.similar.results.length > 0) {
    const mainC = document.getElementById('detailsMain');
    if (mainC) {
      const sec = document.createElement('div'); sec.className = 'section';
      const hdr = document.createElement('div'); hdr.className = 'section__header';
      hdr.innerHTML = `<h2 class="section__title">You May Also Like</h2>`;
      sec.appendChild(hdr);
      const { wrapper, slider } = Components.createSlider('similar');
      Components.populateSlider(slider, data.similar.results, type);
      sec.appendChild(wrapper);
      mainC.appendChild(sec);
    }
  }
}

// ──────────────────────────────────────────────
// PLAYER PAGE — graceful null handling, no false errors
// ──────────────────────────────────────────────
async function initPlayerPage() {
  Toast.init();

  const params = getUrlParams();
  const id = params.id;
  const type = params.type || 'movie';
  let season = parseInt(params.season) || 1;
  let episode = parseInt(params.episode) || 1;

  if (!id) { window.location.href = 'index.html'; return; }

  const playerBack = document.getElementById('playerBack');
  const playerTitle = document.getElementById('playerTitle');
  const playerLoading = document.getElementById('playerLoading');
  const playerWrapper = document.getElementById('playerWrapper');
  const playerIframe = document.getElementById('playerIframe');
  const tvControls = document.getElementById('tvControls');
  const playerInfo = document.getElementById('playerInfo');
  const infoTitle = document.getElementById('infoTitle');
  const infoOverview = document.getElementById('infoOverview');

  if (playerBack) {
    playerBack.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = `details.html?id=${id}&type=${type}`;
    });
  }

  function getEmbedUrl(s, ep) {
    if (type === 'tv') return `${CONFIG.VIDKING_BASE_URL}/tv/${id}/${s}/${ep}`;
    return `${CONFIG.VIDKING_BASE_URL}/movie/${id}`;
  }

  function loadPlayer(s, ep) {
    const url = getEmbedUrl(s, ep);
    playerIframe.src = url;
    playerLoading.style.display = 'none';
    playerWrapper.style.display = 'block';
  }

  // Fetch details — player still works even if metadata fails
  const detailsFn = type === 'tv' ? API.getTVDetails : API.getMovieDetails;
  const data = await detailsFn.call(API, id);

  if (data) {
    const title = getTitle(data);
    document.title = `${title} — Velora`;
    if (playerTitle) playerTitle.textContent = title;
    if (infoTitle) infoTitle.textContent = title;
    if (infoOverview) infoOverview.textContent = data.overview || '';
    if (playerInfo) playerInfo.style.display = 'block';
  } else {
    console.warn('[PlayerPage] Metadata fetch failed, loading player anyway');
  }

  // MOVIE: just load the player regardless
  if (type === 'movie') {
    loadPlayer();
    return;
  }

  // TV SHOW: setup season/episode selectors
  if (tvControls) tvControls.style.display = 'block';

  const seasonSelect = document.getElementById('seasonSelect');
  const episodeSelect = document.getElementById('episodeSelect');

  if (data && data.number_of_seasons && seasonSelect) {
    for (let s = 1; s <= data.number_of_seasons; s++) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = `Season ${s}`;
      if (s === season) opt.selected = true;
      seasonSelect.appendChild(opt);
    }

    async function loadEpisodes(s) {
      if (!episodeSelect) return;
      episodeSelect.innerHTML = '<option>Loading…</option>';

      const seasonData = await API.fetch(`/tv/${id}/season/${s}`);
      episodeSelect.innerHTML = '';

      if (seasonData && seasonData.episodes) {
        seasonData.episodes.forEach(ep => {
          const opt = document.createElement('option');
          opt.value = ep.episode_number;
          opt.textContent = `Ep ${ep.episode_number}: ${ep.name || ''}`;
          if (ep.episode_number === episode) opt.selected = true;
          episodeSelect.appendChild(opt);
        });
      } else {
        for (let e = 1; e <= 10; e++) {
          const opt = document.createElement('option');
          opt.value = e;
          opt.textContent = `Episode ${e}`;
          if (e === episode) opt.selected = true;
          episodeSelect.appendChild(opt);
        }
      }
    }

    seasonSelect.addEventListener('change', async () => {
      season = parseInt(seasonSelect.value);
      episode = 1;
      await loadEpisodes(season);
      loadPlayer(season, episode);
      updateTitle();
    });

    episodeSelect.addEventListener('change', () => {
      episode = parseInt(episodeSelect.value);
      loadPlayer(season, episode);
      updateTitle();
    });

    function updateTitle() {
      if (playerTitle && data) {
        playerTitle.textContent = `${getTitle(data)} — S${season} E${episode}`;
      }
    }

    await loadEpisodes(season);
    updateTitle();
  }

  // Load the player — always works even if metadata failed
  loadPlayer(season, episode);
}

// ──────────────────────────────────────────────
// Page Router
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  switch (page) {
    case 'home': initHomePage(); break;
    case 'movies': initMoviesPage(); break;
    case 'tv': initTVPage(); break;
    case 'details': initDetailsPage(); break;
    case 'player': initPlayerPage(); break;
    default: setupSearch();
  }
});
