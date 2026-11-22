import {
  DEFAULT_EXCHANGE_RATE,
  openDB,
  getAllItems,
  putItem,
  deleteItem,
  clearAllItems,
  getExchangeRate,
  setExchangeRate,
  getItemsVersion,
  getFilterPrefs,
  setFilterPrefs,
  getTheme,
  setTheme,
  addDeletedStaticId,
  clearDeletedStaticIds,
  getRequesterList,
  setRequesterList,
  resetRequesterList,
  normalizeItem,
  normalizeStores,
  mergeStaticData,
  buildFullBackupData,
  restoreFullBackup,
  buildStaticTemplateData
} from './db.js';
import {
  compressImageFile,
  formatBytes,
  ObjectUrlManager
} from './image-util.js';
import {
  calcItemTwd,
  formatJpy,
  formatTwd,
  getJpyLimit,
  compareWithTaiwan,
  computeCheckoutStats,
  formatLineSummary,
  generateCsvContent,
  downloadTextFile,
  copyTextToClipboard
} from './export.js';

const IMG_CACHE_NAME = 'jp-shop-img-v2';

const state = {
  items: [],
  activeTab: 'list',
  filters: getFilterPrefs(),
  exchangeRate: getExchangeRate(),
  theme: getTheme(),
  editingId: null,
  draftImageBlob: null,
  draftRemoveOriginalImage: false,
  swRegistration: null,
  isPrecaching: false,
  cacheStats: { cached: 0, total: 0 }
};

const urlManager = new ObjectUrlManager();
let toastTimer = null;
let sheetPreviewObjectUrl = '';

