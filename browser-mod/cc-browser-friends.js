/*
 * Custom friends list for the browser client (castles.cc) — the same window
 * cubic-mods.exe draws inside the Steam client (stage2/mods/cc_friendlist.py).
 *
 * Opening it: press Escape and click Friends as usual.  On the current Web
 * build cc-browser-wasm-friends.js intercepts the native FRIEND LIST
 * constructor before it runs, mirroring the desktop mod's pre-dialog hook.
 * The older tx 0x0027 + tx 0x0088 detector remains as a safe compatibility
 * fallback when the game WebAssembly fingerprint changes. F4 opens directly.
 *
 *   header: Friends · N friends · [Appear offline ⬤] [N online] [×]
 *   [Search your friends…] [Add a friend by username…] [Send request]
 *   ONLINE / OFFLINE / REQUESTS SENT, or — while the add box has focus —
 *   PEOPLE IN THIS REALM with [Add friend] for everyone who isn't a friend yet
 *
 * Everything is the game's own messages through the hooked socket
 * (cc-browser-core.js builders): 0x0027 / 0x0088 refresh, 0x0089 teleport
 * (only after a fresh 0x0088 says they're online, like the game does),
 * 0x002b unfriend / cancel, 0x0026 request, 0x012b Appear Offline.
 * Who is here: rx 0x0005 (name + flags; flag 6 = sign/mannequin/NPC, skipped)
 * minus rx 0x0003 (left). Appear Offline state: flag 26 of your own 0x0005.
 *
 * createFriendsModel() is the whole state machine with no DOM (node tests:
 * test-friends.js); the rest is the window and the hijack.
 */
