// Keyboard shortcut handling for the editor.

import type { ToolId } from './types';
import { useEditor } from './store';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'move',
  m: 'marquee-rect',
  l: 'lasso',
  w: 'magic-wand',
  b: 'brush',
  e: 'eraser',
  g: 'paint-bucket',
  i: 'eyedropper',
  t: 'text',
  c: 'crop',
  z: 'zoom',
  h: 'hand',
  s: 'clone-stamp',
  o: 'dodge-burn',
  r: 'smudge',
};

function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
}

export function handleKeyDown(e: KeyboardEvent): void {
  const store = useEditor.getState();
  const mod = e.ctrlKey || e.metaKey;

  // Allow normal typing in inputs.
  if (isTyping() && !mod) return;

  // Undo / Redo
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
    return;
  }

  if (mod) {
    switch (e.key.toLowerCase()) {
      case 'a':
        e.preventDefault();
        store.selectAll();
        return;
      case 'd':
        e.preventDefault();
        store.clearSelection();
        return;
      case 'j':
        e.preventDefault();
        {
          const layer = store.activeLayer();
          if (layer) store.duplicateLayer(layer.id);
        }
        return;
      default:
        // other ctrl combos handled by menus
        return;
    }
  }

  // tool selection
  const t = TOOL_KEYS[e.key.toLowerCase()];
  if (t) {
    store.setTool(t);
    return;
  }

  // delete selection content
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (store.activeDoc()?.selection) {
      e.preventDefault();
      // clear pixels in selection on active raster layer
      const doc = store.activeDoc();
      const layer = store.activeLayer();
      if (doc && layer && layer.type === 'raster') {
        const sel = doc.selection!;
        const rl = layer as import('./types').RasterLayer;
        for (let y = 0; y < doc.height; y++) {
          for (let x = 0; x < doc.width; x++) {
            if (sel.data.data[(y * doc.width + x) * 4] > 128) {
              const lx = x - rl.x;
              const ly = y - rl.y;
              if (lx >= 0 && ly >= 0 && lx < rl.width && ly < rl.height) {
                const i = (ly * rl.width + lx) * 4;
                rl.data.data[i + 3] = 0;
              }
            }
          }
        }
        useEditor.setState({ documents: [...store.documents] });
      }
    }
    return;
  }
}
