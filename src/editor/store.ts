// Central editor store (Zustand). Holds documents, active doc, tool, prefs,
// and exposes high-level commands that mutate documents + record history.

import { create } from 'zustand';
import type {
  DocumentModel,
  Layer,
  RasterLayer,
  TextLayer,
  ToolId,
  ToolSettings,
  EditorPreferences,
  AdjustmentSettings,
  Selection,
  BlendMode,
  LayerStyle,
} from './types';
import { DEFAULT_TOOL_SETTINGS } from './types';
import {
  createDocument,
  createBlankLayer,
  createTextLayer,
  createGroupLayer,
  createAdjustmentLayer,
  getActiveLayer,
  hexToRgb,
} from './document';
import { History } from './history';
import { uid } from './id';
import { paintStroke, paintBucketFill, paintMaskStroke, type StrokePoint } from './painting';
import { compositeDocument, applyAdjustment } from './renderer';
import {
  gaussianBlur,
  boxBlur,
  sharpen,
  pixelate,
  addNoise,
  edgeDetect,
  sepia,
  invertImage,
  grayscaleImage,
  applyGradient,
  drawLine,
  drawRect,
  drawEllipse,
} from './imaging';
import { serializeDocument, deserializeDocument } from './serializer';
import { setCloneSource, applyCurveLut, buildCurveLut } from './retouch';

export interface EditorState {
  documents: DocumentModel[];
  activeDocId: string | null;
  tool: ToolId;
  toolSettings: ToolSettings;
  prefs: EditorPreferences;
  // per-doc history
  histories: Record<string, History>;
  // ui
  activePanel: 'layers' | 'history' | 'adjustments' | 'color' | 'text';
  color: string;
  paintOnMask: boolean;
  // UI helpers used by components
  activeDoc: () => DocumentModel | null;
  activeLayer: () => Layer | null;
  // commands
  newDocument: (w: number, h: number, name?: string, bg?: string) => string;
  closeDocument: (id: string) => void;
  setActiveDoc: (id: string) => void;
  setTool: (t: ToolId) => void;
  setToolSettings: (s: Partial<ToolSettings>) => void;
  setPrefs: (p: Partial<EditorPreferences>) => void;
  setColor: (c: string) => void;
  setPanel: (p: EditorState['activePanel']) => void;
  setPaintOnMask: (v: boolean) => void;

  // document ops
  importImage: (img: HTMLImageElement, name: string) => string;
  addBlankLayer: () => void;
  addTextLayer: (text: string) => void;
  addGroup: () => void;
  addAdjustmentLayer: (adj: AdjustmentSettings) => void;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  selectLayer: (id: string) => void;
  reorderLayer: (id: string, toIndex: number) => void;
  setLayerProp: (id: string, key: string, value: unknown) => void;
  renameLayer: (id: string, name: string) => void;
  mergeVisible: () => void;
  flattenImage: () => void;
  addMask: (id: string, white: boolean) => void;
  applyMask: (id: string) => void;
  setLayerStyle: (id: string, style: LayerStyle | null) => void;
  setSelection: (sel: Selection | null) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // painting
  applyPaintStroke: (layerId: string, points: StrokePoint[], erase: boolean) => void;
  paintMaskStroke: (layerId: string, points: StrokePoint[], value: number) => void;
  paintBucket: (layerId: string, x: number, y: number) => void;
  drawShape: (layerId: string, shape: 'line' | 'rect' | 'ellipse', x0: number, y0: number, x1: number, y1: number) => void;
  applyGradientStroke: (layerId: string, x0: number, y0: number, x1: number, y1: number) => void;
  setCloneSource: (x: number, y: number) => void;
  applyCurves: (layerId: string, points: { x: number; y: number }[]) => void;

  // transforms
  moveLayerBy: (id: string, dx: number, dy: number) => void;
  setLayerPosition: (id: string, x: number, y: number) => void;
  transformLayer: (id: string, opts: { x?: number; y?: number; width?: number; height?: number; flipH?: boolean; flipV?: boolean; rotation?: number }) => void;
  perspectiveWarp: (id: string, corners: { x: number; y: number }[]) => void;
  getLayerBounds: (id: string) => { x: number; y: number; width: number; height: number } | null;

