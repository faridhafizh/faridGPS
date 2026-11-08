import { saveConfig, loadConfig } from './storage';

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function setStatus(msg: string): void {
  const el = document.getElementById('status') as HTMLElement;
  el.textContent = msg;
}

document.getElementById('autodetect')!.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => {
      // ask content script
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTODETECT' }, (res) => resolve(res));
      });
    },
  });
  const res = inj?.result as { selectors: Record<string, string>; nextSelector?: string } | undefined;
  if (res) {
    (document.getElementById('selectors') as HTMLTextAreaElement).value = JSON.stringify(res.selectors, null, 2);
    (document.getElementById('next') as HTMLInputElement).value = res.nextSelector || '';
    setStatus('Auto-detect applied');
  }
});

document.getElementById('save')!.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const hostname = new URL(tab.url || '').hostname;
  let selectors: Record<string, string> = {};
  try {
    selectors = JSON.parse((document.getElementById('selectors') as HTMLTextAreaElement).value);
  } catch {
    setStatus('Invalid JSON');
    return;
  }
  const next = (document.getElementById('next') as HTMLInputElement).value;
  await saveConfig(hostname, { selectors, nextSelector: next || undefined });
  setStatus('Saved for ' + hostname);
});

document.getElementById('scrape')!.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const format = (document.getElementById('format') as HTMLSelectElement).value as 'json' | 'csv';
  setStatus('Scraping...');
  chrome.runtime.sendMessage({ type: 'RUN_SCRAPE', tabId: tab.id, format }, (res) => {
    if (res?.ok) setStatus('Done');
    else setStatus('Error: ' + (res?.error || 'unknown'));
  });
});

// load existing config
(async () => {
  const tab = await getActiveTab();
  const hostname = new URL(tab.url || '').hostname;
  const cfg = await loadConfig(hostname);
  if (cfg) {
    (document.getElementById('selectors') as HTMLTextAreaElement).value = JSON.stringify(cfg.selectors, null, 2);
    (document.getElementById('next') as HTMLInputElement).value = cfg.nextSelector || '';
  }
})();