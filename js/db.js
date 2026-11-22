import { blobToDataUrl, dataUrlToBlob } from './image-util.js';

const DB_NAME = 'jp_shopping_db';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';

export const DEFAULT_EXCHANGE_RATE = 0.201;
export const DEFAULT_REQUESTERS = ['哥哥', '佩芳', '冠州', '媽媽', '旺調'];

const LS_KEYS = {
  exchangeRate: 'jp_shop_exchange_rate',
  itemsVersion: 'jp_shop_items_version',
  filterPrefs: 'jp_shop_filter_prefs',
  theme: 'jp_shop_theme',
  deletedStaticIds: 'jp_shop_deleted_static_ids',
  requesters: 'jp_shop_requesters'
};

let dbPromise = null;

/**
 * 開啟 IndexedDB 資料庫
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const store = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        store.createIndex('isPurchased', 'isPurchased', { unique: false });
        store.createIndex('requester', 'requester', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('IndexedDB 開啟失敗'));
    };
  });
  return dbPromise;
}

/**
 * 讀取全部商品清單
 * @returns {Promise<Array<object>>}
 */
export async function getAllItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    const req = tx.objectStore(STORE_ITEMS).getAll();
    req.onsuccess = () => resolve((req.result || []).map((item) => normalizeItem(item)));
    req.onerror = () => reject(req.error);
  });
}

/**
 * 依 ID 讀取單一商品
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    const req = tx.objectStore(STORE_ITEMS).get(id);
    req.onsuccess = () => resolve(req.result ? normalizeItem(req.result) : null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 新增或更新單筆商品
 * @param {object} item
 * @returns {Promise<object>}
 */
export async function putItem(item) {
  const db = await openDB();
  const normalized = normalizeItem({ ...item, updatedAt: Date.now() });
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    tx.objectStore(STORE_ITEMS).put(normalized);
    tx.oncomplete = () => resolve(normalized);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 批次寫入多筆商品
 * @param {Array<object>} items
 * @returns {Promise<void>}
 */
export async function bulkPutItems(items) {
  if (!items || items.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    const store = tx.objectStore(STORE_ITEMS);
    for (const item of items) {
      store.put(normalizeItem(item));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 刪除指定 ID 商品
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    tx.objectStore(STORE_ITEMS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 清空全部商品資料
 * @returns {Promise<void>}
 */
export async function clearAllItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    tx.objectStore(STORE_ITEMS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- localStorage 輕量設定 ----------

export function hasCustomExchangeRate() {
  return localStorage.getItem(LS_KEYS.exchangeRate) !== null;
}

export function getExchangeRate() {
  const raw = Number(localStorage.getItem(LS_KEYS.exchangeRate));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EXCHANGE_RATE;
}

export function setExchangeRate(rate) {
  const num = Number(rate);
  if (!Number.isFinite(num) || num <= 0) return getExchangeRate();
  localStorage.setItem(LS_KEYS.exchangeRate, String(num));
  return num;
}

export function getItemsVersion() {
  return localStorage.getItem(LS_KEYS.itemsVersion) || '';
}

export function setItemsVersion(version) {
  if (typeof version === 'string') {
    localStorage.setItem(LS_KEYS.itemsVersion, version);
  }
}

export function getFilterPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEYS.filterPrefs) || '{}');
    return {
      status: ['unpurchased', 'all', 'purchased'].includes(parsed.status) ? parsed.status : 'unpurchased',
      store: typeof parsed.store === 'string' && parsed.store ? parsed.store : 'ALL',
      search: typeof parsed.search === 'string' ? parsed.search : ''
    };
  } catch {
    return { status: 'unpurchased', store: 'ALL', search: '' };
  }
}

export function setFilterPrefs(prefs) {
  localStorage.setItem(LS_KEYS.filterPrefs, JSON.stringify({
    status: prefs.status || 'unpurchased',
    store: prefs.store || 'ALL',
    search: prefs.search || ''
  }));
}

export function getTheme() {
  const theme = localStorage.getItem(LS_KEYS.theme);
  return ['auto', 'light', 'dark'].includes(theme) ? theme : 'auto';
}

export function setTheme(theme) {
  if (['auto', 'light', 'dark'].includes(theme)) {
    localStorage.setItem(LS_KEYS.theme, theme);
  }
}

export function getDeletedStaticIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEYS.deletedStaticIds) || '[]');
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function addDeletedStaticId(id) {
  const set = getDeletedStaticIds();
  set.add(String(id));
  localStorage.setItem(LS_KEYS.deletedStaticIds, JSON.stringify([...set]));
}

export function clearDeletedStaticIds(idsToKeep = null) {
  if (!idsToKeep) {
    localStorage.removeItem(LS_KEYS.deletedStaticIds);
    return;
  }
  localStorage.setItem(LS_KEYS.deletedStaticIds, JSON.stringify([...idsToKeep]));
}

