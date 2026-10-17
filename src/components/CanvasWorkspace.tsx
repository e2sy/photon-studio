// Main canvas workspace: renders the active document, handles pan/zoom,
// tool interactions (brush, selection, move, etc.), and overlays.

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor } from '@/editor/store';
import { renderToDisplay, compositeDocument } from '@/editor/renderer';
import { TransformOverlay } from './TransformOverlay';
import {
  paintStamp,
  createRectSelection,
  createEllipseSelection,
  createLassoSelection,
  magicWandSelection,
  paintBucketFill,
  type StrokePoint,
} from '@/editor/painting';
import { hexToRgb } from '@/editor/document';
import { hasCloneSource, getCloneSource, cloneStamp, dodgeBurn, smudge } from '@/editor/retouch';
import { paintMaskStamp } from '@/editor/painting';
import type { HistoryBuilder } from '@/editor/history';
import type { RasterLayer } from '@/editor/types';

interface InteractionState {
  type: 'none' | 'pan' | 'brush' | 'erase' | 'marquee' | 'ellipse' | 'lasso' | 'move' | 'eyedropper' | 'bucket' | 'crop' | 'transform' | 'space-pan' | 'line' | 'rect' | 'shape-ellipse' | 'gradient' | 'clone' | 'dodge' | 'smudge';
  cloneOrigin?: { dx: number; dy: number };
  cloneOriginDx?: number;
  cloneOriginDy?: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: { x: number; y: number }[];
  strokePoints: StrokePoint[];
  lastPanX: number;
  lastPanY: number;
}

