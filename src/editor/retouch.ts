// Professional retouching tools: clone stamp, dodge/burn, smudge, curves.

// ---- Clone stamp ----

let cloneSource: { x: number; y: number } | null = null;

export function setCloneSource(x: number, y: number): void {
  cloneSource = { x, y };
}

export function hasCloneSource(): boolean {
  return cloneSource !== null;
}

export function getCloneSource(): { x: number; y: number } | null {
  return cloneSource;
}

export function clearCloneSource(): void {
  cloneSource = null;
}

/**
 * Clone-stamp: copies pixels onto (x, y) from the region offset by origin.
 * origin is (brush point - source point); the copied region tracks the brush.
 */
export function cloneStamp(
  data: ImageData,
  x: number,
  y: number,
  size: number,
  hardness: number,
  flow: number,
  origin: { dx: number; dy: number },
): void {
  const r = size / 2;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      const t = dist / r;
      const falloff = t < hardness ? 1 : 1 - (t - hardness) / (1 - hardness);
      const a = falloff * flow;
      const tx = Math.round(x + dx);
      const ty = Math.round(y + dy);
      const sx = Math.round(tx - origin.dx);
      const sy = Math.round(ty - origin.dy);
      if (sx < 0 || sy < 0 || sx >= data.width || sy >= data.height) continue;
      if (tx < 0 || ty < 0 || tx >= data.width || ty >= data.height) continue;
      const si = (sy * data.width + sx) * 4;
      const ti = (ty * data.width + tx) * 4;
      for (let c = 0; c < 4; c++) {
        data.data[ti + c] = data.data[ti + c] * (1 - a) + data.data[si + c] * a;
      }
    }
  }
}

// ---- Dodge / Burn ----

export type DodgeMode = 'dodge' | 'burn';

export function dodgeBurn(
  data: ImageData,
  x: number,
  y: number,
  size: number,
  hardness: number,
  exposure: number, // 0..1
  mode: DodgeMode,
): void {
  const r = size / 2;
  const strength = mode === 'dodge' ? exposure : -exposure;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      const t = dist / r;
      const falloff = t < hardness ? 1 : 1 - (t - hardness) / (1 - hardness);
      const s = strength * falloff;
      const px = Math.round(x + dx);
      const py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= data.width || py >= data.height) continue;
      const i = (py * data.width + px) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data.data[i + c] / 255;
        // dodge: brighter; burn: darker (gamma-style)
        const out = mode === 'dodge' ? v + (1 - v) * s : v * (1 + s * 0.9);
        data.data[i + c] = Math.max(0, Math.min(255, out * 255));
      }
    }
  }
}

// ---- Smudge ----

export function smudge(
  data: ImageData,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
  strength: number,
): void {
  const r = size / 2;
  const grabbed = new Uint8ClampedArray(
    // sample a square around the "from" point
    sampleRegion(data, Math.round(fromX), Math.round(fromY), Math.ceil(r) * 2 + 2),
  );
  const grabW = Math.ceil(r) * 2 + 2;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      const t = dist / r;
      const falloff = 1 - t;
      const a = falloff * strength;
      const gx = Math.round(r + dx);
      const gy = Math.round(r + dy);
      if (gx < 0 || gy < 0 || gx >= grabW || gy >= grabW) continue;
      const tx = Math.round(toX + dx);
      const ty = Math.round(toY + dy);
      if (tx < 0 || ty < 0 || tx >= data.width || ty >= data.height) continue;
      const gi = (gy * grabW + gx) * 4;
      const ti = (ty * data.width + tx) * 4;
      for (let c = 0; c < 4; c++) {
        data.data[ti + c] = data.data[ti + c] * (1 - a) + grabbed[gi + c] * a;
      }
    }
  }
}

function sampleRegion(data: ImageData, cx: number, cy: number, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = cx - half + x;
      const sy = cy - half + y;
      const oi = (y * size + x) * 4;
      if (sx < 0 || sy < 0 || sx >= data.width || sy >= data.height) continue;
      const si = (sy * data.width + sx) * 4;
      out[oi] = data.data[si];
      out[oi + 1] = data.data[si + 1];
      out[oi + 2] = data.data[si + 2];
      out[oi + 3] = data.data[si + 3];
    }
  }
  return out;
}

// ---- Curves ----

export interface CurvePoint {
  x: number; // 0..255 input
  y: number; // 0..255 output
}

export function buildCurveLut(points: CurvePoint[]): Uint8ClampedArray {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8ClampedArray(256);
  if (sorted.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  let pi = 0;
  for (let i = 0; i < 256; i++) {
    // find segment
    while (pi < sorted.length - 2 && sorted[pi + 1].x < i) pi++;
    const p0 = sorted[pi];
    const p1 = sorted[Math.min(pi + 1, sorted.length - 1)];
    if (i <= p0.x) {
      lut[i] = p0.y;
    } else if (i >= p1.x) {
      lut[i] = p1.y;
    } else {
      // Catmull-Rom-ish smooth interpolation between neighbors
      const prev = sorted[Math.max(0, pi - 1)];
      const next = sorted[Math.min(sorted.length - 1, pi + 2)];
      lut[i] = catmullRom(prev.x, prev.y, p0.x, p0.y, p1.x, p1.y, next.x, next.y, i);
    }
  }
  return lut;
}

function catmullRom(
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
  x: number,
): number {
  // Convert to parametric t in [0,1] over segment [x1,x2]
  const t = (x - x1) / (x2 - x1 || 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const y =
    0.5 *
    ((2 * y1) +
      (-y0 + y2) * t +
      (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
      (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
  return Math.max(0, Math.min(255, Math.round(y)));
}

export function applyCurveLut(data: ImageData, lut: Uint8ClampedArray): void {
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = lut[data.data[i]];
    data.data[i + 1] = lut[data.data[i + 1]];
    data.data[i + 2] = lut[data.data[i + 2]];
  }
}
