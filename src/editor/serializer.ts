// Project serialization for the .photon format.
// Format: a JSON manifest + base64-encoded pixel data, packed as a JSON file
// (single-file variant) for simplicity in the browser environment. Designed to
// be ZIP-container-compatible in a native shell.

import type { DocumentModel, Layer, RasterLayer, TextLayer, AdjustmentLayer, GroupLayer, AdjustmentSettings, LayerStyle } from './types';

const PHOTON_VERSION = 1;

interface SerializedLayer {
  id: string;
  name: string;
  type: Layer['type'];
  visible: boolean;
  opacity: number;
  blendMode: Layer['blendMode'];
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  style: LayerStyle | null;
  mask: { enabled: boolean; dataB64: string } | null;
  // type-specific
  dataB64?: string; // raster
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  align?: TextLayer['align'];
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  adjustment?: AdjustmentSettings;
  collapsed?: boolean;
}

interface PhotonFile {
  version: number;
  document: {
    id: string;
    name: string;
    width: number;
    height: number;
    dpi: number;
    colorMode: string;
    background: string;
    metadata: Record<string, string>;
  };
  layers: SerializedLayer[];
  activeLayerId: string | null;
}

function toBase64(bytes: Uint8ClampedArray): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8ClampedArray {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function imageDataToB64(img: ImageData): string {
  return toBase64(img.data);
}

function b64ToImageData(b64: string, w: number, h: number): ImageData {
  return new ImageData(fromBase64(b64), w, h);
}

export function serializeDocument(doc: DocumentModel): string {
  const layers: SerializedLayer[] = doc.layers.map((layer) => {
    const base: SerializedLayer = {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      locked: layer.locked,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      parentId: layer.parentId,
      style: layer.style ?? null,
      mask: layer.mask
        ? { enabled: layer.mask.enabled, dataB64: imageDataToB64(layer.mask.data) }
        : null,
    };
    if (layer.type === 'raster') {
      base.dataB64 = imageDataToB64((layer as RasterLayer).data);
    } else if (layer.type === 'text') {
      const t = layer as TextLayer;
      base.text = t.text;
      base.fontFamily = t.fontFamily;
      base.fontSize = t.fontSize;
      base.fontWeight = t.fontWeight;
      base.italic = t.italic;
      base.align = t.align;
      base.color = t.color;
      base.lineHeight = t.lineHeight;
      base.letterSpacing = t.letterSpacing;
    } else if (layer.type === 'adjustment') {
      base.adjustment = (layer as AdjustmentLayer).adjustment;
    } else if (layer.type === 'group') {
      base.collapsed = (layer as GroupLayer).collapsed;
    }
    return base;
  });
  const file: PhotonFile = {
    version: PHOTON_VERSION,
    document: {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      dpi: doc.dpi,
      colorMode: doc.colorMode,
      background: doc.background,
      metadata: doc.metadata,
    },
    layers,
    activeLayerId: doc.activeLayerId,
  };
  return JSON.stringify(file, null, 2);
}

export function deserializeDocument(json: string): DocumentModel {
  const file = JSON.parse(json) as PhotonFile;
  if (file.version !== PHOTON_VERSION) {
    throw new Error(`Unsupported Photon project version: ${file.version}`);
  }
  const layers: Layer[] = file.layers.map((s): Layer => {
    const mask = s.mask
      ? { id: s.id + '-mask', enabled: s.mask.enabled, data: b64ToImageData(s.mask.dataB64, s.width, s.height) }
      : null;
    if (s.type === 'raster') {
      const l: RasterLayer = {
        id: s.id,
        name: s.name,
        type: 'raster',
        visible: s.visible,
        opacity: s.opacity,
        blendMode: s.blendMode,
        locked: s.locked,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        mask,
        parentId: s.parentId,
        style: s.style ?? null,
        data: b64ToImageData(s.dataB64!, s.width, s.height),
      };
      return l;
    }
    if (s.type === 'text') {
      const l: TextLayer = {
        id: s.id,
        name: s.name,
        type: 'text',
        visible: s.visible,
        opacity: s.opacity,
        blendMode: s.blendMode,
        locked: s.locked,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        mask,
        parentId: s.parentId,
        style: s.style ?? null,
        text: s.text!,
        fontFamily: s.fontFamily!,
        fontSize: s.fontSize!,
        fontWeight: s.fontWeight!,
        italic: s.italic!,
        align: s.align!,
        color: s.color!,
        lineHeight: s.lineHeight!,
        letterSpacing: s.letterSpacing!,
      };
      return l;
    }
    if (s.type === 'adjustment') {
      const l: AdjustmentLayer = {
        id: s.id,
        name: s.name,
        type: 'adjustment',
        visible: s.visible,
        opacity: s.opacity,
        blendMode: s.blendMode,
        locked: s.locked,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        mask,
        parentId: s.parentId,
        style: s.style ?? null,
        adjustment: s.adjustment!,
      };
      return l;
    }
    // group
    const l: GroupLayer = {
      id: s.id,
      name: s.name,
      type: 'group',
      visible: s.visible,
      opacity: s.opacity,
      blendMode: s.blendMode,
      locked: s.locked,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      mask,
      parentId: s.parentId,
      style: s.style ?? null,
      collapsed: s.collapsed ?? false,
    };
    return l;
  });
  return {
    id: file.document.id,
    name: file.document.name,
    width: file.document.width,
    height: file.document.height,
    dpi: file.document.dpi,
    colorMode: file.document.colorMode as DocumentModel['colorMode'],
    layers,
    activeLayerId: file.activeLayerId,
    selection: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    background: file.document.background,
    saved: true,
    filePath: null,
    metadata: file.document.metadata,
  };
}

export const PHOTON_FORMAT_VERSION = PHOTON_VERSION;
