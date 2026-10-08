/*
 * Custom profile window for the browser client (castles.cc) — the same
 * window cubic-mods.exe draws inside the Steam client (stage2/mods/cc_profile.py).
 *
 * Opening it: press Escape and click Profile as usual (cc-browser-wasm-friends.js
 * intercepts the game's menu action before its own profile is built), or F2.
 *
 *   header: <name>'s Profile · clan · N perks · [Level 44] [×]
 *   BASIC INFO  Player Level (XP, % to the next level, bar), Farming Level,
 *               crops harvested, clan + rank
 *   SWIRLS      the swirls you own, each with its on/off switch
 *   PERKS       your perks: level N of M, what it does now, a level bar,
 *               [More] lists every level, a switch where the game has one
 *   NOT YET     (folded) the perks you don't have yet
 *
 * The data is your own network state (cc-browser-core.js): rx 0x0005 for you
 * (sent on every realm join), rx 0x00b1 XP, rx 0x00b4 perks. The switches
 * send exactly the game's own messages (0x0125/0x014e/0x014f/0x0150 swirls,
 * 0x00bb perks) and show your choice until the game's state agrees (or 8 s).
 *
 * createProfileModel() is the whole state machine with no DOM; its rows are
 * the same as cc_profile.build_rows (node tests: test-profile.js).
 */