export function getRequesterList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEYS.requesters) || 'null');
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map((s) => String(s).trim()).filter(Boolean))];
    }
  } catch {
    // ignore parse error
  }
  return [...DEFAULT_REQUESTERS];
}

export function setRequesterList(arr) {
  const cleaned = Array.isArray(arr)
    ? [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))]
    : [...DEFAULT_REQUESTERS];
  localStorage.setItem(LS_KEYS.requesters, JSON.stringify(cleaned));
  return cleaned;
}

export function resetRequesterList() {
  localStorage.removeItem(LS_KEYS.requesters);
  return [...DEFAULT_REQUESTERS];
}

// ---------- 資料正規化與無損合併 ----------

function toNullableNonNegNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function toPositiveInt(val, fallback = 1) {
  const num = Math.floor(Number(val));
  return Number.isFinite(num) && num >= 1 ? num : fallback;
}

function toNonNegInt(val, fallback = 0) {
  const num = Math.floor(Number(val));
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

export function normalizeStores(stores) {
  if (Array.isArray(stores)) {
    return [...new Set(stores.map((s) => String(s).trim()).filter(Boolean))];
  }
  if (typeof stores === 'string') {
    return [...new Set(stores.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean))];
  }
  return [];
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, idx) => v === b[idx]);
}

/**
 * 正規化商品物件以符合 IndexedDB Schema
 * @param {object} raw
 * @param {boolean} [isExtraDefault=false]
 * @returns {object}
 */
