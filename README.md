# Lakar CAD

A SketchUp-style 3D modeler that runs in the browser, with a from-scratch
topological geometry engine designed so an AI assistant can read and edit the
model through the same operations the human tools use.

## The core ideas

- **Line → Face**: draw edges; the moment a closed planar loop forms, the
  engine detects it (minimal-cycle tracing on the plane) and creates a face —
  SketchUp's signature behavior. Drawing across an existing face splits it.
- **Face → Solid**: Push/Pull extrudes any face along its normal, building the
  side walls automatically. A standalone face becomes a *closed manifold
  solid*; pulling a face of an existing solid grows it.
- **Real topology**: vertices, edges and faces live in a graph with full
  adjacency (vertex→edges, edge→faces). Vertices weld, edges dedupe, deleting
  an edge kills its faces — the invariants hold through every operation.
- **Groups & Components**: selections become instances of definitions.
  Components share definitions (edit one, all update); groups are made unique
  when you edit them. Double-click to edit inside, Esc to climb out.
- **Inference engine**: endpoint / midpoint / on-edge / on-face snapping,
  axis locking (arrow keys) and axis-direction inference, all computed against
  world-space geometry — snapping works across group boundaries.
- **One source of truth**: the whole document is a clean JSON scene graph
  (definitions, instances, meshes with stable short ids). `describeForAI()`
  emits a compact structured summary whose ids map 1:1 to engine operations —
  the future AI layer plugs in here.

## Tools

Select (Space) · Eraser (E) · Line (L) · Rectangle (R) · Circle (C) ·
Push/Pull (P) · Move (M) · Tape (T) · Orbit — plus undo/redo (Ctrl+Z/Y),
Group (G), Component (Shift+G), Explode, and typed measurements
(type a length and press Enter while drawing).

## Save & export

- **Save / Open** — native `.lakar.json` (lossless round-trip of the scene graph)
- **OBJ** — universal polygon interchange (Blender, Maya, FreeCAD, ...)
- **STL** — binary, triangulated, for 3D printing / CAM
- **glTF (.glb)** — binary glTF 2.0 with per-color PBR materials, hand-rolled
  with zero dependencies

## Architecture

```
src/core/        pure JS engine — no React, no three.js, fully unit-tested
  math3.js       vectors, planes, rays, 4x4 matrices
  mesh.js        topology + face auto-detection + splitting
  pushpull.js    extrusion (face → solid)
  model.js       document: definitions/instances, contexts, undo, (de)serialization
  inference.js   snapping & axis inference
  triangulate.js ear clipping
  shapes.js      rectangle/circle construction helpers
  exporters/     obj.js, stl.js, glb.js
src/hooks/useCadEngine.js   React tool layer (state machines per tool)
src/components/             viewport (react-three-fiber) + SketchUp-style UI
tests/                      node --test suites for the whole engine
```

## Building (important — this folder lives on Google Drive)

Never run `npm install` here; Drive corrupts `node_modules`. Use the mirror
script instead (see [BUILD.md](BUILD.md)):

```powershell
.\build.ps1          # build → dist/
.\build.ps1 -Dev     # dev server
.\build.ps1 -Test    # run the engine test suite
```
