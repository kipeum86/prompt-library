// === CONFIG ===

const CONFIG = {
  SPREADSHEET_ID: '1FP11gpL9_HpbfU_NXkZQ_tQgqtbm8aUAP27E2GJj564',
  SHEET_SOURCE_URL:
    'https://docs.google.com/spreadsheets/d/1FP11gpL9_HpbfU_NXkZQ_tQgqtbm8aUAP27E2GJj564/edit?gid=1502618237#gid=1502618237',
  CACHE_DURATION_MS: 5 * 60 * 1000,
  SEARCH_DEBOUNCE_MS: 300,
  TOAST_DURATION_MS: 2000,
  LEDE_FALLBACK: 'A reusable prompt from the working cabinet — written, tested, and kept.',
  SHEETS: [
    { key: 'writing',       gid: '0',          label: 'Writing',       kind: 'prompt' },
    { key: 'reading',       gid: '723314194',  label: 'Reading',       kind: 'prompt' },
    { key: 'nb',            gid: '2036141593', label: 'NB',            kind: 'prompt' },
    { key: 'nb-pro',        gid: '1752008553', label: 'NB Pro',        kind: 'prompt' },
    { key: '4o-image',      gid: '1770278489', label: '4o Image',      kind: 'prompt' },
    { key: 'research',      gid: '1502618237', label: 'Research',      kind: 'prompt' },
    { key: 'dashboard',     gid: '850880156',  label: 'Dashboard',     kind: 'prompt' },
    { key: 'agent-builder', gid: '1198339301', label: 'Agent Builder', kind: 'prompt' },
  ],
};

const STORAGE_KEYS = {
  favorites: 'kp-prompt-favorites',
  uses: 'kp-prompt-uses-v1',
};

const CACHE_PREFIX = 'kp-prompt-sheet-cache-v1';
const CAT_ALL = 'all';
const CAT_FAVORITES = 'favorites';
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const metaByKey = new Map(CONFIG.SHEETS.map((sheet, index) => [sheet.key, { ...sheet, order: index }]));

// === STATE ===

const state = {
  items: [],
  category: CAT_ALL,
  activeId: null,
  query: '',
  favorites: new Set(readStoredArray(STORAGE_KEYS.favorites)),
  uses: readStoredObject(STORAGE_KEYS.uses),
  mobileView: 'list',
  mode: computeMode(window.innerWidth),
  loading: true,
  error: null,
  warnings: [],
  menuOpen: false,
};

const elements = {};

// === BOOT ===

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  renderColophon();
  applyMode();
  applyHash();
  render();
  boot();
});

function cacheElements() {
  elements.body = document.body;
  elements.searchInput = document.getElementById('search-input');
  elements.searchInputMobile = document.getElementById('search-input-mobile');
  elements.railCategories = document.getElementById('rail-categories');
  elements.menuSheet = document.getElementById('menu-sheet');
  elements.menuSheetBackdrop = document.getElementById('menu-sheet-backdrop');
  elements.menuSheetCategories = document.getElementById('menu-sheet-categories');
  elements.menuChip = document.getElementById('menu-chip');
  elements.menuChipLabel = document.getElementById('menu-chip-label');
  elements.listTitle = document.getElementById('list-title');
  elements.listCount = document.getElementById('list-count');
  elements.listRows = document.getElementById('list-rows');
  elements.readerArticle = document.getElementById('reader-article');
  elements.readerBack = document.getElementById('reader-back');
  elements.srAnnounce = document.getElementById('sr-announce');
  elements.toastRoot = document.getElementById('toast-root');
  elements.colophonDate = document.getElementById('colophon-date');
}