  // adjustments/filters
  applyAdjustmentToLayer: (id: string, adj: AdjustmentSettings) => void;
  applyFilter: (id: string, filter: string, params: Record<string, number>) => void;

  // viewport
  setZoom: (docId: string, zoom: number) => void;
  setPan: (docId: string, x: number, y: number) => void;

  // history
  undo: () => void;
  redo: () => void;
  historyJumpTo: (steps: number) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getHistory: () => History | null;

  // project file
  saveProject: (docId: string) => string;
  openProject: (json: string, name: string) => string;
  exportComposite: (docId: string, format: 'png' | 'jpeg' | 'webp', quality?: number) => Blob;
}

function ensureHistory(state: EditorState, docId: string): History {
  if (!state.histories[docId]) {
    const h = new History(60);
    state.histories[docId] = h;
  }
  return state.histories[docId];
}

// Runs a mutation inside a correctly-ordered history transaction:
// snapshot before -> mutate -> snapshot after -> commit.
function withHistory(
  state: EditorState,
  doc: DocumentModel,
  name: string,
  layerIds: string[],
  mutate: () => void,
): void {
  const hist = ensureHistory(state, doc.id);
  const b = hist.begin().captureBefore(doc, name, layerIds);
  mutate();
  b.captureAfter(doc, layerIds).commit();
}

