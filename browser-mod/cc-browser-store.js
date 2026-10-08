/*
 * Custom Cubit Store for the browser client (castles.cc) — the same window
 * cubic-mods.exe draws inside the Steam client (stage2/mods/cc_store.py).
 *
 * Opening it: Escape → Cubit Store (cc-browser-wasm-friends.js intercepts the
 * game's menu action before its own store opens).
 *
 *   header: Cubit Store · 5,846 cubits · 7,811 recubes · [5,846 cubits] [×]
 *   [Search the store…]
 *   [‹ Back]  Home › Items › Fishing
 *   the store's own pages like the game's: big tiles with its pictures,
 *   categories (click to go in) and things to buy ([i], [Buy]), in its order;
 *   typing searches every page, Backspace on an empty search goes back;
 *   real-money tiles: [Cubic's store] (the next Cubit Store click opens it)
 *
 * The catalogue is the game's own: https://www.cubiccastles.com/store2/cache.dat
 * (fetched by the extension's background worker), decoded exactly like
 * Cubic.exe (LZ with an escape byte, then XOR with the game's key) and parsed
 * like stage2/mods/cc_store_catalog.py.
 *
 * Buying is the game's own buy, step for step: its wallet check (rx 0x0011 /
 * 0x00e8 give your cubits / recubes; items compare the UNIT price), its "Need
 * More Cubits" / "Not enough Recubes", its confirm word for word ("BUY THIS
 * ITEM?", YES / NO), and only on YES the byte-identical message
 * (cc-browser-core.js buildStoreBuy*). Rows are the same as cc_store.build_rows
 * (node tests: test-store.js).
 */
