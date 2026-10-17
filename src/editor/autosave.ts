// Autosave + crash recovery.
// Periodically saves each dirty document's serialized state to localStorage
// (keyed by doc id) with a lightweight index. On startup, offers recovery.

import { useEditor } from './store';
import { serializeDocument } from './serializer';

const INDEX_KEY = 'photon.autosave.index';
const DOC_KEY = (id: string) => `photon.autosave.${id}`;

interface AutosaveIndex {
  [docId: string]: { name: string; time: number; width: number; height: number };
}

function readIndex(): AutosaveIndex {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeIndex(idx: AutosaveIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    // storage full — silently skip this cycle
  }
}

function saveDoc(docId: string): void {
  const doc = useEditor.getState().documents.find((d) => d.id === docId);
  if (!doc || doc.saved) {
    // clean doc: nothing to save
    return;
  }
  try {
    const json = serializeDocument(doc);
    localStorage.setItem(DOC_KEY(docId), json);
    const idx = readIndex();
    idx[docId] = { name: doc.name, time: Date.now(), width: doc.width, height: doc.height };
    writeIndex(idx);
  } catch {
    // QuotaExceeded for very large docs — remove stale entry so we degrade
    // gracefully instead of throwing every tick.
    const idx = readIndex();
    delete idx[docId];
    writeIndex(idx);
  }
}

export function startAutosave(intervalSec: number): () => void {
  const tick = () => {
    const { documents } = useEditor.getState();
    for (const d of documents) saveDoc(d.id);
  };
  tick();
  const handle = window.setInterval(tick, Math.max(10, intervalSec) * 1000);
  return () => window.clearInterval(handle);
}

export interface RecoveredDoc {
  docId: string;
  name: string;
  time: number;
  width: number;
  height: number;
}

export function listRecoverable(): RecoveredDoc[] {
  const idx = readIndex();
  return Object.entries(idx)
    .map(([docId, v]) => ({ docId, ...v }))
    .sort((a, b) => b.time - a.time);
}

export function recoverDocument(docId: string): boolean {
  try {
    const json = localStorage.getItem(DOC_KEY(docId));
    if (!json) return false;
    const { openProject } = useEditor.getState();
    const name = readIndex()[docId]?.name ?? 'Recovered';
    openProject(json, name);
    return true;
  } catch {
    return false;
  }
}

export function discardRecovery(docId: string): void {
  localStorage.removeItem(DOC_KEY(docId));
  const idx = readIndex();
  delete idx[docId];
  writeIndex(idx);
}

export function discardAllRecovery(): void {
  const idx = readIndex();
  for (const id of Object.keys(idx)) localStorage.removeItem(DOC_KEY(id));
  localStorage.removeItem(INDEX_KEY);
}
