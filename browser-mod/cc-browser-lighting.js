/* WebGL realm-lighting override for the Cubic Castles browser client. */
(function installLightingCore(root, factory) {
  const api = factory(root.CCBrowserCamera);
  root.CCBrowserLighting = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeLightingCore(CameraCore) {
  "use strict";

  const BRIGHT_LEVEL = 0.65;
  const FULL_LEVEL = 1.0;

  // WebGL converts an enabled float vertex array according to
  // vertexAttribPointer. A disabled array instead reads the raw generic value
  // set by vertexAttrib4f, so retain the source array's numeric scale.
  function attributeMaximum(gl, type, normalized) {
    if (normalized) return 1;
    if (type === gl.UNSIGNED_BYTE) return 255;
    if (type === gl.BYTE) return 127;
    if (type === gl.UNSIGNED_SHORT) return 65535;
    if (type === gl.SHORT) return 32767;
    if (type === gl.UNSIGNED_INT) return 4294967295;
    if (type === gl.INT) return 2147483647;
    return 1;
  }

  // Cubic's current WebGL2 world shader declares:
  //   layout (location = 1) in uint aVertexColor;
  // and unpacks that scalar as R/G/B/A bytes. A float generic attribute is
  // invalid for that input; it must be supplied with vertexAttribI4ui.
  function packedVertexColor(level) {
    const component = Math.max(0, Math.min(255, Math.round(Number(level) * 255)));
    return (0xff000000 | (component << 16) | (component << 8) | component) >>> 0;
  }

  function isColorAttributeName(name) {
    const text = String(name || "").replace(/\[0\]$/, "").toLowerCase();
    if (!text) return false;
    return /(^|[_.])(?:a[_.]?)?(?:color|colour)(?:0)?(?:$|[_.])/.test(text) ||
      /(?:vertex|vert)(?:color|colour)$/.test(text) ||
      /(?:color|colour)(?:in|attr|attribute)$/.test(text);
  }

  function validMode(value) {
    value = Number(value);
    return value === 1 || value === 2 ? value : 0;
  }

  function sourceMatrix(value, args) {
    if (!value || typeof value.length !== "number") return value;
    if (args.length >= 5 && Number.isInteger(Number(args[3])) &&
        Number.isInteger(Number(args[4])) && Number(args[4]) === 16 &&
        typeof value.subarray === "function") {
      const offset = Number(args[3]);
      return value.subarray(offset, offset + 16);
    }
    return value;
  }

  function createController(browserRoot) {
    const hooked = new WeakSet();
    const uniformInfo = new WeakMap();
    const programInfo = new WeakMap();
    const contextInfo = new WeakMap();
    const attributeNames = new Set();
    const colorNames = new Set();
    const state = {
      installed: false,
      mode: 0,
      worldPasses: 0,
      screenPasses: 0,
      drawCalls: 0,
      modifiedDraws: 0,
      restoredDraws: 0,
      programsWithColor: 0,
      errors: 0,
      lastError: null,
      lastSeen: 0,
      onStatus: null
    };

    function signalStatus(force = false) {
      if (typeof state.onStatus !== "function") return;
      const now = Date.now();
      if (!force && now - signalStatus.last < 500) return;
      signalStatus.last = now;
      state.onStatus(status());
    }
    signalStatus.last = 0;

    function context(gl) {
      let info = contextInfo.get(gl);
      if (!info) {
        info = { program: null, worldPass: false, enabled: new Set(), formats: new Map() };
        contextInfo.set(gl, info);
      }
      return info;
    }

    function program(program) {
      let info = programInfo.get(program);
      if (!info) {
        info = { colors: new Set(), names: new Map(), counted: false };
        programInfo.set(program, info);
      }
      return info;
    }

    function rememberAttribute(programObject, location, name) {
      location = Number(location);
      name = String(name || "");
      if (!programObject || !Number.isInteger(location) || location < 0 || !name) return;
      if (attributeNames.size < 80) attributeNames.add(name);
      const info = program(programObject);
      info.names.set(location, name);
      if (!isColorAttributeName(name)) return;
      if (!info.colors.has(location) && !info.counted) {
        info.counted = true;
        state.programsWithColor += 1;
      }
      info.colors.add(location);
      if (colorNames.size < 30) colorNames.add(name);
      signalStatus(true);
    }

    function noteView(gl, matrix) {
      if (!CameraCore || !matrix || matrix.length !== 16) return;
      const info = context(gl);
      if (CameraCore.isScreenSpaceView(matrix)) {
        info.worldPass = false;
        state.screenPasses += 1;
      } else if (CameraCore.isRigidViewMatrix(matrix)) {
        info.worldPass = true;
        state.worldPasses += 1;
      } else {
        return;
      }
      state.lastSeen = Date.now();
      signalStatus(false);
    }

    function wrapPrototype(proto) {
      if (!proto || hooked.has(proto)) return false;
      const native = {
        getUniformLocation: proto.getUniformLocation,
        uniformMatrix4fv: proto.uniformMatrix4fv,
        getAttribLocation: proto.getAttribLocation,
        bindAttribLocation: proto.bindAttribLocation,
        linkProgram: proto.linkProgram,
        getProgramParameter: proto.getProgramParameter,
        getActiveAttrib: proto.getActiveAttrib,
        useProgram: proto.useProgram,
        enableVertexAttribArray: proto.enableVertexAttribArray,
        disableVertexAttribArray: proto.disableVertexAttribArray,
        vertexAttribPointer: proto.vertexAttribPointer,
        vertexAttribIPointer: proto.vertexAttribIPointer,
        vertexAttrib4f: proto.vertexAttrib4f,
        vertexAttribI4i: proto.vertexAttribI4i,
        vertexAttribI4ui: proto.vertexAttribI4ui,
        drawArrays: proto.drawArrays,
        drawElements: proto.drawElements,
        drawArraysInstanced: proto.drawArraysInstanced,
        drawElementsInstanced: proto.drawElementsInstanced
      };
      if (typeof native.getUniformLocation !== "function" ||
          typeof native.uniformMatrix4fv !== "function" ||
          typeof native.getAttribLocation !== "function" ||
          typeof native.useProgram !== "function" ||
          typeof native.enableVertexAttribArray !== "function" ||
          typeof native.disableVertexAttribArray !== "function" ||
          typeof native.vertexAttrib4f !== "function" ||
          (typeof native.drawArrays !== "function" && typeof native.drawElements !== "function")) return false;

      const getUniformLocation = function getUniformLocation(programObject, name) {
        const location = native.getUniformLocation.apply(this, arguments);
        if (location && (typeof location === "object" || typeof location === "function")) {
          uniformInfo.set(location, {
            view: !!(CameraCore && CameraCore.isViewUniformName(name)),
            name: String(name || "")
          });
        }
        return location;
      };

      const uniformMatrix4fv = function uniformMatrix4fv(location, transpose, value) {
        try {
          const info = location && uniformInfo.get(location);
          if (info && info.view && transpose === false) {
            noteView(this, sourceMatrix(value, arguments));
          }
        } catch (error) {
          state.errors += 1;
          state.lastError = String(error && error.message || error);
        }
        return native.uniformMatrix4fv.apply(this, arguments);
      };

      const getAttribLocation = function getAttribLocation(programObject, name) {
        const location = native.getAttribLocation.apply(this, arguments);
        rememberAttribute(programObject, location, name);
        return location;
      };

      const bindAttribLocation = typeof native.bindAttribLocation === "function" ?
        function bindAttribLocation(programObject, index, name) {
          rememberAttribute(programObject, index, name);
          return native.bindAttribLocation.apply(this, arguments);
        } : null;

      const linkProgram = typeof native.linkProgram === "function" ? function linkProgram(programObject) {
        const result = native.linkProgram.apply(this, arguments);
        try {
          if (typeof native.getProgramParameter === "function" &&
              typeof native.getActiveAttrib === "function") {
            const count = Number(native.getProgramParameter.call(this, programObject, this.ACTIVE_ATTRIBUTES)) || 0;
            for (let index = 0; index < count; index += 1) {
              const active = native.getActiveAttrib.call(this, programObject, index);
              if (!active || !active.name) continue;
              const location = native.getAttribLocation.call(this, programObject, active.name);
              rememberAttribute(programObject, location, active.name);
            }
          }
        } catch (error) {
          state.errors += 1;
          state.lastError = String(error && error.message || error);
        }
        return result;
      } : null;

      const useProgram = function useProgram(programObject) {
        context(this).program = programObject || null;
        return native.useProgram.apply(this, arguments);
      };

      const enableVertexAttribArray = function enableVertexAttribArray(index) {
        context(this).enabled.add(Number(index));
        return native.enableVertexAttribArray.apply(this, arguments);
      };
      const disableVertexAttribArray = function disableVertexAttribArray(index) {
        context(this).enabled.delete(Number(index));
        return native.disableVertexAttribArray.apply(this, arguments);
      };
      const vertexAttribPointer = typeof native.vertexAttribPointer === "function" ?
        function vertexAttribPointer(index, size, type, normalized) {
          const result = native.vertexAttribPointer.apply(this, arguments);
          context(this).formats.set(Number(index), {
            type: Number(type),
            normalized: !!normalized,
            maximum: attributeMaximum(this, Number(type), !!normalized),
            integer: false
          });
          return result;
        } : null;
      const vertexAttribIPointer = typeof native.vertexAttribIPointer === "function" ?
        function vertexAttribIPointer(index, size, type) {
          const result = native.vertexAttribIPointer.apply(this, arguments);
          context(this).formats.set(Number(index), {
            type: Number(type), normalized: false,
            maximum: attributeMaximum(this, Number(type), false), integer: true
          });
          return result;
        } : null;

      function drawWithLighting(gl, draw, args) {
        state.drawCalls += 1;
        const ctx = context(gl);
        const info = ctx.program && programInfo.get(ctx.program);
        if (state.mode === 0 || !ctx.worldPass || !info || info.colors.size === 0) {
          return draw.apply(gl, args);
        }
        const changed = [];
        const level = state.mode === 2 ? FULL_LEVEL : BRIGHT_LEVEL;
        try {
          for (const location of info.colors) {
            if (!ctx.enabled.has(location)) continue;
            const format = ctx.formats.get(location);
            if (format && format.integer) {
              const unsigned = format.type === gl.UNSIGNED_BYTE ||
                format.type === gl.UNSIGNED_SHORT || format.type === gl.UNSIGNED_INT;
              const setter = unsigned ? native.vertexAttribI4ui : native.vertexAttribI4i;
              if (typeof setter !== "function") continue;
              const packed = packedVertexColor(level);
              native.disableVertexAttribArray.call(gl, location);
              changed.push(location);
              if (unsigned) setter.call(gl, location, packed, 0, 0, 1);
              else setter.call(gl, location, packed | 0, 0, 0, 1);
              continue;
            }
            const maximum = format ? format.maximum : 1;
            native.disableVertexAttribArray.call(gl, location);
            changed.push(location);
            native.vertexAttrib4f.call(gl, location,
              level * maximum, level * maximum, level * maximum, maximum);
          }
          if (changed.length) state.modifiedDraws += 1;
        } catch (error) {
          state.errors += 1;
          state.lastError = String(error && error.message || error);
          for (const location of changed) {
            try { native.enableVertexAttribArray.call(gl, location); } catch (_) {}
          }
          signalStatus(true);
          return draw.apply(gl, args);
        }
        try {
          return draw.apply(gl, args);
        } finally {
          for (const location of changed) {
            try { native.enableVertexAttribArray.call(gl, location); } catch (_) {}
          }
          if (changed.length) state.restoredDraws += 1;
          signalStatus(false);
        }
      }

      const drawArrays = typeof native.drawArrays === "function" ? function drawArrays() {
        return drawWithLighting(this, native.drawArrays, arguments);
      } : null;
      const drawElements = typeof native.drawElements === "function" ? function drawElements() {
        return drawWithLighting(this, native.drawElements, arguments);
      } : null;
      const drawArraysInstanced = typeof native.drawArraysInstanced === "function" ? function drawArraysInstanced() {
        return drawWithLighting(this, native.drawArraysInstanced, arguments);
      } : null;
      const drawElementsInstanced = typeof native.drawElementsInstanced === "function" ? function drawElementsInstanced() {
        return drawWithLighting(this, native.drawElementsInstanced, arguments);
      } : null;

      try {
        proto.getUniformLocation = getUniformLocation;
        proto.uniformMatrix4fv = uniformMatrix4fv;
        proto.getAttribLocation = getAttribLocation;
        if (bindAttribLocation) proto.bindAttribLocation = bindAttribLocation;
        if (linkProgram) proto.linkProgram = linkProgram;
        proto.useProgram = useProgram;
        proto.enableVertexAttribArray = enableVertexAttribArray;
        proto.disableVertexAttribArray = disableVertexAttribArray;
        if (vertexAttribPointer) proto.vertexAttribPointer = vertexAttribPointer;
        if (vertexAttribIPointer) proto.vertexAttribIPointer = vertexAttribIPointer;
        if (drawArrays) proto.drawArrays = drawArrays;
        if (drawElements) proto.drawElements = drawElements;
        if (drawArraysInstanced) proto.drawArraysInstanced = drawArraysInstanced;
        if (drawElementsInstanced) proto.drawElementsInstanced = drawElementsInstanced;
        hooked.add(proto);
        return true;
      } catch (error) {
        state.errors += 1;
        state.lastError = String(error && error.message || error);
        return false;
      }
    }

    function install() {
      const prototypes = [];
      if (browserRoot && browserRoot.WebGLRenderingContext) prototypes.push(browserRoot.WebGLRenderingContext.prototype);
      if (browserRoot && browserRoot.WebGL2RenderingContext) prototypes.push(browserRoot.WebGL2RenderingContext.prototype);
      let installed = false;
      for (const proto of prototypes) installed = wrapPrototype(proto) || installed;
      state.installed = installed;
      signalStatus(true);
      return installed;
    }

    function configure(options) {
      options = options || {};
      if (options.mode != null) state.mode = validMode(options.mode);
      signalStatus(true);
      return status();
    }

    function status() {
      return {
        installed: state.installed,
        mode: state.mode,
        worldPasses: state.worldPasses,
        screenPasses: state.screenPasses,
        drawCalls: state.drawCalls,
        modifiedDraws: state.modifiedDraws,
        restoredDraws: state.restoredDraws,
        programsWithColor: state.programsWithColor,
        errors: state.errors,
        lastError: state.lastError,
        lastSeen: state.lastSeen,
        attributeNames: Array.from(attributeNames),
        colorAttributeNames: Array.from(colorNames)
      };
    }

    return {
      configure,
      install,
      status,
      set onStatus(callback) { state.onStatus = callback; },
      get onStatus() { return state.onStatus; }
    };
  }

  return {
    BRIGHT_LEVEL, FULL_LEVEL, attributeMaximum, packedVertexColor,
    createController, isColorAttributeName, validMode
  };
});
