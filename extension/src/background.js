// MV3 service worker — the ONLY network layer for the DeFiPunk'd extension.
// Fetches live data from defipunkd.com, caches in chrome.storage.local,
// and responds to GET_INDEX / GET_DETAIL messages from content scripts.
try { importScripts("config.js"); } catch (e) {}
const BASE = globalThis.DPK_API_BASE || "https://defipunkd.com";

const TTL_MS = 60 * 60 * 1000;
const INDEX_KEY = "dpk.index";

// --- fetch helpers ---

async function fetchIndex() {
  const res = await fetch(`${BASE}/api/extension/index.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchIndex ${res.status}`);
  const json = await res.json();
  const data = json.protocols || json;
  await chrome.storage.local.set({ [INDEX_KEY]: { data, fetchedAt: Date.now() } });
  return data;
}

async function getIndex() {
  const stored = await chrome.storage.local.get(INDEX_KEY);
  const cached = stored[INDEX_KEY];
  if (cached && cached.data) {
    const age = Date.now() - (cached.fetchedAt || 0);
    if (age > TTL_MS) {
      // Stale-while-revalidate: return immediately, refresh in background.
      fetchIndex().catch(() => {});
    }
    return cached.data;
  }
  return await fetchIndex();
}

async function getDetail(slug) {
  const key = "dpk.detail." + slug;
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  if (cached && cached.data) {
    const age = Date.now() - (cached.fetchedAt || 0);
    if (age <= TTL_MS) return cached.data;
  }
  let res;
  try {
    res = await fetch(`${BASE}/api/extension/protocol/${encodeURIComponent(slug)}.json`, { cache: "no-store" });
  } catch (_) {
    // Network failure: return stale if available, else null.
    return (cached && cached.data) ? cached.data : null;
  }
  if (!res.ok) {
    // 404 or other error: return stale if available, else null.
    return (cached && cached.data) ? cached.data : null;
  }
  const data = await res.json();
  await chrome.storage.local.set({ [key]: { data, fetchedAt: Date.now() } });
  return data;
}

// --- message handler ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_INDEX") {
    getIndex().then(sendResponse).catch(() => sendResponse(null));
    return true; // keep channel open for async response
  }
  if (msg.type === "GET_DETAIL") {
    getDetail(msg.slug).then(sendResponse).catch(() => sendResponse(null));
    return true; // keep channel open for async response
  }
});

// --- prefetch + periodic refresh ---

chrome.runtime.onInstalled.addListener(() => {
  fetchIndex().catch(() => {});
  chrome.alarms.create("dpk-refresh", { periodInMinutes: 60 });
});

chrome.runtime.onStartup.addListener(() => {
  fetchIndex().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dpk-refresh") {
    fetchIndex().catch(() => {});
  }
});
