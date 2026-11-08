export interface SelectorConfig {
  selectors: Record<string, string>;
  nextSelector?: string;
}

const CONFIG_KEY = 'domainConfigs';
const LAST_RESULT_KEY = 'lastResult';

export async function loadConfig(hostname: string): Promise<SelectorConfig | null> {
  const result = await chrome.storage.local.get(CONFIG_KEY) as Record<string, Record<string, SelectorConfig>>;
  const configs = result[CONFIG_KEY] || {};
  return configs[hostname] || null;
}

export async function saveConfig(hostname: string, config: SelectorConfig): Promise<void> {
  const result = await chrome.storage.local.get(CONFIG_KEY) as Record<string, Record<string, SelectorConfig>>;
  const configs = result[CONFIG_KEY] || {};
  configs[hostname] = config;
  await chrome.storage.local.set({ [CONFIG_KEY]: configs });
}

export async function deleteConfig(hostname: string): Promise<void> {
  const result = await chrome.storage.local.get(CONFIG_KEY) as Record<string, Record<string, SelectorConfig>>;
  const configs = result[CONFIG_KEY] || {};
  delete configs[hostname];
  await chrome.storage.local.set({ [CONFIG_KEY]: configs });
}

export async function listConfigs(): Promise<Record<string, SelectorConfig>> {
  const result = await chrome.storage.local.get(CONFIG_KEY) as Record<string, Record<string, SelectorConfig>>;
  return result[CONFIG_KEY] || {};
}

export interface LastResult {
  format: 'json' | 'csv';
  data: string;
  truncated: boolean;
  recordCount: number;
  hostname: string;
  timestamp: number;
}

export async function saveLastResult(result: LastResult): Promise<void> {
  await chrome.storage.local.set({ [LAST_RESULT_KEY]: result });
}

export async function loadLastResult(): Promise<LastResult | null> {
  const result = await chrome.storage.local.get(LAST_RESULT_KEY) as Record<string, LastResult>;
  return result[LAST_RESULT_KEY] || null;
}