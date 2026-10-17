// Menu bar with dropdown menus: File, Edit, Image, Layer, Select, Filter, View, Help.

import { useState, useRef, useEffect } from 'react';
import { useEditor } from '@/editor/store';
import type { AdjustmentSettings } from '@/editor/types';
import { DEFAULT_ADJUSTMENT } from '@/editor/types';

export function MenuBar({ onCommand }: { onCommand: (cmd: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const menus: Record<string, { label: string; cmd: string; sep?: boolean; disabled?: boolean }[]> = {
    File: [
      { label: 'New...', cmd: 'file:new' },
      { label: 'Open Image...', cmd: 'file:open-image' },
      { label: 'Open Project...', cmd: 'file:open-project' },
      { label: 'Save Project', cmd: 'file:save' },
      { label: 'Save Project As...', cmd: 'file:save-as' },
      { label: 'Export PNG...', cmd: 'file:export-png' },
      { label: 'Export JPEG...', cmd: 'file:export-jpeg' },
      { label: 'Export WebP...', cmd: 'file:export-webp' },
      { label: 'Close Document', cmd: 'file:close' },
    ],
    Edit: [
      { label: 'Undo', cmd: 'edit:undo' },
      { label: 'Redo', cmd: 'edit:redo' },
      { label: 'Fill with Foreground', cmd: 'edit:fill-fg' },
      { label: 'Clear Selection', cmd: 'edit:clear-sel' },
    ],
    Image: [
      { label: 'Brightness / Contrast...', cmd: 'image:brightness-contrast' },
      { label: 'Hue / Saturation...', cmd: 'image:hue-saturation' },
      { label: 'Levels...', cmd: 'image:levels' },
      { label: 'Curves...', cmd: 'image:curves' },
      { label: 'Invert', cmd: 'image:invert' },
      { label: 'Grayscale', cmd: 'image:grayscale' },
    ],
    Layer: [
      { label: 'New Layer', cmd: 'layer:new' },
      { label: 'Duplicate Layer', cmd: 'layer:duplicate' },
      { label: 'Delete Layer', cmd: 'layer:delete' },
      { label: 'New Group', cmd: 'layer:group' },
      { label: 'Merge Visible', cmd: 'layer:merge-visible' },
      { label: 'Flatten Image', cmd: 'layer:flatten' },
      { label: 'Add White Mask', cmd: 'layer:mask-white' },
      { label: 'Add Black Mask', cmd: 'layer:mask-black' },
      { label: 'Apply Mask', cmd: 'layer:mask-apply' },
    ],
    Select: [
      { label: 'Select All', cmd: 'select:all' },
      { label: 'Deselect', cmd: 'select:deselect' },
    ],
    Filter: [
      { label: 'Filter Gallery...', cmd: 'filter:gallery' },
      { label: 'Gaussian Blur...', cmd: 'filter:gaussian-blur' },
      { label: 'Box Blur...', cmd: 'filter:box-blur' },
      { label: 'Sharpen...', cmd: 'filter:sharpen' },
      { label: 'Pixelate...', cmd: 'filter:pixelate' },
      { label: 'Add Noise...', cmd: 'filter:noise' },
      { label: 'Edge Detect', cmd: 'filter:edge-detect' },
      { label: 'Sepia', cmd: 'filter:sepia' },
      { label: 'Invert Colors', cmd: 'filter:invert' },
      { label: 'Grayscale', cmd: 'filter:grayscale' },
    ],
    View: [
      { label: 'Zoom In', cmd: 'view:zoom-in' },
      { label: 'Zoom Out', cmd: 'view:zoom-out' },
      { label: 'Actual Size (100%)', cmd: 'view:zoom-100' },
      { label: 'Fit on Screen', cmd: 'view:fit' },
    ],
    Help: [
      { label: 'About Photon Studio', cmd: 'help:about' },
    ],
  };

  return (
    <div ref={ref} className="h-7 bg-[#1d1d1d] border-b border-black/50 flex items-center text-xs text-neutral-300 select-none">
      {Object.keys(menus).map((name) => (
        <div key={name} className="relative">
          <button
            className={`px-3 h-7 hover:bg-white/10 ${open === name ? 'bg-white/10' : ''}`}
            onClick={() => setOpen(open === name ? null : name)}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <div className="absolute left-0 top-7 min-w-[200px] bg-[#2d2d2d] border border-black/60 shadow-xl py-1 z-50 rounded-sm">
              {menus[name].map((item, i) => (
                <button
                  key={i}
                  disabled={item.disabled}
                  className="block w-full text-left px-4 py-1.5 text-neutral-300 hover:bg-blue-600 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => {
                    onCommand(item.cmd);
                    setOpen(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Helper used by menu commands to create adjustment presets.
export function adjustmentPreset(kind: AdjustmentSettings['kind']): AdjustmentSettings {
  return { ...DEFAULT_ADJUSTMENT, kind };
}
