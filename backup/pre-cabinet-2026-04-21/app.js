// === CONFIG ===

const CONFIG = {
  SPREADSHEET_ID: '1FP11gpL9_HpbfU_NXkZQ_tQgqtbm8aUAP27E2GJj564',
  SHEET_SOURCE_URL:
    'https://docs.google.com/spreadsheets/d/1FP11gpL9_HpbfU_NXkZQ_tQgqtbm8aUAP27E2GJj564/edit?gid=1502618237#gid=1502618237',
  CACHE_DURATION_MS: 5 * 60 * 1000,
  SEARCH_DEBOUNCE_MS: 300,
  TOAST_DURATION_MS: 2000,
  SHEETS: [
    { key: 'writing', gid: '0', label: 'Writing', kind: 'prompt', accent: '#56f0c4', accentSoft: 'rgba(86, 240, 196, 0.16)' },
    { key: 'reading', gid: '723314194', label: 'Reading', kind: 'prompt', accent: '#7bd3ff', accentSoft: 'rgba(123, 211, 255, 0.16)' },
    { key: 'nb', gid: '2036141593', label: 'NB', kind: 'prompt', accent: '#ffd36f', accentSoft: 'rgba(255, 211, 111, 0.18)' },
    { key: 'nb-pro', gid: '1752008553', label: 'NB Pro', kind: 'prompt', accent: '#ff9f7a', accentSoft: 'rgba(255, 159, 122, 0.18)' },
    { key: '4o-image', gid: '1770278489', label: '4o Image', kind: 'prompt', accent: '#f79be7', accentSoft: 'rgba(247, 155, 231, 0.18)' },
    { key: 'research', gid: '1502618237', label: 'Research', kind: 'prompt', accent: '#9bb2ff', accentSoft: 'rgba(155, 178, 255, 0.18)' },
    { key: 'dashboard', gid: '850880156', label: 'Dashboard', kind: 'prompt', accent: '#63e1ff', accentSoft: 'rgba(99, 225, 255, 0.18)' },
    { key: 'agent-builder', gid: '1198339301', label: 'Agent Builder', kind: 'prompt', accent: '#a78bfa', accentSoft: 'rgba(167, 139, 250, 0.18)' },
  ],
};

const STORAGE_KEYS = {
  favorites: 'kp-prompt-favorites',
  theme: 'kp-prompt-theme',
  viewMode: 'kp-prompt-view',
  sortMode: 'kp-prompt-sort',
  tipDismissed: 'kp-prompt-tip-dismissed',
};

const CACHE_PREFIX = 'kp-prompt-sheet-cache-v1';
const FAVORITES_TAB_KEY = 'favorites';
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const metaByKey = new Map(CONFIG.SHEETS.map((sheet, index) => [sheet.key, { ...sheet, order: index }]));

// === STATE ===

const state = {
  items: [],
  activeCategory: CONFIG.SHEETS[0].key,
  favorites: new Set(readStoredArray(STORAGE_KEYS.favorites)),
  theme: readStoredString(STORAGE_KEYS.theme, 'light') === 'dark' ? 'dark' : 'light',
  viewMode: readStoredString(STORAGE_KEYS.viewMode, 'card') === 'list' ? 'list' : 'card',
  sortMode: readStoredString(STORAGE_KEYS.sortMode, 'default') === 'title' ? 'title' : 'default',
  query: '',
  loading: true,
  progressDone: 0,
  error: null,
  warnings: [],
  modalId: null,
  modalTrigger: null,
};

// === DOM CACHE & EVENTS ===

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  applyTheme();
  syncControlState();
  initTipBar();
  initTabScrollFade();
  render();
  boot();
});

function cacheElements() {
  elements.root = document.documentElement;
  elements.body = document.body;
  elements.heroStats = document.getElementById('hero-stats');
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.searchInput = document.getElementById('search-input');
  elements.searchClear = document.getElementById('search-clear');
  elements.viewCard = document.getElementById('view-card');
  elements.viewList = document.getElementById('view-list');
  elements.sortSelect = document.getElementById('sort-select');
  elements.categoryTabs = document.getElementById('category-tabs');
  elements.resultsSummary = document.getElementById('results-summary');
  elements.subSummary = document.getElementById('sub-summary');
  elements.statusBanner = document.getElementById('status-banner');
  elements.contentRoot = document.getElementById('content-root');
  elements.modalRoot = document.getElementById('modal-root');
  elements.modalBody = document.getElementById('modal-body');
  elements.modalClose = document.getElementById('modal-close');
  elements.toastRoot = document.getElementById('toast-root');
  elements.scrollTop = document.getElementById('scroll-top');
  elements.srAnnounce = document.getElementById('sr-announce');
  elements.tipBar = document.getElementById('tip-bar');
  elements.tipDismiss = document.getElementById('tip-dismiss');
}

