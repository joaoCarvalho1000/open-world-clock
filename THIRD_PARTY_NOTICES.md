# Third-party notices

Open World Clock is released under the MIT License (see [LICENSE](LICENSE)). It includes, or is built from, the
third-party code and data below. Each keeps its own license.

## SunCalc (BSD 2-Clause License)

The sunrise, sunset and sun altitude math is derived from [SunCalc](https://github.com/mourner/suncalc) by Volodymyr
Agafonkin: `src/renderer/sun.js`, its copy `site/assets/sun.js` (also joined into `site/app/app.bundle.js` by
`scripts/build-web.mjs`), the subsolar point in `src/renderer/views/map.js` and `site/assets/demo.js`, and the Swift
ports in `apple/WorldClockCore/Sources/WorldClockCore/Sun.swift` and `WorldMap.swift`.

```
Copyright (c) 2026, Volodymyr Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Natural Earth (public domain)

The world map's land outline comes from the [Natural Earth](https://www.naturalearthdata.com/) 1:110m land data,
which is in the public domain: `src/renderer/views/world-land.js`, its copy `site/assets/world-land.js`,
`shared/world-land.json` and `apple/WorldClockCore/Sources/WorldClockCore/Resources/world-land.json`. The globe in the
logo (`build/logo/`) is drawn from the same outline. Made with Natural Earth. Free vector and raster map data @
naturalearthdata.com.

## world-atlas (ISC License)

The Natural Earth outline was taken from the TopoJSON files in [world-atlas](https://github.com/topojson/world-atlas)
and converted to the SVG path in `world-land.js`.

```
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## Outfit font (SIL Open Font License 1.1)

Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts).

The website uses [Outfit](https://github.com/Outfitio/Outfit-Fonts) (`site/assets/fonts/outfit-var.woff2`). The
wordmark and lockups in `build/logo/` are outlines of Outfit glyphs, which the OFL allows. The full license text ships
next to the font in [site/assets/fonts/OFL.txt](site/assets/fonts/OFL.txt) and in
[build/logo/OFL-Outfit.txt](build/logo/OFL-Outfit.txt).

## Unicode CLDR (Unicode License v3)

The localized country names in `shared/zones.json` (`countryNames`) and in the copy the iPhone app bundles
(`apple/WorldClockCore/Sources/WorldClockCore/Resources/zones.json`) are written by `scripts/export-shared.mjs` from
`Intl.DisplayNames`, which reads the [Unicode CLDR](https://cldr.unicode.org/) data built into ICU. The Windows app and
the web app read the same data at runtime from Chromium's ICU.

```
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright (c) 2001-2026 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
```

## IANA Time Zone Database (public domain)

Time zone rules come from the [IANA tz database](https://www.iana.org/time-zones), which is in the public domain,
through ICU at runtime. `shared/golden.json` holds offsets computed from it for the Swift parity tests.

## Electron and Chromium

The Windows builds (installer, portable exe and Microsoft Store packages) bundle [Electron](https://www.electronjs.org/),
which includes Chromium, Node.js, V8, ICU, FFmpeg and other components under their own licenses. The packaged app ships
Electron's license as `LICENSE.electron.txt` and the Chromium component licenses as `LICENSES.chromium.html`, next to
`Open World Clock.exe`.

```
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Not part of this repository

- On the website only: PostHog's `array.js` (loaded through the `/ingest` proxy, see [PRIVACY.md](PRIVACY.md)) and
  the Ko-fi button script come from those services at runtime. Neither is copied into this repository or the apps.
- Build tools such as electron-builder, `@resvg/resvg-js` and Wrangler are installed by npm to build and deploy. They
  are not part of what ships.

City names, aliases and coordinates in `src/renderer/zones.js`, the icons in the SVG sprites and the logo artwork were
made for this project.
