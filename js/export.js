/**
 * 結帳金額試算、委託人分組、LINE 請款純文字與 UTF-8 BOM CSV 匯出工具
 */

/**
 * 依單品日圓小計無條件進位計算台幣金額
 * @param {number} jpyAmount
 * @param {number} exchangeRate
 * @returns {number}
 */
export function calcItemTwd(jpyAmount, exchangeRate) {
  const jpy = Number(jpyAmount) || 0;
  const rate = Number(exchangeRate) || 0;
  if (jpy <= 0 || rate <= 0) return 0;
  return Math.ceil(jpy * rate);
}

/**
 * 格式化日圓數字（加上千分位）
 * @param {number|null|undefined} amount
 * @returns {string}
 */
export function formatJpy(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '未填';
  return `¥${Math.round(Number(amount)).toLocaleString('zh-TW')}`;
}

/**
 * 格式化台幣數字
 * @param {number} amount
 * @returns {string}
 */
export function formatTwd(amount) {
  return `NT$${Math.round(Number(amount) || 0).toLocaleString('zh-TW')}`;
}

/**
 * 計算結帳統計與依委託人分組明細（納入所有 actualQty > 0 之品項）
 * @param {Array<object>} items
 * @param {number} exchangeRate
 */
export function computeCheckoutStats(items, exchangeRate) {
  const purchasedItems = items.filter((it) => (it.actualQty || 0) > 0);
  const groupMap = new Map();

  let totalJpy = 0;
  let totalTwd = 0;
  let totalQty = 0;
  let missingPriceCount = 0;

  for (const item of purchasedItems) {
    const qty = item.actualQty || 0;
    const hasPrice = item.actualPrice !== null && item.actualPrice !== undefined;
    const unitJpy = hasPrice ? Number(item.actualPrice) : 0;
    const jpySubtotal = unitJpy * qty;
    const twdSubtotal = calcItemTwd(jpySubtotal, exchangeRate);

    if (!hasPrice) missingPriceCount += 1;

    totalJpy += jpySubtotal;
    totalTwd += twdSubtotal;
    totalQty += qty;

    const requester = item.requester && item.requester.trim() ? item.requester.trim() : '未指定';
    if (!groupMap.has(requester)) {
      groupMap.set(requester, {
        requester,
        items: [],
        groupJpy: 0,
        groupTwd: 0,
        totalQty: 0,
        missingPriceCount: 0
      });
    }

    const group = groupMap.get(requester);
    group.items.push({
      item,
      qty,
      unitJpy: hasPrice ? unitJpy : null,
      jpySubtotal,
      twdSubtotal,
      missingPrice: !hasPrice
    });
    group.groupJpy += jpySubtotal;
    group.groupTwd += twdSubtotal;
    group.totalQty += qty;
    if (!hasPrice) group.missingPriceCount += 1;
  }

  // 將「自己」排最後或金額高者優先，方便向親友請款
  const groups = [...groupMap.values()].sort((a, b) => {
    if (a.requester === '自己' && b.requester !== '自己') return 1;
    if (b.requester === '自己' && a.requester !== '自己') return -1;
    return b.groupTwd - a.groupTwd || a.requester.localeCompare(b.requester, 'zh-Hant');
  });

  return {
    purchasedItemCount: purchasedItems.length,
    totalQty,
    totalJpy,
    totalTwd,
    missingPriceCount,
    groups
  };
}

/**
 * 產生可直接貼到 LINE 群組或私訊的請款純文字明細
 * @param {ReturnType<typeof computeCheckoutStats>} stats
 * @param {number} exchangeRate
 * @param {string|null} [requesterFilter=null] 指定單一委託人時僅產出該人明細
 * @returns {string}
 */