export function CanvasWorkspace() {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<InteractionState>({
    type: 'none', startX: 0, startY: 0, currentX: 0, currentY: 0,
    points: [], strokePoints: [], lastPanX: 0, lastPanY: 0,
  });
  // Live strokes mutate pixels during drag; the builder captures before/after
  // snapshots so history is committed once on pointer-up without re-applying.
  const pendingStroke = useRef<{ builder: HistoryBuilder; layerId: string } | null>(null);

  const startLiveStroke = (doc: import('@/editor/types').DocumentModel, layer: RasterLayer, name: string) => {
    const history = useEditor.getState().histories[doc.id];
    if (!history) return;
    pendingStroke.current = {
      builder: history.begin().captureBefore(doc, name, [layer.id]),
      layerId: layer.id,
    };
  };

  const commitLiveStroke = (doc: import('@/editor/types').DocumentModel, label: string | null) => {
    const pending = pendingStroke.current;
    pendingStroke.current = null;
    if (!pending || !label) return;
    const layer = doc.layers.find((l) => l.id === pending.layerId);
    if (!layer) return;
    pending.builder.captureAfter(doc, [pending.layerId]).commit();
    doc.saved = false;
  };
  const [, forceRender] = useState(0);
  const [transformActive, setTransformActive] = useState(false);

  const activeDoc = useEditor((s) => s.activeDoc());
  const tool = useEditor((s) => s.tool);
  const toolSettings = useEditor((s) => s.toolSettings);
  const color = useEditor((s) => s.color);
  const documents = useEditor((s) => s.documents);
  const prefs = useEditor((s) => s.prefs);
  const activeLayerId = useEditor((s) => s.activeDoc()?.activeLayerId ?? null);
  const activeLayerBounds = useEditor((s) => {
    const doc = s.activeDoc();
    if (!doc || !doc.activeLayerId) return null;
    const l = doc.layers.find((x) => x.id === doc.activeLayerId);
    if (!l || l.type === 'group' || l.type === 'adjustment') return null;
    return { x: l.x, y: l.y, width: l.width, height: l.height };
  });

  // Render the document whenever it changes.
  const renderDoc = useCallback(() => {
    const doc = useEditor.getState().activeDoc();
    const canvas = displayRef.current;
    if (!doc || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    renderToDisplay(doc, ctx, canvas, doc.zoom);
    forceRender((n) => n + 1);
  }, []);

  useEffect(() => {
    renderDoc();
  }, [renderDoc, activeDoc, documents, tool, toolSettings, color]);

  // Enter transform mode via Ctrl+T or the transform tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const s = useEditor.getState();
        if (s.activeLayer()) setTransformActive(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fit to screen on first load of a document.
  useEffect(() => {
    const doc = useEditor.getState().activeDoc();
    const container = containerRef.current;
    if (!doc || !container) return;
    if (doc.zoom !== 1) return;
    const fit = Math.min(
      (container.clientWidth - 80) / doc.width,
      (container.clientHeight - 80) / doc.height,
      1,
    );
    useEditor.getState().setZoom(doc.id, fit);
  }, [activeDoc?.id]);

  // Screen <-> document coordinate conversion.
  const toDocCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = displayRef.current!;
    const doc = useEditor.getState().activeDoc()!;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / doc.zoom;
    const y = (clientY - rect.top) / doc.zoom;
    return { x: Math.floor(x), y: Math.floor(y) };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const store = useEditor.getState();
    const doc = store.activeDoc();
    if (!doc) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toDocCoords(e.clientX, e.clientY);
    const st = interaction.current;
    st.startX = x; st.startY = y; st.currentX = x; st.currentY = y;

    if (e.button === 1 || (e.button === 0 && (store.tool === 'hand' || e.altKey))) {
      st.type = 'space-pan';
      st.lastPanX = e.clientX;
      st.lastPanY = e.clientY;
      return;
    }

    switch (store.tool) {
      case 'brush':
      case 'eraser': {
        const layer = store.activeLayer() as RasterLayer | null;
        if (!layer || layer.type !== 'raster') return;
        st.type = store.tool === 'eraser' ? 'erase' : 'brush';
        st.strokePoints = [{ x, y, pressure: e.pressure || 1 }];
        const paintingMask = store.paintOnMask && layer.mask;
        startLiveStroke(doc, layer, paintingMask ? 'Paint Mask' : st.type === 'erase' ? 'Erase' : 'Brush Stroke');
        if (paintingMask) {
          const { r } = hexToRgb(store.color);
          paintMaskStamp(layer.mask!.data, x - layer.x, y - layer.y, toolSettings.brushSize, toolSettings.brushHardness, toolSettings.brushOpacity * toolSettings.brushFlow, r);
        } else {
          const c = hexToRgb(store.color);
          const size = store.tool === 'eraser' ? toolSettings.eraserSize : toolSettings.brushSize;
          paintStamp(layer.data, x - layer.x, y - layer.y, size, toolSettings.brushHardness, toolSettings.brushOpacity * toolSettings.brushFlow, c, store.tool === 'eraser');
        }
        renderDoc();
        return;
      }
      case 'clone-stamp': {
        const layer = store.activeLayer() as RasterLayer | null;
        if (!layer || layer.type !== 'raster') return;
        if (e.altKey) {
          // Alt+click sets the clone source
          store.setCloneSource(x, y);
          st.type = 'none';
          return;
        }
        if (!hasCloneSource()) return;
        st.type = 'clone';
        const src = getCloneSource();
        st.cloneOrigin = src ? { dx: x - src.x, dy: y - src.y } : { dx: 0, dy: 0 };
        st.strokePoints = [{ x, y, pressure: e.pressure || 1 }];
        startLiveStroke(doc, layer, 'Clone Stamp');
        // paint the first stamp immediately
        cloneStamp(layer.data, x - layer.x, y - layer.y, toolSettings.retouchSize, 0.6, toolSettings.retouchStrength, st.cloneOrigin);
        renderDoc();
        return;
      }
      case 'dodge-burn':
      case 'smudge': {
        const layer = store.activeLayer() as RasterLayer | null;
        if (!layer || layer.type !== 'raster') return;
        st.type = store.tool === 'smudge' ? 'smudge' : 'dodge';
        st.strokePoints = [{ x, y, pressure: e.pressure || 1 }];
        startLiveStroke(doc, layer, st.type === 'dodge' ? (toolSettings.dodgeMode === 'dodge' ? 'Dodge' : 'Burn') : 'Smudge');
        return;
      }
      case 'marquee-rect':
        st.type = 'marquee';
        st.points = [];
        return;
      case 'marquee-ellipse':
        st.type = 'ellipse';
        return;
      case 'lasso':
        st.type = 'lasso';
        st.points = [{ x, y }];
        return;
      case 'magic-wand': {
        const comp = compositeDocument(doc);
        const sel = magicWandSelection(doc, comp, x, y, store.toolSettings.tolerance, store.toolSettings.selectionFeather);
        store.setSelection(sel);
        return;
      }
      case 'eyedropper': {
        const comp = compositeDocument(doc);
        const i = (y * doc.width + x) * 4;
        const r = comp.data[i], g = comp.data[i + 1], b = comp.data[i + 2];
        const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
        store.setColor(hex);
        return;
      }
      case 'paint-bucket': {
        const layer = store.activeLayer() as RasterLayer | null;
        if (!layer || layer.type !== 'raster') return;
        st.type = 'bucket';
        store.paintBucket(layer.id, x, y);
        renderDoc();
        return;
      }
      case 'transform':
        setTransformActive(true);
        return;
      case 'transform-perspective':
        setTransformActive(true);
        return;
      case 'move': {
        st.type = 'move';
        return;
      }
      case 'line':
      case 'rectangle':
      case 'ellipse':
        st.type = store.tool === 'line' ? 'line' : store.tool === 'rectangle' ? 'rect' : 'shape-ellipse';
        return;
      case 'gradient':
        st.type = 'gradient';
        return;
      case 'crop':
        st.type = 'crop';
        return;
      case 'zoom':
        store.setZoom(doc.id, e.altKey ? doc.zoom * 0.8 : doc.zoom * 1.25);
        return;
      default:
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const store = useEditor.getState();
    const doc = store.activeDoc();
    if (!doc) return;
    const st = interaction.current;
    const { x, y } = toDocCoords(e.clientX, e.clientY);
    st.currentX = x; st.currentY = y;

    if (st.type === 'space-pan') {
      const dx = e.clientX - st.lastPanX;
      const dy = e.clientY - st.lastPanY;
      st.lastPanX = e.clientX;
      st.lastPanY = e.clientY;
      store.setPan(doc.id, doc.panX + dx, doc.panY + dy);
      return;
    }

    if (st.type === 'brush' || st.type === 'erase') {
      const store2 = useEditor.getState();
      const layer = store2.activeLayer() as RasterLayer | null;
      if (!layer || layer.type !== 'raster') return;
      st.strokePoints.push({ x, y, pressure: e.pressure || 1 });
      const last = st.strokePoints[st.strokePoints.length - 2];
      const cur = st.strokePoints[st.strokePoints.length - 1];
      const size = st.type === 'erase' ? toolSettings.eraserSize : toolSettings.brushSize;
      const dist = Math.hypot(cur.x - last.x, cur.y - last.y);
      const spacing = Math.max(1, size * 0.15);
      const steps = Math.max(1, Math.ceil(dist / spacing));
      if (store2.paintOnMask && layer.mask && st.type === 'brush') {
        const { r } = hexToRgb(store2.color);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const px = last.x + (cur.x - last.x) * t;
          const py = last.y + (cur.y - last.y) * t;
          paintMaskStamp(layer.mask.data, px - layer.x, py - layer.y, size, toolSettings.brushHardness, toolSettings.brushOpacity * toolSettings.brushFlow * (e.pressure || 1), r);
        }
      } else {
        const c = hexToRgb(store2.color);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const px = last.x + (cur.x - last.x) * t;
          const py = last.y + (cur.y - last.y) * t;
          paintStamp(layer.data, px - layer.x, py - layer.y, size, toolSettings.brushHardness, toolSettings.brushOpacity * toolSettings.brushFlow * (e.pressure || 1), c, st.type === 'erase');
        }
      }
      renderDoc();
      return;
    }

    if (st.type === 'dodge' || st.type === 'smudge') {
      st.strokePoints.push({ x, y, pressure: e.pressure || 1 });
      const layer = store.activeLayer() as RasterLayer | null;
      if (layer && layer.type === 'raster' && st.strokePoints.length > 1) {
        const last = st.strokePoints[st.strokePoints.length - 2];
        const cur = st.strokePoints[st.strokePoints.length - 1];
        const size = toolSettings.retouchSize;
        const strength = toolSettings.retouchStrength * (e.pressure || 1);
        if (st.type === 'dodge') {
          dodgeBurn(layer.data, cur.x - layer.x, cur.y - layer.y, size, 0.6, strength, toolSettings.dodgeMode);
        } else {
          smudge(layer.data, last.x - layer.x, last.y - layer.y, cur.x - layer.x, cur.y - layer.y, size, toolSettings.retouchStrength);
        }
      }
      renderDoc();
      return;
    }

    if (st.type === 'clone') {
      st.strokePoints.push({ x, y, pressure: e.pressure || 1 });
      const layer = store.activeLayer() as RasterLayer | null;
      if (layer && layer.type === 'raster' && st.cloneOrigin) {
        const last = st.strokePoints[st.strokePoints.length - 2];
        const cur = st.strokePoints[st.strokePoints.length - 1];
        const size = toolSettings.retouchSize;
        const dist = Math.hypot(cur.x - last.x, cur.y - last.y);
        const spacing = Math.max(1, size * 0.25);
        const steps = Math.max(1, Math.ceil(dist / spacing));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const px = last.x + (cur.x - last.x) * t;
          const py = last.y + (cur.y - last.y) * t;
          cloneStamp(layer.data, px - layer.x, py - layer.y, size, 0.6, toolSettings.retouchStrength, st.cloneOrigin);
        }
      }
      renderDoc();
      return;
    }

    if (st.type === 'move') {
      const layer = store.activeLayer();
      if (!layer) return;
      store.moveLayerBy(layer.id, x - st.startX, y - st.startY);
      st.startX = x; st.startY = y;
      renderDoc();
      return;
    }

    if (st.type === 'line' || st.type === 'rect' || st.type === 'shape-ellipse' || st.type === 'gradient') {
      drawOverlay();
      return;
    }

    if (st.type === 'lasso') {
      st.points.push({ x, y });
      drawOverlay();
      return;
    }
    if (st.type === 'marquee' || st.type === 'ellipse' || st.type === 'crop') {
      drawOverlay();
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const store = useEditor.getState();
    const doc = store.activeDoc();
    if (!doc) return;
    const st = interaction.current;

    if (st.type === 'brush' || st.type === 'erase') {
      commitLiveStroke(doc, st.strokePoints.length > 0 ? 'Stroke' : null);
      st.strokePoints = [];
      st.type = 'none';
      renderDoc();
      return;
    }

    if (st.type === 'dodge' || st.type === 'smudge' || st.type === 'clone') {
      commitLiveStroke(doc, st.strokePoints.length > 0 ? 'Retouch' : null);
      st.strokePoints = [];
      st.type = 'none';
      renderDoc();
      return;
    }

    if (st.type === 'move') {
      const layer = store.activeLayer();
      if (layer) {
        // record history for the move
        store.setLayerPosition(layer.id, layer.x, layer.y);
      }
      st.type = 'none';
      return;
    }

    if (st.type === 'marquee') {
      const x0 = Math.min(st.startX, st.currentX);
      const y0 = Math.min(st.startY, st.currentY);
      const w = Math.abs(st.currentX - st.startX);
      const h = Math.abs(st.currentY - st.startY);
      if (w > 1 && h > 1) {
        const sel = createRectSelection(doc, x0, y0, w, h, store.toolSettings.selectionFeather);
        store.setSelection(sel);
      } else {
        store.clearSelection();
      }
      st.type = 'none';
      clearOverlay();
      return;
    }

    if (st.type === 'ellipse') {
      const cx = (st.startX + st.currentX) / 2;
      const cy = (st.startY + st.currentY) / 2;
      const rx = Math.abs(st.currentX - st.startX) / 2;
      const ry = Math.abs(st.currentY - st.startY) / 2;
      if (rx > 1 && ry > 1) {
        const sel = createEllipseSelection(doc, cx, cy, rx, ry, store.toolSettings.selectionFeather);
        store.setSelection(sel);
      }
      st.type = 'none';
      clearOverlay();
      return;
    }

    if (st.type === 'lasso') {
      if (st.points.length > 2) {
        const sel = createLassoSelection(doc, st.points, store.toolSettings.selectionFeather);
        store.setSelection(sel);
      }
      st.type = 'none';
      st.points = [];
      clearOverlay();
      return;
    }

    if (st.type === 'crop') {
      const x0 = Math.min(st.startX, st.currentX);
      const y0 = Math.min(st.startY, st.currentY);
      const w = Math.abs(st.currentX - st.startX);
      const h = Math.abs(st.currentY - st.startY);
      if (w > 1 && h > 1) {
        // crop: resize document and offset all layers
        cropDocument(doc, x0, y0, w, h);
      }
      st.type = 'none';
      clearOverlay();
      renderDoc();
      return;
    }

    if (st.type === 'line' || st.type === 'rect' || st.type === 'shape-ellipse') {
      const layer = store.activeLayer();
      if (layer) {
        const shape = st.type === 'line' ? 'line' : st.type === 'rect' ? 'rect' : 'ellipse';
        store.drawShape(layer.id, shape as 'line' | 'rect' | 'ellipse', st.startX, st.startY, st.currentX, st.currentY);
      }
      st.type = 'none';
      clearOverlay();
      renderDoc();
      return;
    }

    if (st.type === 'gradient') {
      const layer = store.activeLayer();
      if (layer) {
        store.applyGradientStroke(layer.id, st.startX, st.startY, st.currentX, st.currentY);
      }
      st.type = 'none';
      clearOverlay();
      renderDoc();
      return;
    }

    st.type = 'none';
  };

  const onWheel = (e: React.WheelEvent) => {
    const store = useEditor.getState();
    const doc = store.activeDoc();
    if (!doc) return;
    if (e.ctrlKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      store.setZoom(doc.id, doc.zoom * factor);
    } else {
      store.setPan(doc.id, doc.panX - e.deltaX, doc.panY - e.deltaY);
    }
  };

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const canvas = displayRef.current;
    const doc = useEditor.getState().activeDoc();
    if (!overlay || !canvas || !doc) return;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const st = interaction.current;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const z = doc.zoom;
    if (st.type === 'marquee' || st.type === 'crop' || st.type === 'line' || st.type === 'rect' || st.type === 'shape-ellipse' || st.type === 'gradient') {
      const x0 = Math.min(st.startX, st.currentX) * z;
      const y0 = Math.min(st.startY, st.currentY) * z;
      const w = Math.abs(st.currentX - st.startX) * z;
      const h = Math.abs(st.currentY - st.startY) * z;
      ctx.strokeRect(x0, y0, w, h);
      if (st.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(st.startX * z, st.startY * z);
        ctx.lineTo(st.currentX * z, st.currentY * z);
        ctx.stroke();
      }
    } else if (st.type === 'ellipse') {
      const cx = (st.startX + st.currentX) / 2 * z;
      const cy = (st.startY + st.currentY) / 2 * z;
      const rx = Math.abs(st.currentX - st.startX) / 2 * z;
      const ry = Math.abs(st.currentY - st.startY) / 2 * z;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (st.type === 'lasso' && st.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(st.points[0].x * z, st.points[0].y * z);
      for (const p of st.points) ctx.lineTo(p.x * z, p.y * z);
      ctx.stroke();
    }
  }, []);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  if (!activeDoc) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1a1a] text-neutral-500 text-sm">
        No document open. Use File &gt; New or Open to begin.
      </div>
    );
  }

  const doc = activeDoc;
  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-[#1a1a1a]"
      onWheel={onWheel}
      style={{ cursor: tool === 'hand' ? 'grab' : tool === 'brush' || tool === 'eraser' ? 'crosshair' : 'default' }}
    >
      <div
        className="absolute"
        style={{
          left: `calc(50% + ${doc.panX}px)`,
          top: `calc(50% + ${doc.panY}px)`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="relative shadow-2xl shadow-black/50 ring-1 ring-black/40">
          <canvas
            ref={displayRef}
            className="block bg-[#c8c8c8]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 pointer-events-none"
          />
          {transformActive && activeLayerId && activeLayerBounds && (
            <TransformOverlay
              bounds={activeLayerBounds}
              zoom={doc.zoom}
              panX={doc.panX}
              panY={doc.panY}
              perspective={tool === 'transform-perspective'}
              onCommit={(t) => {
                const s = useEditor.getState();
                if (activeLayerId) {
                  s.transformLayer(activeLayerId, {
                    x: Math.round(activeLayerBounds.x + (t.width - activeLayerBounds.width) / 2),
                    y: Math.round(activeLayerBounds.y + (t.height - activeLayerBounds.height) / 2),
                    width: Math.round(t.width),
                    height: Math.round(t.height),
                    rotation: t.rotation,
                    flipH: t.flipH,
                    flipV: t.flipV,
                  });
                }
                setTransformActive(false);
                renderDoc();
              }}
              onPerspectiveCommit={(corners) => {
                const s = useEditor.getState();
                if (activeLayerId) s.perspectiveWarp(activeLayerId, corners);
                setTransformActive(false);
                renderDoc();
              }}
              onCancel={() => setTransformActive(false)}
            />
          )}
        </div>
      </div>
      {prefs.showRulers && <Rulers doc={doc} />}
      <ZoomControl />
    </div>
  );
}

function cropDocument(doc: import('@/editor/types').DocumentModel, x: number, y: number, w: number, h: number) {
  const store = useEditor.getState();
  // offset each layer
  for (const layer of doc.layers) {
    layer.x -= x;
    layer.y -= y;
  }
  doc.width = Math.round(w);
  doc.height = Math.round(h);
  doc.saved = false;
  store.setZoom(doc.id, doc.zoom);
}

function Rulers({ doc }: { doc: import('@/editor/types').DocumentModel }) {
  return (
    <>
      <div className="absolute top-0 left-6 right-0 h-6 bg-[#2a2a2a] border-b border-black/40 text-[10px] text-neutral-500 flex items-center overflow-hidden">
        <span className="px-2">0</span>
      </div>
      <div className="absolute top-6 left-0 bottom-6 w-6 bg-[#2a2a2a] border-r border-black/40 text-[10px] text-neutral-500 flex flex-col items-center overflow-hidden">
        <span className="py-2 rotate-90">0</span>
      </div>
    </>
  );
}

function ZoomControl() {
  const zoom = useEditor((s) => s.activeDoc()?.zoom ?? 1);
  const activeDocId = useEditor((s) => s.activeDocId);
  const setZoom = useEditor((s) => s.setZoom);
  if (!activeDocId) return null;
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#2a2a2a] border border-black/40 rounded-md px-2 py-1 text-xs text-neutral-300 shadow-lg">
      <button
        className="px-2 py-0.5 hover:bg-white/10 rounded"
        onClick={() => setZoom(activeDocId, zoom / 1.25)}
      >
        −
      </button>
      <span className="w-16 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <button
        className="px-2 py-0.5 hover:bg-white/10 rounded"
        onClick={() => setZoom(activeDocId, zoom * 1.25)}
      >
        +
      </button>
      <button
        className="px-2 py-0.5 hover:bg-white/10 rounded ml-1"
        onClick={() => setZoom(activeDocId, 1)}
      >
        1:1
      </button>
    </div>
  );
}
