// Photon Studio — main application shell.
// Wires together menu, options bar, toolbar, canvas, panels, and handles
// file operations and menu commands.

import { useEffect, useRef, useState } from 'react';
import { MenuBar } from '@/components/MenuBar';
import { OptionsBar } from '@/components/OptionsBar';
import { Toolbar } from '@/components/Toolbar';
import { CanvasWorkspace } from '@/components/CanvasWorkspace';
import { RightPanels } from '@/components/RightPanels';
import { DocumentTabs, StatusBar } from '@/components/DocumentTabs';
import { useEditor } from '@/editor/store';
import { handleKeyDown } from '@/editor/shortcuts';
import { adjustmentPreset } from '@/components/MenuBar';
import { serializeDocument, deserializeDocument } from '@/editor/serializer';
import { openFileNative, saveFileNative, hasNativeDialogs } from '@/desktop/nativeBridge';
import { runFilterAsync } from '@/workers/filterClient';
import { CurvesDialog } from '@/components/CurvesDialog';
import { FilterGallery } from '@/components/FilterGallery';
import { startAutosave, listRecoverable, recoverDocument, discardAllRecovery, type RecoveredDoc } from '@/editor/autosave';
import type { AdjustmentSettings } from '@/editor/types';

function loadImageFromFile(file: File, onDone: (img: HTMLImageElement) => void): void {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    onDone(img);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

export default function App() {
  const [showNew, setShowNew] = useState(false);
  const [showAdjust, setShowAdjust] = useState<AdjustmentSettings | null>(null);
  const [showCurves, setShowCurves] = useState(false);
  const [recovery, setRecovery] = useState<RecoveredDoc[] | null>(null);
  const [showFilter, setShowFilter] = useState<{ name: string; params: Record<string, number> } | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // register global keyboard shortcuts
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // warn before leaving with unsaved work
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasUnsaved = useEditor.getState().documents.some((d) => !d.saved);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // clipboard paste of images
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      loadImageFromFile(file, (img) => useEditor.getState().importImage(img, 'Pasted Image'));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // drag-and-drop image import
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      setDragOver(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      loadImageFromFile(file, (img) => useEditor.getState().importImage(img, file.name));
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // auto-create a starter document on first load
  useEffect(() => {
    const s = useEditor.getState();
    const recoverable = listRecoverable();
    if (recoverable.length > 0) {
      setRecovery(recoverable);
      return;
    }
    if (s.documents.length === 0) {
      s.newDocument(1200, 800, 'Untitled-1', '#ffffff');
    }
  }, []);

  // theme preference
  const theme = useEditor((s) => s.prefs.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  // autosave loop
  useEffect(() => {
    const stop = startAutosave(useEditor.getState().prefs.autosaveIntervalSec);
    return stop;
  }, []);

  const handleCommand = async (cmd: string) => {
    const store = useEditor.getState();
    const doc = store.activeDoc();

    // File
    if (cmd === 'file:new') { setShowNew(true); return; }
    if (cmd === 'file:save' || cmd === 'file:save-as') {
      if (!doc) return;
      const json = store.saveProject(doc.id);
      const bytes = new TextEncoder().encode(json);
      if (hasNativeDialogs()) {
        const path = await saveFileNative(
          `${doc.name}.photon`,
          [{ name: 'Photon Project', extensions: ['photon'] }],
          bytes,
        );
        if (path) {
          useEditor.setState((s) => ({
            documents: s.documents.map((d) => d.id === doc.id ? { ...d, saved: true, filePath: path } : d),
          }));
        }
      } else {
        downloadFile(json, `${doc.name}.photon`, 'application/json');
      }
      return;
    }
    if (cmd === 'file:open-project') {
      if (hasNativeDialogs()) {
        const f = await openFileNative([{ name: 'Photon Project', extensions: ['photon'] }]);
        if (f) {
          try {
            const json = new TextDecoder().decode(f.data);
            store.openProject(json, f.name);
          } catch (err) {
            alert('Could not open project: ' + (err as Error).message);
          }
        }
        return;
      }
      projectInputRef.current?.click();
      return;
    }
    if (cmd === 'file:open-image') {
      if (hasNativeDialogs()) {
        const f = await openFileNative([
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
        ]);
        if (f) {
          const blob = new Blob([f.data]);
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            useEditor.getState().importImage(img, f.name);
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
        return;
      }
      fileInputRef.current?.click();
      return;
    }
    if (cmd === 'file:export-png') { await exportComposite(doc, 'png'); return; }
    if (cmd === 'file:export-jpeg') { await exportComposite(doc, 'jpeg'); return; }
    if (cmd === 'file:export-webp') { await exportComposite(doc, 'webp'); return; }
    if (cmd === 'file:close') {
      if (doc && !doc.saved && !confirm(`"${doc.name}" has unsaved changes. Close anyway?`)) return;
      if (doc) store.closeDocument(doc.id);
      return;
    }

    // Edit
    if (cmd === 'edit:undo') { store.undo(); return; }
    if (cmd === 'edit:redo') { store.redo(); return; }
    if (cmd === 'edit:clear-sel') { store.clearSelection(); return; }
    if (cmd === 'edit:fill-fg') {
      const layer = store.activeLayer();
      if (layer && layer.type === 'raster' && doc) {
        store.applyFilter(layer.id, 'fill', {} as never);
      }
      return;
    }

    // Image (adjustments applied to active raster layer)
    if (cmd === 'image:brightness-contrast') { setShowAdjust({ ...adjustmentPreset('brightness-contrast') }); return; }
    if (cmd === 'image:hue-saturation') { setShowAdjust({ ...adjustmentPreset('hue-saturation') }); return; }
    if (cmd === 'image:levels') { setShowAdjust({ ...adjustmentPreset('levels') }); return; }
    if (cmd === 'image:curves') { setShowCurves(true); return; }
    if (cmd === 'image:invert') {
      const l = store.activeLayer();
      if (l) store.applyAdjustmentToLayer(l.id, { ...adjustmentPreset('invert'), invert: true });
      return;
    }
    if (cmd === 'image:grayscale') {
      const l = store.activeLayer();
      if (l) store.applyAdjustmentToLayer(l.id, { ...adjustmentPreset('grayscale'), grayscale: true });
      return;
    }

    // Layer
    if (cmd === 'layer:new') { store.addBlankLayer(); return; }
    if (cmd === 'layer:duplicate') { const l = store.activeLayer(); if (l) store.duplicateLayer(l.id); return; }
    if (cmd === 'layer:delete') { if (doc?.activeLayerId) store.deleteLayer(doc.activeLayerId); return; }
    if (cmd === 'layer:group') { store.addGroup(); return; }
    if (cmd === 'layer:merge-visible') { store.mergeVisible(); return; }
    if (cmd === 'layer:flatten') { store.flattenImage(); return; }
    if (cmd === 'layer:mask-white') { if (doc?.activeLayerId) store.addMask(doc.activeLayerId, true); return; }
    if (cmd === 'layer:mask-black') { if (doc?.activeLayerId) store.addMask(doc.activeLayerId, false); return; }
    if (cmd === 'layer:mask-apply') { if (doc?.activeLayerId) store.applyMask(doc.activeLayerId); return; }

    // Select
    if (cmd === 'select:all') { store.selectAll(); return; }
    if (cmd === 'select:deselect') { store.clearSelection(); return; }

    // Filter
    if (cmd === 'filter:gallery') { setShowGallery(true); return; }
    if (cmd === 'filter:gaussian-blur') { setShowFilter({ name: 'gaussian-blur', params: { radius: 5 } }); return; }
    if (cmd === 'filter:box-blur') { setShowFilter({ name: 'box-blur', params: { radius: 5 } }); return; }
    if (cmd === 'filter:sharpen') { setShowFilter({ name: 'sharpen', params: { amount: 1 } }); return; }
    if (cmd === 'filter:pixelate') { setShowFilter({ name: 'pixelate', params: { size: 10 } }); return; }
    if (cmd === 'filter:noise') { setShowFilter({ name: 'noise', params: { amount: 30 } }); return; }
    if (cmd === 'filter:edge-detect') { applyFilterNow(store, 'edge-detect', {}); return; }
    if (cmd === 'filter:sepia') { applyFilterNow(store, 'sepia', {}); return; }
    if (cmd === 'filter:invert') { applyFilterNow(store, 'invert', {}); return; }
    if (cmd === 'filter:grayscale') { applyFilterNow(store, 'grayscale', {}); return; }

    // View
    if (cmd === 'view:zoom-in') { if (doc) store.setZoom(doc.id, doc.zoom * 1.25); return; }
    if (cmd === 'view:zoom-out') { if (doc) store.setZoom(doc.id, doc.zoom / 1.25); return; }
    if (cmd === 'view:zoom-100') { if (doc) store.setZoom(doc.id, 1); return; }
    if (cmd === 'view:fit') {
      if (doc) {
        const c = document.querySelector('[data-workspace]') as HTMLElement | null;
        const cw = c?.clientWidth ?? 800;
        const ch = c?.clientHeight ?? 600;
        const fit = Math.min((cw - 80) / doc.width, (ch - 80) / doc.height, 1);
        store.setZoom(doc.id, fit);
      }
      return;
    }

    if (cmd === 'help:about') {
      alert('Photon Studio\nA professional desktop image editor.\n\nBuilt with React + TypeScript + Canvas.\nDesktop packaging: Tauri (see README).');
      return;
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      useEditor.getState().importImage(img, file.name);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  };

  const onProjectSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        useEditor.getState().openProject(String(reader.result), file.name);
      } catch (err) {
        alert('Could not open project: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] text-neutral-200 overflow-hidden select-none">
      <MenuBar onCommand={handleCommand} />
      <OptionsBar />
      <div className="flex-1 flex overflow-hidden">
        <Toolbar />
        <div className="flex-1 flex flex-col overflow-hidden" data-workspace>
          <DocumentTabs />
          <CanvasWorkspace />
        </div>
        <RightPanels />
      </div>
      <StatusBar />

      {/* hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/bmp" className="hidden" onChange={onFileSelected} />
      <input ref={projectInputRef} type="file" accept=".photon,application/json" className="hidden" onChange={onProjectSelected} />

      {showNew && <NewDocDialog onClose={() => setShowNew(false)} />}
      {showAdjust && <AdjustDialog adj={showAdjust} onClose={() => setShowAdjust(null)} />}
      {showCurves && <CurvesDialog onClose={() => setShowCurves(false)} />}
      {showFilter && <FilterDialog filter={showFilter} onClose={() => setShowFilter(null)} />}
      {showGallery && <FilterGallery onClose={() => setShowGallery(false)} />}

      {dragOver && (
        <div className="fixed inset-0 z-[90] bg-blue-600/20 border-4 border-dashed border-blue-500 flex items-center justify-center pointer-events-none">
          <div className="bg-[#1d1d1d] px-6 py-3 rounded-lg text-sm text-neutral-200 shadow-xl">
            Drop image to open as a new document
          </div>
        </div>
      )}

      {recovery && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]">
          <div className="bg-[#2a2a2a] border border-black/60 rounded-lg shadow-2xl w-[420px] p-4">
            <div className="text-sm font-medium text-neutral-100 mb-2">Recover unsaved work?</div>
            <div className="text-xs text-neutral-400 mb-3">Photon Studio was closed unexpectedly. These documents were autosaved:</div>
            <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
              {recovery.map((r) => (
                <button
                  key={r.docId}
                  className="block w-full text-left px-3 py-2 bg-[#1d1d1d] hover:bg-blue-600 hover:text-white rounded text-xs text-neutral-300"
                  onClick={() => {
                    recoverDocument(r.docId);
                    setRecovery(null);
                  }}
                >
                  {r.name} · {r.width}×{r.height} · {new Date(r.time).toLocaleString()}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="ps-btn"
                onClick={() => {
                  discardAllRecovery();
                  setRecovery(null);
                  if (useEditor.getState().documents.length === 0) {
                    useEditor.getState().newDocument(1200, 800, 'Untitled-1', '#ffffff');
                  }
                }}
              >
                Discard and start fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function applyFilterNow(store: ReturnType<typeof useEditor.getState>, name: string, params: Record<string, number>) {
  const layer = store.activeLayer();
  if (layer) store.applyFilter(layer.id, name, params);
}

async function exportComposite(doc: import('@/editor/types').DocumentModel | null, format: 'png' | 'jpeg' | 'webp') {
  if (!doc) return;
  const blob = useEditor.getState().exportComposite(doc.id, format);
  const ext = format === 'jpeg' ? 'jpg' : format;
  if (hasNativeDialogs()) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    await saveFileNative(
      `${doc.name}.${ext}`,
      [{ name: format.toUpperCase() + ' Image', extensions: [ext] }],
      buf,
    );
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.name}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NewDocDialog({ onClose }: { onClose: () => void }) {
  const [w, setW] = useState(1200);
  const [h, setH] = useState(800);
  const [name, setName] = useState('Untitled');
  const [bg, setBg] = useState('#ffffff');
  return (
    <Modal title="New Document" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="ps-input" /></Field>
        <div className="flex gap-3">
          <Field label="Width"><input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} className="ps-input" /></Field>
          <Field label="Height"><input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} className="ps-input" /></Field>
        </div>
        <Field label="Background">
          <div className="flex items-center gap-2">
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-8 h-8 bg-transparent border border-white/20 rounded" />
            <span className="text-neutral-400 text-xs">or transparent</span>
            <button onClick={() => setBg('transparent')} className="ps-btn">Transparent</button>
          </div>
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="ps-btn">Cancel</button>
          <button
            onClick={() => {
              const useBg = bg === 'transparent' ? '#ffffff' : bg;
              const withBg = bg !== 'transparent';
              useEditor.getState().newDocument(w, h, name, useBg);
              if (!withBg) {
                // remove auto-created background
                const doc = useEditor.getState().activeDoc();
                if (doc && doc.layers[0]?.name === 'Background') {
                  useEditor.getState().deleteLayer(doc.layers[0].id);
                }
              }
              onClose();
            }}
            className="ps-btn-primary"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AdjustDialog({ adj, onClose }: { adj: AdjustmentSettings; onClose: () => void }) {
  const [settings, setSettings] = useState<AdjustmentSettings>(adj);
  const layer = useEditor((s) => s.activeLayer());
  const apply = useEditor((s) => s.applyAdjustmentToLayer);
  if (!layer) return null;
  return (
    <Modal title={`Adjustment: ${adj.kind.replace('-', ' ')}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {adj.kind === 'brightness-contrast' && (
          <>
            <Slider label="Brightness" min={-100} max={100} value={settings.brightness} onChange={(v) => setSettings({ ...settings, brightness: v })} />
            <Slider label="Contrast" min={-100} max={100} value={settings.contrast} onChange={(v) => setSettings({ ...settings, contrast: v })} />
          </>
        )}
        {adj.kind === 'hue-saturation' && (
          <>
            <Slider label="Hue" min={-180} max={180} value={settings.hue} onChange={(v) => setSettings({ ...settings, hue: v })} />
            <Slider label="Saturation" min={-100} max={100} value={settings.saturation} onChange={(v) => setSettings({ ...settings, saturation: v })} />
            <Slider label="Lightness" min={-100} max={100} value={settings.lightness} onChange={(v) => setSettings({ ...settings, lightness: v })} />
          </>
        )}
        {adj.kind === 'levels' && (
          <>
            <Slider label="Black Point" min={0} max={254} value={settings.blackPoint} onChange={(v) => setSettings({ ...settings, blackPoint: v })} />
            <Slider label="White Point" min={1} max={255} value={settings.whitePoint} onChange={(v) => setSettings({ ...settings, whitePoint: v })} />
          </>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={() => setSettings(adj)} className="ps-btn">Reset</button>
          <button onClick={onClose} className="ps-btn">Cancel</button>
          <button onClick={() => { apply(layer.id, settings); onClose(); }} className="ps-btn-primary">Apply</button>
        </div>
      </div>
    </Modal>
  );
}

function FilterDialog({ filter, onClose }: { filter: { name: string; params: Record<string, number> }; onClose: () => void }) {
  const [params, setParams] = useState(filter.params);
  const layer = useEditor((s) => s.activeLayer());
  const applyFilter = useEditor((s) => s.applyFilter);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<ImageData | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Cache the original pixels once, on first open.
  useEffect(() => {
    if (layer && layer.type === 'raster' && !originalRef.current) {
      originalRef.current = new ImageData(
        new Uint8ClampedArray(layer.data.data), layer.data.width, layer.data.height,
      );
    }
  }, [layer]);

  // Live preview: run the filter in the worker against the original on every change.
  useEffect(() => {
    const orig = originalRef.current;
    if (!orig || !previewRef.current) return;
    let cancelled = false;
    setPreviewing(true);
    runFilterAsync(orig, filter.name, params)
      .then((result) => {
        if (cancelled || !previewRef.current) return;
        const c = previewRef.current;
        const scale = Math.min(1, 320 / orig.width);
        c.width = Math.max(1, Math.round(orig.width * scale));
        c.height = Math.max(1, Math.round(orig.height * scale));
        const tmp = document.createElement('canvas');
        tmp.width = orig.width;
        tmp.height = orig.height;
        tmp.getContext('2d')!.putImageData(result, 0, 0);
        c.getContext('2d')!.drawImage(tmp, 0, 0, c.width, c.height);
        setPreviewing(false);
      })
      .catch(() => setPreviewing(false));
    return () => { cancelled = true; };
  }, [params, filter.name]);

  if (!layer) return null;
  const fields = Object.keys(filter.params);
  return (
    <Modal title={`Filter: ${filter.name.replace(/-/g, ' ')}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <canvas ref={previewRef} className="w-full rounded border border-white/10 bg-[#1a1a1a]" />
        {previewing && <div className="text-[10px] text-neutral-500">Updating preview…</div>}
        {fields.map((f) => (
          <Slider
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
            min={f === 'amount' ? 0 : 1}
            max={f === 'radius' ? 50 : f === 'size' ? 100 : f === 'amount' ? 5 : 100}
            value={params[f]}
            onChange={(v) => setParams({ ...params, [f]: v })}
          />
        ))}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={() => setParams(filter.params)} className="ps-btn">Reset</button>
          <button onClick={onClose} className="ps-btn">Cancel</button>
          <button onClick={() => { applyFilter(layer.id, filter.name, params); onClose(); }} className="ps-btn-primary">Apply</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-[#2a2a2a] border border-black/60 rounded-lg shadow-2xl w-[360px] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium text-neutral-100 mb-3">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-neutral-400 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-blue-500" />
    </label>
  );
}