function bindEvents() {
  const debouncedSearch = debounce((value) => {
    state.query = value.trim();
    render();
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  const onSearch = (event) => {
    const value = event.target.value || '';
    // keep both inputs in sync
    if (elements.searchInput.value !== value) elements.searchInput.value = value;
    if (elements.searchInputMobile.value !== value) elements.searchInputMobile.value = value;
    debouncedSearch(value);
  };
  elements.searchInput.addEventListener('input', onSearch);
  elements.searchInputMobile.addEventListener('input', onSearch);

  // Category clicks (both rail and menu sheet)
  const onCategoryClick = (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    setCategory(button.dataset.category);
    state.menuOpen = false;
    applyMenuSheet();
  };
  elements.railCategories.addEventListener('click', onCategoryClick);
  elements.menuSheetCategories.addEventListener('click', onCategoryClick);

  elements.menuChip.addEventListener('click', () => {
    state.menuOpen = !state.menuOpen;
    applyMenuSheet();
  });
  elements.menuSheetBackdrop.addEventListener('click', () => {
    state.menuOpen = false;
    applyMenuSheet();
  });

  // List row selection
  elements.listRows.addEventListener('click', (event) => {
    const heart = event.target.closest('[data-action="favorite"]');
    if (heart) {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(heart.dataset.itemId);
      return;
    }
    const row = event.target.closest('[data-item-id]');
    if (!row) return;
    setActiveId(row.dataset.itemId, { showReader: true });
  });

  // Reader action buttons
  elements.readerArticle.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const kind = action.dataset.action;
    const id = action.dataset.itemId;
    if (kind === 'copy') {
      copyActive();
    } else if (kind === 'favorite') {
      toggleFavorite(id);
    } else if (kind === 'retry') {
      clearSessionCache();
      boot(true);
    }
  });

  elements.readerArticle.addEventListener('error', handleImageError, true);

  elements.readerBack.addEventListener('click', () => {
    state.mobileView = 'list';
    elements.body.dataset.mobileView = 'list';
  });

  // Hash + resize
  window.addEventListener('hashchange', () => {
    applyHash();
    render();
  });

  window.addEventListener('resize', () => {
    const next = computeMode(window.innerWidth);
    if (next !== state.mode) {
      state.mode = next;
      applyMode();
    }
  }, { passive: true });

  // Keyboard
  window.addEventListener('keydown', handleKeydown);
}

// === DATA ===

