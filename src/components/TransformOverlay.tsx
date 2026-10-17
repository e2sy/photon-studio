// Free Transform: draws a bounding box with corner/edge handles over the
// active layer and supports drag-scale, rotate handle, flip, and commit/cancel.

import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@/editor/store';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

const HANDLES: { id: HandleId; cx: number; cy: number; cursor: string }[] = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { id: 'n', cx: 0.5, cy: 0, cursor: 'ns-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { id: 'e', cx: 1, cy: 0.5, cursor: 'ew-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
  { id: 's', cx: 0.5, cy: 1, cursor: 'ns-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'nesw-resize' },
  { id: 'w', cx: 0, cy: 0.5, cursor: 'ew-resize' },
  { id: 'rot', cx: 0.5, cy: -0.12, cursor: 'grab' },
];

const HANDLE_PX = 8;

export function TransformOverlay({
  bounds,
  zoom,
  panX,
  panY,
  onCommit,
  onPerspectiveCommit,
  onCancel,
  perspective = false,
}: {
  bounds: { x: number; y: number; width: number; height: number };
  zoom: number;
  panX: number;
  panY: number;
  onCommit: (t: { width: number; height: number; rotation: number; flipH: boolean; flipV: boolean }) => void;
  onPerspectiveCommit?: (corners: { x: number; y: number }[]) => void;
  onCancel: () => void;
  perspective?: boolean;
}) {
  const [state, setState] = useState({
    x: bounds.x,
    y: bounds.y,
    w: bounds.width,
    h: bounds.height,
    rot: 0,
    flipH: false,
    flipV: false,
  });
  const [corners, setCorners] = useState(
    perspective
      ? [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height },
        ]
      : null,
  );
  const drag = useRef<{ handle: HandleId | number; startX: number; startY: number; orig: typeof state; origCorners?: { x: number; y: number }[] } | null>(null);

  const toScreen = (dx: number, dy: number) => ({
    left: dx * zoom,
    top: dy * zoom,
  });

  const onHandleDown = (e: React.PointerEvent, handle: HandleId | number) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, orig: { ...state }, origCorners: corners ? [...corners] : undefined };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    const o = d.orig;
    if (perspective && d.origCorners && typeof d.handle === 'number') {
      const c = [...d.origCorners];
      c[d.handle] = { x: c[d.handle].x + dx, y: c[d.handle].y + dy };
      setCorners(c);
      return;
    }
    if (d.handle === 'rot') {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const a0 = Math.atan2(d.startY / zoom - cy, d.startX / zoom - cx);
      const a1 = Math.atan2(e.clientY / zoom - cy, e.clientX / zoom - cx);
      let deg = ((a1 - a0) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      setState((s) => ({ ...s, rot: Math.round(o.rot + deg) }));
      return;
    }
    let { x, y, w, h } = o;
    const hId = d.handle as string;
    if (hId.includes('e')) w = Math.max(8, o.w + dx);
    if (hId.includes('s')) h = Math.max(8, o.h + dy);
    if (hId.includes('w')) { w = Math.max(8, o.w - dx); x = o.x + (o.w - w); }
    if (hId.includes('n')) { h = Math.max(8, o.h - dy); y = o.y + (o.h - h); }
    if (e.shiftKey) {
      const ar = o.w / o.h;
      h = w / ar;
    }
    setState((s) => ({ ...s, x, y, w, h }));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (perspective && corners && onPerspectiveCommit) {
          onPerspectiveCommit(corners);
        } else {
          onCommit({ width: state.w, height: state.h, rotation: state.rot, flipH: state.flipH, flipV: state.flipV });
        }
      }
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, corners, perspective, onCommit, onPerspectiveCommit, onCancel]);

  const pos = toScreen(state.x, state.y);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: pos.left,
        top: pos.top,
        width: state.w * zoom,
        height: state.h * zoom,
        transform: `rotate(${state.rot}deg) scaleX(${state.flipH ? -1 : 1}) scaleY(${state.flipV ? -1 : 1})`,
        transformOrigin: 'center center',
      }}
    >
      {/* bounding box */}
      <div className="absolute inset-0 border border-blue-400 pointer-events-none" />

      {/* handles */}
      {perspective && corners
        ? corners.map((c, i) => (
            <div
              key={i}
              onPointerDown={(e) => onHandleDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute pointer-events-auto rounded-full bg-amber-400 border-2 border-amber-700"
              style={{
                width: HANDLE_PX + 2,
                height: HANDLE_PX + 2,
                left: (c.x - state.x) * zoom - (HANDLE_PX + 2) / 2,
                top: (c.y - state.y) * zoom - (HANDLE_PX + 2) / 2,
                cursor: 'move',
              }}
              title={`Drag corner ${i + 1}`}
            />
          ))
        : HANDLES.map((h) => (
        <div
          key={h.id}
          onPointerDown={(e) => onHandleDown(e, h.id)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={`absolute pointer-events-auto ${h.id === 'rot' ? 'rounded-full bg-blue-500' : 'bg-white border-2 border-blue-500'}`}
          style={{
            width: HANDLE_PX,
            height: HANDLE_PX,
            left: `calc(${h.cx * 100}% - ${HANDLE_PX / 2}px)`,
            top: `calc(${h.cy * 100}% - ${HANDLE_PX / 2}px)`,
            cursor: h.cursor,
          }}
          title={h.id === 'rot' ? 'Drag to rotate (Shift = 15° steps)' : 'Drag to resize (Shift = keep ratio)'}
        />
        ))}

      {/* readout */}
      <div className="absolute -top-7 left-0 bg-[#1d1d1d] text-[10px] text-neutral-300 px-2 py-0.5 rounded border border-white/10 whitespace-nowrap">
        {Math.round(state.w)} × {Math.round(state.h)} px{state.rot !== 0 && ` · ${state.rot}°`}
      </div>

      {/* actions */}
      <div className="absolute -bottom-8 right-0 flex gap-1 pointer-events-auto">
        <button
          className="bg-[#1d1d1d] hover:bg-[#333] text-neutral-300 text-[10px] px-2 py-1 rounded border border-white/10"
          onClick={() => setState((s) => ({ ...s, flipH: !s.flipH }))}
          title="Flip Horizontal"
        >
          Flip H
        </button>
        <button
          className="bg-[#1d1d1d] hover:bg-[#333] text-neutral-300 text-[10px] px-2 py-1 rounded border border-white/10"
          onClick={() => setState((s) => ({ ...s, flipV: !s.flipV }))}
          title="Flip Vertical"
        >
          Flip V
        </button>
        <button
          className="bg-[#333] hover:bg-[#444] text-neutral-200 text-[10px] px-2 py-1 rounded border border-white/10"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded"
          onClick={() => {
            if (perspective && corners) {
              onPerspectiveCommit?.(corners);
            } else {
              onCommit({ width: state.w, height: state.h, rotation: state.rot, flipH: state.flipH, flipV: state.flipV });
            }
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
