/* Background worker: price files, the block catalog, and the extension's
 * self-update. */
"use strict";
importScripts("update-verify.js");

const PRICE_URLS = {
  vends: "https://cc.rootsservers.com/data/vends.json",
  community: "https://cc.rootsservers.com/data/community_prices.json"
};
const CACHE_MS = 15 * 60 * 1000;
let cached = null;
let cachedAt = 0;
let pending = null;

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache", credentials: "omit" });
  if (!response.ok) throw new Error(`price service HTTP ${response.status}`);
  return response.json();
}

async function loadPrices() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  if (!pending) {
    pending = Promise.all([fetchJson(PRICE_URLS.vends), fetchJson(PRICE_URLS.community)])
      .then(([vends, community]) => {
        cachedAt = Date.now();
        cached = { ok: true, vends, community, loadedAt: cachedAt };
        return cached;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "cc-browser-load-prices") return false;
  loadPrices().then(sendResponse).catch(error => sendResponse({
    ok: false,
    message: String(error && error.message || error)
  }));
  return true;
});

/* ---------------- Cubit Store catalogue ----------------
 * The game's own store file (the same one Cubic downloads, still scrambled;
 * cc-browser-store.js decodes it). Cached here for 30 minutes. */
const STORE_URL = "https://www.cubiccastles.com/store2/cache.dat";
let storeCache = null, storeCachedAt = 0;
async function loadStoreCatalog() {
  if (storeCache && Date.now() - storeCachedAt < 30 * 60 * 1000) return storeCache;
  const response = await fetch(STORE_URL, { cache: "no-cache", credentials: "omit" });
  if (!response.ok) throw new Error(`store HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  storeCache = { ok: true, b64: btoa(bin) };
  storeCachedAt = Date.now();
  return storeCache;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "cc-store-catalog") return false;
  loadStoreCatalog().then(sendResponse).catch(error => sendResponse({
    ok: false, message: String(error && error.message || error) }));
  return true;
});

/* ---------------- feature scripts + self-update ----------------
 * The game-page (MAIN world) scripts aren't listed in the manifest; this
 * worker registers them, so it can swap in a newer copy from the update
 * server (ccupdates.rootsservers.com, the VPS) without touching the extension's
 * folder, which Chrome never lets an extension rewrite.
 *  - "Allow User Scripts" on (chrome://extensions -> Details): they run through
 *    chrome.userScripts, from the newer of this folder's copy or a downloaded
 *    feature package kept in storage. Packages install automatically.
 *  - Off: this folder's copy runs through chrome.scripting, no self-update.
 * A package is trusted only if its exact bytes carry a valid release-key
 * signature (update-verify.js), and only if it is newer than what runs now.
 * The popup / this worker / bridge.js only change when the folder does
 * (Cubic Mods "Check for updates"); the package says when that's due. */
const UPDATE_URL = "https://ccupdates.rootsservers.com/latest.json";
const UPDATE_FILES = "https://ccupdates.rootsservers.com/files/";
const PAYLOAD_KEY = "cc-feature-payload-v1";
const ACTIVE_KEY = "cc-active-scripts-v1";
const INSTALLED_KEY = "cc-feature-installed-v1";
const SCRIPT_ID = "cc-browser-main";
const MATCHES = ["https://castles.cc/*", "https://*.castles.cc/*"];
// The unpacked working copy ("dev X.Y.Z") always runs its own files.
const IS_DEV = /dev/i.test(chrome.runtime.getManifest().version_name || "");

function userScriptsAllowed() {
  try {
    chrome.userScripts.getScripts().catch(() => {});
    return true;
  } catch (_) {
    return false;                       // toggle off (Chrome 138+) / API missing
  }
}

async function folderFile(name) {
  const response = await fetch(chrome.runtime.getURL(name), { cache: "no-store" });
  if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
  return response.json();
}

async function storedPayload() {
  if (IS_DEV) return null;
  return (await chrome.storage.local.get(PAYLOAD_KEY))[PAYLOAD_KEY] || null;
}

// What should run on the game page: { source: "folder" | "update", version, payload? }
async function activeFeatures() {
  const folder = chrome.runtime.getManifest().version;
  const stored = await storedPayload();
  if (stored && userScriptsAllowed() && ccIsNewer(stored.version, folder)) {
    return { source: "update", version: stored.version, payload: stored };
  }
  return { source: "folder", version: folder };
}

async function isRegistered(viaUserScripts) {
  try {
    const list = viaUserScripts
      ? await chrome.userScripts.getScripts({ ids: [SCRIPT_ID] })
      : await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    return list.length > 0;
  } catch (_) {
    return false;
  }
}

async function unregisterAll() {
  try { await chrome.userScripts.unregister({ ids: [SCRIPT_ID] }); } catch (_) { /* none */ }
  try { await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }); } catch (_) { /* none */ }
}

async function applyScriptsNow() {
  const want = await activeFeatures();
  const viaUserScripts = userScriptsAllowed();
  const tag = `${viaUserScripts ? "user" : "scripting"}:${want.source}:${want.version}`;
  const have = (await chrome.storage.local.get(ACTIVE_KEY))[ACTIVE_KEY];
  if (have === tag && await isRegistered(viaUserScripts)) return want;
  const files = await folderFile("scripts.json");
  await unregisterAll();
  if (viaUserScripts) {
    const js = want.payload
      ? want.payload.scripts.map(script => ({ code: script.code }))
      : files.map(file => ({ file }));
    await chrome.userScripts.register([{
      id: SCRIPT_ID, matches: MATCHES, js, runAt: "document_start", world: "MAIN"
    }]);
  } else {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID, matches: MATCHES, js: files, runAt: "document_start",
      world: "MAIN", persistAcrossSessions: true
    }]);
  }
  await chrome.storage.local.set({ [ACTIVE_KEY]: tag });
  return want;
}

let applying = Promise.resolve();
function applyScripts() {
  applying = applying.catch(() => {}).then(applyScriptsNow);
  return applying;
}

async function downloadPayload(entry) {
  if (!entry || !entry.file || !entry.sig) throw new Error("this release has no self-update package");
  const response = await fetch(UPDATE_FILES + encodeURIComponent(entry.file),
    { cache: "no-cache", credentials: "omit" });
  if (!response.ok) throw new Error(`download HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!(await ccVerifySignature(bytes, entry.sig))) {
    throw new Error("the update's signature is INVALID — refused it");
  }
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (!payload || !payload.version || !Array.isArray(payload.scripts) ||
      !payload.scripts.every(s => s && typeof s.code === "string")) {
    throw new Error("the update package is malformed");
  }
  return payload;
}

