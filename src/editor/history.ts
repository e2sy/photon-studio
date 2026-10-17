// History system using command pattern with snapshot-based checkpoints.
// Lightweight: stores reversible commands. For pixel-changing ops we store
// a before/after ImageData of the affected layer region to limit memory.

import type { DocumentModel, Layer } from './types';
import { uid } from './id';

export interface LayerSnapshot {
  layerId: string;
  data: ImageData | null; // null for group/adjustment-only changes
  mask: ImageData | null;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  opacity: number;
  visible: boolean;
  blendMode: Layer['blendMode'];
}

export interface HistoryEntry {
  id: string;
  name: string;
  // layers added by this command (full objects, re-added on redo)
  addedLayers: Layer[];
  // layers removed by this command — restored on undo
  removedLayers: Layer[];
  // layer snapshots before the command
  beforeSnapshots: LayerSnapshot[];
  // layer snapshots after the command
  afterSnapshots: LayerSnapshot[];
  // active layer before/after
  beforeActiveId: string | null;
  afterActiveId: string | null;
  // document-level changes
  beforeWidth: number;
  beforeHeight: number;
  afterWidth: number;
  afterHeight: number;
  // selection before/after
  beforeSelection: { data: ImageData; feather: number } | null;
  afterSelection: { data: ImageData; feather: number } | null;
}

function cloneImageData(img: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

function snapshotLayer(layer: Layer): LayerSnapshot {
  return {
    layerId: layer.id,
    data: 'data' in layer ? cloneImageData(layer.data) : null,
    mask: layer.mask ? cloneImageData(layer.mask.data) : null,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    name: layer.name,
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode,
  };
}

function applySnapshot(doc: DocumentModel, snap: LayerSnapshot): void {
  const layer = doc.layers.find((l) => l.id === snap.layerId);
  if (!layer) return;
  if ('data' in layer && snap.data) {
    layer.data = snap.data;
  }
  if (layer.mask && snap.mask) {
    layer.mask.data = snap.mask;
  }
  layer.x = snap.x;
  layer.y = snap.y;
  layer.width = snap.width;
  layer.height = snap.height;
  layer.name = snap.name;
  layer.opacity = snap.opacity;
  layer.visible = snap.visible;
  layer.blendMode = snap.blendMode;
}

export class History {
  undoStack: HistoryEntry[] = [];
  redoStack: HistoryEntry[] = [];
  maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  begin(): HistoryBuilder {
    return new HistoryBuilder(this);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(doc: DocumentModel): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    // remove layers that were added by this command
    const addedIds = entry.addedLayers.map((l) => l.id);
    doc.layers = doc.layers.filter((l) => !addedIds.includes(l.id));
    // restore removed layers at their original index — we stored them in order
    for (const removed of entry.removedLayers) {
      doc.layers.push(removed);
    }
    // reorder: sort by preserved order? We rely on before snapshots for props.
    for (const snap of entry.beforeSnapshots) {
      applySnapshot(doc, snap);
    }
    doc.activeLayerId = entry.beforeActiveId;
    doc.width = entry.beforeWidth;
    doc.height = entry.beforeHeight;
    doc.selection = entry.beforeSelection
      ? { id: uid('sel'), data: cloneImageData(entry.beforeSelection.data), feather: entry.beforeSelection.feather }
      : null;
    this.redoStack.push(entry);
    return true;
  }

  redo(doc: DocumentModel): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    // remove re-removed layers
    doc.layers = doc.layers.filter((l) => !entry.removedLayers.includes(l));
    // re-add layers that were added by this command
    for (const layer of entry.addedLayers) {
      if (!doc.layers.find((l) => l.id === layer.id)) {
        doc.layers.push(layer);
      }
    }
    for (const snap of entry.afterSnapshots) {
      applySnapshot(doc, snap);
    }
    doc.activeLayerId = entry.afterActiveId;
    doc.width = entry.afterWidth;
    doc.height = entry.afterHeight;
    doc.selection = entry.afterSelection
      ? { id: uid('sel'), data: cloneImageData(entry.afterSelection.data), feather: entry.afterSelection.feather }
      : null;
    this.undoStack.push(entry);
    return true;
  }

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  lastEntryName(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].name : null;
  }
}

// Builder captures before/after state for a single command.
export class HistoryBuilder {
  private history: History;
  private name: string = '';
  private beforeSnapshots: LayerSnapshot[] = [];
  private afterSnapshots: LayerSnapshot[] = [];
  private addedLayers: Layer[] = [];
  private removedLayers: Layer[] = [];
  private beforeActiveId: string | null = null;
  private afterActiveId: string | null = null;
  private beforeWidth: number = 0;
  private beforeHeight: number = 0;
  private afterWidth: number = 0;
  private afterHeight: number = 0;
  private beforeSelection: { data: ImageData; feather: number } | null = null;
  private afterSelection: { data: ImageData; feather: number } | null = null;
  private doc: DocumentModel | null = null;

  constructor(history: History) {
    this.history = history;
  }

  // Capture state of a document before a command runs.
  captureBefore(doc: DocumentModel, name: string, layerIds: string[]): this {
    this.name = name;
    this.doc = doc;
    this.beforeActiveId = doc.activeLayerId;
    this.beforeWidth = doc.width;
    this.beforeHeight = doc.height;
    this.beforeSelection = doc.selection
      ? { data: doc.selection.data, feather: doc.selection.feather }
      : null;
    for (const id of layerIds) {
      const layer = doc.layers.find((l) => l.id === id);
      if (layer) this.beforeSnapshots.push(snapshotLayer(layer));
    }
    return this;
  }

  // Mark a layer as newly added by this command; full layer re-added on redo.
  markAdded(layer: Layer): this {
    this.addedLayers.push(layer);
    return this;
  }

  // Mark a layer as removed by this command; capture full layer for restore.
  markRemoved(layer: Layer): this {
    this.removedLayers.push(layer);
    return this;
  }

  // Capture state of affected layers after the command runs.
  captureAfter(doc: DocumentModel, layerIds: string[]): this {
    this.afterActiveId = doc.activeLayerId;
    this.afterWidth = doc.width;
    this.afterHeight = doc.height;
    this.afterSelection = doc.selection
      ? { data: doc.selection.data, feather: doc.selection.feather }
      : null;
    for (const id of layerIds) {
      const layer = doc.layers.find((l) => l.id === id);
      if (layer) this.afterSnapshots.push(snapshotLayer(layer));
    }
    // also snapshot added layers so redo can restore their props
    for (const layer of this.addedLayers) {
      const l = doc.layers.find((x) => x.id === layer.id);
      if (l && !this.afterSnapshots.find((s) => s.layerId === layer.id)) {
        this.afterSnapshots.push(snapshotLayer(l));
      }
    }
    return this;
  }

  commit(): void {
    const entry: HistoryEntry = {
      id: uid('hist'),
      name: this.name,
      addedLayers: this.addedLayers,
      removedLayers: this.removedLayers,
      beforeSnapshots: this.beforeSnapshots,
      afterSnapshots: this.afterSnapshots,
      beforeActiveId: this.beforeActiveId,
      afterActiveId: this.afterActiveId,
      beforeWidth: this.beforeWidth,
      beforeHeight: this.beforeHeight,
      afterWidth: this.afterWidth,
      afterHeight: this.afterHeight,
      beforeSelection: this.beforeSelection,
      afterSelection: this.afterSelection,
    };
    this.history.push(entry);
  }
}