function bindEvents() {
  const debouncedSearch = debounce((value) => {
    state.query = value.trim();
    render();
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  elements.searchInput.addEventListener('input', (event) => {
    const value = event.target.value || '';
    elements.searchClear.hidden = !value;
    debouncedSearch(value);
  });

  elements.searchClear.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.searchClear.hidden = true;
    state.query = '';
    render();
    elements.searchInput.focus();
  });

  elements.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    applyTheme();
    renderHeroStats();
  });

  elements.viewCard.addEventListener('click', () => setViewMode('card'));
  elements.viewList.addEventListener('click', () => setViewMode('list'));

  elements.sortSelect.addEventListener('change', (event) => {
    state.sortMode = event.target.value === 'title' ? 'title' : 'default';
    localStorage.setItem(STORAGE_KEYS.sortMode, state.sortMode);
    render();
  });

  elements.categoryTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) {
      return;
    }
    navigateTo(button.dataset.category);
  });

  window.addEventListener('hashchange', () => {
    applyHash();
    render();
  });

  elements.contentRoot.addEventListener('click', handleContentClick);
  elements.contentRoot.addEventListener('keydown', handleContentKeydown);
  elements.modalBody.addEventListener('click', handleContentClick);
  elements.modalBody.addEventListener('error', handleImageError, true);

  elements.modalRoot.addEventListener('click', (event) => {
    if (event.target === elements.modalRoot) {
      closeModal();
    }
  });

  elements.modalRoot.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigateModal(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigateModal(1);
    }
  });

  elements.modalRoot.addEventListener('close', () => {
    state.modalId = null;
    renderModal();
  });

  elements.modalClose.addEventListener('click', closeModal);

  elements.scrollTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', updateScrollButton, { passive: true });

  window.addEventListener('keydown', (event) => {
    if (
      event.key === '/' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target)
    ) {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }
  });
}

// === DATA FETCH ===

async function boot(forceRefresh = false) {
  state.loading = true;
  state.error = null;
  state.warnings = [];
  state.progressDone = 0;
  render();

  try {
    const result = await loadAllSheets(forceRefresh);
    state.items = result.items;
    state.warnings = result.warnings;
    if (!state.items.some((item) => item.key === state.activeCategory) && state.activeCategory !== FAVORITES_TAB_KEY) {
      const firstAvailable = CONFIG.SHEETS.find((sheet) => state.items.some((item) => item.key === sheet.key));
      state.activeCategory = firstAvailable ? firstAvailable.key : CONFIG.SHEETS[0].key;
    }
    state.loading = false;
    state.error = null;
    applyHash();
    render();
  } catch (error) {
    state.loading = false;
    state.error = error;
    state.items = [];
    render();
  }
}

async function loadAllSheets(forceRefresh) {
  const warnings = [];

  const tasks = CONFIG.SHEETS.map(async (sheet) => {
    try {
      const result = await fetchSheet(sheet, forceRefresh);
      if (result.cacheMode === 'stale') {
        warnings.push(`${sheet.label} 시트는 최신 응답 대신 세션 캐시를 사용했습니다.`);
      }
      return result.items;
    } catch (error) {
      warnings.push(`${sheet.label} 시트를 불러오지 못해 제외했습니다.`);
      return [];
    } finally {
      state.progressDone += 1;
      renderSummary();
    }
  });

  const results = await Promise.all(tasks);
  const items = results.flat();

  if (!items.length) {
    throw new Error('Google Sheets에서 데이터를 불러오지 못했습니다. 시트 공개 설정과 네트워크 상태를 확인해주세요.');
  }

  return { items, warnings };
}

