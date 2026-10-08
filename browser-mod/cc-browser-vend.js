/* Vending popup price-card logic shared by the browser UI and offline tests. */
(function installVendCore(root, factory) {
  const api = factory();
  root.CCBrowserVend = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeVendCore() {
  "use strict";

  const VEND_IDS = new Set([769, 1729, 1730, 1731]);

  function normalizeItem(name) {
    return String(name || "").toLowerCase().replace(/[-/]+/g, " ")
      .replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  }

  function realmKey(name) {
    return String(name || "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number).toLocaleString("en-US") : String(value);
  }

  function vendsIndexFromData(data) {
    const index = new Map();
    if (!data || typeof data !== "object" || Array.isArray(data)) return index;
    for (const [realm, entry] of Object.entries(data)) {
      if (!entry || typeof entry !== "object") continue;
      for (const machine of entry.machines || []) {
        const item = String(machine && machine.item || "").trim();
        const normalized = normalizeItem(item);
        const price = Number(machine && machine.price);
        if (!normalized || !Number.isFinite(price) || price <= 0) continue;
        const listing = {
          display: item,
          price: Math.trunc(price),
          currency: String(machine.currency || "Cubits"),
          qty: Number.isFinite(Number(machine.qty)) ? Math.trunc(Number(machine.qty)) : null,
          realm,
          owner: entry.owner || null,
          link: entry.link || null
        };
        if (!index.has(normalized)) index.set(normalized, []);
        index.get(normalized).push(listing);
      }
    }
    return index;
  }

  function communityIndexFromData(data) {
    const index = new Map();
    if (!Array.isArray(data)) return index;
    const pattern = /^(.+?):\s*([\d,]+)\s*-\s*([\d,]+)/;
    for (const entry of data) {
      const words = entry && entry.words;
      const match = Array.isArray(words) && words.length ? pattern.exec(String(words[0])) : null;
      if (!match) continue;
      const display = match[1].trim();
      const normalized = normalizeItem(display);
      const min = Number(match[2].replace(/,/g, ""));
      const max = Number(match[3].replace(/,/g, ""));
      if (!normalized || !Number.isFinite(min) || !Number.isFinite(max)) continue;
      index.set(normalized, { display, min, max, status: entry.status || "Stable" });
    }
    return index;
  }

  function createPriceBook(vendsData, communityData) {
    return {
      loaded: !!vendsData,
      error: null,
      vends: vendsIndexFromData(vendsData),
      community: communityIndexFromData(communityData),
      listings(item) { return this.vends.get(normalizeItem(item)) || []; },
      value(item) { return this.community.get(normalizeItem(item)) || null; }
    };
  }

  function line(text, tone) {
    return { text, tone: tone || "normal" };
  }

  function secondCheapestLine(listings, realm) {
    const elsewhere = listings.filter(item => realmKey(item.realm) !== realmKey(realm));
    if (!elsewhere.length) return line("2nd cheapest: no other shop lists it", "muted");
    const next = elsewhere.reduce((best, item) => !best || item.price < best.price ? item : best, null);
    return line(`2nd cheapest: ${formatNumber(next.price)} ${next.currency} · ${next.realm}`, "best");
  }

  // How many of the cheapest OTHER shops set the "market low" the verdict compares against.
  const MARKET_SAMPLE = 3;

  function unitOf(price, qty) {
    const count = Number.isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : 1;
    return price / count;
  }

  // Average per-unit price of the cheapest few shops (each realm counted once, at its
  // cheapest), skipping this machine's own listing so it can't vouch for itself.
  function marketLow(listings, realm, price, qty) {
    let skippedSelf = false;
    const perRealm = new Map();
    for (const entry of listings) {
      if (!skippedSelf && realmKey(entry.realm) === realmKey(realm) && entry.price === price &&
          (entry.qty == null || entry.qty === qty)) {
        skippedSelf = true;
        continue;
      }
      const unit = unitOf(entry.price, entry.qty);
      const key = realmKey(entry.realm);
      if (!perRealm.has(key) || unit < perRealm.get(key)) perRealm.set(key, unit);
    }
    const cheapest = Array.from(perRealm.values()).sort((a, b) => a - b).slice(0, MARKET_SAMPLE);
    if (!cheapest.length) return null;
    return { unit: cheapest.reduce((sum, unit) => sum + unit, 0) / cheapest.length, shops: cheapest.length };
  }

  function marketVerdict(unitPrice, low) {
    const ratio = unitPrice / low.unit;
    if (ratio < 0.9) return { text: "Under value", tone: "good" };
    if (ratio <= 1.1) return { text: "Good price", tone: "good" };
    if (ratio <= 1.35) return { text: "Above value", tone: "warn" };
    return { text: "Overpriced", tone: "bad" };
  }

  function popupCard(offer, realm, book, stock = null) {
    if (!offer || !offer.item || !Number.isFinite(Number(offer.price))) return null;
    const item = String(offer.item);
    const price = Math.trunc(Number(offer.price));
    const currency = String(offer.currency || "Cubits");
    const qty = Number.isFinite(Number(offer.qty)) && Number(offer.qty) > 0 ?
      Math.trunc(Number(offer.qty)) : 1;
    const lines = [line(item, "title")];
    if (stock == null) lines.push(line("In stock: unknown", "muted"));
    else if (stock <= 0) lines.push(line("In stock: 0 — sold out", "bad"));
    else lines.push(line(`In stock: ${formatNumber(stock)}`, "normal"));

    let accent = "normal";
    if (!book || !book.loaded) {
      lines.push(line(book && book.error ? "prices unavailable" : "loading prices…", "muted"));
      return { lines, accent };
    }
    const listings = book.listings(item).filter(entry => entry.currency === currency);
    if (listings.length) {
      const best = listings.reduce((winner, entry) => !winner || entry.price < winner.price ? entry : winner, null);
      if (price <= best.price) {
        lines.push(line("Cheapest known: this machine", "best"));
        lines.push(secondCheapestLine(listings, realm));
      } else {
        const where = realmKey(best.realm) === realmKey(realm) ? "this shop" : best.realm;
        lines.push(line(`Cheapest: ${formatNumber(best.price)} ${currency} · ${where}`, "best"));
      }
    } else {
      lines.push(line("Cheapest: not listed in any scanned shop", "muted"));
    }
    const value = book.value(item);
    const unitPrice = unitOf(price, qty);
    const low = marketLow(listings, realm, price, qty);
    if (low) {
      const verdict = marketVerdict(unitPrice, low);
      lines.push(line(verdict.text, verdict.tone));
      accent = verdict.tone;
    } else if (value && currency === "Cubits") {
      // Nobody else sells it — fall back to the community value range.
      if (unitPrice < value.min) {
        lines.push(line("Under value", "good"));
        accent = "good";
      } else if (unitPrice <= value.max) {
        lines.push(line("Good price", "good"));
        accent = "good";
      } else {
        lines.push(line("Overpriced", "bad"));
        accent = "bad";
      }
    }
    return { lines, accent };
  }

  function coordKey(coord) {
    return Array.isArray(coord) ? coord.join(",") : "";
  }

  function findVendStock(grid, objects, clickedCoord) {
    if (!grid || !Array.isArray(grid.blocks) || !Array.isArray(clickedCoord)) return null;
    const cells = new Map(grid.blocks.map(block => [coordKey([block.x, block.y, block.z]), block.id]));
    const clicked = clickedCoord.map(Number);
    let vend = null;
    if (VEND_IDS.has(cells.get(coordKey(clicked)))) {
      vend = clicked;
    } else {
      const below = [clicked[0], clicked[1], clicked[2] + 1];
      if (VEND_IDS.has(cells.get(coordKey(below)))) vend = below;
    }
    if (!vend) return null;
    const glass = [vend[0], vend[1], vend[2] - 1];
    const rows = objects instanceof Map ? Array.from(objects.values()) : Array.from(objects || []);
    const stock = rows.filter(object => object && object.source === 0x000f &&
      object.bx === glass[0] && object.by === glass[1] && object.bz === glass[2] &&
      (object.ox == null || object.ox === 0) && (object.oy == null || object.oy === 0) &&
      (object.oz == null || object.oz === 0)).length;
    return { vend, glass, glassKey: coordKey(glass), stock };
  }

  function searchListings(book, query, limit = 80) {
    if (!book || !book.loaded || !book.vends) return [];
    const normalized = normalizeItem(query);
    const realmNeedle = realmKey(query);
    if (!normalized && !realmNeedle) return [];
    const results = [];
    for (const [itemKey, listings] of book.vends.entries()) {
      for (const listing of listings) {
        const itemMatch = !!normalized && itemKey.includes(normalized);
        const realmMatch = realmKey(listing.realm).includes(realmNeedle);
        const ownerMatch = realmKey(listing.owner).includes(realmNeedle);
        if (!itemMatch && !realmMatch && !ownerMatch) continue;
        results.push({
          ...listing,
          item: listing.display,
          exactItem: itemKey === normalized,
          itemStarts: itemKey.startsWith(normalized),
          realmStarts: realmKey(listing.realm).startsWith(realmNeedle)
        });
      }
    }
    results.sort((left, right) =>
      Number(right.exactItem) - Number(left.exactItem) ||
      Number(right.itemStarts) - Number(left.itemStarts) ||
      Number(right.realmStarts) - Number(left.realmStarts) ||
      left.price - right.price ||
      left.item.localeCompare(right.item) ||
      left.realm.localeCompare(right.realm));
    return results.slice(0, Math.max(1, Math.min(250, Number(limit) || 80)));
  }

  // ---- vend warp: which machine sells an item, and where to stand in front of it.
  // Twin of stage2/mods/cc_vendwarp.py (same scoring, same tests' expectations).
  const COORD_BASE = 100000;
  const OBJECT_KIND_SECTION = { 1: "BLOCKS", 2: "WEAR", 5: "MISC", 6: "SPECIAL" };
  const SIDES = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  function objectName(object, names) {
    const section = names && names[OBJECT_KIND_SECTION[object.kind]];
    const name = section && section[object.typeId];
    return name && name !== "(Unused)" ? String(name) : `item #${object.typeId}`;
  }

  // Every vending machine with something in the glass above it:
  // [{vend: [x, y, z], glass, count, items: Set(normalized names)}].
  function vendGlass(grid, objects, names) {
    if (!grid || !Array.isArray(grid.blocks)) return [];
    const stored = new Map();
    const rows = objects instanceof Map ? Array.from(objects.values()) : Array.from(objects || []);
    for (const object of rows) {
      if (!object || (object.source !== 0x000f && object.source !== 0x0021)) continue;
      if (object.ox || object.oy) continue;                 // loose / dropped loot
      const key = coordKey([object.bx, object.by, object.bz]);
      if (!stored.has(key)) stored.set(key, []);
      stored.get(key).push(object);
    }
    const out = [];
    for (const block of grid.blocks) {
      if (!VEND_IDS.has(block.id)) continue;
      const glass = [block.x, block.y, block.z - 1];
      const inside = stored.get(coordKey(glass)) || [];
      if (!inside.length) continue;
      out.push({ vend: [block.x, block.y, block.z], glass, count: inside.length,
                 items: new Set(inside.map(object => normalizeItem(objectName(object, names)))) });
    }
    return out;
  }

  // Where a displayed item sits relative to ITS machine, most likely first
  // (twin of cc_vendwarp.MACHINE_OFFSETS): straight below, then beside / two up.
  const MACHINE_OFFSETS = (() => {
    const dzPref = new Map([[1, 0], [2, 1], [0, 2], [-1, 3]]);
    const out = [];
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        for (const dz of dzPref.keys()) if (dx || dy || dz) out.push([dx, dy, dz]);
      }
    }
    const key = o => [Math.abs(o[0]) + Math.abs(o[1]), dzPref.get(o[2]), Math.abs(o[0]), Math.abs(o[1])];
    return out.sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
  })();

  // Every vending machine showing `item`: the cells whose stored records are
  // that item, then each one's nearest machine. -> [{vend, glass, count}].
  function machinesSelling(grid, objects, item, names) {
    const want = normalizeItem(item);
    if (!want || !grid || !Array.isArray(grid.blocks)) return [];
    const cells = new Map();
    const rows = objects instanceof Map ? Array.from(objects.values()) : Array.from(objects || []);
    for (const object of rows) {
      if (!object || (object.source !== 0x000f && object.source !== 0x0021)) continue;
      if (object.ox || object.oy) continue;                 // loose / dropped loot
      if (normalizeItem(objectName(object, names)) !== want) continue;
      const key = coordKey([object.bx, object.by, object.bz]);
      const cell = cells.get(key) || { glass: [object.bx, object.by, object.bz], count: 0 };
      cell.count += 1;
      cells.set(key, cell);
    }
    if (!cells.size) return [];
    const vends = new Set(grid.blocks.filter(block => VEND_IDS.has(block.id))
      .map(block => coordKey([block.x, block.y, block.z])));
    const found = new Map();
    for (const cell of cells.values()) {
      const [x, y, z] = cell.glass;
      for (const [dx, dy, dz] of MACHINE_OFFSETS) {
        const vend = [x + dx, y + dy, z + dz];
        if (!vends.has(coordKey(vend))) continue;
        if (!found.has(coordKey(vend))) found.set(coordKey(vend), { vend, glass: cell.glass, count: cell.count });
        break;
      }
    }
    return Array.from(found.values());
  }

  // Cells holding a block. Id 0 entries are air that only carries extra data.
  function solidCells(grid) {
    return new Set((grid && grid.blocks || []).filter(block => block.id)
      .map(block => coordKey([block.x, block.y, block.z])));
  }

  function standSpots(solid, vend, size) {
    const [vx, vy, vz] = vend;
    const has = (x, y, z) => solid.has(coordKey([x, y, z]));
    const out = [];
    for (const dist of [1, 2]) {
      for (const [dx, dy] of SIDES) {
        for (const dz of [0, 1, -1]) {
          const x = vx + dx * dist, y = vy + dy * dist, z = vz + dz;
          if (Math.min(x, y, z) < 0) continue;
          if (size && (x >= size[0] || y >= size[1] || z + 1 >= size[2])) continue;
          if (has(x, y, z) || has(x, y, z - 1) || !has(x, y, z + 1)) continue;
          if (dist === 2 && has(vx + dx, vy + dy, vz + dz) && has(vx + dx, vy + dy, vz + dz - 1)) continue;
          let score = -10 * (dist - 1) - 3 * Math.abs(dz);
          if (has(vx - dx, vy - dy, vz)) score += 4;       // wall behind = machine's front
          out.push({ cell: [x, y, z], score });
        }
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // -> {vend, stand, wire, machines} or {error}. `player` in wire units.
  function planVendWarp(grid, objects, item, player, names) {
    const machines = machinesSelling(grid, objects, item, names);
    if (!machines.length) return { error: `no machine here shows ${item} in its glass` };
    const solid = solidCells(grid);
    const here = Array.isArray(player) ? player.map(value => value / COORD_BASE) : null;
    let best = null;
    for (const row of machines) {
      const spots = standSpots(solid, row.vend, grid.size);
      if (!spots.length) continue;
      let score = spots[0].score;
      if (here) score -= 0.001 * spots[0].cell.reduce((sum, v, i) => sum + (v - here[i]) ** 2, 0);
      if (!best || score > best.score) best = { score, row, cell: spots[0].cell };
    }
    if (!best) {
      return { error: `found ${machines.length} machine(s) with ${item} but no free spot beside them` };
    }
    return { vend: best.row.vend, stand: best.cell, machines: machines.length,
             wire: best.cell.map(value => value * COORD_BASE) };
  }

  function closeTo(position, wire, blocks = 1) {
    return Array.isArray(position) && position.length === 3 &&
      position.every((value, axis) => Math.abs(value - wire[axis]) <= blocks * COORD_BASE);
  }

  return {
    VEND_IDS,
    closeTo,
    machinesSelling,
    planVendWarp,
    solidCells,
    standSpots,
    vendGlass,
    communityIndexFromData,
    createPriceBook,
    findVendStock,
    formatNumber,
    normalizeItem,
    popupCard,
    realmKey,
    searchListings,
    vendsIndexFromData
  };
});
