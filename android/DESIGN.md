# Open World Clock for Android: design notes

## Brand translation

The desktop renderer's oklch tokens are mapped to sRGB in `ui/theme/Theme.kt` and `res/values/colors.xml`:
near-white day cards (`#FCFDFF`), night navy cards (`#1C2740`), a blue accent (`#2E6BE6`, lighter `#8DB1F7` on navy)
and a warm sun amber (`#F2C14E`) used only for the sun icon and the "now" marker. The signature idea carries over
unchanged: **a city surface is light or dark because of that city's real sun**, not because of the app theme.
The app theme (System, Light, Dark) only styles the chrome around those surfaces.

All time readouts use tabular figures so ticking digits never shift sideways.

## The sky

**Status: built on 2026-10-12 and verified on device, except where a paragraph says otherwise.
`core/Sky.kt` carries the ladder and the colour maths, `widget/SkySurface.kt` draws the surface,
and `SkyTest` holds it to the stylesheet.**

The desktop renderer and the Apple app both colour a city card from a six phase sky that follows
the real sun altitude: `src/renderer/motion/sky.js` with its stops in `motion/sky.css`, ported to
Swift in `apple/WorldClockCore/Sources/WorldClockCore/Sky.swift` ("Exactly the 6 phases of
src/renderer/motion/sky.js"). Android shipped without it. `Sun.altitude` returns a real continuous
angle and `Sun.isDay` immediately discards it at a single threshold, so every surface that picks a
colour asks a yes or no question. Nine call sites use the boolean; three use the altitude.

The visible consequence is that a city at high noon and a city one minute before sunset render
identically, and the app contradicts its own stated signature, that a city surface is light or dark
because of that city's real sun. It is light or dark because of a boolean.

**Android adopts the family's six phases and then goes one step further than the family.**

### The ladder

Phase comes from altitude plus direction of travel, taken from `Sky.swift` unchanged so all three
platforms name the same moments:

| Phase | Sun altitude | Direction |
|---|---|---|
| `night` | below -12 degrees | either |
| `twilight` | -12 to -0.833 degrees | rising, or below -4 degrees falling |
| `dusk` | -4 to -0.833 degrees | falling |
| `dawn` | -0.833 to +6 degrees | rising |
| `golden` | -0.833 to +10 degrees | falling |
| `day` | above +6 rising, above +10 falling | either |

Direction is what separates `twilight` from `dusk` and `dawn` from `golden`. The sun at -3 degrees
is at the same height going up as coming down, and the two moments do not look or feel alike:
morning runs cool and clean (hues 270 and 296), evening runs warm into magenta (hues 282 and 322).
The evening warm window is deliberately wider than the morning one, +10 degrees against +6, because
the slow evening is the one people actually watch. **Dawn is not dusk** is a product idea, not a
rendering detail, and it is the thing competitors reduce to one "night mode" switch.

### Continuous, not stepped

The desktop cross fades between the six phases. Android interpolates **within** them: the two stops
are blended toward the neighbouring phase's stops across a band either side of each boundary, in
Oklab, so the card moves continuously and never visibly snaps. The six names stay as the vocabulary
for the catalog and for what a person is told they are looking at; the pixels between them are a ramp.

Oklab is the brand's existing colour model, not an import. Every token in `style.css` is already
authored in oklch and converted to sRGB for the native platforms; blending in Oklab is what makes a
pale blue reach an amber without passing through grey.

### Two stops, not one fill

A card and a widget background are a vertical two stop gradient, top is sky and bottom is horizon,
exactly as `--sky-a` and `--sky-b` do on the desktop. The current `widget_bg_day` and
`widget_bg_night` are a single `<solid>` fill with a corner radius, which is why a widget reads flat
next to anything else on a home screen. Widgets draw the gradient as a generated bitmap, which is
already how Atlas and the sun arc are drawn, so this introduces no new technique and no new
`RemoteViews` risk.

### A paid look is a sky, not a swatch

`WidgetRenderer.palette` used to return early when a theme was set and never consult the sun, so
buying the Supporter Pack **turned the signature off** and made a widget static. The paid product
was the only thing in the app that stopped following the idea it is sold on. That is inverted:
`Sky.dressed` makes a `ThemePalette` a named interpretation of the same six phases, and the pack
now promises a voice for the sun rather than silence from it.

The palette leads and the sky inflects it. Two earlier attempts were wrong in opposite directions
and are worth recording, because both looked reasonable on paper:

- Taking the phase's hue outright turned Newsprint blue at midday. That is not Newsprint wearing
  the sky, it is the sky wearing Newsprint's lightness.
- Blending palette and sky through OKLab cancelled Paper's chroma at night, because a warm cream
  and a night blue sit on opposite sides of neutral. The result was grey with a meaningless hue.

What ships instead keeps the palette's own chroma and rotates its hue a bounded amount toward the
sky: `HUE_PULL` of 0.35, capped at `MAX_HUE_SWING` of 36 degrees, with chroma never allowed below
60 percent of the palette's own. Hue cannot separate every phase on its own, because a warm cream's
shortest path to a night blue runs backwards through red and would make midnight warmer than noon,
so a small brightness `mood` carries the rest: dimmer on the night side, a touch brighter by day.

Lightness is the channel that carries contrast, so it barely moves. `SkyTest` measures every one of
the sixteen palettes against all six phases in both themes: the worst ink contrast across that grid
is 8.48 to 1, against a floor of 4.5, and no palette drifts more than 0.03 in lightness or swings
more than 40 degrees of hue from the colour it was authored as.

### The cards

`ClockReading` carries the altitude and the direction of travel, because ClockEngine already
computed the altitude and discarding it is what made every surface ask a yes or no question. A city
card is painted from `daylightStops`, sky above and horizon below, and both stops ride the 600ms
cross fade the card already had, so a card drifts through the day instead of flipping once at
sunrise and once at sunset.

`DaylightColors` stays the source of ink, so contrast is untouched; only the surface gained the
progression. The light family of stops is the right one even in the app's dark theme, because a
card follows the city's own sun and not the app's, which is what that type has always meant.

The clearest evidence this was worth doing: with the clock at 15:30 in Sao Paulo, Lisbon sits at
dusk and Tokyo in the night. Both are night side cards, and they are now plainly different
surfaces, indigo into plum against deep navy. Under the boolean both were the same `#1C2740`.

### Every graphic is built at the aspect of its own box

No bitmap in the widgets is a fixed pixel size any more. Each one used to be drawn at a constant
and then stretched by `fitXY` into a box of some other shape, which is why the world came out twice
too tall and why the now mark, the app's one recurring sign, was an ellipse everywhere except the
single size the constant happened to match.

The renderer owns the box rather than guessing it. `sizeGraphic` pins the view with
`setViewLayoutWidth` and `setViewLayoutHeight` on API 31 and above, the layout carries a matching
value below that, and the bitmap is generated at exactly that aspect, so the two can never disagree.
Three rules came out of building it:

- Size the box against the **font scale**, not dp alone. Every graphic sits among labels set in sp,
  so the room left for it shrinks as text grows. Sizing the Sun arc in dp alone clipped its sunrise
  label at 1.5x, which `PremiumCollectionDeviceTest` caught.
- Pin the **row**, not the image, when something else shares its height. The week grid has its day
  labels in a column beside it; setting the image alone put seven labels out of step with seven
  rows.
- A fixed graphic height needs somewhere for the leftover to go, or the composition strands at the
  top of a tall widget. That is what `graphic_slack` is for.

Drawing these at their true proportions also showed up something no assertion would have: the week
grid's empty days each drew a placeholder mark, and at seven rows those stacked into noise above
seven empty tracks. An empty track already says there is no window.

### What stays

The four identity signatures are unchanged and the sky is subordinate to all of them. The now mark,
numbers staying numbers, the day seam and fill meaning amount all keep their current contrast
behaviour, and the sky never becomes a second channel carrying a second meaning: it says what time
of day it is at that city and nothing else. Contrast is measured against both stops of the gradient
and against the worst case within the ramp, not against the midpoint.

## Identity

The app must not look like other world clock apps. The products surveyed during this work were read for the
jobs they do and the platform behaviour they prove, never for their compositions. Four signatures carry the
identity, and all four grow out of the idea the brand already had rather than a new one.

**The now mark.** One recurring mark for the present moment, everywhere it appears: a filled dot in the
palette's ink over a ring in the palette's surface. It is on the overlap bar, the daylight arc, the week grid
and the hour ruler. It began as an accessibility fix, because no single colour clears 3:1 against both an empty
cell and a full accent cell, and it turned out to be the most recognisable thing the app draws.

**Numbers stay numbers.** No hour is replaced by an unlabelled tick and no readout by a dial. Every band carries
hour numbers, every grid carries its axis, every readout is a tabular numeral. This is the sharpest break from
the surveyed apps, which lean on analog faces and unlabelled bars, and it is also the accessible choice, so the
identity and the quality bar point the same way.

**The day seam.** A hairline wherever a local day turns over: in the planner, the hour ruler and the week grid.
The subject of this app is the relationship between hours, and the moment the date changes is the one
relationship nothing else shows.

**Fill means amount.** One channel, one meaning. Cell opacity carries how many cities are working, from 0.3 to
1.0 of the accent over the track. A second colour is never introduced to carry a second meaning in the same
graphic.

Across the Supporter collection these produce three recognisable compositions rather than ten of the same card:
clock-first (Duo, Board, Workday, Sun arc) leads with the readout, answer-first (Next window, Week, Clock
change) leads with a sentence, and evidence-first (Atlas, Hour ruler, Date line) leads with the graphic.

## Copy

Every screen states the thing and stops. Titles carry no subtitle unless the subtitle says something the screen
cannot show; explanations that repeat per row were removed, and the few that remain appear once. Labels are sized
for the narrowest layout, so nothing truncates at 360dp or at 1.5x font scale: a city card shows the time
difference and adds the date only when that city is on a different day from "Here".

## Language

Three languages ship: English, Brazilian Portuguese and Latin American Spanish, chosen in Settings (System,
English, Português, Español) as a wrapping radio group, because four options never fit one segmented row at large
font scales. The choice is app-wide and independent of the system language.

`i18n.LocalStrings` carries an `AppStrings` built from `ClockSettings.language`. Screens read `val t =
LocalStrings.current`, call `t.get(R.string.key, args)` for every visible, action and accessibility string, and
pass `t.locale` into every date and time formatter, into `CityCatalog.find/search/cities` for translated city and
country names, and into `ClockEngine.reading` for the localized date, phase and difference. `Locale.setDefault` is
never touched. Strings live in `res/values`, `res/values-pt` and `res/values-es` with identical keys and
placeholders; `scripts/check-translations.mjs` is the gate. Brand names, IANA zone ids, UTC offsets, the nudge
labels and the language names themselves are marked `translatable="false"`.

App-owned resource names are prefixed away from generic ones (`work_status_off`, `day_phase_night`) so a library
resource with a more specific qualifier cannot win the lookup.

## App structure

Five destinations in a bottom bar, switching to a navigation rail at 600dp and wider. Each tab keeps its state
when you leave it.

- **Clocks.** A large "Here" clock with seconds, then one card per city in a grid that becomes two columns on
  tablets and in landscape. Tap a card to convert from that city; **long press lifts it and the grid reflows
  underneath**, with a haptic on pickup, a lifted shadow and scale, a tick on each swap, and edge auto-scroll so a
  long list can be reordered end to end. The order is written through `AppServices.moveCity`, so it persists and
  the widgets refresh. Dragging is a pointer gesture, so the overflow menu and the explicit Reorder mode (up/down
  buttons, which also work with switch access) both stay; TalkBack reorders through the Move up and Move down
  custom actions. While a card is lifted its node carries a "Lifted. Drag to reorder." state description.
  Chip and button rows wrap with FlowRow, so they stay usable at 1.5x font scale on 360dp screens. TalkBack gets
  one merged sentence per card. The add button collapses to an icon as you scroll. The home screen hint appears
  only until you actually have a widget.
  The edit sheet covers display name, start/end hours (overnight shifts allowed) and working days.
- **Convert.** Source city, date and time, with 15 minute and 1 hour nudges and a Now reset. A share button next
  to the converted time sends every city's time plus a link that restores the exact instant on the website; the
  source city is included even when it is not on your list. Results are day/night cards with "Next day" notes. DST
  is explicit: a skipped time explains the spring forward and shows the adjusted time; a repeated time offers
  "First" and "Second" chips with their UTC offsets.
- **Plan.** A day selector, a reference city, a one-line answer, a whole-day overlap bar, a slider, and the hour
  grid below. See **Planner hours**.
- **Widgets.** A full tab, not a buried setting. Each widget kind has a live Compose preview drawn from your real
  cities, its size, a Customize panel (cities, style) and **Add widget**, which pins it already configured. Placed
  widgets are listed with Edit. Launchers that cannot pin from apps get instructions instead of a dead button.
- **Settings.** Theme, language, 24-hour time, a plain privacy summary (offline, no tracking, stored on device
  only), then About: share with friends, send feedback, rate the app (only on Play installs,
  where a store listing exists), and in-app views of the bundled `LICENSE` and `THIRD_PARTY_NOTICES.md`. Each is
  one tapped line with an icon and no explanation.
- **Map.** Day and night shown live over the bundled `shared/world-land.json` outline, with a pin for each saved
  city. It is a secondary screen, not a sixth tab: a globe button in the Clocks header opens it, `worldclock://map`
  links to it, and Back returns to Clocks. Night shading comes from `Sun.altitude` on a 144x54 grid, recalculated
  each minute and fading through twilight down to -12°. Pins are amber in daylight and blue at night. Tapping a pin
  or a row opens the converter. Below the map, an accessible list gives each city's time and phase, and the map
  itself has a spoken summary. Everything works offline.

Converter DST handling tracks which occurrence of a repeated hour is shown, so nudging through a fall-back hour
moves forward in real time.

## Planner hours

The planner answers one question per element, in order: the summary says when everyone can meet, the overlap bar
shows the shape of the whole day at a glance, the slider picks an hour, and the grid below gives **every hour of
the day as a number, for every city**.

Each city has a name line (name, and its local time at the selected hour, in the accent colour when that city is
working) and a strip of 24 cells underneath. A cell carries that city's real local hour, read from the slot's
instant, so DST days with 23 or 25 real hours stay correct and the reference city's own labels carry a UTC offset
on a day it changes offset. Half and quarter hour zones keep their minutes as a superscript (`14³⁰`), and the
columns widen to make room for them. A hairline marks the column where a city's local day turns over.

Columns never shrink below a legible width. The cell width is the larger of the available width divided by 24 and
a floor that scales with the font scale, so 24 numbered columns fill a tablet and scroll together on a phone
rather than being crushed into an unreadable row. All strips share one scroll state, so the columns stay aligned,
and selecting an hour scrolls it into view when it is off screen. Cell colour means working (accent), night
(a fixed dim tone that is darker than the day tone in both themes) or awake but off; text stays at full contrast
in all three, in light and dark.

The strip is touch-only: it is cleared from the semantic tree, because 24 cells per city would be 96 TalkBack
stops. The slider is the accessible hour control and announces the hour, the city and how many are working; each
city row is one merged sentence and opens the converter at the selected hour.

## Widgets

| Widget | Default size | Contents |
| --- | --- | --- |
| City clock | 2x2 | City, big live time, localized date, offset and phase. Background follows the city's daylight. |
| World clock | 4x2 | Up to 4 rows; all four fit at the default size (about 170dp). Each row needs 32dp for name and time; the offset line shows only when rows get 46dp or more, and cities drop only below about 150dp. The gallery preview uses the same rule. In Daylight style each row is its own day or night pill. |
| Meeting planner | 4x3 | Best overlap sentence, 24 hour overlap bar with numbered hour marks and a now marker, live time and Working/Off per city. |

- Digits are `TextClock` views with an explicit time zone, so they tick while the app is closed with no alarms or
  per-minute updates.
- **The city clock's date is a plain `TextView`, not a `TextClock`.** A `TextClock` formats in the launcher's
  locale, which would spell the weekday in the system language even when the app is set to another. The renderer
  writes the date in the app language instead, which makes it metadata on the same refresh schedule as everything
  else below.
- The meeting widget's overlap bar always keeps numeric hour marks: eight marks every three hours, falling back to
  four marks every six hours below about 220dp wide, and hidden only below about 100dp tall where no bar fits. The
  marks are start-aligned, so each one sits on the left edge of its own cell, and the bar bitmap draws a matching
  tick under those cells. The in-app Compose preview draws the same marks.
- All three resize. On Android 12+ the provider supplies size-mapped RemoteViews; older launchers use the size
  options. Text scales and secondary lines or rows hide as the widget shrinks.
- Each instance stores its own cities and style by `appWidgetId`. World and meeting widgets default to following
  the clock list. Styles: Daylight (sun-driven, or system theme for the meeting widget), Light, Dark.
- Configuration happens before pinning from the app, and in `WidgetConfigureActivity` when placed from the
  launcher picker or reconfigured (`reconfigurable|configuration_optional`). That activity is wrapped in
  `LocalizedApp`, so it speaks the app language too.
- `WidgetKind` carries string resources for its title and gallery blurb, so the app, the configure screen and the
  launcher label all name a widget the same way in every language.
- Tapping a city opens the converter for that city (`worldclock://convert?zone=...`). The meeting header opens the
  planner. There are no decorative buttons.
- Picker previews use `previewLayout` on Android 12+ and vector `previewImage` silhouettes before that.

### The Supporter collection

Ten more kinds. Each is a different question and a different silhouette, not a restyled clock: that is the test
a candidate had to pass to be in here at all, and recolours, font swaps and size variants of the free widgets
were refused.

| Widget | Size | The question it answers |
| --- | --- | --- |
| Duo | 4x2 | What time is it in these two places, and how far apart are they? |
| Board | 4x3 | Where is everyone, and who is working right now? |
| Workday | 4x2 | Where am I in my own working day? |
| Sun arc | 4x2 | Where is the sun in this city's day? |
| Atlas | 4x3 | Where is it light, and where is it dark? |
| Week | 4x3 | Which day this week works for everyone? |
| Next window | 4x2 | When can we all talk next? |
| Hour ruler | 4x2 | What is this hour, everywhere at once? |
| Date line | 4x3 | Who is already on tomorrow? |
| Clock change | 4x2 | What is about to change, and when? |

**Every preview in the app is the widget itself.** The gallery, the looks catalog, the Supporter sheet and the
launcher's configure screen all inflate the real `RemoteViews` in place rather than drawing an imitation of
them. There used to be a Compose re-drawing beside the renderer; it was faithful, but it was a second
implementation that could drift, and ten more kinds would have meant ten more drawings to keep in step. Now a
preview cannot disagree with the widget, because it is the widget.

`minResize` equals each kind's declared minimum. Below that size these compositions stop being readable, and
advertising a size the widget cannot honour is worse than refusing it.

**Limitation:** anything that is not a clock digit is metadata: day/night colour, the sun icon, the date, "5h
ahead", Working/Off, the overlap bar and its hour marks. It refreshes on settings changes, time, date, and time
zone broadcasts, boot, configuration, locale changes, and the 30 minute `updatePeriodMillis`. A city's sunrise, or
its date just after its local midnight, can therefore be up to about 30 minutes stale on a widget. This is the
cost of having no exact alarms.

## Sharing and support

`engagement.Engagement` owns every outbound intent; the UI only decides where the entry points live. Sharing uses
the system chooser, store links are plain `ACTION_VIEW` with `FLAG_ACTIVITY_NEW_TASK` (the composable
`LocalContext` is a localized configuration context, not an Activity), and feedback is a `mailto:`. Nothing is sent
or tracked by the app, and there are no incentives or nagging: the only automatic
prompt is the system review sheet, gated on real use, and Rate the app is shown only where a listing exists.
`MeetingShare.text` builds the shared text and a UTC-anchored link in the app's language.

## Motion

Restrained and native: city cards cross-fade between day and night over 600ms, grid items animate into place when
the list reorders, the planner summary cross-fades when the best window changes, the add button extends and
collapses with scroll, and a lifted card scales and casts a shadow. Nothing moves that does not carry meaning.

## Accessibility

48dp minimum touch targets on every control, merged semantic descriptions on cards and rows, live region on the
converter result, labelled sliders with state descriptions, sun and moon icons described in widgets, and colour
always paired with text ("Working", "Off", "Night"). Every announcement is translated along with the visible copy.
Dense grids (the planner strips) are excluded from the semantic tree and given an equivalent accessible control
rather than being exposed cell by cell.

## Supporter Pack

The optional pack is a catalog of looks and a collection of widgets: sixteen fixed palettes, seven clock faces
(one of them free), twenty four curated looks, and ten additional widget kinds. All original tools, languages,
the three free widgets and the three free styles stay free. Yearly is the primary action; both subscriptions
have clear renewal, cancellation and daily internet verification terms. Prices come only from Google Play.
Pending payments disable checkout, restoration reports its result, and existing subscribers get subscription
management.

Those are four separate counts and they are never added together into one impressive number: three free widget
kinds, ten premium widget kinds, sixteen palettes, seven faces, twenty four looks.

**Anyone may look at all of it.** Every palette, face, look and premium widget previews in full without paying,
drawn on the person's own cities, because trying one is how you find out whether it is worth anything. What
access buys is applying a look and placing a premium widget. A locked thing says so plainly and offers the pack;
it is never hidden, blurred or faked.

Widgets keep native ticking digits in every face. Losing access restores the free appearance and keeps every
saved preset and widget choice. A premium kind falls back to the free kind that answers the nearest question,
the multi-city ones to World and the single-city ones to City, and the full configuration is retained, so
renewing restores the original widget instead of asking the person to rebuild it. A premium kind cannot be set
up for the first time without access, but a widget that already exists stays editable after expiry, so nobody is
stranded with a widget whose cities they can no longer change.

Google Play Billing uses network permissions; the free clock tools stay offline.