async function fetchSheet(sheet, forceRefresh) {
  const cacheKey = getCacheKey(sheet.gid);
  const cached = readSessionCache(cacheKey);

  if (!forceRefresh && cached && isFreshCache(cached.timestamp)) {
    return { items: cached.items, cacheMode: 'fresh' };
  }

  try {
    const url =
      `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${sheet.gid}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const payload = parseGvizResponse(text);
    const items = normalizeSheet(sheet, (payload.table && payload.table.rows) || []);
    writeSessionCache(cacheKey, items);
    return { items, cacheMode: 'network' };
  } catch (error) {
    if (cached && cached.items && cached.items.length) {
      return { items: cached.items, cacheMode: 'stale' };
    }
    throw error;
  }
}

function parseGvizResponse(text) {
  const match = text.match(/setResponse\(([\s\S]+)\);\s*$/);
  if (!match) {
    throw new Error('Google Visualization 응답 파싱에 실패했습니다.');
  }
  return JSON.parse(match[1]);
}

function normalizeSheet(sheet, rows) {
  return rows
    .map((row, rowIndex) => (sheet.kind === 'custom-gpt'
      ? normalizeCustomGptRow(sheet, row, rowIndex)
      : normalizePromptRow(sheet, row, rowIndex)))
    .filter(Boolean);
}

function normalizePromptRow(sheet, row, rowIndex) {
  const cells = row && row.c ? row.c : [];
  const title = cellText(cells[1]);
  const prompt = cellText(cells[2]);
  const sampleRaw = cellText(cells[3]);

  if (!title && !prompt) {
    return null;
  }

  return {
    id: `${sheet.key}-${rowIndex}`,
    type: 'prompt',
    key: sheet.key,
    category: sheet.label,
    displayNumber: cellDisplay(cells[0], rowIndex + 1),
    order: metaByKey.get(sheet.key).order,
    sortIndex: rowIndex + 1,
    title,
    prompt,
    sample: parseSampleContent(sampleRaw),
    accent: sheet.accent,
    accentSoft: sheet.accentSoft,
    searchTitle: title.toLowerCase(),
    searchBody: collapseWhitespace(prompt).toLowerCase(),
    searchBlob: `${title} ${prompt}`.toLowerCase(),
  };
}

function normalizeCustomGptRow(sheet, row, rowIndex) {
  const cells = row && row.c ? row.c : [];
  const title = cellText(cells[1]);
  const author = cellText(cells[2]);
  const description = cellText(cells[3]);
  const rawLink = cellText(cells[4]);
  const link = extractUrls(rawLink)[0] || safeUrl(rawLink);

  if (!title && !description) {
    return null;
  }

  return {
    id: `${sheet.key}-${rowIndex}`,
    type: 'custom-gpt',
    key: sheet.key,
    category: sheet.label,
    displayNumber: cellDisplay(cells[0], rowIndex + 1),
    order: metaByKey.get(sheet.key).order,
    sortIndex: rowIndex + 1,
    title,
    author,
    description,
    link,
    accent: sheet.accent,
    accentSoft: sheet.accentSoft,
    searchTitle: title.toLowerCase(),
    searchBody: collapseWhitespace(`${author} ${description}`).toLowerCase(),
    searchBlob: `${title} ${author} ${description}`.toLowerCase(),
  };
}

function parseSampleContent(raw) {
  const value = raw.trim();
  if (!value || /^\[[^\]]+\]\s*이미지 링크$/i.test(value)) {
    return { links: [], images: [], text: '' };
  }

  const urls = extractUrls(value);
  const links = urls.map((url, index) => ({
    url,
    label: linkLabel(url, index),
    isImage: IMAGE_PATTERN.test(url),
  }));

  return {
    links,
    images: links.filter((link) => link.isImage),
    text: urls.length ? value.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim() : value,
  };
}

// === RENDERING ===
// NOTE: render() rebuilds the entire DOM on every state change.
// For ~100 items this is well under 16ms. Revisit if dataset grows past 500.

function render() {
  syncControlState();
  renderHeroStats();
  renderTabs();
  renderSummary();
  renderStatusBanner();
  renderContent();
  renderModal();
  updateScrollButton();
}

function renderHeroStats() {
  const promptCount = state.loading ? '...' : state.items.filter((item) => item.type === 'prompt').length;
  const favoriteCount = countExistingFavorites();
  const viewLabel = state.viewMode === 'card' ? 'Card' : 'List';

  elements.heroStats.innerHTML = `
    <span class="stat-inline">${escapeHtml(String(promptCount))} prompts</span>
    <span class="stat-sep" aria-hidden="true">&middot;</span>
    <span class="stat-inline">${escapeHtml(String(favoriteCount))} favorites</span>
    <span class="stat-sep" aria-hidden="true">&middot;</span>
    <span class="stat-inline">${escapeHtml(viewLabel)} view</span>
  `;
}

function renderTabs() {
  const counts = getCategoryCounts();
  const tabs = [
    { key: FAVORITES_TAB_KEY, label: 'Favorites', count: countExistingFavorites(), accent: '#ffcf7d', accentSoft: 'rgba(255, 207, 125, 0.16)' },
    ...CONFIG.SHEETS.map((sheet) => ({
      key: sheet.key,
      label: sheet.label,
      count: counts.get(sheet.key) || 0,
      accent: sheet.accent,
      accentSoft: sheet.accentSoft,
    })),
  ];

  elements.categoryTabs.innerHTML = tabs
    .map((tab) => {
      const isActive = tab.key === state.activeCategory;
      return `
        <button
          type="button"
          class="tab-button ${isActive ? 'active' : ''}"
          data-category="${tab.key}"
          style="--tab-accent:${tab.accent}; --tab-soft:${tab.accentSoft};"
          aria-selected="${isActive}"
        >
          <span>${escapeHtml(tab.label)}</span>
          <span class="tab-count">${escapeHtml(String(tab.count))}</span>
        </button>
      `;
    })
    .join('');
}

function announce(message) {
  elements.srAnnounce.textContent = '';
  window.requestAnimationFrame(() => {
    elements.srAnnounce.textContent = message;
  });
}

function renderSummary() {
  if (state.loading) {
    elements.resultsSummary.textContent =
      `Google Sheets에서 데이터를 가져오는 중... (${state.progressDone}/${CONFIG.SHEETS.length})`;
    elements.subSummary.textContent = '8개 시트를 병렬로 읽고 있습니다.';
    return;
  }

  if (state.error) {
    elements.resultsSummary.textContent = '데이터를 불러오지 못했습니다.';
    elements.subSummary.textContent = '시트 공개 설정 또는 네트워크 상태를 확인해주세요.';
    return;
  }

  const visibleEntries = getVisibleEntries();
  if (state.query) {
    const msg = `${visibleEntries.length} results for '${state.query}'`;
    elements.resultsSummary.textContent = msg;
    elements.subSummary.textContent = '검색은 현재 탭과 무관하게 전체 카테고리를 대상으로 수행됩니다.';
    announce(msg);
    return;
  }

  if (state.activeCategory === FAVORITES_TAB_KEY) {
    const msg = `Favorites ${visibleEntries.length}개`;
    elements.resultsSummary.textContent = msg;
    elements.subSummary.textContent = '즐겨찾기 상태는 현재 브라우저에만 저장됩니다.';
    announce(msg);
    return;
  }

  const meta = metaByKey.get(state.activeCategory);
  const msg = `${meta.label} · ${visibleEntries.length} ${meta.kind === 'custom-gpt' ? 'GPTs' : 'prompts'}`;
  elements.resultsSummary.textContent = msg;
  elements.subSummary.textContent =
    state.sortMode === 'title' ? '현재 이름순 정렬입니다.' : '현재 시트 원래 순서를 유지합니다.';
  announce(msg);
}

function renderStatusBanner() {
  if (!state.warnings.length || state.error) {
    elements.statusBanner.classList.remove('show');
    elements.statusBanner.textContent = '';
    return;
  }

  elements.statusBanner.classList.add('show');
  elements.statusBanner.textContent = state.warnings.join(' ');
}

function renderContent() {
  if (state.loading) {
    elements.contentRoot.innerHTML = renderLoadingMarkup();
    return;
  }

  if (state.error) {
    elements.contentRoot.innerHTML = renderErrorMarkup(state.error.message);
    return;
  }

  const entries = getVisibleEntries();
  if (!entries.length) {
    elements.contentRoot.innerHTML = renderEmptyMarkup();
    return;
  }

  elements.contentRoot.innerHTML = state.viewMode === 'card' ? renderCardGrid(entries) : renderList(entries);
}

function renderLoadingMarkup() {
  const placeholders = new Array(6).fill(0)
    .map(() => '<div class="skeleton-card" aria-hidden="true"></div>')
    .join('');

  return `
    <section class="loading-shell">
      <div class="loading-header">
        <h2 class="loading-title">Google Sheets에서 프롬프트를 불러오는 중입니다.</h2>
        <span class="mini-chip">${state.progressDone}/${CONFIG.SHEETS.length}</span>
      </div>
      <p class="loading-copy">시트별 구조를 정규화하고 검색 인덱스를 준비하고 있습니다.</p>
      <div class="skeleton-grid">${placeholders}</div>
    </section>
  `;
}

function renderErrorMarkup(message) {
  return `
    <section class="error-shell">
      <h2 class="error-title">데이터 로드 실패</h2>
      <p class="error-copy">${escapeHtml(message)}</p>
      <div class="error-actions">
        <button class="primary-button" type="button" data-action="retry">Retry</button>
        <a class="secondary-button" href="${escapeAttribute(CONFIG.SHEET_SOURCE_URL)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">
          Open Google Sheets
        </a>
      </div>
    </section>
  `;
}

function renderEmptyMarkup() {
  const isFavorites = state.activeCategory === FAVORITES_TAB_KEY && !state.query;
  const isSearch = !!state.query;

  if (isSearch) {
    const tokens = queryTokens();
    const suggestion = tokens.length > 1 ? escapeHtml(tokens.slice(0, -1).join(' ')) : '';
    const topCategories = CONFIG.SHEETS.slice(0, 3)
      .map((s) => `<button class="secondary-button" type="button" data-category="${s.key}" data-action="navigate">${escapeHtml(s.label)}</button>`)
      .join('');
    return `
      <section class="empty-shell">
        <h2 class="empty-title">No results for "${escapeHtml(state.query)}"</h2>
        <p class="empty-copy">
          ${suggestion ? `Try searching for "${suggestion}" instead, or browse a category:` : 'Try a shorter search term, or browse a category:'}
        </p>
        <div class="empty-actions">
          <button class="primary-button" type="button" data-action="clear-search">Clear search</button>
          ${topCategories}
        </div>
      </section>
    `;
  }

  if (isFavorites) {
    const topCategories = CONFIG.SHEETS.slice(0, 3)
      .map((s) => {
        const count = state.items.filter((item) => item.key === s.key).length;
        return `<button class="secondary-button" type="button" data-category="${s.key}" data-action="navigate">${escapeHtml(s.label)} (${count})</button>`;
      })
      .join('');
    return `
      <section class="empty-shell">
        <h2 class="empty-title">No favorites yet.</h2>
        <p class="empty-copy">Click ☆ on any prompt to save it here. Start exploring:</p>
        <div class="empty-actions">
          ${topCategories}
        </div>
      </section>
    `;
  }

  return `
    <section class="empty-shell">
      <h2 class="empty-title">No prompts found.</h2>
      <p class="empty-copy">Try a different search or switch categories.</p>
    </section>
  `;
}

function renderCardGrid(entries) {
  const tokens = queryTokens();
  return `<div class="prompt-grid">${entries.map((entry) => renderCard(entry.item, tokens)).join('')}</div>`;
}

function renderCard(item, tokens) {
  const isFavorite = state.favorites.has(item.id);
  return item.type === 'custom-gpt'
    ? renderCustomGptCard(item, tokens, isFavorite)
    : renderPromptCard(item, tokens, isFavorite);
}

function renderPromptCard(item, tokens, isFavorite) {
  const preview = truncateText(collapseWhitespace(item.prompt), 220);

  return `
    <article
      class="prompt-card prompt-card--prompt"
      tabindex="0"
      data-item-id="${item.id}"
      style="--card-accent:${item.accent}; --card-soft:${item.accentSoft};"
      aria-label="${escapeAttribute(`${item.title} 상세 보기`)}"
    >
      <div class="card-top">
        <div class="meta-cluster">
          <span class="number-badge">#${escapeHtml(item.displayNumber)}</span>
          <span class="category-pill">${escapeHtml(item.category)}</span>
        </div>
        <div class="card-quick-actions">
          ${renderFavoriteIconButton(item.id, isFavorite)}
          <button class="icon-button" type="button" data-action="copy" data-item-id="${item.id}" aria-label="프롬프트 복사" title="프롬프트 복사">
            ⧉
          </button>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${highlightText(item.title, tokens)}</h3>
        <p class="card-preview clamp-3">${highlightText(preview, tokens)}</p>
      </div>
      ${renderSampleSummary(item.sample)}
    </article>
  `;
}

function renderCustomGptCard(item, tokens, isFavorite) {
  const preview = truncateText(collapseWhitespace(item.description), 220);

  return `
    <article
      class="prompt-card prompt-card--custom"
      tabindex="0"
      data-item-id="${item.id}"
      style="--card-accent:${item.accent}; --card-soft:${item.accentSoft};"
      aria-label="${escapeAttribute(`${item.title} 상세 보기`)}"
    >
      <div class="card-top">
        <div class="meta-cluster">
          <span class="number-badge">#${escapeHtml(item.displayNumber)}</span>
          <span class="category-pill">${escapeHtml(item.category)}</span>
        </div>
        <div class="card-quick-actions">
          ${renderFavoriteIconButton(item.id, isFavorite)}
        </div>
      </div>
      <div class="card-body">
        <span class="card-kicker">Custom GPT</span>
        <h3 class="card-title">${highlightText(item.title, tokens)}</h3>
        <p class="card-author">by ${escapeHtml(item.author || 'Unknown')}</p>
        <p class="card-preview clamp-4">${highlightText(preview, tokens)}</p>
        <div class="card-actions card-actions--inline">
          ${
            item.link
              ? `<a class="resource-link resource-link--strong" href="${escapeAttribute(item.link)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">Open in ChatGPT ↗</a>`
              : '<span class="mini-chip">Link unavailable</span>'
          }
        </div>
      </div>
    </article>
  `;
}

function renderFavoriteIconButton(itemId, isFavorite) {
  return `
    <button
      class="icon-button ${isFavorite ? 'active' : ''}"
      type="button"
      data-action="favorite"
      data-item-id="${itemId}"
      aria-pressed="${isFavorite}"
      aria-label="${isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}"
      title="${isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}"
    >
      ${isFavorite ? '★' : '☆'}
    </button>
  `;
}

function renderSampleSummary(sample) {
  if (!sample.links.length && !sample.text) {
    return '';
  }

  const links = sample.links.slice(0, 2)
    .map((link) => `
      <a class="resource-link" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">
        ${escapeHtml(link.label)}
      </a>
    `)
    .join('');

  return `
    <div class="resource-row">
      ${links}
      ${sample.links.length > 2 ? `<span class="mini-chip">+${escapeHtml(String(sample.links.length - 2))} more</span>` : ''}
      ${sample.text ? `<span class="mini-chip">${escapeHtml(truncateText(sample.text, 60))}</span>` : ''}
    </div>
  `;
}

function renderCustomGptSummary(item) {
  return item.link
    ? `<div class="resource-row"><span class="mini-chip">${escapeHtml(linkLabel(item.link, 0))}</span></div>`
    : '';
}

function renderList(entries) {
  const tokens = queryTokens();
  return `
    <div class="list-wrap">
      <div class="list-header">
        <span>번호</span>
        <span>설명</span>
        <span>미리보기</span>
        <span>액션</span>
      </div>
      ${entries.map((entry) => renderListRow(entry.item, tokens)).join('')}
    </div>
  `;
}

function renderListRow(item, tokens) {
  const isFavorite = state.favorites.has(item.id);
  return item.type === 'custom-gpt'
    ? renderCustomGptListRow(item, tokens, isFavorite)
    : renderPromptListRow(item, tokens, isFavorite);
}

function renderPromptListRow(item, tokens, isFavorite) {
  const preview = truncateText(collapseWhitespace(item.prompt), 160);

  return `
    <article
      class="list-row"
      tabindex="0"
      data-item-id="${item.id}"
      style="--card-accent:${item.accent}; --card-soft:${item.accentSoft};"
      aria-label="${escapeAttribute(`${item.title} 상세 보기`)}"
    >
      <div class="list-stack">
        <div class="list-meta">
          <span class="number-badge">#${escapeHtml(item.displayNumber)}</span>
          <span class="category-pill">${escapeHtml(item.category)}</span>
        </div>
      </div>
      <div class="list-stack">
        <h3 class="list-title">${highlightText(item.title, tokens)}</h3>
      </div>
      <div class="list-stack">
        <p class="list-preview clamp-1">${highlightText(preview, tokens)}</p>
        ${item.sample.links.length ? `<div class="resource-links"><span class="mini-chip">${escapeHtml(String(item.sample.links.length))} sample links</span></div>` : ''}
      </div>
      <div class="list-actions">
        <button class="secondary-button ${isFavorite ? 'active' : ''}" type="button" data-action="favorite" data-item-id="${item.id}" aria-pressed="${isFavorite}">
          ${isFavorite ? 'Saved' : 'Save'}
        </button>
        <button class="primary-button" type="button" data-action="copy" data-item-id="${item.id}">Copy</button>
      </div>
    </article>
  `;
}

function renderCustomGptListRow(item, tokens, isFavorite) {
  const preview = truncateText(collapseWhitespace(item.description), 180);

  return `
    <article
      class="list-row list-row--custom"
      tabindex="0"
      data-item-id="${item.id}"
      style="--card-accent:${item.accent}; --card-soft:${item.accentSoft};"
      aria-label="${escapeAttribute(`${item.title} 상세 보기`)}"
    >
      <div class="list-stack">
        <div class="list-meta">
          <span class="number-badge">#${escapeHtml(item.displayNumber)}</span>
          <span class="category-pill">${escapeHtml(item.category)}</span>
        </div>
      </div>
      <div class="list-stack">
        <span class="list-kicker">Custom GPT</span>
        <h3 class="list-title">${highlightText(item.title, tokens)}</h3>
        <p class="list-author">by ${escapeHtml(item.author || 'Unknown')}</p>
      </div>
      <div class="list-stack">
        <p class="list-preview clamp-2">${highlightText(preview, tokens)}</p>
        ${item.link ? `<div class="resource-links"><span class="mini-chip">${escapeHtml(linkLabel(item.link, 0))}</span></div>` : ''}
      </div>
      <div class="list-actions">
        <button class="secondary-button ${isFavorite ? 'active' : ''}" type="button" data-action="favorite" data-item-id="${item.id}" aria-pressed="${isFavorite}">
          ${isFavorite ? 'Saved' : 'Save'}
        </button>
        ${
          item.link
            ? `<a class="primary-button" href="${escapeAttribute(item.link)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">Open GPT</a>`
            : '<button class="primary-button" type="button" disabled>Open GPT</button>'
        }
      </div>
    </article>
  `;
}

function renderModal() {
  if (!state.modalId) {
    if (elements.modalRoot.open) {
      elements.modalRoot.close();
    }
    elements.body.classList.remove('is-modal-open');
    elements.modalBody.innerHTML = '';
    return;
  }

  const item = state.items.find((entry) => entry.id === state.modalId);
  if (!item) {
    closeModal();
    return;
  }

  const isFavorite = state.favorites.has(item.id);
  const entries = getVisibleEntries();
  const currentIndex = entries.findIndex((e) => e.item.id === item.id);
  const totalCount = entries.length;
  const hasPrev = totalCount > 1;
  const hasNext = totalCount > 1;

  const navBar = totalCount > 1 ? `
    <div class="modal-nav">
      <button class="icon-button" type="button" data-action="modal-prev" aria-label="Previous prompt" ${!hasPrev ? 'disabled' : ''}>&#8592;</button>
      <span class="modal-position">${currentIndex + 1} of ${totalCount}</span>
      <button class="icon-button" type="button" data-action="modal-next" aria-label="Next prompt" ${!hasNext ? 'disabled' : ''}>&#8594;</button>
    </div>
  ` : '';

  const header = `
    <div class="modal-top">
      <span class="number-badge">#${escapeHtml(item.displayNumber)}</span>
      <span class="category-pill" style="--card-accent:${item.accent}; --card-soft:${item.accentSoft};">${escapeHtml(item.category)}</span>
      <span class="type-badge">${item.type === 'custom-gpt' ? 'Custom GPT' : 'Prompt'}</span>
      ${navBar}
    </div>
    <h2 id="modal-title" class="modal-title">${escapeHtml(item.title)}</h2>
    ${item.type === 'custom-gpt'
      ? `<p class="modal-copy">${escapeHtml(item.author ? `by ${item.author}` : 'Custom GPT 링크와 설명')}</p>`
      : '<p class="modal-copy">프롬프트 전문을 그대로 복사할 수 있습니다.</p>'}
  `;

  const actions = `
    <div class="modal-actions">
      ${
        item.type === 'custom-gpt'
          ? (item.link
            ? `<a class="primary-button" href="${escapeAttribute(item.link)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">Open GPT</a>`
            : '<button class="primary-button" type="button" disabled>Open GPT</button>')
          : `<button class="primary-button" type="button" data-action="copy" data-item-id="${item.id}">Copy Prompt</button>`
      }
      <button class="secondary-button ${isFavorite ? 'active' : ''}" type="button" data-action="favorite" data-item-id="${item.id}" aria-pressed="${isFavorite}">
        ${isFavorite ? 'Saved' : 'Save'}
      </button>
      ${item.type === 'custom-gpt' && item.link ? `<button class="secondary-button" type="button" data-action="copy-link" data-item-id="${item.id}">Copy Link</button>` : ''}
    </div>
  `;

  const body = item.type === 'custom-gpt'
    ? `<section class="modal-section"><h3 class="section-title">Description</h3><div class="description-block"><pre>${escapeHtml(item.description || '설명이 없습니다.')}</pre></div></section>`
    : `<section class="modal-section"><h3 class="section-title">Prompt</h3><div class="prompt-block"><pre>${escapeHtml(item.prompt)}</pre></div></section>`;

  elements.modalBody.innerHTML = `${header}${actions}${body}${item.type === 'prompt' ? renderModalResources(item.sample) : ''}`;
  if (!elements.modalRoot.open) {
    elements.modalRoot.showModal();
    elements.body.classList.add('is-modal-open');
  }
}

function renderModalResources(sample) {
  if (!sample.links.length && !sample.text) {
    return '';
  }

  const gallery = sample.images.length
    ? `<div class="sample-gallery">${sample.images.map((image) => `
      <a class="sample-thumb" href="${escapeAttribute(image.url)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">
        <img
          src="${escapeAttribute(image.url)}"
          alt="Sample preview"
          loading="lazy"
          data-fallback-label="${escapeAttribute(image.label)}"
        >
        <span class="sample-thumb-fallback" hidden>${escapeHtml(image.label)}</span>
      </a>`).join('')}</div>`
    : '';

  const links = sample.links.length
    ? `<div class="resource-links">${sample.links.map((link) => `
      <a class="resource-link" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer noopener" data-inline-link="true">
        ${escapeHtml(link.label)}
      </a>`).join('')}</div>`
    : '';

  const text = sample.text ? `<div class="description-block"><pre>${escapeHtml(sample.text)}</pre></div>` : '';

  return `<section class="modal-section"><h3 class="section-title">Sample Results</h3>${gallery}${links}${text}</section>`;
}

function handleImageError(event) {
  if (!(event.target instanceof HTMLImageElement)) {
    return;
  }

  const link = event.target.closest('.sample-thumb');
  if (!link) {
    return;
  }

  link.classList.add('is-broken');
  const fallback = link.querySelector('.sample-thumb-fallback');
  if (fallback) {
    fallback.hidden = false;
  }
  event.target.remove();
}

// === ACTIONS ===

function handleContentClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    event.preventDefault();
    runAction(actionButton.dataset.action, actionButton.dataset.itemId, actionButton);
    return;
  }

  if (event.target.closest('[data-inline-link]')) {
    return;
  }

  const openable = event.target.closest('[data-item-id]');
  if (openable) {
    openModal(openable.dataset.itemId);
  }
}

function handleContentKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  if (event.target.closest('[data-action]') || event.target.closest('[data-inline-link]')) {
    return;
  }

  const card = event.target.closest('[data-item-id]');
  if (!card) {
    return;
  }

  event.preventDefault();
  openModal(card.dataset.itemId);
}

function runAction(action, itemId, actionButton) {
  if (action === 'retry') {
    clearSessionCache();
    boot(true);
    return;
  }

  if (action === 'clear-search') {
    elements.searchInput.value = '';
    elements.searchClear.hidden = true;
    state.query = '';
    render();
    return;
  }

  if (action === 'modal-prev' || action === 'modal-next') {
    navigateModal(action === 'modal-next' ? 1 : -1);
    return;
  }

  if (action === 'navigate' && actionButton) {
    const category = actionButton.dataset.category;
    if (category) {
      state.query = '';
      elements.searchInput.value = '';
      elements.searchClear.hidden = true;
      navigateTo(category);
    }
    return;
  }

  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  if (action === 'favorite') {
    toggleFavorite(item.id);
    return;
  }

  if (action === 'copy' && item.type === 'prompt') {
    copyToClipboard(item.prompt, '✓ Copied to clipboard!');
    return;
  }

  if (action === 'copy-link' && item.type === 'custom-gpt' && item.link) {
    copyToClipboard(item.link, '✓ GPT link copied!');
  }
}

function openModal(itemId) {
  state.modalTrigger = document.activeElement;
  const item = state.items.find((entry) => entry.id === itemId);
  if (item) {
    window.location.hash = `#${item.key}/${itemId}`;
  }
}

