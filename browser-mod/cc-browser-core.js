/*
 * Transport-independent decoder used by the Cubic Castles browser mod.
 *
 * Most of this module decodes copied WebSocket messages. The small set of
 * exported Realm Search builders is also used by the favorites UI to reproduce
 * the game's normal open -> exact-name search -> join flow.
 */
(function installCore(root, factory) {
  const api = factory();
  root.CCBrowserCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeCore() {
  "use strict";

  const DELTA = 0x9e3779b9 >>> 0;
  const COORD_BASE = 100000;
  const MAX_LZF_OUTPUT = 16 * 1024 * 1024;
  const TERMINATOR = new Uint8Array([
    0xee, 0xff, 0x00, 0x00,
    0xdd, 0xcc, 0x00, 0x00,
    0xee, 0xaa, 0x00, 0x00,
    0xaa, 0xcc, 0x00, 0x00
  ]);
  const TERM_ANCHOR = new Uint8Array([0xee, 0xff, 0xdd, 0xcc]);
  const OUTER_TRAILER = new Uint8Array([0xa0, 0xa0, 0xa0, 0xa0, 0x0a, 0x0a, 0x0a, 0x0a]);
  const UTF8 = new TextDecoder("utf-8");
  const LATIN1 = new TextDecoder("windows-1252");

  function reverseBits(value) {
    value = ((value & 0x55) << 1) | ((value >>> 1) & 0x55);
    value = ((value & 0x33) << 2) | ((value >>> 2) & 0x33);
    return ((value << 4) | (value >>> 4)) & 0xff;
  }

  const OUTER_SBOX = Uint8Array.from({ length: 256 }, (_, value) =>
    value === 0 ? 0xff : value === 0xff ? 0x00 : reverseBits(value));
  const OUTER_INV_SBOX = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) OUTER_INV_SBOX[OUTER_SBOX[i]] = i;

  function asU8(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new TypeError("expected binary data");
  }

  function u16(bytes, at) {
    if (at < 0 || at + 2 > bytes.length) throw new RangeError("u16 past end");
    return bytes[at] | (bytes[at + 1] << 8);
  }

  function u32(bytes, at) {
    if (at < 0 || at + 4 > bytes.length) throw new RangeError("u32 past end");
    return (bytes[at] |
      (bytes[at + 1] << 8) |
      (bytes[at + 2] << 16) |
      (bytes[at + 3] << 24)) >>> 0;
  }

  function putU32(bytes, at, value) {
    value >>>= 0;
    bytes[at] = value & 0xff;
    bytes[at + 1] = (value >>> 8) & 0xff;
    bytes[at + 2] = (value >>> 16) & 0xff;
    bytes[at + 3] = (value >>> 24) & 0xff;
  }

  function bodyType(bytes) {
    return bytes && bytes.length >= 2 ? u16(bytes, 0) : null;
  }

  function findBytes(haystack, needle) {
    if (!needle.length) return 0;
    outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function mx(sum, y, z, p, e, key) {
    const a = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) >>> 0;
    const b = (((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0;
    return (a ^ b) >>> 0;
  }

  function decryptWords(input, key) {
    const values = Array.from(input, value => value >>> 0);
    const n = values.length;
    if (n < 2) return values;
    const rounds = 6 + Math.floor(52 / n);
    let sum = Math.imul(rounds, DELTA) >>> 0;
    let y = values[0] >>> 0;
    while (sum !== 0) {
      const e = (sum >>> 2) & 3;
      for (let p = n - 1; p > 0; p -= 1) {
        const z = values[p - 1] >>> 0;
        values[p] = (values[p] - mx(sum, y, z, p, e, key)) >>> 0;
        y = values[p];
      }
      const z = values[n - 1] >>> 0;
      values[0] = (values[0] - mx(sum, y, z, 0, e, key)) >>> 0;
      y = values[0];
      sum = (sum - DELTA) >>> 0;
    }
    return values;
  }

  function encryptWords(input, key) {
    const values = Array.from(input, value => value >>> 0);
    const n = values.length;
    if (n < 2) return values;
    const rounds = 6 + Math.floor(52 / n);
    let sum = 0;
    let z = values[n - 1] >>> 0;
    for (let round = 0; round < rounds; round += 1) {
      sum = (sum + DELTA) >>> 0;
      const e = (sum >>> 2) & 3;
      for (let p = 0; p < n - 1; p += 1) {
        const y = values[p + 1] >>> 0;
        values[p] = (values[p] + mx(sum, y, z, p, e, key)) >>> 0;
        z = values[p];
      }
      const y = values[0] >>> 0;
      values[n - 1] = (values[n - 1] + mx(sum, y, z, n - 1, e, key)) >>> 0;
      z = values[n - 1];
    }
    return values;
  }

  function transformPrefix(bytes, key, transform) {
    bytes = asU8(bytes);
    const encryptedLength = Math.floor(bytes.length / 4) * 4;
    if (encryptedLength < 8) return bytes.slice();
    const words = [];
    for (let at = 0; at < encryptedLength; at += 4) words.push(u32(bytes, at));
    const changed = transform(words, key);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < changed.length; i += 1) putU32(out, i * 4, changed[i]);
    out.set(bytes.subarray(encryptedLength), encryptedLength);
    return out;
  }

  function decryptBytes(bytes, key) {
    return transformPrefix(bytes, key, decryptWords);
  }

  function encryptBytes(bytes, key) {
    return transformPrefix(bytes, key, encryptWords);
  }

  function decryptFrame(frame, key) {
    const plain = decryptBytes(frame, key);
    let end = findBytes(plain, TERMINATOR);
    if (end < 0) end = findBytes(plain, TERM_ANCHOR);
    return {
      plain,
      body: end >= 0 ? plain.slice(0, end) : plain.slice(),
      hadTerminator: end >= 0
    };
  }

  function encryptFrame(body, key, addTerminator = true) {
    body = asU8(body);
    const plain = new Uint8Array(body.length + (addTerminator ? TERMINATOR.length : 0));
    plain.set(body);
    if (addTerminator) plain.set(TERMINATOR, body.length);
    return encryptBytes(plain, key);
  }

  function outerEncode(innerFrame, key, counter) {
    innerFrame = asU8(innerFrame);
    key = asU8(key);
    if (!key.length) throw new Error("outer-cipher key cannot be empty");
    const plain = new Uint8Array(innerFrame.length + 12);
    plain.set(innerFrame);
    putU32(plain, innerFrame.length, counter >>> 0);
    plain.set(OUTER_TRAILER, innerFrame.length + 4);
    const wire = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i += 1) {
      const changed = OUTER_SBOX[(plain[i] - 0x78) & 0xff] ^ key[i % key.length];
      wire[wire.length - 1 - i] = changed;
    }
    return wire;
  }

  function outerDecode(wireFrame, key) {
    wireFrame = asU8(wireFrame);
    key = asU8(key);
    if (!key.length) throw new Error("outer-cipher key cannot be empty");
    if (wireFrame.length < 12) throw new Error("outer-cipher frame is too short");
    const plain = new Uint8Array(wireFrame.length);
    for (let i = 0; i < wireFrame.length; i += 1) {
      const reversed = wireFrame[wireFrame.length - 1 - i] ^ key[i % key.length];
      plain[i] = (OUTER_INV_SBOX[reversed] + 0x78) & 0xff;
    }
    const trailerAt = plain.length - 8;
    for (let i = 0; i < OUTER_TRAILER.length; i += 1) {
      if (plain[trailerAt + i] !== OUTER_TRAILER[i]) throw new Error("outer-cipher trailer mismatch");
    }
    return {
      inner: plain.slice(0, plain.length - 12),
      counter: u32(plain, plain.length - 12)
    };
  }

  function parseOuterKey(plain) {
    plain = asU8(plain);
    try {
      if (bodyType(plain) !== 0x0004 || u16(plain, 2) !== 1 || plain.length < 12) return null;
      const compressedLength = u32(plain, 4);
      const lengthAt = 8 + compressedLength;
      if (lengthAt + 4 <= plain.length) {
        const keyLength = u32(plain, lengthAt);
        const keyAt = lengthAt + 4;
        if (keyLength <= 100 && keyAt + keyLength <= plain.length) {
          return plain.slice(keyAt, keyAt + keyLength);
        }
      }

      // Older server variants recorded the grid's logical size in the length
      // field. Retain the reference client's final-field fallback for those
      // sessions, but use it only when the authoritative offset above failed.
      for (let keyLength = 0; keyLength <= 100; keyLength += 1) {
        const keyLengthAt = plain.length - keyLength - 4;
        if (keyLengthAt < 8) continue;
        if (u32(plain, keyLengthAt) === keyLength) {
          return plain.slice(keyLengthAt + 4);
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function hexToBytes(hex) {
    hex = String(hex || "").replace(/[^0-9a-f]/gi, "");
    if (hex.length % 2) throw new Error("hex string has an odd length");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function protocolString(text) {
    const raw = new TextEncoder().encode(String(text));
    const out = new Uint8Array(4 + raw.length + 1);
    putU32(out, 0, raw.length + 1);
    out.set(raw, 4);
    return out;
  }

  function concatBytes(...arrays) {
    const out = new Uint8Array(arrays.reduce((sum, value) => sum + value.length, 0));
    let at = 0;
    for (const value of arrays) {
      out.set(value, at);
      at += value.length;
    }
    return out;
  }

  function buildJoinRealm(guid) {
    guid = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (guid.length !== 16) throw new Error("realm GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0xd3, 0x00), guid, Uint8Array.of(1, 0, 0, 0, 0));
  }

  function buildOpenRealmBrowser() {
    return buildJoinRealm(new Uint8Array(16).fill(0xff));
  }

  function buildRealmSearch(name, ownGuid) {
    ownGuid = typeof ownGuid === "string" ? hexToBytes(ownGuid) : asU8(ownGuid);
    if (ownGuid.length !== 16) throw new Error("own GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0xc8, 0x00), ownGuid, protocolString(name));
  }

  function buildBlockBreak(x, y, z) {
    const out = new Uint8Array(14);
    out[0] = 0x0a;
    out[1] = 0x00;
    putU32(out, 2, Number(x) >>> 0);
    putU32(out, 6, Number(y) >>> 0);
    putU32(out, 10, Number(z) >>> 0);
    return out;
  }

  // --- Chat (stage2/cc_protocol.py build_chat / build_chat_toggle) ----------
  // A public line is tx 0x0031 + 1 (typing on), tx 0x000c + text, tx 0x0031
  // + 0. The server only shows a line sent between the two toggles; a bare
  // 0x000c is accepted but shown to nobody (proven live by the bot).
  function buildChatToggle(on) { return Uint8Array.of(0x31, 0x00, on ? 1 : 0); }
  function buildChat(text) { return concatBytes(Uint8Array.of(0x0c, 0x00), protocolString(text)); }
  function buildChatSend(text) { return [buildChatToggle(true), buildChat(text), buildChatToggle(false)]; }
  // A whisper (stage2 cc_protocol build_whisper_open / build_whisper_select):
  // the chat command "/whisper <text>" makes the server send its "Whisper to
  // Who?" picker (rx 0x00ba); the click is 0x00ba + u32 menu id + u8 row.
  const WHISPER_TEXT_MAX = 90;
  function buildWhisperOpen(text) {
    if (new TextEncoder().encode(String(text)).length > WHISPER_TEXT_MAX) throw new Error("whisper text is too long");
    return buildChat("/whisper " + text);
  }
  function buildWhisperSelect(menuId, row) {
    if (!(row >= 0 && row <= 255)) throw new Error("whisper menu row out of range");
    return Uint8Array.of(0xba, 0x00, menuId & 0xff, (menuId >>> 8) & 0xff, (menuId >>> 16) & 0xff,
                         (menuId >>> 24) & 0xff, row);
  }
  // rx 0x00ba "Whisper to Who?": u16 + u16 1 + u32 menu id + title + subtitle +
  // u8 count + rows (blank filler rows pad it). {menuId, names: [[row, name]]} or null.
  function parseWhisperMenu(body) {
    try {
      if (body.length < 12 || u16(body, 0) !== 0x00ba) return null;
      const menuId = u32(body, 4);
      const title = readString(body, 8);
      if (title.value !== "Whisper to Who?") return null;
      let at = readString(body, title.next).next + 1;
      const names = [];
      for (let row = 0; at + 4 <= body.length; row += 1) {
        const entry = readString(body, at);
        if (entry.next === at) break;
        if (entry.value.trim()) names.push([row, entry.value.trim()]);
        at = entry.next;
      }
      return { menuId, names };
    } catch (_) {
      return null;
    }
  }

  // --- NPCs (stage2/cc_protocol.py build_npc_talk / parse_npc_dialog) ------
  // Talking to an NPC sends tx 0x00f1 + 16 zero bytes and tx 0x00ef + u32 n +
  // string "NPC_<name>.txt" (n = that string's whole size); the server runs
  // the script and answers with rx 0x00fe: u16 + u16 1 + string npc + string
  // text + 8 bytes + u32 count + count x (string label + 16-byte record, u32
  // index first). The pick is tx 0x00ff + that record. The Farmer's Yes opens
  // the crop window: rx 0x00e1 (the realm browser's markup panel) titled
  // "Sell Crops".
  const CROP_NPC = "Farmer";
  const CROP_PANEL_TITLE = "Sell Crops";
  function buildNpcTalk(name) {
    const script = protocolString(/\.txt$/.test(name) ? name : `NPC_${name}.txt`);
    return [concatBytes(Uint8Array.of(0xf1, 0x00), new Uint8Array(16)),
            concatBytes(Uint8Array.of(0xef, 0x00), u32le(script.length), script)];
  }
  function buildNpcChoice(option) {
    const record = option && option.record ? hexToBytes(option.record) :
      concatBytes(u32le(Number(option) >>> 0), new Uint8Array(12));
    if (record.length !== 16) throw new Error("an NPC option record is 16 bytes");
    return concatBytes(Uint8Array.of(0xff, 0x00), record);
  }
  function parseNpcDialog(body) {
    try {
      if (body.length < 16 || u16(body, 0) !== 0x00fe) return null;
      const npc = readString(body, 4);
      const text = readString(body, npc.next);
      let at = text.next + 8;
      const count = u32(body, at);
      if (count > 64) return null;
      at += 4;
      const options = [];
      for (let i = 0; i < count; i += 1) {
        const label = readString(body, at);
        if (label.next + 16 > body.length) return null;
        const record = body.subarray(label.next, label.next + 16);
        options.push({ label: label.value, index: u32(record, 0), record: bytesToHex(record) });
        at = label.next + 16;
      }
      return { npc: npc.value, text: text.value, options };
    } catch (_) {
      return null;
    }
  }
  const isCropOffer = d => !!d && d.npc === CROP_NPC && /sell me some crops/i.test(d.text || "");
  const yesOption = d => ((d && d.options) || []).find(o => String(o.label).trim().toLowerCase() === "yes") || null;
  // rx 0x00e1 header: u16 + u16 1 + string title + string button + string
  // markup (+ size and flags). {title, button} or null.
  function parsePanel(body) {
    try {
      if (body.length < 16 || u16(body, 0) !== 0x00e1) return null;
      const title = readString(body, 4);
      const button = readString(body, title.next);
      readString(body, button.next);
      return { title: title.value, button: button.value };
    } catch (_) {
      return null;
    }
  }

  // --- Friends (ported from stage2/cc_protocol.py + cc_friendlist.py) -------
  // tx 0x0027 / 0x0088  refresh the friends list / who is online
  // tx 0x0089 + guid    teleport to a friend
  // tx 0x002b + name    unfriend / cancel a request; tx 0x0026 + name = request
  // tx 0x012b + 0/1     Appear Offline To Friends
  // rx 0x0027 friends + pending, rx 0x0088 online guids, rx 0x000d server text
  // ("Request sent to frostyer"), rx 0x0003 + guid = that player left
  function buildRefreshFriends() { return Uint8Array.of(0x27, 0x00); }
  function buildRefreshOnline() { return Uint8Array.of(0x88, 0x00); }
  function buildFriendRequest(name) { return concatBytes(Uint8Array.of(0x26, 0x00), protocolString(name)); }
  function buildUnfriend(name) { return concatBytes(Uint8Array.of(0x2b, 0x00), protocolString(name)); }
  function buildAppearOffline(on) { return Uint8Array.of(0x2b, 0x01, on ? 1 : 0); }
  function buildTeleport(guid) {
    guid = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (guid.length !== 16) throw new Error("teleport GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0x89, 0x00), guid);
  }

  // Realm ban, exactly the game's own player card BAN -> REALLY BAN? (Cubic.exe
  // 0x57f1f3; stage2 cc_protocol.build_realm_ban): 0x006d + the player's guid.
  function buildRealmBan(guid) {
    guid = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (guid.length !== 16) throw new Error("ban GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0x6d, 0x00), guid);
  }
  // ... its unban (Realm Setup -> Banned People UN-BAN, 0x57dfc1): 0x006e + guid
  function buildRealmUnban(guid) {
    guid = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (guid.length !== 16) throw new Error("unban GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0x6e, 0x00), guid);
  }
  // ask for the realm's banned list, as Realm Setup does when it opens (0x57ba2b)
  function buildBannedListRequest() { return Uint8Array.of(0x6c, 0x00); }
  // ... and the trusted list (0x57b9e1)
  function buildTrustedListRequest() { return Uint8Array.of(0x69, 0x00); }
  // trust (player card TRUST, 0x57f0d7) / untrust (Trusted People UN-TRUST,
  // 0x57df1b): 0x006a / 0x006b + the player's 16-byte guid
  function buildRealmTrust(guid) {
    guid = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (guid.length !== 16) throw new Error("trust GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0x6a, 0x00), guid);
  }
  function buildRealmUntrust(guid) {
    guid = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (guid.length !== 16) throw new Error("untrust GUID must be 16 bytes");
    return concatBytes(Uint8Array.of(0x6b, 0x00), guid);
  }
  // the realm's style tags (Realm Setup -> REALM STYLE TAGS, 0x57c457): 0x008d +
  // u32 mask, eight bits — 1 PvP, 2 Parkour, 4 Puzzle, 8 Story, 0x10 Hangout,
  // 0x20 Role Playing, 0x40 Decorative, 0x80 Store
  function buildRealmTags(tags) {
    tags = Number(tags);
    if (!Number.isInteger(tags) || tags < 0 || tags > 0xff) throw new Error("realm tags are eight bits");
    return Uint8Array.of(0x8d, 0x00, tags, 0, 0, 0);
  }

  // Profile (cc-browser-profile.js), the game's own MyProfilePanel messages:
  // tx 0x0125 / 0x014e / 0x014f / 0x0150 + 0/1   Patron / Peace / Lightning /
  //                                              Smile swirl off / on
  // tx 0x00bb + u16 perk + u8                     a perk on (0) / off (1)
  // rx 0x0005 for you (level, perks, flags, clan, farming), rx 0x00b1 XP,
  // rx 0x00b4 perks changed
  // [key, label, owned flag, on flag, opcode]
  const SWIRLS = [["patron", "Patron Swirl", 3, 23, 0x0125], ["peace", "Peace Swirl", 41, 44, 0x014e],
    ["lightning", "Lightning Swirl", 42, 45, 0x014f], ["smile", "Smile Swirl", 43, 46, 0x0150]];
  function buildSwirl(key, on) {
    const swirl = SWIRLS.find(item => item[0] === key);
    if (!swirl) throw new Error(`unknown swirl ${key}`);
    return Uint8Array.of(swirl[4] & 0xff, swirl[4] >>> 8, on ? 1 : 0);
  }
  // Cubit Store (cc-browser-store.js): the game's own three buys, sent after
  // YES on its confirm — 0x00e2 + u32 pack (BUYPACK), 0x00e7 + u32 pack
  // (BUYRECUBE), 0x00e3 + u32 999 + u16 1 + u8 kind + u16 item + u16 qty
  // (BUYITEM). rx 0x0011 / 0x00e8 + u16 1 + i32 = your cubits / recubes.
  function u32le(v) { return Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
  function buildStoreBuyPack(id) { return concatBytes(Uint8Array.of(0xe2, 0x00), u32le(Number(id) >>> 0)); }
  function buildStoreBuyRecube(id) { return concatBytes(Uint8Array.of(0xe7, 0x00), u32le(Number(id) >>> 0)); }
  function buildStoreBuyItem(kind, id, qty) {
    kind = Number(kind); id = Number(id); qty = Number(qty);
    if (!(kind >= 0 && kind <= 255 && id >= 0 && id <= 0xffff && qty >= 1 && qty <= 0xffff)) {
      throw new Error("store item out of range");
    }
    return Uint8Array.of(0xe3, 0x00, 0xe7, 0x03, 0x00, 0x00, 0x01, 0x00, kind,
      id & 0xff, id >>> 8, qty & 0xff, qty >>> 8);
  }
  function parseWallet(body) {
    if (!body || body.length !== 8 || u16(body, 2) !== 1) return null;
    const type = bodyType(body), n = u32(body, 4) | 0;
    if (n < 0) return null;
    if (type === 0x0011) return { cubits: n };
    if (type === 0x00e8) return { recubes: n };
    return null;
  }

  // The perk grid's pick button (cc-browser-perks.js, Cubic.exe 0x5932ee):
  // 0x0141 + i32 x + i32 y, the cell on the grid (both 0..99).
  function buildPerkPick(x, y) {
    x = Number(x); y = Number(y);
    if (!(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 100 && y >= 0 && y < 100)) {
      throw new Error(`perk cell ${x},${y} is off the grid`);
    }
    return Uint8Array.of(0x41, 0x01, x, 0, 0, 0, y, 0, 0, 0);
  }

  function buildPerkSwitch(perk, on) {
    perk = Number(perk);
    if (!Number.isInteger(perk) || perk < 0 || perk > 0x28) throw new Error(`unknown perk ${perk}`);
    return Uint8Array.of(0xbb, 0x00, perk, 0x00, on ? 0 : 1);
  }

  // [16-byte guid][u32 len][name + NUL] x count, starting at `at`
  function walkGuidNames(body, at, count) {
    const out = {};
    let n = 0;
    while (at + 20 <= body.length && n < count) {
      const guid = bytesToHex(body.subarray(at, at + 16));
      const len = u32(body, at + 16);
      if (len < 1 || at + 20 + len > body.length) break;
      let end = at + 20 + len;
      while (end > at + 20 && body[end - 1] === 0) end -= 1;
      const name = UTF8.decode(body.subarray(at + 20, end));
      if (name) out[name] = guid;
      at += 20 + len;
      n += 1;
    }
    return { names: out, next: at, walked: n };
  }

  function parseFriendsList(body) {
    try {
      if (bodyType(body) !== 0x0027 || body.length < 8) return null;
      const count = u32(body, 4);
      if (count > 5000) return null;
      const friends = walkGuidNames(body, 8, count);
      let pending = {};
      // the pending array is only trustworthy when every friend was walked
      if (friends.walked === count && friends.next + 4 <= body.length) {
        const pcount = u32(body, friends.next);
        if (pcount <= 5000) pending = walkGuidNames(body, friends.next + 4, pcount).names;
      }
      return { friends: friends.names, pending };
    } catch (_) {
      return null;
    }
  }

  function parseOnlineFriends(body) {
    if (bodyType(body) !== 0x0088 || body.length < 8) return null;
    const count = u32(body, 4);
    if (count > 5000 || body.length < 8 + count * 16) return null;
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(bytesToHex(body.subarray(8 + i * 16, 24 + i * 16)));
    return out;
  }

  function parseServerText(body) {
    if (bodyType(body) !== 0x000d || body.length < 9) return null;
    const n = u32(body, 5);
    if (n < 1 || 9 + n > body.length) return null;
    const raw = body.subarray(9, 9 + n);
    for (const c of raw) if (!(c === 0 || c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127))) return null;
    return UTF8.decode(raw).replace(/[\x00\n]+$/, "");
  }

  // --- Incoming chat (stage2 cc_protocol parse_chat / parse_whisper) --------
  // rx 0x000c = type + 0x0001 + 16-byte sender guid + lenpfx text + status.
  // The sender's name isn't in it (it comes with their 0x0005 player state).
  // Colour runs are DLE (0x10) + "c(r,g,b)"; a whisper (yours or to you) is
  // DLE colour + "(WHISPER)\n" + message. A lone byte is a chat emoji.
  function cleanChatLine(text) {
    return String(text == null ? "" : text)
      .replace(/\x10c\([^)]*\)/g, "")
      .replace(/[\x00-\x1f\x7f\ufffd]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  // The line as coloured runs, the way the game draws it: [{text, color}],
  // color = [r, g, b] 0..255 from a c(r,g,b) tag (0..1 floats), or null for
  // the line's default colour. Joined, the runs equal cleanChatLine(raw).
  function chatSegments(raw) {
    const runs = [];
    const tag = /\x10c\(([0-9.]+),([0-9.]+),([0-9.]+)\)/g;
    let color = null;
    let at = 0;
    let match;
    const push = text => {
      text = text.replace(/[\x00-\x1f\x7f\ufffd]+/g, " ").replace(/\s+/g, " ");
      if (text) runs.push({ text, color });
    };
    while ((match = tag.exec(raw))) {
      push(raw.slice(at, match.index));
      color = [match[1], match[2], match[3]].map(v =>
        Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 255));
      at = tag.lastIndex;
    }
    push(raw.slice(at));
    // one space between runs at most, none at the ends
    for (let i = 1; i < runs.length; i += 1) {
      if (runs[i - 1].text.endsWith(" ") && runs[i].text.startsWith(" ")) runs[i].text = runs[i].text.slice(1);
    }
    if (runs.length) {
      runs[0].text = runs[0].text.replace(/^ +/, "");
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/ +$/, "");
    }
    return runs.filter(run => run.text);
  }

  function parseChatLine(body) {
    try {
      if (bodyType(body) !== 0x000c || body.length < 25) return null;
      const guid = bytesToHex(body.subarray(4, 20));
      const raw = readString(body, 20).value;
      const tag = raw.indexOf("(WHISPER)");
      const whisper = raw.charCodeAt(0) === 0x10 && tag >= 0;
      let message = raw;
      if (whisper) {
        const nl = raw.indexOf("\n", tag);
        message = nl >= 0 ? raw.slice(nl + 1) : raw.slice(tag + 9);
      }
      let segments = chatSegments(message);
      if (!segments.length) segments = [{ text: "[emoji]", color: null }];
      return { guid, text: segments.map(run => run.text).join(""), segments, whisper };
    } catch (_) {
      return null;
    }
  }

  // rx 0x000d server notice (the SYSTEM lines) with colour markup;
  // parseServerText takes only plain ASCII. Text length at +5, text at +9.
  function parseNoticeLine(body) {
    try {
      if (bodyType(body) !== 0x000d || body.length < 9) return null;
      const n = u32(body, 5);
      if (n < 1 || 9 + n > body.length) return null;
      const segments = chatSegments(UTF8.decode(body.subarray(9, 9 + n)));
      if (!segments.length) return null;
      return { text: segments.map(run => run.text).join(""), segments };
    } catch (_) {
      return null;
    }
  }

  // A server text (rx 0x000d: u16 + u16 1 + u8 kind + string, Cubic.exe
  // 0x5ccc57) with more lines added under its own — /help gets our commands.
  function extendServerText(body, extra) {
    body = asU8(body);
    if (bodyType(body) !== 0x000d || body.length < 9) throw new Error("not a server text");
    const text = readString(body, 5);
    const merged = text.value.replace(/[\s\x00]+$/, "") + "\n" + String(extra);
    return concatBytes(body.subarray(0, 5), protocolString(merged), body.subarray(text.next));
  }

  // --- Plot / rental "bumper" (ported from stage2/cc_protocol.py) -----------
  // Hitting a bumper block pops a rent dialog: tx 0x00d9 (a position frame) then
  // tx 0x00d7 (the target block). A RENTED plot replies with a 0x0036 OKAY notice
  // ("HH:MM:SS left in this area rented by <name>."); an AVAILABLE plot replies
  // with the 0x00ca YES/NO confirm we answer to rent (10 Cubits).
  function encCoord(v) {
    v = Math.trunc(Number(v)) >>> 0;
    return [Math.floor(v / COORD_BASE), v % COORD_BASE];
  }

  // rx 0x0023 "you are now at x, y, z" — the server's same-realm teleport, which
  // the game handles itself. type | 0x0001 | our 16-byte guid | X, Y, Z as
  // (high, low) u32 pairs: the exact 44-byte layout the server sends.
  function buildSelfMove(ownGuid, coords) {
    ownGuid = typeof ownGuid === "string" ? hexToBytes(ownGuid) : asU8(ownGuid);
    if (ownGuid.length !== 16) throw new Error("own GUID must be 16 bytes");
    const out = new Uint8Array(44);
    const view = new DataView(out.buffer);
    view.setUint16(0, 0x0023, true);
    view.setUint16(2, 1, true);
    out.set(ownGuid, 4);
    coords.forEach((value, axis) => {
      const [high, low] = encCoord(value);
      view.setUint32(20 + axis * 8, high, true);
      view.setUint32(24 + axis * 8, low, true);
    });
    return out;
  }

  function buildBumpPos(x, y, z, facing = 179) {
    const out = new Uint8Array(34);
    out[0] = 0xd9; out[1] = 0x00;
    const xs = encCoord(x), ys = encCoord(y), zs = encCoord(z);
    putU32(out, 2, xs[0]); putU32(out, 6, xs[1]);
    putU32(out, 10, ys[0]); putU32(out, 14, ys[1]);
    putU32(out, 18, zs[0]); putU32(out, 22, zs[1]);
    putU32(out, 26, ((Number(facing) % 360) + 360) % 360);
    putU32(out, 30, 10000);
    return out;
  }

  function buildBumpHit(bx, by, bz) {
    const out = new Uint8Array(28);
    out[0] = 0xd7; out[1] = 0x00;
    putU32(out, 2, Number(bx) >>> 0); putU32(out, 6, 0);
    putU32(out, 10, Number(by) >>> 0); putU32(out, 14, 0);
    putU32(out, 18, Number(bz) >>> 0); putU32(out, 22, 0);
    out[26] = 0x00; out[27] = 0x01;
    return out;
  }

  function buildDialogResponse(guid, confirm) {
    const g = typeof guid === "string" ? hexToBytes(guid) : asU8(guid);
    if (g.length !== 16) throw new Error("dialog GUID must be 16 bytes");
    const out = new Uint8Array(19);
    out[0] = 0xca; out[1] = 0x00;
    out.set(g, 2);
    out[18] = confirm ? 1 : 0;
    return out;
  }

  function parseNotice0036(body) {
    try {
      if (bodyType(body) !== 0x0036 || body.length < 8) return null;
      const title = readString(body, 4);
      const text = readString(body, title.next);
      return { title: title.value, text: text.value, guid: null };
    } catch (_) {
      return null;
    }
  }

  const BUMP_TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})\s+left/;

  function classifyRentDialog(title, text) {
    const t = text || "";
    const low = t.toLowerCase();
    const rentedBy = low.includes("left in this area rented by");
    const offersRent = low.includes("rent this area");
    let secondsLeft = null;
    const m = BUMP_TIME_RE.exec(t);
    if (m) secondsLeft = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    let owner = null;
    const om = /rented by ([^.]+)\./.exec(t);
    if (om) owner = om[1].trim();
    if (rentedBy) return { kind: offersRent ? "occupied_self" : "occupied_other", secondsLeft, owner };
    if (offersRent) return { kind: "available", secondsLeft: null, owner: null };
    return { kind: "not_bumper", secondsLeft: null, owner: null };
  }

  // --- Plot keeper: hold a plot you already rent, forever --------------------
  // Each hit is the game's own pair: tx 0x00d9 (a bump position frame) then
  // tx 0x00d7 (the bumper block), with the position where you REALLY stand —
  // nothing moves. (A bare 0x00d7 gets the rent offer but the server ignores
  // the YES; reporting the bumper block as the position drags your character
  // around — both seen live, so neither is used.) No known position yet = no
  // hits until you take a step.
  // Your own plot answers with the 0x00ca "HH:MM:SS left ... rented by you.
  // Would you like to rent this area again?" offer: with more than
  // KEEP_RENEW_S left we answer NO and sleep until then; inside the window we
  // answer YES (10 Cubits), then a second hit re-reads the time to CONFIRM the
  // renewal took. A 1-hour rent therefore renews every ~55 minutes, and a retry
  // can never pay twice: the YES only goes out while the time is low.
  // Hands off: the moment YOUR game bumps something, rent boxes are yours
  // again; and it gives up (stops) after 3 silent hits or 3 failed renewals.
  const KEEP_RENEW_S = 300;          // renew with 5 minutes left
  const KEEP_REPLY_MS = 6000;        // a hit with no reply by then is a miss
  const KEEP_VERIFY_MS = 2500;       // re-read the time this long after YES
  const KEEP_RETRY_MS = 30000;       // after a miss / failed renewal
  const KEEP_DRAIN_MS = 4000;        // extra rent boxes after ours: hide + NO
  const KEEP_HANDS_OFF_MS = 15000;   // after your own bump, boxes are yours
  const KEEP_MAX_TRIES = 3;
  const KEEP_FALLBACK_S = 55 * 60;   // next renew if the text had no time

  function createPlotKeeper(opts) {
    const now = opts.now || (() => Date.now());
    const log = opts.log || (() => {});
    const s = {
      on: false, bx: null, by: null, bz: null, realm: null,
      next: "check", dueAt: 0, pending: null, drainUntil: 0, handsOffUntil: 0, confirmUntil: 0,
      misses: 0, fails: 0, beforeLeft: null,
      secondsLeft: null, leftAt: 0, renewals: 0, lastRenewAt: null,
      step: "off", message: "", tone: ""
    };

    function set(step, message, tone = "") {
      s.step = step; s.message = message; s.tone = tone;
      if (opts.onChange) opts.onChange();
    }

    function realPos() {
      const pos = opts.getPos ? opts.getPos() : null;
      return Array.isArray(pos) && pos.length === 3 && pos.every(Number.isFinite) ? pos : null;
    }

    function answer(guid, yes) {
      if (!guid) return;
      log(`answer ${yes ? "YES" : "NO"} ${guid.slice(0, 8)}…`);
      try { opts.send(buildDialogResponse(guid, yes)); } catch (_) { /* the hit is retried */ }
    }

    function schedule(left) {
      s.next = "check";
      s.dueAt = now() + (left == null ? KEEP_FALLBACK_S * 1000 :
        Math.max(10000, (left - KEEP_RENEW_S) * 1000));
    }

    function giveUp(message) {
      s.on = false; s.pending = null;
      log(`stopped: ${message}`);
      set("stopped", message, "bad");
    }

    function start(cfg) {
      const coords = [cfg.bx, cfg.by, cfg.bz].map(v => String(v == null ? "" : v).trim());
      if (!coords.every(v => /^\d+$/.test(v))) throw new Error("enter whole-number bx, by, bz");
      [s.bx, s.by, s.bz] = coords.map(Number);
      s.realm = cfg.realm || null;
      s.on = true;
      s.next = "check"; s.dueAt = 0; s.pending = null; s.drainUntil = 0; s.handsOffUntil = 0;
      s.confirmUntil = 0; s.force = !!cfg.buyNow;
      s.misses = 0; s.fails = 0;
      s.secondsLeft = null; s.renewals = 0; s.lastRenewAt = null;
      set("checking", s.force ? "Test buy: hitting the bumper…" : "Checking the plot…", "watch");
      tick();
    }

    // Debug: renew on the very next hit, whatever time is left (10 Cubits).
    function buyNow(cfg) {
      start({ ...cfg, buyNow: true });
    }

    function stop() {
      s.on = false; s.pending = null; s.force = false;
      set("off", "Off.", "");
    }

    function tick() {
      if (!s.on) return;
      const t = now();
      if (s.pending) {
        if (t - s.pending.at < KEEP_REPLY_MS) return;
        s.misses += 1;
        s.next = s.pending.kind;
        s.pending = null;
        log(`no reply (${s.misses})`);
        if (s.misses >= KEEP_MAX_TRIES) {
          giveUp("No reply from the bumper 3 times — check bx/by/bz. Stopped.");
          return;
        }
        s.dueAt = t + KEEP_RETRY_MS;
        set("noreply", `No reply from the bumper (${s.misses}/3) — trying again in 30s`, "bad");
        return;
      }
      if (t < s.dueAt || t < s.handsOffUntil) return;
      const realm = opts.getRealm ? opts.getRealm() : null;
      if (s.realm && realm !== s.realm) {
        if (s.step !== "away") set("away", `Waiting — go back to ${s.realm}`, "bad");
        return;
      }
      const pos = realPos();
      if (!pos) {
        if (s.step !== "nopos") set("nopos", "Take one step so the keeper knows where you stand", "bad");
        return;
      }
      try {
        opts.send(buildBumpPos(pos[0], pos[1], pos[2]));
        opts.send(buildBumpHit(s.bx, s.by, s.bz));
      } catch (_) {
        s.dueAt = t + 5000;
        if (s.step !== "nogame") set("nogame", "Not connected to the game — waiting", "bad");
        return;
      }
      log(`hit ${s.bx},${s.by},${s.bz} (${s.next})`);
      s.pending = { kind: s.next, at: t };
    }

    // Your game bumped something itself: whatever box comes back is yours.
    function handsOff() {
      if (!s.on) return;
      s.handsOffUntil = now() + KEEP_HANDS_OFF_MS;
      s.drainUntil = 0;
      if (s.pending) {
        s.next = s.pending.kind;
        s.pending = null;
        s.dueAt = Math.max(s.dueAt, s.handsOffUntil);
      }
      log("your game hit a bumper — hands off");
    }

    // Is this reply the answer to OUR hit (or a duplicate right after it)?
    // Pure, so the socket hook can ask before the game sees the frame and
    // hide the game's own rent box — the keeper answers it.
    function classify(event) {
      if (!s.on || !event) return null;
      if (event.type !== "dialog" && event.type !== "notice") return null;
      const t = now();
      if (t < s.handsOffUntil) return null;
      if (!(s.pending && t - s.pending.at <= KEEP_REPLY_MS) && t >= s.drainUntil) return null;
      const c = classifyRentDialog(event.title, event.text);
      if (c.kind === "not_bumper") return null;
      if ((event.type === "notice") !== (c.kind === "occupied_other")) return null;
      return c;
    }

    function onEvent(event) {
      if (event && event.type === "bump_hit") {
        handsOff();
        return false;
      }
      const c = classify(event);
      if (!c) return false;
      const t = now();
      if (!s.pending) {
        // Renewing is two boxes: "rent this area again?" YES, then the server's
        // "Time: 1 Hour, Cost: 10 Cubits ... still want to rent this area?"
        // warning (same id) — that one needs YES too or nothing is bought.
        if (s.confirmUntil > t && c.kind === "available") {
          s.confirmUntil = 0;
          log("2nd box (cost warning) → YES");
          answer(event.guid, true);
          s.dueAt = t + KEEP_VERIFY_MS;
          return true;
        }
        log(`extra ${c.kind} box hidden`);
        answer(event.guid, false);
        return true;
      }
      const kind = s.pending.kind;
      log(`reply: ${c.kind}${c.secondsLeft != null ? `, ${c.secondsLeft}s left` : ""}`);
      s.pending = null;
      s.drainUntil = t + KEEP_DRAIN_MS;
      s.misses = 0;
      if (c.kind === "occupied_other") {
        giveUp(`Held by ${c.owner || "someone else"} — not yours. Stopped.`);
        return true;
      }
      if (c.secondsLeft != null) { s.secondsLeft = c.secondsLeft; s.leftAt = t; }
      if (kind === "verify") {
        answer(event.guid, false);
        const left = c.kind === "available" ? null : c.secondsLeft;
        const took = c.kind === "occupied_self" &&
          (left == null || left > (s.beforeLeft || 0) + 5);   // time went UP = bought
        if (took) {
          s.fails = 0;
          s.renewals += 1;
          s.lastRenewAt = t;
          schedule(left);
          set("held", "Renewed ✓ (10 Cubits)", "good");
        } else {
          s.fails += 1;
          if (s.fails >= KEEP_MAX_TRIES) {
            giveUp("The YES didn't take 3 times — rent it by hand. Stopped.");
            return true;
          }
          s.next = "check";
          s.dueAt = t + KEEP_RETRY_MS;
          set("retry", `Renewal didn't take (${s.fails}/3) — trying again in 30s`, "bad");
        }
        return true;
      }
      const due = s.force || c.kind === "available" || c.secondsLeft == null ||
        c.secondsLeft <= KEEP_RENEW_S + 60;
      if (due) {
        if (s.force) log("test buy: renewing now");
        s.force = false;
        answer(event.guid, true);
        // only a "rent again?" YES is followed by the cost-warning box; after
        // renting a free plot (already the warning box) any extra gets NO
        s.confirmUntil = c.kind === "occupied_self" ? t + KEEP_DRAIN_MS : 0;
        s.beforeLeft = c.kind === "available" ? 0 : (c.secondsLeft || 0);
        s.next = "verify";
        s.dueAt = t + KEEP_VERIFY_MS;
        set("renewing", c.kind === "available" ? "Plot was free — renting it…" : "Renewing…", "watch");
      } else {
        answer(event.guid, false);
        schedule(c.secondsLeft);
        if (s.step !== "held") set("held", "Yours — will renew with 5 min left", "good");
      }
      return true;
    }

    function view() {
      const t = now();
      return {
        on: s.on, step: s.step, message: s.message, tone: s.tone,
        bx: s.bx, by: s.by, bz: s.bz, realm: s.realm,
        renewals: s.renewals, lastRenewAt: s.lastRenewAt,
        secondsLeft: s.secondsLeft == null ? null :
          Math.max(0, s.secondsLeft - Math.floor((t - s.leftAt) / 1000)),
        nextInS: s.on && !s.pending ? Math.max(0, Math.ceil((s.dueAt - t) / 1000)) : null,
        waiting: !!s.pending
      };
    }

    return { start, stop, buyNow, tick, claims: event => !!classify(event), onEvent, view };
  }

  function patchPlaceBody(body, coord) {
    body = asU8(body);
    if (bodyType(body) !== 0x000b || body.length !== 52 || u16(body, 34) !== 1) {
      throw new Error("expected a genuine 52-byte placement packet");
    }
    if (!Array.isArray(coord) || coord.length !== 3 || coord.some(value =>
      !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 0xffffffff)) {
      throw new Error("invalid placement coordinates");
    }
    const out = body.slice();
    putU32(out, 36, Number(coord[0]));
    putU32(out, 40, Number(coord[1]));
    putU32(out, 44, Number(coord[2]));
    return out;
  }

  function registryGuidToWire(value) {
    const match = String(value || "").replace(/[{}]/g, "").match(
      /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i);
    if (!match) return null;
    const first = hexToBytes(match[1]);
    const second = hexToBytes(match[2]);
    const third = hexToBytes(match[3]);
    return concatBytes(
      Uint8Array.from(first).reverse(), Uint8Array.from(second).reverse(),
      Uint8Array.from(third).reverse(), hexToBytes(match[4] + match[5]));
  }

  function parseRealmSearch(body) {
    if (bodyType(body) !== 0x00e1) return [];
    const text = LATIN1.decode(body);
    const pattern = /<link\s+"\{([0-9A-Fa-f-]{36})\}">([\s\S]*?)<\/link>/g;
    const results = [];
    let match;
    while ((match = pattern.exec(text))) {
      const guid = registryGuidToWire(match[1]);
      const name = match[2].replace(/<[^>]+>/g, "").trim();
      if (guid && name) results.push({ name, guid: bytesToHex(guid) });
    }
    return results;
  }

  function parseVendingOffer(text) {
    text = String(text || "");
    let match = /buy\s+(\d+)\s+(.+?)\s+item\(s\)\s+for\s+([\d,]+)\s+(\w+)/i.exec(text);
    if (match) {
      return {
        item: match[2].trim(),
        qty: Number(match[1]),
        price: Number(match[3].replace(/,/g, "")),
        currency: match[4],
        stock: null
      };
    }
    match = /has\s+([\d,]+)\s+(\w+)\s+in it and costs\s+([\d,]+)\s+(\w+)/i.exec(text);
    if (!match) return null;
    return {
      item: null,
      qty: null,
      price: Number(match[3].replace(/,/g, "")),
      currency: match[4],
      stock: Number(match[1].replace(/,/g, ""))
    };
  }

  function parseDialog(body) {
    try {
      if (bodyType(body) !== 0x00ca || body.length < 24) return null;
      const guid = bytesToHex(body.subarray(4, 20));
      const title = readString(body, 20);
      const message = readString(body, title.next);
      return {
        guid,
        title: title.value,
        text: message.value,
        offer: parseVendingOffer(message.value)
      };
    } catch (_) {
      return null;
    }
  }

  function recoverKey(loginResponse, nextFrame) {
    loginResponse = asU8(loginResponse);
    nextFrame = asU8(nextFrame);
    for (let at = 0; at + 16 <= loginResponse.length; at += 1) {
      const key = [
        u32(loginResponse, at), u32(loginResponse, at + 4),
        u32(loginResponse, at + 8), u32(loginResponse, at + 12)
      ];
      try {
        if (decryptFrame(nextFrame, key).hadTerminator) return key;
      } catch (_) {
        // A candidate is expected to fail; try the next 16-byte window.
      }
    }
    return null;
  }

  function readString(bytes, at) {
    const length = u32(bytes, at);
    const start = at + 4;
    const end = start + length;
    if (length > bytes.length || end > bytes.length) throw new RangeError("string past end");
    const rawEnd = length && bytes[end - 1] === 0 ? end - 1 : end;
    return { value: UTF8.decode(bytes.subarray(start, rawEnd)), next: end };
  }

  // rx 0x006c — the realm's banned list (Cubic.exe 0x518e6a): u16 type + u16 1 +
  // i32 count + count x (string name + 16-byte guid). [[name, guid hex]] or null.
  // rx 0x0069 is the trusted list, the same shape (0x518f50).
  function parseBannedList(body) { return parseRealmList(body, 0x006c); }
  function parseTrustedList(body) { return parseRealmList(body, 0x0069); }
  function parseRealmList(body, op) {
    try {
      if (body.length < 8 || u16(body, 0) !== op || u16(body, 2) !== 1) return null;
      const n = u32(body, 4);
      if (n > 5000) return null;
      const out = [];
      let at = 8;
      for (let i = 0; i < n; i += 1) {
        const name = readString(body, at);
        if (name.next + 16 > body.length) return null;
        out.push([name.value, bytesToHex(body.subarray(name.next, name.next + 16))]);
        at = name.next + 16;
      }
      return out;
    } catch (_) {
      return null;
    }
  }

  function parseRealmId(body) {
    try {
      if (bodyType(body) !== 0x005f || body.length < 8) return null;
      const realm = readString(body, 4);
      const owner = readString(body, realm.next);
      return { realm: realm.value, owner: owner.value };
    } catch (_) {
      return null;
    }
  }

  function bytesToHex(bytes) {
    let result = "";
    for (const value of bytes) result += value.toString(16).padStart(2, "0");
    return result;
  }

  // Login reply rx 0x0002: own guid, the realm's registration guid (new on
  // every entry; Realm Search / joins use it), then the realm's STABLE id —
  // the one the game's Share link carries (stage2 cc_protocol
  // realm_id_from_response). realmId is null when absent or all zero.
  function guidsFromResponse(response) {
    try {
      let at = 4;
      at = readString(response, at).next;
      at = readString(response, at).next;
      if (at + 32 > response.length) return { own: null, realm: null, realmId: null };
      const stable = response.subarray(at + 32, at + 48);
      return {
        own: bytesToHex(response.subarray(at, at + 16)),
        realm: bytesToHex(response.subarray(at + 16, at + 32)),
        realmId: stable.length === 16 && stable.some(value => value) ? bytesToHex(stable) : null
      };
    } catch (_) {
      return { own: null, realm: null, realmId: null };
    }
  }

  // The game's Share link: castles.cc/?realm=<stable realm id XOR 21436587×4>
  // (stage2 cc_protocol share_link_xor; proven live 2026-10-04).
  const SHARE_LINK_XOR = [0x21, 0x43, 0x65, 0x87];
  function shareLink(realmId) {
    const raw = hexToBytes(realmId || "");
    if (raw.length !== 16) return null;
    return `https://castles.cc/?realm=${bytesToHex(raw.map((value, i) => value ^ SHARE_LINK_XOR[i % 4]))}`;
  }

  function lzfDecompress(data, maxOutput = MAX_LZF_OUTPUT) {
    data = asU8(data);
    const out = [];
    let at = 0;
    while (at < data.length) {
      const ctrl = data[at++];
      if (ctrl < 32) {
        const end = at + ctrl + 1;
        if (end > data.length) throw new Error("LZF literal runs past input");
        while (at < end) out.push(data[at++]);
      } else {
        let length = ctrl >>> 5;
        if (length === 7) {
          if (at >= data.length) throw new Error("LZF missing length");
          length += data[at++];
        }
        if (at >= data.length) throw new Error("LZF missing offset");
        const distance = ((ctrl & 0x1f) << 8) + data[at++] + 1;
        length += 2;
        let source = out.length - distance;
        if (source < 0) throw new Error("LZF back-reference before output");
        for (let i = 0; i < length; i += 1) out.push(out[source + i]);
      }
      if (out.length > maxOutput) throw new Error("LZF output too large");
    }
    return Uint8Array.from(out);
  }

  function parseRealmGrid(plain) {
    try {
      if (bodyType(plain) !== 0x0004 || plain.length < 8) return null;
      const compressedLength = u32(plain, 4);
      if (!compressedLength || 8 + compressedLength > plain.length) return null;
      const raw = lzfDecompress(plain.subarray(8, 8 + compressedLength));
      if (raw.length < 10) return null;
      const size = [u16(raw, 0), u16(raw, 2), u16(raw, 4)];
      const chunkCount = u16(raw, 6);
      if (size.some(value => value <= 0 || value > 4096)) return null;
      const chunkBytes = 12 + 2000;
      if (raw.length < 10 + chunkCount * chunkBytes) return null;
      const blocks = [];
      for (let chunk = 0; chunk < chunkCount; chunk += 1) {
        const head = 10 + chunk * chunkBytes;
        const origin = [u32(raw, head) * 10, u32(raw, head + 4) * 10, u32(raw, head + 8) * 10];
        if (origin.some((value, axis) => value >= size[axis])) return null;
        for (let local = 0; local < 1000; local += 1) {
          const value = u16(raw, head + 12 + local * 2);
          if (!value) continue;
          blocks.push({
            x: origin[0] + Math.floor(local / 100),
            y: origin[1] + Math.floor(local / 10) % 10,
            z: origin[2] + local % 10,
            id: value & 0x0fff,
            extra: value >>> 12
          });
        }
      }
      return { size, chunks: chunkCount, blocks };
    } catch (_) {
      return null;
    }
  }

  function parseWorldObjects(body) {
    try {
      const type = bodyType(body);
      const wide = type === 0x000f;
      if (!wide && type !== 0x0021) return [];
      const recordSize = wide ? 70 : 44;
      const start = wide ? 4 : 8;
      const payloadLength = body.length - start;
      if (payloadLength <= 0 || payloadLength % recordSize) return [];
      const objects = [];
      for (let at = start; at < body.length; at += recordSize) {
        objects.push({
          guid: bytesToHex(body.subarray(at, at + 16)),
          kind: body[at + 16],
          bx: u32(body, at + 17),
          ox: u32(body, at + 21),
          by: u32(body, at + 25),
          oy: u32(body, at + 29),
          bz: u32(body, at + 33),
          oz: u32(body, at + 37),
          typeId: u16(body, at + (wide ? 65 : 41)),
          flag: body[at + (wide ? 69 : 43)],
          source: type
        });
      }
      return objects;
    } catch (_) {
      return [];
    }
  }

  function decodeCoord(high, low) {
    return high * COORD_BASE + low;
  }

  function parsePlayerState(body) {
    try {
      if (bodyType(body) !== 0x0005 || body.length < 48) return null;
      const guid = bytesToHex(body.subarray(4, 20));
      const name = readString(body, 20);
      const at = name.next;
      if (at + 24 > body.length) return null;
      // The entity's flag bytes sit 36 bytes after the coordinates (right
      // after an ff ff marker at +28). Flag n = byte n>>3, bit (n-1)&7:
      //   flag 6  (byte 0 & 0x20): not a player — sign, mannequin, NPC
      //   flag 26 (byte 3 & 0x02): Appear Offline To Friends
      const f = at + 24;
      const flags = f + 40 <= body.length && body[f + 28] === 0xff && body[f + 29] === 0xff
        ? body.slice(f + 36, f + 40) : null;
      return {
        guid,
        name: name.value,
        coords: [
          decodeCoord(u32(body, at), u32(body, at + 4)),
          decodeCoord(u32(body, at + 8), u32(body, at + 12)),
          decodeCoord(u32(body, at + 16), u32(body, at + 20))
        ],
        flags,
        notPlayer: !!(flags && (flags[0] & 0x20)),
        appearOffline: flags ? !!(flags[3] & 0x02) : null
      };
    } catch (_) {
      return null;
    }
  }

  // Flag n of an entity's flag bytes, as Cubic reads them: byte n >> 3,
  // bit 1 << ((n - 1) & 7).
  function entityFlag(flags, n) {
    const i = n >> 3;
    return !!(flags && i < flags.length && (flags[i] & (1 << ((n - 1) & 7))));
  }

  // Every field of a 0x0005 player state, in the game's own reading order
  // (Cubic.exe 0x5c8609; cc_protocol.parse_player_profile is the same):
  // guid, name, 4 x 8 coord bytes, i16 n + n x i16, i16, i8, i16, u8,
  // i16 m + m x 4 flag bytes, u8, i32, i16 level, i8 k + k x i16 perks,
  // clan, clan rank, i32 farming level, i32 crops, i32 farming %. The game
  // zeroes the farming numbers when the level or % isn't 0..100.
  function parsePlayerProfile(body) {
    try {
      if (bodyType(body) !== 0x0005 || body.length < 48) return null;
      const s16 = at => (u16(body, at) << 16) >> 16;
      const s32 = at => u32(body, at) | 0;
      const guid = bytesToHex(body.subarray(4, 20));
      const name = readString(body, 20);
      let at = name.next + 32;
      const n = s16(at); at += 2;
      if (n < 0 || n > 64) return null;
      at += 2 * n + 2 + 1 + 2 + 1;
      const m = s16(at); at += 2;
      if (m < 0 || m > 64 || at + 4 * m > body.length) return null;
      const flags = body.slice(at, at + 4 * m); at += 4 * m;
      at += 1 + 4;
      const level = s16(at); at += 2;
      if (at >= body.length) return null;
      const k = (body[at] << 24) >> 24; at += 1;
      if (k < 0 || k > 128) return null;
      const perks = [];
      for (let i = 0; i < k; i += 1) { perks.push(u16(body, at) & 0xff); at += 2; }
      const clan = readString(body, at); at = clan.next;
      const rank = readString(body, at); at = rank.next;
      let farmLevel = s32(at), crops = s32(at + 4), farmPct = s32(at + 8);
      if (!(farmPct >= 0 && farmPct <= 100 && farmLevel >= 0 && farmLevel <= 100)) {
        farmLevel = crops = farmPct = 0;
      }
      return { guid, name: name.value, level, perks, flags, clan: clan.value, rank: rank.value,
        farmLevel, crops, farmPct };
    } catch (_) {
      return null;
    }
  }

  // rx 0x00b1: u16 1, i32 level, i32 xp, i32 % to the next level, u8 level-up
  function parseXp(body) {
    if (!body || body.length !== 17 || bodyType(body) !== 0x00b1 || u16(body, 2) !== 1) return null;
    const level = u32(body, 4) | 0, xp = u32(body, 8) | 0, pct = u32(body, 12) | 0;
    if (level < 0 || xp < 0 || pct < 0 || pct > 100) return null;
    return { level, xp, pct, levelledUp: !!body[16] };
  }

  // rx 0x00b4: u16 1, i8 k + k x i16 — your perks, all of them
  function parsePerks(body) {
    if (!body || body.length < 5 || bodyType(body) !== 0x00b4) return null;
    const k = (body[4] << 24) >> 24;
    if (k < 0 || k > 128 || body.length !== 5 + 2 * k) return null;
    const perks = [];
    for (let i = 0; i < k; i += 1) perks.push(body[5 + 2 * i]);
    return perks;
  }

  function parseSelfMove(body) {
    try {
      if (bodyType(body) !== 0x0023 || body.length < 44) return null;
      return [
        decodeCoord(u32(body, 20), u32(body, 24)),
        decodeCoord(u32(body, 28), u32(body, 32)),
        decodeCoord(u32(body, 36), u32(body, 40))
      ];
    } catch (_) {
      return null;
    }
  }

  function parseMove(body) {
    try {
      if (bodyType(body) !== 0x0006 || body.length < 26) return null;
      return [
        decodeCoord(u32(body, 2), u32(body, 6)),
        decodeCoord(u32(body, 10), u32(body, 14)),
        decodeCoord(u32(body, 18), u32(body, 22))
      ];
    } catch (_) {
      return null;
    }
  }

  function parseBlockChange(body) {
    try {
      if (bodyType(body) !== 0x000b) return null;
      if (body.length === 20 && body[18] === 0 && body[19] === 0) {
        return { coord: [u32(body, 6), u32(body, 10), u32(body, 14)], occupied: false };
      }
      if (body.length >= 36 && body.length < 60) {
        const coord = [u32(body, 6), u32(body, 10), u32(body, 14)];
        if (Math.max(...coord) > 0xffff) return null;
        return { coord, occupied: true, kindLowByte: body[18] };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function summarizeTargets(grid, objects, targetIds) {
    const targets = targetIds instanceof Set ? targetIds : new Set(targetIds || []);
    const placed = grid ? grid.blocks.filter(block => targets.has(block.id)) : [];
    const stored = [];
    for (const object of objects || []) {
      if (object.source === 0x000f && object.kind === 1 && targets.has(object.typeId)) {
        stored.push({ x: object.bx, y: object.by, z: object.bz, id: object.typeId });
      }
    }
    placed.sort((a, b) => a.id - b.id || a.x - b.x || a.y - b.y || a.z - b.z);
    stored.sort((a, b) => a.id - b.id || a.x - b.x || a.y - b.y || a.z - b.z);
    return { placed, stored, total: placed.length + stored.length };
  }

  class SessionDecoder {
    constructor() {
      // guid -> name from player states; kept across realms so a chat line
      // from someone seen earlier still has a name
      this.names = new Map();
      this.reset();
    }

    noteName(guid, name) {
      if (!guid || !name) return;
      this.names.delete(guid);
      this.names.set(guid, name);
      if (this.names.size > 2000) this.names.delete(this.names.keys().next().value);
    }

    reset() {
      this.loginResponse = null;
      this.key = null;
      this.keyTries = 0;
      this.ownGuid = null;
      this.realmGuid = null;
      this.realmId = null;
      this.outerKey = null;
      this.realm = null;
      this.owner = null;
      this.coords = null;
      this.grid = null;
      this.occupied = new Set();
      this.objects = new Map();
      this.outboundStats = { seen: 0, decoded: 0, failed: 0, blockActions: 0 };
    }

    decodesWithKey(frame) {
      try {
        return decryptFrame(frame, this.key).hadTerminator;
      } catch (_) {
        return false;
      }
    }

    ingest(frame) {
      frame = asU8(frame);
      const events = [];
      // A login response is plaintext 0x0002 carrying our guid + the realm guid. Once a key
      // is live, an encrypted frame that happens to start 02 00 must not wipe the session.
      const rawLogin = bodyType(frame) === 0x0002 && frame.length > 60 &&
        !(this.key && this.decodesWithKey(frame));
      const guids = rawLogin ? guidsFromResponse(frame) : null;
      if (guids && guids.own && guids.realm) {
        this.reset();
        this.loginResponse = frame.slice();
        this.ownGuid = guids.own;
        this.realmGuid = guids.realm;
        this.realmId = guids.realmId;
        events.push({ type: "join", realmGuid: this.realmGuid, realmId: this.realmId });
        return events;
      }
      if (!this.key) {
        if (!this.loginResponse) return events;
        this.key = recoverKey(this.loginResponse, frame);
        if (!this.key) {
          this.keyTries += 1;
          if (this.keyTries >= 8) {
            this.loginResponse = null;
            events.push({ type: "join_failed" });
          }
          return events;
        }
        events.push({ type: "key" });
      }
      let decoded;
      try {
        decoded = decryptFrame(frame, this.key);
      } catch (_) {
        return events;
      }
      if (!decoded.hadTerminator) return events;
      const type = bodyType(decoded.body);
      if (type === 0x005f) {
        const identity = parseRealmId(decoded.body);
        if (identity && identity.realm) {
          this.realm = identity.realm;
          this.owner = identity.owner;
          events.push({ type: "realm", ...identity });
        }
      } else if (type === 0x0004) {
        const outerKey = parseOuterKey(decoded.body);
        if (outerKey) this.outerKey = outerKey;
        const grid = parseRealmGrid(decoded.plain);
        if (grid) {
          this.grid = grid;
          this.occupied = new Set(grid.blocks.map(block => `${block.x},${block.y},${block.z}`));
          this.objects.clear();
          events.push({ type: "grid", grid });
        }
      } else if (type === 0x000b) {
        const change = parseBlockChange(decoded.body);
        if (change) {
          const key = change.coord.join(",");
          if (change.occupied) this.occupied.add(key);
          else this.occupied.delete(key);
          events.push({ type: "block_change", ...change });
        }
      } else if (type === 0x000f || type === 0x0021) {
        const fresh = parseWorldObjects(decoded.body);
        for (const object of fresh) this.objects.set(object.guid, object);
        if (fresh.length) events.push({ type: "objects", count: fresh.length });
      } else if (type === 0x0005) {
        const player = parsePlayerState(decoded.body);
        if (player && player.name && !player.notPlayer) this.noteName(player.guid, player.name);
        if (player && player.guid === this.ownGuid) {
          this.coords = player.coords;
          events.push({ type: "coords", coords: player.coords });
          if (player.appearOffline != null) {
            events.push({ type: "self_flags", appearOffline: player.appearOffline });
          }
          const profile = parsePlayerProfile(decoded.body);
          if (profile) events.push({ type: "self_profile", ...profile });
        } else if (player && player.name) {
          events.push({ type: "player_seen", guid: player.guid, name: player.name,
                        notPlayer: player.notPlayer });
        }
      } else if (type === 0x00b1) {
        const xp = parseXp(decoded.body);
        if (xp) events.push({ type: "xp", ...xp });
      } else if (type === 0x0011 || type === 0x00e8) {
        const wallet = parseWallet(decoded.body);
        if (wallet) events.push({ type: "wallet", ...wallet });
      } else if (type === 0x00b4) {
        const perks = parsePerks(decoded.body);
        if (perks) events.push({ type: "perks", perks });
      } else if (type === 0x008c && decoded.body.length >= 8) {
        // the realm's style tags (Cubic.exe 0x5cf656): u16 + i32 mask + bool
        events.push({ type: "realm_tags", tags: u32(decoded.body, 4) });
      } else if (type === 0x00ba) {
        const menu = parseWhisperMenu(decoded.body);
        if (menu) events.push({ type: "whisper_menu", ...menu });
      } else if (type === 0x0069) {
        const trusted = parseTrustedList(decoded.body);
        if (trusted) events.push({ type: "trusted_list", trusted });
      } else if (type === 0x006c) {
        const banned = parseBannedList(decoded.body);
        if (banned) events.push({ type: "banned_list", banned });
      } else if (type === 0x0003 && decoded.body.length >= 20) {
        events.push({ type: "player_left", guid: bytesToHex(decoded.body.subarray(4, 20)) });
      } else if (type === 0x0027) {
        const list = parseFriendsList(decoded.body);
        if (list) events.push({ type: "friends", ...list });
      } else if (type === 0x0088) {
        const guids = parseOnlineFriends(decoded.body);
        if (guids) events.push({ type: "online_friends", guids });
      } else if (type === 0x000d) {
        const text = parseServerText(decoded.body);
        if (text) events.push({ type: "server_text", text, body: decoded.body });
        else {
          const notice = parseNoticeLine(decoded.body);
          if (notice) events.push({ type: "chat", notice: true, ...notice, body: decoded.body });
        }
      } else if (type === 0x000c) {
        const line = parseChatLine(decoded.body);
        if (line) {
          events.push({ type: "chat", ...line, name: this.names.get(line.guid) || null,
                        own: line.guid === this.ownGuid });
        }
      } else if (type === 0x0023) {
        const coords = parseSelfMove(decoded.body);
        if (coords) {
          this.coords = coords;
          events.push({ type: "coords", coords });
        }
      } else if (type === 0x00e1) {
        const results = parseRealmSearch(decoded.body);
        events.push({ type: "realm_search_results", results });
        const panel = parsePanel(decoded.body);       // e.g. the Farmer's crop window
        if (panel) events.push({ type: "panel", ...panel });
      } else if (type === 0x00fe) {
        const dialog = parseNpcDialog(decoded.body);
        if (dialog) events.push({ type: "npc_dialog", ...dialog });
      } else if (type === 0x00ca) {
        const dialog = parseDialog(decoded.body);
        if (dialog) events.push({ type: "dialog", ...dialog });
      } else if (type === 0x0036) {
        // 0x0036 is shared by trades ('Trade Pending') and wrong-password, but it
        // is ALSO the plot-bumper 'occupied' notice. Surface it; consumers key on
        // the text (classifyRentDialog) and ignore it otherwise.
        const notice = parseNotice0036(decoded.body);
        if (notice) events.push({ type: "notice", ...notice });
      }
      return events;
    }

    ingestOutbound(frame) {
      frame = asU8(frame);
      if (!this.key) return [];
      const stats = this.outboundStats;
      stats.seen += 1;
      try {
        let inner = frame;
        let counter = null;
        if (this.outerKey && this.outerKey.length) {
          const outer = outerDecode(frame, this.outerKey);
          inner = outer.inner;
          counter = outer.counter;
        }
        const decoded = decryptFrame(inner, this.key);
        if (!decoded.hadTerminator) {
          stats.failed += 1;
          return [];
        }
        stats.decoded += 1;
        const type = bodyType(decoded.body);
        const events = [];
        const coords = parseMove(decoded.body);
        if (coords) {
          this.coords = coords;
          events.push({ type: "coords", coords, outbound: true });
        } else if (type === 0x0014 && decoded.body.length >= 14) {
          events.push({ type: "block_query", coord: [
            u32(decoded.body, 2), u32(decoded.body, 6), u32(decoded.body, 10)
          ] });
        } else if (type === 0x000a && decoded.body.length === 14) {
          events.push({
            type: "block_action",
            action: "break",
            coord: [u32(decoded.body, 2), u32(decoded.body, 6), u32(decoded.body, 10)],
            body: decoded.body.slice()
          });
        } else if (type === 0x000b && decoded.body.length === 52 && u16(decoded.body, 34) === 1) {
          events.push({
            type: "block_action",
            action: "build",
            coord: [u32(decoded.body, 36), u32(decoded.body, 40), u32(decoded.body, 44)],
            body: decoded.body.slice()
          });
        } else if (type === 0x0031 && decoded.body.length === 3) {
          // the chat box: 01 when it opens, 00 when it closes or sends
          // (captured: open … 0x000c text, then 00 straight after)
          events.push({ type: "chat_typing", on: decoded.body[2] === 1 });
        } else if (type === 0x000c && decoded.body.length >= 6) {
          // a chat line the player sent from the game's own chat box
          let text = null;
          try { text = readString(decoded.body, 2).value; } catch (_) { /* not a chat line */ }
          if (text) events.push({ type: "chat_sent", text });
        } else if (type === 0x00d7) {
          // the GAME bumped a block itself (the plot keeper backs off)
          events.push({ type: "bump_hit", outbound: true });
        } else if ((type === 0x0027 || type === 0x0088) && decoded.body.length === 2) {
          // the game's own FRIEND LIST opening asks for both at once
          events.push({ type: type === 0x0027 ? "tx_friends_refresh" : "tx_online_refresh" });
        } else if (type === 0x00ca && decoded.body.length >= 19) {
          events.push({
            type: "dialog_answer",
            guid: bytesToHex(decoded.body.subarray(2, 18)),
            confirm: decoded.body[18] === 1
          });
        }
        if (events.some(event => event.type === "block_action")) stats.blockActions += 1;
        if (counter != null) events.push({ type: "outbound_counter", counter });
        return events;
      } catch (_) {
        stats.failed += 1;
        // Some clients add a second per-connection cipher outside XXTEA. In
        // that case the frame is simply not readable here and is left alone.
        return [];
      }
    }

    targetReport(targetIds) {
      return summarizeTargets(this.grid, Array.from(this.objects.values()), targetIds);
    }
  }

  return {
    COORD_BASE,
    TERMINATOR,
    SessionDecoder,
    asU8,
    bodyType,
    SWIRLS,
    buildAppearOffline,
    buildBlockBreak,
    buildChat,
    buildChatSend,
    buildChatToggle,
    buildPerkPick,
    buildPerkSwitch,
    buildStoreBuyItem,
    buildStoreBuyPack,
    buildStoreBuyRecube,
    parseWallet,
    buildSwirl,
    entityFlag,
    parsePerks,
    parsePlayerProfile,
    parseXp,
    buildFriendRequest,
    buildRefreshFriends,
    buildRefreshOnline,
    buildTeleport,
    buildRealmBan,
    buildRealmUnban,
    buildBannedListRequest,
    buildTrustedListRequest,
    buildRealmTrust,
    buildWhisperOpen,
    extendServerText,
    buildWhisperSelect,
    parseWhisperMenu,
    buildNpcTalk,
    buildNpcChoice,
    parseNpcDialog,
    parsePanel,
    isCropOffer,
    yesOption,
    CROP_PANEL_TITLE,
    buildRealmUntrust,
    parseTrustedList,
    buildRealmTags,
    parseBannedList,
    buildUnfriend,
    parseFriendsList,
    parseOnlineFriends,
    parseServerText,
    buildBumpPos,
    buildBumpHit,
    buildSelfMove,
    buildDialogResponse,
    classifyRentDialog,
    createPlotKeeper,
    encCoord,
    parseNotice0036,
    buildJoinRealm,
    buildOpenRealmBrowser,
    buildRealmSearch,
    decryptBytes,
    decryptFrame,
    decryptWords,
    encryptBytes,
    encryptFrame,
    encryptWords,
    guidsFromResponse,
    shareLink,
    cleanChatLine,
    chatSegments,
    parseChatLine,
    parseNoticeLine,
    lzfDecompress,
    outerDecode,
    outerEncode,
    patchPlaceBody,
    parseDialog,
    parseBlockChange,
    parsePlayerState,
    parseMove,
    parseRealmGrid,
    parseRealmId,
    parseRealmSearch,
    parseOuterKey,
    parseSelfMove,
    parseVendingOffer,
    parseWorldObjects,
    readString,
    recoverKey,
    summarizeTargets,
    u16,
    u32
  };
});
