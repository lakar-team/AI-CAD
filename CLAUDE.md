# Lakar CAD

SketchUp-style 3D modeler (React + three.js) with a from-scratch topological
geometry core, built so an AI assistant can later read/edit the model through
the same operations the tools use.

## CRITICAL: never run npm in this folder

This project lives on Google Drive; `npm install` here corrupts
`node_modules` (thousands of zero-byte files). Always build through the
mirror script:

```powershell
.\build.ps1          # build (mirrors to %LOCALAPPDATA%\AI CAD-build, copies dist back)
.\build.ps1 -Dev     # dev server (serves the mirror)
node --test tests/core.test.mjs   # engine tests — fine to run directly on Drive
```

See BUILD.md for details.

## Architecture

- `src/core/` — **pure, dependency-free JS engine** (no three.js, no React).
  Everything is JSON-serializable; tests run in plain node.
  - `math3.js` — vectors `[x,y,z]`, planes, rays, 4x4 matrices (column-major)
  - `mesh.js` — `Mesh`: vertices/edges/faces graph with adjacency. `addEdge`
    auto-creates faces from closed planar loops (minimal-cycle tracing) and
    chord-splits existing faces. `splitEdge` patches face loops.
  - `pushpull.js` — Push/Pull extrusion (standalone face → closed solid;
    embedded face → solid grows). `isClosedSolid` validates manifolds.
  - `model.js` — `CadModel` document: definitions + instances (groups are
    private definitions, components share definitions), editing contexts,
    undo/redo via `transact()`, JSON save/load, `describeForAI()`.
  - `inference.js` — ray-based snapping (endpoint/midpoint/on-edge/on-face/
    axis lock/axis direction/ground).
  - `triangulate.js` — ear clipping; `exporters/` — OBJ, binary STL,
    hand-rolled GLB.
- `src/hooks/useCadEngine.js` — React tool layer (line/rect/circle/pushpull/
  move/tape/eraser/select state machines). All mutations go through
  `model.transact()`.
- `src/components/canvas/Viewport.jsx` — r3f rendering + DOM pointer→ray
  plumbing. Picking happens in the core inference engine, not three.js
  raycasting (except nothing — it's all core).
- `src/services/aiService.js` — multi-provider chat (AI tool-execution layer
  intentionally not built yet); `fileio.js` — save/open/export downloads.

Conventions: Y-up, units = meters, ids are short prefixed strings
(`v12`, `e5`, `f3`, `d2`, `i7`) unique per model.

## Wiki — check before, update after

A knowledge wiki lives at `G:\My Drive\AI Platforms\Wiki` (markdown notes in
`vault/`, cross-linked with `[[note-id]]` syntax, visualized in `index.html`).
It documents *why* things are built the way they are and the bug history behind
current design choices — this file documents *what's true right now*, the wiki
documents *why* and *what went wrong before*.

**Before** starting any non-trivial task here (architecture change, bug fix,
export/driving logic, anything touching the character-mode pipeline): check
`vault/ai-cad/` and `vault/shared/` for relevant existing notes first.

**After** resolving a non-trivial bug or architecture decision: add or update a
note in `vault/ai-cad/`, `vault/shared/`, or `vault/issues/` as appropriate, AND
update the `status`/`updated`/`links` fields in the `wiki-chain` block at the
bottom of this file — that block is what keeps the wiki's chain view current
without anyone needing to remember to run a sync separately. See
[[claude-md-chain-architecture]] for why the block is structured this way.

<!-- wiki-chain
id: ai-cad-claude
status: Exporter pipeline stable (rotation-shatter fixed). Swap L/R button added to bone rig editor — corrects wrong auto-detected L/R labels on any driven bone via flipJointSide(). Verified live in browser.
updated: 2026-07-03
links: [ai-cad-overview, vtube-claude, vtuberig-contract, exporter-pipeline, bone-detection, scale-ground-fix, shatter-bug]
-->
