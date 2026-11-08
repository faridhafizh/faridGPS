const MAX_PAGES = 50;
const MAX_TOTAL_MS = 5 * 60 * 1000;
const PAGE_WAIT_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForDynamicContent(timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = window.setTimeout(finish, timeout);
    const observer = new MutationObserver(() => {
      // reset timer on activity
      window.clearTimeout(timer);
      window.setTimeout(finish, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // initial delay
    window.setTimeout(finish, 500);
  });
}

function extractRecord(selectors: Record<string, string>): Record<string, string | null> {
  const record: Record<string, string | null> = {};
  for (const [field, selector] of Object.entries(selectors)) {
    try {
      const el = document.querySelector(selector);
      record[field] = el ? (el.textContent || '').trim() : null;
    } catch {
      record[field] = null;
    }
  }
  return record;
}

function findNextLink(selector?: string): string | null {
  try {
    const el = selector ? document.querySelector(selector) : null;
    const link = el?.closest('a') || document.querySelector('a[rel="next"]');
    return link ? (link as HTMLAnchorElement).href : null;
  } catch {
    return null;
  }
}

interface ScrapeParams {
  selectors: Record<string, string>;
  nextSelector?: string;
  maxPages?: number;
  maxTotalMs?: number;
}

export async function scrape(params: ScrapeParams): Promise<{ records: Record<string, string | null>[]; truncated: boolean }> {
  const maxPages = params.maxPages ?? MAX_PAGES;
  const maxTotalMs = params.maxTotalMs ?? MAX_TOTAL_MS;
  const start = Date.now();
  const visited = new Set<string>();
  const records: Record<string, string | null>[] = [];
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    if (Date.now() - start > maxTotalMs) {
      truncated = true;
      break;
    }
    const url = location.href;
    if (visited.has(url)) {
      truncated = true;
      break;
    }
    visited.add(url);

    await waitForDynamicContent();
    records.push(extractRecord(params.selectors));

    if (Date.now() - start > maxTotalMs) {
      truncated = true;
      break;
    }

    const nextUrl = findNextLink(params.nextSelector);
    if (!nextUrl) break;

    // navigate
    location.assign(nextUrl);
    await sleep(PAGE_WAIT_MS);
  }

  return { records, truncated };
}

// Auto-detect heuristics: suggest common selectors
export function autoDetect(): { selectors: Record<string, string>; nextSelector?: string } {
  const selectors: Record<string, string> = {};
  if (document.querySelector('h1')) selectors.title = 'h1';
  if (document.querySelector('article')) selectors.content = 'article';
  const next = document.querySelector('a[rel="next"], a.next, .pagination a:last-child');
  return { selectors, nextSelector: next ? 'a[rel="next"], a.next, .pagination a:last-child' : undefined };
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SCRAPE') {
    scrape(msg.params).then((res) => sendResponse(res)).catch((e) => sendResponse({ records: [], truncated: true, error: String(e) }));
    return true;
  }
  if (msg?.type === 'AUTODETECT') {
    sendResponse(autoDetect());
    return true;
  }
});