export const useEditor = create<EditorState>((set, get) => ({
  documents: [],
  activeDocId: null,
  tool: 'brush',
  toolSettings: { ...DEFAULT_TOOL_SETTINGS },
  prefs: {
    theme: 'dark',
    rulerUnit: 'px',
    autosaveIntervalSec: 60,
    showRulers: true,
    showGrid: false,
    snapToGrid: false,
    gridSize: 16,
    defaultExportQuality: 0.92,
    brushDefaultColor: '#1e1e1e',
  },
  histories: {},
  activePanel: 'layers',
  color: '#1e1e1e',
  paintOnMask: false,

  activeDoc: () => {
    const s = get();
    return s.documents.find((d) => d.id === s.activeDocId) ?? null;
  },

  activeLayer: () => {
    const doc = get().activeDoc();
    if (!doc) return null;
    return doc.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  },

  newDocument: (w, h, name = 'Untitled', bg = '#ffffff') => {
    const doc = createDocument(w, h, name, bg, true);
    set((s) => ({
      documents: [...s.documents, doc],
      activeDocId: doc.id,
      histories: { ...s.histories, [doc.id]: new History(60) },
    }));
    return doc.id;
  },

  closeDocument: (id) =>
    set((s) => {
      const docs = s.documents.filter((d) => d.id !== id);
      const hist = { ...s.histories };
      delete hist[id];
      return {
        documents: docs,
        activeDocId: s.activeDocId === id ? docs[0]?.id ?? null : s.activeDocId,
        histories: hist,
      };
    }),

  setActiveDoc: (id) => set({ activeDocId: id }),
  setTool: (t) => set({ tool: t }),
  setToolSettings: (patch) => set((s) => ({ toolSettings: { ...s.toolSettings, ...patch } })),
  setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
  setColor: (c) => set({ color: c }),
  setPanel: (p) => set({ activePanel: p }),
  setPaintOnMask: (v) => set({ paintOnMask: v }),

  importImage: (img, name) => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const doc = createDocument(w, h, name, '#ffffff', false);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, w, h);
    const layer: RasterLayer = {
      id: uid('layer'),
      name: name.replace(/\.[^.]+$/, ''),
      type: 'raster',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      locked: false,
      x: 0,
      y: 0,
      width: w,
      height: h,
      data,
      mask: null,
      style: null,
      parentId: null,
    };
    doc.layers.push(layer);
    doc.activeLayerId = layer.id;
    set((s) => ({
      documents: [...s.documents, doc],
      activeDocId: doc.id,
      histories: { ...s.histories, [doc.id]: new History(60) },
    }));
    return doc.id;
  },

  addBlankLayer: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = createBlankLayer(doc.width, doc.height, `Layer ${doc.layers.length + 1}`);
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Add Layer', []).markAdded(layer).captureAfter(doc, [layer.id]).commit();
    doc.layers.push(layer);
    doc.activeLayerId = layer.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  addTextLayer: (text) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = createTextLayer(text, doc.width / 4, doc.height / 2, {
      color: s.color,
      fontSize: s.toolSettings.fontSize,
    });
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Add Text Layer', []).markAdded(layer).captureAfter(doc, [layer.id]).commit();
    doc.layers.push(layer);
    doc.activeLayerId = layer.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  addGroup: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const g = createGroupLayer(`Group ${doc.layers.filter((l) => l.type === 'group').length + 1}`);
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'New Group', []).markAdded(g).captureAfter(doc, [g.id]).commit();
    doc.layers.push(g);
    doc.activeLayerId = g.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  addAdjustmentLayer: (adj) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const l = createAdjustmentLayer(adj, doc.width, doc.height, adj.kind);
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'New Adjustment', []).markAdded(l).captureAfter(doc, [l.id]).commit();
    doc.layers.push(l);
    doc.activeLayerId = l.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  deleteLayer: (id) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Delete Layer', [id]).markRemoved(layer).captureAfter(doc, []).commit();
    doc.layers = doc.layers.filter((l) => l.id !== id);
    if (doc.activeLayerId === id) {
      doc.activeLayerId = doc.layers[doc.layers.length - 1]?.id ?? null;
    }
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  duplicateLayer: (id) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const copy = cloneLayer(layer);
    copy.name = `${layer.name} copy`;
    const idx = doc.layers.indexOf(layer);
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Duplicate Layer', [id]).markAdded(copy).captureAfter(doc, [copy.id]).commit();
    doc.layers.splice(idx + 1, 0, copy);
    doc.activeLayerId = copy.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  selectLayer: (id) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    doc.activeLayerId = id;
    set({ documents: [...s.documents] });
  },

  reorderLayer: (id, toIndex) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const from = doc.layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const [layer] = doc.layers.splice(from, 1);
    doc.layers.splice(Math.min(toIndex, doc.layers.length), 0, layer);
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  setLayerProp: (id, key, value) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    (layer as unknown as Record<string, unknown>)[key] = value;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  renameLayer: (id, name) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Rename Layer', [id]).captureAfter(doc, [id]).commit();
    layer.name = name;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  mergeVisible: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const comp = compositeDocument(doc);
    const merged: RasterLayer = {
      id: uid('layer'),
      name: 'Merged',
      type: 'raster',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      locked: false,
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
      data: comp,
      mask: null,
      style: null,
      parentId: null,
    };
    const removed = doc.layers.filter((l) => l.visible);
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Merge Visible', []).markAdded(merged).captureAfter(doc, [merged.id]).commit();
    doc.layers = doc.layers.filter((l) => !l.visible);
    doc.layers.push(merged);
    doc.activeLayerId = merged.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  flattenImage: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    // make all visible then composite
    for (const l of doc.layers) l.visible = true;
    const comp = compositeDocument(doc);
    const flat: RasterLayer = {
      id: uid('layer'),
      name: 'Background',
      type: 'raster',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      locked: false,
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
      data: comp,
      mask: null,
      style: null,
      parentId: null,
    };
    const hist = ensureHistory(s, doc.id);
    hist.clear();
    doc.layers = [flat];
    doc.activeLayerId = flat.id;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  addMask: (id, white) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const maskData = new ImageData(layer.width, layer.height);
    const val = white ? 255 : 0;
    for (let i = 0; i < maskData.data.length; i += 4) {
      maskData.data[i] = val;
      maskData.data[i + 1] = val;
      maskData.data[i + 2] = val;
      maskData.data[i + 3] = 255;
    }
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Add Mask', [id]).captureAfter(doc, [id]).commit();
    layer.mask = { id: uid('mask'), data: maskData, enabled: true };
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  applyMask: (id) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id) as RasterLayer | undefined;
    if (!layer || !layer.mask || !('data' in layer)) return;
    const hist = ensureHistory(s, doc.id);
    hist.begin().captureBefore(doc, 'Apply Mask', [id]).captureAfter(doc, [id]).commit();
    const d = layer.data.data;
    const m = layer.mask.data.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = Math.round((d[i + 3] / 255) * (m[i] / 255) * 255);
    }
    layer.mask = null;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  setLayerStyle: (id, style) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    withHistory(s, doc, 'Layer Style', [id], () => {
      layer.style = style;
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  setSelection: (sel) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    doc.selection = sel;
    set({ documents: [...s.documents] });
  },

  clearSelection: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    doc.selection = null;
    set({ documents: [...s.documents] });
  },

  selectAll: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const data = new ImageData(doc.width, doc.height);
    for (let i = 0; i < data.data.length; i += 4) data.data[i] = 255;
    doc.selection = { id: uid('sel'), data, feather: 0 };
    set({ documents: [...s.documents] });
  },

  applyPaintStroke: (layerId, points, erase) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === layerId) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    const localPts: StrokePoint[] = points.map((p) => ({
      x: p.x - layer.x,
      y: p.y - layer.y,
      pressure: p.pressure,
    }));
    const size = erase ? s.toolSettings.eraserSize : s.toolSettings.brushSize;
    withHistory(s, doc, erase ? 'Erase' : 'Brush Stroke', [layerId], () => {
      paintStroke(
        layer.data,
        localPts,
        size,
        s.toolSettings.brushHardness,
        s.toolSettings.brushOpacity * s.toolSettings.brushFlow,
        erase ? '#000000' : s.color,
        erase,
      );
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  paintMaskStroke: (layerId, points, value) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === layerId) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster' || !layer.mask) return;
    const localPts: StrokePoint[] = points.map((p) => ({
      x: p.x - layer.x,
      y: p.y - layer.y,
      pressure: p.pressure,
    }));
    withHistory(s, doc, 'Paint Mask', [layerId], () => {
      paintMaskStroke(
        layer.mask!.data,
        localPts,
        s.toolSettings.brushSize,
        s.toolSettings.brushHardness,
        s.toolSettings.brushOpacity * s.toolSettings.brushFlow,
        value,
      );
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  paintBucket: (layerId, x, y) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === layerId) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    withHistory(s, doc, 'Fill', [layerId], () => {
      paintBucketFill(layer, x, y, s.color, s.toolSettings.tolerance);
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  drawShape: (layerId, shape, x0, y0, x1, y1) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === layerId) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    const ts = s.toolSettings;
    withHistory(s, doc, `Draw ${shape}`, [layerId], () => {
      const lx0 = x0 - layer.x, ly0 = y0 - layer.y;
      const lx1 = x1 - layer.x, ly1 = y1 - layer.y;
      if (shape === 'line') drawLine(layer.data, lx0, ly0, lx1, ly1, ts.shapeThickness, s.color);
      else if (shape === 'rect') drawRect(layer.data, lx0, ly0, lx1, ly1, ts.shapeFill, ts.shapeThickness, s.color);
      else drawEllipse(layer.data, lx0, ly0, lx1, ly1, ts.shapeFill, s.color);
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  applyGradientStroke: (layerId, x0, y0, x1, y1) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === layerId) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    const sel = doc.selection ? doc.selection.data : undefined;
    withHistory(s, doc, 'Gradient', [layerId], () => {
      applyGradient(
        layer.data,
        x0 - layer.x, y0 - layer.y, x1 - layer.x, y1 - layer.y,
        s.color, s.toolSettings.secondaryColor,
        s.toolSettings.gradientType,
        sel,
      );
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  setCloneSource: (x, y) => {
    setCloneSource(x, y);
  },

  applyCurves: (layerId, points) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === layerId) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    withHistory(s, doc, 'Curves', [layerId], () => {
      const lut = buildCurveLut(points);
      applyCurveLut(layer.data, lut);
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  moveLayerBy: (id, dx, dy) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    layer.x += dx;
    layer.y += dy;
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  setLayerPosition: (id, x, y) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    withHistory(s, doc, 'Move Layer', [id], () => {
      layer.x = x;
      layer.y = y;
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  getLayerBounds: (id) => {
    const s = get();
    const layer = s.activeDoc()?.layers.find((l) => l.id === id);
    if (!layer) return null;
    return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  },

  transformLayer: (id, opts) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id) as RasterLayer | undefined;
    if (!layer) return;
    withHistory(s, doc, 'Transform', [id], () => {
      if (opts.x !== undefined) layer.x = opts.x;
      if (opts.y !== undefined) layer.y = opts.y;
      if ((opts.width !== undefined && opts.width !== layer.width) ||
          (opts.height !== undefined && opts.height !== layer.height)) {
        const nw = opts.width ?? layer.width;
        const nh = opts.height ?? layer.height;
        if ('data' in layer) {
          layer.data = scaleImageData(layer.data, nw, nh);
        }
        layer.width = nw;
        layer.height = nh;
      }
      if (opts.rotation && 'data' in layer) {
        const res = rotateImageData(layer.data, opts.rotation);
        layer.x -= (res.width - layer.width) / 2;
        layer.y -= (res.height - layer.height) / 2;
        layer.data = res.data;
        layer.width = res.width;
        layer.height = res.height;
      }
      if (opts.flipH && 'data' in layer) {
        flipImageDataH(layer.data);
      }
      if (opts.flipV && 'data' in layer) {
        flipImageDataV(layer.data);
      }
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  perspectiveWarp: (id, corners) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster' || corners.length !== 4) return;
    withHistory(s, doc, 'Perspective Warp', [id], () => {
      const res = perspectiveWarpImageData(layer.data, corners);
      layer.data = res.data;
      layer.x = res.x;
      layer.y = res.y;
      layer.width = res.width;
      layer.height = res.height;
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  applyAdjustmentToLayer: (id, adj) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    withHistory(s, doc, `Adjustment: ${adj.kind}`, [id], () => {
      layer.data = applyAdjustment(layer.data, adj);
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  applyFilter: (id, filter, params) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const layer = doc.layers.find((l) => l.id === id) as RasterLayer | undefined;
    if (!layer || layer.type !== 'raster') return;
    withHistory(s, doc, `Filter: ${filter}`, [id], () => {
      switch (filter) {
        case 'gaussian-blur': layer.data = gaussianBlur(layer.data, params.radius ?? 5); break;
        case 'box-blur': layer.data = boxBlur(layer.data, params.radius ?? 5); break;
        case 'sharpen': layer.data = sharpen(layer.data, params.amount ?? 1); break;
        case 'pixelate': layer.data = pixelate(layer.data, params.size ?? 10); break;
        case 'noise': layer.data = addNoise(layer.data, params.amount ?? 30); break;
        case 'edge-detect': layer.data = edgeDetect(layer.data); break;
        case 'sepia': layer.data = sepia(layer.data); break;
        case 'invert': layer.data = invertImage(layer.data); break;
        case 'grayscale': layer.data = grayscaleImage(layer.data); break;
      }
    });
    doc.saved = false;
    set({ documents: [...s.documents] });
  },

  setZoom: (docId, zoom) => {
    set((s) => {
      const doc = s.documents.find((d) => d.id === docId);
      if (!doc) return s;
      doc.zoom = Math.max(0.05, Math.min(32, zoom));
      return { documents: [...s.documents] };
    });
  },

  setPan: (docId, x, y) => {
    set((s) => {
      const doc = s.documents.find((d) => d.id === docId);
      if (!doc) return s;
      doc.panX = x;
      doc.panY = y;
      return { documents: [...s.documents] };
    });
  },

  undo: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const h = s.histories[doc.id];
    if (h) h.undo(doc);
    set({ documents: [...s.documents] });
  },

  redo: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const h = s.histories[doc.id];
    if (h) h.redo(doc);
    set({ documents: [...s.documents] });
  },

  historyJumpTo: (steps) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return;
    const h = s.histories[doc.id];
    if (!h) return;
    if (steps < 0) {
      for (let i = 0; i < -steps; i++) {
        if (!h.undo(doc)) break;
      }
    } else {
      for (let i = 0; i < steps; i++) {
        if (!h.redo(doc)) break;
      }
    }
    set({ documents: [...s.documents] });
  },

  canUndo: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return false;
    return s.histories[doc.id]?.canUndo() ?? false;
  },

  canRedo: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return false;
    return s.histories[doc.id]?.canRedo() ?? false;
  },

  getHistory: () => {
    const s = get();
    const doc = s.documents.find((d) => d.id === s.activeDocId);
    if (!doc) return null;
    return s.histories[doc.id] ?? null;
  },

  saveProject: (docId) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === docId);
    if (!doc) return '';
    const json = serializeDocument(doc);
    doc.saved = true;
    set({ documents: [...s.documents] });
    return json;
  },

  openProject: (json, name) => {
    const doc = deserializeDocument(json);
    doc.name = name.replace(/\.[^.]+$/, '');
    doc.saved = true;
    set((s) => ({
      documents: [...s.documents, doc],
      activeDocId: doc.id,
      histories: { ...s.histories, [doc.id]: new History(60) },
    }));
    return doc.id;
  },

  exportComposite: (docId, format, quality) => {
    const s = get();
    const doc = s.documents.find((d) => d.id === docId);
    if (!doc) return new Blob();
    const comp = compositeDocument(doc);
    const c = document.createElement('canvas');
    c.width = doc.width;
    c.height = doc.height;
    c.getContext('2d')!.putImageData(comp, 0, 0);
    let mime = 'image/png';
    if (format === 'jpeg') mime = 'image/jpeg';
    if (format === 'webp') mime = 'image/webp';
    const q = quality ?? s.prefs.defaultExportQuality;
    // Use canvas.toBlob synchronously via a fallback
    const dataUrl = c.toDataURL(mime, q);
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },
}));

function cloneLayer(layer: Layer): Layer {
  const base = { ...layer, id: uid(layer.type) };
  if (layer.type === 'raster') {
    return {
      ...base,
      data: new ImageData(new Uint8ClampedArray(layer.data.data), layer.data.width, layer.data.height),
      mask: layer.mask ? { ...layer.mask, id: uid('mask'), data: new ImageData(new Uint8ClampedArray(layer.mask.data.data), layer.mask.data.width, layer.mask.data.height) } : null,
    } as RasterLayer;
  }
  return base as Layer;
}

function scaleImageData(src: ImageData, nw: number, nh: number): ImageData {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.putImageData(src, 0, 0);
  const c2 = document.createElement('canvas');
  c2.width = Math.max(1, Math.round(nw));
  c2.height = Math.max(1, Math.round(nh));
  const cx = c2.getContext('2d')!;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(c, 0, 0, c2.width, c2.height);
  return cx.getImageData(0, 0, c2.width, c2.height);
}

function rotateImageData(src: ImageData, degrees: number): { data: ImageData; width: number; height: number } {  const rad = (degrees * Math.PI) / 180;
  const w = src.width, h = src.height;
  // rotated bounding box
  const bw = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  const bh = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(src, 0, 0);
  const c2 = document.createElement('canvas');
  c2.width = bw;
  c2.height = bh;
  const cx = c2.getContext('2d')!;
  cx.translate(bw / 2, bh / 2);
  cx.rotate(rad);
  cx.imageSmoothingEnabled = true;
  cx.drawImage(c, -w / 2, -h / 2);
  return { data: cx.getImageData(0, 0, bw, bh), width: bw, height: bh };
}

function flipImageDataH(img: ImageData): void {
  const w = img.width, h = img.height, d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w / 2; x++) {
      const a = (y * w + x) * 4;
      const b = (y * w + (w - 1 - x)) * 4;
      for (let c = 0; c < 4; c++) {
        const t = d[a + c]; d[a + c] = d[b + c]; d[b + c] = t;
      }
    }
  }
}

function flipImageDataV(img: ImageData): void {
  const w = img.width, h = img.height, d = img.data;
  for (let y = 0; y < h / 2; y++) {
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4;
      const b = ((h - 1 - y) * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const t = d[a + c]; d[a + c] = d[b + c]; d[b + c] = t;
      }
    }
  }
}