function closeModal() {
  const trigger = state.modalTrigger;
  state.modalTrigger = null;
  window.location.hash = `#${state.activeCategory}`;
  if (trigger && typeof trigger.focus === 'function') {
    trigger.focus();
  }
}

function toggleFavorite(itemId) {
  if (state.favorites.has(itemId)) {
    state.favorites.delete(itemId);
    showToast('Removed from favorites');
  } else {
    state.favorites.add(itemId);
    showToast('Saved to favorites');
  }

  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...state.favorites]));
  render();
}

function copyToClipboard(text, message) {
  const clipboardPromise = navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
    ? navigator.clipboard.writeText(text)
    : Promise.reject(new Error('Clipboard API unavailable'));

  return clipboardPromise
    .catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!ok) {
        throw new Error('execCommand copy failed');
      }
    })
    .then(() => {
      showToast(message);
    })
    .catch(() => {
      showToast('Copy failed — try selecting the text manually.');
    });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  elements.toastRoot.appendChild(toast);
  window.setTimeout(() => toast.remove(), CONFIG.TOAST_DURATION_MS);
}

function setViewMode(mode) {
  state.viewMode = mode === 'list' ? 'list' : 'card';
  localStorage.setItem(STORAGE_KEYS.viewMode, state.viewMode);
  syncControlState();
  render();
}

