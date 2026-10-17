// Painting + selection operations that mutate a raster layer's ImageData.

import type { RasterLayer, DocumentModel, Selection } from './types';
import { hexToRgb } from './document';
import { uid } from './id';

export interface StrokePoint {
  x: number; // document coords
  y: number;
  pressure: number; // 0..1
}

// Paint a single stamp of a soft round brush at (x,y) on the layer's ImageData.
// coordinates are relative to the layer's top-left.
export function paintStamp(
  data: ImageData,
  x: number,
  y: number,
  size: number,
  hardness: number,
  opacity: number,
  color: { r: number; g: number; b: number },
  erase = false,
): void {
  const r = size / 2;
  const r2 = r * r;
  const hard = hardness;
  const x0 = Math.floor(x - r);
  const x1 = Math.ceil(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.ceil(y + r);
  const w = data.width;
  const h = data.height;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const dx = xx - x;
      const dy = yy - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const dist = Math.sqrt(dist2);
      const t = dist / r; // 0 center, 1 edge
      // soft falloff
      let falloff: number;
      if (t < hard) {
        falloff = 1;
      } else {
        falloff = 1 - (t - hard) / (1 - hard);
      }
      const a = falloff * opacity;
      const i = (yy * w + xx) * 4;
      if (erase) {
        data.data[i + 3] = Math.max(0, data.data[i + 3] - a * 255);
      } else {
        // over blend
        const sa = a;
        const da = data.data[i + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA > 0) {
          data.data[i] = (color.r * sa + data.data[i] * da * (1 - sa)) / outA;
          data.data[i + 1] = (color.g * sa + data.data[i + 1] * da * (1 - sa)) / outA;
          data.data[i + 2] = (color.b * sa + data.data[i + 2] * da * (1 - sa)) / outA;
        }
        data.data[i + 3] = outA * 255;
      }
    }
  }
}

// Paint a stroke (sequence of points) with interpolation between points.
export function paintStroke(
  data: ImageData,
  points: StrokePoint[],
  size: number,
  hardness: number,
  opacity: number,
  colorHex: string,
  erase = false,
): void {
  if (points.length === 0) return;
  const color = hexToRgb(colorHex);
  if (points.length === 1) {
    paintStamp(data, points[0].x, points[0].y, size, hardness, opacity * (points[0].pressure ?? 1), color, erase);
    return;
  }
  // spacing-based interpolation
  const spacing = Math.max(1, size * 0.15);
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      const p = (p0.pressure ?? 1) + ((p1.pressure ?? 1) - (p0.pressure ?? 1)) * t;
      paintStamp(data, x, y, size, hardness, opacity * p, color, erase);
    }
  }
}

// Convert document coords to layer-local coords.
export function docToLayer(layer: RasterLayer, x: number, y: number): { x: number; y: number } {
  return { x: x - layer.x, y: y - layer.y };
}

// --- Selections ---

export function createRectSelection(
  doc: DocumentModel,
  x: number,
  y: number,
  w: number,
  h: number,
  feather = 0,
): Selection {
  const data = new ImageData(doc.width, doc.height);
  for (let yy = 0; yy < doc.height; yy++) {
    for (let xx = 0; xx < doc.width; xx++) {
      const inside = xx >= x && xx < x + w && yy >= y && yy < y + h;
      if (inside) {
        const i = (yy * doc.width + xx) * 4;
        data.data[i] = 255;
      }
    }
  }
  if (feather > 0) {
    const blurred = featherSelection(data, feather);
    return { id: uid('sel'), data: blurred, feather };
  }
  return { id: uid('sel'), data, feather };
}

export function createEllipseSelection(
  doc: DocumentModel,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  feather = 0,
): Selection {
  const data = new ImageData(doc.width, doc.height);
  for (let yy = 0; yy < doc.height; yy++) {
    for (let xx = 0; xx < doc.width; xx++) {
      const nx = (xx - cx) / (rx || 1);
      const ny = (yy - cy) / (ry || 1);
      if (nx * nx + ny * ny <= 1) {
        const i = (yy * doc.width + xx) * 4;
        data.data[i] = 255;
      }
    }
  }
  if (feather > 0) {
    return { id: uid('sel'), data: featherSelection(data, feather), feather };
  }
  return { id: uid('sel'), data, feather };
}

export function createLassoSelection(
  doc: DocumentModel,
  points: { x: number; y: number }[],
  feather = 0,
): Selection {
  const data = new ImageData(doc.width, doc.height);
  // fill polygon via scanline
  if (points.length < 3) {
    return { id: uid('sel'), data, feather };
  }
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(doc.height - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(doc.width - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) {
        data.data[(y * doc.width + x) * 4] = 255;
      }
    }
  }
  if (feather > 0) {
    return { id: uid('sel'), data: featherSelection(data, feather), feather };
  }
  return { id: uid('sel'), data, feather };
}

