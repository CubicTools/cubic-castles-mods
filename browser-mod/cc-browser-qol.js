/*
 * Quality-of-life models for the browser client (castles.cc), with no DOM so
 * the node tests can drive them (test-qol.js). cc-browser-mod.js does the keys,
 * the clipboard and the panels.
 *
 *   createChatHistory  ↑ / ↓ in the game's chat box recalls lines you sent
 *   createNameHider    popup "Names" chip off = no name tags over players
 *   createChatCommands /ban /unban /trust /untrust /pvp /search + switches in chat
 *
 * The chat box lives inside the game's canvas, so its text can't be read.
 * The history model keeps its own copy of what is in the box: the game says
 * when the box opens (tx 0x0031 01) and when a line goes out (tx 0x000c, then
 * 0x0031 00); in between, the player's keys are counted. Recalling a line =
 * Backspace over what is there, then type the old line. When the copy can't
 * be trusted (cursor keys, Ctrl+Backspace) it erases a full box instead.
 */
(function installQol(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CCBrowserQol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeQol() {
  "use strict";

  const CHAT_MAX = 100;           // the game's chat box (CCBrowserCore.CHAT_MAX)
  const HISTORY_MAX = 50;
  // a key pressed this soon before the box reported open was typed into it
  const OPEN_KEY_MS = 300;

  function createChatHistory({ lines = [], max = HISTORY_MAX, now = () => Date.now() } = {}) {
    const state = {
      lines: lines.filter(line => typeof line === "string" && line).slice(-max),
      open: false,
      box: "",          // what we believe is in the game's box
      sure: true,       // false: the box may hold something else
      index: -1,        // -1 = not browsing; else the recalled line
      draft: "",        // what was typed before the first ↑
      keyAt: 0          // last printable key while the box was closed
    };

    function opened() {
      if (state.open) return;           // already open (a repeat 01)
      state.open = true;
      state.box = "";
      state.sure = now() - state.keyAt > OPEN_KEY_MS;
      state.index = -1;
      state.draft = "";
    }
    function closed() {
      state.open = false;
      state.index = -1;
    }
    // a line went out: remember it (no repeats back to back)
    function sent(text) {
      const line = String(text || "").trim();
      if (line && state.lines[state.lines.length - 1] !== line) {
        state.lines.push(line);
        if (state.lines.length > max) state.lines.splice(0, state.lines.length - max);
      }
      closed();
      return line;
    }
    // the player's own keys
    function typed(ch) {
      if (!state.open) {
        state.keyAt = now();
        return;
      }
      if (state.box.length < CHAT_MAX) state.box += ch;
    }
    function backspace(word) {
      if (!state.open) return;
      if (word) state.sure = false;     // the game's word-delete rule is unknown
      else state.box = state.box.slice(0, -1);
    }
    function unsure() {
      if (state.open) state.sure = false;
    }
    function inserted(text) {
      if (state.open) state.box = (state.box + text).slice(0, CHAT_MAX);
    }
    // keys we queued replaced the whole box with `text` (a /ban completion)
    function replaced(text) {
      if (!state.open) return;
      state.box = String(text).slice(0, CHAT_MAX);
      state.sure = true;
    }
    // ↑ (-1) or ↓ (+1). Returns {erase, type} for the keys to send, or null
    // when there is nothing to move to (the key then goes to the game).
    function recall(direction) {
      if (!state.open || !state.lines.length) return null;
      let target;
      if (direction < 0) {
        if (state.index === -1) {
          state.draft = state.sure ? state.box : "";
          state.index = state.lines.length - 1;
        } else if (state.index > 0) {
          state.index -= 1;
        } else {
          return null;
        }
        target = state.lines[state.index];
      } else {
        if (state.index === -1) return null;
        if (state.index < state.lines.length - 1) {
          state.index += 1;
          target = state.lines[state.index];
        } else {
          state.index = -1;
          target = state.draft;
        }
      }
      target = target.slice(0, CHAT_MAX);
      const erase = state.sure ? state.box.length : CHAT_MAX;
      state.box = target;
      state.sure = true;
      return { erase, type: target };
    }
    return { state, opened, closed, sent, typed, backspace, unsure, inserted, replaced, recall };
  }

  // Our commands typed into the game's chat box (the Steam client's
  // stage2/mods/cc_chatcmd.py, same rules). cc-browser-mod.js catches the line
  // on its way out, so the server never sees it, and sends the game's own
  // message instead (or flips one of the mod's switches):
  //   /ban /unban <player>      tx 0x006d / 0x006e + guid (Banned People)
  //   /trust /untrust <player>  tx 0x006a / 0x006b + guid (Trusted People)
  //   /pvp [off]                tx 0x008d + the tag mask (the other tags kept,
  //                             as the game's tag picker sends it); rx 0x008c
  //                             carries the realm's tags and answers it
  //   /names /nofog (/no fog) /bright [on|off]   the popup's switches
  //   /search <item>            the cheapest current listings (the price book)
  //   /w <name> <msg>, /r <msg> a whisper in one line: "/whisper <msg>" goes
  //                             out, the "Whisper to Who?" picker that comes
  //                             back is kept from the game and its row clicked
  //                             (tx 0x00ba); /r answers whoever whispered last
  // While you type, matching names are suggested (people here for /ban and
  // /trust, the banned / trusted list for /unban / /untrust, item names for
  // /search) and Tab types the highlighted one in. Who's here: rx 0x0005
  // (signs / NPCs skipped) minus rx 0x0003, cleared on a realm join. The
  // lists: tx 0x006c / 0x0069 ask, rx 0x006c / 0x0069 answer (name + guid
  // each); the same answer confirms a ban / unban / trust / untrust. A player
  // command only ever goes to the exact name typed (any case).
  const BAN_SHOWN = 6;
  const SEARCH_SHOWN = 3;
  const BAN_REPLY_MS = 6000;
  const LIST_FRESH_MS = 15000;
  const LIST_ASK_GAP_MS = 3000;
  const PLAYER_CMDS = {
    ban: { source: "here", list: "banned", onList: true, doing: "Banning", done: n => `${n} is banned from this realm.` },
    unban: { source: "banned", list: "banned", onList: false, doing: "Unbanning", done: n => `${n} is unbanned.` },
    trust: { source: "here", list: "trusted", onList: true, doing: "Trusting", done: n => `${n} is trusted in this realm.` },
    untrust: { source: "trusted", list: "trusted", onList: false, doing: "Untrusting", done: n => `${n} is no longer trusted.` }
  };
  const SWITCHES = ["names", "nofog", "bright", "pov"];
  const ALL_COMMANDS = Object.keys(PLAYER_CMDS).concat(["pvp", "search", "w", "r", "crops"], SWITCHES);
  const CMD_LINE = /^\/(ban|unban|trust|untrust|search|w|r)\s+([\s\S]*)$/i;
  const WHISPER_MAX_BYTES = 90;            // the server's safe whisper size
  const OUR_COMMAND = /^\s*\/([A-Za-z]+)(?:\s+([\s\S]*))?$/;
  const nameKey = name => String(name).split(/\s+/).filter(Boolean).join(" ").toLocaleLowerCase();

  // what's in the box: {cmd, arg} once "/ban ", "/unban ", "/trust ",
  // "/untrust " or "/search " is typed, else null (half-typed commands show nothing)
  function parseChatCommand(text) {
    const m = CMD_LINE.exec(String(text || "").replace(/^\s+/, ""));
    return m ? { cmd: m[1].toLowerCase(), arg: m[2] } : null;
  }
  // a line on its way to the server: {cmd, arg} if it's one of ours
  function chatCommandOf(text) {
    const m = OUR_COMMAND.exec(String(text || ""));
    if (!m) return null;
    let cmd = m[1].toLowerCase();
    let arg = (m[2] || "").split(/\s+/).filter(Boolean).join(" ");
    if (cmd === "no" && /^fog(\s|$)/i.test(arg)) {          // "/no fog"
      cmd = "nofog";
      arg = arg.slice(3).trim();
    }
    return ALL_COMMANDS.includes(cmd) ? { cmd, arg } : null;
  }
  // "on" / "off" / "" (= flip current) -> the wanted state, or null
  function onOff(arg, current) {
    const a = String(arg || "").trim().toLowerCase();
    if (a === "" || a === "toggle") return !current;
    if (["on", "yes", "1"].includes(a)) return true;
    if (["off", "no", "0"].includes(a)) return false;
    return null;
  }
  // /pov's argument -> camera mode (0 native, 1 first, 2 third), or null;
  // nothing (or "next") steps Native -> First -> Third -> Native, like F5
  const POV_WORDS = {
    0: ["off", "normal", "native", "default", "0"],
    1: ["first", "first person", "firstperson", "fp", "1st", "1"],
    2: ["third", "third person", "thirdperson", "tp", "3rd", "3", "2"]
  };
  function povMode(arg, current) {
    const a = String(arg || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
    if (a === "" || a === "next" || a === "toggle") return ((Number(current) || 0) + 1) % 3;
    for (const mode of [0, 1, 2]) if (POV_WORDS[mode].includes(a)) return mode;
    return null;
  }
  function matchNames(arg, cands) {
    const a = nameKey(arg);
    const exact = cands.filter(([n]) => nameKey(n) === a).map(([n]) => n);
    const starts = cands.filter(([n]) => nameKey(n) !== a && nameKey(n).startsWith(a)).map(([n]) => n);
    const inside = cands.filter(([n]) => a && nameKey(n).includes(a) && !nameKey(n).startsWith(a)).map(([n]) => n);
    return exact.concat(starts, inside);
  }
  const byName = (a, b) => nameKey(a[0]).localeCompare(nameKey(b[0]));
  // Added under the game's own /help list (stage2/mods/cc_chatcmd.py HELP_LINES).
  // Plain ASCII, no < > ( ) (chat markup); the game handles its own /nofog
  // itself, so the mods' fog switch is "/no fog".
  const HELP_LINES = [
    "-- Cubic Mods --",
    "/w name message - Whisper someone in this realm in one line.",
    "/r message - Reply to whoever whispered you last.",
    "/ban name, /unban name - Ban or unban a player from your realm.",
    "/trust name, /untrust name - Trust or untrust a player in your realm.",
    "/pvp, /pvp off - Turn your realm's PvP tag on or off.",
    "/search item - The cheapest shops selling an item.",
    "/crops - Open the Farmer's crop window from any realm.",
    "/names - Show or hide name tags.",
    "/no fog - Turn the mods' fog removal on or off.",
    "/bright - Full bright lighting on or off.",
    "/pov - Next camera view, or /pov first, /pov third, /pov off.",
    "Tab fills in names and items while you type."
  ];
  const HELP_TEXT = HELP_LINES.join("\n");
  // the server's /help answer (its list names /whisper)
  const isHelpList = text => String(text || "").toLowerCase().includes("/whisper - ");
  // '/w' text -> {name, msg}: the longest known name it starts with, then a
  // space (names can have spaces: "Mister 90 hi"); name null when none fits
  function splitTarget(arg, cands) {
    const a = String(arg || "").split(/\s+/).filter(Boolean).join(" ");
    const low = a.toLocaleLowerCase();
    const names = Array.from(new Set(cands.map(([n]) => n))).sort((x, y) => y.length - x.length);
    for (const name of names) {
      const k = nameKey(name);
      if (low === k || low.startsWith(k + " ")) return { name, msg: a.slice(k.length).trim() };
    }
    return { name: null, msg: a };
  }
  // ( ) and < > are the game's own markup ("(" makes the server reject the
  // whisper as too short), so they go
  function cleanWhisper(text) {
    return String(text || "").replace(/[()<>]/g, "").split(/\s+/).filter(Boolean).join(" ");
  }
  // parts of at most `limit` UTF-8 bytes, cut at spaces where possible
  function splitWhisper(text, limit = WHISPER_MAX_BYTES) {
    const enc = new TextEncoder();
    const parts = [];
    let rest = String(text || "").trim();
    while (rest) {
      if (enc.encode(rest).length <= limit) { parts.push(rest); break; }
      let used = 0, cut = 0;
      for (const ch of rest) {
        used += enc.encode(ch).length;
        if (used > limit) break;
        cut += ch.length;
      }
      const space = rest.lastIndexOf(" ", cut);
      if (space > 0) cut = space;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    return parts;
  }
  const alnum = name => String(name).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  // the row of `name` in the picker's [[row, name]], or null
  function menuRow(rows, name) {
    const hit = rows.find(([, n]) => nameKey(n) === nameKey(name)) ||
                rows.find(([, n]) => alnum(name) && alnum(n) === alnum(name));
    return hit ? hit[0] : null;
  }
  // the note for a /search: a title and the cheapest listings
  function searchLines(item, rows) {
    if (!rows.length) return [{ text: `No current listings for ${item}.`, tone: "warn" }];
    const out = [{ text: `Cheapest ${rows[0].display || item}:`, tone: "info" }];
    for (const r of rows) {
      const owner = String(r.owner || "").replace(/^'/, "");
      const where = String(r.realm || "?").trim();
      const price = Math.trunc(Number(r.price) || 0).toLocaleString("en-US");
      out.push({ text: `${price} ${r.currency || "Cubits"}  ·  ${where}` +
                       (owner && nameKey(owner) !== nameKey(where) ? ` (${owner})` : ""), tone: "name" });
    }
    return out;
  }

  // market: {names() -> [item display names], cheapest(name, n) -> [listing]}
  function createChatCommands({ now = () => Date.now(), market = null } = {}) {
    const state = { names: new Map(), here: new Set(), own: null, cycle: null, pending: null,
                    lists: { banned: null, trusted: null }, listAt: { banned: 0, trusted: 0 },
                    listAsked: { banned: -Infinity, trusted: -Infinity }, listWait: null,
                    tags: null, pvpWait: null, lastWhisperer: null };

    function gameEvent(ev) {
      if (ev.type === "join") {
        state.here.clear();
        state.cycle = null;
        state.lists = { banned: null, trusted: null };      // another realm's lists
        state.listAt = { banned: 0, trusted: 0 };
        state.listWait = null;
        state.tags = null;
        state.pvpWait = null;
      } else if (ev.type === "player_seen") {
        state.names.set(ev.guid, ev.name);
        if (ev.notPlayer) state.here.delete(ev.guid); else state.here.add(ev.guid);
      } else if (ev.type === "player_left") {
        state.here.delete(ev.guid);
      } else if (ev.type === "chat" && ev.whisper && ev.guid && ev.guid !== state.own) {
        state.lastWhisperer = { guid: ev.guid, name: ev.name || state.names.get(ev.guid) || null };
      }
    }
    function replyName() {
      const w = state.lastWhisperer;
      return w ? (w.name || state.names.get(w.guid) || null) : null;
    }
    // [[name, key]] for this command, by name (key = guid, or the item name)
    function candidates(cmd = "ban") {
      if (cmd === "search") return market ? market.names().map(n => [n, n]) : [];
      const src = cmd === "w" || cmd === "r" ? "here" : PLAYER_CMDS[cmd].source;
      if (src !== "here") return (state.lists[src] || []).slice().sort(byName);
      const out = [];
      for (const g of state.here) {
        const n = state.names.get(g);
        if (n && g !== state.own) out.push([n, g]);
      }
      return out.sort(byName);
    }
    function resolve(arg, cmd = "ban") {
      const a = nameKey(arg);
      if (!a) return null;
      const hit = candidates(cmd).find(([n]) => nameKey(n) === a);
      return hit ? { name: hit[0], guid: hit[1] } : null;
    }
    function inCycle(arg) {
      return !!state.cycle && state.cycle.names.some(n => nameKey(n) === nameKey(arg));
    }
    // the list ('banned' | 'trusted') to ask for now (the host sends its tx), or null
    function wantList(open, box) {
      const p = open ? parseChatCommand(box) : null;
      const src = p && PLAYER_CMDS[p.cmd] && PLAYER_CMDS[p.cmd].source;
      if (!src || src === "here" || now() - state.listAt[src] <= LIST_FRESH_MS) return null;
      return askList(src) ? src : null;
    }
    function askList(list) {
      if (now() - state.listAsked[list] < LIST_ASK_GAP_MS) return false;
      state.listAsked[list] = now();
      return true;
    }
    // {items: [{text, tone}], sel, hint} for the box (open + its text)
    function suggest(open, box) {
      const p = open ? parseChatCommand(box) : null;
      if (!p) return { items: [], sel: 0, hint: null };
      if (p.cmd === "r") {
        const who = replyName();
        return { items: [who ? { text: `Reply to ${who}`, tone: "cmd" }
                             : { text: "Nobody has whispered you yet", tone: "dim" }], sel: 0, hint: null };
      }
      if (p.cmd === "w" && !inCycle(p.arg)) {
        const t = splitTarget(p.arg, candidates("w"));
        if (t.name) return { items: [{ text: `Whisper to ${t.name}`, tone: "cmd" }], sel: 0, hint: "Enter sends it" };
      }
      const src = p.cmd === "search" ? "items" : (p.cmd === "w" ? "here" : PLAYER_CMDS[p.cmd].source);
      if (src in state.lists && !state.lists[src]) {
        return { items: [{ text: `Fetching the ${src} list…`, tone: "dim" }], sel: 0, hint: null };
      }
      const cands = candidates(p.cmd);
      let names, sel = 0;
      if (inCycle(p.arg)) ({ names, index: sel } = state.cycle);
      else names = matchNames(p.arg, cands).slice(0, BAN_SHOWN);
      if (!names.length) {
        if (src in state.lists && !cands.length) {
          return { items: [{ text: `Nobody is ${src} here`, tone: "dim" }], sel: 0, hint: null };
        }
        if (src === "items") {
          return { items: [{ text: cands.length ? `No item matches “${p.arg.trim()}”`
                                                : "Loading the market prices…",
                             tone: cands.length ? "warn" : "dim" }], sel: 0, hint: null };
        }
        const where = src in state.lists ? `on the ${src} list` : "here";
        return { items: [{ text: p.arg.trim() ? `Nobody ${where} matches “${p.arg.trim()}”`
                                              : "No names here yet — they show as players move",
                           tone: p.arg.trim() ? "warn" : "dim" }], sel: 0, hint: null };
      }
      const exact = resolve(p.arg, p.cmd);
      const first = p.cmd === "search" ? (exact ? `Enter: cheapest ${exact.name}` : "Tab: fill in the item")
                  : p.cmd === "w" ? "Tab: fill in the name, then type your message"
                  : (exact ? `Enter: ${p.cmd} ${exact.name}` : "Tab: fill in the name");
      return { items: names.map(n => ({ text: n, tone: "name" })), sel, hint: `${first}  ·  Tab again: next` };
    }
    // Tab: {erase, type, box} — the keys to send and what the box then holds —
    // or null. sure = we know exactly what's in the box (else erase it all).
    function tab(box, sure, max) {
      const p = parseChatCommand(box);
      if (!p || p.cmd === "r") return null;
      const t = String(box).replace(/^\s+/, "");
      const suffix = p.cmd === "w" ? " " : "";         // /w: the message comes next
      let names, index;
      if (inCycle(p.arg)) {
        names = state.cycle.names;
        index = (names.findIndex(n => nameKey(n) === nameKey(p.arg)) + 1) % names.length;
      } else if (p.cmd === "w" && splitTarget(p.arg, candidates("w")).name) {
        return null;                                    // a name is in; it's the message now
      } else {
        names = matchNames(p.arg, candidates(p.cmd)).slice(0, BAN_SHOWN);
        index = 0;
      }
      if (!names.length) return null;
      state.cycle = { names, index };
      const pick = names[index] + suffix;
      const line = `/${p.cmd} ${pick}`;
      if (!sure) return { erase: max, type: line, box: line };
      return { erase: p.arg.length, type: pick, box: t.slice(0, t.length - p.arg.length) + pick };
    }
    function closed() { state.cycle = null; }
    // The line went out. Returns what to send in its place and the note:
    //   {send: 'player', cmd, guid, name, note, tone}   ban / unban / trust / untrust
    //   {send: 'list', list, note, tone}                ask for that list first;
    //                                                   the command follows from realmList
    //   {send: 'tags', tags, note, tone}                /pvp
    //   {lines: [{text, tone}]}                         /search (nothing is sent)
    //   {note, tone}                                    nothing is sent
    // The switches (/names /nofog /bright) are the host's.
    //   {whisper: {name, parts}}                      /w, /r (the host does the rest)
    function command(cmd, arg) {
      if (cmd === "pvp") return pvp(arg);
      if (cmd === "search") return search(arg);
      if (cmd === "w" || cmd === "r") return whisper(cmd, arg);
      const spec = PLAYER_CMDS[cmd];
      if (!spec) return { note: `/${cmd} isn't a command here.`, tone: "warn" };
      if (!arg) return { note: `Type who to ${cmd}: /${cmd} <player name>`, tone: "warn" };
      if (spec.source !== "here" && !state.lists[spec.source]) {
        state.listWait = { cmd, name: arg, at: now() };
        state.listAsked[spec.source] = now();
        return { send: "list", list: spec.source, note: `Checking the ${spec.source} list for ${arg}…`, tone: "info" };
      }
      const hit = resolve(arg, cmd);
      if (!hit) {
        const near = matchNames(arg, candidates(cmd));
        const tip = near.length ? ` Did you mean ${near[0]}?` : "";
        return { note: spec.source === "here" ? `Nobody called “${arg}” in this realm.${tip}`
                                              : `“${arg}” isn't ${spec.source} here.${tip}`, tone: "warn" };
      }
      state.pending = { cmd, name: hit.name, guid: hit.guid, at: now() };
      return { send: "player", cmd, guid: hit.guid, name: hit.name, list: spec.list,
               note: `${spec.doing} ${hit.name}…`, tone: "info" };
    }
    function whisper(cmd, arg) {
      let name, msg;
      if (cmd === "r") {
        if (!state.lastWhisperer) return { note: "Nobody has whispered you yet.", tone: "warn" };
        name = replyName();
        if (!name) return { note: "Not sure who whispered you — use /w <name> <message>.", tone: "warn" };
        msg = arg;
        if (!String(msg || "").trim()) return { note: `Type a message: /r <message> (to ${name})`, tone: "warn" };
      } else {
        if (!String(arg || "").trim()) return { note: "Type /w <name> <message>", tone: "warn" };
        const cands = candidates("w");
        ({ name, msg } = splitTarget(arg, cands));
        if (!name) {
          const first = String(arg).trim().split(/\s+/)[0];
          const near = matchNames(first, cands);
          return { note: `Nobody called “${first}” in this realm — whispers only reach people here.` +
                         (near.length ? ` Did you mean ${near[0]}?` : ""), tone: "warn" };
        }
        if (!msg) return { note: `Type a message: /w ${name} <message>`, tone: "warn" };
      }
      const parts = splitWhisper(cleanWhisper(msg));
      if (!parts.length) return { note: "That message is empty once ( ) < > are taken out.", tone: "warn" };
      return { whisper: { name, parts } };
    }
    function search(arg) {
      if (!arg) return { note: "Type an item: /search <item name>", tone: "warn" };
      const cands = candidates("search");
      if (!cands.length) return { note: "The market prices aren't loaded yet.", tone: "warn" };
      const hit = resolve(arg, "search");
      const item = hit ? hit.name : matchNames(arg, cands)[0];
      if (!item) return { note: `No item called “${arg}”.`, tone: "warn" };
      return { lines: searchLines(item, market.cheapest(item, SEARCH_SHOWN)) };
    }
    // /pvp [on|off]: {send: 'tags', tags, note, tone} or just {note, tone}
    function pvp(arg) {
      const a = String(arg || "").trim().toLowerCase();
      if (a && a !== "on" && a !== "off") return { note: "Type /pvp to turn PvP on, /pvp off to turn it off.", tone: "warn" };
      const on = a !== "off";
      const cur = state.tags;
      if (cur != null && !!(cur & 1) === on) return { note: `PvP is already ${on ? "on" : "off"} here.`, tone: "dim" };
      const base = (cur || 0) & 0xff;            // the picker only ever sends the eight tag bits
      const tags = on ? (base | 1) : (base & ~1);
      state.pvpWait = { on, at: now() };
      return { send: "tags", tags, note: `Turning PvP ${on ? "on" : "off"}…`, tone: "info" };
    }
    // rx 0x008c: the realm's tags. Returns {note, tone} when it answers a /pvp.
    function realmTags(tags) {
      state.tags = Number(tags) >>> 0;
      const w = state.pvpWait;
      if (!w || now() - w.at > BAN_REPLY_MS) return null;
      state.pvpWait = null;
      const on = !!(state.tags & 1);
      return on === w.on ? { note: `PvP is ${on ? "on" : "off"} in this realm.`, tone: "good" }
                         : { note: `The realm kept PvP ${on ? "on" : "off"} — do you have Realm Setup access here?`, tone: "warn" };
    }
    // a /pvp the server never answered
    function pvpTimeout() {
      const w = state.pvpWait;
      if (!w || now() - w.at <= BAN_REPLY_MS) return null;
      state.pvpWait = null;
      return { note: "No answer about PvP — you need Realm Setup access in this realm.", tone: "warn" };
    }
    // rx 0x006c / 0x0069 arrived: list = 'banned' | 'trusted', rows = [[name,
    // guid]]. Returns {note, tone} to show and/or {send: {cmd, name, guid}}
    // to send now (an /unban or /untrust that waited for its list).
    function realmList(list, rows) {
      state.lists[list] = (rows || []).map(([n, g]) => [String(n), String(g)]);
      state.listAt[list] = now();
      const out = {};
      const guids = new Set(state.lists[list].map(([, g]) => g));
      const p = state.pending;
      if (p && now() - p.at <= BAN_REPLY_MS) {
        const spec = PLAYER_CMDS[p.cmd];
        if (spec.list === list && guids.has(p.guid) === spec.onList) {
          Object.assign(out, { note: spec.done(p.name), tone: "good" });
          state.pending = null;
        }
      }
      const w = state.listWait;
      if (w && PLAYER_CMDS[w.cmd].source === list) {
        state.listWait = null;
        if (now() - w.at <= BAN_REPLY_MS) {
          const r = command(w.cmd, w.name);
          if (r.send === "player") out.send = { cmd: r.cmd, name: r.name, guid: r.guid, list: r.list };
          Object.assign(out, { note: r.note, tone: r.tone });
        }
      }
      return out;
    }
    // a server text soon after a ban / trust ... is its answer
    function serverText(text) {
      const p = state.pending;
      if (!p || now() - p.at > BAN_REPLY_MS || !String(text || "").trim()) return null;
      state.pending = null;
      return String(text).trim();
    }
    return { state, gameEvent, candidates, resolve, suggest, tab, closed, command, realmList, replyName,
             serverText, wantList, askList, realmTags, pvpTimeout,
             setOwn: guid => { state.own = guid || null; } };
  }

  // Player name tags. Each player entity has a "hide my name" byte that the
  // nametag draw (index.wasm fn 2456) checks before drawing the tag; the
  // game's own "Only show names of friends" setting sets it for non-friends
  // (fn 1318). Addresses are for the build cc-browser-wasm-friends.js
  // fingerprints; CCWasmMemory only exists when that build matched.
  const NAMES = {
    WORLD_POINTER: 313704,     // World*
    WORLD_SELF: 2932,          // own entity
    WORLD_COUNT: 2840,         // entity count
    WORLD_LIST: 2852,          // entity* array
    ENTITY_TYPE: 8,            // 1 = player
    ENTITY_HIDE_NAME: 4644     // u8, non-zero = no name tag
  };

  // hidden: true = no name tags. tick() every frame re-hides players who
  // just arrived; turning it off puts back the game's own value for each one.
  function createNameHider({ getMemory }) {
    const saved = new Map();          // entity -> the game's own byte
    const stats = { hidden: false, players: 0, error: null };

    function players(memory) {
      const view = new DataView(memory.buffer);
      const size = view.byteLength;
      const u32 = at => (at > 0 && at + 4 <= size ? view.getUint32(at, true) : 0);
      const world = u32(NAMES.WORLD_POINTER);
      if (!world) return [];
      const found = new Set();
      const add = entity => {
        if (entity && entity + NAMES.ENTITY_HIDE_NAME < size &&
            u32(entity + NAMES.ENTITY_TYPE) === 1) found.add(entity);
      };
      const count = u32(world + NAMES.WORLD_COUNT);
      const list = u32(world + NAMES.WORLD_LIST);
      if (list && count > 0 && count < 4096) {
        for (let i = 0; i < count; i++) add(u32(list + i * 4));
      }
      add(u32(world + NAMES.WORLD_SELF));
      return Array.from(found);
    }

    function restore(bytes, here) {
      for (const [entity, value] of saved) {
        if (!here || here.has(entity)) bytes[entity + NAMES.ENTITY_HIDE_NAME] = value;
      }
      saved.clear();
    }

    function tick() {
      const memory = getMemory();
      if (!memory) { stats.players = 0; return; }
      try {
        const list = players(memory);
        const bytes = new Uint8Array(memory.buffer);
        stats.players = list.length;
        stats.error = null;
        if (!stats.hidden) {
          if (saved.size) restore(bytes, new Set(list));
          return;
        }
        const here = new Set(list);
        for (const entity of saved.keys()) if (!here.has(entity)) saved.delete(entity);
        for (const entity of list) {
          const at = entity + NAMES.ENTITY_HIDE_NAME;
          if (!saved.has(entity)) saved.set(entity, bytes[at]);
          bytes[at] = 1;
        }
      } catch (error) {
        stats.error = String(error && error.message || error);
      }
    }

    function setHidden(hidden) {
      stats.hidden = !!hidden;
      tick();
    }

    return { tick, setHidden, status: () => ({ ...stats, saved: saved.size }) };
  }

  return { CHAT_MAX, HISTORY_MAX, createChatHistory, NAMES, createNameHider,
           parseChatCommand, chatCommandOf, onOff, povMode, createChatCommands,
           splitTarget, cleanWhisper, splitWhisper, menuRow, HELP_TEXT, isHelpList };
});