// ==================== DOM References ====================
const els = {
  views: {
    list: document.getElementById('view-list'),
    checkout: document.getElementById('view-checkout'),
    settings: document.getElementById('view-settings')
  },
  navItems: [...document.querySelectorAll('.nav-item')],
  progressBadge: document.getElementById('progress-badge'),
  networkBadge: document.getElementById('network-badge'),
  btnHeaderPrecache: document.getElementById('btn-header-precache'),
  headerCacheText: document.getElementById('header-cache-text'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  segBtns: [...document.querySelectorAll('#view-list .seg-btn')],
  storeFilterBar: document.getElementById('store-filter-bar'),
  searchInput: document.getElementById('search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  listSummaryLine: document.getElementById('list-summary-line'),
  itemList: document.getElementById('item-list'),
  emptyState: document.getElementById('empty-state'),
  emptyStateMsg: document.getElementById('empty-state-msg'),
  btnResetFilters: document.getElementById('btn-reset-filters'),
  btnFabAdd: document.getElementById('btn-fab-add'),

  // Checkout view
  inputExchangeRate: document.getElementById('input-exchange-rate'),
  btnResetRate: document.getElementById('btn-reset-rate'),
  statCount: document.getElementById('stat-count'),
  statJpy: document.getElementById('stat-jpy'),
  statTwd: document.getElementById('stat-twd'),
  missingPriceAlert: document.getElementById('missing-price-alert'),
  missingPriceCount: document.getElementById('missing-price-count'),
  btnCopyAllLine: document.getElementById('btn-copy-all-line'),
  btnPreviewLine: document.getElementById('btn-preview-line'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  requesterGroups: document.getElementById('requester-groups'),

  // Settings view
  settingsVersion: document.getElementById('settings-version'),
  settingsSwStatus: document.getElementById('settings-sw-status'),
  settingsCacheProgress: document.getElementById('settings-cache-progress'),
  settingsCacheBar: document.getElementById('settings-cache-bar'),
  btnCheckUpdate: document.getElementById('btn-check-update'),
  btnPrecacheAll: document.getElementById('btn-precache-all'),
  btnExportBackup: document.getElementById('btn-export-backup'),
  btnImportJson: document.getElementById('btn-import-json'),
  btnExportTemplate: document.getElementById('btn-export-template'),
  inputImportFile: document.getElementById('input-import-file'),
  settingsRequesterList: document.getElementById('settings-requester-list'),
  inputNewRequester: document.getElementById('input-new-requester'),
  btnAddRequester: document.getElementById('btn-add-requester'),
  btnResetRequesters: document.getElementById('btn-reset-requesters'),
  themeSelectorBtns: [...document.querySelectorAll('#theme-selector .seg-btn')],
  btnResetAll: document.getElementById('btn-reset-all'),

  // Bottom sheet
  sheetBackdrop: document.getElementById('sheet-backdrop'),
  sheetTitle: document.getElementById('sheet-title'),
  btnSheetClose: document.getElementById('btn-sheet-close'),
  itemForm: document.getElementById('item-form'),
  formPhotoPreview: document.getElementById('form-photo-preview'),
  btnCameraCapture: document.getElementById('btn-camera-capture'),
  btnGalleryPick: document.getElementById('btn-gallery-pick'),
  btnRemovePhoto: document.getElementById('btn-remove-photo'),
  photoSizeInfo: document.getElementById('photo-size-info'),
  inputCamera: document.getElementById('input-camera'),
  inputGallery: document.getElementById('input-gallery'),
  fieldName: document.getElementById('field-name'),
  fieldTwPrice: document.getElementById('field-tw-price'),
  twLimitHint: document.getElementById('tw-limit-hint'),
  fieldActualPrice: document.getElementById('field-actual-price'),
  fieldTargetPrice: document.getElementById('field-target-price'),
  fieldActualQty: document.getElementById('field-actual-qty'),
  fieldTargetQty: document.getElementById('field-target-qty'),
  btnActualMinus: document.getElementById('btn-actual-minus'),
  btnActualPlus: document.getElementById('btn-actual-plus'),
  btnTargetMinus: document.getElementById('btn-target-minus'),
  btnTargetPlus: document.getElementById('btn-target-plus'),
  sheetLiveTotal: document.getElementById('sheet-live-total'),
  sheetCompareResult: document.getElementById('sheet-compare-result'),
  fieldIsPurchased: document.getElementById('field-is-purchased'),
  fieldRequester: document.getElementById('field-requester'),
  requesterQuickChips: document.getElementById('requester-quick-chips'),
  fieldPurchasedStore: document.getElementById('field-purchased-store'),
  purchasedStoreChips: document.getElementById('purchased-store-chips'),
  fieldStores: document.getElementById('field-stores'),
  fieldNote: document.getElementById('field-note'),
  btnDeleteItem: document.getElementById('btn-delete-item'),
  btnSaveItem: document.getElementById('btn-save-item'),

  // Lightbox
  lightbox: document.getElementById('lightbox'),
  lightboxStage: document.getElementById('lightbox-stage'),
  lightboxImg: document.getElementById('lightbox-img'),
  lightboxItemName: document.getElementById('lightbox-item-name'),
  btnLightboxClose: document.getElementById('btn-lightbox-close'),
  btnLightboxReset: document.getElementById('btn-lightbox-reset'),

  // Confirm & Preview Modals & Toast
  modalConfirm: document.getElementById('modal-confirm'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmActions: document.getElementById('confirm-actions'),
  modalLinePreview: document.getElementById('modal-line-preview'),
  linePreviewText: document.getElementById('line-preview-text'),
  btnLinePreviewClose: document.getElementById('btn-line-preview-close'),
  btnLinePreviewCopy: document.getElementById('btn-line-preview-copy'),
  toast: document.getElementById('toast')
};

// ==================== 通用工具 ====================
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, durationMs = 2400) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, durationMs);
}

function showConfirmDialog({ title, message, actions }) {
  return new Promise((resolve) => {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmActions.innerHTML = '';

    const closeWith = (val) => {
      els.modalConfirm.classList.add('hidden');
      resolve(val);
    };

    for (const act of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${act.className || 'btn-secondary'}`;
      btn.textContent = act.label;
      btn.addEventListener('click', () => closeWith(act.value));
      els.confirmActions.appendChild(btn);
    }

    els.modalConfirm.classList.remove('hidden');
  });
}

function resolveImageSource(item) {
  if (item.imageBlob instanceof Blob) {
    return urlManager.getUrl(item.id, item.imageBlob);
  }
  urlManager.revoke(item.id);
  return item.image || '';
}

function getItemPurchaseState(item) {
  if (item.isPurchased) return 'purchased';
  if ((item.actualQty || 0) > 0) return 'partial';
  return 'unpurchased';
}

function applyTheme(theme) {
  state.theme = theme;
  setTheme(theme);
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }

  for (const btn of els.themeSelectorBtns) {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  }
}

function updateNetworkBadge() {
  const online = navigator.onLine;
  els.networkBadge.textContent = online ? '連線中' : '離線模式';
  els.networkBadge.className = `badge ${online ? 'badge-online' : 'badge-offline'}`;
}

// ==================== 資料載入與同步 ====================
async function reloadItemsFromDB() {
  const items = await getAllItems();
  // 依靜態清單原始 id 排序並讓新增額外項目置於後或維持順序
  items.sort((a, b) => {
    if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
    if (!a.isExtra && !b.isExtra) {
      return a.id.localeCompare(b.id, 'en', { numeric: true });
    }
    return b.updatedAt - a.updatedAt;
  });
  state.items = items;

  const activeBlobIds = new Set(
    items.filter((it) => it.imageBlob instanceof Blob).map((it) => it.id)
  );
  urlManager.pruneExcept(activeBlobIds);
}

async function syncInitialStaticData({ manual = false } = {}) {
  try {
    const fetchUrl = manual ? `./data/items.json?t=${Date.now()}` : './data/items.json';
    const res = await fetch(fetchUrl, manual ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const jsonData = await res.json();

    const currentVersion = getItemsVersion();
    const incomingVersion = typeof jsonData.version === 'string' ? jsonData.version : '';

    if (manual || state.items.length === 0 || (incomingVersion && incomingVersion !== currentVersion)) {
      const result = await mergeStaticData(jsonData, { isManualImport: false });
      state.exchangeRate = getExchangeRate();
      await reloadItemsFromDB();
      renderAll();
      await refreshCacheProgress();

      if (manual) {
        showToast(
          `清單檢查完成 (${result.version || '無版號'})：新增 ${result.added}、更新 ${result.updated}、移除 ${result.removed}`
        );
      } else if (result.added > 0 || result.updated > 0) {
        showToast(`已載入清單資料（新增 ${result.added} 項）`);
      }
    } else if (manual) {
      showToast(`清單已是最新版本 (${currentVersion || '預設'})`);
    }
  } catch (err) {
    if (manual) {
      showToast('目前無法連線取得更新，已保留本機離線清單');
    }
  }
}

// ==================== 離線圖片快取統計與一鍵預載 ====================
function getStaticImageUrls() {
  const rels = state.items
    .map((it) => it.image)
    .filter((src) => typeof src === 'string' && src.trim() && !src.startsWith('data:'));
  return [...new Set(rels)].map((rel) => new URL(rel, location.href).href);
}

async function refreshCacheProgress() {
  const urls = getStaticImageUrls();
  const total = urls.length;
  let cached = 0;

  if ('caches' in window && total > 0) {
    try {
      const cache = await caches.open(IMG_CACHE_NAME);
      const checks = await Promise.all(urls.map((u) => cache.match(u)));
      cached = checks.filter(Boolean).length;
    } catch {
      cached = 0;
    }
  }

  state.cacheStats = { cached, total };
  const allReady = total > 0 && cached === total;

  els.headerCacheText.textContent = allReady ? `✅ 離線 ${cached}/${total}` : `離線 ${cached}/${total}`;
  els.btnHeaderPrecache.classList.toggle('is-ready', allReady);

  els.settingsCacheProgress.textContent = allReady
    ? `✅ 離線圖片 ${cached}/${total} 已就緒`
    : `${cached} / ${total} 張已快取`;
  const pct = total > 0 ? Math.round((cached / total) * 100) : 100;
  els.settingsCacheBar.style.width = `${pct}%`;
}

async function runPrecacheAll() {
  if (state.isPrecaching) return;
  if (!('caches' in window)) {
    showToast('此瀏覽器不支援離線快取 API');
    return;
  }

  const urls = getStaticImageUrls();
  if (urls.length === 0) {
    showToast('目前清單無需快取的靜態圖片');
    return;
  }

  state.isPrecaching = true;
  els.btnHeaderPrecache.disabled = true;
  els.btnPrecacheAll.disabled = true;
  showToast('正在下載並封裝離線圖片包...');

  try {
    const imgCache = await caches.open(IMG_CACHE_NAME);
    let done = 0;
    let failed = 0;

    for (const url of urls) {
      try {
        const existing = await imgCache.match(url);
        if (existing) {
          done += 1;
        } else {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res.ok) {
            await imgCache.put(url, res);
            done += 1;
          } else {
            failed += 1;
          }
        }
      } catch {
        failed += 1;
      }
      els.headerCacheText.textContent = `快取 ${done}/${urls.length}`;
    }

    // 同時確認 App Shell 也透過 SW 註冊完成
    if (state.swRegistration?.active) {
      state.swRegistration.active.postMessage({ type: 'PRECACHE_IMAGES', urls });
    }

    await refreshCacheProgress();
    if (failed === 0) {
      showToast(`✅ 離線圖片 ${done}/${urls.length} 已全部就緒！`);
    } else {
      showToast(`已快取 ${done}/${urls.length} 張，${failed} 張失敗（請確認網路）`);
    }
  } finally {
    state.isPrecaching = false;
    els.btnHeaderPrecache.disabled = false;
    els.btnPrecacheAll.disabled = false;
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    els.settingsSwStatus.textContent = '不支援';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    state.swRegistration = reg;

    const updateSwLabel = () => {
      if (navigator.serviceWorker.controller) {
        els.settingsSwStatus.textContent = '✅ 已啟用離線引擎';
      } else if (reg.active) {
        els.settingsSwStatus.textContent = '✅ 已安裝（就緒）';
      } else {
        els.settingsSwStatus.textContent = '安裝中...';
      }
    };

    updateSwLabel();
    navigator.serviceWorker.ready.then(() => {
      updateSwLabel();
      refreshCacheProgress();
    });
    navigator.serviceWorker.addEventListener('controllerchange', updateSwLabel);
  } catch (err) {
    els.settingsSwStatus.textContent = '註冊失敗';
  }
}

// ==================== 渲染：分頁 1 代購清單 ====================
function getUniqueStores() {
  const storeSet = new Set();
  for (const item of state.items) {
    for (const s of item.stores || []) storeSet.add(s);
    if (item.purchasedStore) storeSet.add(item.purchasedStore);
  }
  return [...storeSet];
}

function getFilteredItems() {
  const { status, store, search } = state.filters;
  const kw = search.trim().toLowerCase();

  return state.items.filter((item) => {
    if (status === 'unpurchased' && item.isPurchased) return false;
    if (status === 'purchased' && !item.isPurchased) return false;

    if (store !== 'ALL') {
      const inCandidate = (item.stores || []).includes(store);
      const inPurchased = item.purchasedStore === store;
      if (!inCandidate && !inPurchased) return false;
    }

    if (kw) {
      const haystack = [
        item.name,
        item.requester,
        item.note,
        item.purchasedStore,
        ...(item.stores || [])
      ].join(' ').toLowerCase();
      if (!haystack.includes(kw)) return false;
    }

    return true;
  });
}

function renderListView() {
  const totalCount = state.items.length;
  const purchasedCount = state.items.filter((it) => it.isPurchased).length;
  const partialCount = state.items.filter((it) => !it.isPurchased && (it.actualQty || 0) > 0).length;

  els.progressBadge.textContent = partialCount > 0
    ? `已買 ${purchasedCount} / 總計 ${totalCount} 項（${partialCount} 項部分買）`
    : `已買 ${purchasedCount} / 總計 ${totalCount} 項`;

  // Status segmented buttons
  for (const btn of els.segBtns) {
    const active = btn.dataset.status === state.filters.status;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }

  // Store filter pills
  const stores = getUniqueStores();
  if (state.filters.store !== 'ALL' && !stores.includes(state.filters.store)) {
    state.filters.store = 'ALL';
    setFilterPrefs(state.filters);
  }

  const pillDefs = [{ key: 'ALL', label: '全部店家' }, ...stores.map((s) => ({ key: s, label: s }))];
  els.storeFilterBar.innerHTML = pillDefs
    .map((p) => {
      const activeClass = state.filters.store === p.key ? 'active' : '';
      return `<button type="button" class="store-pill ${activeClass}" data-store="${escapeHtml(p.key)}">${escapeHtml(p.label)}</button>`;
    })
    .join('');

  // Search box sync
  if (els.searchInput.value !== state.filters.search) {
    els.searchInput.value = state.filters.search;
  }
  els.btnClearSearch.classList.toggle('hidden', !state.filters.search);

  // Filtered list
  const filtered = getFilteredItems();
  // 在「全部」視圖下讓未完成排在前面、已完成排在後面，方便現場視線聚焦
  const ordered = state.filters.status === 'all'
    ? [...filtered].sort((a, b) => Number(a.isPurchased) - Number(b.isPurchased))
    : filtered;

  els.listSummaryLine.textContent = `顯示 ${ordered.length} 項商品` +
    (state.filters.store !== 'ALL' ? ` · 店家：${state.filters.store}` : '');

  if (ordered.length === 0) {
    els.itemList.innerHTML = '';
    els.emptyState.classList.remove('hidden');
    els.emptyStateMsg.textContent = totalCount === 0
      ? '清單目前是空的，點擊右下角新增代購吧！'
      : '沒有符合目前篩選條件的商品';
    return;
  }

  els.emptyState.classList.add('hidden');
  const html = ordered.map((item) => renderItemCardHtml(item)).join('');
  els.itemList.innerHTML = html;
}

function renderItemCardHtml(item) {
  const purchaseState = getItemPurchaseState(item);
  const imgSrc = resolveImageSource(item);
  const cardClasses = [
    'item-card',
    purchaseState === 'purchased' ? 'is-purchased' : '',
    purchaseState === 'partial' ? 'is-partial' : ''
  ].filter(Boolean).join(' ');

  const thumbHtml = imgSrc
    ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.name)}" loading="lazy"><span class="thumb-zoom-hint">放大</span>`
    : `<div class="thumb-empty"><span>無圖片</span></div>`;

  // Tags（委託人未指派時不顯示標籤）
  const tags = [];
  if (item.requester && item.requester.trim()) {
    tags.push(`<span class="tag tag-requester">${escapeHtml(item.requester.trim())}</span>`);
  }
  if (item.isExtra) {
    tags.push('<span class="tag tag-extra">自行新增</span>');
  }
  if (purchaseState === 'partial') {
    tags.push(`<span class="tag tag-partial">部分 ${item.actualQty}/${item.targetQty}</span>`);
  }
  if (item.purchasedStore) {
    tags.push(`<span class="tag tag-store-bought">＠${escapeHtml(item.purchasedStore)}</span>`);
  } else {
    for (const s of (item.stores || []).slice(0, 3)) {
      tags.push(`<span class="tag tag-store">${escapeHtml(s)}</span>`);
    }
    if ((item.stores || []).length > 3) {
      tags.push(`<span class="tag tag-store">+${item.stores.length - 3}</span>`);
    }
  }

  // Price & qty block
  let priceHtml = '';
  const hasActual = item.actualQty > 0 || item.actualPrice !== null;
  if (hasActual && item.actualPrice !== null) {
    const qty = item.actualQty || item.targetQty || 1;
    const subtotalJpy = item.actualPrice * qty;
    const subtotalTwd = calcItemTwd(subtotalJpy, state.exchangeRate);
    const cmp = compareWithTaiwan(item, item.actualPrice, state.exchangeRate);
    let cmpBadge = '';
    if (cmp) {
      if (cmp.diff >= 0) {
        cmpBadge = `<span class="price-save">✅ 比台灣省 ${formatTwd(cmp.diff)}/個</span>`;
      } else {
        cmpBadge = `<span class="price-over">⚠️ 比台灣貴 ${formatTwd(Math.abs(cmp.diff))}/個</span>`;
      }
    }
    priceHtml = `
      <span class="price-actual">實買 ${formatJpy(item.actualPrice)} × ${qty} = ${formatJpy(subtotalJpy)}</span>
      <span class="price-twd">(${formatTwd(subtotalTwd)})</span>
      ${cmpBadge}
    `;
  } else if (item.twPrice !== null && item.twPrice !== undefined) {
    const limitJpy = getJpyLimit(item, state.exchangeRate);
    priceHtml = `
      <span class="price-main">台灣 ${formatTwd(item.twPrice)}｜日本 ≤ ${formatJpy(limitJpy)} 就划算</span>
      <span class="qty-text">· 目標 ${item.targetQty} 個</span>
    `;
  } else if (item.targetPrice !== null) {
    const refTwd = calcItemTwd(item.targetPrice, state.exchangeRate);
    priceHtml = `
      <span class="price-main">參考 ${formatJpy(item.targetPrice)}</span>
      <span class="price-twd">(約 ${formatTwd(refTwd)})</span>
      <span class="qty-text">· 目標 ${item.targetQty} 個</span>
    `;
  } else {
    priceHtml = `<span class="qty-text">目標 ${item.targetQty} 個 · 尚未填寫價格</span>`;
  }

  const checkClass = purchaseState === 'purchased' ? 'checked' : (purchaseState === 'partial' ? 'partial' : '');
  const checkIcon = purchaseState === 'partial'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const noteHtml = item.note ? `<p class="item-note">${escapeHtml(item.note)}</p>` : '';

  return `
    <article class="${cardClasses}" data-id="${escapeHtml(item.id)}">
      <button type="button" class="thumb-btn" data-action="zoom" aria-label="放大查看 ${escapeHtml(item.name)}">
        ${thumbHtml}
      </button>
      <div class="item-body" data-action="edit" role="button" tabindex="0" aria-label="編輯 ${escapeHtml(item.name)}">
        <div class="item-title-row">
          <h3 class="item-name">${escapeHtml(item.name)}</h3>
        </div>
        <div class="item-tags">${tags.join('')}</div>
        <div class="item-price-block">${priceHtml}</div>
        ${noteHtml}
      </div>
      <button type="button" class="check-btn ${checkClass}" data-action="toggle" aria-label="切換購買狀態">
        ${checkIcon}
      </button>
    </article>
  `;
}

// ==================== 渲染：分頁 2 結帳統計 ====================
function renderCheckoutView() {
  if (document.activeElement !== els.inputExchangeRate) {
    els.inputExchangeRate.value = String(state.exchangeRate);
  }

  const stats = computeCheckoutStats(state.items, state.exchangeRate);
  els.statCount.textContent = `${stats.purchasedItemCount} 項 / ${stats.totalQty} 件`;
  els.statJpy.textContent = formatJpy(stats.totalJpy);
  els.statTwd.textContent = formatTwd(stats.totalTwd);

  if (stats.missingPriceCount > 0) {
    els.missingPriceCount.textContent = String(stats.missingPriceCount);
    els.missingPriceAlert.classList.remove('hidden');
  } else {
    els.missingPriceAlert.classList.add('hidden');
  }

  if (stats.groups.length === 0) {
    els.requesterGroups.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧾</div>
        <p class="empty-msg">尚無已購買紀錄，勾選購買後會自動依委託人分組計算。</p>
      </div>
    `;
    return;
  }

  els.requesterGroups.innerHTML = stats.groups.map((group) => {
    const rowsHtml = group.items.map((entry) => {
      const storeMeta = entry.item.purchasedStore ? `＠${entry.item.purchasedStore} · ` : '';
      const priceRight = entry.missingPrice
        ? `<div class="missing-price-text">點擊補填單價</div>`
        : `<div class="group-item-jpy">${formatJpy(entry.unitJpy)} × ${entry.qty} = ${formatJpy(entry.jpySubtotal)}</div>
           <div class="group-item-twd">${formatTwd(entry.twdSubtotal)}</div>`;

      return `
        <button type="button" class="group-item-row" data-edit-id="${escapeHtml(entry.item.id)}">
          <div class="group-item-left">
            <div class="group-item-title">${escapeHtml(entry.item.name)}</div>
            <div class="group-item-meta">${escapeHtml(storeMeta)}實買 ${entry.qty} 件${entry.item.isExtra ? ' · 自行新增' : ''}</div>
          </div>
          <div class="group-item-right">${priceRight}</div>
        </button>
      `;
    }).join('');

    return `
      <section class="group-card">
        <div class="group-header">
          <div class="group-name-wrap">
            <span class="group-name">👤 ${escapeHtml(group.requester)}</span>
            <span class="group-sub">${group.items.length} 項 / ${group.totalQty} 件 · ${formatJpy(group.groupJpy)}</span>
          </div>
          <div class="group-totals">
            <span class="group-twd">${formatTwd(group.groupTwd)}</span>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-requester="${escapeHtml(group.requester)}">複製明細</button>
          </div>
        </div>
        <div class="group-items">${rowsHtml}</div>
      </section>
    `;
  }).join('');
}

// ==================== 渲染：分頁 3 設定與備份 ====================
function renderRequesterSettings() {
  const list = getRequesterList();
  if (list.length === 0) {
    els.settingsRequesterList.innerHTML = '<span class="field-hint">目前尚無預設委託人，請於下方新增。</span>';
    return;
  }
  els.settingsRequesterList.innerHTML = list
    .map((name) => `
      <span class="requester-chip">
        <span>${escapeHtml(name)}</span>
        <button type="button" class="requester-chip-del" data-remove-requester="${escapeHtml(name)}" aria-label="刪除 ${escapeHtml(name)}">&times;</button>
      </span>
    `)
    .join('');
}

function renderSettingsView() {
  els.settingsVersion.textContent = getItemsVersion() || '未記錄';
  renderRequesterSettings();
  applyTheme(state.theme);
}

function renderAll() {
  renderListView();
  renderCheckoutView();
  renderSettingsView();
}

function switchTab(tabName) {
  state.activeTab = tabName;
  for (const [key, view] of Object.entries(els.views)) {
    view.classList.toggle('active', key === tabName);
  }
  for (const btn of els.navItems) {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  }
  if (tabName === 'checkout') {
    renderCheckoutView();
  } else if (tabName === 'settings') {
    renderSettingsView();
    refreshCacheProgress();
  }
}

// ==================== 一鍵勾選切換 ====================
async function toggleQuickPurchase(id) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;

  const nextPurchased = !item.isPurchased;
  const updated = { ...item, isPurchased: nextPurchased };

  if (nextPurchased) {
    if ((updated.actualQty || 0) === 0) {
      updated.actualQty = updated.targetQty || 1;
    }
    if (updated.actualPrice === null && updated.targetPrice !== null) {
      updated.actualPrice = updated.targetPrice;
    }
    if (!updated.purchasedStore && state.filters.store !== 'ALL') {
      updated.purchasedStore = state.filters.store;
    }
  } else {
    // 取消快速勾選時歸零實買數量，避免直接變「部分已買」狀態
    updated.actualQty = 0;
  }

  await putItem(updated);
  await reloadItemsFromDB();
  renderAll();
  showToast(nextPurchased ? `已勾選購買：${item.name}` : `已取消購買標記：${item.name}`);
}

// ==================== 編輯 / 新增額外代購 Bottom Sheet ====================
function revokeSheetPreviewUrl() {
  if (sheetPreviewObjectUrl) {
    URL.revokeObjectURL(sheetPreviewObjectUrl);
    sheetPreviewObjectUrl = '';
  }
}

function renderSheetPhotoPreview(editingItem) {
  revokeSheetPreviewUrl();

  if (state.draftImageBlob instanceof Blob) {
    sheetPreviewObjectUrl = URL.createObjectURL(state.draftImageBlob);
    els.formPhotoPreview.innerHTML = `<img src="${escapeHtml(sheetPreviewObjectUrl)}" alt="商品預覽">`;
    els.photoSizeInfo.textContent = `壓縮圖 · ${formatBytes(state.draftImageBlob.size)}`;
    els.btnRemovePhoto.textContent = editingItem && editingItem.image ? '還原預設圖' : '移除照片';
    els.btnRemovePhoto.classList.remove('hidden');
    return;
  }

  if (editingItem && editingItem.image && !state.draftRemoveOriginalImage) {
    els.formPhotoPreview.innerHTML = `<img src="${escapeHtml(editingItem.image)}" alt="預設商品圖">`;
    els.photoSizeInfo.textContent = '目前使用預設預載圖';
    els.btnRemovePhoto.textContent = '移除圖片';
    els.btnRemovePhoto.classList.remove('hidden');
    return;
  }

  els.formPhotoPreview.innerHTML = '<span class="photo-placeholder">尚無圖片</span>';
  els.photoSizeInfo.textContent = '自動壓縮 ≤800px WebP';
  els.btnRemovePhoto.classList.add('hidden');
}

function updateSheetTwLimitHint() {
  const raw = els.fieldTwPrice.value.trim();
  if (raw === '') {
    els.twLimitHint.textContent = '填寫台灣售價可自動計算日本划算上限價';
    return;
  }
  const tw = Number(raw);
  if (Number.isFinite(tw) && tw >= 0 && state.exchangeRate > 0) {
    const limit = Math.floor(tw / state.exchangeRate);
    els.twLimitHint.textContent = `日本單價 ≤ ${formatJpy(limit)} 就比台灣便宜（匯率 ${state.exchangeRate}）`;
  } else {
    els.twLimitHint.textContent = '';
  }
}

function updateSheetLiveTotal() {
  const unitRaw = els.fieldActualPrice.value.trim();
  const unit = Number(unitRaw);
  const qty = Math.max(0, Math.floor(Number(els.fieldActualQty.value) || 0));
  const jpy = unitRaw !== '' && Number.isFinite(unit) && unit >= 0 ? unit * qty : 0;
  const twd = calcItemTwd(jpy, state.exchangeRate);
  els.sheetLiveTotal.textContent = `${formatJpy(jpy)} → ${formatTwd(twd)}`;

  const twRaw = els.fieldTwPrice.value.trim();
  const twNum = Number(twRaw);
  if (unitRaw !== '' && Number.isFinite(unit) && unit >= 0 && twRaw !== '' && Number.isFinite(twNum) && twNum >= 0) {
    const unitTwd = calcItemTwd(unit, state.exchangeRate);
    const diff = twNum - unitTwd;
    els.sheetCompareResult.classList.remove('hidden', 'is-save', 'is-over');
    if (diff > 0) {
      els.sheetCompareResult.classList.add('is-save');
      els.sheetCompareResult.textContent = `✅ 比台灣售價 ${formatTwd(twNum)} 省 ${formatTwd(diff)}／個（日圓折合 ${formatTwd(unitTwd)}）`;
    } else if (diff === 0) {
      els.sheetCompareResult.classList.add('is-save');
      els.sheetCompareResult.textContent = `✅ 與台灣售價 ${formatTwd(twNum)} 同價（日圓折合 ${formatTwd(unitTwd)}）`;
    } else {
      els.sheetCompareResult.classList.add('is-over');
      els.sheetCompareResult.textContent = `⚠️ 比台灣售價 ${formatTwd(twNum)} 貴 ${formatTwd(Math.abs(diff))}／個（日圓折合 ${formatTwd(unitTwd)}）`;
    }
  } else {
    els.sheetCompareResult.classList.add('hidden');
  }
}

function renderQuickChips(container, values, currentVal, onSelect) {
  const unique = [...new Set(values.filter(Boolean))];
  container.innerHTML = unique
    .map((val) => {
      const active = val === currentVal ? 'active' : '';
      return `<button type="button" class="quick-chip ${active}" data-val="${escapeHtml(val)}">${escapeHtml(val)}</button>`;
    })
    .join('');

  container.onclick = (e) => {
    const btn = e.target.closest('.quick-chip');
    if (!btn) return;
    onSelect(btn.dataset.val);
  };
}

function openItemSheet(itemId = null) {
  state.editingId = itemId;
  state.draftRemoveOriginalImage = false;
  const editingItem = itemId ? state.items.find((it) => it.id === itemId) : null;

  if (editingItem) {
    els.sheetTitle.textContent = editingItem.isExtra ? '編輯自訂商品' : '編輯與實買紀錄';
    state.draftImageBlob = editingItem.imageBlob instanceof Blob ? editingItem.imageBlob : null;
    els.fieldName.value = editingItem.name;
    els.fieldTwPrice.value = editingItem.twPrice ?? '';
    els.fieldActualPrice.value = editingItem.actualPrice ?? '';
    els.fieldTargetPrice.value = editingItem.targetPrice ?? '';
    els.fieldActualQty.value = String(editingItem.actualQty ?? 0);
    els.fieldTargetQty.value = String(editingItem.targetQty ?? 1);
    els.fieldIsPurchased.checked = Boolean(editingItem.isPurchased);
    els.fieldRequester.value = editingItem.requester || '';
    els.fieldPurchasedStore.value = editingItem.purchasedStore || '';
    els.fieldStores.value = (editingItem.stores || []).join(', ');
    els.fieldNote.value = editingItem.note || '';
    els.btnDeleteItem.classList.remove('hidden');
  } else {
    els.sheetTitle.textContent = '新增代購商品';
    state.draftImageBlob = null;
    els.fieldName.value = '';
    els.fieldTwPrice.value = '';
    els.fieldActualPrice.value = '';
    els.fieldTargetPrice.value = '';
    els.fieldActualQty.value = '0';
    els.fieldTargetQty.value = '1';
    els.fieldIsPurchased.checked = false;
    els.fieldRequester.value = '';
    els.fieldPurchasedStore.value = state.filters.store !== 'ALL' ? state.filters.store : '';
    els.fieldStores.value = state.filters.store !== 'ALL' ? state.filters.store : '';
    els.fieldNote.value = '';
    els.btnDeleteItem.classList.add('hidden');
  }

  renderSheetPhotoPreview(editingItem);
  updateSheetTwLimitHint();
  updateSheetLiveTotal();

  // 委託人快捷標籤（從自訂委託人清單載入）
  const allRequesters = [
    ...new Set([
      ...getRequesterList(),
      ...(editingItem?.requester ? [editingItem.requester] : [])
    ])
  ];
  openQuickRequesterChips(allRequesters);

  // 實際購買店家快捷標籤（優先此商品候選店家，加上全清單常見店家）
  const candidateStores = [
    ...(editingItem?.stores || []),
    ...getUniqueStores()
  ];
  openQuickStoreChips(candidateStores);

  els.sheetBackdrop.classList.remove('hidden');
  els.sheetBackdrop.setAttribute('aria-hidden', 'false');
}

function openQuickRequesterChips(allRequesters) {
  renderQuickChips(els.requesterQuickChips, allRequesters, els.fieldRequester.value.trim(), (val) => {
    const current = els.fieldRequester.value.trim();
    els.fieldRequester.value = current === val ? '' : val;
    openQuickRequesterChips(allRequesters);
  });
}

function openQuickStoreChips(candidateStores) {
  renderQuickChips(els.purchasedStoreChips, candidateStores, els.fieldPurchasedStore.value.trim(), (val) => {
    els.fieldPurchasedStore.value = val;
    openQuickStoreChips(candidateStores);
  });
}

function closeItemSheet() {
  els.sheetBackdrop.classList.add('hidden');
  els.sheetBackdrop.setAttribute('aria-hidden', 'true');
  revokeSheetPreviewUrl();
  state.editingId = null;
  state.draftImageBlob = null;
}

function syncPurchasedSwitchFromQty() {
  const actualQty = Math.max(0, Math.floor(Number(els.fieldActualQty.value) || 0));
  const targetQty = Math.max(1, Math.floor(Number(els.fieldTargetQty.value) || 1));
  if (actualQty === 0) {
    els.fieldIsPurchased.checked = false;
  } else if (actualQty >= targetQty) {
    els.fieldIsPurchased.checked = true;
  } else {
    els.fieldIsPurchased.checked = false;
  }
}

async function handlePhotoSelected(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if (!file) return;

  try {
    els.photoSizeInfo.textContent = '圖片壓縮中...';
    const result = await compressImageFile(file);
    state.draftImageBlob = result.blob;
    state.draftRemoveOriginalImage = false;
    const editingItem = state.editingId ? state.items.find((it) => it.id === state.editingId) : null;
    renderSheetPhotoPreview(editingItem);
    showToast(`照片已壓縮 (${formatBytes(result.size)})`);
  } catch (err) {
    showToast(`圖片處理失敗：${err.message}`);
  }
}

async function handleSaveSheet(event) {
  event.preventDefault();
  const name = els.fieldName.value.trim();
  if (!name) {
    showToast('請輸入商品名稱');
    els.fieldName.focus();
    return;
  }

  const twPriceRaw = els.fieldTwPrice.value.trim();
  const targetPriceRaw = els.fieldTargetPrice.value.trim();
  const actualPriceRaw = els.fieldActualPrice.value.trim();
  const twPrice = twPriceRaw === '' ? null : Math.max(0, Number(twPriceRaw));
  let targetPrice = targetPriceRaw === '' ? null : Math.max(0, Number(targetPriceRaw));
  if (targetPrice === null && twPrice !== null && state.exchangeRate > 0) {
    targetPrice = Math.floor(twPrice / state.exchangeRate);
  }
  const actualPrice = actualPriceRaw === '' ? null : Math.max(0, Number(actualPriceRaw));
  const targetQty = Math.max(1, Math.floor(Number(els.fieldTargetQty.value) || 1));
  const actualQty = Math.max(0, Math.floor(Number(els.fieldActualQty.value) || 0));
  const isPurchased = els.fieldIsPurchased.checked;
  const requester = els.fieldRequester.value.trim();
  const purchasedStore = els.fieldPurchasedStore.value.trim();
  let stores = normalizeStores(els.fieldStores.value);
  if (purchasedStore && !stores.includes(purchasedStore) && !state.editingId) {
    stores = [purchasedStore, ...stores];
  }
  const note = els.fieldNote.value.trim();

  const existing = state.editingId ? state.items.find((it) => it.id === state.editingId) : null;

  if (existing) {
    const editedSet = new Set(existing.editedFields || []);
    if (name !== existing.name) editedSet.add('name');
    if (state.draftRemoveOriginalImage) editedSet.add('image');
    if (JSON.stringify(stores) !== JSON.stringify(existing.stores || [])) editedSet.add('stores');
    if (twPrice !== existing.twPrice) editedSet.add('twPrice');

    const updated = normalizeItem({
      ...existing,
      name,
      image: state.draftRemoveOriginalImage ? '' : existing.image,
      imageBlob: state.draftImageBlob,
      twPrice,
      targetPrice,
      actualPrice,
      targetQty,
      actualQty,
      stores,
      purchasedStore,
      requester,
      note,
      isPurchased,
      editedFields: [...editedSet]
    });

    await putItem(updated);
    showToast('已儲存至本機');
  } else {
    const extraItem = normalizeItem({
      id: `extra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      image: '',
      imageBlob: state.draftImageBlob,
      twPrice,
      targetPrice,
      actualPrice,
      targetQty,
      actualQty: isPurchased && actualQty === 0 ? targetQty : actualQty,
      stores,
      purchasedStore,
      requester,
      note,
      isPurchased,
      isExtra: true
    }, true);

    await putItem(extraItem);
    showToast('已新增代購商品至本機');
  }

  closeItemSheet();
  await reloadItemsFromDB();
  renderAll();
}

async function handleDeleteCurrentItem() {
  if (!state.editingId) return;
  const target = state.items.find((it) => it.id === state.editingId);
  if (!target) return;

  const ok = await showConfirmDialog({
    title: '確認刪除商品',
    message: `確定要刪除「${target.name}」嗎？刪除後無法復原。`,
    actions: [
      { label: '取消', value: false, className: 'btn-secondary' },
      { label: '確認刪除', value: true, className: 'btn-danger' }
    ]
  });
  if (!ok) return;

  await deleteItem(target.id);
  if (!target.isExtra) {
    addDeletedStaticId(target.id);
  }
  closeItemSheet();
  await reloadItemsFromDB();
  renderAll();
  await refreshCacheProgress();
  showToast('已刪除商品');
}

// ==================== Lightbox 與雙指縮放平移手勢 ====================
const lbState = {
  scale: 1,
  tx: 0,
  ty: 0,
  pointers: new Map(),
  startDist: 0,
  startScale: 1,
  lastSingleX: 0,
  lastSingleY: 0,
  lastTapTime: 0
};

function applyLightboxTransform() {
  els.lightboxImg.style.transform = `translate3d(${lbState.tx}px, ${lbState.ty}px, 0) scale(${lbState.scale})`;
}

function resetLightboxTransform() {
  lbState.scale = 1;
  lbState.tx = 0;
  lbState.ty = 0;
  applyLightboxTransform();
}

function openLightbox(item) {
  const src = resolveImageSource(item);
  if (!src) {
    showToast('此商品尚未設定圖片');
    return;
  }
  resetLightboxTransform();
  els.lightboxImg.src = src;
  // 日文尋貨字卡只顯示商品名稱與日文詢問句，刻意隱藏委託人與私人備註
  els.lightboxItemName.textContent = item.name;
  els.lightbox.classList.remove('hidden');
}

function closeLightbox() {
  els.lightbox.classList.add('hidden');
  els.lightboxImg.removeAttribute('src');
  lbState.pointers.clear();
}

function getPointerDistance(p1, p2) {
  return Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
}

function initLightboxGestures() {
  const stage = els.lightboxStage;

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture?.(e.pointerId);
    lbState.pointers.set(e.pointerId, e);

    if (lbState.pointers.size === 1) {
      lbState.lastSingleX = e.clientX;
      lbState.lastSingleY = e.clientY;

      const now = Date.now();
      if (now - lbState.lastTapTime < 280) {
        if (lbState.scale > 1.1) {
          resetLightboxTransform();
        } else {
          lbState.scale = 2.2;
          lbState.tx = 0;
          lbState.ty = 0;
          applyLightboxTransform();
        }
        lbState.lastTapTime = 0;
      } else {
        lbState.lastTapTime = now;
      }
    } else if (lbState.pointers.size === 2) {
      const [p1, p2] = [...lbState.pointers.values()];
      lbState.startDist = getPointerDistance(p1, p2);
      lbState.startScale = lbState.scale;
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!lbState.pointers.has(e.pointerId)) return;
    lbState.pointers.set(e.pointerId, e);

    if (lbState.pointers.size === 1 && lbState.scale > 1) {
      const dx = e.clientX - lbState.lastSingleX;
      const dy = e.clientY - lbState.lastSingleY;
      lbState.lastSingleX = e.clientX;
      lbState.lastSingleY = e.clientY;
      lbState.tx += dx;
      lbState.ty += dy;
      applyLightboxTransform();
    } else if (lbState.pointers.size === 2 && lbState.startDist > 0) {
      const [p1, p2] = [...lbState.pointers.values()];
      const dist = getPointerDistance(p1, p2);
      const nextScale = Math.min(4, Math.max(1, lbState.startScale * (dist / lbState.startDist)));
      lbState.scale = nextScale;
      if (nextScale <= 1.02) {
        lbState.tx = 0;
        lbState.ty = 0;
      }
      applyLightboxTransform();
    }
  });

  const endPointer = (e) => {
    lbState.pointers.delete(e.pointerId);
    if (lbState.pointers.size === 1) {
      const [remaining] = [...lbState.pointers.values()];
      lbState.lastSingleX = remaining.clientX;
      lbState.lastSingleY = remaining.clientY;
    }
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // 支援桌面滑鼠滾輪縮放驗證
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    lbState.scale = Math.min(4, Math.max(1, lbState.scale + delta));
    if (lbState.scale === 1) {
      lbState.tx = 0;
      lbState.ty = 0;
    }
    applyLightboxTransform();
  }, { passive: false });
}

