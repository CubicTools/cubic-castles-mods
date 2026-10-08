/*
 * Custom Escape menu for the browser client (castles.cc) — the same menu
 * cubic-mods.exe draws inside the Steam client (stage2/mods/cc_menu.py).
 *
 * Press Escape as usual: when the game opens its ring of bubbles (a
 * RadialMenu), we redraw only those buttons in the same places. The world
 * stays visible and the familiar radial layout stays intact; each button gets
 * a cleaner halo, hover treatment and readable caption. Picking one clicks
 * the game's own bubble (a mouse click on the canvas, right on it), so what
 * happens is exactly the game's, our Friends / Profile / Cubit Store / Perks
 * windows included. Escape or a click away from the buttons closes the menu.
 *
 * The web build's memory layout is checked before anything is trusted: the
 * game's active menu (CCWasmFriendsHook.activeMenu) must hold a button list
 * whose every button has an id we know, a sane angle and distance, and a
 * centre on the canvas — the same layout as Cubic.exe's RadialMenu (see
 * cc_ingame_agent.js "escape menu"): list = {count +8, handles +0x14}, then
 * state +0x2c, open +0x30, centre +0x44 / +0x48 from the list. If it doesn't
 * check out, the game's own menu is left alone.
 *
 * buildRows() is the same as cc_menu.build_rows (node tests: test-menu.js).
 */