export function normalizeItem(raw, isExtraDefault = false) {
  return {
    id: String(raw.id || `extra_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    name: String(raw.name || '').trim(),
    image: typeof raw.image === 'string' ? raw.image : '',
    imageBlob: raw.imageBlob instanceof Blob ? raw.imageBlob : null,
    twPrice: toNullableNonNegNumber(raw.twPrice),
    targetPrice: toNullableNonNegNumber(raw.targetPrice),
    actualPrice: toNullableNonNegNumber(raw.actualPrice),
    targetQty: toPositiveInt(raw.targetQty, 1),
    actualQty: toNonNegInt(raw.actualQty, 0),
    stores: normalizeStores(raw.stores),
    purchasedStore: typeof raw.purchasedStore === 'string' ? raw.purchasedStore.trim() : '',
    requester: typeof raw.requester === 'string' ? raw.requester.trim() : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    isPurchased: Boolean(raw.isPurchased),
    isExtra: typeof raw.isExtra === 'boolean' ? raw.isExtra : isExtraDefault,
    editedFields: Array.isArray(raw.editedFields) ? [...new Set(raw.editedFields.map(String))] : [],
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now()
  };
}

/**
 * 靜態清單無損合併邏輯：
 * - 新項目（IndexedDB 無此 id）：直接新增寫入（除非自動同步且該靜態項已被本機手動刪除）。
 * - 既有項目：僅在未列於 editedFields 時更新 name、image、stores，絕對保留已購買與實買紀錄。
 * - 已從新清單消失的舊靜態項目：若尚未購買且未在本機編輯過、無自拍圖，則同步移除；否則保留本機紀錄。
 *
 * @param {object} jsonData
 * @param {{isManualImport?: boolean}} [options]
 * @returns {Promise<{added: number, updated: number, removed: number, preserved: number, version: string}>}
 */
export async function mergeStaticData(jsonData, { isManualImport = false } = {}) {
  if (!jsonData || !Array.isArray(jsonData.items)) {
    throw new Error('清單格式不正確，找不到 items 陣列');
  }

  const existingItems = await getAllItems();
  const existingMap = new Map(existingItems.map((it) => [it.id, it]));
  const deletedStaticIds = getDeletedStaticIds();
  const incomingIds = new Set();

  const toPut = [];
  const toDeleteIds = [];
  let added = 0;
  let updated = 0;
  let removed = 0;
  let preserved = 0;

  for (const raw of jsonData.items) {
    if (!raw || !raw.id) continue;
    const id = String(raw.id);
    incomingIds.add(id);

    // 手動匯入時，若新清單包含之前刪過的項目，允許重新恢復
    if (isManualImport && deletedStaticIds.has(id)) {
      deletedStaticIds.delete(id);
    }

    const existing = existingMap.get(id);
    if (!existing) {
      if (!isManualImport && deletedStaticIds.has(id)) {
        continue;
      }
      toPut.push(normalizeItem({ ...raw, isExtra: false }, false));
      added += 1;
      continue;
    }

    const edited = new Set(existing.editedFields || []);
    const next = { ...existing };
    let changed = false;

    const incomingName = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!edited.has('name') && incomingName && incomingName !== existing.name) {
      next.name = incomingName;
      changed = true;
    }

    const incomingImage = typeof raw.image === 'string' ? raw.image : '';
    if (!edited.has('image') && incomingImage !== existing.image) {
      next.image = incomingImage;
      changed = true;
    }

    const incomingStores = normalizeStores(raw.stores);
    if (!edited.has('stores') && Array.isArray(raw.stores) && !arraysEqual(incomingStores, existing.stores)) {
      next.stores = incomingStores;
      changed = true;
    }

    const incomingTwPrice = toNullableNonNegNumber(raw.twPrice);
    if (!edited.has('twPrice') && incomingTwPrice !== existing.twPrice) {
      next.twPrice = incomingTwPrice;
      changed = true;
    }

    if (changed) {
      next.updatedAt = Date.now();
      toPut.push(next);
      updated += 1;
    }
    preserved += 1;
  }

  // 清除在新靜態清單已移除、且本機尚未購買也未修改過的舊靜態項目
  for (const existing of existingItems) {
    if (existing.isExtra || incomingIds.has(existing.id)) continue;
    const untouched =
      !existing.isPurchased &&
      (existing.actualQty || 0) === 0 &&
      (!existing.editedFields || existing.editedFields.length === 0) &&
      !existing.imageBlob;
    if (untouched) {
      toDeleteIds.push(existing.id);
      removed += 1;
    }
  }

  if (toPut.length > 0) {
    await bulkPutItems(toPut);
  }
  for (const id of toDeleteIds) {
    await deleteItem(id);
  }

  if (isManualImport) {
    clearDeletedStaticIds(deletedStaticIds);
  }

  const version = typeof jsonData.version === 'string' ? jsonData.version : '';
  if (version) {
    setItemsVersion(version);
  }

  if (!hasCustomExchangeRate() && Number(jsonData.defaultExchangeRate) > 0) {
    setExchangeRate(Number(jsonData.defaultExchangeRate));
  }

  return { added, updated, removed, preserved, version };
}

/**
 * 打包匯出本機完整備份 JSON（含壓縮圖 Base64）
 * @returns {Promise<object>}
 */
export async function buildFullBackupData() {
  const items = await getAllItems();
  const serializedItems = [];

  for (const item of items) {
    const clone = { ...item };
    if (item.imageBlob instanceof Blob) {
      clone.imageDataUrl = await blobToDataUrl(item.imageBlob);
    } else {
      clone.imageDataUrl = null;
    }
    delete clone.imageBlob;
    serializedItems.push(clone);
  }

  return {
    backupType: 'jp-shopping-full-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    itemsVersion: getItemsVersion(),
    exchangeRate: getExchangeRate(),
    requesters: getRequesterList(),
    deletedStaticIds: [...getDeletedStaticIds()],
    items: serializedItems
  };
}

/**
 * 還原完整備份 JSON
 * @param {object} backupJson
 * @param {'replace'|'merge'} [mode='replace']
 * @returns {Promise<{count: number, mode: string}>}
 */
export async function restoreFullBackup(backupJson, mode = 'replace') {
  if (!backupJson || backupJson.backupType !== 'jp-shopping-full-backup' || !Array.isArray(backupJson.items)) {
    throw new Error('非有效的完整備份檔案格式');
  }

  const restoredItems = backupJson.items.map((raw) => {
    const blob = raw.imageDataUrl ? dataUrlToBlob(raw.imageDataUrl) : null;
    const copy = { ...raw, imageBlob: blob };
    delete copy.imageDataUrl;
    return normalizeItem(copy);
  });

  if (mode === 'replace') {
    await clearAllItems();
    await bulkPutItems(restoredItems);
    if (Number(backupJson.exchangeRate) > 0) {
      setExchangeRate(Number(backupJson.exchangeRate));
    }
    if (typeof backupJson.itemsVersion === 'string') {
      setItemsVersion(backupJson.itemsVersion);
    }
    if (Array.isArray(backupJson.deletedStaticIds)) {
      clearDeletedStaticIds(new Set(backupJson.deletedStaticIds.map(String)));
    } else {
      clearDeletedStaticIds();
    }
    if (Array.isArray(backupJson.requesters)) {
      setRequesterList(backupJson.requesters);
    }
    return { count: restoredItems.length, mode };
  }

  // merge 模式：依更新時間或既有規則合併
  const existingMap = new Map((await getAllItems()).map((it) => [it.id, it]));
  const toPut = [];
  for (const incoming of restoredItems) {
    const existing = existingMap.get(incoming.id);
    if (!existing || incoming.updatedAt > existing.updatedAt) {
      toPut.push(incoming);
    }
  }
  await bulkPutItems(toPut);
  return { count: toPut.length, mode };
}

/**
 * 將目前清單整理成可覆寫 data/items.json 的乾淨靜態模板格式
 * @param {Array<object>} items
 * @returns {object}
 */
export function buildStaticTemplateData(items) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  return {
    version: `${y}.${m}.${d}.01`,
    defaultExchangeRate: getExchangeRate(),
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      image: it.image || '',
      twPrice: it.twPrice,
      targetPrice: it.targetPrice,
      targetQty: it.targetQty,
      stores: it.stores,
      requester: it.requester,
      note: it.note
    }))
  };
}