// ==================== 備份 / 匯入 / 重置 ====================
async function handleExportBackup() {
  try {
    const data = await buildFullBackupData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `jp-shopping-backup-${stamp}.json`,
      JSON.stringify(data, null, 2),
      'application/json;charset=utf-8'
    );
    showToast(`已匯出完整備份（${data.items.length} 項）`);
  } catch (err) {
    showToast(`匯出失敗：${err.message}`);
  }
}

async function handleExportTemplate() {
  const data = buildStaticTemplateData(state.items);
  downloadTextFile(
    'items.json',
    JSON.stringify(data, null, 2),
    'application/json;charset=utf-8'
  );
  showToast('已匯出靜態 items.json 範本');
}

async function handleImportJsonFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (parsed && parsed.backupType === 'jp-shopping-full-backup') {
      const mode = await showConfirmDialog({
        title: '偵測到完整備份檔',
        message: `包含 ${parsed.items?.length || 0} 筆商品紀錄（匯出時間：${(parsed.exportedAt || '').slice(0, 10)}）。\n請選擇還原方式：`,
        actions: [
          { label: '取消', value: null, className: 'btn-ghost' },
          { label: '合併較新紀錄', value: 'merge', className: 'btn-secondary' },
          { label: '完整覆蓋還原', value: 'replace', className: 'btn-primary' }
        ]
      });
      if (!mode) return;

      const res = await restoreFullBackup(parsed, mode);
      state.exchangeRate = getExchangeRate();
      await reloadItemsFromDB();
      renderAll();
      await refreshCacheProgress();
      showToast(`已成功還原 ${res.count} 筆資料`);
      return;
    }

    if (parsed && Array.isArray(parsed.items)) {
      const res = await mergeStaticData(parsed, { isManualImport: true });
      state.exchangeRate = getExchangeRate();
      await reloadItemsFromDB();
      renderAll();
      await refreshCacheProgress();
      showToast(`無損合併完成：新增 ${res.added}、更新 ${res.updated}、移除 ${res.removed}、保留 ${res.preserved}`);
      return;
    }

    showToast('無法辨識的 JSON 格式');
  } catch (err) {
    showToast(`匯入失敗：${err.message}`);
  }
}

