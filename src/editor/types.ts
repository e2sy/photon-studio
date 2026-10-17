// Core type definitions for the Photon Studio editor engine.

import type { LayerStyle } from './layerStyles';

export type { LayerStyle };

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'difference';

export type ColorMode = 'rgba8';

export type LayerType = 'raster' | 'text' | 'group' | 'adjustment';

export interface LayerBase {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  mask: LayerMask | null;
  style: LayerStyle | null;
  parentId: string | null;
}

export interface LayerMask {
  id: string;
  // mask data stored as RGBA where R channel is the mask alpha (0=hidden,255=shown)
  data: ImageData;
  enabled: boolean;
}

export interface RasterLayer extends LayerBase {
  type: 'raster';
  data: ImageData; // full pixel buffer for this layer's bounds
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  lineHeight: number;
  letterSpacing: number;
}

export interface AdjustmentLayer extends LayerBase {
  type: 'adjustment';
  adjustment: AdjustmentSettings;
}

export interface GroupLayer extends LayerBase {
  type: 'group';
  collapsed: boolean;
}

export type Layer = RasterLayer | TextLayer | AdjustmentLayer | GroupLayer;

export interface AdjustmentSettings {
  kind: 'brightness-contrast' | 'hue-saturation' | 'invert' | 'grayscale' | 'levels';
  brightness: number; // -100..100
  contrast: number; // -100..100
  hue: number; // -180..180
  saturation: number; // -100..100
  lightness: number; // -100..100
  invert: boolean;
  grayscale: boolean;
  blackPoint: number; // 0..254
  whitePoint: number; // 1..255
}

export interface Selection {
  // A simple raster selection mask aligned to document coordinates.
  id: string;
  data: ImageData; // R channel = 255 inside selection, 0 outside
  feather: number;
}

export interface DocumentModel {
  id: string;
  name: string;
  width: number;
  height: number;
  dpi: number;
  colorMode: ColorMode;
  layers: Layer[];
  activeLayerId: string | null;
  selection: Selection | null;
  zoom: number;
  panX: number;
  panY: number;
  background: string; // background color for empty doc
  saved: boolean;
  filePath: string | null;
  metadata: Record<string, string>;
}

export type ToolId =
  | 'move'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'magic-wand'
  | 'brush'
  | 'eraser'
  | 'paint-bucket'
  | 'gradient'
  | 'eyedropper'
  | 'text'
  | 'crop'
  | 'transform'
  | 'transform-perspective'
  | 'clone-stamp'
  | 'dodge-burn'
  | 'smudge'
  | 'zoom'
  | 'hand'
  | 'line'
  | 'rectangle'
  | 'ellipse';

export interface ToolSettings {
  brushSize: number;
  brushHardness: number; // 0..1
  brushOpacity: number; // 0..1
  brushFlow: number; // 0..1
  brushSpacing: number; // 0..1
  brushColor: string;
  eraserSize: number;
  tolerance: number; // for magic wand / paint bucket
  selectionFeather: number;
  fontFamily: string;
  fontSize: number;
  cropAspect: 'free' | '1:1' | '4:3' | '16:9';
  gradientType: 'linear' | 'radial';
  secondaryColor: string;
  shapeFill: boolean;
  shapeThickness: number;
  retouchSize: number;
  retouchStrength: number;
  dodgeMode: 'dodge' | 'burn';
  zoomLevel: number;
}

export interface EditorPreferences {
  theme: 'dark' | 'light';
  rulerUnit: 'px' | 'in' | 'cm';
  autosaveIntervalSec: number;
  showRulers: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  defaultExportQuality: number;
  brushDefaultColor: string;
}

export const DEFAULT_ADJUSTMENT: AdjustmentSettings = {
  kind: 'brightness-contrast',
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
  lightness: 0,
  invert: false,
  grayscale: false,
  blackPoint: 0,
  whitePoint: 255,
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  brushSize: 20,
  brushHardness: 0.8,
  brushOpacity: 1,
  brushFlow: 1,
  brushSpacing: 0.1,
  brushColor: '#1e1e1e',
  eraserSize: 20,
  tolerance: 32,
  selectionFeather: 0,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 48,
  cropAspect: 'free',
  gradientType: 'linear',
  secondaryColor: '#ffffff',
  shapeFill: false,
  shapeThickness: 2,
  retouchSize: 30,
  retouchStrength: 0.5,
  dodgeMode: 'dodge',
  zoomLevel: 1,
};