function syncControlState() {
  elements.root.dataset.theme = state.theme;
  elements.viewCard.classList.toggle('active', state.viewMode === 'card');
  elements.viewList.classList.toggle('active', state.viewMode === 'list');
  elements.sortSelect.value = state.sortMode;
  elements.searchClear.hidden = !elements.searchInput.value;
  updateThemeToggle();
}

function applyTheme() {
  elements.root.dataset.theme = state.theme;
  updateThemeToggle();
}

function updateThemeToggle() {
  const isDark = state.theme === 'dark';
  const nextLabel = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
  elements.themeToggle.textContent = isDark ? '☀' : '☾';
  elements.themeToggle.setAttribute('aria-label', nextLabel);
  elements.themeToggle.setAttribute('title', nextLabel);
}

function updateScrollButton() {
  elements.scrollTop.classList.toggle('show', window.scrollY > 420);
}

function getVisibleEntries() {
  const tokens = queryTokens();
  const entries = [];

  if (tokens.length) {
    for (const item of state.items) {
      const score = searchScore(item, tokens);
      if (score > -1) {
        entries.push({ item, score });
      }
    }
  } else if (state.activeCategory === FAVORITES_TAB_KEY) {
    for (const item of state.items) {
      if (state.favorites.has(item.id)) {
        entries.push({ item, score: 0 });
      }
    }
  } else {
    for (const item of state.items) {
      if (item.key === state.activeCategory) {
        entries.push({ item, score: 0 });
      }
    }
  }

  entries.sort((left, right) => compareEntries(left, right, tokens.length > 0));
  return entries;
}