async function boot(forceRefresh = false) {
  state.loading = true;
  state.error = null;
  state.warnings = [];
  render();

  try {
    const result = await loadAllSheets(forceRefresh);
    state.items = result.items;
    state.warnings = result.warnings;
    state.loading = false;

    // Rehydrate active from hash now that items exist
    applyHash();
    // Pick a default if none selected yet
    if (!state.activeId || !state.items.some((i) => i.id === state.activeId)) {
      const first = getVisibleItems()[0];
      state.activeId = first ? first.id : null;
    }
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
        warnings.push(`${sheet.label} 시트는 세션 캐시를 사용했습니다.`);
      }
      return result.items;
    } catch (error) {
      warnings.push(`${sheet.label} 시트를 불러오지 못해 제외했습니다.`);
      return [];
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
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${sheet.gid}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
  if (!match) throw new Error('Google Visualization 응답 파싱 실패.');
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

  if (!title && !prompt) return null;

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

  if (!title && !description) return null;

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

// === STATE MUTATORS ===

function setCategory(category) {
  if (state.category === category) return;
  state.category = category;
  // Keep active if still visible; otherwise pick first
  const visible = getVisibleItems();
  if (!visible.some((i) => i.id === state.activeId)) {
    state.activeId = visible[0] ? visible[0].id : null;
  }
  writeHash();
  render();
}

function setActiveId(id, opts = {}) {
  const same = state.activeId === id;
  state.activeId = id;
  if (opts.showReader && state.mode === 'mobile') {
    state.mobileView = 'reader';
    elements.body.dataset.mobileView = 'reader';
  }
  if (same && !opts.force) return;
  writeHash();
  render();
}

function toggleFavorite(itemId) {
  if (!itemId) return;
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

function incrementUses(itemId) {
  state.uses[itemId] = (state.uses[itemId] || 0) + 1;
  try {
    localStorage.setItem(STORAGE_KEYS.uses, JSON.stringify(state.uses));
  } catch (error) {
    // noop
  }
}

function copyActive() {
  const item = getActiveItem();
  if (!item) return;
  const text = item.type === 'custom-gpt' ? (item.link || item.description) : item.prompt;
  if (!text) return;
  copyToClipboard(text, '✓ Copied to clipboard');
  incrementUses(item.id);
  render();
}

// === RENDER ===

function render() {
  renderCategories();
  renderList();
  renderReader();
}

function renderColophon() {
  const d = new Date();
  const month = d.toLocaleString('en', { month: 'short' }).toUpperCase();
  elements.colophonDate.textContent = `${month} ${d.getFullYear()}`;
}

function applyMode() {
  elements.body.dataset.mode = state.mode;
  if (state.mode !== 'mobile') {
    state.mobileView = 'list';
    elements.body.dataset.mobileView = 'list';
  } else {
    elements.body.dataset.mobileView = state.activeId ? state.mobileView : 'list';
  }
}

function applyMenuSheet() {
  elements.menuSheet.hidden = !state.menuOpen;
  elements.menuChip.setAttribute('aria-expanded', String(state.menuOpen));
}

function computeMode(w) {
  if (w < 720) return 'mobile';
  if (w < 1100) return 'tablet';
  return 'desktop';
}

function renderCategories() {
  const counts = getCategoryCounts();
  const favCount = countExistingFavorites();

  const sheetTabs = CONFIG.SHEETS.map((sheet) => ({
    key: sheet.key,
    label: sheet.label,
    count: counts.get(sheet.key) || 0,
  }));

  const html = `
    <div class="rail-categories-section">
      <p class="rail-section-label">Categories</p>
      ${renderCatButton({ key: CAT_ALL, label: 'All', count: state.items.length })}
      ${sheetTabs.map(renderCatButton).join('')}
    </div>
    <div class="rail-categories-section">
      <p class="rail-section-label">Collection</p>
      ${renderCatButton({ key: CAT_FAVORITES, label: 'Favorites', count: favCount })}
    </div>
  `;

  elements.railCategories.innerHTML = html;
  elements.menuSheetCategories.innerHTML = html;

  elements.menuChipLabel.textContent = categoryLabel(state.category);
}

function renderCatButton(tab) {
  const isActive = tab.key === state.category;
  return `
    <button
      type="button"
      class="cat-button ${isActive ? 'active' : ''}"
      data-category="${escapeAttribute(tab.key)}"
      aria-current="${isActive ? 'true' : 'false'}"
    >
      <span class="cat-button-dash" aria-hidden="true">—</span>
      <span class="cat-button-label">${escapeHtml(tab.label)}</span>
      <span class="cat-button-count">${escapeHtml(String(tab.count))}</span>
    </button>
  `;
}

function renderList() {
  const items = getVisibleItems();
  const tokens = queryTokens();
  const categoryName = categoryLabel(state.category);

  elements.listTitle.textContent = state.query
    ? `“${state.query}”`
    : categoryName;

  const countWord = items.length === 1 ? 'entry' : 'entries';
  elements.listCount.textContent = state.loading
    ? 'loading…'
    : `${items.length} ${countWord}`;

  if (state.loading) {
    elements.listRows.innerHTML = renderListSkeleton();
    return;
  }

  if (state.error) {
    elements.listRows.innerHTML = `
      <li class="list-error">
        <h3 class="list-error-title">Could not load</h3>
        <p class="list-error-body">${escapeHtml(state.error.message)}</p>
        <button class="btn btn-ghost" type="button" data-action="retry">Retry</button>
      </li>
    `;
    return;
  }

  if (!items.length) {
    const msg = state.query
      ? `— no entries match “${escapeHtml(state.query)}” —`
      : state.category === CAT_FAVORITES
        ? '— no favorites yet —'
        : '— no entries —';
    elements.listRows.innerHTML = `<li class="list-empty">${msg}</li>`;
    return;
  }

  elements.listRows.innerHTML = items.map((item) => renderListRow(item, tokens)).join('');
  announce(`${items.length} ${countWord} in ${categoryName}`);
}

function renderListSkeleton() {
  return new Array(5).fill(0).map(() => `
    <li class="list-row">
      <div class="list-row-button" aria-hidden="true">
        <div class="list-row-meta">
          <span class="meta-num">—</span>
          <span class="meta-cat">loading</span>
        </div>
        <div class="list-row-title" style="color: var(--ink-25)">Loading…</div>
        <div class="list-row-snip">Fetching prompts from Google Sheets.</div>
      </div>
    </li>
  `).join('');
}

function renderListRow(item, tokens) {
  const isActive = item.id === state.activeId;
  const isFav = state.favorites.has(item.id);
  const snipText = item.type === 'custom-gpt'
    ? collapseWhitespace(item.description || '')
    : collapseWhitespace(item.prompt || '');
  const uses = state.uses[item.id] || 0;
  const footer = item.type === 'custom-gpt'
    ? (item.author ? `by ${item.author}` : 'Custom GPT')
    : (uses ? `used ${uses}×` : `${(item.prompt || '').length} chars`);

  return `
    <li class="list-row ${isActive ? 'active' : ''}" role="option" aria-selected="${isActive}">
      <button class="list-row-button" type="button" data-item-id="${escapeAttribute(item.id)}">
        <div class="list-row-meta">
          <span class="meta-num">${escapeHtml(padNumber(item.displayNumber))}</span>
          <span class="meta-cat">${escapeHtml(item.category)}</span>
          <span class="meta-spacer"></span>
          <span
            class="heart-button"
            role="button"
            tabindex="0"
            aria-label="${isFav ? 'Unfavorite' : 'Favorite'}"
            aria-pressed="${isFav}"
            data-action="favorite"
            data-item-id="${escapeAttribute(item.id)}"
          >${isFav ? '♥' : '♡'}</span>
        </div>
        <h3 class="list-row-title">${highlightText(item.title, tokens)}</h3>
        <p class="list-row-snip">${highlightText(truncateText(snipText, 180), tokens)}</p>
        <div class="list-row-footer">${escapeHtml(footer)}</div>
      </button>
    </li>
  `;
}

function renderReader() {
  if (state.loading) {
    elements.readerArticle.innerHTML = `
      <div class="reader-loading">
        <h1 class="reader-loading-title">Loading the cabinet…</h1>
        <p class="reader-loading-body">Pulling entries from Google Sheets.</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    elements.readerArticle.innerHTML = `
      <div class="reader-error">
        <h1 class="reader-error-title">Could not load</h1>
        <p class="reader-error-body">${escapeHtml(state.error.message)}</p>
        <div class="reader-actions">
          <button class="btn btn-primary" type="button" data-action="retry">Retry</button>
          <a class="btn btn-ghost" href="${escapeAttribute(CONFIG.SHEET_SOURCE_URL)}" target="_blank" rel="noreferrer noopener">Open source sheet ↗</a>
        </div>
      </div>
    `;
    return;
  }

  const item = getActiveItem();
  if (!item) {
    elements.readerArticle.innerHTML = `
      <div class="reader-empty">Choose an entry from the list.</div>
    `;
    return;
  }

  const isFav = state.favorites.has(item.id);
  const uses = state.uses[item.id] || 0;
  const body = item.type === 'custom-gpt' ? (item.description || '') : (item.prompt || '');
  const bodyChars = body.length;
  const isPrompt = item.type === 'prompt';

  const lede = isPrompt
    ? CONFIG.LEDE_FALLBACK
    : (item.author ? `by ${item.author}.` : CONFIG.LEDE_FALLBACK);

  const eyebrow = `
    <div class="reader-eyebrow">
      <span>№ ${escapeHtml(padNumber(item.displayNumber))}</span>
      <span class="reader-eyebrow-dot">·</span>
      <span>${escapeHtml(item.category)}</span>
      ${!isPrompt ? '<span class="reader-eyebrow-dot">·</span><span>Custom GPT</span>' : ''}
    </div>
  `;

  const tagRow = isPrompt
    ? `<div class="reader-tags"><span class="reader-tag">${escapeHtml(item.category)}</span></div>`
    : `<div class="reader-tags"><span class="reader-tag">${escapeHtml(item.category)}</span><span class="reader-tag">Custom GPT</span></div>`;

  const bodyClass = isPrompt ? 'reader-body reader-body--dropcap' : 'reader-body';

  const resources = isPrompt ? renderResources(item.sample) : renderCustomGptLink(item);

  const primaryAction = isPrompt
    ? `<button class="btn btn-primary" type="button" data-action="copy" data-item-id="${escapeAttribute(item.id)}">Copy prompt →</button>`
    : (item.link
      ? `<a class="btn btn-primary" href="${escapeAttribute(item.link)}" target="_blank" rel="noreferrer noopener">Open in ChatGPT →</a>`
      : `<button class="btn btn-primary" type="button" disabled>Link unavailable</button>`);

  const stats = `
    <div class="reader-stats">
      <div class="stat-cell">
        <span class="stat-value">${escapeHtml(String(uses))}</span>
        <span class="stat-label">Uses</span>
      </div>
      <div class="stat-cell">
        <span class="stat-value">${escapeHtml(String(bodyChars))}</span>
        <span class="stat-label">Chars</span>
      </div>
    </div>
  `;

  const footer = `
    <div class="reader-footer">
      ${stats}
      <div class="reader-actions">
        <button
          class="btn btn-ghost ${isFav ? 'active' : ''}"
          type="button"
          data-action="favorite"
          data-item-id="${escapeAttribute(item.id)}"
          aria-pressed="${isFav}"
        >${isFav ? '♥ Saved' : '♡ Save'}</button>
        ${primaryAction}
      </div>
    </div>
  `;

  const warnings = state.warnings.length
    ? `<div class="reader-warnings">${state.warnings.map(escapeHtml).join(' · ')}</div>`
    : '';

  elements.readerArticle.innerHTML = `
    ${eyebrow}
    <h1 class="reader-title">${escapeHtml(item.title || 'Untitled')}</h1>
    <p class="reader-lede">${escapeHtml(lede)}</p>
    ${tagRow}
    <div class="${bodyClass}">${escapeHtml(body)}</div>
    ${resources}
    ${footer}
    ${warnings}
  `;
}

function renderResources(sample) {
  if (!sample || (!sample.links.length && !sample.text)) return '';

  const gallery = sample.images.length
    ? `<div class="reader-sample-gallery">${sample.images.map((image) => `
        <a href="${escapeAttribute(image.url)}" target="_blank" rel="noreferrer noopener">
          <img src="${escapeAttribute(image.url)}" alt="Sample" loading="lazy" data-fallback-label="${escapeAttribute(image.label)}">
          <span class="reader-sample-fallback" hidden>${escapeHtml(image.label)}</span>
        </a>
      `).join('')}</div>`
    : '';

  const nonImageLinks = sample.links.filter((l) => !l.isImage);
  const links = nonImageLinks.length
    ? nonImageLinks.map((link) => `
        <a class="reader-resource-link" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(link.label)}</a>
      `).join('')
    : '';

  if (!gallery && !links) return '';

  return `
    <div class="reader-resources">
      <p class="reader-resources-label">Sample results</p>
      ${links}
      ${gallery}
    </div>
  `;
}

function renderCustomGptLink(item) {
  if (!item.link) return '';
  return `
    <div class="reader-resources">
      <p class="reader-resources-label">Open</p>
      <a class="reader-resource-link" href="${escapeAttribute(item.link)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.link)}</a>
    </div>
  `;
}

function handleImageError(event) {
  if (!(event.target instanceof HTMLImageElement)) return;
  const link = event.target.closest('a');
  if (!link) return;
  const fallback = link.querySelector('.reader-sample-fallback');
  if (fallback) fallback.hidden = false;
  event.target.remove();
}

// === KEYBOARD ===

function handleKeydown(event) {
  const typing = isTypingTarget(event.target);

  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
    event.preventDefault();
    focusSearch();
    return;
  }

  if (event.key === 'Escape' && typing && event.target.matches('input[type="search"]')) {
    event.target.value = '';
    state.query = '';
    if (elements.searchInput.value) elements.searchInput.value = '';
    if (elements.searchInputMobile.value) elements.searchInputMobile.value = '';
    render();
    return;
  }

  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !typing) {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  if (event.key === 'Enter' && !typing && state.activeId) {
    if (state.mode === 'mobile') {
      state.mobileView = 'reader';
      elements.body.dataset.mobileView = 'reader';
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'c' && !typing && !hasTextSelection()) {
    const item = getActiveItem();
    if (item && item.type === 'prompt') {
      event.preventDefault();
      copyActive();
    }
    return;
  }

  if (event.key === 'f' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (state.activeId) {
      event.preventDefault();
      toggleFavorite(state.activeId);
    }
  }
}

function focusSearch() {
  const input = state.mode === 'desktop' ? elements.searchInput : elements.searchInputMobile;
  input.focus();
  input.select();
}

function moveSelection(direction) {
  const visible = getVisibleItems();
  if (!visible.length) return;
  const index = visible.findIndex((i) => i.id === state.activeId);
  const nextIndex = Math.max(0, Math.min(visible.length - 1, (index === -1 ? 0 : index + direction)));
  setActiveId(visible[nextIndex].id);

  // Scroll row into view
  const row = elements.listRows.querySelector(`[data-item-id="${CSS.escape(visible[nextIndex].id)}"]`);
  if (row && row.closest) {
    const li = row.closest('li');
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }
}

function hasTextSelection() {
  const sel = window.getSelection();
  return sel && sel.toString().length > 0;
}

// === SELECTORS ===

function getActiveItem() {
  return state.activeId ? state.items.find((i) => i.id === state.activeId) : null;
}

function getVisibleItems() {
  const tokens = queryTokens();
  const pool = state.items.filter((item) => {
    if (state.query) return true;
    if (state.category === CAT_ALL) return true;
    if (state.category === CAT_FAVORITES) return state.favorites.has(item.id);
    return item.key === state.category;
  });

  if (!tokens.length) {
    return [...pool].sort(compareItems);
  }

  const scored = [];
  for (const item of pool) {
    const score = searchScore(item, tokens);
    if (score > -1) scored.push({ item, score });
  }
  scored.sort((a, b) => (b.score - a.score) || compareItems(a.item, b.item));
  return scored.map((s) => s.item);
}

function compareItems(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.sortIndex - b.sortIndex;
}

function searchScore(item, tokens) {
  let score = 0;
  const joined = tokens.join(' ');
  for (const token of tokens) {
    if (!item.searchBlob.includes(token)) return -1;
    if (item.searchTitle.includes(token)) score += 120;
    if (item.searchBody.includes(token)) score += 26;
    if (item.category.toLowerCase().includes(token)) score += 18;
  }
  if (joined && item.searchTitle.includes(joined)) score += 90;
  if (joined && item.searchBody.includes(joined)) score += 18;
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
  const ids = new Set(state.items.map((i) => i.id));
  let count = 0;
  for (const favId of state.favorites) {
    if (ids.has(favId)) count += 1;
  }
  return count;
}

function categoryLabel(key) {
  if (key === CAT_ALL) return 'All';
  if (key === CAT_FAVORITES) return 'Favorites';
  const meta = metaByKey.get(key);
  return meta ? meta.label : 'All';
}

function queryTokens() {
  return state.query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

// === CLIPBOARD + TOAST ===

function copyToClipboard(text, message) {
  const task = navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
    ? navigator.clipboard.writeText(text)
    : Promise.reject(new Error('Clipboard API unavailable'));

  return task.catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!ok) throw new Error('execCommand copy failed');
  }).then(() => {
    showToast(message);
  }).catch(() => {
    showToast('Copy failed — select the text manually.');
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  elements.toastRoot.appendChild(toast);
  window.setTimeout(() => toast.remove(), CONFIG.TOAST_DURATION_MS);
}

function announce(message) {
  elements.srAnnounce.textContent = '';
  window.requestAnimationFrame(() => { elements.srAnnounce.textContent = message; });
}

// === HASH ROUTING ===

function writeHash() {
  const parts = [];
  if (state.category && state.category !== CAT_ALL) parts.push(`c/${encodeURIComponent(state.category)}`);
  if (state.activeId) parts.push(`p/${encodeURIComponent(state.activeId)}`);
  const hash = parts.length ? `#/${parts.join('/')}` : '#/';
  if (window.location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

function applyHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  let nextCategory = CAT_ALL;
  let nextActive = null;

  for (let i = 0; i < parts.length; i += 2) {
    const kind = parts[i];
    const value = parts[i + 1];
    if (!value) break;
    if (kind === 'c') nextCategory = decodeURIComponent(value);
    else if (kind === 'p') nextActive = decodeURIComponent(value);
  }

  const validCats = new Set([CAT_ALL, CAT_FAVORITES, ...CONFIG.SHEETS.map((s) => s.key)]);
  if (!validCats.has(nextCategory)) nextCategory = CAT_ALL;

  state.category = nextCategory;
  if (nextActive && state.items.some((i) => i.id === nextActive)) {
    state.activeId = nextActive;
    if (state.mode === 'mobile') {
      state.mobileView = 'reader';
      elements.body.dataset.mobileView = 'reader';
    }
  } else if (nextActive && state.items.length === 0) {
    // items not loaded yet — keep the id and we'll resolve after boot
    state.activeId = nextActive;
  }
}

// === CACHE + STORAGE ===

function getCacheKey(gid) { return `${CACHE_PREFIX}:${gid}`; }

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) { return null; }
}

function writeSessionCache(key, items) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), items }));
  } catch (error) { /* noop */ }
}

