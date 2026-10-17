// Layer styles: non-destructive drop shadow, outer glow, and stroke effects.
// Effects are rendered by the compositor into doc-space buffers; the layer's
// own pixels are never modified.

export interface ShadowStyle {
  enabled: boolean;
  color: string; // hex
  offsetX: number; // px
  offsetY: number;
  blur: number; // px radius
  opacity: number; // 0..1
}

export interface GlowStyle {
  enabled: boolean;
  color: string;
  size: number; // px radius
  opacity: number;
}

export interface StrokeStyle {
  enabled: boolean;
  color: string;
  width: number; // px
  opacity: number;
}

export interface LayerStyle {
  shadow: ShadowStyle | null;
  glow: GlowStyle | null;
  stroke: StrokeStyle | null;
}

export const DEFAULT_LAYER_STYLE: LayerStyle = {
  shadow: null,
  glow: null,
  stroke: null,
};

export const DEFAULT_SHADOW: ShadowStyle = {
  enabled: true,
  color: '#000000',
  offsetX: 4,
  offsetY: 4,
  blur: 8,
  opacity: 0.6,
};

export const DEFAULT_GLOW: GlowStyle = {
  enabled: true,
  color: '#66aaff',
  size: 10,
  opacity: 0.7,
};

export const DEFAULT_STROKE: StrokeStyle = {
  enabled: true,
  color: '#000000',
  width: 3,
  opacity: 1,
};

export function hasVisibleStyle(style: LayerStyle | null | undefined): boolean {
  if (!style) return false;
  return Boolean(
    (style.shadow && style.shadow.enabled) ||
    (style.glow && style.glow.enabled) ||
    (style.stroke && style.stroke.enabled),
  );
}

function hexToRgbLocal(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Box-blur a single-channel (stored in R) buffer, in place on a copy.
function blurChannel(src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += src[y * w + xx];
        n++;
      }
      tmp[y * w + x] = acc / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x];
        n++;
      }
      out[y * w + x] = acc / n;
    }
  }
  return out;
}

// Max-filter (dilate) a single-channel buffer by radius — used for strokes.
function dilateChannel(src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = src[yy * w + xx];
          if (v > m) m = v;
        }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

// Extract the layer's alpha as a single channel from a doc-space RGBA buffer.
function alphaChannel(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = rgba[j + 3];
  return out;
}

// Write a colored, alpha-shaped effect into a doc-space RGBA buffer.
function paintEffect(
  target: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  w: number,
  h: number,
  color: [number, number, number],
  opacity: number,
): void {
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    const a = (alpha[i] / 255) * opacity * 255;
    const da = target[j + 3];
    // over-composite effect onto target (effects render below the layer,
    // so the target here only contains earlier effects)
    const outA = a + da * (1 - a / 255);
    if (outA > 0) {
      target[j] = (color[0] * a + target[j] * da * (1 - a / 255)) / outA;
      target[j + 1] = (color[1] * a + target[j + 1] * da * (1 - a / 255)) / outA;
      target[j + 2] = (color[2] * a + target[j + 2] * da * (1 - a / 255)) / outA;
    }
    target[j + 3] = outA;
  }
}

// Render the styled underlay (shadow, glow, stroke) for a layer into a
// doc-space RGBA buffer. `docBuf` is the layer blitted into doc space
// (docW*docH*4). Returns null when no effect is enabled.
export function renderStyleUnderlay(
  docBuf: Uint8ClampedArray,
  docW: number,
  docH: number,
  style: LayerStyle,
): Uint8ClampedArray | null {
  if (!hasVisibleStyle(style)) return null;

  // Effects are computed on a padded canvas so blur/dilation can extend
  // beyond the layer bounds without clipping at the layer edge.
  const pad = 64 + Math.max(
    style.shadow ? style.shadow.blur + Math.max(Math.abs(style.shadow.offsetX), Math.abs(style.shadow.offsetY)) : 0,
    style.glow ? style.glow.size : 0,
    style.stroke ? style.stroke.width : 0,
  );
  const w = docW + pad * 2;
  const h = docH + pad * 2;
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < docH; y++) {
    for (let x = 0; x < docW; x++) {
      alpha[(y + pad) * w + (x + pad)] = docBuf[(y * docW + x) * 4 + 3];
    }
  }

  const underlay = new Uint8ClampedArray(w * h * 4);

  if (style.stroke && style.stroke.enabled) {
    const dil = dilateChannel(alpha, w, h, Math.round(style.stroke.width));
    const [r, g, b] = hexToRgbLocal(style.stroke.color);
    paintEffect(underlay, dil, w, h, [r, g, b], style.stroke.opacity);
  }
  if (style.glow && style.glow.enabled) {
    const blurred = blurChannel(alpha, w, h, style.glow.size);
    const [r, g, b] = hexToRgbLocal(style.glow.color);
    paintEffect(underlay, blurred, w, h, [r, g, b], style.glow.opacity);
  }
  if (style.shadow && style.shadow.enabled) {
    const blurred = blurChannel(alpha, w, h, style.shadow.blur);
    // shift by offset
    const shifted = new Uint8ClampedArray(blurred.length);
    const ox = Math.round(style.shadow.offsetX);
    const oy = Math.round(style.shadow.offsetY);
    for (let y = 0; y < h; y++) {
      const sy = y - oy;
      if (sy < 0 || sy >= h) continue;
      for (let x = 0; x < w; x++) {
        const sx = x - ox;
        if (sx < 0 || sx >= w) continue;
        shifted[y * w + x] = blurred[sy * w + sx];
      }
    }
    const [r, g, b] = hexToRgbLocal(style.shadow.color);
    paintEffect(underlay, shifted, w, h, [r, g, b], style.shadow.opacity);
  }

  // Crop the padded buffer back to doc space.
  const out = new Uint8ClampedArray(docW * docH * 4);
  for (let y = 0; y < docH; y++) {
    for (let x = 0; x < docW; x++) {
      const si = ((y + pad) * w + (x + pad)) * 4;
      const di = (y * docW + x) * 4;
      out[di] = underlay[si];
      out[di + 1] = underlay[si + 1];
      out[di + 2] = underlay[si + 2];
      out[di + 3] = underlay[si + 3];
    }
  }
  return out;
}