function compareEntries(left, right, isSearch) {
  if (isSearch && right.score !== left.score) {
    return right.score - left.score;
  }

  if (state.sortMode === 'title') {
    const titleDiff = collator.compare(left.item.title, right.item.title);
    if (titleDiff !== 0) {
      return titleDiff;
    }
  }

  if (left.item.order !== right.item.order) {
    return left.item.order - right.item.order;
  }

  return left.item.sortIndex - right.item.sortIndex;
}

function searchScore(item, tokens) {
  let score = 0;
  const joinedQuery = tokens.join(' ');

  for (const token of tokens) {
    if (!item.searchBlob.includes(token)) {
      return -1;
    }
    if (item.searchTitle.includes(token)) {
      score += 120;
    }
    if (item.searchBody.includes(token)) {
      score += 26;
    }
    if (item.category.toLowerCase().includes(token)) {
      score += 18;
    }
  }

  if (joinedQuery && item.searchTitle.includes(joinedQuery)) {
    score += 90;
  }
  if (joinedQuery && item.searchBody.includes(joinedQuery)) {
    score += 18;
  }

  return score;
}

function getCategoryCounts() {
  const counts = new Map(CONFIG.SHEETS.map((sheet) => [sheet.key, 0]));
  for (const item of state.items) {
    counts.set(item.key, (counts.get(item.key) || 0) + 1);
  }
  return counts;
}

