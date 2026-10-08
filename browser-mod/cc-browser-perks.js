/*
 * Custom perks window for the browser client (castles.cc) — the same window
 * cubic-mods.exe draws inside the Steam client (stage2/mods/cc_perks.py).
 *
 * Opening it: press Escape and click Perks as usual (cc-browser-wasm-friends.js
 * intercepts the game's menu action before its own perk grid is built), or F3.
 *
 *   header: Perks · Level 44 · Farming Level 8 · 66 perks picked [3 stars] [×]
 *   detail: [green 01] [yellow 02] | the selected perk: picture, name, what it
 *           does, what it costs | [Pick]  (then "Pick ...?" YES / NO)
 *   tree:   the game's own tree, laid out like the game's: perk tiles with the
 *           game's icons (rings in their star's colour when taken, pulsing
 *           when you can pick them, dimmed when locked), paths that light up
 *           as far as you've got, star roots (12 / 30 = the level they open)
 *
 * Picking is the game's own pick (see cc_perks.py for the Cubic.exe
 * addresses): the game's grid (grid_clipped.perks, carried here as GRID),
 * walked the game's way from its roots along the pipe cells; stars = level
 * (farming level for farm perks 34-40) minus the cells you've taken; [Pick]
 * only where the game shows its pick button; one "Pick ...?" YES / NO, then
 * exactly the game's message: 0x0141 + i32 x + i32 y.
 *
 * The data is your own network state (cc-browser-core.js): rx 0x0005 for you
 * (level, farming level, perk bytes; sent on every realm join), rx 0x00b1 XP
 * (level), rx 0x00b4 perks. The pictures are cut from the web client's own UI
 * atlas (loadArt); without them the tiles show coloured bubbles.
 *
 * createPerksModel() is the whole state machine with no DOM; its view is the
 * same as cc_perks.build_view (node tests: test-perks.js).
 */