function clearSessionCache() {
  try {
    const toDelete = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) toDelete.push(key);
    }
    toDelete.forEach((k) => sessionStorage.removeItem(k));
  } catch (error) { /* noop */ }
}

function isFreshCache(timestamp) {
  return Date.now() - timestamp < CONFIG.CACHE_DURATION_MS;
}

function readStoredArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) { return []; }
}

function readStoredObject(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) { return {}; }
}

// === UTIL ===

function debounce(callback, wait) {
  let id = 0;
  return (...args) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => callback(...args), wait);
  };
}

function cellText(cell) {
  if (!cell) return '';
  if (typeof cell.v === 'string') return cell.v.trim();
  if (cell.f) return String(cell.f).trim();
  if (cell.v === null || cell.v === undefined) return '';
  return String(cell.v).trim();
}

function cellDisplay(cell, fallback) {
  return cell && cell.f ? String(cell.f).trim() : String(fallback);
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function padNumber(value) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n)) return String(n).padStart(3, '0');
  return String(value);
}

function extractUrls(value) {
  const matches = value.match(URL_PATTERN) || [];
  const unique = new Set();
  for (const m of matches) unique.add(m.replace(/[),.;]+$/g, ''));
  return [...unique].map((url) => safeUrl(url)).filter(Boolean);
}

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch (error) { return ''; }
  return '';
}

function linkLabel(url, index) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.includes('drive.google.com')) return `View on Drive${index ? ` ${index + 1}` : ''}`;
    if (host.includes('codepen.io')) return `View on CodePen${index ? ` ${index + 1}` : ''}`;
    if (host.includes('chat.openai.com') || host.includes('chatgpt.com')) return `Open in ChatGPT${index ? ` ${index + 1}` : ''}`;
    if (IMAGE_PATTERN.test(parsed.pathname)) return `Open image${index ? ` ${index + 1}` : ''}`;
  } catch (error) { /* noop */ }
  return `Open sample${index ? ` ${index + 1}` : ''}`;
}

function highlightText(value, tokens) {
  if (!value) return '';
  if (!tokens.length) return escapeHtml(value);
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  return value.split(pattern)
    .map((segment, i) => (i % 2 === 1 ? `<mark>${escapeHtml(segment)}</mark>` : escapeHtml(segment)))
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
