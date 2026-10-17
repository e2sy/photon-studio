# Photon Studio

A professional, layer-based image editor built with React, TypeScript, and Canvas — inspired by Photoshop's workflow, with an original interface. Runs entirely in the browser today, with an architecture ready for Tauri 2 desktop packaging.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build        # production build to dist/
npm run typecheck    # strict TypeScript check
npx tsx scripts/engine-test.ts   # 39-check engine test suite
```

## Features

- **Documents**: multiple open documents as tabs, new/open/close, unsaved-change indicators and prompts
- **Layers**: raster, text, group, and adjustment layers — add, delete, duplicate, drag-reorder, rename, lock, visibility, opacity
- **Groups**: nested layer groups via drag-and-drop (drop a layer on a group to nest it), collapse/expand, indentation
- **Layer styles**: non-destructive drop shadow, outer glow, and stroke — color/size/offset/opacity controls, toggleable per effect, rendered live in the compositor
- **Mask painting**: paint directly on layer masks with the brush — dark color hides, light color reveals; soft-edge brush settings apply
- **Blend modes**: Normal, Multiply, Screen, Overlay, Darken, Lighten, Difference — real pixel math, verified by tests
- **Paint tools**: brush (size/hardness/opacity/flow/spacing, pen pressure), eraser, paint bucket (tolerance), gradient (linear/radial, selection-aware)
- **Shape tools**: line, rectangle, ellipse — filled or outline, adjustable thickness
- **Selections**: rectangle, ellipse, lasso, magic wand (tolerance), feathering, select all/deselect
- **Text**: editable text layers with font family, size, weight, alignment, line height, color — survives save/reload
- **Adjustments**: brightness/contrast, hue/saturation/lightness, levels, invert, grayscale — plus non-destructive adjustment layers
- **Filters**: Gaussian blur, box blur, sharpen, pixelate, noise, edge detect, sepia, invert, grayscale — plus a Filter Gallery with one window for browsing all filters and a unified strength control
- **Masks**: white/black layer masks, paint on masks, apply
- **History**: full undo/redo with history panel; one entry per stroke; pixel-accurate restore; click any history entry to jump straight back to that step
- **Import**: file picker, drag-and-drop, clipboard paste — PNG/JPEG/WebP/BMP
- **Export**: PNG, JPEG, WebP of the full composite
- **Native format**: `.photon` versioned project file preserving all layers, masks, text, and pixel data; rejects corrupt files
- **Transform**: free transform (scale, rotate with 15° snapping, flip H/V) and perspective transform — drag four corner handles freely and the layer warps to match (inverse bilinear warp with bilinear sampling)
- **Shortcuts**: V/M/L/W/B/E/G/I/T/C/Z/H tools, Ctrl+Z/Shift+Z undo/redo, Ctrl+A/D/J, Space-drag pan, Ctrl+wheel zoom, Delete

## Desktop packaging (Tauri 2)

The app is structured for a thin Tauri shell. On a machine with [Rust](https://rustup.rs) and the platform WebView:

```bash
npm install -D @tauri-apps/cli
npx tauri init        # frontend dist: dist, dev server: http://localhost:5173
npx tauri dev
npx tauri build       # produces Windows .msi/.exe, macOS .app/.dmg, Linux .deb/.AppImage
```

File dialogs and filesystem access can then use `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` with least-privilege permissions; the editor engine itself needs no changes.

## Architecture

```
src/editor/       engine (no UI): types, document model, blend, painting,
                  imaging, renderer, history, serializer, store, shortcuts
src/components/   UI: menu bar, options bar, toolbar, canvas, panels, tabs
scripts/          headless engine test suite
```

The engine is fully separated from React, so it runs headlessly in Node for testing and can be reused inside a Tauri, Electron, or web worker host.