(function installStore(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function makeStore(root) {
  "use strict";

  const GREEN = "#3fb950", AMBER = "#f5a524", RED = "#ef4444", BLUE = "#3b82f6", PINK = "#ff4fb8",
    CYAN = "#22d3ee", TEXT = "#ffffff", DIM = "#b3aed6", FAINT = "#7c76a6", GOLD = "#ffc53d",
    LEAF = "#73d13d", SKY = "#40a9ff";
  const SECTION_COLORS = ["#ff4fb8", "#22d3ee", "#ffc53d", "#9b5cf6", "#73d13d", "#40a9ff", "#ff7a45"];
  const DIALOG_MS = 60000, BUY_WAIT_MS = 10000, INFO_WRAP = 86, TILES_PER_ROW = 4;
  const STORE_URL = "https://www.cubiccastles.com/store2/cache.dat";
  const ICON_URL = "https://www.cubiccastles.com/store2/";
  const KEY = new TextEncoder().encode("Need More Cubits" + "BUY THIS ITEM?" +
    "You don't have enough cubits to buy this item. Get more now?" + "#^^..&*&fgh:;-0^" +
    "You don't have enough recubes. Use a recycler to create more first." +
    ")(%%a?$.#%d%&^" + "Not enough Recubes");
  const NEED_CUBITS = ["Need More Cubits", "You don't have enough cubits to buy this item. Get more now?"];
  const NEED_RECUBES = ["Not enough Recubes",
    "You don't have enough recubes. Use a recycler or farm to create more first."];

  // ------------------------------------------------------------------ decode
  function lzDecompress(data) {
    data = data instanceof Uint8Array ? data : Uint8Array.from(data);
    if (!data.length) return new Uint8Array(0);
    const out = [];
    const marker = data[0];
    let i = 1;
    function varint() {
      let v = 0;
      for (;;) {
        const b = data[i++];
        v = (v * 128) + (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
    }
    while (i < data.length) {
      const b = data[i++];
      if (b !== marker) { out.push(b); continue; }
      if (data[i] === 0) { out.push(marker); i += 1; continue; }
      const length = varint(), offset = varint();
      if (offset <= 0 || offset > out.length) throw new Error("store cache: copy from before the start");
      for (let k = 0; k < length; k += 1) out.push(out[out.length - offset]);
    }
    return Uint8Array.from(out);
  }
  function decodeCache(raw) {
    const plain = lzDecompress(raw);
    const out = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i += 1) out[i] = plain[i] ^ KEY[i % KEY.length];
    const text = new TextDecoder("utf-8").decode(out);
    if (!text.startsWith("VERSION=")) throw new Error("store cache didn't decode (no VERSION line)");
    return text;
  }

  // ------------------------------------------------------------------ parse
  // the same steps as cc_store_catalog.Catalog
  function stripComment(line) {
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (!q && ch === "/" && line[i + 1] === "/") return line.slice(0, i);
    }
    return line;
  }
  function splitArgs(s) {
    const out = [];
    let cur = "", q = false;
    for (const ch of s) {
      if (ch === '"') { q = !q; cur += ch; } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map(a => {
      const t = a.trim();
      return t.startsWith('"') ? t.replace(/^"+|"+$/g, "") : t;
    });
  }
  const TAG_RE = /<([A-Z]+)\b([^>]*)>/g;
  const ATTR_RE = /(\w+)\s*=\s*("([^"]*)"|[^\s>]+)/g;
  function tagAttrs(s) {
    const out = {};
    for (const m of s.matchAll(ATTR_RE)) out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[2];
    return out;
  }
  function toInt(v, dflt = null) {
    const t = String(v == null ? "" : v).trim().replace(/,/g, "");
    return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : dflt;
  }
  // Python's str.title() for ASCII: each run of letters gets a capital first
  const titleCase = s => s.replace(/[A-Za-z]+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const isLower = s => s === s.toLowerCase() && s !== s.toUpperCase();
  const isUpper = s => s === s.toUpperCase() && s !== s.toLowerCase();
  const prettyPage = n => titleCase(n.replace(/_/g, " "));

  function parseCatalog(text, osName = "WASM") {
    const c = { version: null, defines: {}, pages: {}, pageOrder: [], entries: [], packs: {},
      itemPrices: new Map(), infos: {}, linkTitles: {}, linkIcons: {}, parent: {}, counts: {}, osName };
    const lines = text.split(/\r\n|\r|\n/);
    const rawPages = [];
    let page = null, i = 0;
    function gameitem(val, price) {
      const parts = String(val || "").split(",").map(x => x.trim());
      price = toInt(price, 0);
      if (parts.length === 2 && price && price > 0) {
        const k = toInt(parts[0]), id = toInt(parts[1]);
        if (k !== null && id !== null && !c.itemPrices.has(`${k},${id}`)) c.itemPrices.set(`${k},${id}`, price);
      }
    }
    function tag(name, a) {
      if (name === "PACK") {
        const pid = toInt(a.id);
        if (pid !== null && !(pid in c.packs)) {
          c.packs[pid] = { id: pid, price: toInt(a.price, 0), name: a.name || "", contents: a.contents || "" };
        }
      } else if (name === "GAMEITEM") {
        gameitem(a.val, a.price);
      } else if (name === "META" && page) {
        if (a.val && !page.title) page.title = a.val;
        page.back = page.back || (a.style || "").includes("back");
      }
    }
    function entry(pg, p, click) {
      const title = p.theText || p.theName || "";
      const info = p.theInfo || p.theInfoText || "";
      const e = { click, title, icon: p.theIcon || "", shown_price: p.thePrice || "", page: pg.name,
        info: info.startsWith("SHOWINFO:") ? info.slice(9) : "" };
      const at = click.indexOf(":");
      const verb = at < 0 ? click : click.slice(0, at), arg = at < 0 ? "" : click.slice(at + 1);
      if (verb === "BUYPACK" || verb === "BUYRECUBE") {
        Object.assign(e, { kind: verb === "BUYPACK" ? "pack" : "recube", pack: toInt(arg) });
      } else if (verb === "BUYITEM") {
        const a = splitArgs(arg);
        if (a.length !== 4) return null;
        Object.assign(e, { kind: "item", name: a[0], qty: toInt(a[1], 0), item_kind: toInt(a[2]), item_id: toInt(a[3]) });
      } else if (verb === "BUYCUBITS" || verb === "DOSPECIALTRANSACTION") {
        e.kind = "money";
      } else {
        return null;
      }
      return e;
    }
    function macro(name, args) {
      const d = c.defines[name];
      const p = {};
      d.params.forEach((n, k) => { if (k < args.length) p[n] = args[k]; });
      for (const m of d.body.matchAll(TAG_RE)) {
        if (m[1] === "GAMEITEM") {
          const a = tagAttrs(m[2]);
          gameitem(a.val in p ? p[a.val] : a.val, a.price in p ? p[a.price] : a.price);
        }
      }
      if (name.startsWith("PACK_INFO_PAGE")) {
        c.infos[p.thePagename || ""] = { title: p.theTitle || "", text: p.theText || "" };
        return;
      }
      let click = p.theClick;
      if (!click || !page) return;
      click = click.split("~OS~").join(osName);
      if (click.startsWith("GOTO:")) {
        const to = click.slice(5);
        page.links.push(to);
        page.tiles.push({ page: to });
        const label = (p.theText || "").trim().replace(/!+$/, "").trim();
        if (label && !(to in c.linkTitles)) c.linkTitles[to] = label;
        if (p.theIcon && !(to in c.linkIcons)) c.linkIcons[to] = p.theIcon;
        return;
      }
      const e = entry(page, p, click);
      if (e) {
        e.index = c.entries.length;
        c.entries.push(e);
        page.entries.push(e.index);
        page.tiles.push({ entry: e.index });
      }
    }
    while (i < lines.length) {
      const line = stripComment(lines[i]).replace(/\s+$/, "");
      i += 1;
      const s = line.trim();
      if (!s) continue;
      if (s.startsWith("VERSION=")) { c.version = toInt(s.split("=")[1]); continue; }
      let m = s.match(/^#define\s+([A-Z_0-9]+)\s*\(([^)]*)\)/);
      if (m) {
        const body = [];
        while (i < lines.length && lines[i].trim() !== "#end") { body.push(stripComment(lines[i])); i += 1; }
        i += 1;
        c.defines[m[1]] = { params: m[2].split(",").map(x => x.trim()), body: body.join("\n") };
        continue;
      }
      m = s.match(/^\[([A-Za-z0-9_~]+)\]$/);
      if (m) {
        page = c.pages[m[1]];
        if (!page) {
          page = { name: m[1], title: null, entries: [], links: [], tiles: [], back: false };
          c.pages[m[1]] = page;
          rawPages.push(m[1]);
        }
        continue;
      }
      if (s.startsWith("#")) {
        const cm = s.match(/^#([A-Z_0-9]+)\s*\((.*)\)\s*$/);
        if (cm && cm[1] in c.defines) { macro(cm[1], splitArgs(cm[2])); continue; }
      }
      for (const tm of s.matchAll(TAG_RE)) tag(tm[1], tagAttrs(tm[2]));
    }
    // pages in the order you'd reach them from MAIN; the rest are left out
    const seen = new Set(), queue = ["MAIN"];
    while (queue.length) {
      const n = queue.shift();
      if (seen.has(n) || !(n in c.pages)) continue;
      seen.add(n);
      c.pageOrder.push(n);
      queue.push(...c.pages[n].links);
    }
    for (const n of c.pageOrder) {
      for (const link of c.pages[n].links) {
        if (link in c.pages && link !== "MAIN" && !(link in c.parent)) c.parent[link] = n;
      }
    }
    function under(n, seen) {
      seen.add(n);
      const pg = c.pages[n];
      const out = new Set(pg.entries.map(i => c.entries[i].click));
      for (const link of pg.links) {
        if (link in c.pages && !seen.has(link)) for (const k of under(link, seen)) out.add(k);
      }
      return out;
    }
    for (const n of c.pageOrder) c.counts[n] = under(n, new Set()).size;
    for (const n of c.pageOrder) {
      const pg = c.pages[n];
      const t = c.linkTitles[n] || pg.title || (n === "MAIN" ? "Featured" : prettyPage(n));
      pg.title = isLower(t) || isUpper(t) ? titleCase(t) : t;
    }
    return c;
  }

  // what the game's own confirm uses (cc_store_catalog.Catalog.offer)
  function offer(c, e) {
    if (e.kind === "pack" || e.kind === "recube") {
      const pk = c.packs[e.pack];
      if (!pk) return null;
      return { name: pk.name, price: pk.price, qty: 1, unit: pk.price,
        currency: e.kind === "pack" ? "cubits" : "recubes" };
    }
    if (e.kind === "item") {
      const unit = c.itemPrices.get(`${e.item_kind},${e.item_id}`);
      if (!unit || e.qty <= 0) return null;
      return { name: e.name, price: e.qty > 1 ? unit * e.qty : unit, qty: e.qty, unit, currency: "cubits" };
    }
    return null;
  }
  function sections(c) {
    return c.pageOrder.map(n => [c.pages[n], c.pages[n].entries.map(i => c.entries[i])]).filter(x => x[1].length);
  }
  // a page's tiles in the game's order: categories with something under them (once each), buys
  function pageTiles(c, n) {
    const out = [], seen = new Set();
    for (const t of (c.pages[n] ? c.pages[n].tiles : [])) {
      if ("page" in t) {
        if (seen.has(t.page) || !c.counts[t.page]) continue;
        seen.add(t.page);
      }
      out.push(t);
    }
    return out;
  }
  function trail(c, n) {
    const out = [n];
    while (out[out.length - 1] in c.parent && !out.includes(c.parent[out[out.length - 1]])) out.push(c.parent[out[out.length - 1]]);
    return out.reverse();
  }

  // ------------------------------------------------------------------ rows
  // Same rows as cc_store.build_rows (the parity test compares them).
  const fmt = n => Number(n).toLocaleString("en-US");
  function initial(name) {
    for (const ch of String(name)) if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
    return "?";
  }
  function confirmText(e, o) {
    if (e.kind === "pack") return `Do you really want to buy  "${o.name}" for ${o.price} Cubits?`;
    if (e.kind === "recube") return `Do you really want to buy  "${o.name}" for ${o.price} Recubes?`;
    if (o.qty > 1) return `Do you really want to buy ${o.qty} "${o.name}" for ${o.price} Cubits?`;
    return `Do you really want to buy "${o.name}" for ${o.price} Cubits?`;
  }
  const needed = (e, o) => e.kind === "item" ? o.unit : o.price;
  function buyMessage(core, e) {
    if (e.kind === "pack") return core.buildStoreBuyPack(e.pack);
    if (e.kind === "recube") return core.buildStoreBuyRecube(e.pack);
    if (e.kind === "item") return core.buildStoreBuyItem(e.item_kind, e.item_id, e.qty);
    throw new Error("real-money tiles are bought in Cubic's own store");
  }
  const entryColor = e => ({ recube: LEAF, money: SKY }[e.kind] || GOLD);
  function wrap(text, width = INFO_WRAP) {
    const lines = [];
    let cur = "";
    for (let w of String(text || "").split(/\s+/).filter(Boolean)) {
      while (w.length > width) {
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!w) continue;
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= width) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function matches(c, e, f) {
    if (!f) return true;
    const info = c.infos[e.info || ""] || {};
    const hay = [e.title || "", e.name || "", info.title || "", info.text || "", c.pages[e.page].title]
      .join(" ").toLowerCase();
    return f.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }
  function pageColor(c, name) {
    const n = Math.max(0, c.pageOrder.indexOf(name));
    return SECTION_COLORS[n % SECTION_COLORS.length];
  }
  function pageTile(c, name) {
    const color = pageColor(c, name), n = c.counts[name] || 0, title = c.pages[name].title;
    return { id: "go:" + name, go: true, text: title, sub: `${fmt(n)} item${n === 1 ? "" : "s"}  \u203a`,
      subColor: color, color, initial: initial(title), icon: c.linkIcons[name] || "" };
  }
  function entryTile(c, e, wallet, openInfo) {
    const o = offer(c, e);
    const title = e.title || (o && o.name) || "?";
    const t = { id: `buy:${e.index}`, text: title, color: entryColor(e), initial: initial(title), icon: e.icon || "" };
    if (c.infos[e.info || ""]) t.info = { id: `info:${e.index}`, on: !!openInfo };
    if (e.kind === "money") {
      return Object.assign(t, { id: "cubic", sub: e.shown_price || "Real money", subColor: SKY, note: "real money",
        noteColor: FAINT, btn: { text: "Cubic's store", color: SKY, style: "ghost" } });
    }
    if (!o) return Object.assign(t, { id: null, sub: "No price", subColor: FAINT });
    t.sub = `${fmt(o.price)} ${o.currency}`;
    t.subColor = DIM;
    if (o.qty > 1) Object.assign(t, { note: `${o.qty} \u00d7 ${fmt(o.unit)} each`, noteColor: FAINT });
    const have = wallet[o.currency], need = needed(e, o);
    if (have != null && have < need) Object.assign(t, { subColor: AMBER, note: `need ${fmt(need - have)} more`, noteColor: AMBER });
    t.btn = { text: "Buy", color: "#22c55e", style: "solid" };
    return t;
  }
  function infoRows(c, e) {
    const info = c.infos[e.info || ""];
    if (!info) return [];
    const title = e.title || "";
    const text = (info.title ? info.title + ": " : "") + (info.text || "");
    const rows = (wrap(text).length ? wrap(text) : [""]).map(line => ({ kind: "text", text: line, color: DIM }));
    if (e.kind === "pack" || e.kind === "recube") {
      const pk = c.packs[e.pack] || {};
      if (pk.contents) for (const line of wrap("Contents: " + pk.contents).slice(0, 4)) rows.push({ kind: "text", text: line, color: FAINT });
    }
    if (title && !info.title) rows.unshift({ kind: "text", text: title, color: TEXT });   // which tile, in a grid
    return rows;
  }
  function tileRows(c, tiles, wallet, opened) {
    const rows = [];
    for (let k = 0; k < tiles.length; k += TILES_PER_ROW) {
      const chunk = tiles.slice(k, k + TILES_PER_ROW);
      rows.push({ kind: "tiles", tiles: chunk.map(t => "page" in t ? pageTile(c, t.page)
        : entryTile(c, c.entries[t.entry], wallet, opened.has(t.entry))) });
      for (const t of chunk) if ("entry" in t && opened.has(t.entry)) rows.push(...infoRows(c, c.entries[t.entry]));
    }
    return rows;
  }
  function navRow(c, page) {
    const names = trail(c, page).map(n => n === "MAIN" ? "Home" : c.pages[n].title);
    return { kind: "nav", id: page !== "MAIN" ? "back" : null, text: names.join("  \u203a  "),
      count: c.counts[page] || 0, color: pageColor(c, page) };
  }
  function dialogRows(c, d) {
    const e = c ? c.entries[d.entry] : { kind: "pack", title: "?" };
    const o = d.offer || { name: e.title || "?" };
    const name = o.name || e.title || "?";
    let head, text, btns;
    if (d.kind === "confirm") {
      head = "BUY THIS ITEM?";
      text = confirmText(e, o);
      btns = [{ id: "yes", text: "YES", color: "#22c55e", style: "solid" },
        { id: "no", text: "NO", color: "#ff8a8a", style: "ghost" }];
    } else if (d.kind === "needcubits") {
      [head, text] = NEED_CUBITS;
      btns = [{ id: "getcubits", text: "YES", color: "#22c55e", style: "solid" },
        { id: "no", text: "NO", color: "#ff8a8a", style: "ghost" }];
    } else {
      [head, text] = NEED_RECUBES;
      btns = [{ id: "no", text: "OKAY", color: BLUE, style: "solid" }];
    }
    return [{ kind: "section", id: null, text: head, count: null, color: PINK },
      { kind: "row", text: name, color: TEXT, sub: text, subColor: TEXT, avatar: entryColor(e),
        initial: initial(name), btns }];
  }
  function buildRows(c, wallet, filterText = "", page = "MAIN", opened = new Set(), dialog = null) {
    if (dialog) return dialogRows(c, dialog);
    if (!c) return [{ kind: "note", text: "Loading the store…" }];
    const f = String(filterText || "").split(/\s+/).filter(Boolean).join(" ");
    if (!f) {
      if (!(page in c.pages)) page = "MAIN";
      const tiles = pageTiles(c, page);
      const rows = [navRow(c, page), ...tileRows(c, tiles, wallet, opened)];
      if (!tiles.length) rows.push({ kind: "note", text: "Nothing to buy on this page." });
      return rows;
    }
    const rows = [], shown = new Set();
    for (const [pg, ents] of sections(c)) {
      const mine = ents.filter(e => matches(c, e, f) && !shown.has(e.click));
      if (!mine.length) continue;
      for (const e of mine) shown.add(e.click);
      rows.push({ kind: "section", id: "go:" + pg.name, text: pg.title.toUpperCase(), count: mine.length,
        color: pageColor(c, pg.name) });
      rows.push(...tileRows(c, mine.map(e => ({ entry: e.index })), wallet, opened));
    }
    if (!rows.length) rows.push({ kind: "note", text: `Nothing in the store matches “${f}”.` });
    return rows;
  }

  // ------------------------------------------------------------------ model
  function createStoreModel(opts) {
    const now = opts.now || (() => Date.now());
    const C = opts.core;
    const s = { cat: null, catError: null, wallet: { cubits: null, recubes: null }, filter: "", page: "MAIN",
      clearFilter: false, opened: new Set(), dialog: null, buying: null, status: null, open: false };
    const say = (text, tone) => { s.status = { text, tone: tone || DIM }; };
    function setCatalog(cat) {
      s.cat = cat;
      s.catError = null;
    }
    // into a category (or back out), like clicking the game's tile
    function go(name) {
      if (!s.cat || !(name in s.cat.pages) || s.dialog) return;
      s.page = name;
      s.opened = new Set();
      if (s.filter) { s.filter = ""; s.clearFilter = true; }
    }
    function buy(arg) {
      if (!s.cat) return;
      const e = s.cat.entries[Number(arg)];
      if (!e) return;
      const o = offer(s.cat, e);
      if (!o) { say("The store has no price for that.", AMBER); return; }
      const t = now();
      if (s.buying && t - s.buying.at < BUY_WAIT_MS) { say(`Still buying ${s.buying.name}…`, AMBER); return; }
      const have = s.wallet[o.currency];
      if (have == null) { say(`Waiting for your ${o.currency} from the game…`, AMBER); return; }
      if (have < needed(e, o)) {
        s.dialog = { kind: o.currency === "cubits" ? "needcubits" : "needrecubes", entry: e.index, offer: o, at: t };
        return;
      }
      s.dialog = { kind: "confirm", entry: e.index, offer: o, at: t };
    }
    function yes() {
      const d = s.dialog;
      s.dialog = null;
      const t = now();
      if (!d || d.kind !== "confirm" || t - d.at > DIALOG_MS || !s.cat) return;
      const e = s.cat.entries[d.entry];
      try {
        opts.send(buyMessage(C, e));
      } catch (error) {
        say(`Couldn't reach the game: ${error && error.message ? error.message : error}`, RED);
        return;
      }
      s.buying = { name: d.offer.name, currency: d.offer.currency, before: s.wallet[d.offer.currency], at: t };
      say(`Buying ${d.offer.name}…`, CYAN);
    }
    function toCubicsStore() {
      s.dialog = null;
      if (opts.passOnce) opts.passOnce();
      say("Click Cubit Store again for Cubic's own store.", SKY);
      return true;
    }
    function click(id) {
      const at = id.indexOf(":");
      const verb = at < 0 ? id : id.slice(0, at), arg = at < 0 ? "" : id.slice(at + 1);
      if (verb === "go") {
        go(arg);
      } else if (id === "back") {
        if (s.dialog) return false;
        if (s.filter) { s.filter = ""; s.clearFilter = true; } else if (s.cat) go(s.cat.parent[s.page] || "MAIN");
      } else if (verb === "info") {
        const n = Number(arg);
        if (s.opened.has(n)) s.opened.delete(n); else s.opened.add(n);
      } else if (verb === "buy") {
        buy(arg);
      } else if (id === "yes") {
        yes();
      } else if (id === "no" || id === "okay") {
        s.dialog = null;
      } else if (id === "cubic" || id === "getcubits") {
        return toCubicsStore();
      }
      return false;
    }
    function gameEvent(ev) {
      if (ev.type === "friends_error") return false;
      if (ev.type !== "wallet") return false;
      let changed = false;
      for (const k of ["cubits", "recubes"]) {
        if (ev[k] != null && s.wallet[k] !== ev[k]) { s.wallet[k] = ev[k]; changed = true; }
      }
      const b = s.buying;
      if (changed && b && b.before != null && s.wallet[b.currency] != null && s.wallet[b.currency] < b.before) {
        say(`Bought ${b.name}! You have ${fmt(s.wallet[b.currency])} ${b.currency}.`, GREEN);
        s.buying = null;
      }
      return changed;
    }
    function tick() {
      const t = now();
      let changed = false;
      if (s.dialog && t - s.dialog.at > DIALOG_MS) { s.dialog = null; changed = true; }
      if (s.buying && t - s.buying.at > BUY_WAIT_MS) {
        say(`Sent the buy for ${s.buying.name} — check your inventory.`, AMBER);
        s.buying = null;
        changed = true;
      }
      return { changed };
    }
    return {
      state: s,
      setCatalog,
      click,
      gameEvent,
      tick,
      filter(text) { s.filter = String(text || ""); },
      opened() { s.open = true; s.filter = ""; s.page = "MAIN"; s.opened = new Set(); s.dialog = null; s.status = null; },
      // true once after the model emptied the search (the window empties its box)
      takeClearFilter() { const v = s.clearFilter; s.clearFilter = false; return v; },
      closed() { s.open = false; s.dialog = null; },
      view() {
        const w = s.wallet;
        const parts = [];
        if (w.cubits != null) parts.push(`${fmt(w.cubits)} cubits`);
        if (w.recubes != null) parts.push(`${fmt(w.recubes)} recubes`);
        let rows = buildRows(s.cat, w, s.filter, s.page, s.opened, s.dialog);
        if (!s.cat && s.catError) {
          rows = [{ kind: "note", text: "Couldn't load the store — try Cubic's own store." },
            { kind: "row", text: "Cubic's store", sub: s.catError.slice(0, 80), subColor: FAINT, avatar: SKY, initial: "C",
              btns: [{ id: "cubic", text: "Cubic's store", color: SKY, style: "ghost" }] }];
        }
        return {
          title: "Cubit Store",
          subtitle: parts.join(" · ") || "Cubic's own store",
          chip: w.cubits != null ? `${fmt(w.cubits)} cubits` : null,
          status: s.status ? s.status.text : s.cat ? `Cubic's own store · catalogue v${s.cat.version}` : "Loading the store…",
          statusColor: s.status ? s.status.tone : DIM,
          dialog: !!s.dialog,
          view: s.dialog ? "dialog" : s.filter.trim() ? "search" : s.page,
          rows
        };
      }
    };
  }

  // ------------------------------------------------------------------ window
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483646; display: none; align-items: center;
      justify-content: center; background: rgba(6,3,18,.78); backdrop-filter: blur(7px);
      font: 600 15px/1.3 "Segoe UI", system-ui, sans-serif; color: #fff; }
    .backdrop.show { display: flex; }
    .win { width: min(860px, 94vw); height: 86vh; display: flex; flex-direction: column;   /* one size for every page */
      border-radius: 22px; background: rgba(20,16,39,.97); overflow: hidden;
      box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); animation: rise .18s ease-out; }
    @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    .head { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 22px; min-height: 98px;
      background: linear-gradient(90deg,#ff4fb8,#9b5cf6,#3b82f6,#22d3ee,#9b5cf6,#ff4fb8); background-size: 300% 100%;
      animation: slide 14s linear infinite; }
    .head::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 40%; background: rgba(0,0,0,.12); pointer-events: none; }
    @keyframes slide { from { background-position: 0% 0; } to { background-position: 300% 0; } }
    .titles { flex: 1; min-width: 0; z-index: 1; }
    .title { font: 800 34px/1.1 "Segoe UI", system-ui, sans-serif; text-shadow: 0 2px 3px rgba(0,0,0,.45); }
    .subtitle { font-size: 18px; opacity: .93; text-shadow: 0 1px 2px rgba(0,0,0,.45); }
    .pill { z-index: 1; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px; border-radius: 18px;
      background: rgba(0,0,0,.2); font-size: 16px; white-space: nowrap; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #ffc53d; animation: breathe 1.6s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scale(1.25); } }
    .close { z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
      background: rgba(255,255,255,.22); color: #fff; font: 700 22px/1 "Segoe UI", sans-serif; }
    .close:hover { background: #ef4444; }
    .bar { display: flex; padding: 14px 22px 4px; }
    .bar input { flex: 1; height: 50px; border-radius: 25px; border: 2px solid #22d3ee; outline: none; padding: 0 22px;
      background: #0d0a1e; color: #fff; font: 600 18px "Segoe UI", system-ui, sans-serif; min-width: 0;
      animation: ring 4s linear infinite; }
    .bar input::placeholder { color: #7c76a6; }
    @keyframes ring { 0% { border-color: #ff4fb8; } 33% { border-color: #3b82f6; } 66% { border-color: #22d3ee; } 100% { border-color: #ff4fb8; } }
    .bar.hidden { display: none; }
    .list { flex: 1; min-height: min(420px, 44vh); overflow-y: auto; padding: 8px 18px 8px 22px; display: flex;
      flex-direction: column; gap: 8px; scrollbar-width: thin; scrollbar-color: #9b5cf6 rgba(255,255,255,.08); }
    .sec { display: flex; align-items: center; gap: 10px; padding: 12px 6px 6px; color: var(--c); font: 800 15px "Segoe UI", sans-serif;
      letter-spacing: .02em; cursor: pointer; user-select: none; border-bottom: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .sec.static { cursor: default; font-size: 18px; }
    .sec:not(.static):hover { filter: brightness(1.35); }
    .sec .count { padding: 1px 10px; border-radius: 12px; font-size: 15px; background: color-mix(in srgb, var(--c) 22%, transparent); }
    .row { position: relative; display: flex; align-items: center; gap: 16px; min-height: 68px; padding: 8px 14px 8px 18px;
      border-radius: 16px; background: #211b3e; transition: background .12s; }
    .row:hover { background: #2d2556; }
    .row:hover::before { content: ""; position: absolute; left: 6px; top: 14px; bottom: 14px; width: 4px; border-radius: 2px; background: var(--a); }
    .avatar { flex: none; width: 46px; height: 46px; border-radius: 50%; background: var(--a); display: flex; align-items: center;
      justify-content: center; font: 800 21px "Segoe UI", sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,.4);
      box-shadow: inset -6px -8px 12px rgba(0,0,0,.12), inset 6px 6px 10px rgba(255,255,255,.18); }
    .who { flex: 1; min-width: 0; }
    .name { font: 700 21px "Segoe UI", sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .sub { font-size: 16px; white-space: pre-wrap; }   /* the game's texts keep their double spaces */
    .txt { padding: 0 8px 0 82px; font-size: 15px; line-height: 1.4; margin-top: -4px; }
    .btn { flex: none; height: 38px; padding: 0 17px; border-radius: 19px; border: 0; cursor: pointer; font: 700 17px "Segoe UI", sans-serif;
      color: #fff; background: var(--b); text-shadow: 0 1px 2px rgba(0,0,0,.35); }
    .btn:hover { filter: brightness(1.22); }
    .btn.ghost { background: rgba(255,255,255,.15); color: var(--b); text-shadow: none; }
    .btn.ghost:hover { background: rgba(255,255,255,.28); filter: none; }
    .note { padding: 18px 8px; text-align: center; color: #b3aed6; font-size: 18px; }
    .nav { display: flex; align-items: center; gap: 16px; min-height: 54px; padding: 4px 2px 8px;
      border-bottom: 2px solid color-mix(in srgb, var(--c) 34%, transparent); }
    .back { flex: none; height: 38px; padding: 0 18px; border-radius: 19px; border: 0; cursor: pointer;
      font: 700 17px "Segoe UI", sans-serif; color: color-mix(in srgb, var(--c) 65%, #fff);
      background: color-mix(in srgb, var(--c) 20%, transparent); transition: background .12s, color .12s; }
    .back:hover { background: var(--c); color: #fff; }
    .crumbs { flex: 1; min-width: 0; font: 700 21px "Segoe UI", sans-serif; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .nav .count { flex: none; padding: 3px 12px; border-radius: 14px; font-size: 16px;
      color: color-mix(in srgb, var(--c) 65%, #fff); background: color-mix(in srgb, var(--c) 20%, transparent); }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .tile { position: relative; display: flex; flex-direction: column; align-items: center; height: 232px;
      padding: 16px 10px 14px; border-radius: 18px; background: #211b3e; cursor: pointer; user-select: none;
      transition: background .12s, box-shadow .12s, transform .12s; }
    .tile.dead { cursor: default; }
    .tile:not(.dead):hover { background: #2d2556; box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 70%, transparent);
      transform: translateY(-2px); }
    .pic { position: relative; flex: none; width: 92px; height: 92px; display: flex; align-items: center; justify-content: center; }
    .pic::before { content: ""; position: absolute; inset: -8px; border-radius: 50%;
      background: color-mix(in srgb, var(--a) 14%, transparent); transition: background .12s; }
    .tile:not(.dead):hover .pic::before { background: color-mix(in srgb, var(--a) 24%, transparent); }
    .pic img { position: relative; max-width: 92px; max-height: 92px; object-fit: contain; transition: transform .12s; }
    .tile:not(.dead):hover .pic img { transform: scale(1.06); }
    .bubble { position: relative; width: 76px; height: 76px; border-radius: 50%; background: var(--a); display: flex;
      align-items: center; justify-content: center; font: 800 34px "Segoe UI", sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,.4);
      box-shadow: inset -8px -10px 14px rgba(0,0,0,.12), inset 8px 8px 12px rgba(255,255,255,.18); }
    .pic img + .bubble { display: none; }
    .tname { margin-top: 6px; max-width: 100%; font: 700 21px "Segoe UI", sans-serif; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .tsub, .tnote { max-width: 100%; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tsub { margin-top: 1px; } .tnote { min-height: 21px; }
    .tbtn { margin-top: auto; min-width: 62%; max-width: 100%; height: 34px; padding: 0 18px; border-radius: 17px;
      display: flex; align-items: center; justify-content: center; font: 700 17px "Segoe UI", sans-serif; color: #fff;
      background: var(--b); text-shadow: 0 1px 2px rgba(0,0,0,.35); white-space: nowrap; }
    .tile:hover .tbtn { filter: brightness(1.22); }
    .tbtn.ghost { background: rgba(255,255,255,.15); color: var(--b); text-shadow: none; }
    .goline { margin-top: auto; margin-bottom: 6px; width: 36%; height: 5px; border-radius: 3px; background: var(--a); }
    .info { position: absolute; top: 7px; right: 7px; width: 30px; height: 30px; border-radius: 50%; border: 0; cursor: pointer;
      font: 700 17px "Segoe UI", sans-serif; color: #22d3ee; background: rgba(255,255,255,.15); z-index: 1; }
    .info:hover { background: rgba(255,255,255,.28); }
    .info.on { background: #22d3ee; color: #fff; }
    .sec[data-id] .arrow { opacity: .7; }
    .foot { display: flex; align-items: center; gap: 12px; padding: 10px 22px 14px; }
    .toast { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 16px; border-radius: 18px; font-size: 16px;
      color: var(--t); background: color-mix(in srgb, var(--t) 18%, transparent); max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toast::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--t); }
    .hint { margin-left: auto; color: #7c76a6; font-size: 15px; white-space: nowrap; }
  `;
  const esc = text => String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // a catalogue picture path -> the game's own file on cubiccastles.com, or "" (nothing that leaves store2/)
  function iconUrl(rel) {
    rel = String(rel || "").replace(/\\/g, "/").trim();
    const parts = rel.split("/");
    if (!rel || rel.startsWith("/") || rel.includes(":") || parts.some(p => p === "" || p === "." || p === "..")) return "";
    if (!/\.(png|jpe?g)$/i.test(rel)) return "";
    return ICON_URL + parts.map(encodeURIComponent).join("/");
  }
  function renderTile(t) {
    const url = iconUrl(t.icon);
    const pic = (url ? `<img src="${esc(url)}" alt="" loading="lazy" draggable="false">` : "") +
      `<div class="bubble">${esc(t.initial || "?")}</div>`;
    const info = t.info ? `<button class="info${t.info.on ? " on" : ""}" data-id="${esc(t.info.id)}" title="Info">i</button>` : "";
    const foot = t.btn ? `<div class="tbtn${t.btn.style === "ghost" ? " ghost" : ""}" style="--b:${t.btn.color}">${esc(t.btn.text)}</div>`
      : t.go ? `<div class="goline"></div>` : "";
    return `<div class="tile${t.id ? "" : " dead"}" style="--a:${t.color}"${t.id ? ` data-id="${esc(t.id)}"` : ""}>${info}` +
      `<div class="pic">${pic}</div><div class="tname">${esc(t.text)}</div>` +
      `<div class="tsub" style="color:${t.subColor || DIM}">${esc(t.sub || "")}</div>` +
      `<div class="tnote" style="color:${t.noteColor || FAINT}">${esc(t.note || "")}</div>${foot}</div>`;
  }
  function renderRows(rows) {
    return rows.map(r => {
      if (r.kind === "nav") {
        return `<div class="nav" style="--c:${r.color}">` +
          (r.id ? `<button class="back" data-id="${esc(r.id)}">‹&nbsp; Back</button>` : "") +
          `<div class="crumbs">${esc(r.text)}</div><div class="count">${fmt(r.count)} item${r.count === 1 ? "" : "s"}</div></div>`;
      }
      if (r.kind === "tiles") return `<div class="grid">${(r.tiles || []).map(renderTile).join("")}</div>`;
      if (r.kind === "section") {
        return `<div class="sec${r.id ? "" : " static"}" style="--c:${r.color}"${r.id ? ` data-id="${esc(r.id)}"` : ""}>` +
          `<span>${esc(r.text)}</span>${r.count != null ? `<span class="count">${r.count}</span>` : ""}</div>`;
      }
      if (r.kind === "note") return `<div class="note">${esc(r.text)}</div>`;
      if (r.kind === "text") return `<div class="txt" style="color:${r.color}">${esc(r.text)}</div>`;
      const btns = (r.btns || []).map(b =>
        `<button class="btn${b.style === "ghost" ? " ghost" : ""}" style="--b:${b.color}" data-id="${esc(b.id)}">${esc(b.text)}</button>`).join("");
      return `<div class="row" style="--a:${r.avatar}"><div class="avatar">${esc(r.initial)}</div>` +
        `<div class="who"><div class="name" style="color:${r.color}">${esc(r.text)}</div>` +
        `<div class="sub" style="color:${r.subColor}">${esc(r.sub || "")}</div></div>${btns}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------------ page glue
  function bytesFromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function install(win) {
    if (win.CCStore) return;
    const doc = win.document;
    const Core = win.CCBrowserCore;
    const MAIN_SOURCE = "cc-browser-mod-main-v1", BRIDGE_SOURCE = "cc-browser-mod-bridge-v1";
    let enabled = true, passOnce = false;
    let transport = null;
    let host = null, dom = null, loading = null, closeTimer = null;
    let view = null, viewScroll = {};

    const model = createStoreModel({
      core: Core,
      send(body) {
        if (!transport || typeof transport.sendBody !== "function") throw new Error("the game connection isn't ready yet");
        transport.sendBody(body);
      },
      passOnce() { passOnce = true; }
    });

    // The catalogue: the extension's background worker fetches the game's own
    // file (the page itself can't read cubiccastles.com); straight fetch as a
    // fallback for an older extension folder.
    function fetchViaBridge() {
      return new Promise((resolve, reject) => {
        const requestId = `store-${Date.now()}-${Math.random()}`;
        const timer = setTimeout(() => { win.removeEventListener("message", onReply); reject(new Error("no answer from the extension")); }, 15000);
        function onReply(event) {
          const d = event.data;
          if (event.source !== win || !d || d.source !== BRIDGE_SOURCE || d.type !== "store-catalog" || d.requestId !== requestId) return;
          win.removeEventListener("message", onReply);
          clearTimeout(timer);
          if (d.ok && d.b64) resolve(bytesFromBase64(d.b64)); else reject(new Error(d.message || "store unavailable"));
        }
        win.addEventListener("message", onReply);
        win.postMessage({ source: MAIN_SOURCE, type: "store-catalog", requestId }, "*");
      });
    }
    function loadCatalog() {
      if (model.state.cat || loading) return loading;
      loading = fetchViaBridge()
        .catch(() => fetch(STORE_URL, { cache: "no-cache", credentials: "omit" })
          .then(r => { if (!r.ok) throw new Error(`store HTTP ${r.status}`); return r.arrayBuffer(); })
          .then(b => new Uint8Array(b)))
        .then(raw => { model.setCatalog(parseCatalog(decodeCache(raw), "WASM")); })
        .catch(error => { model.state.catError = String(error && error.message || error); })
        .finally(() => { loading = null; render(); });
      return loading;
    }

    function build() {
      if (host || !doc.documentElement) return;
      host = doc.createElement("div");
      host.id = "cc-store-host";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${CSS}</style>
        <div class="backdrop" id="backdrop">
          <div class="win" id="win">
            <div class="head">
              <div class="titles"><div class="title" id="title">Cubit Store</div><div class="subtitle" id="subtitle"></div></div>
              <div class="pill" id="chip"><span class="dot"></span><span id="chipText"></span></div>
              <button class="close" id="close" title="Close (Esc)">×</button>
            </div>
            <div class="bar" id="bar"><input id="search" placeholder="Search the store…" maxlength="40" autocomplete="off"></div>
            <div class="list" id="list"></div>
            <div class="foot"><div class="toast" id="toast"></div><div class="hint">Type to search · Esc closes</div></div>
          </div>
        </div>`;
      const $ = id => shadow.getElementById(id);
      dom = { shadow, backdrop: $("backdrop"), win: $("win"), subtitle: $("subtitle"), chip: $("chip"), chipText: $("chipText"),
        close: $("close"), bar: $("bar"), search: $("search"), list: $("list"), toast: $("toast") };
      (doc.body || doc.documentElement).appendChild(host);
      for (const type of ["mousedown", "mouseup", "click", "dblclick", "wheel", "pointerdown", "pointerup",
        "contextmenu", "touchstart", "touchend"]) {
        dom.backdrop.addEventListener(type, event => event.stopPropagation());
      }
      dom.backdrop.addEventListener("mousedown", event => { if (event.target === dom.backdrop) close("outside"); });
      dom.close.addEventListener("click", () => close("button"));
      dom.win.addEventListener("click", event => {
        const el = event.target.closest && event.target.closest("[data-id]");
        if (!el) return;
        const leave = model.click(el.dataset.id);
        render();
        if (leave) { clearTimeout(closeTimer); closeTimer = setTimeout(() => close("cubic"), 1600); }
      });
      dom.search.addEventListener("input", () => { model.filter(dom.search.value); render(); });
      // a picture the site doesn't have: the tile keeps its bubble
      dom.list.addEventListener("error", event => { if (event.target.tagName === "IMG") event.target.remove(); }, true);
    }

    function render() {
      if (!dom || !model.state.open) return;
      const v = model.view();
      dom.subtitle.textContent = v.subtitle;
      dom.chip.style.display = v.chip ? "" : "none";
      dom.chipText.textContent = v.chip || "";
      dom.bar.classList.toggle("hidden", v.dialog);
      if (model.takeClearFilter()) dom.search.value = "";
      // each view (a page, the search, a dialog) keeps its own scroll: Back lands where you were
      if (v.view !== view) {
        if (view !== null) viewScroll[view] = dom.list.scrollTop;
        view = v.view;
        dom.list.innerHTML = renderRows(v.rows);
        dom.list.scrollTop = viewScroll[view] || 0;
      } else {
        const scroll = dom.list.scrollTop;
        dom.list.innerHTML = renderRows(v.rows);
        dom.list.scrollTop = scroll;
      }
      dom.toast.textContent = v.status;
      dom.toast.style.setProperty("--t", v.statusColor);
    }
    function open() {
      build();
      if (!dom) return;
      for (const other of [win.CCFriends, win.CCProfile, win.CCPerks]) if (other && typeof other.close === "function") other.close();
      model.opened();
      dom.search.value = "";
      view = null;
      viewScroll = {};
      dom.backdrop.classList.add("show");
      dom.win.style.animation = "none";
      void dom.win.offsetWidth;
      dom.win.style.animation = "";
      dom.list.scrollTop = 0;
      render();
      loadCatalog();
      setTimeout(() => dom.search.focus(), 0);
    }
    function close() {
      if (!dom || !model.state.open) return;
      model.closed();
      dom.backdrop.classList.remove("show");
      const canvas = doc.getElementById("canvas");
      if (canvas) canvas.focus();
    }

    // While open, typing goes to the search box and nothing reaches the game.
    win.addEventListener("keydown", event => {
      if (!model.state.open) return;
      const path = event.composedPath ? event.composedPath() : [];
      const inBox = dom && path.includes(dom.search);
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); close("escape"); return; }
      if (event.key === "Backspace" && !dom.search.value) {          // an empty search: Back
        event.preventDefault();
        model.click("back");
        render();
        return;
      }
      if (!inBox) event.preventDefault();
    }, true);
    win.addEventListener("keypress", event => { if (model.state.open) event.stopImmediatePropagation(); }, true);

    setInterval(() => { if (model.state.open && model.tick().changed) render(); }, 250);

    win.CCStore = {
      // Called by cc-browser-wasm-friends.js in place of the game's own store.
      // false = the untouched game store opens (disabled, or "Cubic's store").
      interceptNativeAction() {
        if (passOnce) { passOnce = false; return false; }
        if (!enabled) return false;
        open();
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
      status: () => ({ enabled, open: model.state.open, catalogue: model.state.cat ? model.state.cat.version : null,
        wallet: { ...model.state.wallet } })
    };
  }

  return { createStoreModel, parseCatalog, decodeCache, lzDecompress, offer, sections, pageTiles, trail, buildRows,
    confirmText, buyMessage, wrap, renderRows, iconUrl, STORE_URL, install };
});