function countExistingFavorites() {
  const ids = new Set(state.items.map((item) => item.id));
  let count = 0;
  for (const favoriteId of state.favorites) {
    if (ids.has(favoriteId)) {
      count += 1;
    }
  }
  return count;
}

function queryTokens() {
  return state.query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function getCacheKey(gid) {
  return `${CACHE_PREFIX}:${gid}`;
}

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeSessionCache(key, items) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), items }));
  } catch (error) {
    // noop
  }
}

function clearSessionCache() {
  try {
    const keysToDelete = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => sessionStorage.removeItem(key));
  } catch (error) {
    // noop
  }
}

function isFreshCache(timestamp) {
  return Date.now() - timestamp < CONFIG.CACHE_DURATION_MS;
}

function readStoredArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function initTabScrollFade() {
  const tabs = elements.categoryTabs;
  const wrap = tabs.parentElement;

  function updateFade() {
    const canScrollLeft = tabs.scrollLeft > 2;
    const canScrollRight = tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2;
    wrap.classList.toggle('fade-left', canScrollLeft);
    wrap.classList.toggle('fade-right', canScrollRight);
  }

  tabs.addEventListener('scroll', updateFade, { passive: true });
  window.addEventListener('resize', updateFade, { passive: true });
  updateFade();
}