async function handleResetAll() {
  const ok = await showConfirmDialog({
    title: '重置本機所有資料',
    message: '此動作會清除所有已勾選狀態、實付價格、現場拍照與額外代購項目，並重新載入初始靜態清單。\n建議先匯出 JSON 備份。確定要重置嗎？',
    actions: [
      { label: '取消', value: false, className: 'btn-secondary' },
      { label: '確定重置', value: true, className: 'btn-danger' }
    ]
  });
  if (!ok) return;

  await clearAllItems();
  clearDeletedStaticIds();
  localStorage.removeItem('jp_shop_items_version');
  state.items = [];
  await syncInitialStaticData({ manual: false });
  await reloadItemsFromDB();
  renderAll();
  await refreshCacheProgress();
  showToast('已重置為初始清單');
}

// ==================== 事件綁定 ====================
function bindEvents() {
  window.addEventListener('online', updateNetworkBadge);
  window.addEventListener('offline', updateNetworkBadge);

  // 底部導覽列
  for (const btn of els.navItems) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }

  // 頂部預載離線包 & 主題快速切換
  els.btnHeaderPrecache.addEventListener('click', runPrecacheAll);
  els.btnThemeToggle.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    applyTheme(next);
    const labelMap = { auto: '跟隨系統', light: '明亮模式', dark: '深色模式' };
    showToast(`外觀已切換：${labelMap[next]}`);
  });

  // 狀態 Segmented Control
  for (const btn of els.segBtns) {
    btn.addEventListener('click', () => {
      state.filters.status = btn.dataset.status;
      setFilterPrefs(state.filters);
      renderListView();
    });
  }

  // 店家篩選 Pill
  els.storeFilterBar.addEventListener('click', (e) => {
    const pill = e.target.closest('.store-pill');
    if (!pill) return;
    state.filters.store = pill.dataset.store;
    setFilterPrefs(state.filters);
    renderListView();
  });

  // 關鍵字搜尋
  els.searchInput.addEventListener('input', () => {
    state.filters.search = els.searchInput.value;
    setFilterPrefs(state.filters);
    renderListView();
  });
  els.btnClearSearch.addEventListener('click', () => {
    state.filters.search = '';
    setFilterPrefs(state.filters);
    renderListView();
    els.searchInput.focus();
  });
  els.btnResetFilters.addEventListener('click', () => {
    state.filters = { status: 'unpurchased', store: 'ALL', search: '' };
    setFilterPrefs(state.filters);
    renderListView();
  });

  // 商品清單互動（事件委派）
  els.itemList.addEventListener('click', (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;
    const id = card.dataset.id;
    const item = state.items.find((it) => it.id === id);
    if (!item) return;

    const actionEl = e.target.closest('[data-action]');
    const action = actionEl?.dataset.action || 'edit';

    if (action === 'toggle') {
      toggleQuickPurchase(id);
    } else if (action === 'zoom') {
      openLightbox(item);
    } else {
      openItemSheet(id);
    }
  });

  // FAB 新增額外代購
  els.btnFabAdd.addEventListener('click', () => openItemSheet(null));

  // Bottom Sheet 控制
  els.btnSheetClose.addEventListener('click', closeItemSheet);
  els.sheetBackdrop.addEventListener('click', (e) => {
    if (e.target === els.sheetBackdrop) closeItemSheet();
  });

  els.btnCameraCapture.addEventListener('click', () => els.inputCamera.click());
  els.btnGalleryPick.addEventListener('click', () => els.inputGallery.click());
  els.inputCamera.addEventListener('change', () => handlePhotoSelected(els.inputCamera));
  els.inputGallery.addEventListener('change', () => handlePhotoSelected(els.inputGallery));

  els.btnRemovePhoto.addEventListener('click', () => {
    const editingItem = state.editingId ? state.items.find((it) => it.id === state.editingId) : null;
    if (state.draftImageBlob) {
      state.draftImageBlob = null;
    } else if (editingItem && editingItem.image) {
      state.draftRemoveOriginalImage = true;
    }
    renderSheetPhotoPreview(editingItem);
  });

  els.btnActualMinus.addEventListener('click', () => {
    els.fieldActualQty.value = String(Math.max(0, (Number(els.fieldActualQty.value) || 0) - 1));
    syncPurchasedSwitchFromQty();
    updateSheetLiveTotal();
  });
  els.btnActualPlus.addEventListener('click', () => {
    els.fieldActualQty.value = String(Math.max(0, (Number(els.fieldActualQty.value) || 0) + 1));
    syncPurchasedSwitchFromQty();
    updateSheetLiveTotal();
  });
  els.btnTargetMinus.addEventListener('click', () => {
    els.fieldTargetQty.value = String(Math.max(1, (Number(els.fieldTargetQty.value) || 1) - 1));
    syncPurchasedSwitchFromQty();
  });
  els.btnTargetPlus.addEventListener('click', () => {
    els.fieldTargetQty.value = String(Math.max(1, (Number(els.fieldTargetQty.value) || 1) + 1));
    syncPurchasedSwitchFromQty();
  });

  els.fieldTwPrice.addEventListener('input', () => {
    updateSheetTwLimitHint();
    updateSheetLiveTotal();
  });
  els.fieldActualPrice.addEventListener('input', updateSheetLiveTotal);
  els.fieldActualQty.addEventListener('input', () => {
    syncPurchasedSwitchFromQty();
    updateSheetLiveTotal();
  });
  els.fieldTargetQty.addEventListener('input', syncPurchasedSwitchFromQty);
  els.fieldIsPurchased.addEventListener('change', () => {
    if (els.fieldIsPurchased.checked && (Number(els.fieldActualQty.value) || 0) === 0) {
      els.fieldActualQty.value = String(Math.max(1, Number(els.fieldTargetQty.value) || 1));
      updateSheetLiveTotal();
    }
  });

  els.itemForm.addEventListener('submit', handleSaveSheet);
  els.btnDeleteItem.addEventListener('click', handleDeleteCurrentItem);

  // Lightbox 控制
  els.btnLightboxClose.addEventListener('click', closeLightbox);
  els.btnLightboxReset.addEventListener('click', resetLightboxTransform);
  initLightboxGestures();

  // 結帳統計頁控制
  els.inputExchangeRate.addEventListener('input', () => {
    const val = Number(els.inputExchangeRate.value);
    if (Number.isFinite(val) && val > 0) {
      state.exchangeRate = setExchangeRate(val);
      renderListView();
      renderCheckoutView();
    }
  });

  els.btnResetRate.addEventListener('click', () => {
    state.exchangeRate = setExchangeRate(DEFAULT_EXCHANGE_RATE);
    els.inputExchangeRate.value = String(state.exchangeRate);
    renderAll();
    showToast(`已恢復預設匯率 ${state.exchangeRate}`);
  });

  els.btnCopyAllLine.addEventListener('click', async () => {
    const stats = computeCheckoutStats(state.items, state.exchangeRate);
    const text = formatLineSummary(stats, state.exchangeRate);
    const ok = await copyTextToClipboard(text);
    showToast(ok ? '已複製全部 LINE 收費明細' : '複製失敗，請改用預覽文字手動複製');
  });

  els.btnPreviewLine.addEventListener('click', () => {
    const stats = computeCheckoutStats(state.items, state.exchangeRate);
    els.linePreviewText.value = formatLineSummary(stats, state.exchangeRate);
    els.modalLinePreview.classList.remove('hidden');
  });

  els.btnLinePreviewClose.addEventListener('click', () => {
    els.modalLinePreview.classList.add('hidden');
  });
  els.modalLinePreview.addEventListener('click', (e) => {
    if (e.target === els.modalLinePreview) els.modalLinePreview.classList.add('hidden');
  });
  els.btnLinePreviewCopy.addEventListener('click', async () => {
    const ok = await copyTextToClipboard(els.linePreviewText.value);
    showToast(ok ? '已複製 LINE 文字明細' : '複製失敗');
  });

  els.btnExportCsv.addEventListener('click', () => {
    const csv = generateCsvContent(state.items, state.exchangeRate);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`jp-shopping-report-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('已匯出 UTF-8 BOM CSV 報表');
  });

  els.requesterGroups.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-requester]');
    if (copyBtn) {
      const reqName = copyBtn.dataset.copyRequester;
      const stats = computeCheckoutStats(state.items, state.exchangeRate);
      const text = formatLineSummary(stats, state.exchangeRate, reqName);
      const ok = await copyTextToClipboard(text);
      showToast(ok ? `已複製「${reqName}」的明細` : '複製失敗');
      return;
    }

    const row = e.target.closest('[data-edit-id]');
    if (row) {
      openItemSheet(row.dataset.editId);
    }
  });

  // 設定與備份頁控制
  els.btnCheckUpdate.addEventListener('click', () => syncInitialStaticData({ manual: true }));
  els.btnPrecacheAll.addEventListener('click', runPrecacheAll);
  els.btnExportBackup.addEventListener('click', handleExportBackup);
  els.btnExportTemplate.addEventListener('click', handleExportTemplate);
  els.btnImportJson.addEventListener('click', () => els.inputImportFile.click());
  els.inputImportFile.addEventListener('change', async () => {
    const file = els.inputImportFile.files && els.inputImportFile.files[0];
    els.inputImportFile.value = '';
    await handleImportJsonFile(file);
  });

  for (const btn of els.themeSelectorBtns) {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  }

  // 委託人清單管理
  const addNewRequester = () => {
    const name = els.inputNewRequester.value.trim();
    if (!name) return;
    const current = getRequesterList();
    if (current.includes(name)) {
      showToast(`「${name}」已在清單中`);
      return;
    }
    setRequesterList([...current, name]);
    els.inputNewRequester.value = '';
    renderRequesterSettings();
    showToast(`已新增委託人：${name}`);
  };

  els.btnAddRequester.addEventListener('click', addNewRequester);
  els.inputNewRequester.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewRequester();
    }
  });

  els.settingsRequesterList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-requester]');
    if (!btn) return;
    const target = btn.dataset.removeRequester;
    const next = getRequesterList().filter((n) => n !== target);
    setRequesterList(next);
    renderRequesterSettings();
    showToast(`已移除委託人：${target}`);
  });

  els.btnResetRequesters.addEventListener('click', () => {
    resetRequesterList();
    renderRequesterSettings();
    showToast('已恢復預設委託人清單');
  });

  els.btnResetAll.addEventListener('click', handleResetAll);
}

// ==================== 程式進入點 ====================
async function init() {
  applyTheme(state.theme);
  updateNetworkBadge();
  bindEvents();

  await openDB();
  await reloadItemsFromDB();
  renderAll();
  await refreshCacheProgress();

  await registerServiceWorker();
  await syncInitialStaticData({ manual: false });
}

init().catch((err) => {
  console.error('App initialization failed:', err);
  showToast('初始化發生錯誤，請重新整理頁面');
});
