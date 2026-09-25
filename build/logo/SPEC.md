# Open World Clock logo

## Direction

Selected by the user: **07B**, with hour markings only on the navy clock side. The blue globe occupies the left side of a curved day/night split. Tapered gold hour and minute hands meet at a small pivot, and a fine gold rim outlines the dial. Five pale hour markers indicate 1 through 5; there are no markers over the globe.

All ten original options and the twelve variations are preserved in `brand/archive/design-history.zip`. The selected logo is maintained in `brand/logo/` and exported in `brand/exports/logo/`. The application icon outside `brand/` is a separate asset.

## Construction

1024-unit square viewBox; dial centered at (512, 512), radius 420. The day/night boundary runs from (512, 92) to (512, 932), using cubic controls (690, 280) and (690, 744). The gold rim has radius 405 and stroke 4. Hour indices sit at radius 384, at angles 30, 60, 90, 120, and 150 degrees clockwise from noon, with stroke 7. Compact sources increase index stroke to 10 and rim stroke to 7.

The hour hand is shorter and wider than the minute hand, with pointed ends and tapered shoulders. The pivot radius is approximately 20 units. Gold is `#e6bc68`; the small pivot center is navy. Define **x = 40 SVG units** and keep at least 1x clear space outside the visible edge of every mark or lockup.

Land derives from the public-domain Natural Earth contours in `site/assets/world-land.js`, orthographically projected around 25 degrees west at the equator. The map uses `#e4f2ff` at 65% opacity and is clipped to the day sector. Mono assets use the same globe/dial arrangement with one ink, a circular outline, and transparent clearance around the hands.

Horizontal and stacked lockups retain the outlined Outfit wordmark. The sources contain no embedded raster images, live text, gradients, or transform attributes.

## Lettering

- Text: **Open World Clock**, title case.
- Typeface: **Outfit Variable**, under the Open Font License, from `site/assets/fonts/outfit-var.woff2`.
- Weight: **600 (SemiBold)**.
- Tracking: **+0.012 em** (2.184 units at the 182-unit authoring size). Optical pair corrections: `Wo -5`, `Cl -3`, `Op -2` authoring units.
- Every glyph is a static outlined SVG path generated with fontTools; the wordmark and lockups have no installed-font dependency.

## Minimum sizes

| Asset | Digital | Print |
| --- | ---: | ---: |
| Compact mark | 16 px wide | 4 mm wide |
| Regular or monochrome mark | 32 px wide | 5 mm wide |
| Horizontal lockup | 220 px wide | 32 mm wide |
| Stacked lockup | 180 px wide | 28 mm wide |

Use the compact source at 16, 24, and 32 px. The compact sources use heavier hands and indices for small-size clarity.

## Colors

OKLCH values are calculated from the exact SVG sRGB hex values and rounded to four decimals.

| Role | Hex | OKLCH |
| --- | --- | --- |
| Night field | `#152d59` | `oklch(0.3046 0.0848 261.3420)` |
| Day field | `#2f6fe0` | `oklch(0.5644 0.1847 260.8208)` |
| Wordmark and dark mono ink | `#121b28` | `oklch(0.2201 0.0289 257.5263)` |
| Land and hour markers | `#e4f2ff` | `oklch(0.9546 0.0230 246.0369)` |
| Clock hands | `#e6bc68` | `oklch(0.8152 0.1135 83.2561)` |
| Light mono | `#ffffff` | `oklch(1 0 0)` |

## Files and regeneration

```
brand/
  README.md, requirements.txt
  archive/design-history.zip
  build_logo.py
  logo/
    SPEC.md
    mark.svg, mark-small.svg, mark-on-dark.svg, mark-small-on-dark.svg
    mark-mono-dark.svg, mark-mono-light.svg
    wordmark.svg
    lockup-horizontal.svg, lockup-stacked.svg
    lockup-horizontal-on-dark.svg, lockup-stacked-on-dark.svg
    lockup-horizontal-mono-dark.svg, lockup-stacked-mono-dark.svg
    lockup-horizontal-mono-light.svg, lockup-stacked-mono-light.svg
  exports/logo/
    mark*.png, wordmark*.png, lockup*.png
    mark.pdf, lockup-horizontal.pdf, lockup-stacked.pdf
    lockup-horizontal-on-dark.pdf, lockup-stacked-on-dark.pdf
    *.svg (distribution copies of all 15 masters)
    mark.ico, mark.icns, contact-sheet.png, preview.png
  exports/open-world-clock-logo.zip
```

Run `python brand/build_logo.py` to regenerate all exports from the SVG masters. It uses the repository's local resvg installation, Pillow, svglib, and ReportLab; Python packages are under `brand/.vendor`. `--init-sources` is the authoring option that rebuilds the outlined Outfit wordmark and the lockup SVG masters after a mark change. Ordinary runs only read SVG masters and regenerate PNG, PDF, ICO, and contact-sheet exports.

Each mark variant exports transparent PNGs at 16, 24, 32, 48, 64, 128, 256, 512, and 1024 px. `mark` uses `mark-small` at 16-32 px; `mark-on-dark` likewise uses `mark-small-on-dark`. Horizontal lockups export at 400, 800, and 1600 px wide; stacked lockups at 300, 600, and 1200 px wide. The wordmark exports at 400, 800, and 1600 px wide. The five PDFs contain vector drawings, not embedded PNGs.

The ZIP contains the final SVG masters, exports, construction notes and Outfit license. ICO provides Windows sizes 16/24/32/48/64/128/256; ICNS provides macOS icon representations. PDF is supplied for the main color mark and four color lockups; monochrome variants remain SVG and PNG because the PDF converter does not preserve their transparent clearance masks. The archive is historical only and must not be used to rebuild the selected logo.
