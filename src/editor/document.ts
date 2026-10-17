// Document factory + layer helpers.

import type {
  DocumentModel,
  Layer,
  RasterLayer,
  TextLayer,
  GroupLayer,
  AdjustmentLayer,
  AdjustmentSettings,
} from './types';
import { uid } from './id';

export function createBlankLayer(width: number, height: number, name = 'Layer 1'): RasterLayer {
  const data = new ImageData(width, height);
  return {
    id: uid('layer'),
    name,
    type: 'raster',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    x: 0,
    y: 0,
    width,
    height,
    data,
    mask: null,
    style: null,
    parentId: null,
  };
}

export function createBackgroundLayer(width: number, height: number, color: string): RasterLayer {
  const data = new ImageData(width, height);
  const { r, g, b } = hexToRgb(color);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = r;
    data.data[i + 1] = g;
    data.data[i + 2] = b;
    data.data[i + 3] = 255;
  }
  return {
    id: uid('layer'),
    name: 'Background',
    type: 'raster',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    x: 0,
    y: 0,
    width,
    height,
    data,
    mask: null,
    style: null,
    parentId: null,
  };
}

export function createTextLayer(
  text: string,
  x: number,
  y: number,
  opts: Partial<TextLayer> = {},
): TextLayer {
  return {
    id: uid('layer'),
    name: text.slice(0, 20) || 'Text',
    type: 'text',
    text,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 48,
    fontWeight: 400,
    italic: false,
    align: 'left',
    color: '#1e1e1e',
    lineHeight: 1.2,
    letterSpacing: 0,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    x,
    y,
    width: 200,
    height: 60,
    mask: null,
    style: null,
    parentId: null,
    ...opts,
  };
}

export function createGroupLayer(name = 'Group'): GroupLayer {
  return {
    id: uid('group'),
    name,
    type: 'group',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    mask: null,
    style: null,
    parentId: null,
    collapsed: false,
  };
}

export function createAdjustmentLayer(
  adjustment: AdjustmentSettings,
  width: number,
  height: number,
  name = 'Adjustment',
): AdjustmentLayer {
  return {
    id: uid('adj'),
    name,
    type: 'adjustment',
    adjustment,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    x: 0,
    y: 0,
    width,
    height,
    mask: null,
    style: null,
    parentId: null,
  };
}

export function createDocument(
  width: number,
  height: number,
  name = 'Untitled',
  background = '#ffffff',
  withBackground = true,
): DocumentModel {
  const layers: Layer[] = [];
  if (withBackground) {
    layers.push(createBackgroundLayer(width, height, background));
  }
  return {
    id: uid('doc'),
    name,
    width,
    height,
    dpi: 72,
    colorMode: 'rgba8',
    layers,
    activeLayerId: layers[0]?.id ?? null,
    selection: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    background,
    saved: false,
    filePath: null,
    metadata: {},
  };
}

export function getActiveLayer(doc: DocumentModel): Layer | null {
  if (!doc.activeLayerId) return null;
  return doc.layers.find((l) => l.id === doc.activeLayerId) ?? null;
}

export function getRasterizableLayers(doc: DocumentModel): Layer[] {
  // layers composited bottom-to-top; groups currently pass through children
  return doc.layers.filter((l) => l.visible);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '');
  const full =
    m.length === 3
      ? m.split('').map((c) => c + c).join('')
      : m;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
