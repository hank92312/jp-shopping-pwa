/**
 * 前端 Canvas 圖片壓縮與 Blob/DataURL/ObjectURL 工具
 */

const DEFAULT_MAX_SIDE = 800;
const DEFAULT_MAX_BYTES = 200 * 1024;
const QUALITY_STEPS = [0.75, 0.6, 0.45, 0.3];

/**
 * 讀取圖片檔為可繪製來源（優先使用 createImageBitmap 處理 EXIF 方向）
 * @param {File|Blob} file
 * @returns {Promise<{source: ImageBitmap|HTMLImageElement, width: number, height: number, cleanup: () => void}>}
 */
async function loadDrawableImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.()
      };
    } catch {
      // 某些瀏覽器或特殊格式 fallback 使用 Image 元素
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('無法讀取圖片檔案'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(url)
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * 將 Canvas 轉為指定 MIME 與品質的 Blob
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType
 * @param {number} quality
 * @returns {Promise<Blob|null>}
 */
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * 繪製縮放後畫布並嘗試壓縮為目標體積以內的 WebP（不支援時降級 JPEG）
 * @param {CanvasImageSource} source
 * @param {number} origW
 * @param {number} origH
 * @param {number} maxSide
 * @param {number} maxBytes
 */
async function renderAndEncode(source, origW, origH, maxSide, maxBytes) {
  const longest = Math.max(origW, origH);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const targetW = Math.max(1, Math.round(origW * scale));
  const targetH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('瀏覽器不支援 Canvas 2D 繪圖');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetW, targetH);

  // 先測試瀏覽器是否真正支援輸出 image/webp
  let mimeType = 'image/webp';
  let firstBlob = await canvasToBlob(canvas, mimeType, QUALITY_STEPS[0]);
  if (!firstBlob || firstBlob.type !== 'image/webp') {
    mimeType = 'image/jpeg';
    // JPEG 無透明通道，先填白底再繪製
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(source, 0, 0, targetW, targetH);
    firstBlob = await canvasToBlob(canvas, mimeType, QUALITY_STEPS[0]);
  }

  if (!firstBlob) {
    throw new Error('圖片壓縮失敗');
  }

  if (firstBlob.size < maxBytes) {
    return { blob: firstBlob, width: targetW, height: targetH };
  }

  // 若高解析或複雜紋理圖片仍超過上限，依序降品質
  let bestBlob = firstBlob;
  for (let i = 1; i < QUALITY_STEPS.length; i += 1) {
    const candidate = await canvasToBlob(canvas, mimeType, QUALITY_STEPS[i]);
    if (candidate) {
      bestBlob = candidate;
      if (candidate.size < maxBytes) {
        return { blob: candidate, width: targetW, height: targetH };
      }
    }
  }

  return { blob: bestBlob, width: targetW, height: targetH };
}

/**
 * 將使用者拍攝或挑選的圖片等比縮放並壓縮為輕量 Blob（長邊 <= 800px，目標 < 200KB）
 * @param {File|Blob} file
 * @param {number} [maxSide=800]
 * @param {number} [maxBytes=204800]
 * @returns {Promise<{blob: Blob, width: number, height: number, size: number, type: string}>}
 */
export async function compressImageFile(file, maxSide = DEFAULT_MAX_SIDE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('無效的圖片檔案');
  }

  const loaded = await loadDrawableImage(file);
  try {
    let result = await renderAndEncode(loaded.source, loaded.width, loaded.height, maxSide, maxBytes);

    // 若降低品質後仍超過 200KB，將長邊縮至 600px 再壓縮一次
    if (result.blob.size >= maxBytes && maxSide > 600) {
      result = await renderAndEncode(loaded.source, loaded.width, loaded.height, 600, maxBytes);
    }

    return {
      blob: result.blob,
      width: result.width,
      height: result.height,
      size: result.blob.size,
      type: result.blob.type
    };
  } finally {
    loaded.cleanup();
  }
}

/**
 * 將 Blob 轉為 Base64 Data URL（供 JSON 完整備份使用）
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('圖片編碼失敗'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 將 Base64 Data URL 轉回 Blob（純本地解碼，不發起網路請求）
 * @param {string} dataUrl
 * @returns {Blob|null}
 */
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return null;

  const header = dataUrl.slice(5, commaIndex);
  const base64Part = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/^([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';

  const binary = atob(base64Part);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * 格式化檔案大小顯示
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 管理 ObjectURL 生命週期，防止重複建立造成記憶體洩漏
 */
export class ObjectUrlManager {
  constructor() {
    /** @type {Map<string, {blob: Blob, url: string}>} */
    this.entries = new Map();
  }

  /**
   * 取得或建立對應 key 與 blob 的 Object URL
   * @param {string} key
   * @param {Blob|null} blob
   * @returns {string}
   */
  getUrl(key, blob) {
    if (!(blob instanceof Blob)) {
      this.revoke(key);
      return '';
    }
    const existing = this.entries.get(key);
    if (existing && existing.blob === blob) {
      return existing.url;
    }
    if (existing) {
      URL.revokeObjectURL(existing.url);
    }
    const url = URL.createObjectURL(blob);
    this.entries.set(key, { blob, url });
    return url;
  }

  /**
   * 釋放單一 key 的 Object URL
   * @param {string} key
   */
  revoke(key) {
    const existing = this.entries.get(key);
    if (existing) {
      URL.revokeObjectURL(existing.url);
      this.entries.delete(key);
    }
  }

  /**
   * 清除不在 activeKeys 中的過期 Object URL
   * @param {Set<string>} activeKeys
   */
  pruneExcept(activeKeys) {
    for (const [key, entry] of this.entries.entries()) {
      if (!activeKeys.has(key)) {
        URL.revokeObjectURL(entry.url);
        this.entries.delete(key);
      }
    }
  }

  /**
   * 釋放全部 Object URL
   */
  revokeAll() {
    for (const entry of this.entries.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.entries.clear();
  }
}