export function formatLineSummary(stats, exchangeRate, requesterFilter = null) {
  const targetGroups = requesterFilter
    ? stats.groups.filter((g) => g.requester === requesterFilter)
    : stats.groups;

  if (targetGroups.length === 0) {
    return '目前尚無已購買紀錄。';
  }

  const lines = [];
  if (requesterFilter) {
    lines.push(`🇯🇵 日本代購明細｜${requesterFilter}`);
  } else {
    lines.push('🇯🇵 日本代購採買結帳明細');
  }
  lines.push(`匯率基準：1 JPY = ${exchangeRate} TWD（依單品無條件進位）`);
  lines.push('━━━━━━━━━━━━━━');

  for (const group of targetGroups) {
    if (!requesterFilter) {
      lines.push(`👤 【${group.requester}】 共 ${group.items.length} 項（${group.totalQty} 件）`);
    }
    group.items.forEach((entry, idx) => {
      const storeSuffix = entry.item.purchasedStore ? `＠${entry.item.purchasedStore}` : '';
      const priceText = entry.missingPrice
        ? '未填單價'
        : `¥${entry.unitJpy.toLocaleString('zh-TW')} × ${entry.qty} = ¥${entry.jpySubtotal.toLocaleString('zh-TW')} → NT$${entry.twdSubtotal.toLocaleString('zh-TW')}`;
      lines.push(`${idx + 1}. ${entry.item.name}${storeSuffix}`);
      lines.push(`   ${priceText}`);
    });
    lines.push(`👉 ${group.requester} 應收小計：¥${group.groupJpy.toLocaleString('zh-TW')} ／ NT$${group.groupTwd.toLocaleString('zh-TW')}`);
    if (group.missingPriceCount > 0) {
      lines.push(`   ⚠️ 尚有 ${group.missingPriceCount} 項未填實際單價`);
    }
    lines.push('');
  }

  if (!requesterFilter && targetGroups.length > 1) {
    lines.push('━━━━━━━━━━━━━━');
    lines.push(`💰 總計已買：${stats.purchasedItemCount} 項（${stats.totalQty} 件）`);
    lines.push(`總花費日圓：¥${stats.totalJpy.toLocaleString('zh-TW')}`);
    lines.push(`總換算台幣：NT$${stats.totalTwd.toLocaleString('zh-TW')}`);
  }

  return lines.join('\n').trim();
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 產生含 UTF-8 BOM 的 CSV 內容，確保 Excel 開啟中文不亂碼
 * @param {Array<object>} items
 * @param {number} exchangeRate
 * @returns {string}
 */
export function generateCsvContent(items, exchangeRate) {
  const headers = [
    '商品名稱',
    '類型',
    '委託人',
    '店家',
    '參考單價(JPY)',
    '實買單價(JPY)',
    '實買數量',
    '小計(JPY)',
    '換算台幣(TWD)',
    '狀態',
    '備註'
  ];

  const rows = [headers.map(escapeCsvCell).join(',')];

  for (const item of items) {
    const qty = item.actualQty || 0;
    const hasPrice = item.actualPrice !== null && item.actualPrice !== undefined;
    const jpySubtotal = hasPrice && qty > 0 ? Number(item.actualPrice) * qty : 0;
    const twdSubtotal = calcItemTwd(jpySubtotal, exchangeRate);
    const storeText = item.purchasedStore || (item.stores && item.stores.length ? item.stores.join(' / ') : '');

    let statusText = '未購買';
    if (item.isPurchased) {
      statusText = '已完成';
    } else if (qty > 0) {
      statusText = `部分購買(${qty}/${item.targetQty})`;
    }

    const cols = [
      item.name,
      item.isExtra ? '額外代購' : '預定清單',
      item.requester || '未指定',
      storeText,
      item.targetPrice ?? '',
      hasPrice ? item.actualPrice : '',
      qty,
      jpySubtotal,
      twdSubtotal,
      statusText,
      item.note || ''
    ];
    rows.push(cols.map(escapeCsvCell).join(','));
  }

  return `\uFEFF${rows.join('\r\n')}`;
}

/**
 * 觸發瀏覽器下載文字檔案
 * @param {string} filename
 * @param {string} content
 * @param {string} [mimeType='text/plain;charset=utf-8']
 */
export function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * 複製文字到剪貼簿（含降級相容做法）
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}
