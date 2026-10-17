// Canvas renderer: composites all visible layers into a target canvas context.
// Handles checkerboard transparency, layer transforms, masks, blend modes,
// text rasterization, and adjustment layers.

import type { DocumentModel, Layer, RasterLayer, TextLayer, AdjustmentLayer, AdjustmentSettings } from './types';
import { compositeTile } from './blend';
import { hexToRgb } from './document';
import { hasVisibleStyle, renderStyleUnderlay } from './layerStyles';

// Draw the transparency checkerboard into a context for the given rect.
export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  size = 12,
): void {
  const light = '#c8c8c8';
  const dark = '#9a9a9a';
  ctx.save();
  for (let yy = 0; yy < h; yy += size) {
    for (let xx = 0; xx < w; xx += size) {
      const odd = ((xx / size) + (yy / size)) % 2 === 0;
      ctx.fillStyle = odd ? light : dark;
      ctx.fillRect(x + xx, y + yy, Math.min(size, w - xx), Math.min(size, h - yy));
    }
  }
  ctx.restore();
}

// Render a single layer into an offscreen canvas at document resolution.
function rasterizeLayer(layer: Layer, docWidth: number, docHeight: number): HTMLCanvasElement | null {
  if (layer.type === 'raster') {
    return rasterizeRaster(layer as RasterLayer);
  }
  if (layer.type === 'text') {
    return rasterizeText(layer as TextLayer);
  }
  if (layer.type === 'adjustment') {
    return null; // adjustments applied during composite, not rasterized
  }
  return null;
}

function rasterizeRaster(layer: RasterLayer): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = layer.width;
  c.height = layer.height;
  const cx = c.getContext('2d')!;
  cx.putImageData(layer.data, 0, 0);
  return c;
}

