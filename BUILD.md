# Building Lakar CAD

This project lives on **Google Drive**, and Google Drive's virtual filesystem
corrupts `npm install` (it silently produces thousands of zero-byte files in
`node_modules`). **Never run `npm install` or `npm run build` directly in this
folder.**

Instead use the mirror build script (same pattern as the vtube project):

```powershell
.\build.ps1            # sync → npm install (if needed) → vite build → copy dist back
.\build.ps1 -Install   # force a fresh npm install in the mirror
.\build.ps1 -Dev       # start the Vite dev server (serves the local mirror)
.\build.ps1 -Test      # run the core engine test suite (node --test)
```

How it works:

1. Source of truth stays here on Drive.
2. The script mirrors `package.json`, `package-lock.json`, `vite.config.js`,
   `index.html`, `src/`, `public/`, `tests/` to `%LOCALAPPDATA%\AI CAD-build`.
3. All node/npm work happens in that local mirror.
4. The finished `dist/` is copied back here, ready to deploy.

## Dev-server caveat

`.\build.ps1 -Dev` serves the **mirror**, not the Drive folder. After editing
files on Drive, re-run the script (or edit in the mirror and copy back).

## Tests

The geometry core (`src/core/`) is dependency-free ESM, so the tests run
straight from Drive with no install step:

```powershell
node --test tests/core.test.mjs
```