(function installPerks(root, factory) {
  const lib = typeof module === "object" && module.exports ? require("./cc-browser-profile.js")
    : root && root.CCProfileLib;
  const api = factory(root, lib);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document && lib) {
    root.CCPerksLib = api;
    api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function makePerks(root, Lib) {
  "use strict";

  const GREEN = "#3fb950", AMBER = "#f5a524", RED = "#ef4444", CYAN = "#22d3ee",
    DIM = "#b3aed6", FAINT = "#7c76a6";
  const GOLD = "#ffc53d", LEAF = "#73d13d";
  const STAR_COLORS = { yellow: GOLD, green: LEAF };
  const PICK_COLORS = { yellow: "#f5b301", green: "#22c55e" };
  const DIALOG_MS = 60000, PICK_WAIT_MS = 10000;

  const ROOT_LEVELS = { 10: 0, 13: 0, 11: 12, 12: 30 };   // root type -> level it opens at
  const GRID_MAX = 100;
  // where a pipe cell leads (Cubic.exe 0x59c272); roots and taken perks: all four ways
  const ALL_WAYS = [[1, 0], [-1, 0], [0, -1], [0, 1]];
  const PIPES = { 0: [[1, 0], [-1, 0]], 1: [[0, -1], [0, 1]], 2: [[1, 0], [0, 1]],
    3: [[-1, 0], [0, 1]], 4: [[-1, 0], [0, -1]], 5: [[1, 0], [0, -1]],
    6: [[1, 0], [-1, 0], [0, 1]], 7: [[-1, 0], [0, 1], [0, -1]],
    8: [[-1, 0], [1, 0], [0, -1]], 9: [[0, -1], [0, 1], [1, 0]],
    10: ALL_WAYS, 11: ALL_WAYS, 12: ALL_WAYS, 13: ALL_WAYS };

  // The game's grid_clipped.perks (2026-01-07, 11 x 32): every cell that isn't
  // empty, as [x, y, perk, level, type] (cc_perks.BUILTIN_CELLS; the fixture
  // test checks they match).
  const GRID_SIZE = [11, 32];
  const GRID_CELLS = [
    [8, 0, -1, 1, -1], [2, 1, -1, -1, 2], [3, 1, 5, 1, -1], [4, 1, 5, 2, -1],
    [6, 1, -1, -1, 10], [7, 1, -1, -1, 0], [8, 1, 25, 1, -1], [9, 1, 25, 2, 0],
    [2, 2, -1, -1, 1], [0, 3, -1, -1, 10], [1, 3, -1, -1, 0], [2, 3, 0, 1, -1],
    [3, 3, 1, 1, -1], [4, 3, 1, 2, -1], [5, 3, 0, 2, -1], [6, 3, 0, 3, -1], [7, 3, -1, -1, 0],
    [8, 3, 3, 1, -1], [9, 3, 3, 2, -1], [2, 4, -1, -1, 1], [1, 5, 24, 1, -1],
    [2, 5, -1, -1, 8], [3, 5, 6, 1, -1], [4, 5, -1, -1, 0], [5, 5, 4, 1, -1], [6, 5, 4, 2, -1],
    [7, 5, -1, -1, 0], [8, 5, 17, 1, -1], [9, 5, 17, 2, -1], [0, 7, -1, -1, 11],
    [1, 7, -1, -1, 0], [2, 7, 10, 1, -1], [3, 7, -1, -1, 0], [4, 7, 12, 1, -1],
    [5, 7, -1, -1, 0], [6, 7, 23, 1, -1], [7, 7, -1, -1, 0], [8, 7, 2, 1, -1],
    [2, 8, 10, 2, -1], [4, 8, -1, -1, 1], [6, 8, 23, 2, -1], [8, 8, 2, 2, -1],
    [2, 9, -1, -1, 1], [4, 9, 16, 1, -1], [6, 9, 23, 3, -1], [8, 9, 2, 3, -1],
    [2, 10, 15, 1, -1], [4, 10, -1, 1, -1], [8, 10, 2, 4, -1], [0, 12, -1, -1, 12],
    [1, 12, -1, -1, 0], [2, 12, 13, 1, -1], [3, 12, -1, -1, 0], [4, 12, 9, 1, -1],
    [5, 12, -1, -1, 0], [6, 12, 11, 1, -1], [7, 12, -1, -1, 0], [8, 12, 14, 1, -1],
    [2, 13, 13, 2, -1], [4, 13, 9, 2, -1], [6, 13, 11, 2, -1], [8, 13, 14, 2, -1],
    [6, 14, 11, 3, -1], [2, 15, 27, 1, -1], [4, 15, 29, 1, -1], [0, 16, -1, -1, 11],
    [1, 16, -1, -1, 0], [2, 16, 18, 1, -1], [3, 16, -1, -1, 0], [4, 16, -1, -1, 7],
    [6, 16, -1, -1, 11], [7, 16, -1, -1, 0], [8, 16, 26, 1, -1], [9, 16, -1, -1, 0],
    [10, 16, 22, 1, -1], [2, 17, 28, 1, -1], [4, 17, 30, 1, -1], [8, 17, 26, 2, -1],
    [10, 17, 22, 2, -1], [8, 18, 26, 3, -1], [10, 18, 22, 3, -1], [0, 19, 21, 2, -1],
    [1, 19, 21, 1, -1], [2, 19, 20, 1, -1], [3, 19, -1, -1, 0], [4, 19, -1, -1, 12],
    [5, 19, -1, -1, 0], [6, 19, 19, 1, -1], [7, 19, 19, 2, -1], [0, 20, 21, 3, -1],
    [4, 20, -1, -1, 1], [7, 20, 19, 3, -1], [2, 21, 32, 2, -1], [3, 21, 32, 1, -1],
    [4, 21, -1, -1, 8], [5, 21, 31, 1, -1], [6, 21, 31, 2, -1], [2, 22, 32, 3, -1],
    [8, 23, -1, -1, 13], [0, 24, 37, 1, -1], [1, 24, -1, -1, 0], [2, 24, 36, 1, -1],
    [3, 24, -1, -1, 0], [4, 24, 35, 1, -1], [5, 24, -1, -1, 0], [6, 24, 34, 1, 0],
    [7, 24, -1, -1, 0], [8, 24, -1, -1, 4], [0, 25, 37, 2, -1], [2, 25, 36, 2, -1],
    [4, 25, 35, 2, -1], [6, 25, 34, 2, -1], [0, 26, 37, 3, -1], [2, 26, 36, 3, -1],
    [4, 26, 35, 3, -1], [6, 26, 34, 3, -1], [8, 26, -1, 1, -1], [6, 27, 34, 4, -1],
    [7, 27, 34, 5, -1], [7, 28, -1, -1, 1], [2, 29, -1, 1, -1], [3, 29, -1, 3, -1],
    [4, 29, 38, 1, -1], [5, 29, 39, 2, -1], [6, 29, 39, 1, -1], [7, 29, -1, -1, 4],
    [4, 30, 38, 2, -1], [6, 30, 40, 1, -1], [7, 30, 39, 3, 0], [8, 30, 40, 2, -1],
    [4, 31, 38, 3, -1]
  ];

  const PERKS = Lib.PERKS;
  const { initial, perkColor } = Lib;

  // ------------------------------------------------------------------ the grid
  function makeGrid(size = GRID_SIZE, list = GRID_CELLS) {
    const [w, h] = size;
    const cells = Array.from({ length: w * h }, () => [-1, -1, -1]);
    for (const [x, y, pid, level, type] of list) cells[y * w + x] = [pid, level, type];
    return { w, h, cells };
  }
  const GRID = makeGrid();
  function cellAt(grid, x, y) {
    if (!(x >= 0 && x < Math.min(grid.w, GRID_MAX) && y >= 0 && y < Math.min(grid.h, GRID_MAX))) return null;
    return grid.cells[y * grid.w + x] || null;
  }
  // [[x, y, perk, level]] top to bottom, left to right
  function perkCells(grid) {
    const out = [];
    grid.cells.forEach((c, i) => { if (c[0] !== -1) out.push([i % grid.w, Math.floor(i / grid.w), c[0], c[1]]); });
    return out;
  }
  const isFarm = pid => pid >= 34 && pid <= 40;
  const starOf = pid => (isFarm(pid) ? "green" : "yellow");
  // the WHOLE perk byte (0x80 = switched off included) against the cell's level
  const have = (perks, pid) => (pid >= 0 && pid < perks.length ? Number(perks[pid]) & 0xff : 0);

  // The game's grid state for you: {avail: Set, taken: Set (cell indexes), yellow, green}.
  function walk(grid, level, farm, perks) {
    level = Number(level) || 0; farm = Number(farm) || 0; perks = Array.from(perks || []);
    const seen = new Set(), avail = new Set(), taken = new Set();
    function fill(x0, y0) {
      const todo = [[x0, y0]];
      while (todo.length) {
        const [x, y] = todo.pop();
        const c = cellAt(grid, x, y);
        if (!c) continue;
        const i = y * grid.w + x;
        if (seen.has(i)) continue;
        seen.add(i);
        let ways;
        if (c[0] !== -1) {
          if (have(perks, c[0]) < c[1]) { avail.add(i); continue; }
          taken.add(i);
          ways = ALL_WAYS;
        } else {
          ways = PIPES[c[2]];
          if (!ways) continue;
        }
        for (const [dx, dy] of ways) todo.push([x + dx, y + dy]);
      }
    }
    for (let x = 0; x < grid.w; x += 1) {
      for (let y = 0; y < grid.h; y += 1) {
        const c = cellAt(grid, x, y);
        if (c && c[2] in ROOT_LEVELS && level >= ROOT_LEVELS[c[2]]) fill(x, y);
      }
    }
    let farmTaken = 0;
    for (const i of taken) if (isFarm(grid.cells[i][0])) farmTaken += 1;
    return { avail, taken, seen, yellow: Math.max(0, level - (taken.size - farmTaken)),
      green: Math.max(0, farm - farmTaken) };
  }

  // the game's own test for showing its pick button
  function canPick(grid, st, x, y) {
    const c = cellAt(grid, x, y);
    if (!c || c[0] === -1) return false;
    const i = y * grid.w + x;
    if (!st.avail.has(i) || st.taken.has(i)) return false;
    return st[starOf(c[0])] > 0;
  }

  function lockReasons(grid) {
    const out = new Map(), full = new Array(64).fill(0x7f);
    for (const rootLevel of [...new Set(Object.values(ROOT_LEVELS))].sort((a, b) => a - b)) {
      for (const i of walk(grid, rootLevel, 0, full).taken) if (!out.has(i)) out.set(i, rootLevel);
    }
    return out;
  }

  const perkName = pid => (PERKS[pid] ? PERKS[pid][0] : `Perk ${pid}`);
  function perkText(pid, level) {
    const info = PERKS[pid];
    if (!info || !(level >= 1 && level <= info[2].length)) return "";
    return info[2][level - 1];
  }
  const cellTitle = (pid, level) => `${perkName(pid)} · Level ${level}`;

  // ------------------------------------------------------------------ the tree
  // Same view as cc_perks.build_view (the parity test compares them): the
  // game's own tree, one 'cells' row per grid row, plus the detail bar.
  const WAY_CH = [["l", -1, 0], ["r", 1, 0], ["u", 0, -1], ["d", 0, 1]];
  const ROOT_STARS = { 10: "yellow", 11: "yellow", 12: "yellow", 13: "green" };
  const waysOf = type => WAY_CH.filter(([, dx, dy]) => (PIPES[type] || []).some(w => w[0] === dx && w[1] === dy))
    .map(w => w[0]).join("");
  const perkLevels = pid => (PERKS[pid] ? PERKS[pid][2].length : 1);
  const isEmpty = c => c[0] === -1 && c[1] === -1 && c[2] === -1;

  function cellState(grid, st, x, y) {
    const i = y * grid.w + x;
    if (st.taken.has(i)) return "taken";
    if (st.avail.has(i)) return canPick(grid, st, x, y) ? "pick" : "open";
    return "locked";
  }
  function lockText(grid, p, x, y, opens = lockReasons(grid)) {
    const at = opens.get(y * grid.w + x);
    return at && (p.level || 0) < at ? `Opens at Level ${at}` : "Pick the perks before it first";
  }
  function usedRows(grid) {
    const used = [];
    grid.cells.forEach((c, i) => { if (!isEmpty(c)) used.push(Math.floor(i / grid.w)); });
    return used;
  }
  function treeRows(grid, st, level, selected) {
    const used = usedRows(grid);
    if (!used.length) return [];
    const rows = [];
    for (let y = Math.min(...used); y <= Math.max(...used); y += 1) {
      const cells = [];
      for (let x = 0; x < grid.w; x += 1) {
        const i = y * grid.w + x, [pid, lv, type] = grid.cells[i];
        if (pid !== -1) {
          let links = "", linkLit = "";
          for (const [ch, nx, ny] of [["r", x + 1, y], ["d", x, y + 1]]) {
            const nc = cellAt(grid, nx, ny);
            if (nc && nc[0] !== -1) {
              links += ch;
              if (st.taken.has(i) || st.taken.has(ny * grid.w + nx)) linkLit += ch;
            }
          }
          cells.push({ x, t: "perk", id: `cell:${x},${y}`, pid, lv, state: cellState(grid, st, x, y),
            ring: STAR_COLORS[starOf(pid)], sel: !!selected && selected[0] === x && selected[1] === y,
            badge: perkLevels(pid) > 1 ? String(lv) : "", links, linkLit });
        } else if (type in ROOT_STARS) {
          const need = ROOT_LEVELS[type];
          cells.push({ x, t: "root", star: ROOT_STARS[type], lit: level >= need, badge: need ? String(need) : "" });
        } else if (type in PIPES) {
          cells.push({ x, t: "pipe", ways: waysOf(type), lit: st.seen.has(i) });
        }
      }
      rows.push({ kind: "cells", cols: grid.w, cells });
    }
    return rows;
  }
  const firstRow = grid => { const used = usedRows(grid); return used.length ? Math.min(...used) : 0; };
  function defaultSelection(grid, st) {
    for (const want of ["pick", "open"]) {
      for (const [x, y] of perkCells(grid)) if (cellState(grid, st, x, y) === want) return [x, y];
    }
    return null;
  }

  function buildView(grid, p, selected = null, dialog = null) {
    if (!p || p.level == null) {
      return { detail: { stars: [{ star: "green", n: null }, { star: "yellow", n: null }], pid: null,
        title: "Loading your perks…", sub: "", subColor: DIM, note: "", noteColor: FAINT, btns: [] },
      rows: [{ kind: "note", text: "Loading your perks…" }] };
    }
    const st = walk(grid, p.level, p.farmLevel, p.perks);
    const detail = { stars: [{ star: "green", n: st.green }, { star: "yellow", n: st.yellow }], pid: null,
      title: "Pick a perk on the tree", sub: "Click any perk to see what it does", subColor: DIM,
      note: "", noteColor: FAINT, btns: [] };
    let sel = dialog ? [dialog.x, dialog.y] : selected;
    const c = sel ? cellAt(grid, sel[0], sel[1]) : null;
    if (c && c[0] !== -1) {
      const [x, y] = sel, [pid, lv] = c, colour = starOf(pid);
      Object.assign(detail, { pid, title: cellTitle(pid, lv), sub: perkText(pid, lv) });
      const state = cellState(grid, st, x, y);
      if (dialog) {
        Object.assign(detail, { title: `Pick ${cellTitle(pid, lv)}?`, note: `Spends 1 ${colour} star`,
          noteColor: STAR_COLORS[colour],
          btns: [{ id: "yes", text: "YES", color: "#22c55e", style: "solid" },
            { id: "no", text: "NO", color: "#ff8a8a", style: "ghost" }] });
      } else if (state === "taken") {
        Object.assign(detail, { note: "You have this one", noteColor: GREEN });
      } else if (state === "pick") {
        Object.assign(detail, { note: `Costs 1 ${colour} star`, noteColor: STAR_COLORS[colour],
          btns: [{ id: `pick:${x},${y}`, text: "Pick", color: PICK_COLORS[colour], style: "solid" }] });
      } else if (state === "open") {
        Object.assign(detail, { note: `Needs a ${colour} star`, noteColor: AMBER });
      } else {
        Object.assign(detail, { note: lockText(grid, p, x, y), noteColor: FAINT });
      }
    } else {
      sel = null;
    }
    return { detail, rows: treeRows(grid, st, Number(p.level) || 0, sel) };
  }

  function subtitle(p, grid = GRID) {
    if (!p || p.level == null) return "Loading…";
    const parts = [`Level ${p.level}`];
    if (p.farmLevel != null) parts.push(`Farming Level ${p.farmLevel}`);
    parts.push(`${walk(grid, p.level, p.farmLevel, p.perks).taken.size} perks picked`);
    return parts.join(" · ");
  }
  function chipText(p, grid = GRID) {
    if (!p || p.level == null) return null;
    const st = walk(grid, p.level, p.farmLevel, p.perks), n = st.yellow + st.green;
    return `${n} star${n === 1 ? "" : "s"}`;
  }

  // ------------------------------------------------------------------ the game's art
  // The tiles use the game's own pictures: the web client's UI atlas in its
  // own file system (/images/UI.jpg + UI_alpha.png, rectangles in UI.bundle),
  // found the same way as cc_perks.find_art (the 41 perk icons are the one run
  // of 41 records of the icon size; the star is record 86, 66 x 65).
  function bundleRecords(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = [];
    const ok = v => Number.isFinite(v) && v === Math.trunc(v) && v >= 0 && v <= 4096;
    let k = 0;
    while (k < bytes.length - 32) {
      const x = dv.getFloat32(k, true), y = dv.getFloat32(k + 4, true);
      const w = dv.getFloat32(k + 8, true), h = dv.getFloat32(k + 12, true);
      if ([x, y, w, h].every(ok) && w >= 1 && h >= 1) {
        const ow = dv.getUint32(k + 16, true), oh = dv.getUint32(k + 20, true);
        if (ow > 0 && ow <= 4096 && oh > 0 && oh <= 4096 && ow >= w - 2 && oh >= h - 2) {
          out.push([x, y, w, h, ow, oh]);
          k += 24;
          continue;
        }
      }
      k += 1;
    }
    return out;
  }
  function findArt(recs) {
    let run = 0, start = -1;
    for (let i = 0; i < recs.length; i += 1) {
      const r = recs[i];
      run = r[4] === 78 && r[5] === 83 && ((r[2] === 78 && r[3] === 83) || (r[2] === 76 && r[3] === 80)) ? run + 1 : 0;
      if (run === 41) { start = i - 40; break; }
    }
    if (start < 0) throw new Error("perk icons not found in the UI atlas");
    if (!recs[86] || recs[86][2] !== 66 || recs[86][3] !== 65) throw new Error("star not found in the UI atlas");
    return { perks: start, star: 86 };
  }
  // the web client's UI atlas: its records, and cut(record) -> PNG data URL
  // (shared with cc-browser-menu.js, which cuts the Escape menu's bubbles)
  let atlasPromise = null;
  function loadAtlas(win) {
    if (atlasPromise) return atlasPromise;
    atlasPromise = (async () => {
      const FS = win.FS;
      if (!FS || typeof FS.readFile !== "function") throw new Error("the game's files aren't loaded yet");
      const recs = bundleRecords(FS.readFile("/images/UI.bundle"));
      const bitmap = path => win.createImageBitmap(new win.Blob([FS.readFile(path)]));
      const [rgb, alpha] = await Promise.all([bitmap("/images/UI.jpg"), bitmap("/images/UI_alpha.png")]);
      const doc = win.document;
      function cut(r) {
        const [x, y, w, h] = r, a = doc.createElement("canvas"), b = doc.createElement("canvas");
        a.width = b.width = w; a.height = b.height = h;
        const ga = a.getContext("2d"), gb = b.getContext("2d");
        ga.drawImage(rgb, x, y, w, h, 0, 0, w, h);
        gb.drawImage(alpha, x, y, w, h, 0, 0, w, h);
        const pa = ga.getImageData(0, 0, w, h), pb = gb.getImageData(0, 0, w, h).data;
        for (let i = 0; i < pa.data.length; i += 4) pa.data[i + 3] = pb[i];      // the mask's grey = alpha
        ga.putImageData(pa, 0, 0);
        return a.toDataURL("image/png");
      }
      return { recs, cut };
    })();
    atlasPromise.catch(() => { atlasPromise = null; });               // try again next time
    return atlasPromise;
  }
  async function loadArt(win) {
    const { recs, cut } = await loadAtlas(win);
    const at = findArt(recs);
    const perk = {};
    for (let pid = 0; pid < 41; pid += 1) perk[pid] = cut(recs[at.perks + pid]);
    return { perk, star: cut(recs[at.star]) };
  }

  // ------------------------------------------------------------------ model
  function createPerksModel(opts) {
    const now = opts.now || (() => Date.now());
    const C = opts.core;
    const grid = opts.grid || GRID;
    const s = { p: null, open: false, selected: null, dialog: null, picking: null, status: null, focus: false };
    const say = (text, tone) => { s.status = { text, tone: tone || DIM }; };
    const state = () => (s.p && s.p.level != null ? walk(grid, s.p.level, s.p.farmLevel, s.p.perks) : null);

    function cellFrom(arg) {
      const m = /^(\d+),(\d+)$/.exec(arg);
      if (!m) return null;
      const x = Number(m[1]), y = Number(m[2]), c = cellAt(grid, x, y);
      return c && c[0] !== -1 ? { x, y, pid: c[0], level: c[1] } : null;
    }
    function pick(arg) {
      const c = cellFrom(arg);
      if (!c || s.dialog) return;
      s.selected = [c.x, c.y];
      if (s.picking && now() - s.picking.at < PICK_WAIT_MS) {
        say(`Still picking ${s.picking.name}…`, AMBER);
        return;
      }
      const st = state();
      if (!st) { say("Waiting for your perks from the game…", AMBER); return; }
      if (!canPick(grid, st, c.x, c.y)) { say(`You can't pick ${cellTitle(c.pid, c.level)} right now.`, AMBER); return; }
      s.dialog = { ...c, at: now() };
    }
    function yes() {
      const d = s.dialog;
      s.dialog = null;
      if (!d || now() - d.at > DIALOG_MS) return;
      const st = state();
      if (!st || !canPick(grid, st, d.x, d.y)) {
        say(`You can't pick ${cellTitle(d.pid, d.level)} any more.`, AMBER);
        return;
      }
      try {
        opts.send([C.buildPerkPick(d.x, d.y)]);
      } catch (error) {
        say(`Couldn't reach the game: ${error && error.message ? error.message : error}`, RED);
        return;
      }
      const name = cellTitle(d.pid, d.level);
      s.picking = { pid: d.pid, level: d.level, name, at: now() };
      say(`Picking ${name}…`, CYAN);
    }
    function checkPicked() {
      const k = s.picking;
      if (k && s.p && have(s.p.perks || [], k.pid) >= k.level) {
        say(`Picked ${k.name}!`, GREEN);
        s.picking = null;
      }
    }
    function click(id) {
      const at = id.indexOf(":");
      const verb = at < 0 ? id : id.slice(0, at), arg = at < 0 ? "" : id.slice(at + 1);
      if (verb === "cell") {
        const c = cellFrom(arg);
        if (c && !s.dialog) s.selected = [c.x, c.y];
      } else if (verb === "pick") pick(arg);
      else if (id === "yes") yes();
      else if (id === "no") s.dialog = null;
    }
    function gameEvent(ev) {
      const p = s.p || { level: null, farmLevel: null, perks: [] };
      if (ev.type === "self_profile") {
        s.p = { ...p, level: ev.level, farmLevel: ev.farmLevel, perks: Array.from(ev.perks || []) };
      } else if (ev.type === "xp") {
        s.p = { ...p, level: ev.level };
      } else if (ev.type === "perks") {
        s.p = { ...p, perks: Array.from(ev.perks || []) };
      } else {
        return false;
      }
      checkPicked();
      if (s.open && !s.selected) { const st = state(); if (st) s.selected = defaultSelection(grid, st); }
      return true;
    }
    function tick() {
      let changed = false;
      if (s.dialog && now() - s.dialog.at > DIALOG_MS) { s.dialog = null; changed = true; }
      if (s.picking && now() - s.picking.at > PICK_WAIT_MS) {
        say(`Sent the pick for ${s.picking.name} — check your perks.`, AMBER);
        s.picking = null;
        changed = true;
      }
      return { changed };
    }
    return {
      state: s,
      grid,
      click,
      gameEvent,
      tick,
      opened() {
        s.open = true; s.status = null; s.dialog = null;
        const st = state();
        s.selected = st ? defaultSelection(grid, st) : null;
      },
      closed() { s.open = false; s.dialog = null; },
      view() {
        const p = s.p, ready = !!(p && p.level != null), v = buildView(grid, p, s.selected, s.dialog);
        return {
          title: "Perks",
          subtitle: subtitle(p, grid),
          chip: chipText(p, grid),
          status: s.status ? s.status.text : ready ? "Click a perk, then Pick to spend a star" : "Waiting for the game…",
          statusColor: s.status ? s.status.tone : DIM,
          detail: v.detail,
          rows: v.rows
        };
      }
    };
  }

  // ------------------------------------------------------------------ window
  // The profile window's look, holding the game's tree: rounded tiles with the
  // game's icons, glowing paths, rings in the star's colour.
  const STAR_SHAPE = "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483646; display: none; align-items: center;
      justify-content: center; background: rgba(6,3,18,.78); backdrop-filter: blur(7px);
      font: 600 15px/1.3 "Segoe UI", system-ui, sans-serif; color: #fff; }
    .backdrop.show { display: flex; }
    .win { width: min(860px, 94vw); height: 86vh; display: flex; flex-direction: column;
      border-radius: 22px; background: rgba(20,16,39,.97); overflow: hidden;
      box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06);
      animation: rise .18s ease-out; }
    @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    .head { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 22px; flex: none;
      min-height: 98px; background: linear-gradient(90deg,#ff4fb8,#9b5cf6,#3b82f6,#22d3ee,#9b5cf6,#ff4fb8);
      background-size: 300% 100%; animation: slide 14s linear infinite; overflow: hidden; }
    .head::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 40%;
      background: rgba(0,0,0,.12); pointer-events: none; }
    @keyframes slide { from { background-position: 0% 0; } to { background-position: 300% 0; } }
    .titles { flex: 1; min-width: 0; z-index: 1; }
    .title { font: 800 34px/1.1 "Segoe UI", system-ui, sans-serif; text-shadow: 0 2px 3px rgba(0,0,0,.45);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .subtitle { font-size: 18px; opacity: .93; text-shadow: 0 1px 2px rgba(0,0,0,.45); }
    .pill { z-index: 1; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px;
      border-radius: 18px; background: rgba(0,0,0,.2); font-size: 16px; white-space: nowrap; }
    .dot { width: 14px; height: 14px; background: #ffc53d; clip-path: ${STAR_SHAPE};
      animation: breathe 1.6s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scale(1.18) rotate(18deg); } }
    .close { z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
      background: rgba(255,255,255,.22); color: #fff; font: 700 22px/1 "Segoe UI", sans-serif; }
    .close:hover { background: #ef4444; }
    .detail { flex: none; display: flex; align-items: center; gap: 16px; margin: 14px 22px 0; padding: 10px 16px 10px 12px;
      min-height: 104px; border-radius: 18px; background: #211b3e; }
    .stars { display: flex; flex-direction: column; gap: 8px; }
    .star { display: flex; align-items: center; justify-content: space-between; width: 112px; height: 40px;
      padding: 0 16px 0 6px; border-radius: 20px; background: color-mix(in srgb, var(--c) 15%, transparent);
      font: 700 21px "Segoe UI", sans-serif; color: color-mix(in srgb, var(--c) 70%, white); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .star img, .star i { width: 32px; height: 32px; }
    .star i { display: block; clip-path: ${STAR_SHAPE}; background: var(--c); }
    .green { filter: hue-rotate(75deg) saturate(1.25); }
    .divider { align-self: stretch; width: 1px; margin: 4px 0; background: rgba(255,255,255,.13); }
    .pic { position: relative; flex: none; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; }
    .pic::before { content: ""; position: absolute; inset: -8px; border-radius: 50%; background: var(--c); opacity: .18;
      animation: breatheGlow 1.6s ease-in-out infinite; }
    @keyframes breatheGlow { 50% { opacity: .32; } }
    .pic img { position: relative; width: 72px; height: 72px; object-fit: contain; }
    .bubble { position: relative; width: 64px; height: 64px; border-radius: 50%; background: var(--c);
      display: flex; align-items: center; justify-content: center; font: 800 30px "Segoe UI", sans-serif; }
    .info { flex: 1; min-width: 0; }
    .info .t { font: 700 21px "Segoe UI", sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .info .s, .info .n { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btn { flex: none; height: 42px; padding: 0 22px; border-radius: 21px; border: 0; cursor: pointer;
      font: 700 17px "Segoe UI", sans-serif; color: #fff; background: var(--b); text-shadow: 0 1px 2px rgba(0,0,0,.35);
      box-shadow: 0 3px 0 color-mix(in srgb, var(--b) 45%, transparent), 0 0 18px color-mix(in srgb, var(--b) 45%, transparent); }
    .btn:hover { filter: brightness(1.22); }
    .btn.ghost { background: rgba(255,255,255,.15); color: var(--b); text-shadow: none; box-shadow: none; }
    .tree { flex: 1; min-height: 0; overflow-y: auto; margin: 14px 12px 0 22px; padding: 6px 8px 6px 0;
      scrollbar-width: thin; scrollbar-color: #9b5cf6 rgba(255,255,255,.08); }
    .grid { display: grid; gap: 0; }
    .cell { position: relative; aspect-ratio: 1; }
    .pipe i { position: absolute; background: #342c5c; }
    .pipe.lit i { background: #dcd4ff; box-shadow: 0 0 8px rgba(155,92,246,.75); }
    .pipe .l { left: 0; right: calc(50% - 4px); top: calc(50% - 4px); height: 8px; }
    .pipe .r { left: calc(50% - 4px); right: 0; top: calc(50% - 4px); height: 8px; }
    .pipe .u { top: 0; bottom: calc(50% - 4px); left: calc(50% - 4px); width: 8px; }
    .pipe .d { top: calc(50% - 4px); bottom: 0; left: calc(50% - 4px); width: 8px; }
    .bridge { position: absolute; background: #342c5c; z-index: 0; }
    .bridge.lit { background: #dcd4ff; }
    .bridge.r { right: -6px; width: 12px; top: calc(50% - 4px); height: 8px; }
    .bridge.d { bottom: -6px; height: 12px; left: calc(50% - 4px); width: 8px; }
    .tile { position: absolute; inset: 7%; z-index: 1; border-radius: 14px; background: #211b3e; border: 0; padding: 0;
      display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .12s, background .12s; }
    .tile img { width: 92%; height: 92%; object-fit: contain; pointer-events: none; }
    .tile:hover { background: #2d2556; transform: scale(1.06); }
    .tile.taken { box-shadow: 0 0 0 3px var(--r); }
    .tile.pick { box-shadow: 0 0 0 3px var(--r); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 50% { box-shadow: 0 0 0 3px var(--r), 0 0 0 9px color-mix(in srgb, var(--r) 40%, transparent); } }
    .tile.open { box-shadow: 0 0 0 3px rgba(255,255,255,.3); }
    .tile.open img { filter: brightness(.82); }
    .tile.locked { background: #16122c; }
    .tile.locked img { filter: grayscale(.6) brightness(.35); }
    .tile.sel { outline: 3px solid #22d3ee; outline-offset: 5px; }
    .tile .ini { width: 72%; height: 72%; border-radius: 50%; background: var(--a); display: flex; align-items: center;
      justify-content: center; font: 800 21px "Segoe UI", sans-serif; }
    .tile.locked .ini { opacity: .35; }
    .lv { position: absolute; right: -6px; bottom: -6px; min-width: 22px; height: 22px; border-radius: 11px;
      border: 2px solid #141027; background: #3a3360; color: #b3aed6; font: 700 13px/18px "Segoe UI", sans-serif; text-align: center; }
    .taken .lv, .pick .lv { background: var(--r); color: #1a1534; }
    .root { position: absolute; inset: 7%; border-radius: 14px; background: #1a1534; display: flex; align-items: center;
      justify-content: center; }
    .root.lit { background: #2a2350; box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 35%, transparent); }
    .root img, .root i { width: 74%; height: 74%; object-fit: contain; }
    .root i { display: block; clip-path: ${STAR_SHAPE}; background: var(--c); }
    .root:not(.lit) img, .root:not(.lit) i { filter: grayscale(1) brightness(.45); }
    .root b { position: absolute; bottom: 4px; padding: 0 7px; border-radius: 10px; background: rgba(0,0,0,.8);
      font: 700 14px/20px "Segoe UI", sans-serif; }
    .root:not(.lit) b { color: #7c76a6; }
    .note { padding: 18px 8px; text-align: center; color: #b3aed6; font-size: 18px; }
    .foot { flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 22px 14px; }
    .toast { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 16px; border-radius: 18px;
      font-size: 16px; color: var(--t); background: color-mix(in srgb, var(--t) 18%, transparent); max-width: 70%;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toast::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--t); }
    .hint { margin-left: auto; color: #7c76a6; font-size: 15px; white-space: nowrap; }
  `;

  const esc = text => String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // art = {perk: {pid: dataURL}, star: dataURL} or null (bubbles + drawn stars)
  function starPic(star, art) {
    return art && art.star ? `<img src="${art.star}" alt=""${star === "green" ? ' class="green"' : ""}>`
      : `<i style="--c:${STAR_COLORS[star]}"></i>`;
  }
  function renderDetail(d, art) {
    const stars = d.stars.map(st => `<div class="star" style="--c:${STAR_COLORS[st.star]}">${starPic(st.star, art)}` +
      `<span>${st.n == null ? "--" : String(st.n).padStart(2, "0")}</span></div>`).join("");
    let pic = "";
    if (d.pid != null) {
      const icon = art && art.perk[d.pid];
      pic = `<div class="pic" style="--c:${perkColor(d.pid)}">` + (icon ? `<img src="${icon}" alt="">`
        : `<div class="bubble" style="--c:${perkColor(d.pid)}">${esc(initial(perkName(d.pid)))}</div>`) + "</div>";
    }
    const btns = d.btns.map(b => `<button class="btn${b.style === "ghost" ? " ghost" : ""}" style="--b:${b.color}" ` +
      `data-id="${esc(b.id)}">${esc(b.text)}</button>`).join("");
    return `<div class="stars">${stars}</div><div class="divider"></div>${pic}` +
      `<div class="info"><div class="t">${esc(d.title)}</div>` +
      (d.sub ? `<div class="s" style="color:${d.subColor}">${esc(d.sub)}</div>` : "") +
      (d.note ? `<div class="n" style="color:${d.noteColor}">${esc(d.note)}</div>` : "") + `</div>${btns}`;
  }
  function renderTree(rows, art) {
    if (rows.length && rows[0].kind === "note") return `<div class="note">${esc(rows[0].text)}</div>`;
    const cols = rows.length ? rows[0].cols : 1;
    const out = [];
    rows.forEach((r, y) => {
      for (const c of r.cells) {
        const at = `grid-column:${c.x + 1};grid-row:${y + 1}`;
        if (c.t === "pipe") {
          out.push(`<div class="cell pipe${c.lit ? " lit" : ""}" style="${at}">` +
            c.ways.split("").map(w => `<i class="${w}"></i>`).join("") + "</div>");
        } else if (c.t === "root") {
          out.push(`<div class="cell" style="${at}"><div class="root${c.lit ? " lit" : ""}" style="--c:${STAR_COLORS[c.star]}">` +
            starPic(c.star, art) + (c.badge ? `<b>${esc(c.badge)}</b>` : "") + "</div></div>");
        } else {
          const icon = art && art.perk[c.pid];
          const bridges = c.links.split("").filter(Boolean)
            .map(w => `<span class="bridge ${w}${c.linkLit.indexOf(w) >= 0 ? " lit" : ""}"></span>`).join("");
          out.push(`<div class="cell" style="${at}">${bridges}` +
            `<button class="tile ${c.state}${c.sel ? " sel" : ""}" style="--r:${c.ring}" data-id="${esc(c.id)}" ` +
            `title="${esc(cellTitle(c.pid, c.lv))}">` +
            (icon ? `<img src="${icon}" alt="">` : `<span class="ini" style="--a:${perkColor(c.pid)}">${esc(initial(perkName(c.pid)))}</span>`) +
            (c.badge ? `<span class="lv">${esc(c.badge)}</span>` : "") + "</button></div>");
        }
      }
    });
    return `<div class="grid" style="grid-template-columns:repeat(${cols},1fr)">${out.join("")}</div>`;
  }

  // ------------------------------------------------------------------ page glue
  function install(win) {
    if (win.CCPerks) return;
    const doc = win.document;
    const Core = win.CCBrowserCore;
    let enabled = true;
    let transport = null;
    let host = null, dom = null, art = null, artTried = false;

    const model = createPerksModel({
      core: Core,
      send(bodies) {
        if (!transport || typeof transport.sendBody !== "function") throw new Error("the game connection isn't ready yet");
        for (const body of bodies) transport.sendBody(body);
      }
    });

    function build() {
      if (host || !doc.documentElement) return;
      host = doc.createElement("div");
      host.id = "cc-perks-host";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${CSS}</style>
        <div class="backdrop" id="backdrop">
          <div class="win" id="win">
            <div class="head">
              <div class="titles"><div class="title" id="title">Perks</div><div class="subtitle" id="subtitle"></div></div>
              <div class="pill" id="chip"><span class="dot"></span><span id="chipText"></span></div>
              <button class="close" id="close" title="Close (Esc)">×</button>
            </div>
            <div class="detail" id="detail"></div>
            <div class="tree" id="tree"></div>
            <div class="foot"><div class="toast" id="toast"></div>
              <div class="hint">Stars: one per level · Esc closes</div></div>
          </div>
        </div>`;
      const $ = id => shadow.getElementById(id);
      dom = { shadow, backdrop: $("backdrop"), win: $("win"), title: $("title"), subtitle: $("subtitle"),
        chip: $("chip"), chipText: $("chipText"), close: $("close"), detail: $("detail"), tree: $("tree"), toast: $("toast") };
      (doc.body || doc.documentElement).appendChild(host);
      // Our clicks/scrolls never reach the game's page-level handlers.
      for (const type of ["mousedown", "mouseup", "click", "dblclick", "wheel", "pointerdown",
        "pointerup", "contextmenu", "touchstart", "touchend"]) {
        dom.backdrop.addEventListener(type, event => event.stopPropagation());
      }
      dom.backdrop.addEventListener("mousedown", event => {
        if (event.target === dom.backdrop) close("outside");
      });
      dom.close.addEventListener("click", () => close("button"));
      dom.win.addEventListener("click", event => {
        const el = event.target.closest && event.target.closest("[data-id]");
        if (!el) return;
        model.click(el.dataset.id);
        render();
      });
    }

    function ensureArt() {
      if (art || artTried) return;
      artTried = true;
      loadArt(win).then(a => { art = a; render(); })
        .catch(error => { artTried = false; console.warn("[CC perks] game pictures:", error && error.message || error); });
    }

    function render(focus) {
      if (!dom || !model.state.open) return;
      const v = model.view();
      dom.title.textContent = v.title;
      dom.subtitle.textContent = v.subtitle;
      dom.chip.style.display = v.chip ? "" : "none";
      dom.chipText.textContent = v.chip || "";
      dom.detail.innerHTML = renderDetail(v.detail, art);
      const scroll = dom.tree.scrollTop;
      dom.tree.innerHTML = renderTree(v.rows, art);
      dom.tree.scrollTop = scroll;
      if (focus) {                                   // open the tree where your next pick is
        const sel = dom.tree.querySelector(".tile.sel");
        if (sel) dom.tree.scrollTop = Math.max(0, sel.offsetTop - dom.tree.clientHeight / 3);
      }
      dom.toast.textContent = v.status;
      dom.toast.style.setProperty("--t", v.statusColor);
    }

    function open() {
      build();
      if (!dom) return;
      for (const other of [win.CCFriends, win.CCProfile, win.CCStore]) if (other && typeof other.close === "function") other.close();
      model.opened();
      dom.backdrop.classList.add("show");
      dom.win.style.animation = "none";
      void dom.win.offsetWidth;            // replay the rise animation
      dom.win.style.animation = "";
      dom.tree.scrollTop = 0;
      ensureArt();
      render(true);
    }
    function close() {
      if (!dom || !model.state.open) return;
      model.closed();
      dom.backdrop.classList.remove("show");
      const canvas = doc.getElementById("canvas");
      if (canvas) canvas.focus();
    }

    // While open nothing typed reaches the game (key releases still do, so a
    // key held while opening doesn't stick). F3 opens / closes it.
    win.addEventListener("keydown", event => {
      if (event.key === "F3" && !event.shiftKey && enabled && !event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (model.state.open) close("hotkey"); else open("hotkey");
        return;
      }
      if (!model.state.open) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        if (model.state.dialog) { model.click("no"); render(); } else close("escape");
      } else if (event.key !== "ArrowUp" && event.key !== "ArrowDown" &&
               event.key !== "PageUp" && event.key !== "PageDown") event.preventDefault();
    }, true);
    win.addEventListener("keypress", event => {
      if (model.state.open) event.stopImmediatePropagation();
    }, true);

    setInterval(() => {
      if (model.state.open && model.tick().changed) render();
    }, 250);

    win.CCPerks = {
      // Called by cc-browser-wasm-friends.js in place of the game's own perk
      // grid. Returning false runs the untouched game action.
      interceptNativeAction() {
        if (!enabled) return false;
        open("native-button");
        return true;
      },
      onEvent(event, eventTransport) {
        if (eventTransport) transport = eventTransport;
        if (model.gameEvent(event) && model.state.open) render();
      },
      setEnabled(on) {
        enabled = on !== false;
        if (!enabled) close("disabled");
      },
      open,
      close,
      status: () => ({ enabled, open: model.state.open, level: model.state.p ? model.state.p.level : null, art: !!art })
    };
  }

  return { GRID, GRID_SIZE, GRID_CELLS, PIPES, ROOT_LEVELS, makeGrid, walk, canPick, lockReasons,
    buildView, defaultSelection, firstRow, subtitle, chipText, createPerksModel, renderDetail, renderTree,
    bundleRecords, findArt, loadAtlas, loadArt, starOf, install };
});
