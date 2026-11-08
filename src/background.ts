import { SelectorConfig } from './storage';

const MAX_PAGES = 50;
const MAX_TOTAL_MS = 5 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'scrape-page',
    title: 'Scrape this page',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scrape-page' && tab?.id) {
    runScrape(tab.id, 'json');
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) runScrape(tab.id, 'json');
});

function csvEscape(v: string | null): string {
  const s = v ?? '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toJson(records: Record<string, string | null>[]): string {
  return JSON.stringify(records, null, 2);
}

function toCsv(records: Record<string, string | null>[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const lines = [headers.join(',')];
  for (const r of records) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

async function runScrape(tabId: number, format: 'json' | 'csv'): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url || '');
    const hostname = url.hostname;

    const configResult = await chrome.storage.local.get('domainConfigs');
    const configs = (configResult.domainConfigs || {}) as Record<string, SelectorConfig>;
    const config = configs[hostname];

    if (!config) {
      // no config; use empty selectors
    }

    const params = {
      selectors: config?.selectors || {},
      nextSelector: config?.nextSelector,
      maxPages: MAX_PAGES,
      maxTotalMs: MAX_TOTAL_MS,
    };

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (p: any) => {
        // content script already injected via manifest; message it
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'SCRAPE', params: p }, (res) => resolve(res));
        });
      },
      args: [params],
    });

    const result = injection?.result as { records: Record<string, string | null>[]; truncated: boolean } | undefined;
    const records = result?.records || [];
    const truncated = result?.truncated || false;

    const data = format === 'json' ? toJson(records) : toCsv(records);

    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const objectUrl = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url: objectUrl,
      filename: `scrape-${hostname}-${Date.now()}.${format === 'json' ? 'json' : 'csv'}`,
    });

    try {
      await navigator.clipboard.writeText(data);
    } catch {
      // clipboard may fail in SW; ignore
    }

    await chrome.storage.local.set({
      lastResult: { format, data, truncated, recordCount: records.length, hostname, timestamp: Date.now() },
    });
  } catch (e) {
    console.error('Scrape failed', e);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_SCRAPE') {
    runScrape(msg.tabId, msg.format || 'json').then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === 'SCRAPE') {
    // forwarded from content injection path; delegate to content script via tab
    sendResponse({ records: [], truncated: false });
    return true;
  }
});