// Unpacked extensions are served straight from their folder, so this reads a
// manifest Cubic Mods just wrote, not the one Chrome loaded.
async function versionOnDisk() {
  try {
    return (await folderFile("manifest.json")).version;
  } catch (_) {
    return null;
  }
}

async function checkForUpdateNow() {
  const folder = chrome.runtime.getManifest().version;
  const onDisk = await versionOnDisk();
  if (onDisk && ccIsNewer(onDisk, folder)) {
    setTimeout(() => chrome.runtime.reload(), 400);
    return { ok: true, reloading: true, features: onDisk };
  }
  const allowed = userScriptsAllowed();
  let active = await applyScripts();
  const installed = (await chrome.storage.local.get(INSTALLED_KEY))[INSTALLED_KEY] || {};
  const status = { ok: true, dev: IS_DEV, allowed, features: active.version, folder,
                   justInstalled: installed.version === active.version &&
                     Date.now() - (installed.at || 0) < 30 * 60 * 1000 };
  let latest;
  try {
    const response = await fetch(UPDATE_URL, { cache: "no-cache", credentials: "omit" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    latest = await response.json();
  } catch (_) {
    return { ...status, ok: false, message: "Couldn't reach the update server. Check your internet connection and try again." };
  }
  status.latest = latest.version;
  status.notes = latest.notes || "";
  if (ccIsNewer(latest.version, active.version) && allowed && !IS_DEV) {
    try {
      const payload = await downloadPayload(latest.files && latest.files["extension-payload"]);
      if (ccIsNewer(payload.version, active.version)) {   // never downgrade
        await chrome.storage.local.set({ [PAYLOAD_KEY]: payload,
          [INSTALLED_KEY]: { version: payload.version, at: Date.now() } });
        catalogCache = null;
        active = await applyScripts();
        status.features = active.version;
        status.justInstalled = true;
      }
    } catch (error) {
      status.error = String(error && error.message || error);
    }
  }
  status.available = ccIsNewer(latest.version, status.features);
  // The package's popup/worker/bridge differ from this folder's: only Cubic
  // Mods can bring those (optional — the features themselves are current).
  const shell = active.payload && active.payload.shell;
  status.folderOutdated = !!shell &&
    shell !== (await folderFile("shell.json").catch(() => ({}))).hash;
  await chrome.action.setBadgeText({ text: status.available ? "NEW" : "" });
  if (status.available) await chrome.action.setBadgeBackgroundColor({ color: "#2e9e4f" });
  return status;
}

let checking = null;
function checkForUpdate() {
  if (!checking) checking = checkForUpdateNow().finally(() => { checking = null; });
  return checking;
}

// The block/item name catalog: from the installed feature package if it runs,
// else this folder's catalog.json.
let catalogCache = null;
async function loadCatalogData() {
  const active = await activeFeatures();
  if (active.payload && active.payload.catalog) return active.payload.catalog;
  return folderFile("catalog.json");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "cc-browser-load-catalog") return false;
  (catalogCache || (catalogCache = loadCatalogData()
    .catch(error => { catalogCache = null; throw error; })))
    .then(catalog => sendResponse({ ok: true, catalog }))
    .catch(error => sendResponse({ ok: false, message: String(error && error.message || error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;
  if (message.type === "cc-update-check") {
    checkForUpdate().then(sendResponse).catch(error =>
      sendResponse({ ok: false, message: String(error && error.message || error) }));
    return true;
  }
  if (message.type === "cc-open-extension-settings") {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    sendResponse({ ok: true });
  }
  return false;
});

// Game tabs that were open when the extension (re)loaded still run the game
// mods, but their bridge was cut off; give each a fresh one so the popup and
// in-game buttons keep working without refreshing the tab.
async function reconnectGameTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: MATCHES });
  } catch (_) {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id || tab.discarded) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["bridge.js"] });
    } catch (_) { /* tab still loading / closed / not the game */ }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  reconnectGameTabs();
  chrome.alarms.create("cc-update-check", { periodInMinutes: 30 });
  // a loaded / reloaded / updated folder re-registers its scripts
  await chrome.storage.local.remove(ACTIVE_KEY);
  checkForUpdate();
});
chrome.runtime.onStartup.addListener(() => { checkForUpdate(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "cc-update-check") checkForUpdate(); });
applyScripts().catch(() => {});      // every worker start: make sure they're registered
