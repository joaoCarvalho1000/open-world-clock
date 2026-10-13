# Android 0.1.0 development preview

Open World Clock now has a native Android app with offline clocks, conversion, working-hour planning, a daylight map and English, Brazilian Portuguese and Latin American Spanish interfaces.

The optional Supporter Pack adds ten native home-screen widgets: Duo, Board, Workday, Sun arc, Atlas, Week, Next window, Hour ruler, Date line and Clock change. These are separate tools, not recolors of the original three widgets. The catalog also includes 16 fixed palettes, six additional clock faces, 24 curated looks and up to 12 saved looks. In-app previews inflate the same native renderer used by the launcher.

All original clocks, conversion, planning, languages, City/World/Meeting widgets and their three free styles stay free. Expired premium access keeps saved choices and renders a useful free widget; renewed verified access restores the premium design.

Clock digits use native live clocks. Solar graphics, schedules, dates, offset changes and working-window answers refresh approximately every 30 minutes and on relevant system/app changes. Sun arc handles polar day/night; working-window tools account for overnight schedules, fractional offsets and daylight-saving transitions. Clock change uses the device's time-zone rules.

The requested US base prices are $1 monthly or $5 yearly for the same pack. Actual localized prices come from Google Play. This development build has no configured live checkout or premium-unlock bypass. You can freely inspect every premium design in the gallery.

## Testing and release status

See [README.md](README.md#verification) for the exact verified build and test coverage. The phone preview is debug-signed. Production signing, Google Play setup and internal-track subscription lifecycle tests remain required. Physical-phone and additional-launcher checks are pending; API 26 to 30 picker previews use the app icon, while Android 12 and later use layout previews. No store publication is included.

The broader repository change also keeps desktop/web planner hour numbers visible at narrow widths and moves fractional offsets beside city labels. Equivalent iPhone planner changes are prepared but require Xcode and device validation before release.

## 12 October testing update

Removed the Ko-fi donation entry and note from Android. Fixed purchase, restore and expiry refreshes to update all thirteen widget providers, including the ten premium kinds. Added public billing-key and upload-signing preflight checks. Account verification, app registration and the payments profile are complete. The latest debug APK and signed release bundle include the actual app public licensing key. Version 0.1.0 (1) was published to internal testing with owner approval on 12 October 2026; the owner account is configured for internal and license testing. Monthly and yearly subscription base plans are active at exactly US$1.00 and US$5.00, with regional prices and EN/PT-BR/ES-419 metadata. Play Console confirms Available to internal testers. No production release has been published; actual Play checkout remains untested.