function initTipBar() {
  if (readStoredString(STORAGE_KEYS.tipDismissed, '') === '1') {
    return;
  }
  elements.tipBar.hidden = false;
  elements.tipDismiss.addEventListener('click', () => {
    elements.tipBar.hidden = true;
    localStorage.setItem(STORAGE_KEYS.tipDismissed, '1');
  });
}

// === ROUTING ===

function navigateModal(direction) {
  const entries = getVisibleEntries();
  if (entries.length === 0) {
    return;
  }
  const currentIndex = entries.findIndex((e) => e.item.id === state.modalId);
  const nextIndex = (currentIndex + direction + entries.length) % entries.length;
  const nextItem = entries[nextIndex].item;
  state.modalId = nextItem.id;
  window.location.hash = `#${nextItem.key}/${nextItem.id}`;
}

function navigateTo(category, modalId) {
  if (modalId) {
    window.location.hash = `#${category}/${modalId}`;
  } else {
    window.location.hash = `#${category}`;
  }
}

function applyHash() {
  try {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    const parts = raw.split('/');
    const category = parts[0] || '';
    const modalId = parts[1] || '';

    const validCategories = new Set([FAVORITES_TAB_KEY, ...CONFIG.SHEETS.map((s) => s.key)]);
    if (category && validCategories.has(category)) {
      state.activeCategory = category;
    }

    if (modalId && state.items.some((item) => item.id === modalId)) {
      state.modalTrigger = document.activeElement;
      state.modalId = modalId;
    } else {
      state.modalId = null;
    }
  } catch (error) {
    // Malformed hash — ignore
  }
}

function readStoredString(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (error) {
    return fallback;
  }
}

// === UTILITIES ===

function debounce(callback, wait) {
  let timeoutId = 0;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function cellText(cell) {
  if (!cell) {
    return '';
  }
  if (typeof cell.v === 'string') {
    return cell.v.trim();
  }
  if (cell.f) {
    return String(cell.f).trim();
  }
  if (cell.v === null || cell.v === undefined) {
    return '';
  }
  return String(cell.v).trim();
}

function cellDisplay(cell, fallback) {
  return cell && cell.f ? String(cell.f).trim() : String(fallback);
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function extractUrls(value) {
  const matches = value.match(URL_PATTERN) || [];
  const unique = new Set();
  for (const match of matches) {
    unique.add(match.replace(/[),.;]+$/g, ''));
  }
  return [...unique].map((url) => safeUrl(url)).filter(Boolean);
}

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch (error) {
    return '';
  }
  return '';
}

function linkLabel(url, index) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.includes('drive.google.com')) {
      return `View on Drive${index ? ` ${index + 1}` : ''}`;
    }
    if (host.includes('codepen.io')) {
      return `View on CodePen${index ? ` ${index + 1}` : ''}`;
    }
    if (host.includes('chat.openai.com') || host.includes('chatgpt.com')) {
      return `Open in ChatGPT${index ? ` ${index + 1}` : ''}`;
    }
    if (IMAGE_PATTERN.test(parsed.pathname)) {
      return `Open image${index ? ` ${index + 1}` : ''}`;
    }
  } catch (error) {
    // noop
  }
  return `Open sample${index ? ` ${index + 1}` : ''}`;
}

function highlightText(value, tokens) {
  if (!value) {
    return '';
  }
  if (!tokens.length) {
    return escapeHtml(value);
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  return value
    .split(pattern)
    .map((segment, index) => (index % 2 === 1 ? `<mark>${escapeHtml(segment)}</mark>` : escapeHtml(segment)))
    .join('');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
