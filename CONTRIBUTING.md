# Contributing to Photon Studio

Thanks for your interest in improving Photon Studio! This document covers everything you need to get started.

## Development setup

```bash
git clone https://github.com/e2sy/photon-studio.git
cd photon-studio
npm install
npm run dev        # start the dev server at http://localhost:5173
```

### Verify your changes before opening a PR

```bash
npm run typecheck  # strict TypeScript check (must pass)
npm run lint       # ESLint (no new warnings)
npm test           # headless engine test suite (39 checks, must pass)
npm run build      # production build must succeed
```

CI runs all four on every push and pull request — running them locally saves you a round trip.

## Project structure

```
src/editor/       Engine (no UI, no React): document model, blend modes,
                  painting, imaging, renderer, history, serializer
src/components/   React UI: menu bar, toolbar, canvas, panels, dialogs
src/workers/      Web Worker filter pipeline
scripts/          Headless engine test suite
src-tauri/        Tauri 2 desktop shell (Rust)
```

### Ground rules

- **Keep the engine pure.** Code in `src/editor/` must not import React, the DOM canvas API, or anything UI-related — it must stay runnable headlessly in Node. If a change needs the DOM, it belongs in `src/components/` or `src/workers/`.
- **Every new engine feature needs a test.** Add checks to `scripts/engine-test.ts` following the existing pattern.
- **Match the existing style.** TypeScript strict mode is on; don't add `any` casts unless interfacing with a genuinely untyped API.

## Submitting changes

1. Fork the repo and create a feature branch from `main` (`feat/clone-stamp-align`, `fix/mask-feather-edge`, …).
2. Make your changes with focused, atomic commits.
3. Run the full verification checklist above.
4. Open a pull request describing **what** changed, **why**, and **how you verified it**. Screenshots or before/after captures are appreciated for UI changes.

## Reporting bugs

Open an issue with:

- Your browser/OS (and whether you were in web or Tauri desktop mode)
- Steps to reproduce, expected vs actual behavior
- If it involves a saved project, attach the `.photon` file if you can

## Feature ideas

Check the **Roadmap** section in the README. If you want to pick something up, comment on the relevant issue (or open one) so work isn't duplicated.
