# Open World Clock logo sources

Approved direction 07B: a globe split into day and night, with gold hands and hour markers on the navy side. These SVG files are copies of the masters in the brand kit (`brand/logo/`, not tracked in git) and are the only input for every icon, tile and logo raster in the repository. `SPEC.md` has the construction, clear space, minimum sizes and colors. `OFL-Outfit.txt` is the license for the Outfit lettering outlined in the wordmark and lockups.

| File | Use |
| --- | --- |
| `mark.svg` | Color symbol, 48 px and up |
| `mark-small.svg` | Compact symbol with heavier hands, markers and rim, 16 to 32 px |
| `mark-on-dark.svg`, `mark-small-on-dark.svg` | Same artwork, kept for parity with the brand kit |
| `wordmark.svg` | "Open World Clock" in outlined Outfit SemiBold |
| `lockup-horizontal.svg` | Mark and wordmark for light backgrounds |
| `lockup-horizontal-on-dark.svg` | Mark and white wordmark for dark backgrounds |

## Regenerate

From the repository root:

```
node scripts/build-icons.mjs
node scripts/build-icons.mjs --check
```

The first command writes every output and leaves files whose bytes did not change alone. `--check` writes nothing and exits with status 1 if any output is out of date. Rendering uses `@resvg/resvg-js` from `build/icons-tools/node_modules` (run `npm install` in `build/icons-tools` if it is missing). PNG and ICO files are encoded by the script with `node:zlib`, with no timestamps or metadata, so repeated runs on the same Node and resvg versions give byte-identical files.

## Outputs

Framing: "icon framing" crops the mark to exactly 1x clear space (x = 40 units) around the disc, so the disc fills 91 percent of the canvas. The compact source is used at 32 px and below.

| Output | Size | Content |
| --- | --- | --- |
| `build/icon.ico` | 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256 | Transparent, icon framing. Installer, exe, window and tray icon |
| `build/icon.png` | 512 | Transparent, icon framing. README header |
| `build/appx/Square44x44Logo.png` | 44 | Opaque plate in `build.appx.backgroundColor`, disc 82 percent |
| `build/appx/StoreLogo.png` | 50 | Same as above |
| `build/appx/Square150x150Logo.png` | 150 | Plate, 76 px disc centered (room for the tile name) |
| `build/appx/Wide310x150Logo.png` | 310x150 | Plate, 76 px disc centered |
| `build/appx/SplashScreen.png` | 620x300 | Plate, horizontal on-dark lockup 420 px wide |
| `build/appx/Square44x44Logo.targetsize-N.png` | N = 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256 | Plated, as the 44 px asset |
| `build/appx/Square44x44Logo.targetsize-N_altform-unplated.png` | same | Transparent, icon framing. Taskbar and Start on a dark theme |
| `build/appx/Square44x44Logo.targetsize-N_altform-lightunplated.png` | same | Transparent, icon framing. Taskbar and Start on a light theme |
| `site/favicon.ico` | 16, 32, 48 | Transparent, icon framing |
| `site/assets/icon-32.png` | 32 | Transparent, icon framing |
| `site/assets/icon-180.png` | 180 | Apple touch icon: opaque `#ecf5fd`, disc 78 percent |
| `site/assets/icon-512.png` | 512 | Transparent, icon framing (manifest purpose "any") |
| `site/assets/icon-512-maskable.png` | 512 | Opaque navy plate, disc 70 percent (inside the 80 percent safe circle) |
| `site/assets/logo.svg` | vector | Optimized copy of `mark.svg` (coordinates rounded, master framing) |
| `site/assets/logo-small.svg` | vector | Optimized copy of `mark-small.svg` with icon framing, for an SVG favicon |
| `site/assets/og.png` | 1200x630 | Only the 68x68 area around the icon left of "Open World Clock" is rebuilt, with a 52 px disc centered where the old icon was. Every other pixel is kept |
| `apple/.../AppIcon-1024.png` | 1024 | Light: opaque sky gradient `#f6fbff` to `#dcebfb`, no alpha, disc 78 percent |
| `apple/.../AppIcon-1024-dark.png` | 1024 | Dark: transparent background (iOS draws the dark backdrop), disc 78 percent |
| `apple/.../AppIcon-1024-tinted.png` | 1024 | Tinted: grayscale mark on black, no alpha; brighter areas take more tint |
| `docs/readme/logo-lockup-light.png` | 1365x192 | Transparent horizontal lockup, dark wordmark |
| `docs/readme/logo-lockup-dark.png` | 1365x192 | Transparent horizontal lockup, white wordmark |

The Windows plate color is read from `package.json` `build.appx.backgroundColor` (currently `#16192A`), so plated tiles always match the manifest background and the white tile name stays readable. Change that value and rerun the script to recolor the tiles.

No `.scale-NNN` tile variants are generated on purpose: electron-builder's `priconfig.xml` moves scale candidates into separate `resources.scale-NNN.pri` files that a single `.appx` does not load, while target size candidates stay in `resources.pri`.

## Editing the logo

Edit the masters in the brand kit, run `python brand/build_logo.py` there, copy the changed SVG files into this folder, then run `node scripts/build-icons.mjs` and review the results at 16, 24 and 32 px on light and dark backgrounds.
