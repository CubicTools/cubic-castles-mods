/* Isolated-world bridge: extension resources are loaded here, while all game
 * WebSocket work stays in the page's MAIN world. No game data crosses over.
 *
 * When the extension reloads (a new copy on disk, or ↻ in chrome://extensions)
 * Chrome cuts this script off from it, but the game page keeps running, so the
 * popup's buttons and chips would do nothing until the tab is refreshed. The
 * background injects a fresh bridge into open game tabs instead; this copy
 * then goes quiet (another bridge took over, or its extension is gone). */
(() => {
  "use strict";

  const me = {};
  window.__ccBridge = me;          // the newest bridge in this tab wins
  function contextAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  function active() {
    return window.__ccBridge === me && contextAlive();
  }

  const SOURCE = "cc-browser-mod-bridge-v1";
  const MAIN_SOURCE = "cc-browser-mod-main-v1";
  const CONFIG_KEY = "cc-browser-mods-config-v1";
  const MENU_BUTTON_IDS = [1, 2, 3, 4, 5, 6, 12, 14, 15, 16, 17, 18, 19];
  let catalogPromise = null;
  let pricesPromise = null;

  function catalogFromBackground() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "cc-browser-load-catalog" }, response => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!response || !response.ok) reject(new Error(response && response.message || "catalog unavailable"));
        else resolve(response.catalog);
      });
    });
  }

  function loadCatalog() {
    if (!catalogPromise) {
      // The background serves the catalog of whichever feature version runs
      // (a self-installed update may carry a newer one than this folder).
      catalogPromise = catalogFromBackground()
        .catch(() => fetch(chrome.runtime.getURL("catalog.json")).then(response => {
          if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
          return response.json();
        }))
        .then(data => data || {})
        .catch(error => {
          catalogPromise = null;
          throw error;
        });
    }
    return catalogPromise;
  }

  async function sendResources() {
    try {
      const catalog = await loadCatalog();
      window.postMessage({
        source: SOURCE,
        type: "resources",
        blocks: catalog.BLOCKS || {},
        // "version_name": "dev X.Y.Z" = the unpacked working copy (debug). Published
        // releases have it stripped by cc_publish.py.
        debug: /dev/i.test(chrome.runtime.getManifest().version_name || ""),
        // item names by kind, for reading what's in a vending machine's glass
        items: { BLOCKS: catalog.BLOCKS || {}, WEAR: catalog.WEAR || {},
                 MISC: catalog.MISC || {}, SPECIAL: catalog.SPECIAL || {} },
        menuIcons: Object.fromEntries(MENU_BUTTON_IDS.map(id => [
          id, chrome.runtime.getURL(`menu-icons/menu-${String(id).padStart(2, "0")}.png`)
        ])),
        splashUrls: ["splash1.png", "splash3.png", "splash4.png"]
          .map(name => chrome.runtime.getURL(`splash/${name}`))
      }, "*");
    } catch (error) {
      window.postMessage({
        source: SOURCE,
        type: "resource-error",
        message: String(error && error.message || error)
      }, "*");
    }
  }

  function loadPrices() {
    if (!pricesPromise) {
      pricesPromise = new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "cc-browser-load-prices" }, response => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else if (!response || !response.ok) reject(new Error(response && response.message || "price service unavailable"));
          else resolve(response);
        });
      }).catch(error => {
        pricesPromise = null;
        throw error;
      });
    }
    return pricesPromise;
  }

  async function sendPrices() {
    try {
      const prices = await loadPrices();
      window.postMessage({
        source: SOURCE,
        type: "price-resources",
        vends: prices.vends,
        community: prices.community,
        loadedAt: prices.loadedAt
      }, "*");
    } catch (error) {
      window.postMessage({
        source: SOURCE,
        type: "price-resource-error",
        message: String(error && error.message || error)
      }, "*");
    }
  }

  function sendConfig() {
    chrome.storage.local.get(CONFIG_KEY, result => {
      window.postMessage({
        source: SOURCE,
        type: "extension-config",
        config: result && result[CONFIG_KEY] || {}
      }, "*");
      window.postMessage({ source: SOURCE, type: "request-config-sync" }, "*");
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!active() || area !== "local" || !changes[CONFIG_KEY]) return;
    window.postMessage({
      source: SOURCE,
      type: "extension-config",
      config: changes[CONFIG_KEY].newValue || {}
    }, "*");
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!active() || !message || message.source !== "cc-browser-popup-v1") return;
    if (message.type === "finder-report-request" || message.type === "set-waypoint") {
      if (message.type === "set-waypoint") {
        window.postMessage({ source: SOURCE, type: "set-waypoint", item: message.item }, "*");
        sendResponse({ ok: true });
        return;
      }
      const requestId = `${Date.now()}-${Math.random()}`;
      const onReply = event => {
        const data = event.data;
        if (event.source !== window || !data || data.source !== MAIN_SOURCE ||
            data.type !== "finder-report" || data.requestId !== requestId) return;
        window.removeEventListener("message", onReply);
        clearTimeout(timer);
        sendResponse({ ok: true, report: data.report });
      };
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        sendResponse({ ok: false });
      }, 1500);
      window.addEventListener("message", onReply);
      window.postMessage({ source: SOURCE, type: "finder-request", requestId }, "*");
      return true;
    }
    if (message.type === "command") {
      window.postMessage({ source: SOURCE, type: "command", command: message.command }, "*");
      sendResponse({ ok: true });
      return;
    }
  });

  window.addEventListener("message", event => {
    const data = event.data;
    if (!active()) return;
    if (event.source === window && data &&
        data.source === MAIN_SOURCE) {
      if (data.type === "request-resources") {
        sendResources();
        sendPrices();
      } else if (data.type === "save-config" && data.config && typeof data.config === "object") {
        chrome.storage.local.set({ [CONFIG_KEY]: data.config });
      } else if (data.type === "store-catalog") {
        // the Cubit Store window: the game's own catalogue file, fetched by
        // the background (the page can't read cubiccastles.com)
        chrome.runtime.sendMessage({ type: "cc-store-catalog" }, reply => {
          if (chrome.runtime.lastError) reply = { ok: false, message: "extension reloaded — refresh this tab" };
          window.postMessage({ source: SOURCE, type: "store-catalog", requestId: data.requestId,
            ok: !!(reply && reply.ok), b64: reply && reply.b64, message: reply && reply.message }, "*");
        });
      }
    }
  });

  sendResources();
  sendPrices();
  sendConfig();
  const priceTimer = setInterval(() => {
    if (!active()) { clearInterval(priceTimer); return; }
    pricesPromise = null;
    sendPrices();
  }, 15 * 60 * 1000);
})();
