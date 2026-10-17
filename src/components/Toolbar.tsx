// Left vertical toolbar with grouped tools.

import {
  MousePointer2,
  Square,
  Circle,
  Lasso,
  Wand2,
  Brush,
  Eraser,
  PaintBucket,
  Pipette,
  Type,
  Crop,
  Scan,
  Hand,
  PenTool,
  Minus,
  Droplets,
  Stamp,
  Sun,
  Fingerprint,
} from 'lucide-react';
import type { ToolId } from '@/editor/types';
import { useEditor } from '@/editor/store';

interface ToolDef {
  id: ToolId;
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  shortcut: string;
}

const GROUPS: ToolDef[][] = [
  [
    { id: 'move', icon: MousePointer2, label: 'Move', shortcut: 'V' },
  ],
  [
    { id: 'marquee-rect', icon: Square, label: 'Rectangular Marquee', shortcut: 'M' },
    { id: 'marquee-ellipse', icon: Circle, label: 'Elliptical Marquee', shortcut: 'M' },
    { id: 'lasso', icon: Lasso, label: 'Lasso', shortcut: 'L' },
    { id: 'magic-wand', icon: Wand2, label: 'Magic Wand', shortcut: 'W' },
  ],
  [
    { id: 'brush', icon: Brush, label: 'Brush', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
    { id: 'paint-bucket', icon: PaintBucket, label: 'Paint Bucket', shortcut: 'G' },
    { id: 'gradient', icon: Droplets, label: 'Gradient', shortcut: 'Shift+G' },
    { id: 'eyedropper', icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
  ],
  [
    { id: 'clone-stamp', icon: Stamp, label: 'Clone Stamp (Alt+click = set source)', shortcut: 'S' },
    { id: 'dodge-burn', icon: Sun, label: 'Dodge / Burn', shortcut: 'O' },
    { id: 'smudge', icon: Fingerprint, label: 'Smudge', shortcut: 'R' },
  ],
  [
    { id: 'line', icon: Minus, label: 'Line', shortcut: 'U' },
    { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'U' },
    { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'U' },
  ],
  [
    { id: 'text', icon: Type, label: 'Text', shortcut: 'T' },
    { id: 'crop', icon: Crop, label: 'Crop', shortcut: 'C' },
    { id: 'transform', icon: Scan, label: 'Transform', shortcut: 'Ctrl+T' },
    { id: 'transform-perspective', icon: PenTool, label: 'Perspective Transform', shortcut: 'Ctrl+Shift+T' },
  ],
  [
    { id: 'zoom', icon: PenTool, label: 'Zoom', shortcut: 'Z' },
    { id: 'hand', icon: Hand, label: 'Hand / Pan', shortcut: 'H' },
  ],
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);

  return (
    <div className="w-11 bg-[#252525] border-r border-black/50 flex flex-col items-center py-2 gap-1 overflow-y-auto">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                title={`${t.label} (${t.shortcut})`}
                onClick={() => setTool(t.id)}
                className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-200'
                }`}
              >
                <Icon size={18} />
              </button>
            );
          })}
          {gi < GROUPS.length - 1 && <div className="h-px bg-white/10 my-1 w-7 mx-auto" />}
        </div>
      ))}
    </div>
  );
}
