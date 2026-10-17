// Document tabs + bottom status bar.

import { X } from 'lucide-react';
import { useEditor } from '@/editor/store';
import { compositeDocument } from '@/editor/renderer';

export function DocumentTabs() {
  const docs = useEditor((s) => s.documents);
  const activeId = useEditor((s) => s.activeDocId);
  const setActive = useEditor((s) => s.setActiveDoc);
  const close = useEditor((s) => s.closeDocument);

  if (docs.length === 0) return null;

  const requestClose = (id: string, name: string, saved: boolean) => {
    if (!saved && !confirm(`"${name}" has unsaved changes. Close anyway?`)) return;
    close(id);
  };

  return (
    <div className="h-8 bg-[#1d1d1d] border-b border-black/40 flex items-end overflow-x-auto">
      {docs.map((doc) => {
        const active = doc.id === activeId;
        return (
          <div
            key={doc.id}
            onClick={() => setActive(doc.id)}
            className={`flex items-center gap-2 px-3 h-7 text-xs cursor-pointer border-r border-black/30 ${
              active ? 'bg-[#1a1a1a] text-neutral-100 border-t-2 border-t-blue-500' : 'text-neutral-500 hover:bg-white/5'
            }`}
          >
            <span className="truncate max-w-[140px]">
              {doc.name}
              {!doc.saved && <span className="text-blue-400 ml-1">●</span>}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); requestClose(doc.id, doc.name, doc.saved); }}
              className="hover:bg-white/15 rounded p-0.5"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function StatusBar() {
  const doc = useEditor((s) => s.activeDoc());
  const tool = useEditor((s) => s.tool);
  if (!doc) return <div className="h-6 bg-[#1d1d1d] border-t border-black/40" />;
  const zoom = Math.round(doc.zoom * 100);
  return (
    <div className="h-6 bg-[#1d1d1d] border-t border-black/40 flex items-center px-3 text-[11px] text-neutral-500 gap-4">
      <span>{doc.width} × {doc.height} px</span>
      <span>{zoom}%</span>
      <span className="capitalize">{tool}</span>
      <span className="ml-auto text-neutral-600">{doc.layers.length} layers</span>
    </div>
  );
}

export { compositeDocument };