(function installProfile(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    root.CCProfileLib = api;               // the perk table + helpers, for cc-browser-perks.js
    api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function makeProfile(root) {
  "use strict";

  const GREEN = "#3fb950", AMBER = "#f5a524", RED = "#ef4444", PINK = "#ff4fb8", CYAN = "#22d3ee",
    TEXT = "#ffffff", DIM = "#b3aed6", FAINT = "#7c76a6", PURPLE = "#9b5cf6", LEAF = "#73d13d";
  const AVATAR_COLORS = ["#ff4fb8", "#ff7a45", "#ffc53d", "#36cfc9", "#40a9ff",
    "#9254de", "#f759ab", "#73d13d", "#597ef7", "#ff9c6e"];
  const SWIRL_COLORS = { patron: "#ffc53d", peace: "#36cfc9", lightning: "#40a9ff", smile: "#ff4fb8" };
  // [key, label, owned flag, on flag] — the game's swirls, in its order
  const SWIRLS = [["patron", "Patron Swirl", 3, 23], ["peace", "Peace Swirl", 41, 44],
    ["lightning", "Lightning Swirl", 42, 45], ["smile", "Smile Swirl", 43, 46]];
  const PENDING_MS = 8000;

  // Every perk by id: [name, can be switched off, what each level gives] —
  // read out of the game (see cc_profile.PERKS; test-profile.js checks they match).
  const PERKS = [
    ["Carpenter", false, [  // 0
      "You can use workbenches to craft new items!",
      "You can use a saw when crafting!",
      "You can use a knife when crafting!"]],
    ["Hammer Time", false, [  // 1
      "You can use a stone hammer when crafting!",
      "You can use a steel hammer when crafting!"]],
    ["Smith", false, [  // 2
      "Forge items up to 50% faster when nearby!",
      "Forge items up to twice as fast when nearby!",
      "Your fuel will last 2X longer if nearby!",
      "Your fuel will last 3X longer if nearby!"]],
    ["Chemist", false, [  // 3
      "25% faster distiller output when nearby!",
      "50% faster distiller output when nearby!"]],
    ["Geologist", false, [  // 4
      "You get the strength to mine metallic ores!",
      "When using an extractor 25% faster output if you're nearby!"]],
    ["Engineer", false, [  // 5
      "You can use a wrench when crafting!",
      "You can use a screwdriver when crafting!"]],
    ["Mason", false, [  // 6
      "You can use a chisel when crafting!"]],
    ["Fashionista", false, [  // 7
      "Double the chance when buying clothes to get rare or uncommon items!",
      "Triple the chance when buying clothes to get rare or uncommon items!"]],
    null,  // 8: unused (the game calls it UNKNOWN PERK)
    ["Miner", false, [  // 9
      "You get a 5% chance to get double resources when mining!",
      "You get a 10% chance to find double resources when mining!",
      "You get a 15% chance to find double resources when mining!"]],
    ["Packrat", false, [  // 10
      "You can carry one more row of items without slowing down!",
      "You can carry one more row of items without slowing down!"]],
    ["Speed Demon", true, [  // 11
      "You can walk 5% faster!",
      "You can walk 10% faster!",
      "You can walk 15% faster!"]],
    ["Jumpman", true, [  // 12
      "You can jump one block higher!"]],
    ["Brawny", true, [  // 13
      "You take 25% less damage when hurt!",
      "You take 50% less damage when hurt!"]],
    ["Merchant", false, [  // 14
      "You save 5% in the cubit store!",
      "You save 10% in the cubit store!"]],
    ["Attractor", true, [  // 15
      "Objects that you mine will be attracted to you!"]],
    ["Health", true, [  // 16
      "You get one extra heart!"]],
    ["Craftmaster", false, [  // 17
      "You get a 5% chance of double output when crafting!",
      "You get a 10% chance of double output when crafting!"]],
    ["Fancy", true, [  // 18
      "You get your name in a fancy-shmancy new font!"]],
    ["Luck", false, [  // 19
      "You have a 5% chance of finding double cubits!",
      "You have a 10% chance of finding double cubits!",
      "You have a 15% chance of finding double cubits!"]],
    ["Spindizzy", true, [  // 20
      "You'll execute an exciting twirl when you double jump!"]],
    ["Harvester", false, [  // 21
      "You get a 5% chance to harvest double items from plants!",
      "You get a 10% chance to harvest double items from plants!",
      "You get a 15% chance to harvest double items from plants!"]],
    ["Fishmaster", false, [  // 22
      "Reduces the amount of time to catch a fish!",
      "Improves your chance to get a rare fish by 10%!",
      "Improves your chance to get a rare fish by 20%!"]],
    ["Super XP", false, [  // 23
      "You will earn 5% more experience!",
      "You will earn 10% more experience!",
      "You will earn 20% more experience!"]],
    ["Emo", false, [  // 24
      "Any emoticons you type will appear on your character's face"]],
    ["Faster Mining", false, [  // 25
      "You can mine blocks 50% faster!",
      "You can mine blocks 75% faster!"]],
    ["Pet Pal", false, [  // 26
      "Your pets gain experience 5% faster!",
      "Your pets gain experience 10% faster!",
      "Your pets gain experience 15% faster!"]],
    ["Robotik", true, [  // 27
      "You get your name in digitally robotic new font, human."]],
    ["Zany", true, [  // 28
      "You!!! Get your name!!! In a zany fun font!!!"]],
    ["Eastern", true, [  // 29
      "You get your name in an elegant eastern font, grasshopper."]],
    ["Horror", true, [  // 30
      "You get your name in a dreadfully nightmarish font."]],
    ["Hydro Expert", true, [  // 31
      "Your dehydrated cubes rehydrate 5% faster!",
      "Your dehydrated cubes rehydrate 10% faster!"]],
    ["Promoter", false, [  // 32
      "5% chance of not losing one of your hollas when you promote!",
      "10% chance of not losing one of your hollas when you promote!",
      "15% chance of not losing one of your hollas when you promote!"]],
    ["More Cubits!", false, [  // 33
      "Get 1000 cubits right now!",
      "Get 1000 cubits right now!",
      "Get 1000 cubits right now!"]],
    ["Land Manager", false, [  // 34
      "Manage up to 20 Crops in 1 realm!",
      "Manage up to 50 Crops in 1 realm!",
      "Manage up to 100 Crops in 2 realms!",
      "Manage up to 250 Crops in 3 realms!",
      "Manage up to 500 Crops in 5 realms!"]],
    ["Poultryman", false, [  // 35
      "You can raise 2 chickens per realm!",
      "You can raise 5 chickens per realm!",
      "You can raise 15 chickens per realm!"]],
    ["Cattle Rancher", false, [  // 36
      "You can raise 2 cows per realm!",
      "You can raise 5 cows per realm!",
      "You can raise 15 cows per realm!"]],
    ["Pig Pal!", false, [  // 37
      "You can raise 2 pigs per realm!",
      "You can raise 5 pigs per realm!",
      "You can raise 15 pigs per realm!"]],
    ["Farm Tech", false, [  // 38
      "You can use of small sprinklers!",
      "You can use of large sprinklers!",
      "You can harvest crops using a tractor!"]],
    ["Botany", false, [  // 39
      "You can grow corn!",
      "You can grow eggplant!",
      "You can grow wheat!!"]],
    ["Crop Converter", false, [  // 40
      "You can extract corn oil from corn!",
      "You can extract flour from wheat!"]],
  ];

  // ------------------------------------------------------------------ helpers
  // the same colours as the exe (cc_friendlist: zlib.crc32 of the lower-cased name)
  function crc32(text) {
    const bytes = new TextEncoder().encode(text);
    let c = ~0;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }
  const avatarColor = name => AVATAR_COLORS[crc32(String(name).toLocaleLowerCase()) % AVATAR_COLORS.length];
  // Python's round(): halves go to the even neighbour
  function roundHalfEven(v) {
    const f = Math.floor(v), d = v - f;
    if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
    return Math.round(v);
  }
  function mute(color, k = 0.55) {
    const c = parseInt(color.slice(1), 16), base = [0x2a, 0x24, 0x48];
    return "#" + [16, 8, 0].map((s, i) =>
      roundHalfEven(((c >> s) & 255) * (1 - k) + base[i] * k).toString(16).padStart(2, "0")).join("");
  }
  function initial(name) {
    for (const ch of String(name)) if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
    return "?";
  }
  const perkColor = pid => AVATAR_COLORS[pid % AVATAR_COLORS.length];
  const fmt = n => Number(n).toLocaleString("en-US");

  function profileTitle(name) {
    name = String(name || "").trim();
    if (!name) return "Your Profile";
    return name + (/[sS]$/.test(name) ? "' Profile" : "'s Profile");
  }

  function entityFlag(flags, n) {
    const i = n >> 3;
    return !!(flags && i < flags.length && (flags[i] & (1 << ((n - 1) & 7))));
  }
  const swirlStates = p => SWIRLS.map(([key, label, own, on]) =>
    [key, label, entityFlag(p.flags, own), entityFlag(p.flags, on)]);
  function perkStates(p) {
    const perks = p.perks || [], out = [];
    PERKS.forEach((info, pid) => {
      if (!info) return;
      const b = pid < perks.length ? perks[pid] : 0;
      out.push([pid, b & 0x7f, !!(b & 0x80)]);
    });
    return out;
  }
  function pct(v) {
    const n = Math.trunc(Number(v));
    return v == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n));
  }

  // ------------------------------------------------------------------ rows
  // Same rows as cc_profile.build_rows (the parity test compares them).
  function buildRows(p, collapsed = new Set(), expanded = new Set(), switches = {}) {
    if (!p) return [{ kind: "note", text: "Loading your profile…" }];
    const section = (sid, title, count, color) => ({
      kind: "section", id: "sec:" + sid, text: (collapsed.has(sid) ? "►  " : "▼  ") + title,
      count, color, folded: collapsed.has(sid)
    });
    const rows = [section("basic", "BASIC INFO", null, CYAN)];
    if (!collapsed.has("basic")) {
      const level = p.level;
      if (level != null) {
        const xpPct = pct(p.xpPct), xp = p.xp;
        rows.push({ kind: "row", text: `Player Level ${level}`, color: TEXT,
          sub: xp != null && xpPct != null ? `${fmt(xp)} XP · ${xpPct}% of the way to Level ${level + 1}`
            : "Your XP shows the next time you enter a realm",
          subColor: DIM, avatar: PURPLE, initial: String(level), bar: (xpPct || 0) / 100, barColor: PINK });
      }
      if (p.farmLevel != null) {
        const fp = pct(p.farmPct);
        rows.push({ kind: "row", text: `Farming Level ${p.farmLevel}`, color: TEXT,
          sub: `${fp || 0}% of the way to Level ${p.farmLevel + 1}`, subColor: DIM,
          avatar: LEAF, initial: String(p.farmLevel), bar: (fp || 0) / 100, barColor: LEAF });
      }
      if (p.crops != null) {
        rows.push({ kind: "row", text: `${fmt(p.crops)} crops harvested`, color: TEXT,
          sub: "Total Crops Harvested", subColor: DIM, avatar: AMBER, initial: "C" });
      }
      if (p.clan) {
        rows.push({ kind: "row", text: p.clan, color: TEXT,
          sub: p.rank ? `Clan rank: ${p.rank}` : "Your clan", subColor: DIM,
          avatar: avatarColor(p.clan), initial: initial(p.clan) });
      }
    }
    const owned = swirlStates(p).filter(s => s[2]);
    if (owned.length) {
      rows.push(section("swirls", "SWIRLS", owned.length, "#ffc53d"));
      if (!collapsed.has("swirls")) {
        for (const [key, label, , actual] of owned) {
          const sid = "swirl:" + key;
          const on = sid in switches ? switches[sid] : actual;
          rows.push({ kind: "row", text: label, color: on ? TEXT : DIM,
            sub: on ? "On · spinning around you" : "Off", subColor: on ? GREEN : FAINT,
            avatar: on ? SWIRL_COLORS[key] : mute(SWIRL_COLORS[key]), initial: label[0],
            sw: { id: sid, on } });
        }
      }
    }
    const states = perkStates(p);
    const have = states.filter(s => s[1] > 0);
    rows.push(section("perks", "PERKS", have.length, PINK));
    if (!collapsed.has("perks")) {
      for (const [pid, level, off] of have) rows.push(...perkRows(pid, level, off, expanded.has(pid), switches));
      if (!have.length) rows.push({ kind: "note", text: "No perks yet!" });
    }
    const later = states.filter(s => s[1] === 0);
    if (later.length) {
      rows.push(section("later", "NOT YET", later.length, "#8f8ab8"));
      if (!collapsed.has("later")) {
        for (const [pid] of later) rows.push(...perkRows(pid, 0, false, expanded.has(pid), switches));
      }
    }
    return rows;
  }

  function perkRows(pid, level, off, open, switches) {
    const [name, canSwitch, descs] = PERKS[pid];
    const top = descs.length, shown = Math.min(level, top), color = perkColor(pid);
    const more = { id: `more:${pid}`, text: open ? "Less" : "More", color: CYAN, style: "ghost" };
    if (level <= 0) {
      return [{ kind: "row", text: name, color: DIM, sub: `Level 1: ${descs[0]}`, subColor: FAINT,
        avatar: mute(color), initial: initial(name), btns: [more]
      }].concat(open ? levelRows(pid, 0, descs) : []);
    }
    const sid = `perk:${pid}`;
    const on = sid in switches ? switches[sid] : !off;
    const row = { kind: "row", text: name, color: on ? TEXT : DIM,
      sub: on ? `Level ${shown} of ${top} · ${descs[shown - 1]}` : `Switched off · Level ${shown} of ${top}`,
      subColor: on ? DIM : FAINT, avatar: on ? color : mute(color), initial: initial(name),
      bar: shown / top, barColor: color, btns: [more] };
    if (canSwitch) row.sw = { id: sid, on };
    return [row].concat(open ? levelRows(pid, level, descs) : []);
  }

  function levelRows(pid, level, descs) {
    const color = perkColor(pid);
    return descs.map((d, i) => ({ kind: "row", text: `Level ${i + 1}`,
      color: i + 1 <= level ? TEXT : FAINT, sub: d, subColor: i + 1 <= level ? DIM : FAINT,
      avatar: i + 1 <= level ? color : mute(color, 0.7), initial: String(i + 1) }));
  }

  function subtitle(p) {
    if (!p) return "Loading…";
    const parts = [];
    if (p.clan) parts.push(p.clan + (p.rank ? ` · ${p.rank}` : ""));
    parts.push(`${perkStates(p).filter(s => s[1] > 0).length} perks`);
    const owned = swirlStates(p).filter(s => s[2]).length;
    if (owned) parts.push(`${owned} swirl${owned !== 1 ? "s" : ""}`);
    return parts.join(" · ");
  }

  // ------------------------------------------------------------------ model
  function createProfileModel(opts) {
    const now = opts.now || (() => Date.now());
    const C = opts.core;
    const s = { p: null, open: false, collapsed: new Set(["later"]), expanded: new Set(),
      pending: {}, status: null };
    const say = (text, tone) => { s.status = { text, tone: tone || DIM }; };
    function send(bodies) {
      try {
        opts.send(bodies);
        return true;
      } catch (error) {
        say(`Couldn't reach the game: ${error && error.message ? error.message : error}`, RED);
        return false;
      }
    }
    function actualSwitches() {
      const out = {};
      if (!s.p) return out;
      for (const [key, , , on] of swirlStates(s.p)) out["swirl:" + key] = on;
      for (const [pid, , off] of perkStates(s.p)) out[`perk:${pid}`] = !off;
      return out;
    }
    // your choice shows until the game's value moves off what it was (or 8 s)
    function shownSwitches() {
      const t = now(), actual = actualSwitches(), out = {};
      for (const [sid, v] of Object.entries(s.pending)) {
        if (t - v.at <= PENDING_MS && actual[sid] === v.base) out[sid] = v.want;
        else delete s.pending[sid];
      }
      return out;
    }
    function flip(sid, body, label) {
      const actual = actualSwitches()[sid];
      const shown = shownSwitches();
      const want = !(sid in shown ? shown[sid] : actual);
      if (send([body(want)])) {
        s.pending[sid] = { want, base: actual, at: now() };
        say(`${label} switched ${want ? "on" : "off"}.`, want ? GREEN : DIM);
      }
    }
    function click(id) {
      const at = id.indexOf(":");
      const verb = at < 0 ? id : id.slice(0, at), arg = at < 0 ? "" : id.slice(at + 1);
      if (verb === "sec") {
        if (s.collapsed.has(arg)) s.collapsed.delete(arg); else s.collapsed.add(arg);
      } else if (verb === "more") {
        const pid = Number(arg);
        if (!Number.isInteger(pid)) return;
        if (s.expanded.has(pid)) s.expanded.delete(pid); else s.expanded.add(pid);
      } else if (verb === "swirl" && s.p) {
        const swirl = swirlStates(s.p).find(x => x[0] === arg);
        if (swirl && swirl[2]) flip(id, want => C.buildSwirl(arg, want), swirl[1]);
      } else if (verb === "perk" && s.p) {
        const pid = Number(arg);
        const state = perkStates(s.p).find(x => x[0] === pid);
        if (state && state[1] > 0 && PERKS[pid][1]) flip(id, want => C.buildPerkSwitch(pid, want), PERKS[pid][0]);
      }
    }
    function gameEvent(ev) {
      const p = s.p || { name: null, level: null, xp: null, xpPct: null, farmLevel: null,
        farmPct: null, crops: null, perks: [], flags: new Uint8Array(0), clan: "", rank: "" };
      if (ev.type === "self_profile") {
        s.p = { ...p, name: ev.name || p.name, level: ev.level, perks: Array.from(ev.perks || []),
          flags: ev.flags || new Uint8Array(0), clan: ev.clan || "", rank: ev.rank || "",
          farmLevel: ev.farmLevel, crops: ev.crops, farmPct: ev.farmPct };
      } else if (ev.type === "xp") {
        s.p = { ...p, level: ev.level, xp: ev.xp, xpPct: ev.pct };
      } else if (ev.type === "perks") {
        s.p = { ...p, perks: Array.from(ev.perks || []) };
      } else {
        return false;
      }
      return true;
    }
    function tick() {
      const before = Object.keys(s.pending).length;
      shownSwitches();
      return { changed: Object.keys(s.pending).length !== before };
    }
    return {
      state: s,
      click,
      gameEvent,
      tick,
      shownSwitches,
      opened() { s.open = true; s.status = null; },
      closed() { s.open = false; },
      view() {
        const p = s.p;
        return {
          title: profileTitle(p && p.name),
          subtitle: subtitle(p),
          chip: p && p.level != null ? `Level ${p.level}` : null,
          status: s.status ? s.status.text : p ? "Your profile, straight from the game" : "Waiting for the game…",
          statusColor: s.status ? s.status.tone : DIM,
          rows: buildRows(p, s.collapsed, s.expanded, shownSwitches())
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
    .win { width: min(860px, 94vw); max-height: 86vh; display: flex; flex-direction: column;
      border-radius: 22px; background: rgba(20,16,39,.97); overflow: hidden;
      box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06);
      animation: rise .18s ease-out; }
    @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    .head { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 22px;
      min-height: 98px; background: linear-gradient(90deg,#ff4fb8,#9b5cf6,#3b82f6,#22d3ee,#9b5cf6,#ff4fb8);
      background-size: 300% 100%; animation: slide 14s linear infinite; }
    .head::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 40%;
      background: rgba(0,0,0,.12); pointer-events: none; }
    @keyframes slide { from { background-position: 0% 0; } to { background-position: 300% 0; } }
    .titles { flex: 1; min-width: 0; z-index: 1; }
    .title { font: 800 34px/1.1 "Segoe UI", system-ui, sans-serif; text-shadow: 0 2px 3px rgba(0,0,0,.45);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .subtitle { font-size: 18px; opacity: .93; text-shadow: 0 1px 2px rgba(0,0,0,.45); }
    .pill { z-index: 1; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px;
      border-radius: 18px; background: rgba(0,0,0,.2); font-size: 16px; white-space: nowrap; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #ff4fb8;
      animation: breathe 1.6s ease-in-out infinite; }
    @keyframes breathe { 50% { box-shadow: 0 0 0 5px transparent; transform: scale(1.12); } }
    .close { z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
      background: rgba(255,255,255,.22); color: #fff; font: 700 22px/1 "Segoe UI", sans-serif; }
    .close:hover { background: #ef4444; }
    .list { flex: 1; min-height: min(420px, 44vh); overflow-y: auto; padding: 14px 18px 8px 22px; display: flex;
      flex-direction: column; gap: 8px; scrollbar-width: thin; scrollbar-color: #9b5cf6 rgba(255,255,255,.08); }
    .sec { display: flex; align-items: center; gap: 10px; padding: 12px 6px 6px; color: var(--c);
      font: 800 15px "Segoe UI", sans-serif; letter-spacing: .02em; cursor: pointer; user-select: none;
      border-bottom: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .sec:hover { filter: brightness(1.35); }
    .sec .count { padding: 1px 10px; border-radius: 12px; font-size: 15px; background: color-mix(in srgb, var(--c) 22%, transparent); }
    .row { position: relative; display: flex; align-items: center; gap: 16px; min-height: 68px; padding: 8px 14px 8px 18px;
      border-radius: 16px; background: #211b3e; transition: background .12s; }
    .row.has-bar { min-height: 86px; }
    .row:hover { background: #2d2556; }
    .row:hover::before { content: ""; position: absolute; left: 6px; top: 14px; bottom: 14px; width: 4px; border-radius: 2px; background: var(--a); }
    .avatar { position: relative; flex: none; width: 46px; height: 46px; border-radius: 50%; background: var(--a);
      display: flex; align-items: center; justify-content: center; font: 800 21px "Segoe UI", sans-serif;
      text-shadow: 0 1px 2px rgba(0,0,0,.4); box-shadow: inset -6px -8px 12px rgba(0,0,0,.12), inset 6px 6px 10px rgba(255,255,255,.18); }
    .avatar.long { font-size: 16px; }
    .who { flex: 1; min-width: 0; }
    .name { font: 700 21px "Segoe UI", sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .sub { font-size: 16px; }
    .bar { margin-top: 8px; height: 10px; max-width: 440px; border-radius: 5px; background: rgba(255,255,255,.15); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 5px; background: var(--b);
      box-shadow: inset 0 3px 0 rgba(255,255,255,.25); transition: width .3s ease-out; }
    .btn { flex: none; height: 38px; padding: 0 17px; border-radius: 19px; border: 0; cursor: pointer;
      font: 700 17px "Segoe UI", sans-serif; color: #fff; background: var(--b); text-shadow: 0 1px 2px rgba(0,0,0,.35); }
    .btn:hover { filter: brightness(1.22); }
    .btn.ghost { background: rgba(255,255,255,.15); color: var(--b); text-shadow: none; }
    .btn.ghost:hover { background: rgba(255,255,255,.28); filter: none; }
    .sw { flex: none; border: 0; background: none; padding: 8px; cursor: pointer; }
    .switch { display: block; width: 52px; height: 28px; border-radius: 14px; background: rgba(255,255,255,.33); position: relative;
      transition: background .15s; }
    .switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
      background: #fff; transition: left .15s; }
    .switch.on { background: #22c55e; }
    .switch.on::after { left: 27px; }
    .sw:hover .switch { filter: brightness(1.2); }
    .note { padding: 18px 8px; text-align: center; color: #b3aed6; font-size: 18px; }
    .foot { display: flex; align-items: center; gap: 12px; padding: 10px 22px 14px; }
    .toast { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 16px; border-radius: 18px;
      font-size: 16px; color: var(--t); background: color-mix(in srgb, var(--t) 18%, transparent); max-width: 70%;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toast::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--t); }
    .hint { margin-left: auto; color: #7c76a6; font-size: 15px; white-space: nowrap; }
  `;

  const esc = text => String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderRows(rows) {
    return rows.map(r => {
      if (r.kind === "section") {
        return `<div class="sec" style="--c:${r.color}" data-id="${esc(r.id)}"><span>${esc(r.text)}</span>` +
          (r.count != null ? `<span class="count">${r.count}</span>` : "") + "</div>";
      }
      if (r.kind === "note") return `<div class="note">${esc(r.text)}</div>`;
      const btns = (r.btns || []).map(b =>
        `<button class="btn${b.style === "ghost" ? " ghost" : ""}" style="--b:${b.color}" data-id="${esc(b.id)}">${esc(b.text)}</button>`).join("");
      const sw = r.sw ? `<button class="sw" data-id="${esc(r.sw.id)}" title="${r.sw.on ? "Switch off" : "Switch on"}">` +
        `<span class="switch${r.sw.on ? " on" : ""}"></span></button>` : "";
      const bar = r.bar != null ? `<div class="bar" style="--b:${r.barColor}"><i style="width:${(r.bar * 100).toFixed(1)}%"></i></div>` : "";
      return `<div class="row${r.bar != null ? " has-bar" : ""}" style="--a:${r.avatar}">` +
        `<div class="avatar${String(r.initial).length > 2 ? " long" : ""}">${esc(r.initial)}</div>` +
        `<div class="who"><div class="name" style="color:${r.color}">${esc(r.text)}</div>` +
        `<div class="sub" style="color:${r.subColor}">${esc(r.sub || "")}</div>${bar}</div>${btns}${sw}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------------ page glue
  function install(win) {
    if (win.CCProfile) return;
    const doc = win.document;
    const Core = win.CCBrowserCore;
    let enabled = true;
    let transport = null;
    let host = null, dom = null;

    const model = createProfileModel({
      core: Core,
      send(bodies) {
        if (!transport || typeof transport.sendBody !== "function") throw new Error("the game connection isn't ready yet");
        for (const body of bodies) transport.sendBody(body);
      }
    });

    function build() {
      if (host || !doc.documentElement) return;
      host = doc.createElement("div");
      host.id = "cc-profile-host";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${CSS}</style>
        <div class="backdrop" id="backdrop">
          <div class="win" id="win">
            <div class="head">
              <div class="titles"><div class="title" id="title">Profile</div><div class="subtitle" id="subtitle"></div></div>
              <div class="pill" id="chip"><span class="dot"></span><span id="chipText"></span></div>
              <button class="close" id="close" title="Close (Esc)">×</button>
            </div>
            <div class="list" id="list"></div>
            <div class="foot"><div class="toast" id="toast"></div>
              <div class="hint">Scroll for more · Esc closes</div></div>
          </div>
        </div>`;
      const $ = id => shadow.getElementById(id);
      dom = { shadow, backdrop: $("backdrop"), win: $("win"), title: $("title"), subtitle: $("subtitle"),
        chip: $("chip"), chipText: $("chipText"), close: $("close"), list: $("list"), toast: $("toast") };
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

    function render() {
      if (!dom || !model.state.open) return;
      const v = model.view();
      dom.title.textContent = v.title;
      dom.subtitle.textContent = v.subtitle;
      dom.chip.style.display = v.chip ? "" : "none";
      dom.chipText.textContent = v.chip || "";
      const scroll = dom.list.scrollTop;
      dom.list.innerHTML = renderRows(v.rows);
      dom.list.scrollTop = scroll;
      dom.toast.textContent = v.status;
      dom.toast.style.setProperty("--t", v.statusColor);
    }

    function open() {
      build();
      if (!dom) return;
      for (const other of [win.CCFriends, win.CCStore, win.CCPerks]) if (other && typeof other.close === "function") other.close();
      model.opened();
      dom.backdrop.classList.add("show");
      dom.win.style.animation = "none";
      void dom.win.offsetWidth;            // replay the rise animation
      dom.win.style.animation = "";
      dom.list.scrollTop = 0;
      render();
    }
    function close() {
      if (!dom || !model.state.open) return;
      model.closed();
      dom.backdrop.classList.remove("show");
      const canvas = doc.getElementById("canvas");
      if (canvas) canvas.focus();
    }

    // While open nothing typed reaches the game (key releases still do, so a
    // key held while opening doesn't stick). F2 opens / closes it.
    win.addEventListener("keydown", event => {
      if (event.key === "F2" && enabled && !event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (model.state.open) close("hotkey"); else open("hotkey");
        return;
      }
      if (!model.state.open) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); close("escape"); }
      else if (event.key !== "ArrowUp" && event.key !== "ArrowDown" &&
               event.key !== "PageUp" && event.key !== "PageDown") event.preventDefault();
    }, true);
    win.addEventListener("keypress", event => {
      if (model.state.open) event.stopImmediatePropagation();
    }, true);

    setInterval(() => {
      if (model.state.open && model.tick().changed) render();
    }, 250);

    win.CCProfile = {
      // Called by cc-browser-wasm-friends.js in place of the game's own
      // profile. Returning false runs the untouched game action.
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
      status: () => ({ enabled, open: model.state.open, level: model.state.p ? model.state.p.level : null })
    };
  }

  return { PERKS, SWIRLS, createProfileModel, buildRows, subtitle, profileTitle, renderRows, mute,
    avatarColor, initial, entityFlag, perkColor, install };
});
