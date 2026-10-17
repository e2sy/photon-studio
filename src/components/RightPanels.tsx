// Right-side panels: Layers, History, Adjustments, Color.

import { useState } from 'react';
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Copy,
  Folder,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Layers as LayersIcon,
  History as HistoryIcon,
  Sliders,
  Palette,
  Type as TypeIcon,
} from 'lucide-react';
import { useEditor } from '@/editor/store';
import type { Layer, BlendMode, RasterLayer } from '@/editor/types';
import { DEFAULT_SHADOW, DEFAULT_GLOW, DEFAULT_STROKE } from '@/editor/layerStyles';
import type { LayerStyle } from '@/editor/layerStyles';
import { adjustmentPreset } from './MenuBar';

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference',
];

export function RightPanels() {
  const panel = useEditor((s) => s.activePanel);
  const setPanel = useEditor((s) => s.setPanel);

  return (
    <div className="w-60 bg-[#252525] border-l border-black/50 flex flex-col">
      <div className="flex border-b border-black/40 text-xs">
        {[
          { id: 'layers' as const, icon: LayersIcon, label: 'Layers' },
          { id: 'history' as const, icon: HistoryIcon, label: 'History' },
          { id: 'adjustments' as const, icon: Sliders, label: 'Adj' },
          { id: 'text' as const, icon: TypeIcon, label: 'Text' },
          { id: 'color' as const, icon: Palette, label: 'Color' },
        ].map((p) => {
          const Icon = p.icon;
          const active = panel === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 ${
                active ? 'bg-[#1d1d1d] text-neutral-100 border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              title={p.label}
            >
              <Icon size={13} />
              <span className="hidden xl:inline">{p.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {panel === 'layers' && <LayersPanel />}
        {panel === 'history' && <HistoryPanel />}
        {panel === 'adjustments' && <AdjustmentsPanel />}
        {panel === 'color' && <ColorPanel />}
        {panel === 'text' && <TextPanel />}
      </div>
    </div>
  );
}

function LayersPanel() {
  const doc = useEditor((s) => s.activeDoc());
  const select = useEditor((s) => s.selectLayer);
  const setLayerProp = useEditor((s) => s.setLayerProp);
  const deleteLayer = useEditor((s) => s.deleteLayer);
  const duplicate = useEditor((s) => s.duplicateLayer);
  const addBlank = useEditor((s) => s.addBlankLayer);
  const addGroup = useEditor((s) => s.addGroup);
  const addMask = useEditor((s) => s.addMask);
  const reorder = useEditor((s) => s.reorderLayer);
  const paintOnMask = useEditor((s) => s.paintOnMask);
  const setPaintOnMask = useEditor((s) => s.setPaintOnMask);
  const [dragId, setDragId] = useState<string | null>(null);

  if (!doc) return <div className="p-3 text-xs text-neutral-500">No document</div>;

  const layers = [...doc.layers].reverse(); // top of stack first
  const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
  const hasMask = activeLayer?.mask != null;

  return (
    <div className="flex flex-col h-full">
      {hasMask && (
        <button
          onClick={() => setPaintOnMask(!paintOnMask)}
          className={`px-2 py-1 text-[10px] uppercase tracking-wide border-b border-black/30 ${
            paintOnMask ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-neutral-300 bg-[#222]'
          }`}
          title="When on, the brush paints on the layer mask instead of the layer pixels"
        >
          Paint on mask {paintOnMask ? 'ON' : 'OFF'}
        </button>
      )}
      <div className="flex-1 overflow-y-auto py-1">
        {layers.map((layer) => {
          const active = doc.activeLayerId === layer.id;
          const depth = getLayerDepth(layer, doc.layers);
          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => setDragId(layer.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (!dragId || dragId === layer.id) return;
                // Drop onto a group name re-parents; drop on body reorders.
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const onName = e.clientY - rect.top < rect.height * 0.35 && layer.type === 'group';
                if (onName) {
                  useEditor.getState().setLayerProp(dragId, 'parentId', layer.id);
                } else {
                  const idx = doc.layers.findIndex((l) => l.id === layer.id);
                  const src = doc.layers.find((l) => l.id === dragId);
                  const target = src && src.parentId !== layer.id ? { ...src, parentId: layer.parentId } : null;
                  if (target) useEditor.getState().setLayerProp(dragId, 'parentId', layer.parentId);
                  reorder(dragId, idx);
                }
                setDragId(null);
              }}
              onClick={() => select(layer.id)}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer ${
                active ? 'bg-blue-600/30 border-l-2 border-blue-500' : 'hover:bg-white/5 border-l-2 border-transparent'
              }`}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {layer.type === 'group' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLayerProp(layer.id, 'collapsed', !(layer as import('@/editor/types').GroupLayer).collapsed); }}
                  className="text-neutral-400 hover:text-white"
                >
                  {(layer as import('@/editor/types').GroupLayer).collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setLayerProp(layer.id, 'visible', !layer.visible); }}
                className="text-neutral-400 hover:text-white"
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <LayerThumb layer={layer} />
              <span className={`flex-1 truncate ${active ? 'text-neutral-100' : 'text-neutral-300'}`}>
                {layer.type === 'text' && <TypeIcon size={10} className="inline mr-1" />}
                {layer.type === 'group' && <Folder size={10} className="inline mr-1" />}
                {layer.name}
              </span>
              {layer.mask && (
                <span className="text-neutral-500" title="Has layer mask">
                  <LayersIcon size={10} />
                </span>
              )}
              {layer.style && (layer.style.shadow || layer.style.glow || layer.style.stroke) && (
                <span className="text-amber-400" title="Has layer style">fx</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setLayerProp(layer.id, 'locked', !layer.locked); }}
                className="text-neutral-500 hover:text-white"
              >
                {layer.locked ? <Lock size={11} /> : <Unlock size={11} className="opacity-30" />}
              </button>
            </div>
          );
        })}
      </div>
      <LayerControls doc={doc} />
      <LayerStylesEditor doc={doc} />
      <LayerProps doc={doc} />
      <LayerActions
        onAdd={() => addBlank()}
        onGroup={() => addGroup()}
        onDup={() => { const l = doc.layers.find((l) => l.id === doc.activeLayerId); if (l) duplicate(l.id); }}
        onDelete={() => { if (doc.activeLayerId) deleteLayer(doc.activeLayerId); }}
        onMaskWhite={() => { if (doc.activeLayerId) addMask(doc.activeLayerId, true); }}
        onMaskBlack={() => { if (doc.activeLayerId) addMask(doc.activeLayerId, false); }}
      />
    </div>
  );
}

function getLayerDepth(layer: Layer, all: Layer[]): number {
  let depth = 0;
  let cur = layer;
  while (cur.parentId) {
    depth++;
    const parent = all.find((l) => l.id === cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return depth;
}

function LayerThumb({ layer }: { layer: Layer }) {
  const size = 24;
  if (layer.type === 'raster') {
    const rl = layer as RasterLayer;
    const c = document.createElement('canvas');
    c.width = rl.width; c.height = rl.height;
    c.getContext('2d')!.putImageData(rl.data, 0, 0);
    const url = c.toDataURL();
    return (
      <div
        className="shrink-0 rounded-sm border border-black/40 bg-[#c8c8c8]"
        style={{
          width: size, height: size,
          backgroundImage: `url(${url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }
  return (
    <div className="shrink-0 w-6 h-6 rounded-sm border border-black/40 bg-[#333] flex items-center justify-center text-neutral-500">
      {layer.type === 'text' ? <TypeIcon size={12} /> : layer.type === 'group' ? <Folder size={12} /> : <Sliders size={12} />}
    </div>
  );
}

function LayerControls({ doc }: { doc: import('@/editor/types').DocumentModel }) {
  const setLayerProp = useEditor((s) => s.setLayerProp);
  const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (!layer) return null;
  return (
    <div className="px-2 py-1.5 border-t border-black/30 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={layer.blendMode}
          onChange={(e) => setLayerProp(layer.id, 'blendMode', e.target.value as BlendMode)}
          className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-1.5 py-0.5 text-neutral-200 capitalize"
        >
          {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-neutral-500 w-12">Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => setLayerProp(layer.id, 'opacity', Number(e.target.value) / 100)}
          className="flex-1 accent-blue-500"
        />
        <span className="w-8 tabular-nums text-neutral-400">{Math.round(layer.opacity * 100)}</span>
      </div>
    </div>
  );
}

function LayerProps({ doc }: { doc: import('@/editor/types').DocumentModel }) {
  const rename = useEditor((s) => s.renameLayer);
  const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (!layer) return null;
  return (
    <div className="px-2 py-1 border-t border-black/30">
      <input
        value={layer.name}
        onChange={(e) => rename(layer.id, e.target.value)}
        className="w-full bg-[#1a1a1a] border border-white/10 rounded px-1.5 py-0.5 text-xs text-neutral-200"
      />
    </div>
  );
}

function LayerActions({
  onAdd, onGroup, onDup, onDelete, onMaskWhite, onMaskBlack,
}: {
  onAdd: () => void; onGroup: () => void; onDup: () => void; onDelete: () => void;
  onMaskWhite: () => void; onMaskBlack: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-black/30 bg-[#222]">
      <ActionBtn icon={Plus} title="New Layer" onClick={onAdd} />
      <ActionBtn icon={Folder} title="New Group" onClick={onGroup} />
      <ActionBtn icon={Copy} title="Duplicate" onClick={onDup} />
      <ActionBtn icon={Trash2} title="Delete" onClick={onDelete} />
      <div className="flex-1" />
      <ActionBtn icon={Eye} title="White Mask" onClick={onMaskWhite} />
      <ActionBtn icon={EyeOff} title="Black Mask" onClick={onMaskBlack} />
    </div>
  );
}

function ActionBtn({ icon: Icon, title, onClick }: { icon: React.ComponentType<{ size?: number | string }>; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 rounded">
      <Icon size={14} />
    </button>
  );
}

function LayerStylesEditor({ doc }: { doc: import('@/editor/types').DocumentModel }) {
  const setLayerStyle = useEditor((s) => s.setLayerStyle);
  const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (!layer) return null;
  const style = layer.style;

  const patchStyle = (patch: Partial<LayerStyle>) => {
    setLayerStyle(layer.id, { ...DEFAULT_LAYER_STYLE_RESET, ...style, ...patch });
  };

  return (
    <div className="px-2 py-1.5 border-t border-black/30 text-xs space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-neutral-500 uppercase tracking-wide text-[10px] flex-1">Layer Style</span>
        {style && (
          <button
            onClick={() => setLayerStyle(layer.id, null)}
            className="text-[10px] text-neutral-500 hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => patchStyle({ shadow: style?.shadow ? { ...style.shadow, enabled: !style.shadow.enabled } : { ...DEFAULT_SHADOW } })}
          className={`flex-1 py-0.5 rounded text-[10px] ${style?.shadow?.enabled ? 'bg-blue-600 text-white' : 'bg-[#1d1d1d] text-neutral-400 hover:bg-[#333]'}`}
        >
          Shadow
        </button>
        <button
          onClick={() => patchStyle({ glow: style?.glow ? { ...style.glow, enabled: !style.glow.enabled } : { ...DEFAULT_GLOW } })}
          className={`flex-1 py-0.5 rounded text-[10px] ${style?.glow?.enabled ? 'bg-blue-600 text-white' : 'bg-[#1d1d1d] text-neutral-400 hover:bg-[#333]'}`}
        >
          Glow
        </button>
        <button
          onClick={() => patchStyle({ stroke: style?.stroke ? { ...style.stroke, enabled: !style.stroke.enabled } : { ...DEFAULT_STROKE } })}
          className={`flex-1 py-0.5 rounded text-[10px] ${style?.stroke?.enabled ? 'bg-blue-600 text-white' : 'bg-[#1d1d1d] text-neutral-400 hover:bg-[#333]'}`}
        >
          Stroke
        </button>
      </div>
      {style?.shadow?.enabled && (
        <StyleParams
          color={style.shadow.color}
          onColor={(c) => patchStyle({ shadow: { ...style.shadow!, color: c } })}
          size={style.shadow.blur}
          sizeLabel="Blur"
          onSize={(v) => patchStyle({ shadow: { ...style.shadow!, blur: v } })}
          offset={{ x: style.shadow.offsetX, y: style.shadow.offsetY }}
          onOffset={(ox, oy) => patchStyle({ shadow: { ...style.shadow!, offsetX: ox, offsetY: oy } })}
          opacity={style.shadow.opacity}
          onOpacity={(v) => patchStyle({ shadow: { ...style.shadow!, opacity: v } })}
        />
      )}
      {style?.glow?.enabled && (
        <StyleParams
          color={style.glow.color}
          onColor={(c) => patchStyle({ glow: { ...style.glow!, color: c } })}
          size={style.glow.size}
          sizeLabel="Size"
          onSize={(v) => patchStyle({ glow: { ...style.glow!, size: v } })}
          offset={null}
          onOffset={() => {}}
          opacity={style.glow.opacity}
          onOpacity={(v) => patchStyle({ glow: { ...style.glow!, opacity: v } })}
        />
      )}
      {style?.stroke?.enabled && (
        <StyleParams
          color={style.stroke.color}
          onColor={(c) => patchStyle({ stroke: { ...style.stroke!, color: c } })}
          size={style.stroke.width}
          sizeLabel="Width"
          onSize={(v) => patchStyle({ stroke: { ...style.stroke!, width: v } })}
          offset={null}
          onOffset={() => {}}
          opacity={style.stroke.opacity}
          onOpacity={(v) => patchStyle({ stroke: { ...style.stroke!, opacity: v } })}
        />
      )}
    </div>
  );
}

const DEFAULT_LAYER_STYLE_RESET = { shadow: null, glow: null, stroke: null };

function StyleParams({
  color, onColor, size, sizeLabel, onSize, offset, onOffset, opacity, onOpacity,
}: {
  color: string; onColor: (c: string) => void;
  size: number; sizeLabel: string; onSize: (v: number) => void;
  offset: { x: number; y: number } | null; onOffset: (x: number, y: number) => void;
  opacity: number; onOpacity: (v: number) => void;
}) {
  return (
    <div className="space-y-1 pl-1 border-l border-white/10">
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-500">Color</span>
        <input type="color" value={color} onChange={(e) => onColor(e.target.value)} className="w-5 h-5 bg-transparent border border-white/20 rounded cursor-pointer" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-500 w-9">{sizeLabel}</span>
        <input type="range" min={0} max={40} value={size} onChange={(e) => onSize(Number(e.target.value))} className="flex-1 accent-blue-500" />
        <span className="w-5 tabular-nums text-neutral-400 text-[10px]">{size}</span>
      </div>
      {offset && (
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-500 w-9">Offset</span>
          <input type="number" value={offset.x} onChange={(e) => onOffset(Number(e.target.value), offset.y)} className="w-10 bg-[#1a1a1a] border border-white/10 rounded px-1 text-neutral-200" />
          <input type="number" value={offset.y} onChange={(e) => onOffset(offset.x, Number(e.target.value))} className="w-10 bg-[#1a1a1a] border border-white/10 rounded px-1 text-neutral-200" />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-500 w-9">Opacity</span>
        <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => onOpacity(Number(e.target.value) / 100)} className="flex-1 accent-blue-500" />
        <span className="w-5 tabular-nums text-neutral-400 text-[10px]">{Math.round(opacity * 100)}</span>
      </div>
    </div>
  );
}

function HistoryPanel() {
  const history = useEditor((s) => s.getHistory());
  const jumpTo = useEditor((s) => s.historyJumpTo);
  if (!history) return <div className="p-3 text-xs text-neutral-500">No history</div>;
  const items = [...history.undoStack].reverse();
  return (
    <div className="py-1">
      {items.length === 0 && <div className="p-3 text-xs text-neutral-500">No actions yet</div>}
      {items.map((entry, i) => (
        <div
          key={entry.id}
          onClick={() => jumpTo(-i)}
          title={`Click to go back ${i} step${i === 1 ? '' : 's'}`}
          className={`px-3 py-1 text-xs cursor-pointer ${i === 0 ? 'bg-blue-600/20 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'}`}
        >
          {i > 0 && <span className="text-neutral-600 mr-1.5 tabular-nums">−{i}</span>}
          {entry.name}
        </div>
      ))}
    </div>
  );
}

function AdjustmentsPanel() {
  const addAdj = useEditor((s) => s.addAdjustmentLayer);
  const applyToLayer = useEditor((s) => s.applyAdjustmentToLayer);
  const layer = useEditor((s) => s.activeLayer());
  const doc = useEditor((s) => s.activeDoc());

  if (!doc) return <div className="p-3 text-xs text-neutral-500">No document</div>;

  const isRaster = layer?.type === 'raster';

  return (
    <div className="p-2 text-xs space-y-2">
      <div className="text-neutral-500 uppercase tracking-wide text-[10px]">Add Adjustment Layer</div>
      {(['brightness-contrast', 'hue-saturation', 'invert', 'grayscale', 'levels'] as const).map((kind) => (
        <button
          key={kind}
          onClick={() => addAdj(adjustmentPreset(kind))}
          className="block w-full text-left px-2 py-1.5 bg-[#1d1d1d] hover:bg-blue-600 hover:text-white rounded text-neutral-300 capitalize"
        >
          {kind.replace('-', ' ')}
        </button>
      ))}

      {isRaster && (
        <>
          <div className="text-neutral-500 uppercase tracking-wide text-[10px] pt-2">Apply Directly</div>
          <button
            onClick={() => applyToLayer(layer!.id, { ...adjustmentPreset('invert'), invert: true })}
            className="block w-full text-left px-2 py-1.5 bg-[#1d1d1d] hover:bg-blue-600 hover:text-white rounded text-neutral-300"
          >
            Invert
          </button>
          <button
            onClick={() => applyToLayer(layer!.id, { ...adjustmentPreset('grayscale'), grayscale: true })}
            className="block w-full text-left px-2 py-1.5 bg-[#1d1d1d] hover:bg-blue-600 hover:text-white rounded text-neutral-300"
          >
            Grayscale
          </button>
        </>
      )}
    </div>
  );
}

function ColorPanel() {
  const color = useEditor((s) => s.color);
  const setColor = useEditor((s) => s.setColor);
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-16 h-16 bg-transparent border border-white/20 rounded cursor-pointer"
        />
        <div className="flex-1">
          <div className="text-xs text-neutral-500 mb-1">Hex</div>
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1 text-xs text-neutral-200 font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="aspect-square rounded-sm border border-black/40 hover:ring-2 hover:ring-blue-500"
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

function TextPanel() {
  const doc = useEditor((s) => s.activeDoc());
  const addText = useEditor((s) => s.addTextLayer);
  const setLayerProp = useEditor((s) => s.setLayerProp);
  const layer = doc?.layers.find((l) => l.id === doc.activeLayerId);
  const isText = layer?.type === 'text';
  const textLayer = isText ? (layer as import('@/editor/types').TextLayer) : null;

  if (!doc) return <div className="p-3 text-xs text-neutral-500">No document</div>;

  return (
    <div className="p-2 space-y-2 text-xs">
      {!isText && (
        <button
          onClick={() => addText('Double-click to edit')}
          className="w-full px-2 py-1.5 bg-[#1d1d1d] hover:bg-blue-600 hover:text-white rounded text-neutral-300"
        >
          + Add Text Layer
        </button>
      )}
      {textLayer && (
        <>
          <label className="block">
            <div className="text-neutral-500 mb-1">Text</div>
            <textarea
              value={textLayer.text}
              onChange={(e) => setLayerProp(textLayer.id, 'text', e.target.value)}
              rows={3}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1 text-neutral-200"
            />
          </label>
          <label className="block">
            <div className="text-neutral-500 mb-1">Font</div>
            <select
              value={textLayer.fontFamily}
              onChange={(e) => setLayerProp(textLayer.id, 'fontFamily', e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded px-1.5 py-1 text-neutral-200"
            >
              <option value="Inter, system-ui, sans-serif">Inter / System</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="'Courier New', monospace">Courier New</option>
              <option value="Verdana, sans-serif">Verdana</option>
              <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <div className="text-neutral-500 mb-1">Size</div>
              <input
                type="number"
                value={textLayer.fontSize}
                onChange={(e) => setLayerProp(textLayer.id, 'fontSize', Number(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1 text-neutral-200"
              />
            </label>
            <label className="flex-1">
              <div className="text-neutral-500 mb-1">Weight</div>
              <select
                value={textLayer.fontWeight}
                onChange={(e) => setLayerProp(textLayer.id, 'fontWeight', Number(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded px-1.5 py-1 text-neutral-200"
              >
                {[300, 400, 500, 600, 700].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setLayerProp(textLayer.id, 'align', a)}
                className={`flex-1 py-1 rounded ${textLayer.align === a ? 'bg-blue-600 text-white' : 'bg-[#1d1d1d] text-neutral-400 hover:bg-[#333]'}`}
              >
                {a}
              </button>
            ))}
          </div>
          <label className="block">
            <div className="flex justify-between text-neutral-500 mb-1">
              <span>Line Height</span><span>{textLayer.lineHeight.toFixed(1)}</span>
            </div>
            <input
              type="range" min={0.8} max={2.5} step={0.1}
              value={textLayer.lineHeight}
              onChange={(e) => setLayerProp(textLayer.id, 'lineHeight', Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-neutral-500">Color</span>
            <input
              type="color"
              value={textLayer.color}
              onChange={(e) => setLayerProp(textLayer.id, 'color', e.target.value)}
              className="w-8 h-8 bg-transparent border border-white/20 rounded cursor-pointer"
            />
          </label>
        </>
      )}
    </div>
  );
}

const SWATCHES = [
  '#000000', '#ffffff', '#7f7f7f', '#c0c0c0',
  '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#ff00ff', '#00ffff', '#ff8800', '#8800ff',
  '#0088ff', '#88ff00', '#ff0088', '#00ff88',
];
