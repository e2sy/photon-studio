// Blend mode pixel operations. All operate on straight (non-premultiplied) RGBA8.
// Reference: W3C Compositing & Blending Level 1.

import type { BlendMode } from './types';

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function applyBlendFn(src: number, dst: number, mode: BlendMode): number {
  // src, dst in 0..255; returns blended channel in 0..255
  const s = src / 255;
  const d = dst / 255;
  let r = d;
  switch (mode) {
    case 'normal':
      r = s;
      break;
    case 'multiply':
      r = s * d;
      break;
    case 'screen':
      r = s + d - s * d;
      break;
    case 'overlay':
      r = d <= 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
      break;
    case 'darken':
      r = Math.min(s, d);
      break;
    case 'lighten':
      r = Math.max(s, d);
      break;
    case 'difference':
      r = Math.abs(s - d);
      break;
  }
  return clamp(r * 255);
}

/**
 * Composite a source layer tile onto a destination tile using the given blend
 * mode and layer opacity. Alpha compositing is straight-alpha porter-duff over.
 */
export function compositeTile(
  dst: Uint8ClampedArray,
  src: Uint8ClampedArray,
  mode: BlendMode,
  opacity: number,
  length: number,
): void {
  for (let i = 0; i < length; i += 4) {
    const sa = (src[i + 3] / 255) * opacity; // effective source alpha
    if (sa <= 0) continue;
    const da = dst[i + 3] / 255;
    const outAlpha = sa + da * (1 - sa);
    if (outAlpha <= 0) {
      dst[i] = 0;
      dst[i + 1] = 0;
      dst[i + 2] = 0;
      dst[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const blended = applyBlendFn(src[i + c], dst[i + c], mode);
      // straight-alpha over: out = (s*sa + d*da*(1-sa)) / outAlpha
      dst[i + c] = clamp(
        (blended * sa + dst[i + c] * da * (1 - sa)) / outAlpha,
      );
    }
    dst[i + 3] = clamp(outAlpha * 255);
  }
}
