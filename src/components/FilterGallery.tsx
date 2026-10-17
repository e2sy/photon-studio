// Filter Gallery: browse all filters with live thumbnails of the active
// layer, tune the strength, and apply in one place.

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '@/editor/store';

interface FilterDef {
  id: string;
  label: string;
  params: Record<string, number>;
  scaleHint: string;
}

const FILTERS: FilterDef[] = [
  { id: 'gaussian-blur', label: 'Gaussian Blur', params: { radius: 5 }, scaleHint: 'Radius 0-30' },
  { id: 'box-blur', label: 'Box Blur', params: { radius: 5 }, scaleHint: 'Radius 0-30' },
  { id: 'sharpen', label: 'Sharpen', params: { amount: 1 }, scaleHint: 'Amount 0-5' },
  { id: 'pixelate', label: 'Pixelate', params: { size: 10 }, scaleHint: 'Cell size 2-50' },
  { id: 'noise', label: 'Add Noise', params: { amount: 30 }, scaleHint: 'Amount 0-100' },
  { id: 'edge-detect', label: 'Edge Detect', params: {}, scaleHint: 'No parameters' },
  { id: 'sepia', label: 'Sepia', params: {}, scaleHint: 'No parameters' },
  { id: 'invert', label: 'Invert', params: {}, scaleHint: 'No parameters' },
  { id: 'grayscale', label: 'Grayscale', params: {}, scaleHint: 'No parameters' },
];

export function FilterGallery({ onClose }: { onClose: () => void }) {
  const applyFilter = useEditor((s) => s.applyFilter);
  const layer = useEditor((s) => s.activeLayer());
  const [selected, setSelected] = useState<string>('gaussian-blur');
  const [strength, setStrength] = useState(50);

  const isRaster = layer?.type === 'raster';
  const def = FILTERS.find((f) => f.id === selected)!;

  // Scale the raw strength slider into each filter's natural parameter range.
  const params = useMemo<Record<string, number>>((): Record<string, number> => {
    const t = strength / 100;
    switch (def.id) {
      case 'gaussian-blur': return { radius: Math.max(1, Math.round(t * 30)) };
      case 'box-blur': return { radius: Math.max(1, Math.round(t * 30)) };
      case 'sharpen': return { amount: Math.max(0.1, t * 5) };
      case 'pixelate': return { size: Math.max(2, Math.round(t * 50)) };
      case 'noise': return { amount: Math.max(1, Math.round(t * 100)) };
      default: return {};
    }
  }, [def.id, strength]);

  if (!isRaster) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
        <div className="bg-[#2a2a2a] border border-black/60 rounded-lg shadow-2xl p-6 text-sm text-neutral-300" onClick={(e) => e.stopPropagation()}>
          Select a raster layer to use the Filter Gallery.
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-[#2a2a2a] border border-black/60 rounded-lg shadow-2xl w-[560px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/40">
          <div className="text-sm font-medium text-neutral-100">Filter Gallery</div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-44 border-r border-black/40 overflow-y-auto py-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                className={`block w-full text-left px-3 py-1.5 text-xs ${
                  selected === f.id ? 'bg-blue-600 text-white' : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div>
              <div className="text-xs text-neutral-100 mb-1">{def.label}</div>
              <div className="text-[10px] text-neutral-500">{def.scaleHint}</div>
            </div>
            {Object.keys(params).length > 0 && (
              <label className="block">
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Strength</span>
                  <span className="tabular-nums">{strength}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </label>
            )}
            <div className="text-[10px] text-neutral-500 leading-relaxed">
              The filter applies to the active layer's pixels. Use the strength slider to tune
              intensity, then Apply. Undo with Ctrl+Z if the result is too strong.
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-black/40">
          <button onClick={onClose} className="ps-btn">Cancel</button>
          <button
            className="ps-btn-primary"
            onClick={() => {
              if (layer) {
                applyFilter(layer.id, def.id, params);
              }
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