(function installFriends(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function makeFriends(root) {
  "use strict";

  const GREEN = "#3fb950", GREY = "#6e7681", AMBER = "#f5a524", RED = "#ef4444",
    BLUE = "#3b82f6", PINK = "#ff4fb8", CYAN = "#22d3ee", TEXT = "#ffffff",
    DIM = "#b3aed6", FAINT = "#7c76a6";
  const AVATAR_COLORS = ["#ff4fb8", "#ff7a45", "#ffc53d", "#36cfc9", "#40a9ff",
    "#9254de", "#f759ab", "#73d13d", "#597ef7", "#ff9c6e"];
  const CONFIRM_MS = 4000, JOIN_WAIT_MS = 5000, CLOSE_AFTER_JOIN_MS = 600,
    ADD_WAIT_MS = 6000, PAIR_MS = 700, HIJACK_COOLDOWN_MS = 1500,
    NATIVE_CLOSE_FALLBACK_MS = 2500, NAME_MAX = 24;

  const key = name => String(name).toLocaleLowerCase();

  function crc32(text) {
    const bytes = new TextEncoder().encode(text);
    let c = ~0;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }
  // same colour per name as the exe (zlib.crc32 of the lower-cased name)
  const avatarColor = name => AVATAR_COLORS[crc32(key(name)) % AVATAR_COLORS.length];
  function mute(color, k = 0.55) {
    const c = parseInt(color.slice(1), 16), base = [0x2a, 0x24, 0x48];
    return "#" + [16, 8, 0].map((s, i) =>
      Math.round(((c >> s) & 255) * (1 - k) + base[i] * k).toString(16).padStart(2, "0")).join("");
  }
  function initial(name) {
    for (const ch of String(name)) if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
    return "?";
  }
  function cleanName(text) {
    const name = String(text || "").split(/\s+/).filter(Boolean).join(" ");
    if (!name || name.length > NAME_MAX || /[\x00-\x1f]/.test(name)) return null;
    return name;
  }
  const findName = (name, where) => Object.keys(where).find(n => key(n) === key(name)) || null;

  // The game's Friends button is the only normal action which emits these two
  // refreshes as a tight pair. Keep this small state machine independent of the
  // DOM so the timing-sensitive part of the browser hijack can be unit tested.
  function createHijackGate(options = {}) {
    const now = options.now || (() => Date.now());
    const pairMs = options.pairMs == null ? PAIR_MS : Number(options.pairMs);
    const cooldownMs = options.cooldownMs == null ? HIJACK_COOLDOWN_MS : Number(options.cooldownMs);
    let last = { friends: 0, online: 0 };
    let replies = { friends: false, online: false };
    let openedAt = null;
    let pendingNativeClose = false;

    function noteOutbound(type, eligible = true) {
      const field = type === "tx_friends_refresh" ? "friends" :
        type === "tx_online_refresh" ? "online" : null;
      if (!field) return false;
      if (!eligible) {
        last = { friends: 0, online: 0 };
        return false;
      }
      const t = now();
      last[field] = t;
      if (!last.friends || !last.online || Math.abs(last.friends - last.online) > pairMs) return false;
      last = { friends: 0, online: 0 };
      if (openedAt != null && t - openedAt < cooldownMs) return false;
      openedAt = t;
      pendingNativeClose = true;
      replies = { friends: false, online: false };
      return true;
    }

    function noteInbound(type) {
      if (!pendingNativeClose || (type !== "friends" && type !== "online_friends")) return false;
      replies[type === "friends" ? "friends" : "online"] = true;
      if (!replies.friends || !replies.online) return false;
      pendingNativeClose = false;
      return true;
    }

    function consumePending() {
      if (!pendingNativeClose) return false;
      pendingNativeClose = false;
      return true;
    }

    function shouldSuppress(type) {
      return pendingNativeClose && (type === "friends" || type === "online_friends");
    }

    function cancel() {
      last = { friends: 0, online: 0 };
      replies = { friends: false, online: false };
      pendingNativeClose = false;
    }

    return { noteOutbound, noteInbound, consumePending, shouldSuppress, cancel,
      status: () => ({ pendingNativeClose, last: { ...last }, replies: { ...replies } }) };
  }

  // ------------------------------------------------------------------ rows
  function buildRows(book, filterText, collapsed, confirm, joining) {
    if (book.listAt == null) return [{ kind: "note", text: "Loading your friends…" }];
    if (!Object.keys(book.friends).length && !Object.keys(book.pending).length) {
      return [{ kind: "note", text: "No friends yet — add one with the box above!" }];
    }
    const f = key(filterText || "");
    const known = book.onlineAt != null;
    const byName = (a, b) => key(a).localeCompare(key(b));
    const match = Object.keys(book.friends).filter(n => key(n).includes(f));
    const online = match.filter(n => known && book.online.has(book.friends[n])).sort(byName);
    const offline = match.filter(n => !online.includes(n)).sort(byName);
    const pending = Object.keys(book.pending).filter(n => key(n).includes(f)).sort(byName);
    const removeBtn = n => confirm === n
      ? { id: "remove:" + n, text: "Sure?", color: RED, style: "solid" }
      : { id: "remove:" + n, text: "Remove", color: "#ff8a8a", style: "ghost" };
    const section = (sid, title, count, color) => ({
      kind: "section", id: "sec:" + sid, text: title, count, color, folded: collapsed.has(sid)
    });
    const rows = [];
    if (known && (online.length || !f)) {
      rows.push(section("online", "ONLINE", online.length, GREEN));
      if (!collapsed.has("online")) {
        for (const n of online) {
          const g = book.friends[n];
          const join = joining === g
            ? { id: "join:" + g, text: "Joining…", color: BLUE, style: "solid" }
            : { id: "join:" + g, text: "Join", color: "#22c55e", style: "solid" };
          rows.push({ kind: "row", text: n, color: TEXT, sub: "Online now", subColor: GREEN,
            avatar: avatarColor(n), initial: initial(n), online: true, btns: [join, removeBtn(n)] });
        }
        if (!online.length) rows.push({ kind: "note", text: "Nobody's online right now." });
      }
    }
    if (offline.length) {
      rows.push(section("offline", known ? "OFFLINE" : "FRIENDS", offline.length, known ? "#8f8ab8" : CYAN));
      if (!collapsed.has("offline")) {
        for (const n of offline) {
          rows.push({ kind: "row", text: n, color: known ? DIM : TEXT,
            sub: known ? "Offline" : "Checking…", subColor: FAINT,
            avatar: known ? mute(avatarColor(n)) : avatarColor(n), initial: initial(n),
            online: false, btns: [removeBtn(n)] });
        }
      }
    }
    if (pending.length) {
      rows.push(section("pending", "REQUESTS SENT", pending.length, AMBER));
      if (!collapsed.has("pending")) {
        for (const n of pending) {
          rows.push({ kind: "row", text: n, color: TEXT, sub: "Waiting for them to accept",
            subColor: AMBER, avatar: avatarColor(n), initial: initial(n), online: false,
            btns: [{ id: "cancel:" + n, text: "Cancel", color: AMBER, style: "ghost" }] });
        }
      }
    }
    if (f && !(online.length || offline.length || pending.length)) {
      return [{ kind: "note", text: `No friends match “${filterText}”.` }];
    }
    return rows;
  }

  function buildPeopleRows(people, filterText, requested) {
    const f = key(String(filterText || "").trim());
    const asked = new Set(Array.from(requested, key));
    const shown = people.filter(([n]) => key(n).includes(f));
    const rows = [{ kind: "section", id: null, text: "PEOPLE IN THIS REALM", count: shown.length, color: PINK }];
    for (const [n] of shown) {
      const btn = asked.has(key(n))
        ? { id: "req:" + n, text: "Sent", color: GREEN, style: "ghost" }
        : { id: "req:" + n, text: "Add friend", color: "#ec4899", style: "solid" };
      rows.push({ kind: "row", text: n, color: TEXT, sub: "In this realm · not your friend yet",
        subColor: CYAN, avatar: avatarColor(n), initial: initial(n), online: false, btns: [btn] });
    }
    if (!shown.length) {
      rows.push({ kind: "note", text: f
        ? `Nobody here called “${String(filterText).trim()}” — Send request still works.`
        : "Nobody else here to add right now." });
    }
    return rows;
  }

  // ------------------------------------------------------------------ model
  function createFriendsModel(opts) {
    const now = opts.now || (() => Date.now());
    const s = {
      book: { friends: {}, pending: {}, online: new Set(), listAt: null, onlineAt: null },
      open: false, mode: "friends", filter: "", addText: "", collapsed: new Set(),
      confirm: null, joining: null, adding: null, status: null, closeAt: null,
      names: new Map(), here: new Set(), requested: new Set(),
      offlineMem: null, offlineChoice: null
    };
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
    const C = opts.core;
    function nameOf(guid) {
      return Object.keys(s.book.friends).find(n => s.book.friends[n] === guid) || null;
    }
    function onlineNames(filter) {
      const f = key(filter || "");
      return Object.keys(s.book.friends).filter(n => s.book.online.has(s.book.friends[n]) &&
        key(n).includes(f)).sort((a, b) => key(a).localeCompare(key(b)));
    }
    function peopleHere() {
      const taken = new Set([...Object.keys(s.book.friends), ...Object.keys(s.book.pending)].map(key));
      const guids = new Set([...Object.values(s.book.friends), ...Object.values(s.book.pending)]);
      const out = [];
      for (const g of s.here) {
        const who = s.names.get(g);
        if (!who || guids.has(g) || taken.has(key(who))) continue;
        out.push([who, g]);
      }
      return out.sort((a, b) => key(a[0]).localeCompare(key(b[0])));
    }
    function appearOffline() {
      const c = s.offlineChoice;
      if (c && s.offlineMem === c[1]) return c[0];
      return !!s.offlineMem;
    }
    function join(guid) {
      const t = now();
      if (s.joining && !s.joining.sent && t - s.joining.at < JOIN_WAIT_MS) return;
      const name = nameOf(guid) || "your friend";
      if (send([C.buildRefreshOnline()])) {
        s.joining = { guid, name, at: t, sent: false };
        say(`Joining ${name}…`, BLUE);
      }
    }
    function add(text) {
      const name = cleanName(text);
      if (!name) return say(`Usernames are 1–${NAME_MAX} characters.`, AMBER);
      const friend = findName(name, s.book.friends), asked = findName(name, s.book.pending);
      if (friend) return say(`${friend} is already your friend.`, AMBER);
      if (asked) return say(`You already sent ${asked} a request.`, AMBER);
      if (send([C.buildFriendRequest(name), C.buildRefreshFriends()])) {
        s.adding = { name, at: now() };
        s.requested.add(name);
        say(`Sending a friend request to ${name}…`, CYAN);
      }
    }
    function toggleOffline() {
      const next = !appearOffline();
      if (send([C.buildAppearOffline(next)])) {
        s.offlineChoice = [next, s.offlineMem];
        say(next ? "You now appear offline to your friends." : "Your friends can see you online again.",
          next ? PINK : GREEN);
      }
    }
    function click(id) {
      const at = id.indexOf(":");
      const verb = at < 0 ? id : id.slice(0, at), arg = at < 0 ? "" : id.slice(at + 1);
      const t = now();
      if (verb === "sec") {
        if (s.collapsed.has(arg)) s.collapsed.delete(arg); else s.collapsed.add(arg);
      } else if (verb === "join") {
        join(arg);
      } else if (verb === "req") {
        add(arg);
      } else if (id === "toggle:offline") {
        toggleOffline();
      } else if (verb === "remove") {
        if (s.confirm && s.confirm.name === arg && t - s.confirm.at <= CONFIRM_MS) {
          s.confirm = null;
          if (send([C.buildUnfriend(arg), C.buildRefreshFriends()])) say(`Removed ${arg}.`, DIM);
        } else {
          s.confirm = { name: arg, at: t };
          say(`Click Sure? to remove ${arg}.`, AMBER);
        }
      } else if (verb === "cancel") {
        if (send([C.buildUnfriend(arg), C.buildRefreshFriends()])) say(`Cancelled your request to ${arg}.`, DIM);
      }
    }
    function gameEvent(ev) {
      const t = now();
      if (ev.type === "join") {                     // a new realm: a new crowd
        s.here.clear();
        if (s.joining && s.joining.sent) s.joining = null;
      } else if (ev.type === "player_seen") {
        s.names.set(ev.guid, ev.name);
        if (ev.notPlayer) s.here.delete(ev.guid); else s.here.add(ev.guid);
      } else if (ev.type === "player_left") {
        s.here.delete(ev.guid);
      } else if (ev.type === "self_flags") {
        s.offlineMem = !!ev.appearOffline;
      } else if (ev.type === "friends") {
        s.book.friends = { ...(ev.friends || {}) };
        s.book.pending = { ...(ev.pending || {}) };
        s.book.listAt = t;
        if (s.adding && t - s.adding.at <= ADD_WAIT_MS && findName(s.adding.name, s.book.pending) &&
            !(s.status && s.status.text.startsWith("Request sent"))) {
          say(`Request sent to ${s.adding.name}!`, GREEN);
        }
      } else if (ev.type === "online_friends") {
        s.book.online = new Set(ev.guids || []);
        s.book.onlineAt = t;
        const j = s.joining;
        if (j && !j.sent) {
          if (s.book.online.has(j.guid)) {
            if (send([C.buildTeleport(j.guid)])) {
              s.joining = { ...j, sent: true, at: t };
              say(`Teleporting to ${j.name}…`, GREEN);
              s.closeAt = t + CLOSE_AFTER_JOIN_MS;
            } else {
              s.joining = null;
            }
          } else {
            s.joining = null;
            say(`${j.name} just went offline.`, AMBER);
          }
        } else if (s.open && s.status && s.status.text.startsWith("Refreshing")) {
          say("Up to date.", GREEN);
        }
      } else if (ev.type === "server_text") {
        if (s.adding && t - s.adding.at <= ADD_WAIT_MS && ev.text) {
          const good = ev.text.toLowerCase().startsWith("request sent");
          say(ev.text, good ? GREEN : AMBER);
          s.adding = null;
        }
      } else {
        return false;
      }
      return true;
    }
    function tick() {
      const t = now();
      let changed = false, close = false;
      if (s.closeAt != null && t >= s.closeAt) { s.closeAt = null; close = true; }
      if (s.joining && !s.joining.sent && t - s.joining.at > JOIN_WAIT_MS) {
        say(`No answer about ${s.joining.name} — try again.`, AMBER);
        s.joining = null;
        changed = true;
      } else if (s.joining && s.joining.sent && t - s.joining.at > 30000) {
        s.joining = null;
      }
      if (s.adding && t - s.adding.at > ADD_WAIT_MS) {
        if (!(s.status && s.status.text.startsWith("Request sent"))) {
          say(`No answer from the server about ${s.adding.name}.`, AMBER);
          changed = true;
        }
        s.adding = null;
      }
      if (s.confirm && t - s.confirm.at > CONFIRM_MS) { s.confirm = null; changed = true; }
      return { changed, close };
    }
    return {
      state: s,
      appearOffline,
      onlineNames,
      peopleHere,
      opened() {
        s.open = true; s.mode = "friends"; s.filter = ""; s.addText = ""; s.confirm = null; s.closeAt = null;
        if (send([C.buildRefreshFriends(), C.buildRefreshOnline()])) say("Refreshing…", CYAN);
      },
      closed() { s.open = false; s.confirm = null; s.closeAt = null; },
      focus(box) { s.mode = box === "add" ? "add" : "friends"; },
      filter(text) { s.filter = String(text || ""); },
      addText(text) { s.addText = String(text || ""); },
      enter() {
        const names = s.filter ? onlineNames(s.filter) : [];
        if (names.length) join(s.book.friends[names[0]]);
      },
      add,
      click,
      gameEvent,
      tick,
      view() {
        const b = s.book;
        const rows = s.mode === "add"
          ? buildPeopleRows(peopleHere(), s.addText, s.requested)
          : buildRows(b, s.filter, s.collapsed, s.confirm && s.confirm.name, s.joining && s.joining.guid);
        const total = Object.keys(b.friends).length;
        return {
          title: "Friends",
          subtitle: b.listAt == null ? "Loading…" : b.onlineAt == null
            ? `${total} friends · checking who's online…`
            : `${total} friends · ${Object.keys(b.pending).length} requests sent`,
          chip: b.onlineAt == null ? null : `${onlineNames().length} online`,
          chipColor: onlineNames().length ? GREEN : GREY,
          appearOffline: appearOffline(),
          status: s.status ? s.status.text : "Type to search · add friends on the right",
          statusColor: s.status ? s.status.tone : DIM,
          mode: s.mode,
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
    .title { font: 800 34px/1.1 "Segoe UI", system-ui, sans-serif; text-shadow: 0 2px 3px rgba(0,0,0,.45); }
    .subtitle { font-size: 18px; opacity: .93; text-shadow: 0 1px 2px rgba(0,0,0,.45); }
    .pill { z-index: 1; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px;
      border-radius: 18px; background: rgba(0,0,0,.2); font-size: 16px; white-space: nowrap; border: 0; color: #fff; }
    button.pill { cursor: pointer; font: inherit; font-size: 16px; }
    button.pill:hover { background: rgba(0,0,0,.3); }
    .switch { width: 48px; height: 26px; border-radius: 13px; background: rgba(255,255,255,.33); position: relative;
      transition: background .15s; }
    .switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
      background: #fff; transition: left .15s; }
    .switch.on { background: #22c55e; }
    .switch.on::after { left: 25px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c, #3fb950); box-shadow: 0 0 0 0 var(--c, #3fb950);
      animation: breathe 1.6s ease-in-out infinite; }
    @keyframes breathe { 50% { box-shadow: 0 0 0 5px transparent; transform: scale(1.12); } }
    .close { z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
      background: rgba(255,255,255,.22); color: #fff; font: 700 22px/1 "Segoe UI", sans-serif; }
    .close:hover { background: #ef4444; }
    .bar { display: flex; gap: 14px; padding: 14px 22px 4px; }
    .bar input { height: 50px; border-radius: 25px; border: 2px solid transparent; outline: none; padding: 0 22px;
      background: #1a1534; color: #fff; font: 600 18px "Segoe UI", system-ui, sans-serif; min-width: 0; }
    .bar input::placeholder { color: #7c76a6; }
    .bar input:hover { background: #2d2556; }
    .bar input:focus { background: #0d0a1e; border-color: #22d3ee; animation: ring 4s linear infinite; }
    @keyframes ring { 0% { border-color: #ff4fb8; } 33% { border-color: #3b82f6; } 66% { border-color: #22d3ee; } 100% { border-color: #ff4fb8; } }
    #search { flex: 44; } #add { flex: 40; }
    .send { flex: none; height: 50px; padding: 0 22px; border-radius: 25px; border: 0; cursor: pointer;
      background: #22c55e; color: #fff; font: 700 17px "Segoe UI", sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,.35);
      animation: glow 1.8s ease-in-out infinite; }
    .send:hover { background: #4ade80; }
    .send:disabled { background: rgba(34,197,94,.33); color: rgba(255,255,255,.6); cursor: default; animation: none; text-shadow: none; }
    @keyframes glow { 50% { box-shadow: 0 0 14px 2px rgba(34,197,94,.45); } }
    .list { flex: 1; min-height: min(420px, 44vh); overflow-y: auto; padding: 8px 18px 8px 22px; display: flex; flex-direction: column; gap: 8px;
      scrollbar-width: thin; scrollbar-color: #9b5cf6 rgba(255,255,255,.08); }
    .sec { display: flex; align-items: center; gap: 10px; padding: 12px 6px 6px; color: var(--c);
      font: 800 15px "Segoe UI", sans-serif; letter-spacing: .02em; border-bottom: 1px solid color-mix(in srgb, var(--c) 30%, transparent); cursor: pointer; user-select: none; }
    .sec.static { cursor: default; }
    .sec:not(.static):hover { filter: brightness(1.35); }
    .sec .count { padding: 1px 10px; border-radius: 12px; font-size: 15px; background: color-mix(in srgb, var(--c) 22%, transparent); }
    .row { position: relative; display: flex; align-items: center; gap: 16px; min-height: 68px; padding: 0 14px 0 18px;
      border-radius: 16px; background: #211b3e; transition: background .12s; }
    .row:hover { background: #2d2556; }
    .row:hover::before { content: ""; position: absolute; left: 6px; top: 14px; bottom: 14px; width: 4px; border-radius: 2px; background: var(--a); }
    .avatar { position: relative; flex: none; width: 46px; height: 46px; border-radius: 50%; background: var(--a);
      display: flex; align-items: center; justify-content: center; font: 800 21px "Segoe UI", sans-serif;
      text-shadow: 0 1px 2px rgba(0,0,0,.4); box-shadow: inset -6px -8px 12px rgba(0,0,0,.12), inset 6px 6px 10px rgba(255,255,255,.18); }
    .avatar.online { animation: halo 1.6s ease-in-out infinite; }
    @keyframes halo { 0%,100% { box-shadow: 0 0 0 4px rgba(63,185,80,.22); } 50% { box-shadow: 0 0 0 8px rgba(63,185,80,.42); } }
    .avatar.online::after { content: ""; position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px;
      border-radius: 50%; background: #3fb950; border: 3px solid #141027; }
    .who { flex: 1; min-width: 0; }
    .name { font: 700 21px "Segoe UI", sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
    .sub { font-size: 16px; }
    .btn { flex: none; height: 38px; padding: 0 17px; border-radius: 19px; border: 0; cursor: pointer;
      font: 700 17px "Segoe UI", sans-serif; color: #fff; background: var(--b); text-shadow: 0 1px 2px rgba(0,0,0,.35); }
    .btn:hover { filter: brightness(1.22); }
    .btn.ghost { background: rgba(255,255,255,.15); color: var(--b); text-shadow: none; }
    .btn.ghost:hover { background: rgba(255,255,255,.28); filter: none; }
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
        const arrow = r.id ? (r.folded ? "► " : "▼ ") : "";
        return `<div class="sec${r.id ? "" : " static"}" style="--c:${r.color}"${r.id ? ` data-id="${esc(r.id)}"` : ""}>` +
          `<span>${arrow}${esc(r.text)}</span><span class="count">${r.count}</span></div>`;
      }
      if (r.kind === "note") return `<div class="note">${esc(r.text)}</div>`;
      const btns = (r.btns || []).map(b =>
        `<button class="btn${b.style === "ghost" ? " ghost" : ""}" style="--b:${b.color}" data-id="${esc(b.id)}">${esc(b.text)}</button>`).join("");
      return `<div class="row" style="--a:${r.avatar}">` +
        `<div class="avatar${r.online ? " online" : ""}">${esc(r.initial)}</div>` +
        `<div class="who"><div class="name" style="color:${r.color}">${esc(r.text)}</div>` +
        `<div class="sub" style="color:${r.subColor}">${esc(r.sub || "")}</div></div>${btns}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------------ page glue
  function install(win) {
    if (win.CCFriends) return;
    const doc = win.document;
    const Core = win.CCBrowserCore;
    let enabled = true;
    let transport = null;
    let host = null, dom = null;
    let syntheticEscape = false;
    let nativeCloseTimer = null;
    let nativeCloseGeneration = 0;
    const hijackGate = createHijackGate();

    const model = createFriendsModel({
      core: Core,
      send(bodies) {
        if (!transport) throw new Error("the game connection isn't ready yet");
        for (const body of bodies) transport.sendBody(body);
      }
    });

    function build() {
      if (host || !doc.documentElement) return;
      host = doc.createElement("div");
      host.id = "cc-friends-host";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${CSS}</style>
        <div class="backdrop" id="backdrop">
          <div class="win" id="win">
            <div class="head">
              <div class="titles"><div class="title" id="title">Friends</div><div class="subtitle" id="subtitle"></div></div>
              <button class="pill" id="offline" data-id="toggle:offline">Appear offline <span class="switch" id="switch"></span></button>
              <div class="pill" id="chip"><span class="dot" id="chipDot"></span><span id="chipText"></span></div>
              <button class="close" id="close" title="Close (Esc)">×</button>
            </div>
            <div class="bar">
              <input id="search" placeholder="Search your friends…" maxlength="24" autocomplete="off">
              <input id="add" placeholder="Add a friend by username…" maxlength="24" autocomplete="off">
              <button class="send" id="send" disabled>Send request</button>
            </div>
            <div class="list" id="list"></div>
            <div class="foot"><div class="toast" id="toast"></div>
              <div class="hint">Tab switches box · Enter sends · Esc closes</div></div>
          </div>
        </div>`;
      const $ = id => shadow.getElementById(id);
      dom = { shadow, backdrop: $("backdrop"), win: $("win"), title: $("title"), subtitle: $("subtitle"),
        offline: $("offline"), sw: $("switch"), chip: $("chip"), chipDot: $("chipDot"), chipText: $("chipText"),
        close: $("close"), search: $("search"), add: $("add"), send: $("send"), list: $("list"), toast: $("toast") };
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
      dom.search.addEventListener("focus", () => { model.focus("search"); render(); });
      dom.add.addEventListener("focus", () => { model.focus("add"); render(); });
      dom.search.addEventListener("input", () => { model.filter(dom.search.value); render(); });
      dom.add.addEventListener("input", () => { model.addText(dom.add.value); render(); });
      dom.send.addEventListener("click", submitAdd);
    }

    function submitAdd() {
      const text = dom.add.value;
      if (!text.trim()) { dom.add.focus(); return; }
      model.add(text);
      dom.add.value = "";
      model.addText("");
      dom.add.focus();
      render();
    }

    function render() {
      if (!dom || !model.state.open) return;
      const v = model.view();
      dom.title.textContent = v.title;
      dom.subtitle.textContent = v.subtitle;
      dom.sw.classList.toggle("on", v.appearOffline);
      dom.chip.style.display = v.chip ? "" : "none";
      dom.chipText.textContent = v.chip || "";
      dom.chipDot.style.setProperty("--c", v.chipColor);
      dom.send.disabled = !dom.add.value.trim();
      const scroll = dom.list.scrollTop;
      dom.list.innerHTML = renderRows(v.rows);
      dom.list.scrollTop = scroll;
      dom.toast.textContent = v.status;
      dom.toast.style.setProperty("--t", v.statusColor);
    }

    function open(reason) {
      build();
      if (!dom) return;
      for (const other of [win.CCProfile, win.CCStore, win.CCPerks]) if (other && typeof other.close === "function") other.close();
      model.opened();
      dom.search.value = "";
      dom.add.value = "";
      dom.backdrop.classList.add("show");
      dom.win.style.animation = "none";
      void dom.win.offsetWidth;            // replay the rise animation
      dom.win.style.animation = "";
      render();
      setTimeout(() => dom.search.focus(), 0);
    }
    function close() {
      if (!dom || !model.state.open) return;
      model.closed();
      dom.backdrop.classList.remove("show");
      if (doc.activeElement === host) host.blur();
      const canvas = doc.getElementById("canvas");
      if (canvas) canvas.focus();
    }

    // Close the game's own dialog the way a player would: one Escape, HELD for
    // a few frames. The game checks keys once per frame, so a down+up in the
    // same instant (the first version) was never seen and its list stayed open.
    const ESCAPE_HOLD_MS = 120;
    function escapeEvent(type) {
      const event = new KeyboardEvent(type, { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
      Object.defineProperty(event, "keyCode", { get: () => 27 });
      Object.defineProperty(event, "which", { get: () => 27 });
      return event;
    }
    function fireEscape(type) {
      const target = doc.getElementById("canvas") || doc;
      syntheticEscape = true;
      try { target.dispatchEvent(escapeEvent(type)); } finally { syntheticEscape = false; }
    }
    function pressEscape() {
      fireEscape("keydown");
      setTimeout(() => fireEscape("keyup"), ESCAPE_HOLD_MS);
    }

    function afterGameFrames(callback) {
      const frame = typeof win.requestAnimationFrame === "function" ?
        win.requestAnimationFrame.bind(win) : fn => setTimeout(fn, 16);
      frame(() => frame(callback));
    }

    function dispatchNativeClose(generation) {
      clearTimeout(nativeCloseTimer);
      nativeCloseTimer = null;
      // Network decoding runs after the WebSocket's message listeners. Give
      // the game two more frames to turn that reply into its native dialog,
      // then Escape it. This avoids the stock list surviving behind our modal.
      afterGameFrames(() => {
        if (enabled && generation === nativeCloseGeneration) pressEscape();
      });
    }

    function armNativeClose() {
      const generation = ++nativeCloseGeneration;
      clearTimeout(nativeCloseTimer);
      nativeCloseTimer = setTimeout(() => {
        if (generation !== nativeCloseGeneration || !hijackGate.consumePending()) return;
        dispatchNativeClose(generation);
      }, NATIVE_CLOSE_FALLBACK_MS);
      return generation;
    }

    function cancelNativeClose() {
      nativeCloseGeneration += 1;
      clearTimeout(nativeCloseTimer);
      nativeCloseTimer = null;
      hijackGate.cancel();
    }

    // Keys: while open, typing goes to our boxes and nothing reaches the game
    // (key releases still do, so a key held while opening doesn't stick).
    win.addEventListener("keydown", event => {
      if (!model.state.open || syntheticEscape) return;
      const path = event.composedPath ? event.composedPath() : [];
      const inBox = dom && (path.includes(dom.search) || path.includes(dom.add));
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close("escape");
      } else if (event.key === "Tab") {
        event.preventDefault();
        (doc.activeElement === host && dom.shadow.activeElement === dom.add ? dom.search : dom.add).focus();
      } else if (event.key === "Enter" && inBox) {
        event.preventDefault();
        if (path.includes(dom.add)) submitAdd();
        else { model.enter(); render(); }
      } else if (!inBox) {
        event.preventDefault();
      }
    }, true);
    win.addEventListener("keypress", event => {
      if (model.state.open && !syntheticEscape) event.stopImmediatePropagation();
    }, true);
    win.addEventListener("keydown", event => {
      if (event.key === "F4" && enabled && !model.state.open && !event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open("hotkey");
      }
    }, true);

    setInterval(() => {
      if (!model.state.open) return;
      const r = model.tick();
      if (r.close) close("joined");
      else if (r.changed) render();
    }, 250);

    win.CCFriends = {
      // Called by cc-browser-wasm-friends.js in place of the game's native
      // FRIEND LIST constructor. Returning false deliberately runs the
      // untouched constructor, so disabling this feature always restores the
      // stock game behavior without reloading the page.
      interceptNativeAction() {
        if (!enabled || !transport || typeof transport.sendBody !== "function") return false;
        cancelNativeClose();
        if (!model.state.open) open("native-button");
        return true;
      },
      onEvent(event, eventTransport) {
        if (eventTransport) transport = eventTransport;
        if (event.type === "tx_friends_refresh" || event.type === "tx_online_refresh") {
          if (hijackGate.noteOutbound(event.type, enabled && !model.state.open)) {
            const generation = armNativeClose();
            setTimeout(() => {
              if (enabled && generation === nativeCloseGeneration) open("button");
            }, 40);
          }
          return;
        }
        if (hijackGate.noteInbound(event.type)) {
          dispatchNativeClose(nativeCloseGeneration);
        }
        if (model.gameEvent(event) && model.state.open) render();
      },
      setEnabled(on) {
        enabled = on !== false;
        if (!enabled) {
          cancelNativeClose();
          close("disabled");
        }
      },
      // cc-browser-mod calls this synchronously from the WebSocket message
      // listener, before the game's later listener receives the same event.
      // The extension still decodes these replies for our list; suppressing
      // them only keeps the stock Friends dialog from filling underneath it.
      shouldSuppress(event) {
        return enabled && event && hijackGate.shouldSuppress(event.type);
      },
      open,
      close,
      status: () => ({ enabled, open: model.state.open, here: model.state.here.size,
        friends: Object.keys(model.state.book.friends).length })
    };
  }

  return { createFriendsModel, createHijackGate, buildRows, buildPeopleRows, avatarColor, initial,
    mute, cleanName, crc32, renderRows, install };
});
