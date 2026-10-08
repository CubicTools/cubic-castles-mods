/* WebGL view-matrix camera hook for the Cubic Castles browser client. */
(function installCameraCore(root, factory) {
  const api = factory();
  root.CCBrowserCamera = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeCameraCore() {
  "use strict";

  const EPSILON = 0.035;

  function finiteMatrix(value) {
    if (!value || value.length !== 16) return false;
    // Plain loop: this runs inside the game's draw calls, so no temporary arrays.
    for (let index = 0; index < 16; index += 1) {
      if (!Number.isFinite(value[index])) return false;
    }
    return true;
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function length3(value) {
    return Math.sqrt(dot3(value, value));
  }

  function viewAxes(matrix) {
    return {
      x: [matrix[0], matrix[4], matrix[8]],
      y: [matrix[1], matrix[5], matrix[9]],
      z: [matrix[2], matrix[6], matrix[10]]
    };
  }

  function isRigidViewMatrix(matrix) {
    if (!finiteMatrix(matrix)) return false;
    if (Math.abs(matrix[3]) > EPSILON || Math.abs(matrix[7]) > EPSILON ||
        Math.abs(matrix[11]) > EPSILON || Math.abs(matrix[15] - 1) > EPSILON) return false;
    const { x, y, z } = viewAxes(matrix);
    if (Math.abs(length3(x) - 1) > EPSILON || Math.abs(length3(y) - 1) > EPSILON ||
        Math.abs(length3(z) - 1) > EPSILON) return false;
    return Math.abs(dot3(x, y)) <= EPSILON && Math.abs(dot3(x, z)) <= EPSILON &&
      Math.abs(dot3(y, z)) <= EPSILON;
  }

  function eyeFromView(matrix) {
    if (!isRigidViewMatrix(matrix)) return null;
    const { x, y, z } = viewAxes(matrix);
    return [
      -matrix[12] * x[0] - matrix[13] * y[0] - matrix[14] * z[0],
      -matrix[12] * x[1] - matrix[13] * y[1] - matrix[14] * z[1],
      -matrix[12] * x[2] - matrix[13] * y[2] - matrix[14] * z[2]
    ];
  }

  function isScreenSpaceView(matrix) {
    if (!isRigidViewMatrix(matrix)) return false;
    return Math.abs(matrix[0] - 1) < 0.0001 && Math.abs(matrix[5] - 1) < 0.0001 &&
      Math.abs(matrix[10] - 1) < 0.0001 && Math.abs(matrix[1]) < 0.0001 &&
      Math.abs(matrix[2]) < 0.0001 && Math.abs(matrix[4]) < 0.0001 &&
      Math.abs(matrix[6]) < 0.0001 && Math.abs(matrix[8]) < 0.0001 &&
      Math.abs(matrix[9]) < 0.0001 && Math.abs(matrix[12]) < 0.0001 &&
      Math.abs(matrix[13]) < 0.0001 && Math.abs(matrix[14]) < 0.0001;
  }

  function retargetViewMatrix(matrix, forwardShift, verticalShift) {
    if (!isRigidViewMatrix(matrix) || isScreenSpaceView(matrix)) return null;
    const result = new Float32Array(matrix);
    const { x, y, z } = viewAxes(result);
    const eye = eyeFromView(result);
    const moved = [
      eye[0] + z[0] * forwardShift + y[0] * verticalShift,
      eye[1] + z[1] * forwardShift + y[1] * verticalShift,
      eye[2] + z[2] * forwardShift + y[2] * verticalShift
    ];
    result[12] = -dot3(x, moved);
    result[13] = -dot3(y, moved);
    result[14] = -dot3(z, moved);
    return result;
  }

  function matricesMatch(left, right, epsilon = 0.00001) {
    if (!finiteMatrix(left) || !finiteMatrix(right)) return false;
    for (let index = 0; index < 16; index += 1) {
      if (Math.abs(left[index] - right[index]) > epsilon) return false;
    }
    return true;
  }

  function isViewUniformName(name) {
    const text = String(name || "").replace(/\[0\]$/, "").toLowerCase();
    if (!text || /(projection|\bproj\b|model|mvp|shadow|light|bone|normal)/.test(text)) return false;
    return /(^|[_.])(?:u[_.]?)?(?:view(?:matrix)?|camera(?:view)?)(?:$|[_.])/.test(text) ||
      /(?:viewmatrix|cameraview)$/.test(text);
  }

  function isProjectionUniformName(name) {
    const text = String(name || "").replace(/\[0\]$/, "").toLowerCase();
    if (!text || /(view|model|mvp|shadow|light|bone|normal)/.test(text)) return false;
    return /(^|[_.])(?:u[_.]?)?(?:projection(?:matrix)?|proj(?:matrix)?)(?:$|[_.])/.test(text) ||
      /(?:projectionmatrix|projmatrix)$/.test(text);
  }

  function createController(browserRoot) {
    const locationInfo = new WeakMap();
    const projectionByContext = new WeakMap();
    const hooked = new WeakSet();
    const matrixUniforms = new Set();
    const heapPatches = [];
    const state = {
      installed: false,
      mode: 0,
      forwardShift: 22,
      verticalShift: -1,
      syncPicking: true,
      detectedName: null,
      candidateCalls: 0,
      modifiedCalls: 0,
      writeBackCalls: 0,
      reusedWriteBackCalls: 0,
      screenSpaceCalls: 0,
      rejectedCalls: 0,
      lastSeen: 0,
      onStatus: null,
      onBeforeScreenSpace: null,
      sawWorldView: false,
      latestView: null,
      latestProjection: null,
      latestCanvas: null,
      projectionName: null
    };

    function signalStatus(force = false) {
      if (typeof state.onStatus !== "function") return;
      const now = Date.now();
      if (!force && now - signalStatus.last < 500) return;
      signalStatus.last = now;
      state.onStatus(status());
    }
    signalStatus.last = 0;

    function rememberMatrixName(name) {
      name = String(name || "");
      if (name && matrixUniforms.size < 40) matrixUniforms.add(name);
    }

    function findPatch(value, offset) {
      return heapPatches.find(record => record.value === value && record.offset === offset) || null;
    }

    function restoreHeapPatches() {
      for (const record of heapPatches) {
        try {
          const current = record.value.subarray(record.offset, record.offset + 16);
          if (matricesMatch(current, record.changed)) record.value.set(record.original, record.offset);
        } catch (_) {
          // The WASM heap can be replaced when memory grows. A stale view is harmless.
        }
      }
      heapPatches.length = 0;
    }

    function writeBackHeapMatrix(value, offset, original, changed) {
      let record = findPatch(value, offset);
      if (!record) {
        if (heapPatches.length >= 64) heapPatches.shift();
        record = { value, offset, original: null, changed: null };
        heapPatches.push(record);
      }
      record.original = new Float32Array(original);
      record.changed = new Float32Array(changed);
      value.set(changed, offset);
      state.writeBackCalls += 1;
    }

    function wrapPrototype(proto) {
      if (!proto || hooked.has(proto)) return false;
      const nativeGetUniformLocation = proto.getUniformLocation;
      const nativeUniformMatrix4fv = proto.uniformMatrix4fv;
      if (typeof nativeGetUniformLocation !== "function" ||
          typeof nativeUniformMatrix4fv !== "function") return false;
      if (nativeUniformMatrix4fv.__ccBrowserCameraWrapped) return false;

      const getUniformLocation = function getUniformLocation(program, name) {
        const location = nativeGetUniformLocation.apply(this, arguments);
        if (location && (typeof location === "object" || typeof location === "function")) {
          // Classify the uniform once here. uniformMatrix4fv runs hundreds of
          // times per frame, so it must not repeat these string/regex checks.
          const text = String(name || "");
          locationInfo.set(location, {
            name: text,
            view: isViewUniformName(text),
            projection: isProjectionUniformName(text),
            seen: false
          });
        }
        return location;
      };

      const uniformMatrix4fv = function uniformMatrix4fv(location, transpose, value) {
        const info = location && locationInfo.get(location);
        if (info && !info.seen) {
          info.seen = true;
          rememberMatrixName(info.name);
        }
        // Fast path: model/bone/etc. matrices are passed straight through with
        // no allocation, so the hook costs one WeakMap lookup per call.
        if (!info || (!info.view && !info.projection)) {
          return nativeUniformMatrix4fv.apply(this, arguments);
        }
        let outgoing = value;
        let sourceOffset = 0;
        let sourceLength = value && typeof value.length === "number" ? value.length : 0;
        let isHeapUpload = false;
        try {
          // Emscripten's WebGL2 path passes the entire WASM HEAPF32 plus a
          // source offset and length. WebGL1 passes a standalone Float32Array.
          if (arguments.length >= 5 && Number.isInteger(Number(arguments[3])) &&
              Number.isInteger(Number(arguments[4]))) {
            isHeapUpload = true;
            sourceOffset = Number(arguments[3]);
            sourceLength = Number(arguments[4]);
          }
          const name = info.name;
          const matrix = sourceLength === 16 && value && typeof value.subarray === "function" ?
            value.subarray(sourceOffset, sourceOffset + 16) : value;
          if (info.projection && transpose === false && finiteMatrix(matrix)) {
            let entry = projectionByContext.get(this);
            if (!entry) {
              entry = { matrix: new Float32Array(16), name };
              projectionByContext.set(this, entry);
            }
            entry.matrix.set(matrix);
            entry.name = name;
          }
          if (info.view) {
            const firstDetection = !state.detectedName;
            let firstModification = false;
            state.detectedName = name;
            state.candidateCalls += 1;
            state.lastSeen = Date.now();
            if (transpose === false && finiteMatrix(matrix)) {
              if (isScreenSpaceView(matrix)) {
                state.screenSpaceCalls += 1;
                if (state.sawWorldView && state.mode === 1 &&
                    typeof state.onBeforeScreenSpace === "function") {
                  try { state.onBeforeScreenSpace({ gl: this, canvas: this.canvas }); } catch (_) {}
                }
                state.sawWorldView = false;
              } else if (isRigidViewMatrix(matrix)) {
                state.sawWorldView = true;
                let renderedMatrix = matrix;
                if (state.mode !== 0) {
                  const patch = isHeapUpload && sourceLength === 16 ? findPatch(value, sourceOffset) : null;
                  if (state.syncPicking && patch && matricesMatch(matrix, patch.changed)) {
                    // Emscripten may upload the same matrix more than once. It is
                    // already shifted in WASM memory, so never apply the offset twice.
                    outgoing = value;
                    renderedMatrix = matrix;
                    state.reusedWriteBackCalls += 1;
                    firstModification = state.modifiedCalls === 0;
                    state.modifiedCalls += 1;
                  } else {
                    const changed = retargetViewMatrix(matrix, state.forwardShift, state.verticalShift);
                    if (changed) {
                      renderedMatrix = changed;
                      firstModification = state.modifiedCalls === 0;
                      state.modifiedCalls += 1;
                      if (state.syncPicking && isHeapUpload && sourceLength === 16 && value &&
                          typeof value.set === "function") {
                        // The native camera hook edits the matrix pointer in place.
                        // Do the equivalent for Emscripten so camera consumers that
                        // run after the GL upload can see the shifted view too.
                        writeBackHeapMatrix(value, sourceOffset, matrix, changed);
                        outgoing = value;
                      } else {
                        outgoing = changed;
                      }
                    } else {
                      state.rejectedCalls += 1;
                    }
                  }
                }
                // Reuse the same buffers every frame; pickState() hands out copies.
                if (!state.latestView) state.latestView = new Float32Array(16);
                state.latestView.set(renderedMatrix);
                const projection = projectionByContext.get(this);
                if (projection) {
                  if (!state.latestProjection) state.latestProjection = new Float32Array(16);
                  state.latestProjection.set(projection.matrix);
                  state.projectionName = projection.name;
                }
                state.latestCanvas = this.canvas || state.latestCanvas;
              }
            }
            signalStatus(firstDetection || firstModification);
          }
        } catch (_) {
          // A render hook must never interrupt the game's own draw call.
        }
        if (outgoing === value) return nativeUniformMatrix4fv.apply(this, arguments);
        const args = Array.from(arguments);
        args[2] = outgoing;
        if (outgoing !== value && args.length >= 5) {
          // Upload the copied 16-float matrix from its beginning instead of
          // copying the multi-megabyte WASM heap merely to preserve the offset.
          args[3] = 0;
          args[4] = 16;
        }
        return nativeUniformMatrix4fv.apply(this, args);
      };
      Object.defineProperty(uniformMatrix4fv, "__ccBrowserCameraWrapped", { value: true });

      try {
        proto.getUniformLocation = getUniformLocation;
        proto.uniformMatrix4fv = uniformMatrix4fv;
        hooked.add(proto);
        return true;
      } catch (_) {
        return false;
      }
    }

    function install() {
      const prototypes = [];
      if (browserRoot && browserRoot.WebGLRenderingContext) {
        prototypes.push(browserRoot.WebGLRenderingContext.prototype);
      }
      if (browserRoot && browserRoot.WebGL2RenderingContext) {
        prototypes.push(browserRoot.WebGL2RenderingContext.prototype);
      }
      let installed = false;
      for (const proto of prototypes) installed = wrapPrototype(proto) || installed;
      state.installed = installed;
      signalStatus(true);
      return state.installed;
    }

    function configure(options) {
      options = options || {};
      const previousMode = state.mode;
      const previousForwardShift = state.forwardShift;
      const previousVerticalShift = state.verticalShift;
      const previousSyncPicking = state.syncPicking;
      if (options.mode != null) state.mode = [0, 1, 2].includes(Number(options.mode)) ? Number(options.mode) : 0;
      if (options.forwardShift != null && Number.isFinite(Number(options.forwardShift))) {
        state.forwardShift = Math.max(-60, Math.min(60, Number(options.forwardShift)));
      }
      if (options.verticalShift != null && Number.isFinite(Number(options.verticalShift))) {
        state.verticalShift = Math.max(-20, Math.min(20, Number(options.verticalShift)));
      }
      if (options.syncPicking != null) state.syncPicking = !!options.syncPicking;
      if (previousMode !== state.mode || previousForwardShift !== state.forwardShift ||
          previousVerticalShift !== state.verticalShift || previousSyncPicking !== state.syncPicking ||
          !state.syncPicking) restoreHeapPatches();
      signalStatus(true);
      return status();
    }

    function status() {
      return {
        installed: state.installed,
        mode: state.mode,
        forwardShift: state.forwardShift,
        verticalShift: state.verticalShift,
        syncPicking: state.syncPicking,
        detectedName: state.detectedName,
        candidateCalls: state.candidateCalls,
        modifiedCalls: state.modifiedCalls,
        writeBackCalls: state.writeBackCalls,
        reusedWriteBackCalls: state.reusedWriteBackCalls,
        screenSpaceCalls: state.screenSpaceCalls,
        rejectedCalls: state.rejectedCalls,
        lastSeen: state.lastSeen,
        matrixUniforms: Array.from(matrixUniforms)
      };
    }

    function pickState() {
      if (!state.latestView || !state.latestProjection || !state.latestCanvas) return null;
      return {
        view: new Float32Array(state.latestView),
        projection: new Float32Array(state.latestProjection),
        canvas: state.latestCanvas,
        viewName: state.detectedName,
        projectionName: state.projectionName
      };
    }

    return {
      configure,
      install,
      pickState,
      set onStatus(callback) { state.onStatus = callback; },
      get onStatus() { return state.onStatus; },
      set onBeforeScreenSpace(callback) { state.onBeforeScreenSpace = callback; },
      get onBeforeScreenSpace() { return state.onBeforeScreenSpace; },
      status
    };
  }

  return {
    createController,
    eyeFromView,
    isRigidViewMatrix,
    isScreenSpaceView,
    isProjectionUniformName,
    isViewUniformName,
    matricesMatch,
    retargetViewMatrix
  };
});
