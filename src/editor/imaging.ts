// Image processing utilities: filters run on ImageData.

import type { AdjustmentSettings } from './types';
import { applyAdjustment } from './renderer';

export function gaussianBlur(src: ImageData, radius: number): ImageData {
  if (radius <= 0) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const r = Math.max(1, Math.round(radius));
  const kernel = buildGaussianKernel(r);
  const w = src.width;
  const h = src.height;
  const tmp = new Uint8ClampedArray(src.data);
  const out = new Uint8ClampedArray(src.data);
  // horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = [0, 0, 0, 0];
      let wsum = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const kw = kernel[k + r];
        const i = (y * w + xx) * 4;
        acc[0] += tmp[i] * kw;
        acc[1] += tmp[i + 1] * kw;
        acc[2] += tmp[i + 2] * kw;
        acc[3] += tmp[i + 3] * kw;
        wsum += kw;
      }
      const oi = (y * w + x) * 4;
      out[oi] = acc[0] / wsum;
      out[oi + 1] = acc[1] / wsum;
      out[oi + 2] = acc[2] / wsum;
      out[oi + 3] = acc[3] / wsum;
    }
  }
  // vertical pass
  tmp.set(out);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = [0, 0, 0, 0];
      let wsum = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const kw = kernel[k + r];
        const i = (yy * w + x) * 4;
        acc[0] += tmp[i] * kw;
        acc[1] += tmp[i + 1] * kw;
        acc[2] += tmp[i + 2] * kw;
        acc[3] += tmp[i + 3] * kw;
        wsum += kw;
      }
      const oi = (y * w + x) * 4;
      out[oi] = acc[0] / wsum;
      out[oi + 1] = acc[1] / wsum;
      out[oi + 2] = acc[2] / wsum;
      out[oi + 3] = acc[3] / wsum;
    }
  }
  return new ImageData(out, w, h);
}

function buildGaussianKernel(radius: number): number[] {
  const sigma = radius / 2;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  return kernel.map((v) => v / sum);
}

export function boxBlur(src: ImageData, radius: number): ImageData {
  if (radius <= 0) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const r = Math.max(1, Math.round(radius));
  const w = src.width;
  const h = src.height;
  const tmp = new Uint8ClampedArray(src.data);
  const out = new Uint8ClampedArray(src.data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let [cr, cg, cb, ca, n] = [0, 0, 0, 0, 0];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const i = (yy * w + xx) * 4;
          cr += tmp[i];
          cg += tmp[i + 1];
          cb += tmp[i + 2];
          ca += tmp[i + 3];
          n++;
        }
      }
      const oi = (y * w + x) * 4;
      out[oi] = cr / n;
      out[oi + 1] = cg / n;
      out[oi + 2] = cb / n;
      out[oi + 3] = ca / n;
    }
  }
  return new ImageData(out, w, h);
}

export function sharpen(src: ImageData, amount: number): ImageData {
  const amountClamped = Math.max(0, amount);
  const w = src.width;
  const h = src.height;
  const out = new Uint8ClampedArray(src.data);
  const kernel = [0, -1, 0, -1, 4 + 1 / Math.max(0.01, amountClamped) * 0, -1, 0, -1, 0];
  // simple sharpen kernel: center = 1 + 4*amount, neighbors = -amount
  const a = amountClamped;
  const center = 1 + 4 * a;
  const k = [0, -a, 0, -a, center, -a, 0, -a, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = ((y + dy) * w + (x + dx)) * 4 + c;
            acc += src.data[i] * k[ki++];
          }
        }
        const oi = (y * w + x) * 4 + c;
        out[oi] = Math.max(0, Math.min(255, acc));
      }
    }
  }
  return new ImageData(out, w, h);
}

export function pixelate(src: ImageData, size: number): ImageData {
  if (size <= 1) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const w = src.width;
  const h = src.height;
  const out = new Uint8ClampedArray(src.data);
  const s = Math.max(1, Math.round(size));
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      let [cr, cg, cb, ca, n] = [0, 0, 0, 0, 0];
      for (let dy = 0; dy < s && y + dy < h; dy++) {
        for (let dx = 0; dx < s && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          cr += src.data[i];
          cg += src.data[i + 1];
          cb += src.data[i + 2];
          ca += src.data[i + 3];
          n++;
        }
      }
      cr /= n; cg /= n; cb /= n; ca /= n;
      for (let dy = 0; dy < s && y + dy < h; dy++) {
        for (let dx = 0; dx < s && x + dx < w; dx++) {
          const oi = ((y + dy) * w + (x + dx)) * 4;
          out[oi] = cr;
          out[oi + 1] = cg;
          out[oi + 2] = cb;
          out[oi + 3] = ca;
        }
      }
    }
  }
  return new ImageData(out, w, h);
}

