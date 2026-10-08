/* Passive multi-block preview math shared by the browser UI and offline tests. */
(function installPlannerCore(root, factory) {
  const api = factory();
  root.CCBrowserPlanner = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makePlannerCore() {
  "use strict";

  const WORLD_BOTTOM_Z = 99;
  const MODE_CAPS = { forward: 6, down: 8, group: 9 };
  // Flat 3x3 ring (edges first, then corners) in the X/Y plane; groupOffsets()
  // rotates it onto whichever block face was hit.
  const GROUP_OFFSETS = [
    [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0],
    [-1, -1, 0], [-1, 1, 0], [1, -1, 0], [1, 1, 0]
  ];

  function groupOffsets(normal) {
    const axis = normal ? [0, 1, 2].find(index => normal[index] !== 0) : 2;
    if (axis === 2 || axis == null) return GROUP_OFFSETS;
    // Wall hit: spread across the wall (the other horizontal axis + Z).
    const across = axis === 0 ? 1 : 0;
    return GROUP_OFFSETS.map(([a, b]) => {
      const offset = [0, 0, 0];
      offset[across] = a;
      offset[2] = b;
      return offset;
    });
  }

  function cellKey(cell) {
    return `${cell[0]},${cell[1]},${cell[2]}`;
  }

  function multiply4(left, right) {
    const out = new Float64Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) {
          sum += left[k * 4 + row] * right[column * 4 + k];
        }
        out[column * 4 + row] = sum;
      }
    }
    return out;
  }

  function invert4(matrix) {
    if (!matrix || matrix.length !== 16) return null;
    const rows = Array.from({ length: 4 }, (_, row) => [
      matrix[row], matrix[4 + row], matrix[8 + row], matrix[12 + row],
      row === 0 ? 1 : 0, row === 1 ? 1 : 0, row === 2 ? 1 : 0, row === 3 ? 1 : 0
    ]);
    for (let column = 0; column < 4; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < 4; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (Math.abs(rows[pivot][column]) < 1e-12) return null;
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      rows[column] = rows[column].map(value => value / divisor);
      for (let row = 0; row < 4; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        if (!factor) continue;
        rows[row] = rows[row].map((value, index) => value - factor * rows[column][index]);
      }
    }
    const out = new Float64Array(16);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        out[column * 4 + row] = rows[row][4 + column];
      }
    }
    return out;
  }

  function transform4(matrix, vector) {
    return [0, 1, 2, 3].map(row =>
      matrix[row] * vector[0] + matrix[4 + row] * vector[1] +
      matrix[8 + row] * vector[2] + matrix[12 + row] * vector[3]);
  }

  function dividePoint(vector) {
    if (!vector || !Number.isFinite(vector[3]) || Math.abs(vector[3]) < 1e-9) return null;
    return [vector[0] / vector[3], vector[1] / vector[3], vector[2] / vector[3]];
  }

  function cursorRay(view, projection, mouseX, mouseY, width, height) {
    if (!view || !projection || !width || !height) return null;
    const invView = invert4(view);
    const invViewProjection = invert4(multiply4(projection, view));
    if (!invView || !invViewProjection) return null;
    const eye = dividePoint(transform4(invView, [0, 0, 0, 1]));
    const nx = Number(mouseX) / Number(width) * 2 - 1;
    const ny = 1 - Number(mouseY) / Number(height) * 2;
    const far = dividePoint(transform4(invViewProjection, [nx, ny, 1, 1]));
    if (!eye || !far) return null;
    const direction = far.map((value, index) => value - eye[index]);
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length < 1e-9) return null;
    return { origin: eye, direction: direction.map(value => value / length) };
  }

  function projectPoint(point, view, projection, width, height) {
    const clip = transform4(multiply4(projection, view), [point[0], point[1], point[2], 1]);
    if (!Number.isFinite(clip[3]) || clip[3] <= 0.0001) return null;
    const ndc = dividePoint(clip);
    if (!ndc) return null;
    return {
      x: (ndc[0] + 1) * Number(width) / 2,
      y: (1 - ndc[1]) * Number(height) / 2,
      depth: ndc[2],
      visible: Math.abs(ndc[0]) <= 1.2 && Math.abs(ndc[1]) <= 1.2 &&
        ndc[2] >= -1.2 && ndc[2] <= 1.2
    };
  }

  function raycast(occupied, origin, direction, maxDistance = 40) {
    if (!(occupied instanceof Set) || !origin || !direction) return null;
    const position = origin.map(value => Number(value) + 0.5);
    const cell = position.map(Math.floor);
    const step = [0, 0, 0];
    const tMax = [0, 0, 0];
    const tDelta = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      if (direction[axis] > 0) {
        step[axis] = 1;
        tDelta[axis] = 1 / direction[axis];
        tMax[axis] = (cell[axis] + 1 - position[axis]) * tDelta[axis];
      } else if (direction[axis] < 0) {
        step[axis] = -1;
        tDelta[axis] = -1 / direction[axis];
        tMax[axis] = (position[axis] - cell[axis]) * tDelta[axis];
      } else {
        tDelta[axis] = Infinity;
        tMax[axis] = Infinity;
      }
    }
    let previous = null;
    let distance = 0;
    for (let index = 0; index < 1024 && distance <= maxDistance; index += 1) {
      if (index > 0 && cell[2] >= 0 && occupied.has(cellKey(cell))) {
        return { hit: cell.slice(), before: previous, distance };
      }
      previous = cell.slice();
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) :
        (tMax[1] < tMax[2] ? 1 : 2);
      cell[axis] += step[axis];
      distance = tMax[axis];
      tMax[axis] += tDelta[axis];
    }
    return null;
  }

  function usable(occupied, action, cell) {
    const filled = occupied.has(cellKey(cell));
    return action === "break" ? filled : !filled;
  }

  function forwardStep(origin, playerCell, direction) {
    // Prefer where the camera is looking: it matches what the player sees in
    // the preview. Player-to-block only decides when looking straight down.
    if (direction && Math.max(Math.abs(direction[0]), Math.abs(direction[1])) > 0.05) {
      if (Math.abs(direction[0]) >= Math.abs(direction[1])) return [direction[0] >= 0 ? 1 : -1, 0];
      return [0, direction[1] >= 0 ? 1 : -1];
    }
    if (playerCell) {
      const dx = origin[0] - playerCell[0];
      const dy = origin[1] - playerCell[1];
      if (Math.abs(dx) > Math.abs(dy) && dx) return [dx > 0 ? 1 : -1, 0];
      if (Math.abs(dy) > Math.abs(dx) && dy) return [0, dy > 0 ? 1 : -1];
    }
    if (direction) {
      if (Math.abs(direction[0]) > Math.abs(direction[1])) return [direction[0] >= 0 ? 1 : -1, 0];
      if (Math.abs(direction[1]) > 1e-6) return [0, direction[1] >= 0 ? 1 : -1];
    }
    return null;
  }

  function planCells(origin, options) {
    options = options || {};
    const occupied = options.occupied instanceof Set ? options.occupied : new Set();
    const action = options.action === "build" ? "build" : "break";
    const mode = Object.prototype.hasOwnProperty.call(MODE_CAPS, options.mode) ? options.mode : "forward";
    const count = Math.max(2, Math.min(MODE_CAPS[mode], Math.round(Number(options.count) || 6)));
    const start = origin.map(value => Math.trunc(Number(value)));
    const candidates = [];
    if (mode === "down") {
      for (let index = 1; index < count; index += 1) {
        candidates.push([start[0], start[1], start[2] + index]);
      }
    } else if (mode === "group") {
      for (const offset of groupOffsets(options.normal)) {
        candidates.push(start.map((value, axis) => value + offset[axis]));
      }
    } else {
      const step = Array.isArray(options.step) ? options.step :
        forwardStep(start, options.playerCell, options.direction);
      if (!step) return { cells: [], stoppedAt: null, direction: null, error: "Move or aim sideways once to set the forward direction." };
      for (let index = 1; index < count; index += 1) {
        candidates.push([start[0] + step[0] * index, start[1] + step[1] * index, start[2]]);
      }
    }
    const cells = [];
    let stoppedAt = null;
    for (const cell of candidates) {
      const valid = cell[0] >= 0 && cell[1] >= 0 && cell[2] >= 0 && cell[2] <= WORLD_BOTTOM_Z;
      if (!valid || !usable(occupied, action, cell)) {
        if (mode !== "group") {
          stoppedAt = cell;
          break;
        }
        continue;
      }
      cells.push(cell);
      if (cells.length >= count - 1) break;
    }
    const step = mode === "forward" ? (Array.isArray(options.step) ? options.step :
      forwardStep(start, options.playerCell, options.direction)) : null;
    return { cells, stoppedAt, step, direction: mode === "down" ? [0, 0, 1] : null, error: null };
  }

  function distance3(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  // The server only accepts break/place packets near the player's last
  // announced position (the Python builder uses reach 3). Line modes stop at
  // the first out-of-reach cell so they never skip ahead; 3x3 just drops them.
  function splitByReach(cells, player, reach, mode) {
    if (!player || !Number.isFinite(Number(reach)) || reach <= 0) {
      return { cells: cells.slice(), far: [] };
    }
    const near = [];
    const far = [];
    let blocked = false;
    for (const cell of cells) {
      if (!blocked && distance3(cell, player) <= reach) {
        near.push(cell);
      } else {
        far.push(cell);
        if (mode !== "group") blocked = true;
      }
    }
    return { cells: near, far };
  }

  // --- World alignment -------------------------------------------------------
  // Grid cells are drawn as unit cubes centred on cell + offset in the game's
  // world units. The browser client's offset isn't known up front, so it is
  // learned from real breaks: the cursor ray the game used must pass through
  // the cube of the block it actually broke.
  const ALIGN_STEPS = [-0.5, 0, 0.5];
  const ALIGN_CANDIDATES = [];
  for (const ox of ALIGN_STEPS) {
    for (const oy of ALIGN_STEPS) {
      for (const oz of ALIGN_STEPS) ALIGN_CANDIDATES.push([ox, oy, oz]);
    }
  }

  function rayHitsBox(ray, center, half = 0.5) {
    let near = 0;
    let far = Infinity;
    for (let axis = 0; axis < 3; axis += 1) {
      const o = ray.origin[axis];
      const d = ray.direction[axis];
      const lo = center[axis] - half;
      const hi = center[axis] + half;
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) return false;
        continue;
      }
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      near = Math.max(near, t1);
      far = Math.min(far, t2);
      if (near > far) return false;
    }
    return true;
  }

  function rayPointDistance(ray, point) {
    const v = point.map((value, axis) => value - ray.origin[axis]);
    const t = Math.max(0, v[0] * ray.direction[0] + v[1] * ray.direction[1] + v[2] * ray.direction[2]);
    return Math.hypot(...v.map((value, axis) => value - ray.direction[axis] * t));
  }

  // For each candidate offset: is `cell` the FIRST occupied block along the
  // ray? Computed when the break happens (the cell is still in the grid then).
  function alignmentMatches(occupied, ray, cell) {
    const key = cellKey(cell);
    return ALIGN_CANDIDATES.map(offset => {
      const origin = ray.origin.map((value, axis) => value - offset[axis]);
      const hit = raycast(occupied, origin, ray.direction, 80);
      return !!hit && cellKey(hit.hit) === key;
    });
  }

  // samples: [{ ray: {origin, direction}, cell: [x,y,z], matches? }] in world units.
  // Returns the offset whose cubes the most rays pass through (ties go to the
  // candidate whose centres sit closest to the rays), or null without data.
  function bestAlignment(samples) {
    if (!Array.isArray(samples) || !samples.length) return null;
    let best = null;
    const scores = [];
    ALIGN_CANDIDATES.forEach((offset, index) => {
      let hits = 0;
      let spread = 0;
      for (const sample of samples) {
        const center = sample.cell.map((value, axis) => value + offset[axis]);
        const hit = Array.isArray(sample.matches) ? sample.matches[index] : rayHitsBox(sample.ray, center);
        if (hit) hits += 1;
        spread += rayPointDistance(sample.ray, center);
      }
      scores.push(hits);
      if (!best || hits > best.hits || (hits === best.hits && spread < best.spread - 1e-9)) {
        best = { offset: offset.slice(), hits, spread };
      }
    });
    // unique: no other offset explains the breaks equally well.
    const unique = scores.filter(hits => hits === best.hits).length === 1;
    return { offset: best.offset, hits: best.hits, samples: samples.length, unique };
  }

  function translation(offset) {
    const out = new Float64Array(16);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    out[12] = offset[0]; out[13] = offset[1]; out[14] = offset[2];
    return out;
  }

  function preview(occupied, ray, options) {
    const hit = ray && raycast(occupied, ray.origin, ray.direction, options && options.maxDistance || 40);
    if (!hit) return { hit: null, origin: null, cells: [], targets: [] };
    const action = options && options.action === "build" ? "build" : "break";
    const origin = action === "build" ? hit.before : hit.hit;
    if (!origin) return { hit, origin: null, cells: [], targets: [] };
    // Face normal of the hit block, pointing back toward the camera.
    const normal = hit.before ? hit.before.map((value, axis) => value - hit.hit[axis]) : [0, 0, -1];
    const plan = planCells(origin, { ...options, occupied, direction: ray.direction, normal });
    return { hit, origin, normal, ...plan, targets: [origin, ...plan.cells] };
  }

  return {
    GROUP_OFFSETS,
    groupOffsets,
    MODE_CAPS,
    WORLD_BOTTOM_Z,
    alignmentMatches,
    bestAlignment,
    cellKey,
    cursorRay,
    rayHitsBox,
    translation,
    distance3,
    splitByReach,
    forwardStep,
    invert4,
    multiply4,
    planCells,
    preview,
    projectPoint,
    raycast,
    transform4
  };
});