function rasterizeText(layer: TextLayer): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, layer.width);
  c.height = Math.max(1, layer.height);
  const cx = c.getContext('2d')!;
  cx.font = `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  cx.fillStyle = layer.color;
  cx.textBaseline = 'top';
  const lines = layer.text.split('\n');
  const lineH = layer.fontSize * layer.lineHeight;
  lines.forEach((line, i) => {
    const y = i * lineH;
    let x = 0;
    cx.textAlign = layer.align;
    if (layer.align === 'center') x = layer.width / 2;
    if (layer.align === 'right') x = layer.width;
    cx.fillText(line, x, y);
  });
  return c;
}

// Apply an adjustment to a pixel buffer (RGBA8), returning new ImageData.
export function applyAdjustment(
  src: ImageData,
  adj: AdjustmentSettings,
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const brightness = adj.brightness / 100;
  const contrast = (adj.contrast + 100) / 100; // 0..2
  const hue = adj.hue;
  const sat = 1 + adj.saturation / 100;
  const light = adj.lightness / 100;
  const blackP = adj.blackPoint;
  const whiteP = adj.whitePoint;
  const scale = 255 / (whiteP - blackP || 1);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (adj.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    if (adj.kind === 'levels' || adj.blackPoint > 0 || adj.whitePoint < 255) {
      r = clamp255((r - blackP) * scale);
      g = clamp255((g - blackP) * scale);
      b = clamp255((b - blackP) * scale);
    }
    if (brightness !== 0) {
      r += brightness * 255;
      g += brightness * 255;
      b += brightness * 255;
    }
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }
    if (hue !== 0 || sat !== 1 || light !== 0) {
      const hsl = rgbToHsl(r, g, b);
      hsl[0] = (hsl[0] + hue / 360 + 1) % 1;
      hsl[1] = clamp01(hsl[1] * sat);
      hsl[2] = clamp01(hsl[2] + light);
      const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
      r = rgb[0];
      g = rgb[1];
      b = rgb[2];
    }
    if (adj.grayscale) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = g = b = lum;
    }
    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  return out;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3) * 255,
    hueToRgb(p, q, h) * 255,
    hueToRgb(p, q, h - 1 / 3) * 255,
  ];
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

// Composite the full document into a target ImageData at full resolution.
export function compositeDocument(doc: DocumentModel): ImageData {
  const w = doc.width;
  const h = doc.height;
  const composite = new ImageData(w, h);
  // composite.data is zero-initialized (transparent)

  for (const layer of doc.layers) {
    if (!layer.visible) continue;

    if (layer.type === 'adjustment') {
      const adj = (layer as AdjustmentLayer).adjustment;
      const adjusted = applyAdjustment(composite, adj);
      composite.data.set(adjusted.data);
      continue;
    }

    const raster = rasterizeLayer(layer, w, h);
    if (!raster) continue;
    const rctx = raster.getContext('2d')!;
    let layerImage = rctx.getImageData(0, 0, raster.width, raster.height);

    // apply mask if present
    if (layer.mask && layer.mask.enabled) {
      applyMaskToImageData(layerImage, layer.mask.data, layer.x, layer.y);
    }

    // blit layer into a doc-sized buffer at (x,y) then composite
    const layerBuf = new ImageData(w, h);
    const sx = Math.max(0, -layer.x);
    const sy = Math.max(0, -layer.y);
    const dx = Math.max(0, layer.x);
    const dy = Math.max(0, layer.y);
    const copyW = Math.min(raster.width - sx, w - dx);
    const copyH = Math.min(raster.height - sy, h - dy);
    if (copyW > 0 && copyH > 0) {
      for (let yy = 0; yy < copyH; yy++) {
        for (let xx = 0; xx < copyW; xx++) {
          const si = ((sy + yy) * raster.width + (sx + xx)) * 4;
          const di = ((dy + yy) * w + (dx + xx)) * 4;
          layerBuf.data[di] = layerImage.data[si];
          layerBuf.data[di + 1] = layerImage.data[si + 1];
          layerBuf.data[di + 2] = layerImage.data[si + 2];
          layerBuf.data[di + 3] = layerImage.data[si + 3];
        }
      }
    }

    compositeTile(
      composite.data,
      layerBuf.data,
      layer.blendMode,
      layer.opacity,
      w * h * 4,
    );

    // Layer styles render beneath the layer's own pixels (shadow/glow/stroke).
    if (layer.style && hasVisibleStyle(layer.style)) {
      const underlay = renderStyleUnderlay(layerBuf.data, w, h, layer.style);
      if (underlay) {
        compositeTile(composite.data, underlay, 'normal', 1, w * h * 4);
      }
    }
  }

  return composite;
}

function applyMaskToImageData(
  img: ImageData,
  mask: ImageData,
  offsetX: number,
  offsetY: number,
): void {
  const d = img.data;
  const mw = mask.width;
  const mh = mask.height;
  const iw = img.width;
  const ih = img.height;
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const mx = x + offsetX;
      const my = y + offsetY;
      if (mx < 0 || my < 0 || mx >= mw || my >= mh) continue;
      const mi = (my * mw + mx) * 4;
      const maskVal = mask.data[mi] / 255; // R channel
      const ii = (y * iw + x) * 4;
      d[ii + 3] = Math.round(d[ii + 3] * maskVal);
    }
  }
}

// Render the composite to a display canvas at the given zoom, with checkerboard.
export function renderToDisplay(
  doc: DocumentModel,
  ctx: CanvasRenderingContext2D,
  displayCanvas: HTMLCanvasElement,
  zoom: number,
): void {
  const w = doc.width;
  const h = doc.height;
  displayCanvas.width = Math.max(1, Math.round(w * zoom));
  displayCanvas.height = Math.max(1, Math.round(h * zoom));

  ctx.imageSmoothingEnabled = zoom < 1;
  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

  // checkerboard
  const checker = document.createElement('canvas');
  checker.width = displayCanvas.width;
  checker.height = displayCanvas.height;
  const cctx = checker.getContext('2d')!;
  const cSize = Math.max(6, Math.round(12 * zoom));
  drawCheckerboard(cctx, 0, 0, displayCanvas.width, displayCanvas.height, cSize);
  ctx.drawImage(checker, 0, 0);

  // composite
  const composite = compositeDocument(doc);
  const compCanvas = document.createElement('canvas');
  compCanvas.width = w;
  compCanvas.height = h;
  compCanvas.getContext('2d')!.putImageData(composite, 0, 0);
  ctx.drawImage(compCanvas, 0, 0, displayCanvas.width, displayCanvas.height);

  // selection overlay
  if (doc.selection) {
    drawSelectionOverlay(ctx, doc, zoom);
  }
}

export function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  doc: DocumentModel,
  zoom: number,
): void {
  if (!doc.selection) return;
  const sel = doc.selection.data;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  // Draw marching-ants outline by tracing edges where mask==255
  // Simpler approach: draw the selection as a semi-transparent outline image
  const selCanvas = document.createElement('canvas');
  selCanvas.width = doc.width;
  selCanvas.height = doc.height;
  const sctx = selCanvas.getContext('2d')!;
  const edgeData = sctx.createImageData(doc.width, doc.height);
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const i = (y * doc.width + x) * 4;
      const v = sel.data[i];
      const isEdge =
        v > 128 &&
        (x === 0 || y === 0 ||
          x === doc.width - 1 || y === doc.height - 1 ||
          sel.data[i - 4] <= 128 ||
          sel.data[i + 4] <= 128 ||
          sel.data[i - doc.width * 4] <= 128 ||
          sel.data[i + doc.width * 4] <= 128);
      if (isEdge) {
        edgeData.data[i] = 255;
        edgeData.data[i + 1] = 255;
        edgeData.data[i + 2] = 255;
        edgeData.data[i + 3] = 255;
      }
    }
  }
  sctx.putImageData(edgeData, 0, 0);
  ctx.drawImage(selCanvas, 0, 0, doc.width * zoom, doc.height * zoom);
  ctx.restore();
}
