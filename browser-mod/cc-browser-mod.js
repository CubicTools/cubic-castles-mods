/* Cubic Castles Browser Mods — passive tools plus native Realm Search travel. */
(() => {
  "use strict";

  if (window.__ccBrowserModsInstalled) return;
  window.__ccBrowserModsInstalled = true;

  const Core = window.CCBrowserCore;
  if (!Core) {
    console.error("[CC Browser Mods] decoder core did not load");
    return;
  }
  const CameraCore = window.CCBrowserCamera;
  const LightingCore = window.CCBrowserLighting;
  const VendCore = window.CCBrowserVend;
  const PlannerCore = window.CCBrowserPlanner;

  const CONFIG_KEY = "cc-browser-mods-config-v1";
  const MAIN_SOURCE = "cc-browser-mod-main-v1";
  const BRIDGE_SOURCE = "cc-browser-mod-bridge-v1";
  const FOSSILS = {
    125: "Hidden Gift", 377: "Cave Art VI", 378: "Cave Art X",
    379: "Cave Art VIII", 380: "Cave Art IV", 381: "Cave Art V",
    382: "Cave Art I", 383: "Cave Art VII", 384: "Cave Art III",
    385: "Cave Art IX", 386: "Cave Art II", 387: "Cave Art XII",
    388: "Cave Art XI", 405: "Fossil II", 406: "Fossil XII",
    407: "Fossil VII", 408: "Fossil V", 409: "Fossil III",
    410: "Fossil I", 411: "Fossil XI", 412: "Fossil IX",
    413: "Fossil VIII", 414: "Fossil IV", 415: "Fossil VI",
    416: "Fossil X", 618: "Trilobyte I", 619: "Trilobyte II",
    620: "Trilobyte III", 621: "Trilobyte IV", 622: "Trilobyte V",
    623: "Trilobyte VI", 624: "Trilobyte VII", 625: "Trilobyte VIII",
    626: "Trilobyte IX", 627: "Trilobyte XI", 628: "Trilobyte X",
    629: "Trilobyte XII", 632: "Glyph I", 633: "Glyph II",
    634: "Glyph III", 635: "Glyph IV", 636: "Glyph V",
    637: "Glyph VI", 638: "Glyph VII", 639: "Glyph VIII",
    640: "Glyph IX", 641: "Glyph XI", 642: "Glyph X",
    643: "Glyph XII", 913: "Cubiosaur VI", 914: "Cubiosaur XI",
    915: "Cubiosaur V", 916: "Cubiosaur VIII", 917: "Cubiosaur III",
    918: "Cubiosaur I", 919: "Cubiosaur VII", 920: "Cubiosaur IV",
    921: "Cubiosaur IX", 922: "Cubiosaur X", 923: "Cubiosaur II",
    924: "Cubiosaur XII", 925: "Cubiosaur XIV", 926: "Cubiosaur XIII",
    927: "Cubiosaur XV", 928: "Ancient Tech V", 929: "Ancient Tech III",
    930: "Ancient Tech II", 931: "Ancient Tech XIV", 932: "Ancient Tech I",
    933: "Ancient Tech XIII", 934: "Ancient Tech VII", 935: "Ancient Tech XI",
    936: "Ancient Tech IX", 937: "Ancient Tech X", 938: "Ancient Tech VIII",
    939: "Ancient Tech XII", 940: "Ancient Tech VI", 941: "Ancient Tech IV",
    942: "Ancient Tech XV"
  };
  const FALLBACK_CATALOG = {
    ...FOSSILS,
    100: "Dirt",
    101: "Grass",
    103: "Stone Block",
    140: "Glass",
    175: "Tip Piggy",
    177: "Chest",
    179: "Prize Dispenser",
    769: "Vending Machine",
    1729: "Reverse Vending Machine",
    1730: "Silver Vending Machine",
    1731: "Gold Vending Machine"
  };
  const DEFAULT_CONFIG = {
    hudVisible: true,
    finderAutoShow: true,
    finderFossils: true,
    loadingScreen: true,
    customBlockIds: [],
    favorites: [],
    hudPosition: [18, 18],
    hudAnchor: "bottom-left-v2",
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
    vendWarp: true,
    multiPreview: false,
    multiAction: "break",
    multiMode: "forward",
    multiCount: 6,
    multiPaceMs: 150,
    multiReach: 3,
    finderGlow: true,
    glowOffset: [0, 0, 0],
    gpuHighPerformance: true,
    framePacing: true,
    hudExpanded: false,
    favoritesPosition: null,
    chatCopyPosition: null,
    chatCopySize: null,
    marketPosition: null,
    marketSize: null,
    // Keep my plot panel (debug build only), switched on from the popup.
    plotOverlay: false,
    plotPosition: null,
    // Escape -> Friends opens our friends list (cc-browser-friends.js); F4 too
    friendsPanel: true,
    // Escape -> Profile opens our profile window (cc-browser-profile.js); F2 too
    profilePanel: true,
    // Escape -> Cubit Store opens our store window (cc-browser-store.js)
    storePanel: true,
    // Escape -> Perks opens our perks window (cc-browser-perks.js); F3 too
    perksPanel: true,
    // Escape keeps the game's radial layout but refreshes its buttons (cc-browser-menu.js)
    menuPanel: true,
    // false = no name tags over players' heads (cc-browser-qol.js)
    playerNames: true,
    // true = Foggy / Bottomless Foggy realms draw clear (cc-browser-wasm-friends.js)
    noFog: true,
    // our chat commands: /ban /unban /trust /untrust /pvp /names /nofog /bright /search /w /r
    chatCommands: true,
    plotBx: "", plotBy: "", plotBz: ""
  };

  function cleanConfig(raw) {
    const cfg = { ...DEFAULT_CONFIG, ...(raw && typeof raw === "object" ? raw : {}) };
    cfg.customBlockIds = Array.from(new Set((cfg.customBlockIds || [])
      .map(Number).filter(id => Number.isInteger(id) && id > 0 && id <= 4095))).slice(0, 100);
    cfg.favorites = Array.from(new Set((cfg.favorites || [])
      .map(name => String(name || "").trim()).filter(Boolean))).slice(0, 50);
    cfg.opacity = Math.max(0.45, Math.min(1, Number(cfg.opacity) || DEFAULT_CONFIG.opacity));
    cfg.cameraMode = [0, 1, 2].includes(Number(cfg.cameraMode)) ? Number(cfg.cameraMode) : 0;
    cfg.lightingMode = [0, 1, 2].includes(Number(cfg.lightingMode)) ? Number(cfg.lightingMode) : 0;
    cfg.cameraForwardShift = Math.max(-60, Math.min(60,
      Number.isFinite(Number(cfg.cameraForwardShift)) ? Number(cfg.cameraForwardShift) : 22));
    cfg.cameraVerticalShift = Math.max(-20, Math.min(20,
      Number.isFinite(Number(cfg.cameraVerticalShift)) ? Number(cfg.cameraVerticalShift) : -1));
    cfg.cameraSyncPicking = true;
    cfg.cameraHideSelfTag = true;
    cfg.vendPriceCard = cfg.vendPriceCard !== false;
    cfg.vendWarp = cfg.vendWarp !== false;
    cfg.multiPreview = cfg.multiPreview === true;
    cfg.multiAction = cfg.multiAction === "build" ? "build" : "break";
    cfg.multiMode = ["forward", "down", "group"].includes(cfg.multiMode) ? cfg.multiMode : "forward";
    const multiCap = cfg.multiMode === "forward" ? 6 : cfg.multiMode === "group" ? 9 : 8;
    cfg.multiCount = Math.max(2, Math.min(multiCap, Math.round(Number(cfg.multiCount) || 6)));
    cfg.multiPaceMs = Math.max(100, Math.min(1000, Math.round(Number(cfg.multiPaceMs) || 150)));
    cfg.multiReach = Math.max(2, Math.min(6, Number(cfg.multiReach) || 3));
    cfg.finderGlow = cfg.finderGlow !== false;
    cfg.gpuHighPerformance = cfg.gpuHighPerformance !== false;
    cfg.framePacing = cfg.framePacing !== false;
    cfg.hudExpanded = cfg.hudExpanded === true;
    cfg.plotOverlay = cfg.plotOverlay === true;
    cfg.playerNames = cfg.playerNames !== false;
    cfg.noFog = cfg.noFog !== false;
    for (const key of ["plotBx", "plotBy", "plotBz"]) {
      cfg[key] = String(cfg[key] == null ? "" : cfg[key]).slice(0, 24);
    }
    for (const key of ["favoritesPosition", "chatCopyPosition", "chatCopySize", "marketPosition", "marketSize", "plotPosition"]) {
      cfg[key] = Array.isArray(cfg[key]) && cfg[key].length === 2 &&
        cfg[key].every(value => Number.isFinite(Number(value))) ? cfg[key].map(Number) : null;
    }
    cfg.glowOffset = Array.isArray(cfg.glowOffset) && cfg.glowOffset.length === 3 &&
      cfg.glowOffset.every(value => [-0.5, 0, 0.5].includes(Number(value))) ?
      cfg.glowOffset.map(Number) : [0, 0, 0];
    cfg.cameraTagOffset = Math.max(-180, Math.min(-25,
      Number.isFinite(Number(cfg.cameraTagOffset)) ? Number(cfg.cameraTagOffset) : -106));
    if (!raw || Number(raw.cameraAlignmentVersion) < 2) {
      // Migrate only the untouched v0.3.2 presets. Explicit custom heights are
      // preserved, while both stock camera modes return to their -1 head offset.
      if (Number(cfg.cameraVerticalShift) === 0 &&
          (Number(cfg.cameraForwardShift) === 22 || Number(cfg.cameraForwardShift) === 17)) {
        cfg.cameraVerticalShift = -1;
      }
      cfg.cameraAlignmentVersion = 2;
    }
    if (!raw || raw.hudAnchor !== "bottom-left-v2") {
      // Older builds stored [left, top]; move everyone to the new bottom-left default.
      cfg.hudPosition = DEFAULT_CONFIG.hudPosition.slice();
      cfg.hudAnchor = "bottom-left-v2";
    }
    if (!Array.isArray(cfg.hudPosition) || cfg.hudPosition.length !== 2) {
      cfg.hudPosition = DEFAULT_CONFIG.hudPosition.slice();
    }
    return cfg;
  }

  function loadConfig() {
    try {
      return cleanConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"));
    } catch (_) {
      return cleanConfig(null);
    }
  }

  let config = loadConfig();
  let catalog = { ...FALLBACK_CATALOG };
  let itemNames = null;          // {BLOCKS, WEAR, MISC, SPECIAL}: id -> name
  let debugBuild = false;        // bottom popups only in the dev copy (bridge says)
  let catalogEntries = [];
  let splashUrls = [];
  let splashIndex = -1;
  let activeDecoder = null;
  let activeTransport = null;
  let travelRequest = null;

  let waypoint = null;
  let openSockets = 0;
  let receivedFrames = 0;
  let receivedBytes = 0;
  let fps = null;
  let ui = null;
  let finderVisible = false;
  let favoritesVisible = false;
  let settingsVisible = false;
  let marketVisible = false;
  let loadingPending = false;
  let hideLoadingTimer = null;
  let loadingTransport = null;
  let renderTimer = null;
  let cameraController = null;
  let lightingController = null;
  let priceBook = VendCore ? VendCore.createPriceBook(null, null) : null;
  let priceLoadedAt = null;
  let vendPopup = null;
  let vendPopupTimer = null;
  let pointerPosition = null;
  let plannerPreview = null;
  let plannerDrawAt = 0;
  let plannerBlockMap = new Map();
  let multiArmed = null;
  let multiBurst = null;
  let multiBurstGeneration = 0;
  let multiCooldownUntil = 0;
  let multiTracker = null;
  let multiHintAt = 0;
  let lastMultiResult = null;
  let glowCells = [];
  let glowSortedAt = 0;
  const vendBought = new Map();

  // ↑/↓ chat history (cc-browser-qol.js)
  const Qol = window.CCBrowserQol;
  const CHAT_HISTORY_KEY = "cc-browser-mods-chat-history-v1";
  function storedJson(storage, key) {
    try {
      return JSON.parse(storage().getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }
  const chatHistory = Qol ? Qol.createChatHistory({
    lines: storedJson(() => localStorage, CHAT_HISTORY_KEY) || [] }) : null;
  // /ban <player> in chat: names suggested, Tab fills in (cc-browser-qol.js)
  // /search reads the price book (the same one the F7 market search uses);
  // the item list is rebuilt when a new price book arrives
  let chatItems = { book: null, names: [] };
  const chatMarket = {
    names() {
      if (!priceBook || !priceBook.loaded || !priceBook.vends) return [];
      if (chatItems.book !== priceBook) {
        const names = [];
        for (const listings of priceBook.vends.values()) if (listings[0]) names.push(listings[0].display);
        chatItems = { book: priceBook, names: names.sort((a, b) => a.localeCompare(b)) };
      }
      return chatItems.names;
    },
    cheapest(name, n) {
      return priceBook ? priceBook.listings(name).slice().sort((a, b) => a.price - b.price).slice(0, n) : [];
    }
  };
  const chatCmds = Qol && Qol.createChatCommands ? Qol.createChatCommands({ market: chatMarket }) : null;
  let chatNote = null;           // {text, tone, until}: the last /ban result
  // popup "Names" chip off = no name tags over players (cc-browser-qol.js)
  const nameHider = Qol && Qol.createNameHider ?
    Qol.createNameHider({ getMemory: () => window.CCWasmMemory || null }) : null;
  function applyNoFog() {
    const hook = window.CCWasmFriendsHook;
    if (hook && typeof hook.setNoFog === "function") hook.setNoFog(config.noFog !== false);
  }
  applyNoFog();                  // before the first realm loads
  let realmSocket = null;        // the socket that is in a realm (its close ends any chat typing)
  let chatCopyVisible = false;
  const chatLog = [];             // recent chat lines for Ctrl+C (newest last)

  if (CameraCore && typeof CameraCore.createController === "function") {
    cameraController = CameraCore.createController(window);
    cameraController.onStatus = status => updateCameraUi(status);
    cameraController.onBeforeScreenSpace = frame => captureCameraBackground(frame);
    cameraController.install();
    cameraController.configure({
      mode: config.cameraMode,
      forwardShift: config.cameraForwardShift,
      verticalShift: config.cameraVerticalShift,
      syncPicking: config.cameraSyncPicking
    });
    Object.defineProperty(window, "__ccBrowserCameraStatus", {
      configurable: true,
      value: () => cameraController.status()
    });
  }

  if (LightingCore && typeof LightingCore.createController === "function") {
    lightingController = LightingCore.createController(window);
    lightingController.onStatus = status => updateLightingUi(status);
    lightingController.install();
    lightingController.configure({ mode: config.lightingMode });
    Object.defineProperty(window, "__ccBrowserLightingStatus", {
      configurable: true,
      value: () => lightingController.status()
    });
  }

  // Hoisted; perf helpers are defined further down.
  applyPerfConfig();

  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (_) {
      // The game still works if storage is blocked; settings simply won't persist.
    }
    window.postMessage({ source: MAIN_SOURCE, type: "save-config", config }, "*");
  }

  function blockName(id) {
    return catalog[id] || FOSSILS[id] || `Block ${id}`;
  }

  function targetIds() {
    const ids = new Set(config.customBlockIds);
    if (config.finderFossils) Object.keys(FOSSILS).forEach(id => ids.add(Number(id)));
    return ids;
  }

  function currentReport() {
    return activeDecoder ? activeDecoder.targetReport(targetIds()) : { placed: [], stored: [], total: 0 };
  }

  function formatCoords(coords) {
    if (!coords) return "—";
    return coords.map(value => (value / Core.COORD_BASE).toFixed(0)).join(", ");
  }

  function setText(id, value) {
    if (ui && ui[id]) ui[id].textContent = value;
  }

  function perfStatus() {
    const perf = window.__ccBrowserPerf;
    try {
      return perf && typeof perf.status === "function" ? perf.status() : null;
    } catch (_) {
      return null;
    }
  }

  function applyPerfConfig() {
    const perf = window.__ccBrowserPerf;
    if (perf && typeof perf.configure === "function") {
      perf.configure({ gpuHighPerformance: config.gpuHighPerformance, framePacing: config.framePacing });
    }
  }

  function renderFps() {
    if (!ui || !ui.fps) return;
    // Prefer the game's real frames (Emscripten main loop); fall back to
    // browser repaints until the game loop is running.
    const perf = perfStatus();
    const frames = perf && perf.frames;
    const shown = frames && frames.fps != null ? frames.fps : fps;
    if (shown == null) {
      ui.fps.textContent = "— FPS";
      ui.fps.dataset.tone = "normal";
      return;
    }
    const low = frames && frames.low1 != null ? Math.round(frames.low1) : null;
    ui.fps.textContent = low != null ? `${Math.round(shown)} FPS · low ${low}` : `${Math.round(shown)} FPS`;
    const cap = perf && perf.loop && perf.loop.capFps || 60;
    const ratio = shown / Math.min(cap, 60);
    ui.fps.dataset.tone = ratio >= 0.9 ? "good" : ratio >= 0.6 ? "warn" : "bad";
    const lines = [`Game FPS ${Math.round(shown)}`];
    if (frames) {
      if (low != null) lines.push(`1% low ${low} FPS (worst frame ${Math.round(frames.worstMs)} ms)`);
      lines.push(`Stutters (last 5 s): ${frames.hitches}`);
      if (frames.workMs != null) lines.push(`Game CPU time per frame: ${frames.workMs.toFixed(1)} ms`);
    }
    if (perf && perf.pacing) lines.push(`Frame pacing: ${perf.pacing.reason}`);
    ui.fps.title = lines.join("\n");
  }

  function updateHud() {
    if (!ui) return;
    renderFps();
    setText("status", openSockets > 0 ? "Connected" : "Waiting");
    if (ui.status) ui.status.classList.toggle("good", openSockets > 0);
    setText("realm", activeDecoder && activeDecoder.realm || "—");
    setText("coords", formatCoords(activeDecoder && activeDecoder.coords));
    setText("blocks", activeDecoder && activeDecoder.grid ?
      activeDecoder.grid.blocks.length.toLocaleString() : "—");
    setText("hits", activeDecoder && activeDecoder.grid ?
      currentReport().total.toLocaleString() : "—");
    if (waypoint) {
      const pos = activeDecoder && activeDecoder.coords;
      if (pos) {
        const here = pos.map(value => value / Core.COORD_BASE);
        const delta = [waypoint.x - here[0], waypoint.y - here[1], waypoint.z - here[2]];
        const distance = Math.max(...delta.map(Math.abs));
        setText("target", `${blockName(waypoint.id)} · ${waypoint.x},${waypoint.y},${waypoint.z} · ${distance.toFixed(0)} away`);
      } else {
        setText("target", `${blockName(waypoint.id)} · ${waypoint.x},${waypoint.y},${waypoint.z}`);
      }
    } else {
      setText("target", "—");
    }
    ui.hud.classList.toggle("hidden", !config.hudVisible);
    renderHudFound();
  }

  let hudFoundKey = "";

  // Movable panels keep a saved [left, top]; clamp so the title bar stays on screen.
  function placePanel(panel, position) {
    if (!panel || !position) return;
    const [x, y] = position;
    const width = panel.offsetWidth || 330;
    const height = panel.offsetHeight || 50;
    // Keep the whole panel on screen when it fits, otherwise at least its top.
    panel.style.left = `${Math.max(0, Math.min(window.innerWidth - width, x))}px`;
    panel.style.top = `${Math.max(0, Math.min(window.innerHeight - height, y))}px`;
    panel.style.right = "auto";
    panel.style.transform = "none";
  }

  function placeFavorites() {
    if (ui) placePanel(ui.favorites, config.favoritesPosition);
  }

  // --- Keep my plot panel (debug build only) --------------------------------
  // Shown while the popup switch is on; no close button. Holds the bumper
  // coords and the plot keeper's controls (below).
  let plotNoteUntil = 0;
  const plotInputKeys = { plotBx: "plotBx", plotBy: "plotBy", plotBz: "plotBz" };

  function plotPanelShown() {
    return debugBuild && config.plotOverlay;
  }

  function placePlotPanel() {
    if (ui) placePanel(ui.plotPanel, config.plotPosition);
  }

  function fillPlotPanel() {
    if (!ui) return;
    const focused = ui.shadow.activeElement;
    for (const [id, key] of Object.entries(plotInputKeys)) {
      if (ui[id] !== focused) ui[id].value = config[key];
    }
  }

  function plotNote(text, tone = "") {
    if (!ui) return;
    plotNoteUntil = Date.now() + 3500;
    ui.keepStatus.textContent = text;
    ui.keepStatus.dataset.tone = tone;
  }

  function renderPlotPanel() {
    if (!ui) return;
    const shown = plotPanelShown();
    ui.plotPanel.classList.toggle("show", shown);
    if (!shown) return;
    fillPlotPanel();
    placePlotPanel();
    renderKeeper();
  }

  function savePlotInputs() {
    for (const [id, key] of Object.entries(plotInputKeys)) config[key] = ui[id].value.trim();
    saveConfig();
  }

  // --- Plot keeper: keep YOUR plot forever from this tab (debug build only) --
  // One hit from where you stand reads the time left on your bumper; with 5
  // minutes left it answers the game's own "rent this area again?" with YES,
  // then re-reads the time to confirm. Runs while this tab is in the plot's
  // realm, whether or not the panel is showing. A reload turns it off.
  const plotKeeper = Core.createPlotKeeper({
    send(body) {
      if (!activeTransport) throw new Error("not in the game");
      activeTransport.sendBody(body);
    },
    getRealm: () => activeDecoder && activeDecoder.realm,
    getPos: () => activeDecoder && activeDecoder.coords,
    log: message => console.info("[CC Keep]", message),
    onChange: () => renderKeeper()
  });
  setInterval(() => {
    plotKeeper.tick();
    renderKeeper();
  }, 1000);

  function clockText(seconds) {
    if (seconds == null) return "?";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const sec = seconds % 60;
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
  }

  const KEEP_BADGES = {
    off: ["OFF", ""], checking: ["CHECKING", "watch"], held: ["HOLDING", "good"],
    renewing: ["RENEWING", "watch"], retry: ["RETRY", "bad"], noreply: ["NO REPLY", "bad"],
    nogame: ["NO GAME", "bad"], away: ["AWAY", "bad"], nopos: ["MOVE", "bad"],
    stopped: ["STOPPED", "bad"]
  };

  function renderKeeper() {
    if (!ui || !plotPanelShown()) return;
    const v = plotKeeper.view();
    const [badge, tone] = KEEP_BADGES[v.step] || [v.step.toUpperCase(), ""];
    ui.keepBadge.textContent = badge;
    ui.keepBadge.dataset.tone = tone;
    const bits = [v.message];
    if (v.on && v.secondsLeft != null) bits.push(`${clockText(v.secondsLeft)} left`);
    if (v.on && v.step === "held" && v.nextInS != null) bits.push(`renews in ${clockText(v.nextInS)}`);
    if (v.renewals) bits.push(`${v.renewals} renewed`);
    if (Date.now() >= plotNoteUntil) {
      ui.keepStatus.textContent = bits.join(" · ");
      ui.keepStatus.dataset.tone = v.tone;
    }
    const realm = activeDecoder && activeDecoder.realm;
    ui.keepTarget.textContent = v.on ? `Keeping ${v.bx}, ${v.by}, ${v.bz}${v.realm ? ` in ${v.realm}` : ""}` :
      realm ? `Your bumper's coords in ${realm}:` : "Join the realm with your plot.";
    ui.keepButton.textContent = v.on ? "Stop keeping" : "Keep this plot";
    ui.keepButton.classList.toggle("plot-go", !v.on);
    ui.keepTestButton.disabled = v.waiting || v.step === "renewing";
  }

  // Debug: run one full renewal now (hit, YES, cost box YES, re-read the
  // time) instead of waiting for 5 minutes left. Leaves the keeper running.
  function testBuyNow() {
    savePlotInputs();
    const realm = activeDecoder && activeDecoder.realm;
    if (!realm) { plotNote("Join the realm with your plot first.", "bad"); return; }
    try {
      plotKeeper.buyNow({ bx: config.plotBx, by: config.plotBy, bz: config.plotBz, realm });
    } catch (error) {
      plotNote(error.message, "bad");
    }
  }

  function toggleKeeper() {
    if (plotKeeper.view().on) {
      plotKeeper.stop();
      return;
    }
    savePlotInputs();
    const realm = activeDecoder && activeDecoder.realm;
    if (!realm) { plotNote("Join the realm with your plot first.", "bad"); return; }
    try {
      plotKeeper.start({ bx: config.plotBx, by: config.plotBy, bz: config.plotBz, realm });
    } catch (error) {
      plotNote(error.message, "bad");
    }
  }

  function placeMarket() {
    if (!ui) return;
    if (config.marketSize) {
      const [width, height] = config.marketSize;
      ui.market.style.width = `${Math.max(320, Math.min(window.innerWidth - 8, width))}px`;
      ui.market.style.height = `${Math.max(190, Math.min(window.innerHeight - 8, height))}px`;
    }
    // Without a saved spot, centre it with plain left/top (not a transform) so
    // dragging the resize corner grows it toward the cursor.
    placePanel(ui.market, config.marketPosition ||
      [Math.round((window.innerWidth - (ui.market.offsetWidth || 680)) / 2), 18]);
  }

  // Remember the size after the user drags the corner handle.
  let marketSizeTimer = null;
  function watchMarketSize() {
    if (!ui || typeof ResizeObserver !== "function") return;
    new ResizeObserver(() => {
      if (!marketVisible || !ui.market.classList.contains("show")) return;
      const width = Math.round(ui.market.offsetWidth);
      const height = Math.round(ui.market.offsetHeight);
      const saved = config.marketSize;
      if (saved && saved[0] === width && saved[1] === height) return;
      clearTimeout(marketSizeTimer);
      marketSizeTimer = setTimeout(() => {
        config.marketSize = [width, height];
        saveConfig();
      }, 400);
    }).observe(ui.market);
  }
  window.addEventListener("resize", () => {
    placeFavorites();
    placeMarket();
  });

  function makeDraggable(panel, handle, key, place) {
    let drag = null;
    handle.addEventListener("pointerdown", event => {
      if (event.target.closest("button, input")) return;
      const rect = panel.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", event => {
      if (!drag) return;
      config[key] = [Math.round(event.clientX - drag.dx), Math.round(event.clientY - drag.dy)];
      place();
    });
    handle.addEventListener("pointerup", () => {
      if (drag) saveConfig();
      drag = null;
    });
  }

  // hudPosition = [left, distance from the bottom of the window]. Computed
  // from innerHeight so it doesn't depend on how the game page lays out.
  function placeHud() {
    if (!ui || !ui.hud) return;
    const [x, bottom] = config.hudPosition.map(Number);
    const height = ui.hud.offsetHeight || 40;
    const width = ui.hud.offsetWidth || 260;
    const left = Math.max(0, Math.min(window.innerWidth - width, x || 0));
    const top = Math.max(0, window.innerHeight - Math.max(0, bottom || 0) - height);
    ui.hud.style.left = `${left}px`;
    ui.hud.style.top = `${top}px`;
    ui.hud.style.bottom = "auto";
  }
  window.addEventListener("resize", () => placeHud());

  // The HUD's expandable list: every found block grouped by name, nearest
  // first, with clickable coordinates that set the glowing target.
  function renderHudFound() {
    if (!ui || !ui.hudFound) return;
    const ready = !!(activeDecoder && activeDecoder.grid);
    const report = ready ? currentReport() : { placed: [], stored: [], total: 0 };
    ui.foundButton.textContent = `Found ${ready ? report.total : "—"} ${config.hudExpanded ? "▾" : "▴"}`;
    ui.foundButton.classList.toggle("open", !!config.hudExpanded);
    ui.hudFound.classList.toggle("show", !!config.hudExpanded);
    if (!config.hudExpanded) {
      placeHud();
      return;
    }
    const coords = activeDecoder && activeDecoder.coords;
    const here = coords ? coords.map(value => value / Core.COORD_BASE) : null;
    const items = report.placed.map(item => ({ ...item, stored: false }))
      .concat(report.stored.map(item => ({ ...item, stored: true })));
    for (const item of items) item.distance = here ? PlannerCore.distance3([item.x, item.y, item.z], here) : 0;
    items.sort((a, b) => a.distance - b.distance);
    const key = JSON.stringify([ready, items.map(item => [item.x, item.y, item.z, item.id, Math.round(item.distance)]),
      waypoint && [waypoint.x, waypoint.y, waypoint.z]]);
    if (key === hudFoundKey) return;
    hudFoundKey = key;
    ui.hudFound.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "found-empty";
      empty.textContent = ready ? "No selected blocks in this realm. Pick blocks in the extension popup."
        : "Enter a realm to scan it.";
      ui.hudFound.append(empty);
      placeHud();
      return;
    }
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.id)) groups.set(item.id, []);
      groups.get(item.id).push(item);
    }
    for (const [id, list] of groups) {
      const group = document.createElement("div");
      group.className = "found-group";
      const name = document.createElement("div");
      name.className = "found-name";
      name.textContent = `${blockName(id)} · ${list.length}`;
      const row = document.createElement("div");
      row.className = "found-coords";
      for (const item of list.slice(0, 16)) {
        const button = document.createElement("button");
        button.className = "found-coord";
        if (waypoint && waypoint.x === item.x && waypoint.y === item.y && waypoint.z === item.z) {
          button.classList.add("active");
        }
        button.textContent = `${item.x},${item.y},${item.z}${here ? ` · ${item.distance.toFixed(0)}` : ""}${item.stored ? " ▣" : ""}`;
        button.title = item.stored ? "Stored in a case/machine · click to target" : "Click to make this the glowing target";
        button.addEventListener("click", () => setWaypoint(item));
        copyOnRightClick(button, `${item.x}, ${item.y}, ${item.z}`);
        row.append(button);
      }
      if (list.length > 16) {
        const more = document.createElement("span");
        more.className = "found-empty";
        more.textContent = `+${list.length - 16} more`;
        row.append(more);
      }
      group.append(name, row);
      ui.hudFound.append(group);
    }
    placeHud();
  }

  function toast(message, tone = "normal", ms = 2800) {
    if (!debugBuild) {             // production: no bottom popups
      console.info("[CC Browser Mods]", message);
      return;
    }
    if (!ui) return;
    ui.toast.textContent = message;
    ui.toast.dataset.tone = tone;
    ui.toast.classList.add("show");
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => ui && ui.toast.classList.remove("show"), ms);
  }

  function cameraModeName(mode) {
    return mode === 1 ? "First person" : mode === 2 ? "Near third person" : "Native";
  }

  function lightingModeName(mode) {
    return mode === 1 ? "Bright" : mode === 2 ? "Full bright" : "Original";
  }

  function updateLightingUi(status = lightingController && lightingController.status()) {
    if (!ui) return;
    const mode = Number(config.lightingMode) || 0;
    ui.lightingOriginal.classList.toggle("active", mode === 0);
    ui.lightingBright.classList.toggle("active", mode === 1);
    ui.lightingFull.classList.toggle("active", mode === 2);
    if (!lightingController || !status || !status.installed) {
      ui.lightingStatus.textContent = "WebGL lighting hook is unavailable in this browser.";
      ui.lightingStatus.dataset.tone = "warn";
    } else if (mode === 0) {
      ui.lightingStatus.textContent = "Original realm lighting.";
      ui.lightingStatus.dataset.tone = "good";
    } else if (!status.colorAttributeNames || !status.colorAttributeNames.length) {
      const seen = status.attributeNames && status.attributeNames.length ?
        ` · saw ${status.attributeNames.slice(0, 3).join(", ")}` : "";
      ui.lightingStatus.textContent = `${lightingModeName(mode)} armed · waiting for the world's color attribute${seen}`;
      ui.lightingStatus.dataset.tone = "normal";
    } else if (status.modifiedDraws > 0) {
      ui.lightingStatus.textContent = `${lightingModeName(mode)} active · ${status.colorAttributeNames.join(", ")}`;
      ui.lightingStatus.dataset.tone = status.errors ? "warn" : "good";
    } else {
      ui.lightingStatus.textContent = `${lightingModeName(mode)} ready · waiting for a 3D world pass`;
      ui.lightingStatus.dataset.tone = "normal";
    }
  }

  function applyLightingConfig(announce = false) {
    if (lightingController) lightingController.configure({ mode: config.lightingMode });
    updateLightingUi();
    if (announce) toast(`Realm lighting: ${lightingModeName(config.lightingMode)}`, "good");
  }

  function setLightingMode(mode) {
    mode = Number(mode);
    config.lightingMode = [0, 1, 2].includes(mode) ? mode : 0;
    saveConfig();
    applyLightingConfig(true);
  }

  function setCameraOverlayVisibility(visible) {
    if (!ui) return;
    ui.cameraCrosshair.classList.toggle("show", !!visible);
    if (!visible || !config.cameraHideSelfTag) ui.cameraSelfMask.classList.remove("show");
  }

  function positionCameraCrosshair(canvas) {
    if (!ui || !canvas || typeof canvas.getBoundingClientRect !== "function") return;
    const rect = canvas.getBoundingClientRect();
    ui.cameraCrosshair.style.left = `${rect.left + rect.width / 2}px`;
    ui.cameraCrosshair.style.top = `${rect.top + rect.height / 2}px`;
  }

  function captureCameraBackground(frame) {
    if (!ui || Number(config.cameraMode) !== 1) return;
    const canvas = frame && frame.canvas;
    if (!canvas || !canvas.width || !canvas.height ||
        typeof canvas.getBoundingClientRect !== "function") return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    positionCameraCrosshair(canvas);
    setCameraOverlayVisibility(true);
    if (!config.cameraHideSelfTag) return;

    // Cubic projects the local player's nametag with its original orbit camera,
    // so it remains in a stable band above screen centre even after the 3D view
    // moves. Copy that small band immediately before the flat HUD/nametag pass;
    // the overlay then shows the already-rendered world instead of our own tag.
    const cssWidth = Math.min(360, Math.max(210, rect.width * 0.44));
    const cssHeight = Math.min(58, Math.max(38, rect.height * 0.12));
    const cssLeft = Math.max(0, Math.min(rect.width - cssWidth, rect.width / 2 - cssWidth / 2));
    const cssTop = Math.max(0, Math.min(rect.height - cssHeight,
      rect.height / 2 + Number(config.cameraTagOffset)));
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sx = Math.max(0, Math.round(cssLeft * scaleX));
    const sy = Math.max(0, Math.round(cssTop * scaleY));
    const sw = Math.max(1, Math.min(canvas.width - sx, Math.round(cssWidth * scaleX)));
    const sh = Math.max(1, Math.min(canvas.height - sy, Math.round(cssHeight * scaleY)));
    try {
      if (ui.cameraSelfMask.width !== sw) ui.cameraSelfMask.width = sw;
      if (ui.cameraSelfMask.height !== sh) ui.cameraSelfMask.height = sh;
      ui.cameraSelfMask.style.left = `${rect.left + cssLeft}px`;
      ui.cameraSelfMask.style.top = `${rect.top + cssTop}px`;
      ui.cameraSelfMask.style.width = `${cssWidth}px`;
      ui.cameraSelfMask.style.height = `${cssHeight}px`;
      const context = ui.cameraSelfMask.getContext("2d", { alpha: false });
      context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      ui.cameraSelfMask.classList.add("show");
    } catch (_) {
      ui.cameraSelfMask.classList.remove("show");
    }
  }

  function updateCameraUi(status = cameraController && cameraController.status()) {
    if (!ui) return;
    const mode = Number(config.cameraMode) || 0;
    ui.cameraNative.classList.toggle("active", mode === 0);
    ui.cameraFirst.classList.toggle("active", mode === 1);
    ui.cameraNear.classList.toggle("active", mode === 2);
    ui.cameraForward.value = String(config.cameraForwardShift);
    ui.cameraVertical.value = String(config.cameraVerticalShift);
    ui.cameraForwardValue.textContent = Number(config.cameraForwardShift).toFixed(1);
    ui.cameraVerticalValue.textContent = Number(config.cameraVerticalShift).toFixed(1);
    ui.cameraSyncPicking.checked = !!config.cameraSyncPicking;
    ui.cameraHideSelfTag.checked = !!config.cameraHideSelfTag;
    ui.cameraTagOffset.value = String(config.cameraTagOffset);
    ui.cameraTagOffsetValue.textContent = `${Number(config.cameraTagOffset).toFixed(0)} px`;
    setCameraOverlayVisibility(mode === 1);
    if (!cameraController || !status || !status.installed) {
      ui.cameraStatus.textContent = "WebGL camera hook is unavailable in this browser.";
      ui.cameraStatus.dataset.tone = "warn";
    } else if (!status.detectedName) {
      const seen = status.matrixUniforms && status.matrixUniforms.length ?
        ` · saw ${status.matrixUniforms.slice(0, 3).join(", ")}` : "";
      ui.cameraStatus.textContent = `${cameraModeName(mode)} · waiting to identify the game's view matrix${seen}`;
      ui.cameraStatus.dataset.tone = "normal";
    } else if (mode === 0) {
      ui.cameraStatus.textContent = `Native camera · detected ${status.detectedName}`;
      ui.cameraStatus.dataset.tone = "good";
    } else if (status.modifiedCalls > 0) {
      const picking = config.cameraSyncPicking && status.writeBackCalls > 0 ? " · picking synced" : "";
      const alignment = !config.cameraSyncPicking && Math.abs(Number(config.cameraVerticalShift)) > 0.001 ?
        " · height offsets native aim" : "";
      ui.cameraStatus.textContent = `${cameraModeName(mode)} active · ${status.detectedName}${picking}${alignment}`;
      ui.cameraStatus.dataset.tone = alignment ? "warn" : "good";
    } else {
      ui.cameraStatus.textContent = `${cameraModeName(mode)} armed · checking ${status.detectedName}`;
      ui.cameraStatus.dataset.tone = "normal";
    }
  }

  function applyCameraConfig(announce = false) {
    if (cameraController) {
      cameraController.configure({
        mode: config.cameraMode,
        forwardShift: config.cameraForwardShift,
        verticalShift: config.cameraVerticalShift,
        syncPicking: config.cameraSyncPicking
      });
    }
    updateCameraUi();
    if (announce) toast(`Camera: ${cameraModeName(config.cameraMode)}`, "good");
  }

  function setCameraMode(mode) {
    mode = Number(mode);
    if (![0, 1, 2].includes(mode)) mode = 0;
    config.cameraMode = mode;
    if (mode === 1) {
      config.cameraForwardShift = 22;
      config.cameraVerticalShift = -1;
    } else if (mode === 2) {
      config.cameraForwardShift = 17;
      config.cameraVerticalShift = -1;
    }
    saveConfig();
    applyCameraConfig(true);
  }

  function plannerModeName(mode) {
    return mode === "down" ? "Dig down" : mode === "group" ? "3×3 group" : "Forward line";
  }

  function setMultiPreview(enabled, announce = true) {
    config.multiPreview = !!enabled;
    saveConfig();
    if (!config.multiPreview && !multiArmed) clearMultiPreview();

    if (announce) toast(`Multi-block mode ${config.multiPreview ? "on" : "off"}`, config.multiPreview ? "good" : "normal");
  }

  function cancelMultiBurst(message = null) {
    multiBurstGeneration += 1;
    if (multiBurst && Array.isArray(multiBurst.timers)) {
      multiBurst.timers.forEach(clearTimeout);
    }
    multiBurst = null;
    if (message) toast(message);
  }

  function updateMultiControls() {
    // Older UI builds had dedicated in-page arm buttons. The current compact HUD
    // does not, so keep this helper safe when those optional controls are absent.
    if (!ui) return;
    if (ui.multiBreakButton) {
      ui.multiBreakButton.classList.toggle("active", multiArmed === "break");
      ui.multiBreakButton.textContent = `Break${multiArmed === "break" ? " ON" : ""}`;
    }
    if (ui.multiBuildButton) {
      ui.multiBuildButton.classList.toggle("active", multiArmed === "build");
      ui.multiBuildButton.textContent = `Build${multiArmed === "build" ? " ON" : ""}`;
    }
  }

  function multiActionEnabled(action) {
    // The popup selects config.multiAction and config.multiPreview. Treat an
    // enabled preview as the active multi-block mode, so the next matching
    // normal game action starts the planned follow-ups. multiArmed remains
    // supported for any older/in-page controls.
    return multiArmed === action ||
      (!!config.multiPreview && config.multiAction === action);
  }

  function setMultiArmed(action) {
    action = action === "build" ? "build" : action === "break" ? "break" : null;
    cancelMultiBurst();
    multiArmed = multiArmed === action ? null : action;
    if (multiArmed) {
      config.multiAction = multiArmed;
      saveConfig();
    }
    updateMultiControls();
    if (multiArmed) {
      toast(`Multi-${multiArmed} armed — use one normal ${multiArmed} to start the pattern`, "good");
    } else {
      toast("Multi-block disarmed");
      if (!config.multiPreview) clearMultiPreview();
    }
  }

  function playerPosition(event) {
    // A genuine placement packet carries the exact position the game just
    // announced to the server; prefer it over the last observed move copy.
    if (event && event.action === "build" && event.body && event.body.length >= 26) {
      return [0, 1, 2].map(axis => Core.u32(event.body, 2 + axis * 8) +
        Core.u32(event.body, 6 + axis * 8) / Core.COORD_BASE);
    }
    const coords = activeDecoder && activeDecoder.coords;
    return coords ? coords.map(value => value / Core.COORD_BASE) : null;
  }

  function finishMultiTracker(tracker) {
    if (!tracker || tracker.finished) return;
    tracker.finished = true;
    if (multiTracker === tracker) multiTracker = null;
    const sent = tracker.sent;
    const ok = tracker.confirmed;
    lastMultiResult = { action: tracker.action, sent, confirmed: ok, far: tracker.far, at: Date.now() };
  }

  function noteMultiConfirmation(event) {
    const tracker = multiTracker;
    if (!tracker) return;
    const key = event.coord.join(",");
    if (!tracker.pending.has(key)) return;
    const wanted = tracker.action === "build";
    if (!!event.occupied !== wanted) return;
    tracker.pending.delete(key);
    tracker.confirmed += 1;
  }

  function startMultiBurst(transport, event) {
    if (!transport || !activeDecoder || transport.decoder !== activeDecoder) return;
    if (!multiActionEnabled(event.action)) {
      // Preview is on but set to the other action: say so instead of silently
      // ignoring the player's break/build.
      if (config.multiPreview && Date.now() - multiHintAt > 4000) {
        multiHintAt = Date.now();
        toast(`Planner is set to ${config.multiAction.toUpperCase()} — you just did a ${event.action}. Press F8 to switch.`);
      }
      return;
    }
    if (multiBurst) {
      toast("A multi-block pattern is already running.");
      return;
    }
    if (Date.now() < multiCooldownUntil) {
      toast("Multi-block is cooling down for a moment.");
      return;
    }
    if (!(activeDecoder.occupied instanceof Set) || !activeDecoder.grid) {
      toast("The realm block map is not ready — re-enter the realm first.");
      return;
    }
    const player = playerPosition(event);
    const playerCell = player ? player.map(Math.floor) : null;
    // Reuse what the glowing preview showed: same cells if the game broke/built
    // the block we previewed, otherwise the same direction/face from there.
    const shown = lastPlannerPlan && Date.now() - lastPlannerPlan.at < 2500 &&
      lastPlannerPlan.action === event.action && lastPlannerPlan.mode === config.multiMode ?
      lastPlannerPlan : null;
    const sameOrigin = shown && PlannerCore.cellKey(shown.origin) === PlannerCore.cellKey(event.coord);
    const plan = sameOrigin ? { cells: shown.targets.slice(1), error: null } :
      PlannerCore.planCells(event.coord, {
        action: event.action,
        mode: config.multiMode,
        count: config.multiCount,
        playerCell,
        step: shown && shown.step || undefined,
        normal: shown && shown.normal || undefined,
        direction: lastPlannerRay && Date.now() - lastPlannerRay.at < 2000 ? lastPlannerRay.direction : null,
        occupied: activeDecoder.occupied
      });
    if (!plan.cells.length) {
      toast(plan.error || `Pattern stopped immediately at the first ${event.action === "break" ? "gap" : "occupied cell"}.`);
      return;
    }
    // No reach trim: send every planned cell and let the server decide.
    const cells = plan.cells;
    const generation = ++multiBurstGeneration;
    const pace = config.multiPaceMs;
    const timers = [];
    multiBurst = { generation, action: event.action, transport, timers, queued: 0 };
    const tracker = {
      action: event.action,
      pending: new Set(),
      sent: 0,
      confirmed: 0,
      far: 0
    };
    multiTracker = tracker;
    cells.forEach((cell, index) => {
      const timer = setTimeout(() => {
        if (!multiBurst || multiBurst.generation !== generation ||
            !multiActionEnabled(event.action) || activeTransport !== transport) return;
        const occupied = activeDecoder.occupied.has(PlannerCore.cellKey(cell));
        if ((event.action === "break" && !occupied) || (event.action === "build" && occupied)) {
          cancelMultiBurst(`Multi-${event.action} stopped: ${cell.join(",")} changed before it was reached.`);
          multiCooldownUntil = Date.now() + 1000;
          setTimeout(() => finishMultiTracker(tracker), 1500);
          return;
        }
        try {
          const body = event.action === "break" ? Core.buildBlockBreak(...cell) :
            Core.patchPlaceBody(event.body, cell);
          transport.sendBody(body);
          tracker.pending.add(PlannerCore.cellKey(cell));
          tracker.sent += 1;
          if (multiBurst && multiBurst.generation === generation) multiBurst.queued += 1;
        } catch (error) {
          cancelMultiBurst(`Multi-${event.action} stopped: ${error.message}`);
          multiArmed = null;
          updateMultiControls();
          setTimeout(() => finishMultiTracker(tracker), 1500);
        }
      }, pace * (index + 1));
      timers.push(timer);
    });
    timers.push(setTimeout(() => {
      if (!multiBurst || multiBurst.generation !== generation) return;
      multiBurst = null;
      multiCooldownUntil = Date.now() + 1000;
      // Give the server a moment to echo each change before reporting.
      setTimeout(() => finishMultiTracker(tracker), 1500);
    }, pace * (cells.length + 1)));
  }

  function clearMultiPreview() {
    plannerPreview = null;
    if (!ui) return;
    const context = ui.multiCanvas.getContext("2d");
    context.clearRect(0, 0, ui.multiCanvas.width, ui.multiCanvas.height);
    ui.multiStatus.classList.remove("show");
  }

  function plannerCursor(canvas) {
    const rect = canvas.getBoundingClientRect();
    const centred = document.pointerLockElement || Number(config.cameraMode) !== 0 || !pointerPosition ||
      pointerPosition.x < rect.left || pointerPosition.x > rect.right ||
      pointerPosition.y < rect.top || pointerPosition.y > rect.bottom;
    return {
      rect,
      x: centred ? rect.width / 2 : pointerPosition.x - rect.left,
      y: centred ? rect.height / 2 : pointerPosition.y - rect.top
    };
  }

  function drawPlannerBox(context, cell, view, projection, rect, color, aimed, fill = null) {
    const half = aimed ? 0.53 : 0.5;
    const corners = [];
    for (const dz of [-half, half]) {
      for (const dy of [-half, half]) {
        for (const dx of [-half, half]) {
          const point = PlannerCore.projectPoint(
            [cell[0] + dx, cell[1] + dy, cell[2] + dz], view, projection, rect.width, rect.height);
          corners.push(point && { x: point.x + rect.left, y: point.y + rect.top, visible: point.visible });
        }
      }
    }
    const edges = [
      [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6],
      [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
    ];
    context.beginPath();
    let drew = false;
    for (const [left, right] of edges) {
      const a = corners[left];
      const b = corners[right];
      if (!a || !b || (!a.visible && !b.visible)) continue;
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      drew = true;
    }
    if (!drew) return false;
    if (fill && corners.every(Boolean)) {
      // Six faces as corner-index quads; overlapping translucent fills give a
      // soft solid look without needing depth sorting.
      const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
      context.beginPath();
      for (const face of faces) {
        context.moveTo(corners[face[0]].x, corners[face[0]].y);
        for (let i = 1; i < 4; i += 1) context.lineTo(corners[face[i]].x, corners[face[i]].y);
        context.closePath();
      }
      context.fillStyle = fill;
      context.fill();
      context.beginPath();
      for (const [left, right] of edges) {
        const a = corners[left];
        const b = corners[right];
        if (!a.visible && !b.visible) continue;
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
      }
    }
    context.strokeStyle = color;
    context.lineWidth = aimed ? 3 : 2;
    context.shadowColor = fill ? color : "rgba(0,0,0,.9)";
    context.shadowBlur = fill ? 12 : 3;
    context.stroke();
    context.shadowBlur = 0;
    return true;
  }

  // Corner order matches drawPlannerBox: index = iz*4 + iy*2 + ix.
  const GLOW_FACES = [
    { normal: [-1, 0, 0], quad: [0, 2, 6, 4] }, { normal: [1, 0, 0], quad: [1, 3, 7, 5] },
    { normal: [0, -1, 0], quad: [0, 1, 5, 4] }, { normal: [0, 1, 0], quad: [2, 3, 7, 6] },
    { normal: [0, 0, -1], quad: [0, 1, 3, 2] }, { normal: [0, 0, 1], quad: [4, 5, 7, 6] }
  ];

  function glowPulse(now) {
    return 0.5 - 0.5 * Math.cos(now * 2 * Math.PI / GLOW_PERIOD_MS);
  }

  function cameraEye(pick) {
    const ray = PlannerCore.cursorRay(pick.view, pick.projection, 1, 1, 2, 2);
    return ray && ray.origin;
  }

  // Paint the camera-facing faces of each cell as a translucent glowing gold
  // plate (so the block texture still shows through). With `occupied`, faces
  // buried against a neighbouring block are skipped, so a selected patch of
  // flat ground lights up only on its visible top surface.
  function drawGlowFaces(context, cells, pick, rect, eye, options = {}) {
    const pulse = options.pulse == null ? 0.5 : options.pulse;
    const occupied = options.occupied instanceof Set ? options.occupied : null;
    const rgb = options.rgb || "255, 204, 30";
    const project = point => {
      const p = PlannerCore.projectPoint(point, pick.view, pick.projection, rect.width, rect.height);
      return p && { x: p.x + rect.left, y: p.y + rect.top, visible: p.visible };
    };
    for (const item of cells) {
      const cell = item.cell || item;
      const bright = !!item.bright;
      const dim = !!item.dim;
      const corners = [];
      for (const dz of [-0.5, 0.5]) {
        for (const dy of [-0.5, 0.5]) {
          for (const dx of [-0.5, 0.5]) corners.push(project([cell[0] + dx, cell[1] + dy, cell[2] + dz]));
        }
      }
      const base = dim ? 0.12 : bright ? 0.42 : 0.3;
      const fillAlpha = (base + (dim ? 0.04 : 0.16) * pulse).toFixed(3);
      const edgeAlpha = (dim ? 0.35 : 0.7 + 0.3 * pulse).toFixed(3);
      const color = dim ? "190, 190, 190" : rgb;
      for (const face of GLOW_FACES) {
        const n = face.normal;
        if (occupied && occupied.has(`${cell[0] + n[0]},${cell[1] + n[1]},${cell[2] + n[2]}`)) continue;
        if (eye) {
          const toEye = [0, 1, 2].map(axis => eye[axis] - (cell[axis] + n[axis] * 0.5));
          if (toEye[0] * n[0] + toEye[1] * n[1] + toEye[2] * n[2] <= 0) continue;
        }
        const quad = face.quad.map(index => corners[index]);
        if (quad.some(point => !point) || quad.every(point => !point.visible)) continue;
        context.beginPath();
        context.moveTo(quad[0].x, quad[0].y);
        for (let i = 1; i < 4; i += 1) context.lineTo(quad[i].x, quad[i].y);
        context.closePath();
        // shadowBlur is a full Gaussian blur per fill/stroke and was the single
        // biggest frame-time cost with many finds on screen. Only the bright
        // target keeps the real blur; everything else gets a cheap wide
        // translucent stroke that reads as the same halo.
        const blur = bright && !dim;
        context.shadowColor = `rgba(${color}, ${edgeAlpha})`;
        context.shadowBlur = blur ? 14 + 10 * pulse : 0;
        context.fillStyle = `rgba(${color}, ${fillAlpha})`;
        context.fill();
        // Round joins: a wide stroke on an edge-on face would otherwise grow
        // long miter spikes.
        context.lineJoin = "round";
        if (!dim && !blur) {
          context.lineWidth = 7 + 4 * pulse;
          context.strokeStyle = `rgba(${color}, ${(0.12 + 0.1 * pulse).toFixed(3)})`;
          context.stroke();
        }
        context.shadowBlur = blur ? 6 : 0;
        context.lineWidth = bright ? 2.5 : 1.5;
        context.strokeStyle = `rgba(${dim ? color : "255, 236, 140"}, ${edgeAlpha})`;
        context.stroke();
      }
    }
    context.shadowBlur = 0;
  }

  function buildSupportHighlights(preview, occupied) {
    if (!preview || !Array.isArray(preview.targets) || !(occupied instanceof Set)) return [];
    const supports = [];
    const seen = new Set();
    const add = cell => {
      if (!cell) return;
      const key = PlannerCore.cellKey(cell);
      if (seen.has(key) || !occupied.has(key)) return;
      seen.add(key);
      supports.push(cell.slice());
    };

    // The first build target is the empty cell immediately before the block the
    // player is aiming at. Highlight that hit block because it is the surface
    // the new block will attach to.
    if (preview.hit && preview.hit.hit) add(preview.hit.hit);

    // For the rest of a horizontal build line, prefer the occupied floor block
    // directly below each future placement. In Cubic's grid, larger Z values
    // move downward, so the supporting floor is target.z + 1.
    for (let index = 1; index < preview.targets.length; index += 1) {
      const target = preview.targets[index];
      add([target[0], target[1], target[2] + 1]);
    }
    return supports;
  }

  function plannerStatus(message, tone = "normal") {
    if (!ui) return;
    ui.multiStatus.textContent = message;
    ui.multiStatus.dataset.tone = tone;
    ui.multiStatus.classList.toggle("show", !!config.multiPreview || !!multiArmed);
  }

  function refreshGlowCells() {
    glowCells = [];
    glowSortedAt = 0;
    if (!activeDecoder || !activeDecoder.grid) return;
    const report = currentReport();
    const occupied = activeDecoder.occupied;
    const seen = new Set();
    for (const item of report.placed.concat(report.stored)) {
      const key = `${item.x},${item.y},${item.z}`;
      // Skip finds that were broken after the realm's grid burst arrived.
      if (seen.has(key) || (occupied instanceof Set && !occupied.has(key))) continue;
      seen.add(key);
      glowCells.push({ cell: [item.x, item.y, item.z], id: item.id, distance: 0 });
    }
  }

  const GLOW_PERIOD_MS = 2600;
  const GLOW_MAX_BOXES = 200;
  const GLOW_MAX_DISTANCE = 120;
  const GLOW_LABELS = 6;

  function drawFinderGlow(context, pick, now) {
    const rect = pick.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const coords = activeDecoder && activeDecoder.coords;
    const player = coords ? coords.map(value => value / Core.COORD_BASE) : null;
    if (player && now - glowSortedAt > 500) {
      for (const entry of glowCells) entry.distance = PlannerCore.distance3(entry.cell, player);
      glowCells.sort((a, b) => a.distance - b.distance);
      glowSortedAt = now;
    }
    // Slow gold "breathing": one full fade in/out every GLOW_PERIOD_MS.
    const pulse = 0.5 - 0.5 * Math.cos(now * 2 * Math.PI / GLOW_PERIOD_MS);
    const labels = [];
    const eye = cameraEye(pick);
    let drawn = 0;
    for (const entry of glowCells) {
      if (drawn >= GLOW_MAX_BOXES) break;
      if (player && entry.distance > GLOW_MAX_DISTANCE) break;
      const isTarget = !!waypoint && waypoint.x === entry.cell[0] &&
        waypoint.y === entry.cell[1] && waypoint.z === entry.cell[2];
      drawGlowFaces(context, [{ cell: entry.cell, bright: isTarget }], pick, rect, eye, { pulse });
      drawn += 1;
      if (labels.length < GLOW_LABELS || isTarget) labels.push(entry);
    }
    context.font = "700 11px Consolas, monospace";
    context.textAlign = "center";
    for (const entry of labels) {
      const point = PlannerCore.projectPoint([entry.cell[0], entry.cell[1], entry.cell[2] - 0.8],
        pick.view, pick.projection, rect.width, rect.height);
      if (!point || !point.visible) continue;
      const text = player ? `${blockName(entry.id)} · ${entry.distance.toFixed(0)}` : blockName(entry.id);
      context.lineWidth = 3;
      context.strokeStyle = "rgba(0,0,0,.85)";
      context.strokeText(text, point.x + rect.left, point.y + rect.top);
      context.fillStyle = `rgba(255, 224, 120, ${(0.6 + 0.4 * pulse).toFixed(3)})`;
      context.fillText(text, point.x + rect.left, point.y + rect.top);
    }
  }

  let overlayDrawn = false;
  let leftMouseHeld = false;
  let lastPlannerRay = null;
  let lastPlannerPlan = null;
  const alignSamples = [];

  // Shift the camera so grid cells land on the game's real block cubes.
  function alignedPick(pick) {
    if (!pick || !pick.view) return pick;
    const offset = config.glowOffset || [0, 0, 0];
    if (!offset[0] && !offset[1] && !offset[2]) return pick;
    return { ...pick, view: PlannerCore.multiply4(pick.view, PlannerCore.translation(offset)) };
  }

  // Every native break tells us exactly which block the cursor ray hit, so
  // learn the grid-to-world offset from the player's own breaks.
  function learnAlignment(coord) {
    const pick = cameraController && typeof cameraController.pickState === "function" ?
      cameraController.pickState() : null;
    if (!PlannerCore || !pick || !pick.canvas || !pick.projection) return;
    const cursor = plannerCursor(pick.canvas);
    if (!cursor.rect.width || !cursor.rect.height) return;
    const ray = PlannerCore.cursorRay(pick.view, pick.projection,
      cursor.x, cursor.y, cursor.rect.width, cursor.rect.height);
    if (!ray) return;
    if (!activeDecoder || !(activeDecoder.occupied instanceof Set) ||
        !activeDecoder.occupied.has(coord.join(","))) return;
    alignSamples.push({ ray, cell: coord.slice(),
      matches: PlannerCore.alignmentMatches(activeDecoder.occupied, ray, coord) });
    if (alignSamples.length > 12) alignSamples.shift();
    if (alignSamples.length < 3) return;
    const best = PlannerCore.bestAlignment(alignSamples);
    if (!best || !best.unique || best.hits < alignSamples.length - 1) return;
    const current = config.glowOffset || [0, 0, 0];
    if (best.offset.every((value, axis) => value === current[axis])) return;
    config.glowOffset = best.offset;
    saveConfig();
    toast("Gold glow re-aligned to the real blocks", "good");
  }

  function renderMultiPreview(now = performance.now()) {
    if (!ui || !PlannerCore) return;
    // The multi-block preview only appears while the left button is held
    // (i.e. while actually breaking/building); the mode itself stays armed.
    const wantPlanner = (!!config.multiPreview || !!multiArmed) && leftMouseHeld;
    const wantGlow = !!config.finderGlow && glowCells.length > 0;
    if (!wantPlanner && !wantGlow) {
      if (overlayDrawn || plannerPreview) clearMultiPreview();
      overlayDrawn = false;
      return;
    }
    if (now - plannerDrawAt < 33) return;
    plannerDrawAt = now;
    const canvas = ui.multiCanvas;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(window.innerWidth * ratio));
    const height = Math.max(1, Math.round(window.innerHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    overlayDrawn = true;
    const pick = alignedPick(cameraController && typeof cameraController.pickState === "function" ?
      cameraController.pickState() : null);
    const pickReady = !!(pick && pick.canvas && pick.projection);
    if (wantGlow && pickReady) drawFinderGlow(context, pick, now);
    if (!wantPlanner) {
      if (plannerPreview) {
        plannerPreview = null;
        ui.multiStatus.classList.remove("show");
      }
      return;
    }
    if (!activeDecoder || !activeDecoder.grid || !(activeDecoder.occupied instanceof Set)) {
      plannerStatus("MULTI PREVIEW · enter or reload a realm to load its block map", "warn");
      return;
    }
    const stats = activeTransport && activeTransport.decoder && activeTransport.decoder.outboundStats;
    if (stats && stats.seen >= 30 && stats.decoded === 0) {
      plannerStatus("MULTI · can't read your outgoing game packets, so breaks/builds can't trigger it. Reload the tab, then Download diagnostics", "warn");
      return;
    }
    if (!pickReady) {
      plannerStatus("MULTI PREVIEW · waiting for the game's view and projection matrices", "warn");
      return;
    }
    const cursor = plannerCursor(pick.canvas);
    if (!cursor.rect.width || !cursor.rect.height) return;
    const ray = PlannerCore.cursorRay(pick.view, pick.projection,
      cursor.x, cursor.y, cursor.rect.width, cursor.rect.height);
    if (!ray) {
      plannerStatus("MULTI PREVIEW · couldn't resolve the aiming ray", "warn");
      return;
    }
    const playerCell = activeDecoder.coords ? activeDecoder.coords.map(value =>
      Math.floor(value / Core.COORD_BASE)) : null;
    const actionMode = multiArmed || config.multiAction;
    const preview = PlannerCore.preview(activeDecoder.occupied, ray, {
      action: actionMode,
      mode: config.multiMode,
      count: config.multiCount,
      playerCell,
      maxDistance: 40
    });
    preview.ray = ray;
    lastPlannerRay = { direction: ray.direction, at: Date.now() };
    plannerPreview = preview;
    const action = actionMode === "build" ? "BUILD" : "BREAK";
    if (!preview.origin) {
      plannerStatus(`${action} · ${plannerModeName(config.multiMode)} · no block in range`, "warn");
      return;
    }
    const farNote = "";
    // The preview shows exactly the cells that will be sent (no reach trim).
    if (preview.origin) {
      lastPlannerPlan = {
        action: actionMode, mode: config.multiMode, origin: preview.origin,
        targets: preview.targets.map(cell => cell.slice()), step: preview.step || null,
        normal: preview.normal || null, at: Date.now()
      };
    }
    const originKey = PlannerCore.cellKey(preview.hit && preview.hit.hit || preview.origin);
    const block = plannerBlockMap.get(originKey);
    const label = block ? `${blockName(block.id)} #${block.id}` : "Block";
    if (actionMode === "build") {
      // Do not outline the empty cell that will receive the block. Highlight the
      // occupied block/floor being built on instead.
      const supports = buildSupportHighlights(preview, activeDecoder.occupied);
      drawGlowFaces(context, supports.map((cell, index) => ({ cell, bright: index === 0 })),
        pick, cursor.rect, ray.origin, { occupied: activeDecoder.occupied, pulse: glowPulse(now) });
      const support = preview.hit && preview.hit.hit;
      plannerStatus(`BUILD ${preview.targets.length}/${config.multiCount} · ${plannerModeName(config.multiMode)} · place on ${label} · ${support ? support.join(",") : preview.origin.join(",")}${farNote}`, "good");
    } else {
      drawGlowFaces(context, preview.targets.map((cell, index) => ({ cell, bright: index === 0 })), pick, cursor.rect, ray.origin, { occupied: activeDecoder.occupied, pulse: glowPulse(now) });
      plannerStatus(`BREAK ${preview.targets.length}/${config.multiCount} · ${plannerModeName(config.multiMode)} · ${label} · ${preview.origin.join(",")}${farNote}`, "good");
    }
  }

  // A real join names its realm (0x005f) within a moment. Lobby/handoff sockets and refused
  // joins never do, so an unnamed screen drops quickly; a named one still has a hard cap.
  const LOADING_UNNAMED_MS = 3000;
  const LOADING_MAX_MS = 20000;

  function showLoading(transport = null) {
    loadingTransport = transport;
    loadingPending = true;
    if (!config.loadingScreen || !ui) return;
    loadingPending = false;
    setText("loadingRealm", "Entering realm…");
    if (splashUrls.length) {
      splashIndex = (splashIndex + 1) % splashUrls.length;
      ui.loadingArt.style.backgroundImage = `url("${splashUrls[splashIndex]}")`;
    }
    ui.loading.classList.add("show");
    hideLoading(LOADING_UNNAMED_MS, transport);
  }

  function updateLoadingRealm(name) {
    if (!ui || !name) return;
    setText("loadingRealm", name);
    if (ui.loading.classList.contains("show")) hideLoading(LOADING_MAX_MS, loadingTransport);
  }

  function hideLoading(delay = 1300, keepTransport = null) {
    loadingPending = false;
    loadingTransport = keepTransport;
    clearTimeout(hideLoadingTimer);
    hideLoadingTimer = setTimeout(() => {
      loadingTransport = null;
      if (ui) ui.loading.classList.remove("show");
    }, delay);
  }

  function setWaypoint(item) {
    waypoint = { x: item.x, y: item.y, z: item.z, id: item.id };
    updateHud();
    toast(`Target set: ${blockName(item.id)} at ${item.x}, ${item.y}, ${item.z}`, "good");
  }

  function renderFinder() {
    if (!ui) return;
    const hasGrid = activeDecoder && activeDecoder.grid;
    const report = currentReport();
    ui.finder.classList.toggle("show", finderVisible);
    if (!hasGrid) {
      ui.finderTitle.textContent = "BLOCK FINDER";
      ui.finderSummary.textContent = "Load or re-enter a realm after the mod starts.";
      ui.finderRows.replaceChildren();
      return;
    }
    const realm = activeDecoder.realm || "this realm";
    ui.finderTitle.textContent = `BLOCK FINDER · ${realm}`;
    ui.finderSummary.textContent = report.total ?
      `${report.placed.length} placed · ${report.stored.length} stored` :
      `No selected blocks found among ${activeDecoder.grid.blocks.length.toLocaleString()} blocks.`;
    ui.finderRows.replaceChildren();

    const groups = new Map();
    for (const item of report.placed) {
      if (!groups.has(item.id)) groups.set(item.id, { placed: [], stored: [] });
      groups.get(item.id).placed.push(item);
    }
    for (const item of report.stored) {
      if (!groups.has(item.id)) groups.set(item.id, { placed: [], stored: [] });
      groups.get(item.id).stored.push(item);
    }
    for (const [id, group] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
      const row = document.createElement("div");
      row.className = "finder-row";
      const name = document.createElement("div");
      name.className = "finder-name";
      name.textContent = `${blockName(id)}  #${id}`;
      const coords = document.createElement("div");
      coords.className = "finder-coords";
      const addCoords = (label, items, limit) => {
        if (!items.length) return;
        const prefix = document.createElement("span");
        prefix.textContent = label;
        coords.append(prefix);
        for (const item of items.slice(0, limit)) {
          const button = document.createElement("button");
          button.className = "coord-button";
          button.textContent = `${item.x},${item.y},${item.z}`;
          button.title = "Set this as the HUD target";
          button.addEventListener("click", () => setWaypoint(item));
          copyOnRightClick(button, `${item.x}, ${item.y}, ${item.z}`);
          coords.append(button);
        }
        if (items.length > limit) {
          const more = document.createElement("span");
          more.textContent = `+${items.length - limit} more`;
          coords.append(more);
        }
      };
      if (group.placed.length) {
        addCoords("placed:", group.placed, 12);
      }
      if (group.stored.length) {
        addCoords("stored:", group.stored, 8);
      }
      row.append(name, coords);
      ui.finderRows.append(row);
    }
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      refreshGlowCells();
      updateHud();
      renderFinder();
    }, 80);
  }

  function maybeAutoShowFinder() {
    // The Finder moved into the extension popup; nothing opens on screen.
  }

  function hideVendCard(clearState = true) {
    clearTimeout(vendPopupTimer);
    vendPopupTimer = null;
    if (clearState) vendPopup = null;
    if (ui) ui.vendCard.classList.remove("show");
  }

  function vendStockKey(decoder, match) {
    return `${decoder && decoder.realm || ""}|${match && match.glassKey || ""}`;
  }

  function renderVendCard() {
    if (!ui || !VendCore || !config.vendPriceCard || !vendPopup) {
      if (ui) ui.vendCard.classList.remove("show");
      return;
    }
    let stock = vendPopup.match ? vendPopup.match.stock : null;
    if (stock != null) stock = Math.max(0, stock - (vendBought.get(vendStockKey(
      vendPopup.decoder, vendPopup.match)) || 0));
    const card = VendCore.popupCard(vendPopup.offer,
      vendPopup.decoder && vendPopup.decoder.realm, priceBook, stock);
    if (!card) {
      hideVendCard();
      return;
    }
    ui.vendCard.dataset.accent = card.accent || "normal";
    ui.vendCardRows.replaceChildren();
    for (const entry of card.lines) {
      const row = document.createElement("div");
      row.className = "vend-card-row";
      row.dataset.tone = entry.tone || "normal";
      row.textContent = entry.text;
      ui.vendCardRows.append(row);
    }
    ui.vendCard.classList.add("show");
    requestAnimationFrame(() => {
      if (!ui || !ui.vendCard.classList.contains("show")) return;
      const desired = window.innerHeight / 2 + 120;
      const top = Math.max(8, Math.min(desired, window.innerHeight - ui.vendCard.offsetHeight - 8));
      ui.vendCard.style.top = `${Math.round(top)}px`;
    });
  }

  function openVendCard(decoder, transport, event) {
    if (!VendCore || !event.offer || !event.offer.item || event.offer.price == null) {
      hideVendCard();
      return;
    }
    const query = transport && transport.lastBlockQuery;
    const coord = query && Date.now() - query.at <= 10000 ? query.coord : null;
    const match = coord ? VendCore.findVendStock(decoder.grid, decoder.objects, coord) : null;
    vendPopup = {
      decoder,
      transport,
      dialogGuid: event.guid,
      offer: event.offer,
      match
    };
    clearTimeout(vendPopupTimer);
    vendPopupTimer = setTimeout(() => hideVendCard(), 120000);
    renderVendCard();
  }

  function handleVendEvent(decoder, transport, event) {
    if (event.type === "block_query" && transport) {
      transport.lastBlockQuery = { coord: event.coord, at: Date.now() };
    } else if (event.type === "dialog") {
      openVendCard(decoder, transport, event);
    } else if (event.type === "dialog_answer") {
      if (vendPopup && event.confirm && vendPopup.match &&
          (!event.guid || event.guid === vendPopup.dialogGuid)) {
        const qty = Number.isFinite(Number(vendPopup.offer.qty)) ?
          Math.max(1, Math.trunc(Number(vendPopup.offer.qty))) : 1;
        const key = vendStockKey(vendPopup.decoder, vendPopup.match);
        vendBought.set(key, (vendBought.get(key) || 0) + qty);
      }
      hideVendCard();
    } else if (event.type === "join" || event.type === "grid") {
      if (event.type === "grid") vendBought.clear();
      hideVendCard();
    }
  }

  function handleDecoderEvents(decoder, events, transport = null) {
    if (!events.length) return;
    activeDecoder = decoder;
    if (transport) activeTransport = transport;
    plotKeeper.tick();
    for (const event of events) {
      if (plotKeeper.onEvent(event)) continue;
      if (window.CCFriends) window.CCFriends.onEvent(event, transport);
      if (window.CCProfile) window.CCProfile.onEvent(event, transport);
      if (window.CCStore) window.CCStore.onEvent(event, transport);
      if (window.CCPerks) window.CCPerks.onEvent(event, transport);
      if (window.CCMenu) window.CCMenu.onEvent(event);
      vendWarpEvent(decoder, transport, event);
      handleVendEvent(decoder, transport, event);
      if (chatCmds) {
        chatCmds.setOwn(decoder.ownGuid);         // our own whisper echo isn't one to /r
        chatCmds.gameEvent(event);
      }
      if (event.type === "whisper_menu") whisperMenu(event, transport);
      cropEvent(event, transport);
      if (event.type === "server_text" && whisperRun.cur && event.text) {
        showChatNote(event.text, "warn");         // e.g. "You need to make your whisper longer!"
      }
      if (chatCmds && event.type === "realm_tags") {
        const r = chatCmds.realmTags(event.tags);
        if (r) showChatNote(r.note, r.tone);
      }
      if (chatCmds && (event.type === "banned_list" || event.type === "trusted_list")) {
        const list = event.type === "banned_list" ? "banned" : "trusted";
        const r = chatCmds.realmList(list, event[list]);
        if (r.send && transport) {                // an /unban or /untrust that waited for its list
          try {
            transport.sendBody(playerCommandBody(r.send.cmd, r.send.guid));
            confirmListSoon(transport, r.send.list);
          } catch (error) {
            r.note = `Couldn't ${r.send.cmd} ${r.send.name}: ${error.message}`;
            r.tone = "bad";
          }
        }
        if (r.note) showChatNote(r.note, r.tone);
        renderChatSuggest();
      }
      if (event.type === "join") {
        cancelMultiBurst();
        multiArmed = null;
        updateMultiControls();
        showLoading(transport);
        if (transport) realmSocket = transport;
        chatClosed();
      } else if (event.type === "join_failed") {
        if (loadingTransport === transport) hideLoading(0);
      } else if (event.type === "realm") {
        updateLoadingRealm(event.realm);
        renderFavorites();
      } else if (event.type === "chat_typing") {
        if (!event.on) chatClosed();
        else if (chatHistory) chatHistory.opened();
        renderChatSuggest();
      } else if (event.type === "chat") {
        noteChatLine(event);
      } else if (event.type === "server_text") {
        noteChatLine({ notice: true, text: event.text });
        const answer = chatCmds && chatCmds.serverText(event.text);
        if (answer) showChatNote(answer, "info");
      } else if (event.type === "chat_sent" && /^\s*\/help\s*$/i.test(event.text || "") &&
                 chatCmds && config.chatCommands !== false) {
        helpArmedUntil = Date.now() + 5000;         // add ours to the list that comes back
        if (chatHistory) {
          if (chatHistory.state.open) clearKeyQueue();
          if (chatHistory.sent(event.text)) saveChatHistory();
        }
      } else if (event.type === "chat_sent" && chatHistory) {
        if (chatHistory.state.open) clearKeyQueue();
        if (chatHistory.sent(event.text)) saveChatHistory();
      } else if (event.type === "grid") {
        plannerBlockMap = new Map(event.grid.blocks.map(block =>
          [`${block.x},${block.y},${block.z}`, block]));
        hideLoading();
        maybeAutoShowFinder();
      } else if (event.type === "block_change") {
        const key = event.coord.join(",");
        if (!event.occupied) plannerBlockMap.delete(key);
        noteMultiConfirmation(event);
      } else if (event.type === "block_action") {
        if (event.action === "break") learnAlignment(event.coord);
        startMultiBurst(transport, event);
      } else if (event.type === "outbound_counter" && transport) {
        transport.lastCounter = event.counter;
      } else if (event.type === "realm_search_results") {
        handleTravelResults(transport, event.results);
      }
    }
    scheduleRender();
  }

  async function toBytes(data) {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return Core.asU8(data).slice();
    if (data && typeof data.arrayBuffer === "function") {
      return new Uint8Array(await data.arrayBuffer());
    }
    return null;
  }

  function synchronousBytes(data) {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return Core.asU8(data).slice();
    return null;
  }

  // A chat line that is one of our commands never reaches the server: the
  // same frame slot carries the game's own message instead — ban / unban /
  // trust / untrust (tx 0x006d / 0x006e / 0x006a / 0x006b + guid), a list
  // request (0x006c / 0x0069, when /unban or /untrust needs it first), the
  // realm tags (0x008d, /pvp) — or a harmless typing-off (the switches,
  // /search, anything that can't go). Returns the replacement wire bytes, or
  // null to send the line as it is.
  function chatCommandFrame(events, decoder, transport) {
    if (!chatCmds || config.chatCommands === false || !decoder.key) return null;
    const line = events.find(e => e.type === "chat_sent" && Qol.chatCommandOf(e.text));
    if (!line) return null;
    chatCmds.setOwn(decoder.ownGuid);
    const cmd = Qol.chatCommandOf(line.text);
    let body = Core.buildChatToggle(false);
    if (cmd.cmd === "crops") {
      // after this frame goes: the Farmer's frames take the next counters
      setTimeout(() => startCrops(transport), 0);
    } else if (["names", "nofog", "bright", "pov"].includes(cmd.cmd)) {
      const r = chatSwitch(cmd.cmd, cmd.arg);
      showChatNote(r.note, r.tone);
    } else {
      const result = chatCmds.command(cmd.cmd, cmd.arg);
      try {
        if (result.send === "player") body = playerCommandBody(result.cmd, result.guid);
        else if (result.send === "list") body = listRequestBody(result.list);
        else if (result.send === "tags") body = Core.buildRealmTags(result.tags);
      } catch (error) {
        result.note = `Couldn't ${cmd.cmd} ${result.name}: ${error.message}`;
        result.tone = "bad";
        result.send = null;
      }
      if (result.send === "player") confirmListSoon(transport, result.list);
      if (result.send === "tags") {
        setTimeout(() => { const r = chatCmds.pvpTimeout(); if (r) showChatNote(r.note, r.tone); }, 6500);
      }
      if (result.whisper) {
        // after this frame goes: the whisper's own frames take the next counters
        setTimeout(() => startWhispers(result.whisper.name, result.whisper.parts, transport), 0);
      } else if (result.lines) {
        showChatNote(result.lines, null, 12000);
      } else {
        showChatNote(result.note, result.tone);
      }
    }
    const inner = Core.encryptFrame(body, decoder.key);
    if (!decoder.outerKey || !decoder.outerKey.length) return inner;
    return Core.outerEncode(inner, decoder.outerKey, transport.lastCounter);
  }
  // /help: the server's list (rx 0x000d naming /whisper) that answers our
  // /help is kept from the game and handed back with our commands under it.
  let helpArmedUntil = 0;
  function helpClaims(events) {
    if (!helpArmedUntil || Date.now() > helpArmedUntil || !Qol || !Qol.HELP_TEXT) return null;
    return events.find(e => e.body && (e.type === "server_text" || e.notice) && Qol.isHelpList(e.text)) || null;
  }

  // /w and /r: one part at a time — "/whisper <part>" goes out, the "Whisper to
  // Who?" picker that comes back is kept from the game (whisperClaims) and the
  // right row clicked (whisperMenu), then the next part a second later.
  const WHISPER_WAIT_MS = 6000;
  const whisperRun = { jobs: [], cur: null, transport: null };
  function startWhispers(name, parts, transport) {
    for (const text of parts) whisperRun.jobs.push({ name, text });
    if (transport) whisperRun.transport = transport;
    whisperNext();
  }
  function dropWhispers(name) {
    whisperRun.cur = null;
    whisperRun.jobs = whisperRun.jobs.filter(job => job.name !== name);
  }
  function whisperNext() {
    if (whisperRun.cur || !whisperRun.jobs.length) return;
    const job = whisperRun.jobs.shift();
    const t = whisperRun.transport || realmSocket || activeTransport;
    try {
      if (!t) throw new Error("the game connection isn't ready");
      t.sendBody(Core.buildWhisperOpen(job.text));
    } catch (error) {
      showChatNote(`Couldn't whisper ${job.name}: ${error.message}`, "bad");
      whisperRun.jobs = [];
      return;
    }
    const cur = { ...job, until: Date.now() + WHISPER_WAIT_MS };
    whisperRun.cur = cur;
    setTimeout(() => {
      if (whisperRun.cur !== cur) return;
      showChatNote(`No whisper menu came back for ${cur.name} — not sent.`, "warn");
      dropWhispers(cur.name);
      whisperNext();
    }, WHISPER_WAIT_MS);
  }
  function whisperClaims(event) {
    return event.type === "whisper_menu" && !!whisperRun.cur && Date.now() < whisperRun.cur.until;
  }
  function whisperMenu(event, transport) {
    const cur = whisperRun.cur;
    if (!cur || Date.now() >= cur.until) return;           // the game's own /whisper
    whisperRun.cur = null;
    const row = Qol.menuRow(event.names || [], cur.name);
    if (row == null) {
      showChatNote(`${cur.name} isn't in the whisper list — only people in this realm can be whispered.`, "warn");
      dropWhispers(cur.name);
      setTimeout(whisperNext, 0);
      return;
    }
    try {
      (transport || whisperRun.transport).sendBody(Core.buildWhisperSelect(event.menuId, row));
      showChatNote(`Whispered ${cur.name}.`, "good");
    } catch (error) {
      showChatNote(`Couldn't whisper ${cur.name}: ${error.message}`, "bad");
      dropWhispers(cur.name);
    }
    setTimeout(whisperNext, 1000);
  }
  // /crops: the Farmer's crop window from any realm. What talking to him
  // sends goes out (tx 0x00f1 + 0x00ef "NPC_Farmer.txt"), his "sell me some
  // crops?" box is kept from the game (cropClaims) and answered Yes
  // (cropEvent); the server then opens the game's own crop window (rx 0x00e1
  // "Sell Crops").
  const CROPS_WAIT_MS = 6000;
  const cropRun = { stage: null, until: 0, transport: null, timer: null };
  const cropsWaiting = () => !!cropRun.stage && Date.now() < cropRun.until;
  function cropStage(stage, transport) {
    clearTimeout(cropRun.timer);
    cropRun.stage = stage;
    cropRun.until = Date.now() + CROPS_WAIT_MS;
    if (transport) cropRun.transport = transport;
    cropRun.timer = setTimeout(() => {
      if (cropRun.stage !== stage) return;
      cropRun.stage = null;
      showChatNote(stage === "talk" ?
        "The Farmer didn't answer from here — the server may only open his crop window in his own realm." :
        "Said Yes to the Farmer, but no crop window came back.", "warn");
    }, CROPS_WAIT_MS);
  }
  function startCrops(transport) {
    if (cropsWaiting()) {
      showChatNote("Already asking the Farmer…", "info");
      return;
    }
    const t = transport || realmSocket || activeTransport;
    try {
      if (!t) throw new Error("the game connection isn't ready");
      for (const body of Core.buildNpcTalk("Farmer")) t.sendBody(body);
    } catch (error) {
      showChatNote(`Couldn't ask the Farmer: ${error.message}`, "bad");
      return;
    }
    cropStage("talk", t);
    showChatNote("Asking the Farmer for the crop window…", "info");
  }
  function cropClaims(event) {
    return event.type === "npc_dialog" && cropRun.stage === "talk" && cropsWaiting() && Core.isCropOffer(event);
  }
  function cropEvent(event, transport) {
    if (!cropsWaiting()) return;                      // the game's own NPC talk
    if (event.type === "npc_dialog" && cropRun.stage === "talk" && Core.isCropOffer(event)) {
      const yes = Core.yesOption(event);
      try {
        if (!yes) throw new Error("his box has no Yes");
        (transport || cropRun.transport).sendBody(Core.buildNpcChoice(yes));
      } catch (error) {
        clearTimeout(cropRun.timer);
        cropRun.stage = null;
        showChatNote(`Couldn't answer the Farmer: ${error.message}`, "bad");
        return;
      }
      cropStage("yes", transport);
    } else if (event.type === "panel" && event.title === Core.CROP_PANEL_TITLE) {
      clearTimeout(cropRun.timer);
      cropRun.stage = null;
      showChatNote("Crop window open — drop your crops in, then click SELL.", "good");
    } else if (event.type === "server_text" && event.text) {
      showChatNote(event.text, "warn");
    }
  }
  function playerCommandBody(cmd, guid) {
    const build = { ban: Core.buildRealmBan, unban: Core.buildRealmUnban,
                    trust: Core.buildRealmTrust, untrust: Core.buildRealmUntrust }[cmd];
    if (!build) throw new Error(`unknown command ${cmd}`);
    return build(guid);
  }
  function listRequestBody(list) {
    return list === "trusted" ? Core.buildTrustedListRequest() : Core.buildBannedListRequest();
  }
  // /names /nofog /bright /pov: the popup's own switches -> {note, tone}
  function chatSwitch(cmd, arg) {
    if (cmd === "pov") {
      const mode = Qol.povMode(arg, config.cameraMode);
      if (mode == null) return { note: "Type /pov, /pov first, /pov third or /pov off.", tone: "warn" };
      setCameraMode(mode);
      return { note: `Camera: ${cameraModeName(mode)}.`, tone: "good" };
    }
    if (cmd === "names") {
      const shown = Qol.onOff(arg, config.playerNames !== false);          // /names on = show
      if (shown == null) return { note: "Type /names, /names on or /names off.", tone: "warn" };
      config.playerNames = shown;
      saveConfig();
      applyConfigToUi();
      return { note: shown ? "Name tags shown." : "Name tags hidden.", tone: "good" };
    }
    if (cmd === "nofog") {
      const on = Qol.onOff(arg, config.noFog !== false);                   // /nofog on = no fog
      if (on == null) return { note: "Type /nofog, /nofog on or /nofog off.", tone: "warn" };
      config.noFog = on;
      saveConfig();
      applyConfigToUi();
      return { note: on ? "Fog removed." : "Fog is back.", tone: "good" };
    }
    const on = Qol.onOff(arg, Number(config.lightingMode) !== 0);          // /bright on = full bright
    if (on == null) return { note: "Type /bright, /bright on or /bright off.", tone: "warn" };
    setLightingMode(on ? 2 : 0);
    return { note: on ? "Full bright on." : "Original lighting.", tone: "good" };
  }
  // a realm list ('banned' | 'trusted'), asked for on the realm's own socket
  function askRealmList(list, transport) {
    const t = transport || realmSocket || activeTransport;
    if (!t) return;
    try { t.sendBody(listRequestBody(list)); }
    catch (error) { console.warn("[CC Browser Mods] list request failed", error); }
  }
  // after a ban / trust ..., the fresh list confirms it
  function confirmListSoon(transport, list) {
    setTimeout(() => { if (chatCmds && chatCmds.askList(list)) askRealmList(list, transport); }, 400);
  }

  function hookWebSocket(ws) {
    const decoder = new Core.SessionDecoder();
    let opened = false;
    let queue = Promise.resolve();
    const nativeSend = ws.send;
    const transport = {
      decoder,
      lastCounter: null,
      counterOffset: 0,
      sendBody(body) {
        if (ws.readyState !== NativeWebSocket.OPEN) throw new Error("game connection is not open");
        if (!decoder.key) throw new Error("the game session key is not ready yet");
        const inner = Core.encryptFrame(body, decoder.key);
        let wire = inner;
        if (decoder.outerKey && decoder.outerKey.length) {
          if (this.lastCounter == null) {
            throw new Error("waiting for the game's send counter — move one step and try again");
          }
          this.lastCounter = (this.lastCounter + 1) >>> 0;
          this.counterOffset = (this.counterOffset + 1) >>> 0;
          wire = Core.outerEncode(inner, decoder.outerKey, this.lastCounter);
        }
        nativeSend.call(ws, wire);
      },
      // Hand the game one extra INBOUND frame, exactly as if the server had sent
      // it: encrypted with the session key, delivered as a message event on this
      // socket (the game's own handler reads it; real frames are untouched).
      injectInbound(body) {
        if (ws.readyState !== NativeWebSocket.OPEN) throw new Error("game connection is not open");
        if (!decoder.key) throw new Error("the game session key is not ready yet");
        const frame = Core.encryptFrame(body, decoder.key);
        const data = ws.binaryType === "blob" ? new Blob([frame]) :
          frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
        ws.dispatchEvent(new MessageEvent("message", { data }));
      }
    };
    ws.send = function observedSend(data) {
      let outgoing = data;
      try {
        const bytes = synchronousBytes(data);
        if (bytes) {
          if (decoder.outerKey && decoder.outerKey.length) {
            const outer = Core.outerDecode(bytes, decoder.outerKey);
            const adjusted = (outer.counter + transport.counterOffset) >>> 0;
            outgoing = Core.outerEncode(outer.inner, decoder.outerKey, adjusted);
            transport.lastCounter = adjusted;
          }
          const events = decoder.ingestOutbound(Core.asU8(outgoing));
          const swapped = chatCommandFrame(events, decoder, transport);
          handleDecoderEvents(decoder, events, transport);
          if (swapped) outgoing = swapped;
        }
      } catch (error) {
        console.warn("[CC Browser Mods] outbound observation failed", error);
      }
      return nativeSend.call(this, outgoing);
    };
    ws.addEventListener("open", () => {
      if (!opened) {
        opened = true;
        openSockets += 1;
        updateHud();
      }
    });
    ws.addEventListener("close", () => {
      if (opened) openSockets = Math.max(0, openSockets - 1);
      if (vendPopup && vendPopup.transport === transport) hideVendCard();
      if (loadingTransport === transport) hideLoading(0);
      if (realmSocket === transport) {
        realmSocket = null;
        chatClosed();
      }
      updateHud();
    });
    ws.addEventListener("message", event => {
      // ArrayBuffer is what the Emscripten client normally requests. Decode it
      // synchronously so the Friends replacement can stop the stock dialog's
      // two reply frames before the game's later message listener sees them.
      // All other traffic continues to the game untouched. Blob is retained as
      // the ordered asynchronous fallback used by unusual browser builds.
      const immediate = synchronousBytes(event.data);
      if (immediate) {
        try {
          receivedFrames += 1;
          receivedBytes += immediate.length;
          const events = decoder.ingest(immediate);
          const friends = window.CCFriends;
          const friendsHide = friends && typeof friends.shouldSuppress === "function";
          // Also hide the game's own rent box for the keeper's hits (it answers them).
          const help = helpClaims(events);
          if (help || events.length && events.every(item => plotKeeper.claims(item) || whisperClaims(item) ||
              cropClaims(item) ||
              (friendsHide && friends.shouldSuppress(item)))) {
            event.stopImmediatePropagation();
          }
          if (help) {
            // the game gets one copy of that message, with our commands added
            helpArmedUntil = 0;
            setTimeout(() => {
              try { transport.injectInbound(Core.extendServerText(help.body, Qol.HELP_TEXT)); }
              catch (error) { console.warn("[CC Browser Mods] /help list failed", error); }
            }, 0);
            return;
          }
          handleDecoderEvents(decoder, events, transport);
        } catch (error) {
          console.warn("[CC Browser Mods] receive decode failed", error);
        }
        return;
      }
      queue = queue.then(async () => {
        const bytes = await toBytes(event.data);
        if (!bytes) return;
        receivedFrames += 1;
        receivedBytes += bytes.length;
        handleDecoderEvents(decoder, decoder.ingest(bytes), transport);
      }).catch(error => console.warn("[CC Browser Mods] receive decode failed", error));
    });
  }

  const NativeWebSocket = window.WebSocket;
  if (NativeWebSocket && !NativeWebSocket.__ccBrowserModsProxy) {
    const HookedWebSocket = new Proxy(NativeWebSocket, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget === HookedWebSocket ? target : newTarget);
        hookWebSocket(ws);
        return ws;
      }
    });
    Object.defineProperty(HookedWebSocket, "__ccBrowserModsProxy", { value: true });
    window.WebSocket = HookedWebSocket;
  }

  function refreshCatalogEntries() {
    catalogEntries = Object.entries(catalog)
      .map(([id, name]) => ({ id: Number(id), name: String(name) }))
      .filter(item => item.id > 0 && item.id <= 4095 && item.name !== "(Unused)")
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  }
  refreshCatalogEntries();

  window.addEventListener("message", event => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== BRIDGE_SOURCE) return;
    if (data.type === "resources") {
      catalog = { ...FALLBACK_CATALOG, ...(data.blocks || {}) };
      if (data.items && typeof data.items === "object") itemNames = data.items;
      debugBuild = data.debug === true;
      renderPlotPanel();
      splashUrls = Array.isArray(data.splashUrls) ? data.splashUrls : [];
      if (window.CCMenu && typeof window.CCMenu.setIcons === "function") {
        window.CCMenu.setIcons(data.menuIcons || {});
      }
      refreshCatalogEntries();
      renderSelectedBlocks();
      renderSearchResults();
    } else if (data.type === "resource-error") {
      console.warn("[CC Browser Mods] resource bridge:", data.message);
      if (vendWarp) toast(`Item names couldn't load: ${data.message}`, "warn", 9000);
    } else if (data.type === "price-resources") {
      if (VendCore) {
        priceBook = VendCore.createPriceBook(data.vends, data.community);
        priceLoadedAt = data.loadedAt || Date.now();
        renderVendCard();
        renderMarketSearch();
      }
    } else if (data.type === "price-resource-error") {
      if (priceBook) priceBook.error = data.message || "price service unavailable";
      console.warn("[CC Browser Mods] price bridge:", data.message);
      renderVendCard();
      renderMarketSearch();
    } else if (data.type === "extension-config") {
      const incoming = { ...(data.config || {}) };
      // A stored config from before the bottom-left HUD still holds a
      // top-based position; don't let it drag the bar back to the top.
      const stalePosition = incoming.hudAnchor !== "bottom-left-v2";
      if (stalePosition) {
        delete incoming.hudPosition;
        delete incoming.hudAnchor;
      }
      config = cleanConfig({ ...config, ...incoming });
      if (stalePosition) saveConfig();
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      } catch (_) {
        // The live settings still apply when page storage is unavailable.
      }
      applyConfigToUi();
      renderSearchResults();
      scheduleRender();
    } else if (data.type === "request-config-sync") {
      window.postMessage({ source: MAIN_SOURCE, type: "save-config", config }, "*");
    } else if (data.type === "finder-request") {
      // The extension popup owns the Finder UI; answer with the current report.
      const ready = !!(activeDecoder && activeDecoder.grid);
      const report = ready ? currentReport() : { placed: [], stored: [], total: 0 };
      const trim = list => list.slice(0, 400).map(item => ({ x: item.x, y: item.y, z: item.z, id: item.id }));
      const ids = new Set(report.placed.concat(report.stored).map(item => item.id));
      const names = {};
      ids.forEach(id => { names[id] = blockName(id); });
      window.postMessage({
        source: MAIN_SOURCE,
        type: "finder-report",
        requestId: data.requestId,
        report: {
          ready,
          realm: activeDecoder && activeDecoder.realm || null,
          blocks: ready ? activeDecoder.grid.blocks.length : 0,
          placed: trim(report.placed),
          stored: trim(report.stored),
          total: report.total,
          names,
          waypoint
        }
      }, "*");
    } else if (data.type === "set-waypoint" && data.item) {
      const item = data.item;
      if ([item.x, item.y, item.z, item.id].every(value => Number.isInteger(value))) setWaypoint(item);
    } else if (data.type === "command" && data.command === "open-market") {
      marketVisible = true;
      renderMarketSearch();
      if (ui) setTimeout(() => ui.marketSearch.focus(), 0);
    }
  });
  window.postMessage({ source: MAIN_SOURCE, type: "request-resources" }, "*");

  function setFavoriteStatus(message, tone = "normal") {
    if (!ui) return;
    ui.favoriteStatus.textContent = message || "";
    ui.favoriteStatus.dataset.tone = tone;
  }

  function finishTravel(message, tone = "normal") {
    if (travelRequest && travelRequest.timeout) clearTimeout(travelRequest.timeout);
    travelRequest = null;
    setFavoriteStatus(message, tone);
    toast(message, tone);
    renderFavorites();
    renderMarketSearch();
  }

  function openRealmSearchPopup() {
    if (travelRequest) {
      toast(`Already searching for ${travelRequest.name}`);
      return;
    }
    const transport = activeTransport;
    const decoder = transport && transport.decoder;
    if (!transport || !decoder || !decoder.key) {
      toast("Realm Search is not ready yet — re-enter a realm, then try again.");
      return;
    }
    try {
      transport.sendBody(Core.buildOpenRealmBrowser());
      toast("Opened the game's Realm Search popup", "good");
    } catch (error) {
      toast(`Couldn't open Realm Search: ${error.message}`);
    }
  }

  function visitRealmBySearch(name) {
    name = String(name || "").replace(/\s+/g, " ").trim();
    if (!name) return;
    if (travelRequest) {
      toast(`Already searching for ${travelRequest.name}`);
      return;
    }
    const transport = activeTransport;
    const decoder = transport && transport.decoder;
    if (!transport || !decoder || !decoder.key || !decoder.ownGuid) {
      const message = "Realm Search is not ready yet — re-enter a realm, then try again.";
      setFavoriteStatus(message);
      toast(message);
      return;
    }
    try {
      travelRequest = { name, transport, phase: "opening", results: [], timeout: null };
      setFavoriteStatus(`Opening Realm Search for ${name}…`);
      renderFavorites();
      transport.sendBody(Core.buildOpenRealmBrowser());
      setTimeout(() => {
        if (!travelRequest || travelRequest.transport !== transport) return;
        try {
          travelRequest.phase = "searching";
          setFavoriteStatus(`Searching exact realm name: ${name}…`);
          transport.sendBody(Core.buildRealmSearch(name, decoder.ownGuid));
        } catch (error) {
          finishTravel(`Couldn't search: ${error.message}`);
        }
      }, 800);
      travelRequest.timeout = setTimeout(() => {
        if (travelRequest && travelRequest.name === name) {
          finishTravel(`No exact Realm Search result for ${name}.`);
        }
      }, 8000);
    } catch (error) {
      finishTravel(`Couldn't open Realm Search: ${error.message}`);
    }
  }

  function handleTravelResults(transport, results) {
    const request = travelRequest;
    if (!request || request.transport !== transport || request.phase !== "searching") return;
    request.results.push(...(results || []));
    const wanted = request.name.toLocaleLowerCase();
    const exact = request.results.find(result =>
      String(result.name || "").trim().toLocaleLowerCase() === wanted);
    if (!exact) return;
    request.phase = "joining";
    setFavoriteStatus(`Found ${exact.name}. Going there…`, "good");
    try {
      request.transport.sendBody(Core.buildJoinRealm(exact.guid));
      if (request.timeout) clearTimeout(request.timeout);
      travelRequest = null;
      // Teleport sent: get the Favorites panel out of the way.
      favoritesVisible = false;
      setFavoriteStatus("");
      renderFavorites();
      renderMarketSearch();
    } catch (error) {
      finishTravel(`Couldn't visit ${request.name}: ${error.message}`);
    }
  }

  // ---- chat window: real text you can drag-select and copy -------------
  // The game draws chat inside its canvas, so it can't be selected. The mod
  // keeps its own copy of the lines (rx 0x000c chat + 0x000d SYSTEM notices,
  // with their colours) and Ctrl+C shows them as normal page text: drag over
  // any part of any lines, then Ctrl+C copies exactly that.
  const CHAT_LOG_MAX = 80;
  const SYSTEM_COLOR = "rgb(255, 112, 112)";       // uncoloured SYSTEM lines
  let chatLineId = 0;

  function chatLineText(line) {
    if (line.notice) return line.text;
    const who = line.name || "Someone";
    return line.whisper ? `(whisper) ${who}: ${line.text}` : `${who}: ${line.text}`;
  }

  function noteChatLine(event) {
    const text = String(event.text || "").trim();
    if (!text) return;
    chatLog.push({
      id: ++chatLineId, name: event.name || null, text,
      segments: Array.isArray(event.segments) && event.segments.length ? event.segments : [{ text, color: null }],
      whisper: !!event.whisper, notice: !!event.notice, own: !!event.own, at: Date.now()
    });
    if (chatLog.length > CHAT_LOG_MAX) chatLog.splice(0, chatLog.length - CHAT_LOG_MAX);
    if (chatCopyVisible) renderChatCopy();
  }

  function placeChatCopy() {
    if (!ui) return;
    if (config.chatCopySize) {
      ui.chatCopy.style.width = `${config.chatCopySize[0]}px`;
      ui.chatCopy.style.height = `${config.chatCopySize[1]}px`;
    }
    if (config.chatCopyPosition) ui.chatCopy.style.bottom = "auto";
    placePanel(ui.chatCopy, config.chatCopyPosition);
  }

  function setChatCopyVisible(visible) {
    chatCopyVisible = !!visible;
    renderChatCopy(true);
  }

  function chatLineElement(line) {
    const row = document.createElement("div");
    row.className = "chat-line";
    row.dataset.id = String(line.id);
    if (line.whisper) row.classList.add("whisper");
    if (line.notice) {
      const badge = document.createElement("span");
      badge.className = "sys-badge";
      badge.textContent = "SYSTEM";
      row.append(badge);
    } else {
      const who = document.createElement("span");
      who.className = line.own ? "chat-who own" : "chat-who";
      who.textContent = `${line.whisper ? "(whisper) " : ""}${line.name || "Someone"}: `;
      row.append(who);
    }
    for (const run of line.segments) {
      const span = document.createElement("span");
      span.textContent = run.text;
      if (run.color) span.style.color = `rgb(${run.color.join(", ")})`;
      else if (line.notice) span.style.color = SYSTEM_COLOR;
      row.append(span);
    }
    return row;
  }

  // Adds new lines and drops old ones without rebuilding the rest, so a
  // drag-selection in progress survives chat arriving.
  function renderChatCopy(jumpToEnd = false) {
    if (!ui || !ui.chatCopy) return;
    ui.chatCopy.classList.toggle("show", chatCopyVisible);
    if (!chatCopyVisible) return;
    placeChatCopy();
    ui.chatCopyAll.disabled = !chatLog.length;
    const rows = ui.chatCopyRows;
    const atEnd = rows.scrollHeight - rows.scrollTop - rows.clientHeight < 24;
    const keep = new Set(chatLog.map(line => String(line.id)));
    for (const child of Array.from(rows.children)) {
      if (!child.dataset.id || !keep.has(child.dataset.id)) child.remove();
    }
    const shown = new Set(Array.from(rows.children, child => child.dataset.id));
    for (const line of chatLog) {
      if (!shown.has(String(line.id))) rows.append(chatLineElement(line));
    }
    if (!chatLog.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No chat yet — lines show here as they arrive.";
      rows.append(empty);
    }
    if (jumpToEnd || atEnd) rows.scrollTop = rows.scrollHeight;
  }

  function chatSelectionText() {
    if (!ui) return "";
    const selection = typeof ui.shadow.getSelection === "function" ? ui.shadow.getSelection() : document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return "";
    const range = selection.getRangeAt(0);
    if (!ui.chatCopyRows.contains(range.commonAncestorContainer) &&
        range.commonAncestorContainer !== ui.chatCopyRows) return "";
    return selection.toString().replace(/[ \t]+\n/g, "\n").trim();
  }

  // Ctrl+C (outside a real text box): with chat text selected, copy it;
  // otherwise open / close the chat window. Esc closes it.
  window.addEventListener("keydown", event => {
    if (!event.isTrusted || !ui || modEditorFromEvent(event) || fromTextField(event)) return;
    const ctrlC = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      (event.code === "KeyC" || String(event.key).toLowerCase() === "c");
    if (ctrlC && !event.repeat) {
      const selected = chatCopyVisible ? chatSelectionText() : "";
      event.preventDefault();
      event.stopImmediatePropagation();
      if (selected) {
        const box = ui.chatCopy.getBoundingClientRect();
        copyText(selected, { clientX: box.left + box.width / 2, clientY: box.top + 6 });
      } else {
        setChatCopyVisible(!chatCopyVisible);
      }
    } else if (chatCopyVisible && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setChatCopyVisible(false);
    }
  }, true);

  async function copyText(text, event = null) {
    text = String(text == null ? "" : text);
    if (!text) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (_) {
      // older permission rules: copy through a hidden text box
      const focused = document.activeElement;
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.append(area);
        area.select();
        ok = document.execCommand("copy");
        area.remove();
      } catch (_) {
        ok = false;
      }
      if (focused && typeof focused.focus === "function") focused.focus();
    }
    flashCopied(ok ? `Copied: ${text.length > 48 ? text.slice(0, 47) + "…" : text}` : "Couldn't copy", ok, event);
  }

  // Production builds show no toasts, so a copy shows its own small note by the pointer.
  function flashCopied(message, ok, event) {
    if (!ui || !ui.copyFlash) return;
    const flash = ui.copyFlash;
    flash.textContent = message;
    flash.dataset.tone = ok ? "good" : "bad";
    const x = event && event.clientX != null ? event.clientX : window.innerWidth / 2;
    const y = event && event.clientY != null ? event.clientY : window.innerHeight / 2;
    flash.style.left = `${Math.max(8, Math.min(window.innerWidth - 8, x))}px`;
    flash.style.top = `${Math.max(30, y - 14)}px`;
    flash.classList.add("show");
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => flash.classList.remove("show"), 1100);
  }

  function copyOnRightClick(element, text) {
    element.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      copyText(typeof text === "function" ? text() : text, event);
    });
    element.title = element.title ? `${element.title} · right-click to copy` : "Right-click to copy";
  }

  function addFavorite(name) {
    name = String(name || "").trim().slice(0, 64);
    if (!name) return false;
    if (config.favorites.some(old => old.toLowerCase() === name.toLowerCase())) return false;
    if (config.favorites.length >= 50) return false;
    config.favorites.push(name);
    saveConfig();
    renderFavorites();
    return true;
  }

  function renderFavorites() {
    if (!ui) return;
    ui.favorites.classList.toggle("show", favoritesVisible);
    placeFavorites();
    const realm = activeDecoder && activeDecoder.realm;
    ui.favoriteCurrent.disabled = !realm;
    ui.favoriteCurrent.textContent = realm ? `★ Add ${realm}` : "★ Current realm unknown";
    ui.favoriteRows.replaceChildren();
    if (!config.favorites.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No favorite realms yet.";
      ui.favoriteRows.append(empty);
    }
    config.favorites.forEach((name, index) => {
      const row = document.createElement("div");
      row.className = "favorite-row";
      const copy = document.createElement("button");
      copy.className = "favorite-name";
      copy.textContent = name;
      copy.title = "Open the game's Realm Search and visit this realm";
      copy.disabled = !!travelRequest;
      copy.addEventListener("click", () => visitRealmBySearch(name));
      copyOnRightClick(copy, name);
      const remove = document.createElement("button");
      remove.className = "icon-button";
      remove.textContent = "×";
      remove.title = "Remove favorite";
      remove.addEventListener("click", () => {
        config.favorites.splice(index, 1);
        saveConfig();
        renderFavorites();
      });
      row.append(copy, remove);
      ui.favoriteRows.append(row);
    });
    if (!travelRequest && !ui.favoriteStatus.textContent) {
      setFavoriteStatus("Favorites use the game's exact-name Realm Search; no share links.");
    }
  }

  function goToListing(listing) {
    if (travelRequest) {
      toast(`Already searching for ${travelRequest.name}`);
      return;
    }
    marketVisible = false;
    // Hand the keyboard back to the game (a focused hidden input would keep eating keys).
    if (ui && ui.marketSearch) ui.marketSearch.blur();
    renderMarketSearch();
    visitRealmBySearch(listing.realm);
    if (travelRequest) {
      toast(`Going to ${listing.realm}…`, "good");
      armVendWarp(listing);
    }
  }

  // ---- vend warp: after GO on a listing, put us in front of its machine ----
  // On arrival the realm's grid + glass contents say which machine shows the
  // item; we then hand the game the server's own "you are now here" message
  // (rx 0x0023, as sent for same-realm teleports) with the spot in front of it.
  // Twin of stage2/mods/cc_vendwarp.py.
  const WARP = { settle: 1200, objectQuiet: 800, objectWait: 5000, still: 350,
                 itemWait: 15000, retryEvery: 1500, timeout: 45000, verify: 2500 };
  let vendWarp = null;
  let vendWarpTimer = null;
  let vendWarpLast = null;        // last outcome, for window.__ccVendWarp()

  function warpLog(...args) {
    console.info("[CC Browser Mods] vend warp:", ...args);
  }
  window.__ccVendWarp = () => ({
    config: config.vendWarp, namesLoaded: !!itemNames, last: vendWarpLast,
    active: vendWarp && { realm: vendWarp.realm, item: vendWarp.item, stage: vendWarp.stage,
      gridAt: vendWarp.gridAt, self: vendWarp.self, decoderRealm: vendWarp.decoder && vendWarp.decoder.realm }
  });

  function sameRealm(a, b) {
    const key = name => String(name || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return key(a) === key(b);
  }

  function armVendWarp(listing) {
    if (!config.vendWarp || !VendCore) return;
    vendWarp = { realm: listing.realm, item: listing.item, at: Date.now(), stage: "waiting",
                 decoder: null, transport: null, gridAt: 0, objectsAt: 0, self: null };
    warpLog("armed for", listing.item, "in", listing.realm);
    // The item names come from the bridge; ask again if they never arrived.
    if (!itemNames) window.postMessage({ source: MAIN_SOURCE, type: "request-resources" }, "*");
    clearInterval(vendWarpTimer);
    vendWarpTimer = setInterval(vendWarpTick, 250);
  }

  function endVendWarp(message, tone) {
    if (message) {
      vendWarpLast = { message, at: new Date().toISOString() };
      warpLog(message);
    }
    vendWarp = null;
    clearInterval(vendWarpTimer);
    vendWarpTimer = null;
    if (message) toast(message, tone, tone === "warn" ? 9000 : 4000);
  }

  function vendWarpEvent(decoder, transport, event) {
    const warp = vendWarp;
    if (!warp) return;
    const now = Date.now();
    if (event.type === "grid" && (warp.stage === "waiting" || warp.stage === "wrong-realm")) {
      Object.assign(warp, { decoder, transport, gridAt: now, objectsAt: now, self: null });
      warpLog("realm grid arrived:", decoder.realm, `${event.grid.blocks.length} blocks`);
    } else if (decoder !== warp.decoder) {
      return;
    } else if (event.type === "objects") {
      warp.objectsAt = now;
    } else if (event.type === "coords" && event.outbound) {
      warp.self = { coords: event.coords.slice(), at: now };
      if (warp.stage === "moving" && VendCore.closeTo(event.coords, warp.target, 1)) {
        endVendWarp(`At the ${warp.item} machine ✓`, "good");
      }
    }
  }

  function vendWarpTick() {
    const warp = vendWarp;
    if (!warp) return;
    const now = Date.now();
    if (warp.stage === "moving") {
      if (now - warp.movedAt < WARP.verify) return;
      const self = warp.self;
      if (self && self.at > warp.movedAt) {
        endVendWarp(`The game didn't take the move to the ${warp.item} machine.`, "warn");
      } else {
        endVendWarp(`Moved to the ${warp.item} machine — take a step if it hasn't shown yet.`, "good");
      }
      return;
    }
    if (now - warp.at > WARP.timeout) {
      endVendWarp(`Gave up waiting to arrive in ${warp.realm}.`, "warn");
      return;
    }
    const decoder = warp.decoder;
    if (!decoder || !warp.gridAt || now - warp.gridAt < WARP.settle) return;
    if (now - warp.objectsAt < WARP.objectQuiet && now - warp.gridAt < WARP.objectWait) return;
    if (decoder.realm && !sameRealm(decoder.realm, warp.realm)) {
      if (warp.stage !== "wrong-realm") warpLog("loaded", decoder.realm, "— waiting for", warp.realm);
      warp.stage = "wrong-realm";
      return;
    }
    if (warp.self && now - warp.self.at < WARP.still) return;    // walking: wait until we stand
    // Where we are is only a tie-break between machines; the browser client may
    // not report a position until we move, so fall back to the server's spawn.
    const here = warp.self ? warp.self.coords : decoder.coords;
    if (!itemNames) warpLog("item names not loaded — reload the extension");
    if (warp.triedAt && warp.objectsAt <= warp.triedAt && now - warp.triedAt < WARP.retryEvery) return;
    warp.triedAt = now;
    const plan = VendCore.planVendWarp(decoder.grid, decoder.objects, warp.item, here, itemNames);
    if (plan.error) {
      // The glass contents can keep arriving after the grid; keep looking a
      // while (re-planning as new records come in) before giving up.
      if (now - warp.gridAt < WARP.itemWait) return;
      const vends = decoder.grid.blocks.filter(block => VendCore.VEND_IDS.has(block.id)).length;
      const read = VendCore.vendGlass(decoder.grid, decoder.objects, itemNames);
      const detail = `${vends} machines, ${read.length} with glass read, ` +
        `${decoder.objects.size} items seen, names ${itemNames ? "loaded" : "MISSING"}`;
      warpLog("glass read:", read.slice(0, 40).map(row => `${row.vend.join(",")}: ${[...row.items].join(" / ")}`));
      endVendWarp(`Arrived, but ${plan.error} (${detail}).`, "warn");
      return;
    }
    if (here && VendCore.closeTo(here, plan.wire, 0.3)) {
      endVendWarp(`You're already at the ${warp.item} machine ✓`, "good");
      return;
    }
    if (!decoder.ownGuid) {
      endVendWarp("Arrived, but your player id isn't known yet — re-enter the realm once.", "warn");
      return;
    }
    try {
      warp.transport.injectInbound(Core.buildSelfMove(decoder.ownGuid, plan.wire));
    } catch (error) {
      endVendWarp(`Couldn't move to the machine: ${error.message}`, "warn");
      return;
    }
    warpLog("injected 0x0023: stand", plan.stand, "by machine", plan.vend,
      `(${plan.machines} machine(s) show it)`);
    Object.assign(warp, { stage: "moving", movedAt: now, target: plan.wire });
  }

  function setMarketSummary(message, tone = "normal") {
    if (!ui) return;
    ui.marketSummary.textContent = message || "";
    ui.marketSummary.dataset.tone = tone;
  }

  function renderMarketSearch() {
    if (!ui || !VendCore) return;
    ui.market.classList.toggle("show", marketVisible);
    placeMarket();
    ui.marketRows.replaceChildren();
    if (!priceBook || !priceBook.loaded) {
      setMarketSummary(priceBook && priceBook.error ?
        `Price catalog unavailable: ${priceBook.error}` : "Loading the public vending catalog…", "warn");
      return;
    }
    const query = ui.marketSearch.value.trim();
    if (!query) {
      setMarketSummary("Search by item, realm, or shop owner.");
      return;
    }
    const listings = VendCore.searchListings(priceBook, query, 80);
    setMarketSummary(listings.length ?
      `${listings.length} best match${listings.length === 1 ? "" : "es"} · cheapest first` :
      `No vending listings matched “${query}”.`, listings.length ? "good" : "warn");
    for (const listing of listings) {
      const row = document.createElement("div");
      row.className = "market-row";
      const details = document.createElement("div");
      details.className = "market-details";
      const item = document.createElement("div");
      item.className = "market-item";
      item.textContent = listing.item;
      const meta = document.createElement("div");
      meta.className = "market-meta";
      meta.textContent = listing.owner ? `${listing.realm} · ${listing.owner}` : listing.realm;
      copyOnRightClick(item, listing.item);
      copyOnRightClick(meta, listing.realm);
      details.append(item, meta);
      const price = document.createElement("div");
      price.className = "market-price";
      price.textContent = `${VendCore.formatNumber(listing.price)} ${listing.currency}` +
        (Number(listing.qty) > 1 ? ` / ${listing.qty}` : "");
      const go = document.createElement("button");
      go.className = "market-go";
      go.textContent = travelRequest ? "WAIT" : "GO";
      go.title = `Open Realm Search and visit ${listing.realm}`;
      go.disabled = !!travelRequest;
      go.addEventListener("click", () => goToListing(listing));
      row.append(details, price, go);
      ui.marketRows.append(row);
    }
  }

  function renderSelectedBlocks() {
    if (!ui) return;
    const containers = [ui.selectedBlocks, ui.finderSelectedBlocks].filter(Boolean);
    containers.forEach(container => container.replaceChildren());
    if (!config.customBlockIds.length) {
      for (const container of containers) {
        const empty = document.createElement("span");
        empty.className = "empty-inline";
        empty.textContent = "No custom blocks selected";
        container.append(empty);
      }
      return;
    }
    for (const container of containers) {
      for (const id of config.customBlockIds) {
        const pill = document.createElement("button");
        pill.className = "pill";
        pill.textContent = `${blockName(id)}  ×`;
        pill.title = `Remove block #${id}`;
        pill.addEventListener("click", () => {
          config.customBlockIds = config.customBlockIds.filter(value => value !== id);
          saveConfig();
          renderSelectedBlocks();
          renderSearchResults();
          scheduleRender();
        });
        container.append(pill);
      }
    }
  }

  function matchingBlocks(query, showDefaults) {
    query = String(query || "").trim().toLowerCase();
    if (!query && !showDefaults) return [];
    let matches;
    if (/^#?\d+$/.test(query)) {
      const id = Number(query.replace("#", ""));
      matches = catalogEntries.filter(item => item.id === id);
    } else {
      matches = catalogEntries.filter(item => !query || item.name.toLowerCase().includes(query));
    }
    return matches.filter(item => !config.customBlockIds.includes(item.id)).slice(0, 30);
  }

  function addCustomBlock(item) {
    if (!item || config.customBlockIds.includes(item.id)) return;
    config.customBlockIds.push(item.id);
    config.customBlockIds = Array.from(new Set(config.customBlockIds)).slice(0, 100);
    saveConfig();
    renderSelectedBlocks();
    renderSearchResults();
    scheduleRender();
    toast(`Now finding ${item.name}`, "good");
  }

  function renderSearchList(input, container, showDefaults) {
    const matches = matchingBlocks(input.value, showDefaults);
    container.replaceChildren();
    for (const item of matches) {
      const button = document.createElement("button");
      button.className = "search-result";
      button.textContent = `${item.name}  #${item.id}`;
      button.addEventListener("click", () => addCustomBlock(item));
      container.append(button);
    }
    if (input.value.trim() && !matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No block names matched.";
      container.append(empty);
    }
  }

  function renderSearchResults() {
    if (!ui) return;
    renderSearchList(ui.blockSearch, ui.searchResults, true);
    renderSearchList(ui.finderSearch, ui.finderSearchResults, false);
  }

  function addFirstSearchMatch(input) {
    const match = matchingBlocks(input.value, false)[0];
    if (match) addCustomBlock(match);
    else if (input.value.trim()) toast(`No block matched “${input.value.trim()}”`);
  }

  function applyConfigToUi() {
    applyPerfConfig();
    applyLightingConfig();
    if (window.CCFriends) window.CCFriends.setEnabled(config.friendsPanel !== false);
    if (window.CCProfile) window.CCProfile.setEnabled(config.profilePanel !== false);
    if (window.CCStore) window.CCStore.setEnabled(config.storePanel !== false);
    if (window.CCPerks) window.CCPerks.setEnabled(config.perksPanel !== false);
    if (window.CCMenu) window.CCMenu.setEnabled(config.menuPanel !== false);
    if (nameHider) nameHider.setHidden(config.playerNames === false);
    applyNoFog();
    renderChatSuggest();
    if (!ui) return;
    ui.fossilsToggle.checked = !!config.finderFossils;
    ui.autoToggle.checked = !!config.finderAutoShow;
    ui.loadingToggle.checked = !!config.loadingScreen;
    ui.vendPriceToggle.checked = !!config.vendPriceCard;
    ui.finderGlowToggle.checked = !!config.finderGlow;
    ui.opacity.value = String(config.opacity);
    ui.hud.style.opacity = String(config.opacity);
    placeHud();
    applyCameraConfig();
    renderPlotPanel();

    if (!config.multiPreview) clearMultiPreview();
    renderVendCard();
    renderSelectedBlocks();
    renderFavorites();
    updateHud();
  }

  function bindUi() {
    ui.chip.addEventListener("click", () => {
      marketVisible = !marketVisible;
      renderMarketSearch();
      if (marketVisible) setTimeout(() => ui.marketSearch.focus(), 0);
    });
    ui.closeSettings.addEventListener("click", () => {
      settingsVisible = false;
      ui.settings.classList.remove("show");
    });
    ui.closeFinder.addEventListener("click", () => {
      finderVisible = false;
      renderFinder();
    });
    ui.closeFavorites.addEventListener("click", () => {
      favoritesVisible = false;
      renderFavorites();
    });
    ui.closeMarket.addEventListener("click", () => {
      marketVisible = false;
      renderMarketSearch();
    });
    ui.favoriteButton.addEventListener("click", () => {
      favoritesVisible = !favoritesVisible;
      renderFavorites();
    });
    ui.realmSearchButton.addEventListener("click", openRealmSearchPopup);
    ui.foundButton.addEventListener("click", () => {
      config.hudExpanded = !config.hudExpanded;
      saveConfig();
      renderHudFound();
    });
    ui.closeChatCopy.addEventListener("click", () => setChatCopyVisible(false));
    ui.chatCopyAll.addEventListener("click", event =>
      copyText(chatLog.map(line => (line.notice ? "SYSTEM: " : "") + chatLineText(line)).join("\n"), event));
    makeDraggable(ui.chatCopy, ui.chatCopyHead, "chatCopyPosition", placeChatCopy);
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        if (!chatCopyVisible) return;
        const size = [ui.chatCopy.offsetWidth, ui.chatCopy.offsetHeight];
        if (size[0] && size[1] && String(size) !== String(config.chatCopySize)) {
          config.chatCopySize = size;
          clearTimeout(ui.chatCopy.saveTimer);
          ui.chatCopy.saveTimer = setTimeout(saveConfig, 400);
        }
      }).observe(ui.chatCopy);
    }

    ui.favoriteCurrent.addEventListener("click", () => {
      const realm = activeDecoder && activeDecoder.realm;
      if (addFavorite(realm)) toast(`Added ${realm} ★`, "good");
      else if (realm) toast(`${realm} is already a favorite`);
    });
    ui.blockSearch.addEventListener("input", event => {
      event.stopPropagation();
      renderSearchResults();
    });
    ui.finderSearch.addEventListener("input", event => {
      event.stopPropagation();
      renderSearchResults();
    });
    ui.marketWarp.checked = config.vendWarp;
    ui.marketWarp.addEventListener("change", () => {
      config.vendWarp = ui.marketWarp.checked;
      saveConfig();
      if (!config.vendWarp) endVendWarp();
    });
    ui.marketSearch.addEventListener("input", event => {
      event.stopPropagation();
      renderMarketSearch();
    });
    ui.clearBlocks.addEventListener("click", () => {
      config.customBlockIds = [];
      saveConfig();
      renderSelectedBlocks();
      renderSearchResults();
      scheduleRender();
      toast("Cleared custom Finder blocks");
    });
    ui.fossilsToggle.addEventListener("change", () => {
      config.finderFossils = ui.fossilsToggle.checked;
      saveConfig();
      scheduleRender();
    });
    ui.autoToggle.addEventListener("change", () => {
      config.finderAutoShow = ui.autoToggle.checked;
      saveConfig();
    });
    ui.loadingToggle.addEventListener("change", () => {
      config.loadingScreen = ui.loadingToggle.checked;
      if (!config.loadingScreen) ui.loading.classList.remove("show");
      saveConfig();
    });
    ui.finderGlowToggle.addEventListener("change", () => {
      config.finderGlow = ui.finderGlowToggle.checked;
      saveConfig();
    });
    ui.vendPriceToggle.addEventListener("change", () => {
      config.vendPriceCard = ui.vendPriceToggle.checked;
      saveConfig();
      renderVendCard();
    });
    ui.lightingOriginal.addEventListener("click", () => setLightingMode(0));
    ui.lightingBright.addEventListener("click", () => setLightingMode(1));
    ui.lightingFull.addEventListener("click", () => setLightingMode(2));
    ui.cameraNative.addEventListener("click", () => setCameraMode(0));
    ui.cameraFirst.addEventListener("click", () => setCameraMode(1));
    ui.cameraNear.addEventListener("click", () => setCameraMode(2));
    ui.cameraForward.addEventListener("input", () => {
      config.cameraForwardShift = Number(ui.cameraForward.value);
      saveConfig();
      applyCameraConfig();
    });
    ui.cameraVertical.addEventListener("input", () => {
      config.cameraVerticalShift = Number(ui.cameraVertical.value);
      saveConfig();
      applyCameraConfig();
    });
    ui.cameraSyncPicking.addEventListener("change", () => {
      config.cameraSyncPicking = ui.cameraSyncPicking.checked;
      saveConfig();
      applyCameraConfig();
    });
    ui.cameraHideSelfTag.addEventListener("change", () => {
      config.cameraHideSelfTag = ui.cameraHideSelfTag.checked;
      if (!config.cameraHideSelfTag) ui.cameraSelfMask.classList.remove("show");
      saveConfig();
      applyCameraConfig();
    });
    ui.cameraTagOffset.addEventListener("input", () => {
      config.cameraTagOffset = Number(ui.cameraTagOffset.value);
      ui.cameraTagOffsetValue.textContent = `${config.cameraTagOffset.toFixed(0)} px`;
      saveConfig();
    });
    ui.previewLoading.addEventListener("click", () => {
      showLoading();
      updateLoadingRealm(activeDecoder && activeDecoder.realm || "Loading Screen Preview");
      hideLoading(3200);
    });
    ui.previewVendCard.addEventListener("click", () => {
      if (!VendCore) return;
      vendPopup = {
        decoder: { realm: "Price Card Preview" },
        transport: null,
        dialogGuid: "preview",
        offer: { item: "Spiderbrella", qty: 1, price: 4449, currency: "Cubits" },
        match: { stock: 13, glassKey: "preview" }
      };
      renderVendCard();
      clearTimeout(vendPopupTimer);
      vendPopupTimer = setTimeout(() => hideVendCard(), 5000);
    });
    ui.opacity.addEventListener("input", () => {
      config.opacity = Number(ui.opacity.value);
      ui.hud.style.opacity = String(config.opacity);
      saveConfig();
    });
    ui.resetButton.addEventListener("click", () => {
      config = cleanConfig(null);
      saveConfig();
      applyConfigToUi();
      renderSearchResults();
      scheduleRender();
      toast("Browser mod settings reset");
    });
    ui.diagnostics.addEventListener("click", () => {
      const info = {
        version: "1.0.22",
        page: location.origin,
        connectedSockets: openSockets,
        receivedFrames,
        receivedBytes,
        decoderReady: !!(activeDecoder && activeDecoder.key),
        realm: activeDecoder && activeDecoder.realm,
        gridBlocks: activeDecoder && activeDecoder.grid && activeDecoder.grid.blocks.length,
        finderHits: currentReport().total,
        camera: cameraController ? cameraController.status() : { installed: false },
        lighting: lightingController ? lightingController.status() : { installed: false },
        vendingPrices: {
          enabled: !!config.vendPriceCard,
          loaded: !!(priceBook && priceBook.loaded),
          loadedAt: priceLoadedAt,
          itemCount: priceBook && priceBook.vends ? priceBook.vends.size : 0,
          error: priceBook && priceBook.error || null
        },
        multiPlanner: {
          enabled: !!config.multiPreview,
          action: config.multiAction,
          mode: config.multiMode,
          count: config.multiCount,
          cameraReady: !!(cameraController && cameraController.pickState && cameraController.pickState()),
          aimed: plannerPreview && plannerPreview.origin || null,
          targets: plannerPreview && plannerPreview.targets && plannerPreview.targets.length || 0,
          reach: config.multiReach,
          outbound: activeDecoder && activeDecoder.outboundStats || null,
          outerCipher: !!(activeDecoder && activeDecoder.outerKey && activeDecoder.outerKey.length),
          counterSeen: !!(activeTransport && activeTransport.lastCounter != null),
          lastResult: lastMultiResult
        },
        finderGlow: { enabled: !!config.finderGlow, cells: glowCells.length },
        performance: perfStatus()
      };
      const blob = new Blob([JSON.stringify(info, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "cc-browser-mod-diagnostics.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast("Downloaded safe diagnostics", "good");
    });

    for (const id of Object.keys(plotInputKeys)) ui[id].addEventListener("change", savePlotInputs);
    ui.keepButton.addEventListener("click", toggleKeeper);
    ui.keepTestButton.addEventListener("click", testBuyNow);

    makeDraggable(ui.favorites, ui.favoritesHead, "favoritesPosition", placeFavorites);
    makeDraggable(ui.plotPanel, ui.plotHead, "plotPosition", placePlotPanel);
    makeDraggable(ui.market, ui.marketHead, "marketPosition", placeMarket);
    watchMarketSize();

    let drag = null;
    ui.hudHead.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      const rect = ui.hud.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      ui.hudHead.setPointerCapture(event.pointerId);
    });
    ui.hudHead.addEventListener("pointermove", event => {
      if (!drag) return;
      const maxX = Math.max(0, window.innerWidth - ui.hud.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - ui.hud.offsetHeight);
      const x = Math.max(0, Math.min(maxX, event.clientX - drag.dx));
      const y = Math.max(0, Math.min(maxY, event.clientY - drag.dy));
      const bottom = Math.max(0, window.innerHeight - y - ui.hud.offsetHeight);
      config.hudPosition = [Math.round(x), Math.round(bottom)];
      placeHud();
    });
    ui.hudHead.addEventListener("pointerup", () => {
      if (drag) saveConfig();
      drag = null;
    });
  }

  function buildUi() {
    if (ui || !document.documentElement) return;
    const host = document.createElement("div");
    host.id = "cc-browser-mod-host";
    // Keep styles isolated from the game, but leave the root inspectable so a
    // user can troubleshoot the unpacked extension with normal browser tools.
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        button, input { font: inherit; }
        .root { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647; pointer-events: none;
          color: #eef2f7; font: 13px/1.35 "Segoe UI", Arial, sans-serif; }
        .panel, .chip, .toast { z-index: 10; }
        .hidden { display: none !important; }
        .panel { pointer-events: auto; color: #eef2f7; background: rgba(18,21,27,.96);
          border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
          box-shadow: 0 14px 40px rgba(0,0,0,.45); backdrop-filter: blur(8px); }
        .hud { position: fixed; display: flex; flex-direction: column-reverse; padding: 4px;
          user-select: none; border-radius: 8px; }
        .hud-bar { display: flex; align-items: stretch; gap: 5px; }
        .hud .fps-pill { display: flex; align-items: center; padding: 0 7px; border-radius: 5px;
          color: #9fb0c4; background: #1b212b; font: 700 11px Consolas, monospace; white-space: nowrap; }
        .hud .fps-pill[data-tone="good"] { color: #7ee787; }
        .hud .fps-pill[data-tone="warn"] { color: #f2c14e; }
        .hud .fps-pill[data-tone="bad"] { color: #ff9b91; }
        .hud .found-action { color: #f6d77a; background: #2e2917; }
        .hud .found-action.open { color: #1b1606; background: #f2c14e; }
        .hud-found { display: none; margin-bottom: 5px; max-height: min(320px, calc(100vh - 90px)); overflow: auto; }
        .hud-found.show { display: block; }
        .found-group { padding: 4px 3px 5px; border-bottom: 1px solid rgba(255,255,255,.07); }
        .found-name { color: #f6d77a; font-size: 11px; font-weight: 700; }
        .found-coords { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
        .found-coord { border: 1px solid rgba(242,193,78,.3); border-radius: 4px; padding: 1px 5px;
          color: #fde9b0; background: #262112; font: 10px Consolas, monospace; cursor: pointer; }
        .found-coord:hover, .found-coord.active { color: #1b1606; border-color: #f2c14e; background: #f2c14e; }
        .found-empty { padding: 5px 3px; color: #8a93a0; font-size: 11px; font-style: italic; }
        .drawer.chat-copy { position: fixed; left: 18px; right: auto; top: auto; bottom: 64px;
          width: min(760px, calc(100vw - 36px)); height: 230px; min-width: 300px; min-height: 120px;
          max-width: calc(100vw - 8px); max-height: calc(100vh - 8px); padding: 0; overflow: hidden;
          resize: both; background: rgba(12,14,20,.86); }
        .drawer.chat-copy.show { display: flex; flex-direction: column; }
        .chat-copy-head { display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 10px;
          border-bottom: 1px solid rgba(255,255,255,.08); }
        .chat-copy-hint { color: #7d8794; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-copy-head .mini { white-space: nowrap; }
        .chat-copy-head .spacer { flex: 1; }
        .chat-copy-rows { flex: 1; min-height: 0; overflow: auto; padding: 5px 10px 7px;
          user-select: text; -webkit-user-select: text; cursor: text;
          font: 700 15px/1.45 "Trebuchet MS", "Segoe UI", Arial, sans-serif;
          text-shadow: 0 1px 1px #000, 0 0 2px #000; }
        .chat-copy-rows ::selection { color: #fff; background: rgba(59,130,246,.75); }
        .chat-line { color: #fff; overflow-wrap: anywhere; }
        .chat-line.whisper { color: #b9b9b9; }
        .chat-who { color: #fff; }
        .chat-who.own { color: #a6f0b0; }
        .sys-badge { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 7px;
          color: #fff; background: #c81e1e; border: 1px solid #ff8a8a; font: 900 11px/16px Arial, sans-serif;
          letter-spacing: .02em; vertical-align: 2px; text-shadow: none; user-select: none; -webkit-user-select: none; }
        .copy-flash { position: fixed; z-index: 60; display: none; transform: translate(-50%, -100%);
          max-width: 320px; padding: 4px 9px; border-radius: 6px; color: #06210f; background: #7ee787;
          box-shadow: 0 4px 14px rgba(0,0,0,.4); font: 700 11px "Segoe UI", sans-serif;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
        .copy-flash[data-tone="bad"] { color: #2a0906; background: #ff9b91; }
        .copy-flash.show { display: block; }
        .hud .head { margin: 0; padding: 0 3px; font-size: 12px; letter-spacing: -1px; color: #5b6573; }
        .hud .actions { margin: 0; gap: 4px; flex-wrap: nowrap; }
        .hud .action { flex: none; padding: 4px 8px; font-size: 12px; white-space: nowrap; }
        .head { display: flex; align-items: center; gap: 7px; color: #74b9ff; font-size: 11px;
          font-weight: 800; letter-spacing: .08em; cursor: move; margin-bottom: 7px; }
        .head .spacer { flex: 1; }
        .mini { border: 0; border-radius: 5px; padding: 2px 6px; color: #aab2bd;
          background: #292e38; cursor: pointer; }
        .mini:hover, .icon-button:hover { color: white; background: #3b82f6; }
        .metrics { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; }
        .label { color: #818b98; }
        .value { text-align: right; font-family: Consolas, monospace; font-weight: 700;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .value.good { color: #7ee787; }
        .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .action { flex: 1; border: 0; border-radius: 6px; padding: 5px 7px; color: #dfe6ef;
          background: #292e38; cursor: pointer; }
        .action:hover { background: #3b82f6; color: white; }
        .realm-search-action { color: #dbeafe; background: #263852; }
        .chip { position: absolute; right: 18px; bottom: 18px; pointer-events: auto; border: 1px solid
          rgba(255,255,255,.18); border-radius: 999px; padding: 8px 12px; color: white;
          background: rgba(22,27,35,.94); box-shadow: 0 8px 24px rgba(0,0,0,.38); cursor: pointer;
          font: 800 11px "Segoe UI", sans-serif; letter-spacing: .08em; }
        .chip:hover { background: #2563eb; }
        .drawer { position: absolute; top: 18px; right: 18px; width: min(390px, calc(100vw - 36px));
          max-height: calc(100vh - 36px); padding: 13px; overflow: auto; display: none; }
        .drawer.show { display: block; }
        .titlebar { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
        .title { color: #74b9ff; font-size: 12px; font-weight: 800; letter-spacing: .07em; }
        .subtitle { color: #8b95a3; font-size: 11px; margin-bottom: 8px; }
        .titlebar .spacer { flex: 1; }
        .icon-button { width: 25px; height: 25px; border: 0; border-radius: 5px; color: #9aa4b2;
          background: transparent; cursor: pointer; }
        .section { border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; margin-top: 10px; }
        .section-title { margin-bottom: 7px; color: #c9d1d9; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .06em; }
        .toggle { display: flex; align-items: center; gap: 8px; margin: 6px 0; color: #d4dae3; }
        .toggle input { accent-color: #3b82f6; }
        .input { width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 6px;
          padding: 7px 8px; outline: 0; color: #eef2f7; background: #0d1015; }
        .input:focus { border-color: #3b82f6; }
        .selected { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0; }
        .pill { border: 0; border-radius: 999px; padding: 4px 8px; color: #dbeafe;
          background: #263852; cursor: pointer; }
        .pill:hover { background: #63323a; color: #fecaca; }
        .empty-inline, .empty { color: #76808e; font-style: italic; padding: 5px 0; }
        .search-results { max-height: 190px; overflow: auto; margin-top: 5px; }
        .search-result { display: block; width: 100%; border: 0; padding: 6px 8px; text-align: left;
          color: #d7dde7; background: transparent; cursor: pointer; }
        .search-result:hover { background: #263852; color: white; }
        .range { width: 100%; accent-color: #3b82f6; }
        .dangerless { border: 0; border-radius: 6px; padding: 7px 9px; color: #d7dde7;
          background: #292e38; cursor: pointer; }
        .dangerless:hover { background: #374151; color: white; }
        .settings-actions { display: flex; gap: 7px; flex-wrap: wrap; }
        .mode-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 7px 0; }
        .mode-button { border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: 6px 4px;
          color: #cbd5e1; background: #20252e; cursor: pointer; }
        .mode-button:hover, .mode-button.active { color: white; border-color: #60a5fa; background: #2563eb; }
        .camera-range { display: grid; grid-template-columns: 88px 1fr 42px; gap: 7px;
          align-items: center; margin-top: 7px; color: #aeb7c4; font-size: 11px; }
        .camera-number { text-align: right; color: #dbeafe; font-family: Consolas, monospace; }
        .camera-status[data-tone="good"] { color: #7ee787; }
        .camera-status[data-tone="warn"] { color: #f0a36b; }
        .camera-crosshair { position: fixed; z-index: 2; width: 17px; height: 17px;
          display: none; transform: translate(-50%, -50%); pointer-events: none;
          filter: drop-shadow(0 1px 1px rgba(0,0,0,.9)); }
        .camera-crosshair::before, .camera-crosshair::after { content: ""; position: absolute;
          background: rgba(255,255,255,.9); border-radius: 1px; }
        .camera-crosshair::before { left: 8px; top: 2px; width: 1px; height: 13px; }
        .camera-crosshair::after { left: 2px; top: 8px; width: 13px; height: 1px; }
        .camera-crosshair.show { display: block; }
        .camera-self-mask { position: fixed; z-index: 1; display: none; pointer-events: none; }
        .camera-self-mask.show { display: block; }
        .multi-canvas { position: fixed; inset: 0; z-index: 3; width: 100vw; height: 100vh;
          pointer-events: none; }
        .multi-status { position: fixed; z-index: 7; left: 50%; top: 16px; display: none;
          max-width: min(620px, calc(100vw - 36px)); transform: translateX(-50%);
          padding: 7px 11px; border: 1px solid rgba(255,255,255,.13); border-radius: 999px;
          color: #d8dee8; background: rgba(16,20,27,.88); box-shadow: 0 5px 20px rgba(0,0,0,.35);
          font: 700 11px/1.25 Consolas, monospace; text-align: center; pointer-events: none; }
        .multi-status.show { display: block; }
        .multi-status[data-tone="good"] { color: #dbeafe; border-color: rgba(96,165,250,.38); }
        .multi-status[data-tone="warn"] { color: #f0b079; }
        .chat-suggest { position: fixed; z-index: 7; left: 12px; bottom: 64px; display: none;
          min-width: 220px; max-width: min(420px, calc(100vw - 24px)); padding: 8px 10px 7px;
          pointer-events: none; overflow: hidden; }
        .chat-suggest.show { display: block; }
        .chat-suggest::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: #3b82f6; }
        .chat-suggest-row { margin: 1px 0; padding: 2px 6px; border-radius: 6px; color: #e6e6e6;
          font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-suggest-row[data-sel="1"] { color: white; background: rgba(59,130,246,.38); }
        .chat-suggest-row[data-tone="cmd"], .chat-suggest-row[data-tone="info"] { color: #67e8f9; }
        .chat-suggest-row[data-tone="warn"] { color: #f5a524; }
        .chat-suggest-row[data-tone="bad"] { color: #ff7b72; }
        .chat-suggest-row[data-tone="good"] { color: #7ee787; }
        .chat-suggest-row[data-tone="hint"], .chat-suggest-row[data-tone="dim"] { color: #9aa0a6; font-size: 11px; }
        .vend-card { position: fixed; z-index: 6; left: 50%; top: calc(50% + 120px);
          width: min(370px, calc(100vw - 24px)); display: none; transform: translateX(-50%);
          padding: 11px 14px 10px; pointer-events: none; overflow: hidden; }
        .vend-card.show { display: block; }
        .vend-card::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px;
          background: #60a5fa; }
        .vend-card[data-accent="good"]::before { background: #7ee787; }
        .vend-card[data-accent="warn"]::before { background: #f2c14e; }
        .vend-card[data-accent="bad"]::before { background: #ff7b72; }
        .vend-card-kicker { margin: 1px 0 5px; color: #8b95a3; font-size: 9px;
          font-weight: 800; letter-spacing: .12em; }
        .vend-card-row { margin: 2px 0; color: #e6e6e6; font-size: 12px; }
        .vend-card-row[data-tone="title"] { margin-bottom: 5px; color: white;
          font-size: 14px; font-weight: 800; }
        .vend-card-row[data-tone="price"], .vend-card-row[data-tone="good"] { color: #7ee787; }
        .vend-card-row[data-tone="best"] { color: #79c0ff; }
        .vend-card-row[data-tone="value"] { color: #ffa657; }
        .vend-card-row[data-tone="warn"] { color: #f2c14e; }
        .vend-card-row[data-tone="bad"] { color: #ff7b72; }
        .vend-card-row[data-tone="muted"] { color: #9aa0a6; }
        .market { position: fixed; left: 50%; right: auto; top: 18px; width: min(680px, calc(100vw - 36px));
          height: min(560px, calc(100vh - 36px)); max-width: calc(100vw - 8px); max-height: calc(100vh - 8px);
          min-width: 320px; min-height: 190px; transform: translateX(-50%); overflow: hidden; resize: both; }
        .market.show { display: flex; flex-direction: column; }
        .market-search { padding: 9px 10px; font-size: 14px; }
        .market-summary { margin: 7px 0 5px; }
        .market-summary[data-tone="good"] { color: #7ee787; }
        .market-summary[data-tone="warn"] { color: #f0a36b; }
        .market-rows { flex: 1; min-height: 0; overflow: auto; border-top: 1px solid rgba(255,255,255,.08); }
        .market-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 46px; gap: 10px;
          align-items: center; min-height: 52px; padding: 7px 2px 7px 7px;
          border-bottom: 1px solid rgba(255,255,255,.07); }
        .market-row:hover { background: rgba(59,130,246,.09); }
        .market-details { min-width: 0; }
        .market-item { overflow: hidden; color: #f5f7fa; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
        .market-meta { overflow: hidden; margin-top: 2px; color: #8993a2; font-size: 11px;
          text-overflow: ellipsis; white-space: nowrap; }
        .market-price { color: #7ee787; font: 700 12px Consolas, monospace; white-space: nowrap; }
        .market-go { border: 1px solid rgba(96,165,250,.45); border-radius: 6px; padding: 6px 7px;
          color: #dbeafe; background: #1d3555; font-size: 10px; font-weight: 800; cursor: pointer; }
        .market-go:hover:not(:disabled) { color: white; background: #2563eb; }
        .market-go:disabled { opacity: .45; cursor: default; }
        .finder { left: 18px; right: auto; top: auto; bottom: 18px; width: min(520px, calc(100vw - 36px));
          max-height: min(540px, calc(100vh - 36px)); }
        .finder-rows { overflow: auto; max-height: 420px; }
        .finder-row { padding: 8px; border-top: 1px solid rgba(255,255,255,.07); }
        .finder-name { font-weight: 700; color: #f2f5f8; }
        .finder-coords { margin-top: 3px; color: #aeb7c4; font: 11px/1.45 Consolas, monospace;
          overflow-wrap: anywhere; }
        .finder-coords { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .coord-button { border: 1px solid rgba(96,165,250,.35); border-radius: 5px; padding: 2px 5px;
          color: #bfdbfe; background: #1d2b40; font: 11px Consolas, monospace; cursor: pointer; }
        .coord-button:hover { color: white; border-color: #60a5fa; background: #2563eb; }
        .finder-tools { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,.08); }
        .finder-search-line { display: flex; gap: 6px; }
        .finder-search-line .input { flex: 1; }
        .finder-search-results { max-height: 145px; overflow: auto; }
        .favorites { position: fixed; left: 270px; right: auto; top: 110px; width: min(330px, calc(100vw - 36px)); }
        .drag-handle { cursor: move; user-select: none; }
        .favorite-row { display: flex; gap: 4px; border-top: 1px solid rgba(255,255,255,.07); }
        .favorite-name { flex: 1; border: 0; padding: 7px 5px; text-align: left; color: #eef2f7;
          background: transparent; cursor: pointer; }
        .favorite-name:hover { color: #f2c14e; }
        .favorite-add { display: flex; gap: 6px; margin-top: 8px; }
        .favorite-add .input { flex: 1; }
        .loading { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; opacity: 0;
          visibility: hidden; transition: opacity .25s ease, visibility .25s ease; pointer-events: none;
          background: #05070b; }
        .loading.show { opacity: 1; visibility: visible; }
        .loading-art { position: absolute; inset: 0; background-position: center; background-size: cover;
          filter: saturate(.88) brightness(.72); transform: scale(1.01); }
        .loading-art::after { content: ""; position: absolute; inset: 0;
          background: radial-gradient(circle at 50% 45%, transparent 10%, rgba(3,5,9,.72) 86%); }
        .loading-card { position: relative; min-width: min(520px, 86vw); padding: 24px 30px;
          text-align: center; border: 1px solid rgba(255,255,255,.16); border-radius: 14px;
          background: rgba(5,8,13,.72); box-shadow: 0 24px 80px rgba(0,0,0,.55); }
        .loading-kicker { color: #8bbcff; font-size: 11px; font-weight: 800; letter-spacing: .18em; }
        .loading-realm { margin-top: 8px; color: white; font: 700 clamp(24px, 4vw, 44px) "Segoe UI", sans-serif;
          text-shadow: 0 3px 18px black; }
        .loading-line { width: 150px; height: 3px; margin: 17px auto 0; overflow: hidden;
          border-radius: 9px; background: rgba(255,255,255,.14); }
        .loading-line::after { content: ""; display: block; width: 55%; height: 100%; background: #60a5fa;
          animation: loading 1.1s ease-in-out infinite alternate; }
        @keyframes loading { from { transform: translateX(-85%); } to { transform: translateX(165%); } }
        .toast { position: absolute; left: 50%; bottom: 22px; transform: translate(-50%, 14px);
          max-width: min(520px, 90vw); padding: 9px 13px; opacity: 0; border-radius: 7px;
          color: #e5e7eb; background: rgba(15,18,24,.96); box-shadow: 0 8px 30px rgba(0,0,0,.4);
          transition: .18s ease; }
        .toast.show { opacity: 1; transform: translate(-50%, 0); }
        .toast[data-tone="good"] { color: #a7f3d0; }
        .toast[data-tone="warn"] { color: #fbbf77; }
        .market-warp { display: flex; align-items: center; gap: 6px; margin-top: 6px;
          color: #9aa0a6; font-size: 11px; cursor: pointer; user-select: none; }
        .readonly { color: #7ee787; font-size: 10px; font-weight: 800; }
        .plot-panel { position: fixed; left: auto; right: 18px; top: 70px; width: min(290px, calc(100vw - 36px));
          padding: 11px; }
        .plot-grid { display: grid; gap: 5px; margin-top: 5px; }
        .plot-grid .input { padding: 6px 7px; font: 12px Consolas, monospace; }
        .plot-grid.three { grid-template-columns: repeat(3, 1fr); }
        .plot-grid.three .input { text-align: center; }
        .plot-grid.two { grid-template-columns: 1fr 1fr; }
        .plot-panel .actions { margin-top: 6px; }
        .plot-label { align-self: center; color: #aeb7c4; font-size: 11px; }
        .plot-go:not(:disabled) { color: #06210f; background: #7ee787; font-weight: 800; }
        .plot-go:not(:disabled):hover { color: #06210f; background: #a7f3b5; }
        .plot-panel .action:disabled { opacity: .4; cursor: default; background: #292e38; color: #dfe6ef; }
        .plot-badge { padding: 2px 7px; border-radius: 999px; color: #9aa4b2; background: #20252e;
          font: 800 9px "Segoe UI", sans-serif; letter-spacing: .08em; }
        .plot-badge[data-tone="watch"] { color: #0b1a2e; background: #60a5fa; }
        .plot-badge[data-tone="good"] { color: #06210f; background: #7ee787; }
        .plot-badge[data-tone="bad"] { color: #2a0906; background: #ff9b91; }
        .plot-status { margin: 7px 0 0; font-size: 11px; }
        .plot-status[data-tone="watch"] { color: #bfdbfe; }
        .plot-status[data-tone="good"] { color: #7ee787; }
        .plot-status[data-tone="bad"] { color: #ff9b91; }
        .plot-panel .actions .action { width: 100%; }
      </style>
      <div class="root">
        <canvas id="multiCanvas" class="multi-canvas"></canvas>
        <div id="multiStatus" class="multi-status"></div>
        <canvas id="cameraSelfMask" class="camera-self-mask"></canvas>
        <div id="cameraCrosshair" class="camera-crosshair"></div>
        <div id="chatSuggest" class="panel chat-suggest"></div>
        <div id="vendCard" class="panel vend-card" data-accent="normal">
          <div class="vend-card-kicker">VENDING PRICE CHECK</div><div id="vendCardRows"></div></div>
        <div id="loading" class="loading"><div id="loadingArt" class="loading-art"></div>
          <div class="loading-card"><div class="loading-kicker">CUBIC CASTLES</div>
            <div id="loadingRealm" class="loading-realm">Entering realm…</div><div class="loading-line"></div></div></div>
        <div id="hud" class="panel hud">
          <div class="hud-bar"><div id="hudHead" class="head" title="Drag to move">⋮⋮</div>
          <div class="actions"><button id="realmSearchButton" class="action realm-search-action">Realm Search</button>
            <button id="favoriteButton" class="action" title="Favorite realms (F6)">★ Favorites</button>
            <button id="foundButton" class="action found-action" title="Show the blocks the Finder found here">Found —</button></div>
          <span id="fps" class="fps-pill" title="Game frames per second">— FPS</span></div>
          <div id="hudFound" class="hud-found"></div>
        </div>
        <div id="chatCopy" class="panel drawer chat-copy">
          <div id="chatCopyHead" class="chat-copy-head drag-handle" title="Drag to move"><span class="title">CHAT</span>
            <span class="chat-copy-hint">drag over text to select · Ctrl+C copies</span><span class="spacer"></span>
            <button id="chatCopyAll" class="mini" title="Copy every line">Copy all</button>
            <button id="closeChatCopy" class="icon-button" title="Close (Esc or Ctrl+C)">×</button></div>
          <div id="chatCopyRows" class="chat-copy-rows"></div>
        </div>
        <div id="copyFlash" class="copy-flash"></div>
        <button id="chip" class="chip">CC MODS</button>
        <div id="market" class="panel drawer market">
          <div id="marketHead" class="titlebar drag-handle" title="Drag to move"><span class="title">VENDING MARKET SEARCH</span><span class="spacer"></span>
            <button id="closeMarket" class="icon-button">×</button></div>
          <div class="subtitle">Search the public vends catalog by item, realm, or owner. GO uses the game's exact-name Realm Search—never a share link.</div>
          <input id="marketSearch" class="input market-search" placeholder="Search an item, realm, or owner" autocomplete="off">
          <label class="market-warp"><input id="marketWarp" type="checkbox"> Put me at the machine when I arrive</label>
          <div id="marketSummary" class="subtitle market-summary"></div>
          <div id="marketRows" class="market-rows"></div>
        </div>
        <div id="settings" class="panel drawer">
          <div class="titlebar"><span class="title">BROWSER MOD SETTINGS</span><span class="spacer"></span>
            <button id="closeSettings" class="icon-button">×</button></div>
          <div class="subtitle">Runs entirely in this tab. HUD and Finder are passive; favorite travel uses the game's exact-name Realm Search flow.</div>
          <label class="toggle"><input id="fossilsToggle" type="checkbox"> Find every dig collectible (fossils preset)</label>
          <label class="toggle"><input id="autoToggle" type="checkbox"> Pop open Finder when selected blocks are found</label>
          <label class="toggle"><input id="loadingToggle" type="checkbox"> Show the realm loading artwork</label>
          <label class="toggle"><input id="vendPriceToggle" type="checkbox"> Show price card under vending-machine dialogs</label>
          <label class="toggle"><input id="finderGlowToggle" type="checkbox"> Make Finder blocks glow gold in the world (seen through walls)</label>
          <div class="section"><div class="section-title">Realm lighting · Shift+F3</div>
            <div class="subtitle">Bright makes dark-realm textures readable; Full bright shows them at full strength. The WebGL HUD remains original.</div>
            <div class="mode-buttons"><button id="lightingOriginal" class="mode-button">Original</button>
              <button id="lightingBright" class="mode-button">Bright</button>
              <button id="lightingFull" class="mode-button">Full bright</button></div>
            <div id="lightingStatus" class="subtitle camera-status">Waiting for WebGL…</div></div>
          <div class="section"><div class="section-title">Experimental browser camera · F5</div>
            <div class="subtitle">Moves the WebGL view camera. First person and Near third use a -1 height preset; Native always restores the original view.</div>
            <div class="mode-buttons"><button id="cameraNative" class="mode-button">Native</button>
              <button id="cameraFirst" class="mode-button">First person</button>
              <button id="cameraNear" class="mode-button">Near third</button></div>
            <label class="camera-range"><span>Forward shift</span><input id="cameraForward" class="range" type="range" min="-60" max="60" step="0.5"><span id="cameraForwardValue" class="camera-number">22.0</span></label>
            <label class="camera-range"><span>Height shift</span><input id="cameraVertical" class="range" type="range" min="-20" max="20" step="0.5"><span id="cameraVerticalValue" class="camera-number">-1.0</span></label>
            <label class="toggle"><input id="cameraSyncPicking" type="checkbox"> Sync the WASM view matrix for block picking</label>
            <label class="toggle"><input id="cameraHideSelfTag" type="checkbox"> Hide my centred nametag in first person</label>
            <label class="camera-range"><span>Tag mask Y</span><input id="cameraTagOffset" class="range" type="range" min="-180" max="-25" step="1"><span id="cameraTagOffsetValue" class="camera-number">-106 px</span></label>
            <div id="cameraStatus" class="subtitle camera-status">Waiting for WebGL…</div></div>
          <div class="section"><div class="section-title">Choose other blocks</div>
            <div id="selectedBlocks" class="selected"></div>
            <input id="blockSearch" class="input" placeholder="Search every block by name or #id">
            <div id="searchResults" class="search-results"></div></div>
          <div class="section"><div class="section-title">HUD opacity</div><input id="opacity" class="range" type="range" min="0.45" max="1" step="0.01"></div>
          <div class="section settings-actions"><button id="previewLoading" class="dangerless">Preview loading screen</button>
            <button id="previewVendCard" class="dangerless">Preview vending card</button>
            <button id="diagnostics" class="dangerless">Download diagnostics</button>
            <button id="resetButton" class="dangerless">Reset settings</button></div>
        </div>
        <div id="finder" class="panel drawer finder">
          <div class="titlebar"><span id="finderTitle" class="title">BLOCK FINDER</span><span class="spacer"></span>
            <button id="closeFinder" class="icon-button">×</button></div>
          <div class="finder-tools">
            <div class="finder-search-line"><input id="finderSearch" class="input" placeholder="Type a block name, then click it or press Enter">
              <button id="clearBlocks" class="dangerless">Clear custom</button></div>
            <div id="finderSelectedBlocks" class="selected"></div>
            <div id="finderSearchResults" class="finder-search-results"></div>
          </div>
          <div id="finderSummary" class="subtitle"></div><div id="finderRows" class="finder-rows"></div>
        </div>
        <div id="favorites" class="panel drawer favorites">
          <div id="favoritesHead" class="titlebar drag-handle" title="Drag to move"><span class="title">★ FAVORITE REALMS</span><span class="spacer"></span>
            <button id="closeFavorites" class="icon-button">×</button></div>
          <div class="subtitle">Click a saved realm to open the game's Realm Search, search its exact name, and visit the exact result.</div>
          <div id="favoriteRows"></div>
          <div id="favoriteStatus" class="subtitle"></div>
          <button id="favoriteCurrent" class="action" style="width:100%;margin-top:8px">★ Current realm unknown</button>
          <div class="favorite-add"><input id="favoriteTyped" class="input" placeholder="Add exact realm name, then Enter"></div>
        </div>
        <div id="plotPanel" class="panel drawer plot-panel">
          <div id="plotHead" class="titlebar drag-handle" style="margin-bottom:4px" title="Drag to move"><span class="title">KEEP MY PLOT</span>
            <span class="spacer"></span><span id="keepBadge" class="plot-badge">OFF</span></div>
          <div id="keepTarget" class="subtitle" style="margin:0 0 2px"></div>
          <div class="plot-grid three"><input id="plotBx" class="input" placeholder="bx" inputmode="numeric" autocomplete="off">
            <input id="plotBy" class="input" placeholder="by" inputmode="numeric" autocomplete="off">
            <input id="plotBz" class="input" placeholder="bz" inputmode="numeric" autocomplete="off"></div>
          <div class="actions"><button id="keepButton" class="action plot-go">Keep this plot</button></div>
          <div class="actions" style="margin-top:5px"><button id="keepTestButton" class="action"
            title="Debug: renew right now instead of waiting for 5 minutes left">Test buy now (10 Cubits)</button></div>
          <div id="keepStatus" class="subtitle plot-status"></div>
        </div>
        <div id="toast" class="toast"></div>
      </div>`;
    document.documentElement.append(host);
    const byId = id => shadow.getElementById(id);
    ui = {
      host, shadow,
      multiCanvas: byId("multiCanvas"), multiStatus: byId("multiStatus"),
      cameraSelfMask: byId("cameraSelfMask"), cameraCrosshair: byId("cameraCrosshair"),
      vendCard: byId("vendCard"), vendCardRows: byId("vendCardRows"), chatSuggest: byId("chatSuggest"),
      loading: byId("loading"), loadingArt: byId("loadingArt"), loadingRealm: byId("loadingRealm"),
      hud: byId("hud"), hudHead: byId("hudHead"), fps: byId("fps"), status: byId("status"),
      realm: byId("realm"), coords: byId("coords"), blocks: byId("blocks"), hits: byId("hits"), target: byId("target"),
      chip: byId("chip"), settings: byId("settings"), closeSettings: byId("closeSettings"), realmSearchButton: byId("realmSearchButton"),
      market: byId("market"), marketHead: byId("marketHead"), closeMarket: byId("closeMarket"), marketSearch: byId("marketSearch"),
      marketSummary: byId("marketSummary"), marketRows: byId("marketRows"),
      marketWarp: byId("marketWarp"),
      fossilsToggle: byId("fossilsToggle"), autoToggle: byId("autoToggle"), loadingToggle: byId("loadingToggle"),
      vendPriceToggle: byId("vendPriceToggle"), finderGlowToggle: byId("finderGlowToggle"),
      lightingOriginal: byId("lightingOriginal"), lightingBright: byId("lightingBright"),
      lightingFull: byId("lightingFull"), lightingStatus: byId("lightingStatus"),
      cameraNative: byId("cameraNative"), cameraFirst: byId("cameraFirst"), cameraNear: byId("cameraNear"),
      cameraForward: byId("cameraForward"), cameraForwardValue: byId("cameraForwardValue"),
      cameraVertical: byId("cameraVertical"), cameraVerticalValue: byId("cameraVerticalValue"), cameraStatus: byId("cameraStatus"),
      cameraSyncPicking: byId("cameraSyncPicking"), cameraHideSelfTag: byId("cameraHideSelfTag"),
      cameraTagOffset: byId("cameraTagOffset"), cameraTagOffsetValue: byId("cameraTagOffsetValue"),
      selectedBlocks: byId("selectedBlocks"), blockSearch: byId("blockSearch"), searchResults: byId("searchResults"),
      opacity: byId("opacity"), previewLoading: byId("previewLoading"), previewVendCard: byId("previewVendCard"),
      diagnostics: byId("diagnostics"), resetButton: byId("resetButton"),
      finder: byId("finder"), finderTitle: byId("finderTitle"), finderSummary: byId("finderSummary"),
      finderRows: byId("finderRows"), finderSearch: byId("finderSearch"), finderSearchResults: byId("finderSearchResults"),
      finderSelectedBlocks: byId("finderSelectedBlocks"), clearBlocks: byId("clearBlocks"),
      closeFinder: byId("closeFinder"), plannerButton: byId("plannerButton"),
      foundButton: byId("foundButton"), hudFound: byId("hudFound"),
      copyFlash: byId("copyFlash"), chatCopy: byId("chatCopy"), chatCopyHead: byId("chatCopyHead"),
      chatCopyRows: byId("chatCopyRows"), chatCopyAll: byId("chatCopyAll"), closeChatCopy: byId("closeChatCopy"),
      favorites: byId("favorites"), favoritesHead: byId("favoritesHead"), closeFavorites: byId("closeFavorites"), favoriteButton: byId("favoriteButton"),
      favoriteRows: byId("favoriteRows"), favoriteStatus: byId("favoriteStatus"),
      favoriteCurrent: byId("favoriteCurrent"), favoriteTyped: byId("favoriteTyped"),
      plotPanel: byId("plotPanel"), plotHead: byId("plotHead"),
      plotBx: byId("plotBx"), plotBy: byId("plotBy"), plotBz: byId("plotBz"),
      keepBadge: byId("keepBadge"), keepTarget: byId("keepTarget"),
      keepButton: byId("keepButton"), keepStatus: byId("keepStatus"),
      keepTestButton: byId("keepTestButton"),
      toast: byId("toast"), toastTimer: null
    };
    bindUi();
    applyConfigToUi();
    renderSearchResults();
    renderFinder();
    renderMarketSearch();
    if (loadingPending) showLoading(loadingTransport);
    console.info("[CC Browser Mods] installed — Shift+F3 lighting, F5 camera, F6 favorites, F7 market, F8 break/build, F9 finder, F10 planner, F12 HUD, ↑/↓ chat history, Ctrl+C copy chat");
  }

  if (document.documentElement) buildUi();
  else new MutationObserver((_, observer) => {
    if (document.documentElement) {
      observer.disconnect();
      buildUi();
    }
  }).observe(document, { childList: true });

  function modEditorFromEvent(event) {
    if (!ui) return null;
    const path = event.composedPath ? event.composedPath() : [event.target];
    return path.find(node => node === ui.blockSearch || node === ui.finderSearch ||
      node === ui.favoriteTyped || node === ui.marketSearch ||
      Object.keys(plotInputKeys).some(id => node === ui[id])) || null;
  }

  // --- Paste into the game's own text boxes (chat, realm search, names…) ----
  // The game draws its text boxes inside the canvas and has no clipboard
  // support. Ctrl+V outside a real text field: keep the game from cancelling
  // the keystroke (so the browser fires a real "paste"), then type the text in
  // as ordinary keystrokes — the game's Emscripten key handlers read
  // key / code / charCode / keyCode. One line, printable characters only, so a
  // pasted newline can never press Enter (send) for you.
  const PASTE_MAX = 200;
  function isTextField(node) {
    return !!node && node.nodeType === 1 && (node.isContentEditable ||
      node.tagName === "TEXTAREA" || (node.tagName === "INPUT" &&
      !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(node.type)));
  }
  const fromTextField = event => isTextField((event.composedPath ? event.composedPath() : [event.target])[0]);

  function keyFields(ch) {
    if (ch === " ") return { key: " ", code: "Space", keyCode: 32, shiftKey: false };
    const upper = ch.toUpperCase();
    if (/[a-z]/i.test(ch)) return { key: ch, code: `Key${upper}`, keyCode: upper.charCodeAt(0), shiftKey: ch !== ch.toLowerCase() };
    if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, keyCode: ch.charCodeAt(0), shiftKey: false };
    return { key: ch, code: "", keyCode: 0, shiftKey: false };
  }

  // Keys we hand the game (paste, chat history) go one every 12 ms, like
  // fast typing, through one queue so they never interleave.
  const keyQueue = [];
  let keyTimer = null;
  function gameKeyTarget() {
    const active = document.activeElement;
    return active && active !== (ui && ui.host) ? active : document.body;
  }
  function pumpKeys() {
    keyTimer = null;
    const press = keyQueue.shift();
    if (!press) return;
    press(gameKeyTarget());
    keyTimer = setTimeout(pumpKeys, 12);
  }
  function queueKeys(presses) {
    keyQueue.push(...presses);
    if (!keyTimer) pumpKeys();
  }
  function clearKeyQueue() {
    keyQueue.length = 0;
  }
  function pressChar(target, ch) {
    const f = keyFields(ch);
    const base = { key: f.key, code: f.code, shiftKey: f.shiftKey, bubbles: true, cancelable: true, composed: true };
    target.dispatchEvent(new KeyboardEvent("keydown", { ...base, keyCode: f.keyCode, which: f.keyCode }));
    target.dispatchEvent(new KeyboardEvent("keypress", { ...base, charCode: ch.charCodeAt(0),
      keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0) }));
    target.dispatchEvent(new KeyboardEvent("keyup", { ...base, keyCode: f.keyCode, which: f.keyCode }));
  }
  function pressBackspace(target) {
    const base = { key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
                   bubbles: true, cancelable: true, composed: true };
    target.dispatchEvent(new KeyboardEvent("keydown", base));
    target.dispatchEvent(new KeyboardEvent("keyup", base));
  }

  // Returns the text that will be typed.
  function typeIntoGame(text) {
    const chars = Array.from(String(text).replace(/[\r\n\t]+/g, " ").trim())
      .filter(ch => ch >= " " && ch <= "~").slice(0, PASTE_MAX);
    queueKeys(chars.map(ch => target => pressChar(target, ch)));
    return chars.join("");
  }

  window.addEventListener("keydown", event => {
    if (event.isTrusted && (event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyV" &&
        !fromTextField(event)) {
      event.stopImmediatePropagation();   // let the browser's own paste happen
    }
  }, true);
  window.addEventListener("paste", event => {
    if (fromTextField(event)) return;     // real text boxes paste normally
    const text = event.clipboardData && event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const typed = typeIntoGame(text);
    if (chatHistory) chatHistory.inserted(typed);
  }, true);

  // --- ↑ / ↓ in the game's chat box: the lines you sent before -------------
  // The box is open between tx 0x0031 01 and 0x0031 00 (see handleDecoderEvents);
  // only then are the arrows taken from the game. Your own keys keep the
  // history's copy of the box up to date so a recall erases exactly that.
  function chatClosed() {
    if (chatCmds) chatCmds.closed();
    if (!chatHistory || !chatHistory.state.open) return;
    chatHistory.closed();
    clearKeyQueue();                      // never type leftovers into the world
    renderChatSuggest();
  }

  // --- chat command suggestions over the game's chat box (cc-browser-qol.js)
  // one line (text, tone), or several: text = [{text, tone}, ...] (a /search)
  function showChatNote(text, tone, ms = 5000) {
    if (!text || (Array.isArray(text) && !text.length)) return;
    const lines = Array.isArray(text) ? text : [{ text, tone: tone || "info" }];
    chatNote = { lines, until: Date.now() + ms };
    renderChatSuggest();
    setTimeout(renderChatSuggest, ms + 100);
  }
  function renderChatSuggest() {
    if (!ui || !ui.chatSuggest) return;
    const on = chatCmds && chatHistory && config.chatCommands !== false;
    const list = on ? chatCmds.wantList(chatHistory.state.open, chatHistory.state.box) : null;
    if (list) askRealmList(list);
    const s = on ? chatCmds.suggest(chatHistory.state.open, chatHistory.state.box)
                 : { items: [], sel: 0, hint: null };
    const rows = s.items.map((item, i) => ({ ...item, sel: i === s.sel && item.tone === "name" }));
    if (rows.length && s.hint) rows.push({ text: s.hint, tone: "hint" });
    if (chatNote && Date.now() < chatNote.until) rows.push(...chatNote.lines);
    const box = ui.chatSuggest;
    box.textContent = "";
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "chat-suggest-row";
      row.dataset.tone = r.tone;
      if (r.sel) row.dataset.sel = "1";
      row.textContent = r.text;
      box.append(row);
    }
    box.classList.toggle("show", rows.length > 0);
    if (!rows.length) return;
    // the game draws its chat box in the canvas' bottom-left corner
    const canvas = document.getElementById("canvas");
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, bottom: window.innerHeight };
    box.style.left = `${Math.round(rect.left + 12)}px`;
    box.style.bottom = `${Math.round(window.innerHeight - rect.bottom + 64)}px`;
  }
  function saveChatHistory() {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory.state.lines));
    } catch (_) {
      // storage blocked: history lasts until the page reloads
    }
  }
  const recallKeysDown = new Set();
  window.addEventListener("keydown", event => {
    if (!chatHistory || !event.isTrusted || modEditorFromEvent(event) || fromTextField(event)) return;
    const key = event.key;
    if (key === "Tab" && chatCmds && config.chatCommands !== false && chatHistory.state.open &&
        !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const step = chatCmds.tab(chatHistory.state.box, chatHistory.state.sure, Qol.CHAT_MAX);
      if (step) {
        event.preventDefault();
        event.stopImmediatePropagation();
        recallKeysDown.add(event.code);
        queueKeys(Array(step.erase).fill(pressBackspace)
          .concat(Array.from(step.type, ch => target => pressChar(target, ch))));
        chatHistory.replaced(step.box);
        renderChatSuggest();
        return;
      }
    }
    if ((key === "ArrowUp" || key === "ArrowDown") && chatHistory.state.open &&
        !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const step = chatHistory.recall(key === "ArrowUp" ? -1 : 1);
      if (!step) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      recallKeysDown.add(event.code);
      queueKeys(Array(step.erase).fill(pressBackspace)
        .concat(Array.from(step.type, ch => target => pressChar(target, ch))));
      renderChatSuggest();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      if (key === "Backspace") chatHistory.backspace(true);
      else if (event.code !== "KeyV") chatHistory.unsure();     // Ctrl+V = the paste above
    } else if (key === "Backspace") {
      chatHistory.backspace(false);
    } else if (key.length === 1) {
      chatHistory.typed(key);
    } else if (/^(ArrowLeft|ArrowRight|Home|End|Delete)$/.test(key)) {
      chatHistory.unsure();
    }
    if (chatHistory.state.open) renderChatSuggest();
  }, true);
  window.addEventListener("keyup", event => {
    if (recallKeysDown.delete(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener("keydown", event => {
    const editor = modEditorFromEvent(event);
    if (editor) {
      // The WebGL client installs a window-level keyboard handler which was
      // preventing normal typing in our Shadow-DOM inputs. Because this hook is
      // installed at document_start, stop the later game listeners while
      // preserving the browser's default text-editing action.
      event.stopImmediatePropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        if (editor === ui.favoriteTyped) {
          const name = editor.value.trim();
          if (addFavorite(name)) {
            toast(`Added ${name} ★`, "good");
            editor.value = "";
          }
        } else if (Object.keys(plotInputKeys).some(id => editor === ui[id])) {
          savePlotInputs();
        } else if (editor === ui.marketSearch) {
          const listing = VendCore && VendCore.searchListings(priceBook, editor.value, 1)[0];
          if (listing) goToListing(listing);
          else if (editor.value.trim()) toast(`No vending listing matched “${editor.value.trim()}”`);
        } else {
          addFirstSearchMatch(editor);
        }
      }
      return;
    }
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "F3" && event.shiftKey) {
      event.preventDefault();
      setLightingMode((Number(config.lightingMode) + 1) % 3);
    } else if (event.key === "F5") {
      event.preventDefault();
      setCameraMode((Number(config.cameraMode) + 1) % 3);
    } else if (event.key === "F6") {
      event.preventDefault();
      favoritesVisible = !favoritesVisible;
      renderFavorites();
    } else if (event.key === "F7") {
      event.preventDefault();
      marketVisible = !marketVisible;
      renderMarketSearch();
      if (marketVisible) setTimeout(() => ui.marketSearch.focus(), 0);
    } else if (event.key === "F8") {
      event.preventDefault();
      config.multiAction = config.multiAction === "build" ? "break" : "build";
      saveConfig();
      toast(`Multi-block action: ${config.multiAction.toUpperCase()}`, "good");
    } else if (event.key === "F10") {
      event.preventDefault();
      setMultiPreview(!config.multiPreview);
    } else if (event.key === "F12") {
      event.preventDefault();
      config.hudVisible = !config.hudVisible;
      saveConfig();
      updateHud();
    }
  }, true);

  for (const type of ["keypress", "keyup"]) {
    window.addEventListener(type, event => {
      if (modEditorFromEvent(event)) event.stopImmediatePropagation();
    }, true);
  }

  const fromModUi = event => !!ui && (event.composedPath ? event.composedPath() : []).includes(ui.host);
  window.addEventListener("mousedown", event => {
    if (event.button === 0 && !fromModUi(event)) leftMouseHeld = true;
  }, true);
  window.addEventListener("mouseup", event => {
    if (event.button === 0) leftMouseHeld = false;
  }, true);
  window.addEventListener("blur", () => { leftMouseHeld = false; });

  window.addEventListener("pointermove", event => {
    pointerPosition = { x: event.clientX, y: event.clientY };
  }, true);

  let frameCount = 0;
  let lastFpsTime = performance.now();
  function countFrame(now) {
    frameCount += 1;
    const elapsed = now - lastFpsTime;
    if (elapsed >= 1000) {
      fps = frameCount * 1000 / elapsed;
      frameCount = 0;
      lastFpsTime = now;
      updateHud();
    }
    renderMultiPreview(now);
    if (nameHider) nameHider.tick();
    requestAnimationFrame(countFrame);
  }
  requestAnimationFrame(countFrame);
})();
