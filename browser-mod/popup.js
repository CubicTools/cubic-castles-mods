(() => {
  "use strict";

  const CONFIG_KEY = "cc-browser-mods-config-v1";
  const DEFAULTS = {
    hudVisible: true,
    finderFossils: true,
    loadingScreen: true,
    opacity: 0.94,
    cameraMode: 0,
    cameraForwardShift: 22,
    cameraVerticalShift: -1,
    cameraSyncPicking: true,
    cameraHideSelfTag: true,
    cameraTagOffset: -106,
    cameraAlignmentVersion: 2,
    lightingMode: 0,
    vendPriceCard: true,
    multiPreview: false,
    multiAction: "break",
    multiMode: "forward",
    multiCount: 6,
    multiReach: 3,
    finderGlow: true,
    glowOffset: [0, 0, 0],
    plotBx: "", plotBy: "", plotBz: "",
    plotOverlay: false,
    friendsPanel: true,
    profilePanel: true,
    storePanel: true,
    perksPanel: true,
    menuPanel: true,
    playerNames: true,
    noFog: true,
    chatCommands: true
  };
  const toggles = ["hudVisible", "finderFossils", "loadingScreen",
    "vendPriceCard", "finderGlow", "multiPreview", "friendsPanel", "profilePanel", "storePanel", "perksPanel", "menuPanel", "playerNames", "noFog", "chatCommands"];
  const sliders = ["opacity", "multiCount"];
  let config = { ...DEFAULTS };

  const byId = id => document.getElementById(id);
  const extensionReady = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  // Keep my plot is debug-only: the unpacked working copy has
  // "version_name": "dev X.Y.Z"; cc_publish.py strips it from releases.
  const debugBuild = !extensionReady ||
    /dev/i.test(chrome.runtime.getManifest().version_name || "");
  // Hidden, not removed: the listeners below still bind to its inputs.
  byId("plotSection").hidden = !debugBuild;

  function setStatus(message, tone = "normal") {
    byId("status").textContent = message;
    byId("status").dataset.tone = tone;
  }

  function render() {
    toggles.forEach(id => { byId(id).checked = !!config[id]; });
    sliders.forEach(id => { byId(id).value = String(config[id]); });
    byId("opacityValue").textContent = `${Math.round(Number(config.opacity) * 100)}%`;
    byId("multiCount").max = config.multiMode === "forward" ? "6" : config.multiMode === "group" ? "9" : "8";
    byId("multiCountValue").textContent = String(config.multiCount);
    if (typeof renderFinderSelection === "function") renderFinderSelection();
    document.querySelectorAll("[data-camera-mode]").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.cameraMode) === Number(config.cameraMode));
    });
    document.querySelectorAll("[data-lighting-mode]").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.lightingMode) === Number(config.lightingMode));
    });
    document.querySelectorAll("[data-multi-action]").forEach(button => {
      button.classList.toggle("active", button.dataset.multiAction === config.multiAction);
    });
    document.querySelectorAll("[data-multi-mode]").forEach(button => {
      button.classList.toggle("active", button.dataset.multiMode === config.multiMode);
    });
  }

  function save() {
    render();
    if (extensionReady) chrome.storage.local.set({ [CONFIG_KEY]: config });
  }

  toggles.forEach(id => byId(id).addEventListener("change", event => {
    config[id] = event.target.checked;
    save();
  }));
  sliders.forEach(id => byId(id).addEventListener("input", event => {
    config[id] = Number(event.target.value);
    save();
  }));
  document.querySelectorAll("[data-camera-mode]").forEach(button => button.addEventListener("click", () => {
    const mode = Number(button.dataset.cameraMode);
    config.cameraMode = mode;
    if (mode === 1) {
      config.cameraForwardShift = 22;
      config.cameraVerticalShift = -1;
    } else if (mode === 2) {
      config.cameraForwardShift = 17;
      config.cameraVerticalShift = -1;
    }
    save();
  }));
  document.querySelectorAll("[data-lighting-mode]").forEach(button => button.addEventListener("click", () => {
    config.lightingMode = Number(button.dataset.lightingMode);
    save();
  }));
  document.querySelectorAll("[data-multi-action]").forEach(button => button.addEventListener("click", () => {
    config.multiAction = button.dataset.multiAction;
    save();
  }));
  document.querySelectorAll("[data-multi-mode]").forEach(button => button.addEventListener("click", () => {
    config.multiMode = button.dataset.multiMode;
    const cap = config.multiMode === "forward" ? 6 : config.multiMode === "group" ? 9 : 8;
    config.multiCount = config.multiMode === "group" ? 9 : Math.min(cap, Number(config.multiCount) || 6);
    save();
  }));
  byId("reset").addEventListener("click", () => {
    const preserved = {
      customBlockIds: config.customBlockIds,
      favorites: config.favorites,
      hudPosition: config.hudPosition
    };
    config = { ...config, ...DEFAULTS, ...preserved };
    save();
    setStatus("Settings reset.", "good");
  });
  byId("openMarket").addEventListener("click", () => {
    if (!extensionReady || !chrome.tabs) {
      setStatus("Open this from the extension toolbar on castles.cc.", "bad");
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        setStatus("No active game tab was found.", "bad");
        return;
      }
      chrome.tabs.sendMessage(tab.id, {
        source: "cc-browser-popup-v1",
        type: "command",
        command: "open-market"
      }, response => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          setStatus("Open castles.cc, reload it, then try again.", "bad");
          return;
        }
        setStatus("Vending search opened in game.", "good");
        setTimeout(() => window.close(), 250);
      });
    });
  });

  // ---- Block Finder (lives here instead of on the game screen) ----
  let catalog = [];
  let lastReport = null;

  const blockLabel = id => {
    const hit = catalog.find(item => item.id === id);
    return hit ? hit.name : lastReport && lastReport.names && lastReport.names[id] || `Block ${id}`;
  };

  fetch("catalog.json").then(response => response.json()).then(data => {
    catalog = Object.entries(data.BLOCKS || {})
      .map(([id, name]) => ({ id: Number(id), name: String(name) }))
      .filter(item => item.id > 0 && item.id <= 4095 && item.name !== "(Unused)")
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    renderFinderSelection();
  }).catch(() => {});

  function selectedIds() {
    return Array.isArray(config.customBlockIds) ? config.customBlockIds : [];
  }

  function renderFinderSelection() {
    const box = byId("finderSelected");
    box.replaceChildren();
    for (const id of selectedIds()) {
      const pill = document.createElement("button");
      pill.className = "pill";
      pill.textContent = `${blockLabel(id)} ×`;
      pill.title = "Stop finding this block";
      pill.addEventListener("click", () => {
        config.customBlockIds = selectedIds().filter(value => value !== id);
        save();
        setTimeout(refreshFinder, 250);
      });
      box.append(pill);
    }
  }

  function renderMatches() {
    const query = byId("finderSearch").value.trim().toLowerCase();
    const box = byId("finderMatches");
    box.replaceChildren();
    if (!query) return;
    const chosen = new Set(selectedIds());
    const matches = (/^#?\d+$/.test(query) ?
      catalog.filter(item => item.id === Number(query.replace("#", ""))) :
      catalog.filter(item => item.name.toLowerCase().includes(query)))
      .filter(item => !chosen.has(item.id)).slice(0, 25);
    for (const item of matches) {
      const button = document.createElement("button");
      button.className = "match";
      button.textContent = `${item.name}  #${item.id}`;
      button.addEventListener("click", () => addBlock(item));
      box.append(button);
    }
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "No block names matched.";
      box.append(empty);
    }
  }

  function addBlock(item) {
    if (!item) return;
    config.customBlockIds = Array.from(new Set([...selectedIds(), item.id])).slice(0, 100);
    byId("finderSearch").value = "";
    renderMatches();
    save();
    setTimeout(refreshFinder, 250);
  }

  function withGameTab(callback) {
    if (!extensionReady || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (tab && tab.id) callback(tab);
    });
  }

  function renderResults(report) {
    lastReport = report;
    const summary = byId("finderSummary");
    const box = byId("finderResults");
    box.replaceChildren();
    if (!report || !report.ready) {
      summary.textContent = "Enter (or re-enter) a realm to scan its blocks.";
      return;
    }
    summary.textContent = report.total ?
      `${report.realm || "This realm"} · ${report.placed.length} placed · ${report.stored.length} stored` :
      `${report.realm || "This realm"} · none of your blocks here (${report.blocks.toLocaleString()} scanned)`;
    const groups = new Map();
    for (const [kind, list] of [["placed", report.placed], ["stored", report.stored]]) {
      for (const item of list) {
        if (!groups.has(item.id)) groups.set(item.id, []);
        groups.get(item.id).push({ ...item, kind });
      }
    }
    const target = report.waypoint;
    for (const [id, items] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
      const row = document.createElement("div");
      row.className = "result";
      const name = document.createElement("div");
      name.className = "result-name";
      name.textContent = `${report.names[id] || blockLabel(id)} · ${items.length}`;
      const coords = document.createElement("div");
      coords.className = "coords";
      for (const item of items.slice(0, 24)) {
        const button = document.createElement("button");
        button.className = "coord";
        if (target && target.x === item.x && target.y === item.y && target.z === item.z) button.classList.add("active");
        button.textContent = `${item.x},${item.y},${item.z}${item.kind === "stored" ? " ▣" : ""}`;
        button.title = "Make this the glowing target";
        button.addEventListener("click", () => withGameTab(tab => {
          chrome.tabs.sendMessage(tab.id, {
            source: "cc-browser-popup-v1", type: "set-waypoint",
            item: { x: item.x, y: item.y, z: item.z, id: item.id }
          }, () => setTimeout(refreshFinder, 150));
        }));
        coords.append(button);
      }
      if (items.length > 24) {
        const more = document.createElement("span");
        more.className = "hint";
        more.textContent = `+${items.length - 24} more`;
        coords.append(more);
      }
      row.append(name, coords);
      box.append(row);
    }
  }

  function refreshFinder() {
    withGameTab(tab => chrome.tabs.sendMessage(tab.id, {
      source: "cc-browser-popup-v1", type: "finder-report-request"
    }, response => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        byId("finderSummary").textContent = "Reload the castles.cc tab to connect the Finder.";
        return;
      }
      renderResults(response.report);
    }));
  }

  byId("finderSearch").addEventListener("input", renderMatches);
  byId("finderSearch").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    const first = byId("finderMatches").querySelector(".match");
    if (first) first.click();
  });
  ["finderFossils"].forEach(id => byId(id).addEventListener("change", () => setTimeout(refreshFinder, 250)));

  // ---- Keep my plot: in-game panel switch ----
  byId("plotOverlay").addEventListener("change", () => {
    config.plotOverlay = byId("plotOverlay").checked;
    if (extensionReady) chrome.storage.local.set({ [CONFIG_KEY]: config });
    // A game tab opened before the extension was (re)loaded can't hear the
    // switch at all — say so instead of silently showing nothing.
    const hint = byId("plotHint");
    hint.textContent = "";
    if (!config.plotOverlay || !extensionReady) return;
    withGameTab(tab => chrome.tabs.sendMessage(tab.id, {
      source: "cc-browser-popup-v1", type: "finder-report-request"
    }, response => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        hint.textContent = "The game tab isn't connected — refresh castles.cc (F5), then the panel shows top-right.";
      } else {
        hint.textContent = "Panel is on — top-right of the game.";
      }
    }));
  });

  // ---- updates: the extension installs new feature versions by itself ----
  function setUpdateInfo(text) { byId("updateInfo").textContent = text; }

  function describeUpdate(info) {
    const v = info.features;
    if (info.reloading) return `New copy from Cubic Mods (v${v}) — reloading. Your game tab reconnects by itself.`;
    if (!info.ok) return `v${v || "?"} · ${info.message}`;
    const parts = [];
    if (info.justInstalled) parts.push(`Updated itself to v${v} — refresh the game tab to use it.`);
    else if (info.available && info.dev) parts.push(`v${info.latest} is out; this dev copy runs its own files (v${v}).`);
    else if (info.available && !info.allowed) {
      parts.push(`v${info.latest} is available (you have v${v}). To let the extension update ` +
        "itself, turn on \"Allow User Scripts\" in its settings (once).");
    } else if (info.available) parts.push(`v${info.latest} is available (you have v${v}).`);
    else parts.push(`v${v} · up to date.`);
    if (info.error) parts.push(`Update failed: ${info.error}`);
    if (info.folderOutdated) {
      parts.push("Optional: Cubic Mods' Check for updates also refreshes this popup's own files.");
    }
    if (info.notes && (info.available || info.justInstalled)) parts.push(info.notes);
    return parts.join(" ");
  }

  function refreshUpdate() {
    if (!extensionReady || !chrome.runtime.sendMessage) {
      setUpdateInfo("Updates work once loaded as an extension.");
      byId("updateNow").hidden = true;
      return;
    }
    const button = byId("updateNow");
    button.disabled = true;
    setUpdateInfo("Checking for updates…");
    chrome.runtime.sendMessage({ type: "cc-update-check" }, info => {
      button.disabled = false;
      if (!info) return;
      setUpdateInfo(describeUpdate(info));
      byId("allowUserScripts").hidden = !!info.allowed || !!info.dev || info.reloading;
    });
  }

  byId("updateNow").addEventListener("click", refreshUpdate);
  byId("allowUserScripts").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "cc-open-extension-settings" });
  });

  refreshUpdate();

  if (extensionReady) {
    chrome.storage.local.get(CONFIG_KEY, result => {
      config = { ...DEFAULTS, ...(result && result[CONFIG_KEY] || {}) };
      render();
      renderFinderSelection();
      byId("plotOverlay").checked = config.plotOverlay === true;
      refreshFinder();
      setInterval(refreshFinder, 2500);
    });
  } else {
    render();
    setStatus("Preview mode · load as an extension to control the game.");
  }
})();
