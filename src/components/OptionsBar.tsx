// Context-sensitive options bar for the active tool.

import { useEditor } from '@/editor/store';
import type { ToolId } from '@/editor/types';

export function OptionsBar() {
  const tool = useEditor((s) => s.tool);
  const ts = useEditor((s) => s.toolSettings);
  const set = useEditor((s) => s.setToolSettings);
  const color = useEditor((s) => s.color);
  const setColor = useEditor((s) => s.setColor);

  return (
    <div className="h-9 bg-[#2a2a2a] border-b border-black/40 flex items-center px-3 gap-4 text-xs text-neutral-300 overflow-x-auto">
      <span className="text-neutral-500 font-medium w-20 shrink-0">{labelFor(tool)}</span>

      {(tool === 'brush' || tool === 'eraser') && (
        <>
          <NumberSlider
            label="Size"
            value={tool === 'eraser' ? ts.eraserSize : ts.brushSize}
            min={1}
            max={500}
            onChange={(v) => set(tool === 'eraser' ? { eraserSize: v } : { brushSize: v })}
          />
          <NumberSlider
            label="Hardness"
            value={Math.round(ts.brushHardness * 100)}
            min={0}
            max={100}
            onChange={(v) => set({ brushHardness: v / 100 })}
          />
          <NumberSlider
            label="Opacity"
            value={Math.round(ts.brushOpacity * 100)}
            min={1}
            max={100}
            onChange={(v) => set({ brushOpacity: v / 100 })}
          />
          <NumberSlider
            label="Flow"
            value={Math.round(ts.brushFlow * 100)}
            min={1}
            max={100}
            onChange={(v) => set({ brushFlow: v / 100 })}
          />
          {tool === 'brush' && (
            <label className="flex items-center gap-1.5">
              <span className="text-neutral-500">Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-6 h-6 bg-transparent border border-white/20 rounded cursor-pointer"
              />
            </label>
          )}
        </>
      )}

      {(tool === 'marquee-rect' || tool === 'marquee-ellipse' || tool === 'lasso' || tool === 'magic-wand') && (
        <>
          <NumberSlider
            label="Feather"
            value={ts.selectionFeather}
            min={0}
            max={50}
            onChange={(v) => set({ selectionFeather: v })}
          />
          {tool === 'magic-wand' && (
            <NumberSlider
              label="Tolerance"
              value={ts.tolerance}
              min={0}
              max={255}
              onChange={(v) => set({ tolerance: v })}
            />
          )}
        </>
      )}

      {tool === 'paint-bucket' && (
        <NumberSlider
          label="Tolerance"
          value={ts.tolerance}
          min={0}
          max={255}
          onChange={(v) => set({ tolerance: v })}
        />
      )}

      {tool === 'clone-stamp' && (
        <>
          <NumberSlider label="Size" value={ts.retouchSize} min={4} max={300} onChange={(v) => set({ retouchSize: v })} />
          <NumberSlider label="Strength" value={Math.round(ts.retouchStrength * 100)} min={1} max={100} onChange={(v) => set({ retouchStrength: v / 100 })} />
          <span className="text-neutral-500">Alt+click to set clone source</span>
        </>
      )}

      {(tool === 'dodge-burn' || tool === 'smudge') && (
        <>
          <NumberSlider label="Size" value={ts.retouchSize} min={4} max={300} onChange={(v) => set({ retouchSize: v })} />
          <NumberSlider label="Strength" value={Math.round(ts.retouchStrength * 100)} min={1} max={100} onChange={(v) => set({ retouchStrength: v / 100 })} />
          {tool === 'dodge-burn' && (
            <label className="flex items-center gap-1.5">
              <span className="text-neutral-500">Mode</span>
              <select
                value={ts.dodgeMode}
                onChange={(e) => set({ dodgeMode: e.target.value as 'dodge' | 'burn' })}
                className="bg-[#1a1a1a] border border-white/15 rounded px-1.5 py-0.5 text-neutral-200"
              >
                <option value="dodge">Dodge</option>
                <option value="burn">Burn</option>
              </select>
            </label>
          )}
        </>
      )}

      {(tool === 'line' || tool === 'rectangle' || tool === 'ellipse') && (
        <>
          <NumberSlider
            label="Thickness"
            value={ts.shapeThickness}
            min={1}
            max={40}
            onChange={(v) => set({ shapeThickness: v })}
          />
          {tool !== 'line' && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={ts.shapeFill}
                onChange={(e) => set({ shapeFill: e.target.checked })}
                className="accent-blue-500"
              />
              <span className="text-neutral-500">Fill</span>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <span className="text-neutral-500">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 bg-transparent border border-white/20 rounded cursor-pointer"
            />
          </label>
        </>
      )}

      {tool === 'gradient' && (
        <>
          <label className="flex items-center gap-1.5">
            <span className="text-neutral-500">Type</span>
            <select
              value={ts.gradientType}
              onChange={(e) => set({ gradientType: e.target.value as 'linear' | 'radial' })}
              className="bg-[#1a1a1a] border border-white/15 rounded px-1.5 py-0.5 text-neutral-200"
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-neutral-500">From</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-6 h-6 bg-transparent border border-white/20 rounded cursor-pointer" />
            <span className="text-neutral-500">To</span>
            <input
              type="color"
              value={ts.secondaryColor}
              onChange={(e) => set({ secondaryColor: e.target.value })}
              className="w-6 h-6 bg-transparent border border-white/20 rounded cursor-pointer"
            />
          </label>
        </>
      )}

      {tool === 'text' && (
        <>
          <NumberSlider
            label="Size"
            value={ts.fontSize}
            min={6}
            max={400}
            onChange={(v) => set({ fontSize: v })}
          />
          <label className="flex items-center gap-1.5">
            <span className="text-neutral-500">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 bg-transparent border border-white/20 rounded cursor-pointer"
            />
          </label>
        </>
      )}

      {tool === 'crop' && (
        <label className="flex items-center gap-1.5">
          <span className="text-neutral-500">Aspect</span>
          <select
            value={ts.cropAspect}
            onChange={(e) => set({ cropAspect: e.target.value as typeof ts.cropAspect })}
            className="bg-[#1a1a1a] border border-white/15 rounded px-1.5 py-0.5 text-neutral-200"
          >
            <option value="free">Free</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="16:9">16:9</option>
          </select>
        </label>
      )}

      <div className="ml-auto flex items-center gap-2 text-neutral-500">
        <span>Active tool options</span>
      </div>
    </div>
  );
}

function labelFor(tool: ToolId): string {
  const map: Record<ToolId, string> = {
    move: 'Move',
    'marquee-rect': 'Rect. Select',
    'marquee-ellipse': 'Ellipse Select',
    lasso: 'Lasso',
    'magic-wand': 'Magic Wand',
    brush: 'Brush',
    eraser: 'Eraser',
    'paint-bucket': 'Paint Bucket',
    gradient: 'Gradient',
    eyedropper: 'Eyedropper',
    text: 'Text',
    crop: 'Crop',
    transform: 'Transform',
    'transform-perspective': 'Perspective',
    zoom: 'Zoom',
    hand: 'Hand',
    line: 'Line',
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    'clone-stamp': 'Clone Stamp',
    'dodge-burn': 'Dodge / Burn',
    smudge: 'Smudge',
  };
  return map[tool];
}

function NumberSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 shrink-0">
      <span className="text-neutral-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 accent-blue-500"
      />
      <span className="w-8 tabular-nums text-neutral-400">{value}</span>
    </label>
  );
}
