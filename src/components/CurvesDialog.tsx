// Interactive Curves adjustment: draggable spline over a 256px histogram-style
// grid. Commits via applyCurves in the store.

import { useRef, useState, useCallback, useEffect } from 'react';
import { useEditor } from '@/editor/store';
import { buildCurveLut } from '@/editor/retouch';

type Pt = { x: number; y: number };

export function CurvesDialog({ onClose }: { onClose: () => void }) {
  const layer = useEditor((s) => s.activeLayer());
  const applyCurves = useEditor((s) => s.applyCurves);
  const [points, setPoints] = useState<Pt[]>([
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]);
  const dragging = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SIZE = 280;

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      const p = (SIZE / 4) * g;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
    }
    // diagonal reference
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(0, SIZE); ctx.lineTo(SIZE, 0); ctx.stroke();
    // curve
    const lut = buildCurveLut(points);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const px = (i / 255) * SIZE;
      const py = SIZE - (lut[i] / 255) * SIZE;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // points
    for (const p of points) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc((p.x / 255) * SIZE, SIZE - (p.y / 255) * SIZE, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [points]);

  // Redraw on state change
  useEffect(() => {
    draw();
  }, [draw]);

  const toCurveCoords = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));
    return { x, y };
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toCurveCoords(e);
    const hit = points.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 12);
    if (hit >= 0) {
      dragging.current = hit;
    } else {
      setPoints((pts) => [...pts, p].sort((a, b) => a.x - b.x));
      dragging.current = points.length; // new point index after sort — approximate
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragging.current === null) return;
    const p = toCurveCoords(e);
    setPoints((pts) => {
      const idx = dragging.current!;
      const next = pts.map((q, i) => (i === idx ? p : q));
      // endpoints locked to axes
      if (idx === 0) next[0] = { x: 0, y: p.y };
      if (idx === next.length - 1) next[next.length - 1] = { x: 255, y: p.y };
      return next;
    });
  };

  const onUp = () => {
    dragging.current = null;
  };

  const onPointDown = (e: React.PointerEvent, idx: number) => {
    if (points.length > 2 && (e.button === 2 || e.altKey)) {
      setPoints((pts) => pts.filter((_, i) => i !== idx));
      return;
    }
    dragging.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  if (!layer) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-[#2a2a2a] border border-black/60 rounded-lg shadow-2xl w-[340px] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium text-neutral-100 mb-3">Curves</div>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="rounded bg-[#1a1a1a] border border-white/10 cursor-crosshair touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="text-[10px] text-neutral-500 mt-1">
          Click to add points · drag to shape · Alt+click a point to remove
        </div>
        <div className="flex gap-2 justify-end pt-3">
          <button onClick={() => setPoints([{ x: 0, y: 0 }, { x: 255, y: 255 }])} className="ps-btn">Reset</button>
          <button onClick={onClose} className="ps-btn">Cancel</button>
          <button
            onClick={() => { applyCurves(layer.id, points); onClose(); }}
            className="ps-btn-primary"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