// Magic wand: flood-fill selection from a seed on the composite's color.
export function magicWandSelection(
  doc: DocumentModel,
  composite: ImageData,
  seedX: number,
  seedY: number,
  tolerance: number,
  feather = 0,
): Selection {
  const w = doc.width;
  const h = doc.height;
  const data = new ImageData(w, h);
  if (seedX < 0 || seedY < 0 || seedX >= w || seedY >= h) {
    return { id: uid('sel'), data, feather };
  }
  const seedI = (seedY * w + seedX) * 4;
  const sr = composite.data[seedI];
  const sg = composite.data[seedI + 1];
  const sb = composite.data[seedI + 2];
  const tol = tolerance * 3; // total channel diff
  const visited = new Uint8Array(w * h);
  const stack: number[] = [seedY * w + seedX];
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const x = idx % w;
    const y = Math.floor(idx / w);
    const i = idx * 4;
    const diff =
      Math.abs(composite.data[i] - sr) +
      Math.abs(composite.data[i + 1] - sg) +
      Math.abs(composite.data[i + 2] - sb);
    if (diff > tol) continue;
    data.data[i] = 255;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  if (feather > 0) {
    return { id: uid('sel'), data: featherSelection(data, feather), feather };
  }
  return { id: uid('sel'), data, feather };
}

// Simple box-blur feather for selection masks.
function featherSelection(data: ImageData, radius: number): ImageData {
  const r = Math.max(1, Math.round(radius));
  const w = data.width;
  const h = data.height;
  const tmp = new Uint8ClampedArray(data.data);
  const out = new Uint8ClampedArray(data.data);
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += tmp[(y * w + xx) * 4];
        n++;
      }
      out[(y * w + x) * 4] = acc / n;
    }
  }
  tmp.set(out);
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[(yy * w + x) * 4];
        n++;
      }
      out[(y * w + x) * 4] = acc / n;
    }
  }
  return new ImageData(out, w, h);
}

// Paint a single stamp onto a layer mask. Paint white (value 255) to reveal
// or black (value 0) to hide. Writes the R channel of the mask ImageData.
export function paintMaskStamp(
  mask: ImageData,
  x: number,
  y: number,
  size: number,
  hardness: number,
  opacity: number,
  value: number, // 0..255 target mask value
): void {
  const r = size / 2;
  const r2 = r * r;
  const x0 = Math.floor(x - r);
  const x1 = Math.ceil(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.ceil(y + r);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (xx < 0 || yy < 0 || xx >= mask.width || yy >= mask.height) continue;
      const dx = xx - x;
      const dy = yy - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const t = Math.sqrt(dist2) / r;
      const falloff = t < hardness ? 1 : 1 - (t - hardness) / (1 - hardness);
      const a = falloff * opacity;
      const i = (yy * mask.width + xx) * 4;
      const cur = mask.data[i];
      mask.data[i] = cur * (1 - a) + value * a;
      mask.data[i + 1] = mask.data[i];
      mask.data[i + 2] = mask.data[i];
      mask.data[i + 3] = 255;
    }
  }
}

// Paint a stroke onto a layer mask with interpolation between points.
export function paintMaskStroke(
  mask: ImageData,
  points: StrokePoint[],
  size: number,
  hardness: number,
  opacity: number,
  value: number,
): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    paintMaskStamp(mask, points[0].x, points[0].y, size, hardness, opacity * (points[0].pressure ?? 1), value);
    return;
  }
  const spacing = Math.max(1, size * 0.15);
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      const p = (p0.pressure ?? 1) + ((p1.pressure ?? 1) - (p0.pressure ?? 1)) * t;
      paintMaskStamp(mask, x, y, size, hardness, opacity * p, value);
    }
  }
}

// Paint bucket fill on a layer.
export function paintBucketFill(
  layer: RasterLayer,
  seedX: number,
  seedY: number,
  colorHex: string,
  tolerance: number,
): void {
  const data = layer.data;
  const w = data.width;
  const h = data.height;
  const lx = seedX - layer.x;
  const ly = seedY - layer.y;
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
  const si = (ly * w + lx) * 4;
  const sr = data.data[si];
  const sg = data.data[si + 1];
  const sb = data.data[si + 2];
  const sa = data.data[si + 3];
  const { r, g, b } = hexToRgb(colorHex);
  const tol = tolerance * 4;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [ly * w + lx];
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const x = idx % w;
    const y = Math.floor(idx / w);
    const i = idx * 4;
    const diff =
      Math.abs(data.data[i] - sr) +
      Math.abs(data.data[i + 1] - sg) +
      Math.abs(data.data[i + 2] - sb) +
      Math.abs(data.data[i + 3] - sa);
    if (diff > tol) continue;
    data.data[i] = r;
    data.data[i + 1] = g;
    data.data[i + 2] = b;
    data.data[i + 3] = 255;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
}