export function addNoise(src: ImageData, amount: number): ImageData {
  const out = new Uint8ClampedArray(src.data);
  const a = Math.max(0, amount);
  for (let i = 0; i < out.length; i += 4) {
    const n = (Math.random() - 0.5) * 2 * a;
    out[i] = Math.max(0, Math.min(255, out[i] + n));
    out[i + 1] = Math.max(0, Math.min(255, out[i + 1] + n));
    out[i + 2] = Math.max(0, Math.min(255, out[i + 2] + n));
  }
  return new ImageData(out, src.width, src.height);
}

export function edgeDetect(src: ImageData): ImageData {
  const w = src.width;
  const h = src.height;
  const out = new Uint8ClampedArray(src.data.length);
  const kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0;
      let gy = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          const gray = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3;
          gx += gray * kx[ki];
          gy += gray * ky[ki];
          ki++;
        }
      }
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      const oi = (y * w + x) * 4;
      out[oi] = mag;
      out[oi + 1] = mag;
      out[oi + 2] = mag;
      out[oi + 3] = src.data[(y * w + x) * 4 + 3];
    }
  }
  return new ImageData(out, w, h);
}

export function sepia(src: ImageData): ImageData {
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    out[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    out[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    out[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
  }
  return new ImageData(out, src.width, src.height);
}

export function invertImage(src: ImageData): ImageData {
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255 - out[i];
    out[i + 1] = 255 - out[i + 1];
    out[i + 2] = 255 - out[i + 2];
  }
  return new ImageData(out, src.width, src.height);
}

export function grayscaleImage(src: ImageData): ImageData {
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    const lum = 0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2];
    out[i] = out[i + 1] = out[i + 2] = lum;
  }
  return new ImageData(out, src.width, src.height);
}

// ---- Shape drawing ----

export function hexToRgba(hex: string): [number, number, number, number] {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function drawLine(
  data: ImageData,
  x0: number, y0: number, x1: number, y1: number,
  thickness: number, colorHex: string,
): void {
  const [r, g, b, a] = hexToRgba(colorHex);
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const half = thickness / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let dy = -Math.ceil(half); dy <= Math.ceil(half); dy++) {
      for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
        if (dx * dx + dy * dy > half * half) continue;
        setPixel(data, Math.round(cx + dx), Math.round(cy + dy), r, g, b, a);
      }
    }
  }
}

export function drawRect(
  data: ImageData,
  x0: number, y0: number, x1: number, y1: number,
  filled: boolean, thickness: number, colorHex: string,
): void {
  const [r, g, b, a] = hexToRgba(colorHex);
  const lx = Math.min(x0, x1), rx = Math.max(x0, x1);
  const ty = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = Math.floor(ty); y <= by; y++) {
    for (let x = Math.floor(lx); x <= rx; x++) {
      const onEdge =
        x <= lx + thickness || x >= rx - thickness ||
        y <= ty + thickness || y >= by - thickness;
      if (filled || onEdge) setPixel(data, x, y, r, g, b, a);
    }
  }
}

export function drawEllipse(
  data: ImageData,
  x0: number, y0: number, x1: number, y1: number,
  filled: boolean, colorHex: string,
): void {
  const [r, g, b, a] = hexToRgba(colorHex);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2 || 1;
  const ry = Math.abs(y1 - y0) / 2 || 1;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1) {
        if (filled) setPixel(data, x, y, r, g, b, a);
        else {
          // outline: only draw near the boundary band
          const inner = ((x - cx) / (rx - 1.5)) ** 2 + ((y - cy) / (ry - 1.5)) ** 2;
          if (inner > 1 || rx < 2 || ry < 2) setPixel(data, x, y, r, g, b, a);
        }
      }
    }
  }
}

function setPixel(data: ImageData, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
  const i = (y * data.width + x) * 4;
  data.data[i] = r;
  data.data[i + 1] = g;
  data.data[i + 2] = b;
  data.data[i + 3] = a;
}

// ---- Gradient ----

export type GradientType = 'linear' | 'radial';

export function applyGradient(
  data: ImageData,
  x0: number, y0: number, x1: number, y1: number,
  startHex: string, endHex: string,
  type: GradientType = 'linear',
  restrictTo?: ImageData, // selection mask (R channel), same dims as data
): void {
  const [sr, sg, sb] = hexToRgba(startHex);
  const [er, eg, eb] = hexToRgba(endHex);
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      if (restrictTo && restrictTo.data[(y * data.width + x) * 4] < 128) continue;
      let t: number;
      if (type === 'radial') {
        t = Math.hypot(x - x0, y - y0) / len;
      } else {
        // projection of (p - p0) onto (p1 - p0), normalized
        const dx = x1 - x0, dy = y1 - y0;
        t = ((x - x0) * dx + (y - y0) * dy) / (len * len);
      }
      t = Math.max(0, Math.min(1, t));
      const i = (y * data.width + x) * 4;
      data.data[i] = sr + (er - sr) * t;
      data.data[i + 1] = sg + (eg - sg) * t;
      data.data[i + 2] = sb + (eb - sb) * t;
      data.data[i + 3] = 255;
    }
  }
}

export { applyAdjustment };
