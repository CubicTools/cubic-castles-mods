/*
 * Intercept the Web client's native Friends, Profile, Cubit Store and Perks
 * windows before they're built.
 *
 * This mirrors the desktop mod's Cubic.exe hook: the game's menu action is
 * allowed to reach its normal dispatcher. A checked trampoline changes only
 * the Friends / Profile action to one of that dispatcher's existing no-op
 * actions before the native dialog allocation can run, then calls the
 * untouched dispatcher. If the custom feature is disabled or is not ready, the
 * action is left alone.
 *
 * It also wraps the realm skin setup so Foggy realms draw without fog (the
 * popup's "No fog" chip), like cubic-mods.exe.
 *
 * The table slot and SHA-256 below belong to castles.cc index.wasm nocache=197.
 * A different game build is never patched.  The socket-pair fallback in
 * cc-browser-friends.js remains available when the fingerprint changes.
 */
(function installWasmFriends(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document && root.WebAssembly) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function makeWasmFriendsHook() {
  "use strict";

  const GAME_WASM_BYTES = 5982697;
  const GAME_WASM_SHA256 = "10148c06512ab85c0da0a7eeaf0e37d787e44f8c633e6d430cb291e50bdc3879";
  const DISPATCH_TABLE_SLOT = 2148;
  const ACTIVE_MENU_POINTER_ADDRESS = 313256;
  const MENU_ACTION_OFFSET = 112;
  const FRIENDS_ACTION_VALUE = 2;
  // The Escape menu's Profile button: switch index 15 (stored value 16) in
  // Cubic.exe's copy of this same dispatcher (its Friends = 2 and no-op = 5
  // match this build's).
  const PROFILE_ACTION_VALUE = 16;
  // The Cubit Store button: switch index 3 (stored value 4) in Cubic.exe.
  const STORE_ACTION_VALUE = 4;
  // The Perks button: switch index 18 (stored value 19) in Cubic.exe (it
  // builds the perk grid from "grid_clipped.perks").
  const PERKS_ACTION_VALUE = 19;
  // Switch index 4 (stored value 5) goes to the dispatcher's verified default
  // exit, just as the EXE hook redirects Friends to a do-nothing switch case.
  const NOOP_ACTION_VALUE = 5;

  // No fog. Realm skins Foggy (3) and Bottomless Foggy (6) are set up by the
  // World's ApplySkin (index.wasm fn 2584 = Cubic.exe 0x5da841): view
  // distance 30 instead of 80, a grey haze and the grainy imagesog layer.
  // While it runs we show it the twin without fog (3 -> 0, 6 -> 2) and put
  // the real byte back after, so nothing else sees a different skin
  // (Bottomless stays bottomless). Same as cubic-mods.exe's no fog.
  const APPLY_SKIN_TABLE_SLOT = 2169;
  const WORLD_POINTER_ADDRESS = 313704;
  const WORLD_SKIN_OFFSET = 21964;
  const FOG_TWIN = { 3: 0, 6: 2 };

  // (module (type (func (param i32 i32)))
  //   (import "e" "f" (func (type 0))) (export "f" (func 0)))
  // Exporting the imported JS callback gives us a genuine WebAssembly function
  // with the same (i32) -> void signature required by the game's funcref table.
  const CALLBACK_MODULE_2 = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x06, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x00,
    0x02, 0x07, 0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00,
    0x07, 0x05, 0x01, 0x01, 0x66, 0x00, 0x00,
  ]);
  // the same with one i32 param: (i32) -> void, for ApplySkin(world)
  const CALLBACK_MODULE_1 = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x01, 0x7f, 0x00,
    0x02, 0x07, 0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00,
    0x07, 0x05, 0x01, 0x01, 0x66, 0x00, 0x00,
  ]);

  function typedCallback(WebAssemblyApi, callback, params = 2) {
    const module = new WebAssemblyApi.Module(params === 1 ? CALLBACK_MODULE_1 : CALLBACK_MODULE_2);
    return new WebAssemblyApi.Instance(module, { e: { f: callback } }).exports.f;
  }

  function hex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function fingerprint(buffer, cryptoApi) {
    if (!buffer || buffer.byteLength !== GAME_WASM_BYTES || !cryptoApi || !cryptoApi.subtle) return false;
    const digest = await cryptoApi.subtle.digest("SHA-256", buffer);
    return hex(new Uint8Array(digest)) === GAME_WASM_SHA256;
  }

  function replaceFriendsEntry(root, instance, slot = DISPATCH_TABLE_SLOT) {
    const table = instance && instance.exports && instance.exports.__indirect_function_table;
    const memory = instance && instance.exports && instance.exports.memory;
    if (!table || typeof table.get !== "function" || typeof table.set !== "function" || table.length <= slot) {
      return { patched: false, reason: "the game function table is unavailable" };
    }
    if (!memory || !memory.buffer) return { patched: false, reason: "the game memory is unavailable" };
    const original = table.get(slot);
    if (typeof original !== "function") {
      return { patched: false, reason: "the menu dispatcher is unavailable" };
    }
    let hits = 0;
    const replacement = typedCallback(root.WebAssembly, function menuDispatcher(context, menu) {
      try {
        const view = new DataView(memory.buffer);
        const validMenu = menu > 0 && menu + MENU_ACTION_OFFSET + 4 <= view.byteLength;
        const activeMenu = ACTIVE_MENU_POINTER_ADDRESS + 4 <= view.byteLength ?
          view.getUint32(ACTIVE_MENU_POINTER_ADDRESS, true) : 0;
        const action = validMenu && activeMenu === (menu >>> 0) ?
          view.getUint32(menu + MENU_ACTION_OFFSET, true) : 0;
        const custom = action === FRIENDS_ACTION_VALUE ? root.CCFriends :
          action === PROFILE_ACTION_VALUE ? root.CCProfile :
          action === STORE_ACTION_VALUE ? root.CCStore :
          action === PERKS_ACTION_VALUE ? root.CCPerks : null;
        if (custom && typeof custom.interceptNativeAction === "function") {
          // Redirect first. If custom UI declines or throws, restore the
          // action so the normal game window remains a reliable fallback.
          view.setUint32(menu + MENU_ACTION_OFFSET, NOOP_ACTION_VALUE, true);
          let handled = false;
          try {
            handled = custom.interceptNativeAction() === true;
          } finally {
            if (!handled) view.setUint32(menu + MENU_ACTION_OFFSET, action, true);
          }
          if (handled) hits += 1;
        }
      } catch (error) {
        console.warn("[CC Browser Mods] custom menu interception failed; using the game window", error);
      }
      original(context, menu);
    });
    table.set(slot, replacement);
    // the game's memory, for cc-browser-menu.js (it reads the open Escape menu)
    root.CCWasmMemory = memory;
    return { patched: true, slot, original, replacement, hits: () => hits };
  }

  // fog.on = remove fog; returns {patched, reapply(world)} like the Friends patch
  function replaceApplySkin(root, instance, fog, slot = APPLY_SKIN_TABLE_SLOT) {
    const table = instance && instance.exports && instance.exports.__indirect_function_table;
    const memory = instance && instance.exports && instance.exports.memory;
    if (!table || typeof table.get !== "function" || table.length <= slot || !memory) {
      return { patched: false, reason: "the game function table is unavailable" };
    }
    const original = table.get(slot);
    if (typeof original !== "function") return { patched: false, reason: "the realm skin setup is unavailable" };
    const replacement = typedCallback(root.WebAssembly, function applySkin(world) {
      let at = -1, real = -1;
      try {
        const bytes = new Uint8Array(memory.buffer);
        at = (world >>> 0) + WORLD_SKIN_OFFSET;
        if (fog.on && world && at < bytes.length && FOG_TWIN[bytes[at]] !== undefined) {
          real = bytes[at];
          bytes[at] = FOG_TWIN[real];
          fog.swaps += 1;
        }
      } catch (_) { real = -1; }
      try {
        original(world);
      } finally {
        if (real >= 0) new Uint8Array(memory.buffer)[at] = real;
      }
    }, 1);
    table.set(slot, replacement);
    // re-run the current realm's setup so a toggle shows at once (Foggy skins
    // only: their setup just sets colours and distances, nothing piles up)
    function reapply() {
      const view = new DataView(memory.buffer);
      const world = view.getUint32(WORLD_POINTER_ADDRESS, true);
      if (!world || world + WORLD_SKIN_OFFSET >= view.byteLength) return false;
      if (FOG_TWIN[view.getUint8(world + WORLD_SKIN_OFFSET)] === undefined) return false;
      replacement(world);
      fog.reapplied += 1;
      return true;
    }
    return { patched: true, slot, original, replacement, reapply };
  }

  function install(root) {
    if (root.__ccWasmFriendsHookInstalled) return root.CCWasmFriendsHook;
    root.__ccWasmFriendsHookInstalled = true;
    const Wasm = root.WebAssembly;
    const nativeInstantiate = Wasm.instantiate.bind(Wasm);
    const nativeStreaming = typeof Wasm.instantiateStreaming === "function" ?
      Wasm.instantiateStreaming.bind(Wasm) : null;
    const patchedInstances = new WeakSet();
    const state = { installed: true, checked: 0, matched: 0, patched: false, slot: null, error: null };
    // popup "No fog" (cc-browser-mod.js calls setNoFog with the saved choice)
    const fog = { on: false, patched: false, swaps: 0, reapplied: 0, error: null, reapply: null };

    async function inspect(result, buffer) {
      const instance = result && result.instance ? result.instance : result;
      if (!instance || patchedInstances.has(instance)) return result;
      if (!buffer || buffer.byteLength !== GAME_WASM_BYTES) return result;
      patchedInstances.add(instance);
      state.checked += 1;
      try {
        if (!(await fingerprint(buffer, root.crypto))) {
          state.error = "game build changed; native Friends fallback active";
          console.warn("[CC Browser Mods] Friends pre-dialog hook skipped: game WebAssembly fingerprint changed");
          return result;
        }
        state.matched += 1;
        try {
          const skin = replaceApplySkin(root, instance, fog);
          fog.patched = skin.patched;
          fog.reapply = skin.patched ? skin.reapply : null;
          fog.error = skin.patched ? null : skin.reason;
        } catch (error) {
          fog.error = String(error && error.message || error);
        }
        const outcome = replaceFriendsEntry(root, instance);
        state.patched = outcome.patched;
        state.slot = outcome.patched ? outcome.slot : null;
        state.error = outcome.patched ? null : outcome.reason;
        if (outcome.patched) {
          console.info(`[CC Browser Mods] Friends menu action intercepted before dialog creation at table slot ${outcome.slot}`);
        } else {
          console.warn(`[CC Browser Mods] Friends pre-dialog hook skipped: ${outcome.reason}`);
        }
      } catch (error) {
        state.error = String(error && error.message || error);
        console.warn("[CC Browser Mods] Friends pre-dialog hook failed; native fallback active", error);
      }
      return result;
    }

    function snapshot(source) {
      if (source instanceof ArrayBuffer) return source.slice(0);
      if (ArrayBuffer.isView(source)) {
        return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      }
      return null;
    }

    Wasm.instantiate = function hookedInstantiate(source, imports) {
      const buffer = snapshot(source);
      const result = nativeInstantiate(source, imports);
      return buffer ? Promise.resolve(result).then(value => inspect(value, buffer)) : result;
    };

    if (nativeStreaming) {
      Wasm.instantiateStreaming = function hookedInstantiateStreaming(source, imports) {
        return Promise.resolve(source).then(response => {
          let copy;
          try {
            copy = response.clone().arrayBuffer();
          } catch (error) {
            return nativeStreaming(response, imports);
          }
          return Promise.all([nativeStreaming(response, imports), copy])
            .then(([result, buffer]) => inspect(result, buffer));
        });
      };
    }

    root.CCWasmFriendsHook = {
      status: () => ({ ...state }),
      fogStatus: () => ({ on: fog.on, patched: fog.patched, swaps: fog.swaps,
        reapplied: fog.reapplied, error: fog.error }),
      setNoFog(on) {
        on = !!on;
        if (fog.on === on) return;
        fog.on = on;
        if (!fog.reapply) return;
        try {
          fog.reapply();
        } catch (error) {
          fog.error = String(error && error.message || error);
          console.warn("[CC Browser Mods] fog toggle will show after the next realm join", error);
        }
      },
      // the Escape menu on screen (a RadialMenu in the game's memory), or 0
      activeMenu() {
        const memory = root.CCWasmMemory;
        if (!state.patched || !memory) return 0;
        const view = new DataView(memory.buffer);
        return ACTIVE_MENU_POINTER_ADDRESS + 4 <= view.byteLength ? view.getUint32(ACTIVE_MENU_POINTER_ADDRESS, true) : 0;
      },
    };
    return root.CCWasmFriendsHook;
  }

  return {
    GAME_WASM_BYTES,
    GAME_WASM_SHA256,
    DISPATCH_TABLE_SLOT,
    ACTIVE_MENU_POINTER_ADDRESS,
    MENU_ACTION_OFFSET,
    FRIENDS_ACTION_VALUE,
    PROFILE_ACTION_VALUE,
    STORE_ACTION_VALUE,
    PERKS_ACTION_VALUE,
    NOOP_ACTION_VALUE,
    APPLY_SKIN_TABLE_SLOT,
    WORLD_POINTER_ADDRESS,
    WORLD_SKIN_OFFSET,
    FOG_TWIN,
    typedCallback,
    replaceApplySkin,
    fingerprint,
    replaceFriendsEntry,
    install,
  };
});