// Warp a layer so its four corners land on the given document-space points.
// corners: [topLeft, topRight, bottomRight, bottomLeft]. Uses an inverse
// bilinear mapping sampled per output pixel.
function perspectiveWarpImageData(
  src: ImageData,
  corners: { x: number; y: number }[],
): { data: ImageData; x: number; y: number; width: number; height: number } {
  const [tl, tr, br, bl] = corners;
  const minX = Math.floor(Math.min(tl.x, tr.x, br.x, bl.x));
  const minY = Math.floor(Math.min(tl.y, tr.y, br.y, bl.y));
  const maxX = Math.ceil(Math.max(tl.x, tr.x, br.x, bl.x));
  const maxY = Math.ceil(Math.max(tl.y, tr.y, br.y, bl.y));
  const outW = Math.max(1, maxX - minX);
  const outH = Math.max(1, maxY - minY);
  const out = new ImageData(outW, outH);
  const sw = src.width;
  const sh = src.height;

  for (let y = 0; y < outH; y++) {
    const dy = (y + 0.5) / outH;
    for (let x = 0; x < outW; x++) {
      const dx = (x + 0.5) / outW;
      // inverse bilinear: doc point = bilerp(tl, tr, bl, br, dx, dy);
      // solve for (u,v) in source space via two iterations of Newton's method
      let u = dx;
      let v = dy;
      for (let it = 0; it < 4; it++) {
        const px =
          tl.x * (1 - u) * (1 - v) + tr.x * u * (1 - v) + bl.x * (1 - u) * v + br.x * u * v;
        const py =
          tl.y * (1 - u) * (1 - v) + tr.y * u * (1 - v) + bl.y * (1 - u) * v + br.y * u * v;
        // target point
        const tx = minX + dx * outW;
        const ty = minY + dy * outH;
        // Jacobian
        const dpxdu = -tl.x * (1 - v) + tr.x * (1 - v) - bl.x * v + br.x * v;
        const dpxdv = -tl.x * (1 - u) - tr.x * u + bl.x * (1 - u) + br.x * u;
        const dpydu = -tl.y * (1 - v) + tr.y * (1 - v) - bl.y * v + br.y * v;
        const dpydv = -tl.y * (1 - u) - tr.y * u + bl.y * (1 - u) + br.y * u;
        const det = dpxdu * dpydv - dpxdv * dpydu;
        if (Math.abs(det) < 1e-6) break;
        u += ((tx - px) * dpydv - (ty - py) * dpxdv) / det;
        v += ((ty - py) * dpxdu - (tx - px) * dpydu) / det;
        u = Math.max(-1, Math.min(2, u));
        v = Math.max(-1, Math.min(2, v));
      }
      const sx = u * sw - 0.5;
      const sy = v * sh - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const di = (y * outW + x) * 4;
      if (x0 < -1 || y0 < -1 || x0 >= sw || y0 >= sh) continue;
      const sample = (xx: number, yy: number): [number, number, number, number] => {
        const cx = Math.min(sw - 1, Math.max(0, xx));
        const cy = Math.min(sh - 1, Math.max(0, yy));
        const si = (cy * sw + cx) * 4;
        return [src.data[si], src.data[si + 1], src.data[si + 2], src.data[si + 3]];
      };
      const c00 = sample(x0, y0);
      const c10 = sample(x0 + 1, y0);
      const c01 = sample(x0, y0 + 1);
      const c11 = sample(x0 + 1, y0 + 1);
      for (let c = 0; c < 4; c++) {
        const top = c00[c] * (1 - fx) + c10[c] * fx;
        const bot = c01[c] * (1 - fx) + c11[c] * fx;
        out.data[di + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { data: out, x: minX, y: minY, width: outW, height: outH };
}