(function installMenu(root, factory) {
  const node = typeof module === "object" && module.exports;
  const lib = node ? { profile: require("./cc-browser-profile.js"), perks: require("./cc-browser-perks.js") }
    : { profile: root && root.CCProfileLib, perks: root && root.CCPerksLib };
  const api = factory(root, lib);
  if (node) module.exports = api;
  if (root && root.document && lib.profile && lib.perks) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function makeMenu(root, Lib) {
  "use strict";

  const RED = "#ef4444", DIM = "#b3aed6";
  const APPS_PER_ROW = 4;
  // id -> [name, what it's for, colour, UI.bundle record of its bubble, bubble size] (cc_menu.BUTTONS)
  const BUTTONS = {
    16: ["Profile", "Level, XP, swirls", "#3b6fe0", 142, 138],
    19: ["Perks", "Spend your stars", "#e0a800", 140, 122],
    1: ["Outfit", "Change what you wear", "#1fa3e0", 139, 122],
    15: ["Quests", "What to do next", "#2fb344", 143, 122],
    2: ["Friends", "Who's online", "#8e5cd9", 132, 122],
    17: ["Friend code", "Let people add you", "#a26ee6", 131, 92],
    4: ["Cubit Store", "Packs and items", "#f2c200", 156, 190],
    6: ["Realm setup", "Your realm's settings", "#36b6a5", 146, 162],
    5: ["Sky map", "The map of the sky", "#3fb06a", 153, 122],
    18: ["Rules", "Cubic Castles rules", "#e04848", 149, 122],
    14: ["Report abuse", "Report a player", "#c43c3c", 148, 122],
    3: ["Leave realm", "Back out of this realm", "#b8912e", 128, 92],
    12: ["Quit", "Close Cubic Castles", "#d64545", 144, 92],
  };
  const ORDER = [16, 19, 1, 15, 2, 17, 4, 6, 5, 18, 14, 3, 12];
  const PRESS_WAIT_MS = 2500;

  const { initial } = Lib.profile;
  const Perks = Lib.perks;

  // ------------------------------------------------------------------ rows
  function starsToSpend(p) {
    if (!p || p.level == null) return 0;
    const st = Perks.walk(Perks.GRID, p.level, p.farmLevel, p.perks);
    return st.yellow + st.green;
  }
  function buildRows(ids, p = null) {
    const present = ORDER.filter(i => ids.includes(i)).concat(ids.filter(i => !(i in BUTTONS)).sort((a, b) => a - b));
    const stars = starsToSpend(p), apps = [];
    for (const bid of present) {
      const [name, sub, color] = BUTTONS[bid] || [`Button ${bid}`, "", "#7c76a6"];
      const app = { id: `app:${bid}`, bid, text: name, sub, color, initial: initial(name) };
      if (bid === 19 && stars) app.badge = String(stars);
      apps.push(app);
    }
    if (!apps.length) return [{ kind: "note", text: "The game's menu has no buttons." }];
    const rows = [];
    for (let k = 0; k < apps.length; k += APPS_PER_ROW) rows.push({ kind: "apps", apps: apps.slice(k, k + APPS_PER_ROW) });
    return rows;
  }
  function subtitle(p) {
    if (!p) return "Cubic Castles";
    const parts = [];
    if (p.name) parts.push(p.name);
    if (p.level != null) parts.push(`Level ${p.level}`);
    return parts.join(" · ") || "Cubic Castles";
  }
  function chipText(p) {
    const n = starsToSpend(p);
    return n ? `${n} star${n === 1 ? "" : "s"} to spend` : null;
  }

  // ------------------------------------------------------------------ the game's menu
  // The RadialMenu at `menu`, read from the game's memory, or null if anything
  // doesn't look like Cubic.exe's layout. vecAt = where its button list sits
  // (found once, then reused).
  function readRadial(buffer, menu, vecAt = null) {
    const view = new DataView(buffer), size = view.byteLength;
    const u32 = a => (a >= 0 && a + 4 <= size ? view.getUint32(a, true) : 0);
    const f32 = a => (a >= 0 && a + 4 <= size ? view.getFloat32(a, true) : NaN);
    const tryAt = vec => {
      const count = u32(menu + vec + 8), arr = u32(menu + vec + 0x14);
      if (count < 3 || count > 24 || !arr || arr + count * 4 > size) return null;
      const buttons = [], seen = new Set();
      for (let i = 0; i < count; i += 1) {
        const h = u32(arr + i * 4), b = h ? u32(h) : 0;
        if (!b) return null;
        const id = u32(b), angle = f32(b + 4), dist = f32(b + 8);
        if (!(id in BUTTONS) || seen.has(id) || !(angle >= -720 && angle <= 720) || !(dist >= 20 && dist <= 2000)) return null;
        seen.add(id);
        buttons.push({ id, angle, dist });
      }
      const state = u32(menu + vec + 0x2c) & 0xff, open = f32(menu + vec + 0x30);
      const cx = f32(menu + vec + 0x44), cy = f32(menu + vec + 0x48);
      if (state > 3 || !(open >= 0 && open <= 1.001) || !(cx >= 0 && cx <= 8192) || !(cy >= 0 && cy <= 8192)) return null;
      return { vec, buttons, state, open, cx, cy };
    };
    if (!menu) return null;
    if (vecAt != null) return tryAt(vecAt);
    for (let vec = 0x60; vec <= 0x140; vec += 4) {
      const r = tryAt(vec);
      if (r) return r;
    }
    return null;
  }
  // where on the canvas (client pixels) the game draws bubble `id`:
  // centre + (sin, -cos)(angle) * dist * open, in the canvas's own pixels
  function bubbleAt(radial, id, canvasRect, canvasW, canvasH) {
    const b = radial.buttons.find(x => x.id === id);
    if (!b || !canvasW || !canvasH) return null;
    const t = b.angle * Math.PI / 180, r = b.dist * radial.open;
    const gx = radial.cx + Math.sin(t) * r, gy = radial.cy - Math.cos(t) * r;
    if (!(gx >= 0 && gx <= canvasW && gy >= 0 && gy <= canvasH)) return null;
    return { x: canvasRect.left + gx * canvasRect.width / canvasW, y: canvasRect.top + gy * canvasRect.height / canvasH };
  }

  // ------------------------------------------------------------------ model
  function createMenuModel() {
    const s = { open: false, ids: [], p: null, status: null };
    return {
      state: s,
      opened(ids) { s.open = true; s.ids = ids.slice(); s.status = null; },
      closed() { s.open = false; },
      gameEvent(ev) {
        const p = s.p || { name: null, level: null, farmLevel: null, perks: [] };
        if (ev.type === "self_profile") {
          s.p = { ...p, name: ev.name || p.name, level: ev.level, farmLevel: ev.farmLevel, perks: Array.from(ev.perks || []) };
        } else if (ev.type === "xp") s.p = { ...p, level: ev.level };
        else if (ev.type === "perks") s.p = { ...p, perks: Array.from(ev.perks || []) };
        else return false;
        return true;
      },
      say(text, tone) { s.status = { text, tone: tone || DIM }; },
      view() {
        return { title: "Menu", subtitle: subtitle(s.p), chip: chipText(s.p),
          status: s.status ? s.status.text : "Everything here is the game's own button",
          statusColor: s.status ? s.status.tone : DIM, rows: buildRows(s.ids, s.p) };
      }
    };
  }

  // ------------------------------------------------------------------ window
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483646; display: none; align-items: stretch;
      justify-content: stretch; background: rgba(10,6,24,.08);
      font: 600 15px/1.3 "Segoe UI", system-ui, sans-serif; color: #fff; }
    .backdrop.show { display: flex; }
    .win { position: fixed; inset: 0; pointer-events: none; }
    .head { position: relative; display: none; align-items: center; gap: 14px; padding: 14px 22px; flex: none;
      min-height: 98px; background: linear-gradient(90deg,#ff4fb8,#9b5cf6,#3b82f6,#22d3ee,#9b5cf6,#ff4fb8);
      background-size: 300% 100%; animation: slide 14s linear infinite; }
    .head::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 40%;
      background: rgba(0,0,0,.12); pointer-events: none; }
    @keyframes slide { from { background-position: 0% 0; } to { background-position: 300% 0; } }
    .titles { flex: 1; min-width: 0; z-index: 1; }
    .title { font: 800 34px/1.1 "Segoe UI", system-ui, sans-serif; text-shadow: 0 2px 3px rgba(0,0,0,.45); }
    .subtitle { font-size: 18px; opacity: .93; text-shadow: 0 1px 2px rgba(0,0,0,.45); }
    .pill { z-index: 1; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px;
      border-radius: 18px; background: rgba(0,0,0,.2); font-size: 16px; white-space: nowrap; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #ffc53d; animation: breathe 1.6s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scale(1.3); } }
    .close { z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
      background: rgba(255,255,255,.22); color: #fff; font: 700 22px/1 "Segoe UI", sans-serif; }
    .close:hover { background: #ef4444; }
    .grid { position: fixed; inset: 0; pointer-events: none; }
    .app { --d: 104px; position: absolute; left: var(--x, 50%); top: var(--y, 50%); width: calc(var(--d) + 40px);
      display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 0; pointer-events: auto;
      border: 0; background: transparent; color: #fff; cursor: pointer; font: inherit;
      transform: translate(-50%,-50%); transition: transform .14s ease, filter .14s ease;
      animation: bloom .18s ease-out both; }
    @keyframes bloom { from { opacity: 0; transform: translate(-50%,-42%) scale(.72); }
      to { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
    .app:hover { transform: translate(-50%,-53%) scale(1.08); filter: brightness(1.12); z-index: 2; }
    .pic { position: relative; width: var(--d); height: var(--d); flex: none; display: flex; align-items: center;
      justify-content: center; border-radius: 50%; background: rgba(16,12,36,.78);
      border: 3px solid color-mix(in srgb, var(--c) 78%, white);
      box-shadow: 0 9px 24px rgba(0,0,0,.45), 0 0 0 5px rgba(255,255,255,.76),
        0 0 0 8px color-mix(in srgb, var(--c) 45%, transparent), inset 0 2px 8px rgba(255,255,255,.22);
      transition: box-shadow .14s ease; }
    .pic::before { content: ""; position: absolute; inset: -14px; border-radius: 50%; background: var(--c);
      opacity: .12; filter: blur(10px); transition: opacity .14s ease; }
    .app:hover .pic { box-shadow: 0 13px 30px rgba(0,0,0,.5), 0 0 0 5px #fff,
        0 0 0 10px color-mix(in srgb, var(--c) 76%, transparent), 0 0 30px var(--c); }
    .app:hover .pic::before { opacity: .3; }
    .pic img { position: relative; width: calc(var(--d) - 10px); height: calc(var(--d) - 10px); object-fit: contain;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); transition: transform .14s ease; }
    .app:hover .pic img { transform: scale(1.05); }
    .bubble { position: relative; width: calc(var(--d) - 20px); height: calc(var(--d) - 20px); border-radius: 50%; background: var(--c); display: flex;
      align-items: center; justify-content: center; font: 800 32px "Segoe UI", sans-serif;
      box-shadow: inset -6px -8px 12px rgba(0,0,0,.15), inset 6px 6px 10px rgba(255,255,255,.2); }
    .name { max-width: 142px; padding: 5px 12px 6px; border: 1px solid rgba(255,255,255,.16); border-radius: 14px;
      background: rgba(16,12,36,.84); box-shadow: 0 5px 14px rgba(0,0,0,.34); font: 750 15px/1 "Segoe UI", sans-serif;
      text-shadow: 0 1px 2px rgba(0,0,0,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { display: none; }
    .badge { position: absolute; top: -4px; right: 7px; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 13px;
      background: #ffc53d; color: #1a1534; font: 800 15px/26px "Segoe UI", sans-serif; box-shadow: 0 0 12px rgba(255,197,61,.7); }
    .note { padding: 18px 8px; text-align: center; color: #b3aed6; font-size: 18px; grid-column: 1 / -1; }
    .foot { flex: none; display: none; align-items: center; gap: 12px; padding: 10px 22px 14px; }
    .toast { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 16px; border-radius: 18px;
      font-size: 16px; color: var(--t); background: color-mix(in srgb, var(--t) 18%, transparent); max-width: 70%;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toast::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--t); }
    .hint { margin-left: auto; color: #7c76a6; font-size: 15px; white-space: nowrap; }
  `;
  const esc = text => String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // icons = {button id: URL} (our text-free symbol art) or {}
  function renderApps(rows, icons = {}, positions = {}) {
    if (rows.length && rows[0].kind === "note") return `<div class="note">${esc(rows[0].text)}</div>`;
    return rows.flatMap(r => r.apps).map(a => {
      const p = positions[a.id];
      const at = p ? `;--x:${p.x.toFixed(1)}px;--y:${p.y.toFixed(1)}px;--d:${p.d.toFixed(1)}px` : "";
      return `<button class="app app-${a.bid}" style="--c:${a.color}${at}" data-id="${esc(a.id)}">` +
      `<div class="pic">${icons[a.bid] ? `<img src="${icons[a.bid]}" alt="">` : `<div class="bubble">${esc(a.initial)}</div>`}</div>` +
      `<div class="name">${esc(a.text)}</div><div class="sub">${esc(a.sub)}</div>` +
      (a.badge ? `<span class="badge">${esc(a.badge)}</span>` : "") + "</button>";
    }).join("");
  }

  // ------------------------------------------------------------------ page glue
  function install(win) {
    if (win.CCMenu) return;
    const doc = win.document;
    const model = createMenuModel();
    let enabled = true, host = null, dom = null, icons = {}, customIcons = false, iconsTried = false, currentRadial = null;
    let current = 0, seen = 0, vecAt = null, pending = null;
    const stats = { opens: 0, presses: 0, passed: 0, fails: 0, error: null };

    function build() {
      if (host || !doc.documentElement) return;
      host = doc.createElement("div");
      host.id = "cc-menu-host";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${CSS}</style>
        <div class="backdrop" id="backdrop"><div class="win" id="win">
          <div class="head"><div class="titles"><div class="title">Menu</div><div class="subtitle" id="subtitle"></div></div>
            <div class="pill" id="chip"><span class="dot"></span><span id="chipText"></span></div>
            <button class="close" id="close" title="Close (Esc)">×</button></div>
          <div class="grid" id="grid"></div>
          <div class="foot"><div class="toast" id="toast"></div><div class="hint">Click to open · Esc closes</div></div>
        </div></div>`;
      const $ = id => shadow.getElementById(id);
      dom = { backdrop: $("backdrop"), win: $("win"), subtitle: $("subtitle"), chip: $("chip"), chipText: $("chipText"),
        close: $("close"), grid: $("grid"), toast: $("toast") };
      (doc.body || doc.documentElement).appendChild(host);
      for (const type of ["mousedown", "mouseup", "click", "dblclick", "wheel", "pointerdown",
        "pointerup", "contextmenu", "touchstart", "touchend"]) {
        dom.backdrop.addEventListener(type, event => event.stopPropagation());
      }
      dom.backdrop.addEventListener("mousedown", event => { if (event.target === dom.backdrop) close("outside"); });
      dom.close.addEventListener("click", () => close("button"));
      dom.grid.addEventListener("click", event => {
        const el = event.target.closest && event.target.closest("[data-id]");
        if (el) pick(Number(String(el.dataset.id).split(":")[1]));
      });
    }
    function render() {
      if (!dom || !model.state.open) return;
      const v = model.view();
      dom.subtitle.textContent = v.subtitle;
      dom.chip.style.display = v.chip ? "" : "none";
      dom.chipText.textContent = v.chip || "";
      dom.grid.innerHTML = renderApps(v.rows, icons, radialPositions(currentRadial));
      dom.toast.textContent = v.status;
      dom.toast.style.setProperty("--t", v.statusColor);
    }
    function radialPositions(radial) {
      const canvas = doc.getElementById("canvas"), out = {};
      if (!radial || !canvas) return out;
      const rect = canvas.getBoundingClientRect(), full = { ...radial, open: 1 };
      const canvasScale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
      for (const b of radial.buttons) {
        const p = bubbleAt(full, b.id, rect, canvas.width, canvas.height);
        if (!p) continue;
        const spriteSize = (BUTTONS[b.id] && BUTTONS[b.id][4]) || 122;
        // Match the game's own size hierarchy (notably its larger Cubit Store)
        // while keeping very small browser panels usable.
        const d = Math.max(88, Math.min(174, spriteSize * canvasScale));
        const halfW = d / 2 + 20, halfH = d / 2 + 30;
        out[`app:${b.id}`] = {
          x: Math.max(halfW, Math.min(win.innerWidth - halfW, p.x)),
          // The DOM button includes its caption below the circle, so its box
          // centre sits a little below the game's bubble centre.
          y: Math.max(halfH, Math.min(win.innerHeight - halfH, p.y + 18)),
          d,
        };
      }
      return out;
    }
    function ensureIcons() {
      if (customIcons || iconsTried || !Perks.loadAtlas) return;
      iconsTried = true;
      Perks.loadAtlas(win).then(({ recs, cut }) => {
        const out = {};
        for (const [bid, info] of Object.entries(BUTTONS)) {
          const r = recs[info[3]];
          if (r && r[4] === info[4] && r[5] === info[4]) out[bid] = cut(r);
        }
        if (!customIcons) icons = out;
        render();
      }).catch(error => { iconsTried = false; stats.error = String(error && error.message || error); });
    }
    function show(radial) {
      build();
      if (!dom) return;
      for (const other of [win.CCFriends, win.CCProfile, win.CCStore, win.CCPerks]) if (other && typeof other.close === "function") other.close();
      currentRadial = radial;
      model.opened(radial.buttons.map(b => b.id));
      dom.backdrop.classList.add("show");
      ensureIcons();
      render();
    }
    function hide() {
      if (!dom || !model.state.open) return;
      model.closed();
      currentRadial = null;
      dom.backdrop.classList.remove("show");
      const canvas = doc.getElementById("canvas");
      if (canvas) canvas.focus();
    }
    // Escape, like the friends window: keydown, then keyup a little later (the
    // game reads keys once a frame)
    function gameKey(key, code) {
      const canvas = doc.getElementById("canvas");
      if (!canvas) return;
      const fire = type => {
        const ev = new win.KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
        Object.defineProperty(ev, "keyCode", { get: () => code });
        Object.defineProperty(ev, "which", { get: () => code });
        ev.__ccSynthetic = true;
        canvas.dispatchEvent(ev);
      };
      fire("keydown");
      win.setTimeout(() => fire("keyup"), 120);
    }
    function close() {
      if (!model.state.open) return;
      hide();
      if (current && !pending) gameKey("Escape", 27);       // close the game's menu with nothing picked
    }
    function pick(id) {
      if (!current || pending || !model.state.ids.includes(id)) return;
      pending = { id, at: Date.now(), menu: current };
      hide();
      tryPress();
    }
    // click the game's own bubble once its menu is fully open
    function tryPress() {
      const p = pending;
      if (!p) return;
      const memory = win.CCWasmMemory, canvas = doc.getElementById("canvas");
      const radial = memory && readRadial(memory.buffer, p.menu, vecAt);
      if (!radial || !canvas) return fail("the game's menu moved");
      if (radial.state !== 0 || radial.open < 1) {
        if (Date.now() - p.at > PRESS_WAIT_MS) return fail("the game's menu never finished opening");
        win.setTimeout(tryPress, 50);
        return;
      }
      const at = bubbleAt(radial, p.id, canvas.getBoundingClientRect(), canvas.width, canvas.height);
      if (!at) return fail(`button ${p.id} isn't on the canvas`);
      pending = null;
      const mouse = (type, buttons) => canvas.dispatchEvent(new win.MouseEvent(type, {
        clientX: at.x, clientY: at.y, button: 0, buttons, bubbles: true, cancelable: true, view: win }));
      mouse("mousemove", 0);
      win.setTimeout(() => {
        mouse("mousedown", 1);
        win.setTimeout(() => { mouse("mouseup", 0); doc.dispatchEvent(new win.MouseEvent("mouseup", { clientX: at.x, clientY: at.y, bubbles: true })); }, 90);
        stats.presses += 1;
      }, 40);
    }
    function fail(why) {
      pending = null;
      stats.fails += 1;
      stats.error = why;
      console.warn("[CC menu] the game's button wasn't pressed:", why);
    }
    // watch the game open / close its menu
    function poll() {
      const hook = win.CCWasmFriendsHook, memory = win.CCWasmMemory;
      const menu = hook && typeof hook.activeMenu === "function" ? hook.activeMenu() : 0;
      if (!menu) {
        seen = 0;
        if (current) { current = 0; pending = null; hide(); }
        return;
      }
      if (menu === current || menu === seen) return;
      seen = menu;
      current = 0;
      if (!enabled || !memory) { stats.passed += 1; return; }
      const radial = readRadial(memory.buffer, menu, vecAt) || readRadial(memory.buffer, menu);
      if (!radial) { stats.passed += 1; stats.error = "the game's menu doesn't look like Cubic.exe's"; return; }
      vecAt = radial.vec;
      current = menu;
      stats.opens += 1;
      show(radial);
    }
    win.setInterval(poll, 60);
    win.addEventListener("resize", () => { if (model.state.open) render(); });

    // While open nothing typed reaches the game (key releases still do).
    win.addEventListener("keydown", event => {
      if (!model.state.open || event.__ccSynthetic) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (event.key === "Escape") close("escape");
    }, true);

    win.CCMenu = {
      onEvent(event) { if (model.gameEvent(event) && model.state.open) render(); },
      setEnabled(on) {
        enabled = on !== false;
        if (!enabled && model.state.open) { hide(); current = 0; }
      },
      setIcons(next) {
        if (!next || typeof next !== "object") return;
        icons = { ...next };
        customIcons = Object.keys(icons).length > 0;
        if (customIcons) iconsTried = true;
        render();
      },
      close,
      status: () => ({ enabled, open: model.state.open, current, vecAt, icons: Object.keys(icons).length, ...stats })
    };
  }

  return { BUTTONS, ORDER, buildRows, subtitle, chipText, starsToSpend, readRadial, bubbleAt, createMenuModel,
    renderApps, install };
});
