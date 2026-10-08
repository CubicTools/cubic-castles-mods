/* Performance helpers for the Cubic Castles WebGL client.
 *
 * - Asks the browser for the high-performance GPU when the game creates its
 *   WebGL context (matters on laptops with integrated + dedicated graphics).
 * - Measures the game's real frames through Emscripten's official
 *   Module.preMainLoop/postMainLoop hooks (not just browser repaints).
 * - Optional vsync frame pacing: if the game drives its loop with setTimeout
 *   (jittery, not aligned to the display), switch it to requestAnimationFrame
 *   at the SAME frame rate. It only engages when the display refresh is a clean
 *   multiple of the game's cap and the game is already hitting that cap, so game
 *   speed never changes, and it reverts itself if frames get worse.
 */
(function installPerfCore(root, factory) {
  const api = factory();
  root.CCBrowserPerf = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makePerfCore() {
  "use strict";

  const CONFIG_KEY = "cc-browser-mods-config-v1";
  const PACING_TOLERANCE = 0.05;
  const FRAME_RING = 1024;
  const STATS_WINDOW_MS = 5000;

  function percentile(sorted, fraction) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
    return sorted[index];
  }

  // Refresh rate from requestAnimationFrame deltas. The fast end of the
  // distribution is used so a busy main thread (long frames) can't make a
  // 60 Hz display look like 30 Hz.
  function refreshFromDeltas(deltas) {
    const clean = deltas.filter(value => Number.isFinite(value) && value > 2 && value < 100)
      .sort((a, b) => a - b);
    if (clean.length < 30) return null;
    const fast = percentile(clean, 0.2);
    return fast ? 1000 / fast : null;
  }

  function isUncapped(loop) {
    return !!loop && (loop.timingMode === 2 || (loop.timingMode === 0 && !(loop.timingValue > 0)));
  }

  // FPS the game's own uncapped loop can reach for a given frame time. The
  // browser forces >= 4 ms between nested setTimeout(0) calls; the
  // setImmediate (postMessage) mode has no such gap.
  function uncappedOriginalFps(loop, workMs) {
    if (workMs == null) return null;
    return loop && loop.timingMode === 2 ? 1000 / (workMs + 0.3) : Math.min(250, 1000 / (workMs + 4));
  }

  // For an uncapped loop, pick vsync (smooth, cooler) when it's within 10% of
  // running frames back-to-back; otherwise run back-to-back without timer gaps.
  // workMs is the typical frame; slowMs a slow-ish frame (vsync must fit those).
  function uncappedChoice(refreshHz, workMs, slowMs) {
    const frameMs = 1000 / refreshHz;
    const fit = Math.max(workMs, slowMs == null ? workMs : slowMs);
    const vsyncFps = refreshHz / Math.max(1, Math.ceil((fit + 0.5) / frameMs));
    const freeFps = Math.min(refreshHz, 1000 / (workMs + 0.3));
    return vsyncFps >= freeFps * 0.9 ?
      { kind: "vsync", mode: 1, value: 1, predictedFps: vsyncFps } :
      { kind: "immediate", mode: 2, value: 0, predictedFps: freeFps };
  }

  // Decide what (if anything) to change about the loop the game set up.
  function pacingPlan(refreshHz, loop, baselineFps, workMs, slowMs) {
    if (!loop || !loop.func) return { action: "keep", reason: "game loop not started yet" };
    if (loop.timingMode === 1) {
      return { action: "keep", native: true,
        reason: "the game already paces frames to the display (vsync)" };
    }
    if (isUncapped(loop)) {
      // Uncapped means the game already runs on real time (its speed can't
      // depend on frame rate), so rescheduling frames is safe.
      if (!refreshHz) return { action: "keep", reason: "measuring the display refresh rate…" };
      if (workMs == null) return { action: "keep", reason: "measuring the game's frame time…" };
      const choice = uncappedChoice(refreshHz, workMs, slowMs);
      if (choice.kind === "immediate" && loop.timingMode === 2) {
        return { action: "keep", reason: "the game already runs frames back-to-back with no timer gaps" };
      }
      return { action: choice.kind, ...choice, uncapped: true };
    }
    if (loop.timingMode !== 0) {
      return { action: "keep", reason: `unusual game loop mode ${loop.timingMode}; left alone` };
    }
    const targetFps = 1000 / loop.timingValue;
    if (!refreshHz) return { action: "keep", targetFps, reason: "measuring the display refresh rate…" };
    const interval = Math.max(1, Math.round(refreshHz / targetFps));
    const pacedFps = refreshHz / interval;
    if (Math.abs(pacedFps - targetFps) / targetFps > PACING_TOLERANCE) {
      return { action: "keep", targetFps, reason:
        `display ${Math.round(refreshHz)} Hz isn't a multiple of the game's ${Math.round(targetFps)} FPS cap, so pacing is off (game speed must not change)` };
    }
    if (baselineFps == null) return { action: "keep", targetFps, reason: "measuring the game's frame rate…" };
    if (baselineFps < targetFps * 0.9) {
      return { action: "keep", targetFps, reason:
        `the game runs below its ${Math.round(targetFps)} FPS cap (${Math.round(baselineFps)} FPS), so vsync pacing would lower FPS` };
    }
    return { action: "vsync", kind: "capped-vsync", mode: 1, value: interval, targetFps, interval, pacedFps };
  }

  // Summarise frame start times (ms, ascending) and per-frame work times.
  function frameStats(starts, works) {
    if (!starts || starts.length < 3) return null;
    const intervals = [];
    for (let index = 1; index < starts.length; index += 1) intervals.push(starts[index] - starts[index - 1]);
    const sorted = intervals.slice().sort((a, b) => a - b);
    const span = starts[starts.length - 1] - starts[0];
    const median = percentile(sorted, 0.5);
    // "1% low" = average of the slowest 1% of frames (at least one frame).
    const worstCount = Math.max(1, Math.ceil(sorted.length * 0.01));
    const worst = sorted.slice(sorted.length - worstCount);
    const slow = worst.reduce((sum, value) => sum + value, 0) / worst.length;
    const hitchAt = Math.max(50, median * 2.5);
    const workSorted = (works || []).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      fps: span > 0 ? (starts.length - 1) * 1000 / span : null,
      low1: slow > 0 ? 1000 / slow : null,
      medianMs: median,
      worstMs: sorted[sorted.length - 1],
      hitches: intervals.filter(value => value > hitchAt).length,
      workMs: percentile(workSorted, 0.5),
      workP90: percentile(workSorted, 0.9),
      samples: intervals.length
    };
  }

  function readStoredConfig(root) {
    try {
      const raw = root.localStorage && root.localStorage.getItem(CONFIG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function createController(root) {
    const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
    const stored = readStoredConfig(root);
    const state = {
      gpuHighPerformance: stored.gpuHighPerformance !== false,
      framePacing: stored.framePacing !== false,
      gpuRequested: false,
      contextType: null,
      renderer: null,
      canvas: null,
      hooksAttached: false,
      frameStarts: new Float64Array(FRAME_RING),
      frameWorks: new Float64Array(FRAME_RING),
      frameIndex: 0,
      frameCount: 0,
      lastPre: 0,
      rafDeltas: [],
      refreshHz: null,
      measuringUntil: 0,
      lastMeasure: 0,
      original: null,
      pacingActive: false,
      pacingInterval: 0,
      pacingReason: "waiting for the game",
      pacingBlocked: false,
      baselineFps: null,
      slowStrikes: 0,
      switchVotes: 0,
      vsyncBad: false,
      applied: null,
      timer: null
    };

    function wrapGetContext() {
      const Canvas = root.HTMLCanvasElement;
      if (!Canvas || !Canvas.prototype || Canvas.prototype.getContext.__ccPerfWrapped) return false;
      const native = Canvas.prototype.getContext;
      const getContext = function getContext(type, attributes) {
        const kind = String(type || "").toLowerCase();
        if (state.gpuHighPerformance && (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl")) {
          const attrs = attributes && typeof attributes === "object" ? { ...attributes } : {};
          if (!attrs.powerPreference || attrs.powerPreference === "default") {
            attrs.powerPreference = "high-performance";
            state.gpuRequested = true;
          }
          const context = native.call(this, type, attrs);
          if (context) noteContext(this, kind, context);
          return context;
        }
        return native.apply(this, arguments);
      };
      Object.defineProperty(getContext, "__ccPerfWrapped", { value: true });
      Canvas.prototype.getContext = getContext;
      return true;
    }

    function noteContext(canvas, kind, context) {
      if (state.contextType) return;
      state.contextType = kind;
      state.canvas = canvas;
      try {
        const debug = context.getExtension && context.getExtension("WEBGL_debug_renderer_info");
        state.renderer = String(debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) :
          context.getParameter(context.RENDERER) || "");
      } catch (_) {
        state.renderer = null;
      }
    }

    function mainLoop() {
      return root.Browser && root.Browser.mainLoop || null;
    }

    function attachFrameHooks() {
      const Module = root.Module;
      if (state.hooksAttached || !Module || typeof Module !== "object") return;
      const previousPre = Module.preMainLoop;
      const previousPost = Module.postMainLoop;
      Module.preMainLoop = function ccPerfPreMainLoop() {
        const at = now();
        state.lastPre = at;
        state.frameStarts[state.frameIndex] = at;
        state.frameWorks[state.frameIndex] = NaN;
        return typeof previousPre === "function" ? previousPre.apply(this, arguments) : undefined;
      };
      Module.postMainLoop = function ccPerfPostMainLoop() {
        state.frameWorks[state.frameIndex] = now() - state.lastPre;
        state.frameIndex = (state.frameIndex + 1) % FRAME_RING;
        state.frameCount += 1;
        if (typeof previousPost === "function") return previousPost.apply(this, arguments);
        return undefined;
      };
      state.hooksAttached = true;
    }

    function recentFrames(windowMs = STATS_WINDOW_MS) {
      const total = Math.min(state.frameCount, FRAME_RING);
      const starts = [];
      const works = [];
      const cutoff = now() - windowMs;
      for (let back = total; back >= 1; back -= 1) {
        const index = (state.frameIndex - back + FRAME_RING * 2) % FRAME_RING;
        const at = state.frameStarts[index];
        if (at < cutoff) continue;
        starts.push(at);
        works.push(state.frameWorks[index]);
      }
      return { starts, works };
    }

    function stats(windowMs) {
      const frames = recentFrames(windowMs);
      return frameStats(frames.starts, frames.works);
    }

    function measureRefresh() {
      if (typeof root.requestAnimationFrame !== "function") return;
      state.rafDeltas = [];
      state.lastMeasure = now();
      state.measuringUntil = state.lastMeasure + 2000;
      let previous = null;
      const step = at => {
        if (previous != null) state.rafDeltas.push(at - previous);
        previous = at;
        if (at < state.measuringUntil) root.requestAnimationFrame(step);
        else {
          const hz = refreshFromDeltas(state.rafDeltas);
          if (hz) state.refreshHz = hz;
        }
      };
      root.requestAnimationFrame(step);
    }

    function setTiming(mode, value) {
      const setter = root._emscripten_set_main_loop_timing;
      if (typeof setter !== "function") return false;
      try {
        setter(mode, value);
        return true;
      } catch (_) {
        return false;
      }
    }

    function restoreTiming(reason) {
      if (state.pacingActive && state.original) setTiming(state.original.mode, state.original.value);
      state.pacingActive = false;
      state.pacingInterval = 0;
      state.applied = null;
      state.slowStrikes = 0;
      state.switchVotes = 0;
      if (reason) state.pacingReason = reason;
    }

    function hidden() {
      return !!(root.document && root.document.hidden);
    }

    function describe(plan) {
      if (plan.kind === "immediate") {
        return `on · frames run back-to-back without the browser's 4 ms timer gap (~${Math.round(plan.predictedFps)} FPS possible)`;
      }
      if (plan.kind === "vsync") {
        return `on · synced to the ${Math.round(state.refreshHz)} Hz display (~${Math.round(plan.predictedFps)} FPS, even frame times)`;
      }
      return plan.interval > 1 ?
        `on · every ${plan.interval}${plan.interval === 2 ? "nd" : plan.interval === 3 ? "rd" : "th"} display frame (${Math.round(plan.pacedFps)} FPS)` :
        `on · synced to the ${Math.round(state.refreshHz)} Hz display`;
    }

    function apply(plan) {
      if (!setTiming(plan.mode, plan.value)) {
        state.pacingReason = "couldn't reach the game's loop timer";
        return false;
      }
      state.pacingActive = true;
      state.pacingInterval = plan.mode === 1 ? plan.value : 0;
      state.applied = { kind: plan.kind, mode: plan.mode, value: plan.value, predictedFps: plan.predictedFps };
      state.slowStrikes = 0;
      state.switchVotes = 0;
      state.pacingReason = describe(plan);
      return true;
    }

    function evaluatePacing() {
      const loop = mainLoop();
      if (!state.framePacing) {
        if (state.pacingActive) restoreTiming("off");
        else state.pacingReason = "off";
        return;
      }
      if (hidden()) {
        // Hidden tabs get no animation frames. Hand the game its own timer back
        // so it keeps ticking (and stays connected) in the background.
        if (state.pacingActive) restoreTiming("paused while the tab is hidden");
        return;
      }
      if (state.pacingActive && loop && state.applied &&
          (loop.timingMode !== state.applied.mode || loop.timingValue !== state.applied.value)) {
        // The game re-set its own loop timing; respect it and re-check later.
        state.pacingActive = false;
        state.applied = null;
        state.original = null;
        state.pacingInterval = 0;
        state.pacingReason = "the game changed its loop timing; re-checking";
        return;
      }
      const recent = stats(3000);
      const steady = recent && recent.samples >= 20;
      const work = steady ? recent.workMs : null;
      const slow = steady ? recent.workP90 : null;

      if (state.pacingActive && state.applied.kind !== "capped-vsync") {
        // Uncapped game: frame time is the same whichever way frames are
        // scheduled, so compare what we get with what the game's own timer
        // would give at the current frame time.
        if (!steady || !state.refreshHz) return;
        // 1) Re-pick as realms get heavier/lighter, with a little hysteresis.
        let choice = uncappedChoice(state.refreshHz, work, slow);
        if (choice.kind === "vsync" && state.vsyncBad) {
          choice = { kind: "immediate", mode: 2, value: 0, predictedFps: Math.min(state.refreshHz, 1000 / (work + 0.3)) };
        }
        if (choice.kind !== state.applied.kind) {
          state.slowStrikes = 0;
          state.switchVotes += 1;
          if (state.switchVotes >= 3) apply(choice);
          return;
        }
        state.switchVotes = 0;
        state.applied.predictedFps = choice.predictedFps;
        // 2) Safety: never do worse than the game's own timer would at this
        //    frame time (frame time is the same however frames are scheduled).
        const original = Math.min(state.refreshHz, uncappedOriginalFps(state.original, work));
        if (recent.fps < original * 0.9) {
          state.slowStrikes += 1;
          if (state.slowStrikes >= 5) {
            if (state.applied.kind === "vsync" && state.original.mode !== 2) {
              // Vsync underdelivered (uneven frame times); stick to back-to-back.
              state.vsyncBad = true;
              apply({ kind: "immediate", mode: 2, value: 0,
                predictedFps: Math.min(state.refreshHz, 1000 / (work + 0.3)) });
            } else {
              state.pacingBlocked = true;
              restoreTiming(`reverted: rescheduling ran slower (${Math.round(recent.fps)} vs ~${Math.round(original)} FPS)`);
            }
          }
          return;
        }
        state.slowStrikes = 0;
        state.pacingReason = describe(state.applied);
        return;
      }
      if (state.pacingActive) {
        if (recent && recent.fps != null && state.baselineFps &&
            recent.fps < state.baselineFps * 0.9) {
          state.slowStrikes += 1;
          if (state.slowStrikes >= 3) {
            state.pacingBlocked = true;
            restoreTiming(`reverted: vsync pacing ran slower (${Math.round(recent.fps)} vs ${Math.round(state.baselineFps)} FPS)`);
          }
        } else {
          state.slowStrikes = 0;
        }
        return;
      }
      if (state.pacingBlocked) return;
      if (loop && loop.func && loop.timingMode === 0) {
        state.baselineFps = recent && recent.samples >= 30 ? recent.fps : null;
      }
      const plan = pacingPlan(state.refreshHz, loop, state.baselineFps, work, slow);
      if (plan.action === "keep") {
        state.pacingReason = plan.reason;
        return;
      }
      state.original = { mode: loop.timingMode, value: loop.timingValue };
      apply(plan);
    }

    function tick() {
      attachFrameHooks();
      const at = now();
      if (!state.refreshHz || at - state.lastMeasure > 60000) {
        if (at >= state.measuringUntil && !hidden()) measureRefresh();
      }
      evaluatePacing();
    }

    function install() {
      wrapGetContext();
      if (root.document && typeof root.document.addEventListener === "function") {
        root.document.addEventListener("visibilitychange", () => {
          if (!hidden()) state.lastMeasure = 0;
          evaluatePacing();
        });
      }
      if (!state.timer && typeof root.setInterval === "function") state.timer = root.setInterval(tick, 1000);
      return true;
    }

    function configure(options) {
      options = options || {};
      if (options.gpuHighPerformance != null) state.gpuHighPerformance = !!options.gpuHighPerformance;
      if (options.framePacing != null) {
        const next = !!options.framePacing;
        if (next !== state.framePacing) {
          state.framePacing = next;
          state.pacingBlocked = false;
          state.vsyncBad = false;
          evaluatePacing();
        }
      }
      return status();
    }

    function status() {
      const loop = mainLoop();
      const canvas = state.canvas;
      let cssWidth = null;
      let cssHeight = null;
      try {
        if (canvas && canvas.getBoundingClientRect) {
          const rect = canvas.getBoundingClientRect();
          cssWidth = Math.round(rect.width);
          cssHeight = Math.round(rect.height);
        }
      } catch (_) {}
      return {
        gpu: {
          highPerformance: state.gpuHighPerformance,
          requested: state.gpuRequested,
          context: state.contextType,
          renderer: state.renderer
        },
        loop: loop ? {
          running: !!loop.func,
          method: loop.method || null,
          timingMode: loop.timingMode,
          timingValue: loop.timingValue,
          capFps: loop.timingMode === 0 && loop.timingValue > 0 ? 1000 / loop.timingValue : null
        } : null,
        pacing: {
          enabled: state.framePacing,
          active: state.pacingActive,
          interval: state.pacingInterval,
          refreshHz: state.refreshHz,
          baselineFps: state.baselineFps,
          reason: state.pacingReason
        },
        frames: stats(),
        canvas: canvas ? {
          width: canvas.width, height: canvas.height, cssWidth, cssHeight,
          dpr: root.devicePixelRatio || 1
        } : null
      };
    }

    return { install, configure, status, stats };
  }

  return { createController, frameStats, pacingPlan, refreshFromDeltas, uncappedChoice, uncappedOriginalFps };
});

// In the page, start immediately (document_start) so the GPU preference is in
// place before the game creates its WebGL context.
if (typeof window !== "undefined" && window.CCBrowserPerf && !window.__ccBrowserPerf) {
  window.__ccBrowserPerf = window.CCBrowserPerf.createController(window);
  window.__ccBrowserPerf.install();
}
