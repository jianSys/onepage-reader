# CrossPoint Reader Simulator

Runs the CrossPoint Reader firmware UI/EPUB logic on a desktop machine (macOS/Linux)
without flashing the Xteink X4 hardware. Backed by SDL2 for window+input and a POSIX
filesystem for the "SD card".

## Layered architecture

```
┌─ src/ + lib/ (CrossPoint application code, unchanged) ────┐
│  Activities, GfxRenderer, Epub engine, I18n, fonts        │
└────────────────────────┬──────────────────────────────────┘
                         │ HAL interface (lib/hal/Hal*.h)
┌────────────────────────▼──────────────────────────────────┐
│ simulator/hal/ — CrossPoint-specific HAL backends          │
│   HalDisplay: framebuffer → SDL texture / canvas flag      │
│   HalGPIO: SDL keys / JS events → BTN_* buttons            │
│   HalStorage: POSIX files under sd_root/ (or MEMFS /sd)    │
│   HalPower/Tilt/System: stubs (battery 87%, no IMU)        │
│ simulator/missing_symbols.cpp — link glue:                 │
│   • Activity vtables for excluded screens (WiFi/OTA/...)   │
│   • Image-decoder + obfuscation symbols (excluded)         │
│   • MySerialImpl::instance + uzlib checksum stubs          │
│   • WiFi global instance                                   │
└────────────────────────┬──────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────┐
│ simulator/shims/ — project- and ecosystem-specific headers │
│   • open-x4-sdk:   EInkDisplay, InputManager, BatteryMonitor, SDCardManager │
│   • SdFat:         common/FsApiConstants.h                 │
│   • Arduino-ESP32: WiFi, NetworkClient, StreamString, NetworkUdp, WebServer, WebSocketsServer, MD5Builder, esp_ota_ops │
│   • ESP-IDF:       esp_http_client, esp_crt_bundle, esp_err│
│   • 3rd-party:     PNGdec, JPEGDEC, base64, PubSubClient   │
│   Most are no-op/failure stubs; esp_http_client is libcurl-│
│   backed (real network — see below). QRCode is fetched,    │
│   not shimmed.                                             │
└────────────────────────┬──────────────────────────────────┘
                         │ depends on
┌────────────────────────▼──────────────────────────────────┐
│ simulator/arduino-host/ — project-independent runtime      │
│   Arduino core + FreeRTOS + ESP-system APIs over           │
│   std::thread, std::chrono, std::mutex, std::cv.           │
│   Zero SDL / project-specific dependencies. Own CMake      │
│   target + headless example + tests.                       │
└───────────────────────────────────────────────────────────┘
```

The boundary between `arduino-host/` and `simulator/shims/` is strict: **arduino-host
only contains Arduino core + FreeRTOS + ESP-IDF base APIs**. Anything Arduino-ESP32
ecosystem (WiFi, OTA, web servers), ESP-IDF HTTP stack (esp_http_client), or
third-party (image codecs, base64) lives in `simulator/shims/`. The QRCode lib is fetched (`FetchContent`, like
ArduinoJson) rather than shimmed, so the real generator runs. That keeps `arduino-host`
cleanly reusable —
`grep -rni "crosspoint|xteink|epub|wifi|http|opds|qrcode"` over its tree returns no
hits (apart from a single comment that documents what is *not* in scope).

Once `arduino-host`'s API has been validated by a second consumer project, it can be
lifted out into its own repository (or vendored via `add_subdirectory` /
`FetchContent`) with no further refactoring.

## Build

```sh
# Prerequisites
brew install sdl2 cmake      # macOS
# apt install libsdl2-dev cmake  # Linux

# From repo root:
cmake -S simulator -B simulator/build
cmake --build simulator/build -j
```

CMake fetches ArduinoJson and `ricmoo/QRCode` via `FetchContent` on first configure
(shallow clones, a few seconds).

## WebAssembly (browser) build

The same firmware also builds to WASM for the crosspoint-web homepage demo, sharing the
**same HAL sources** as the native build: `hal/HalDisplay.cpp` and `hal/HalGPIO.cpp` carry a
small `#ifdef __EMSCRIPTEN__` backend (a framebuffer dirty-flag + browser canvas instead of an
SDL texture; JavaScript events instead of SDL keys), and `shims/esp_http_client.h` compiles a
curl-free offline stub under the same guard. The WASM build sets **ENABLE_CHINESE_VERSION**
(CJK fonts + WeRead/中国象棋/农历/CJK typography — same as native) and preloads a small
public-domain book from `sd_root_demo/` into MEMFS at `/sd`. The startup UI language follows the
browser: `index.html` maps `navigator.language` to a `--lang ZH_CN|EN` arg that
`simulator_main_wasm.cpp` applies before first render. FreeRTOS tasks run on Web Worker threads
(pthreads), so the page must be cross-origin isolated (COOP/COEP).

Because the browser build has no libcurl, all networked features are offline: WeRead and any
other HTTPS path return errors through the esp_http_client stub, so those screens render but fetch
nothing. (Network config / OPDS / KOReader / OTA are out of scope on both builds — see below.)

```sh
# Prerequisites: emsdk (https://github.com/emscripten-core/emsdk), activated.
EMSDK=~/emsdk simulator/build_wasm.sh
# → simulator/build_wasm/crosspoint_simulator_wasm.{js,wasm,data}
```

The CMake WASM branch is guarded by `if(EMSCRIPTEN)`; the native build above is unchanged.
See `crosspoint-web/SIMULATOR.md` for how the artifacts are embedded and served.

## Run

```sh
./simulator/build/crosspoint_simulator                    # opens 800×480 window
./simulator/build/crosspoint_simulator --sd-root /tmp/sd  # custom sd_root
./simulator/build/crosspoint_simulator --scale 2          # 2× window magnification
```

Keyboard mapping (matches `MappedInputManager::Button::*`):

| Key       | Logical button | Default mapping              |
|-----------|----------------|------------------------------|
| Backspace | BTN_BACK       | Back / cancel                |
| Enter     | BTN_CONFIRM    | Select / next                |
| ← / →     | BTN_LEFT/RIGHT | Page back / forward (reader) |
| ↑ / ↓     | BTN_UP/DOWN    | Cursor / scroll              |
| Esc       | BTN_POWER      | Power button (hold to sleep; see below) |
| F1        | —              | Toggle simulator settings overlay |

To capture what the window shows (useful when the host won't grant screen
recording permission), set `CPSIM_DUMP_BMP` to a path and every presented frame
is also written there as a BMP:

```sh
CPSIM_DUMP_BMP=/tmp/frame.bmp ./simulator/build/crosspoint_simulator
sips -s format png /tmp/frame.bmp --out /tmp/frame.png   # macOS; any viewer works
```

`CPSIM_KEYS` replays a comma-separated button sequence so the dump can reach a
screen deep in the UI without a hand on the keyboard. Names are `UP`, `DOWN`,
`LEFT`, `RIGHT`, `ENTER` (or `CONFIRM`), `BACK`, `POWER`; one press is injected
every ~0.85 s after the first paint:

```sh
# Home → Settings → 7th row → open the theme picker, capturing the last frame
CPSIM_DUMP_BMP=/tmp/picker.bmp \
  CPSIM_KEYS="DOWN,DOWN,DOWN,ENTER,DOWN,DOWN,DOWN,DOWN,DOWN,DOWN,ENTER" \
  ./simulator/build/crosspoint_simulator
```

If the window comes up black, check the startup line that reports where it was
placed:

```
[SIM] 1 SDL display(s); window 480x800 at 660,174 (display 0)
[SIM] renderer: opengl
```

Negative coordinates mean it landed on a display that isn't part of the visible
desktop — the simulator centers on the display under the cursor and repaints on
window expose, so that should not happen anymore. To rule out the GPU path
entirely, force SDL's software backend:

```sh
CPSIM_RENDERER=software ./simulator/run.sh
```

## Host-side settings

Press **F1** to summon a translucent settings panel rendered on top of the eink
area. Left-click a row to toggle that option. Press F1 again to dismiss.

Available toggles:

- **Show device shell** — wraps the eink area in an antialiased, rounded
  black bezel modeled on the real Xteink X4 (114 × 69 × 5.9 mm @ 220 PPI →
  598 × 987 px window at 1×). Renders three right-side button bumps
  (Power / Previous / Next) and four front-face buttons along the bottom
  in a 2+2 grouping (Back+OK · Next+Previous). Turning it off shrinks
  the window back to a bare 480×800.

Settings persist to `~/.crosspoint_simulator.json` (or `./simulator_settings.json`
if `$HOME` is unset). This file is host-only — it has no effect on the firmware's
own settings, which live on the simulated SD card under `.crosspoint/`.

## SD card layout

Drop an `.epub` into `simulator/sd_root/`. The CrossPoint cache lives under
`simulator/sd_root/.crosspoint/` (gitignored):

```
simulator/sd_root/
├── sample.epub
└── .crosspoint/
    ├── settings.json
    ├── state.json
    ├── recent.json
    └── epub_<hash>/
        ├── book.bin           # metadata cache
        ├── css_rules.cache
        ├── progress.bin       # reading position
        └── sections/0.bin     # rendered section cache
```

To boot directly into the reader (skip the home screen, useful for testing rendering):

```json
{
  "openEpubPath": "/sample.epub",
  "lastSleepFromReader": true,
  "readerActivityLoadCount": 0,
  "recentSleepImages": []
}
```

Save as `simulator/sd_root/.crosspoint/state.json` before launching.

## Chinese text (CJK fonts)

The builtin UI fonts have no CJK glyphs, so Chinese labels and Chinese book text
need a `.cpfont` pack on the virtual SD card — exactly like a real card, where
the LXGW WenKai pack ships preinstalled. Apple's own faces are licensed, so a
converted pack stays local (git-ignored); convert whichever CJK face is already
on your machine:

```sh
python3 -m pip install freetype-py fonttools    # one-time
python3 simulator/make_cjk_fonts.py             # macOS: Hiragino Sans GB + Songti SC
python3 simulator/make_cjk_fonts.py MyCJK.ttf   # or any other CJK face
```

This writes 12/14/16/18 pt packs to `simulator/sd_root/.fonts/<family>/`
(git-ignored). Two consumers pick them up:

- **UI labels** — `CjkUiFontSystem` wires the 12 pt pack in as a glyph-miss
  fallback for the builtin UI fonts. `/fonts/` paths in
  `src/CjkUiFontSystem.h` list which families are accepted; `HiraginoSansGB`
  and `SongtiSC` are already there.
- **Book text** — set the reader font to the family by adding
  `"sdFontFamilyName": "SongtiSC"` to `sd_root/.crosspoint/settings.json`
  (or pick it under Settings → Reader → Font Family in the UI).

A `settings.json` with the Chinese UI + Songti reader preset:

```json
{
  "language": "ZH_HANS",
  "fontSize": 1,
  "sdFontFamilyName": "SongtiSC"
}
```

`language` is a code string (`EN` / `ZH_HANS` / `ZH_HANT`), not an index.

### The browser build

`sd_root_demo/` (preloaded into MEMFS as `/sd` for the WASM build) deliberately
carries no fonts, so the shell in `web/public/simulator/index.html` does two things
before the firmware starts:

1. fetches the SIL OFL **LXGW WenKai 12 pt** pack it ships at
   `web/public/simulator/fonts/` and writes it to
   `/sd/.fonts/LXGWWenKai-Regular/LXGWWenKai-Regular_12.cpfont` — the first
   `CjkUiFontSystem` candidate, so UI labels get their glyphs;
2. seeds `/sd/.crosspoint/settings.json` with `{"sdFontFamilyName":
   "LXGWWenKai-Regular", "fontSize": 0}` so book text renders from the same pack
   too (the UI fallback does not cover the reader font).

One 3.4 MB pack therefore covers UI + body text, and it is served as a static
asset rather than baked into `.data` — rebuilding the firmware then never forces
a re-download of the font. English visitors skip both steps. Bump the shell's `V`
cache-bust string whenever the artifacts are replaced.

### Sleep and the power button

Holding `Esc` past `SETTINGS.getPowerButtonDuration()` (400 ms, or 10 ms when the
short-press action is set to Sleep) runs the same `enterDeepSleep()` the device runs;
the inactivity timeout and the lock-screen idle path share it. What "sleep" does then
differs per build, since neither host can cut power:

- **native** — the process exits (`HalPowerManager::startDeepSleep` → `std::exit(0)`):
  the window closing is the power-down, and restarting is the wake-up.
- **WASM** — the firmware thread parks on `simulator::waitForPowerWakeup()` and the page
  keeps painting the sleep frame. The next `Esc` tap resumes: `enterDeepSleep()` returns
  into its wake tail, which re-arms the inactivity timer and `deepSleepInProgress` and
  replaces `SleepActivity` (it has no `loop()` of its own), routing to the reader when
  that is where it slept and to Home otherwise. Without that tail the stale timer would
  put us straight back to sleep on the next pass.

Parked means parked: the `[MEM]` heartbeat stops until something wakes the thread, so a
frozen-looking page with no key response is a bug, not a slow refresh. The wake gesture
is press-then-release after having let go of the press that caused the sleep, so holding
the button through the sleep transition cannot immediately undo it.

## What works in first version

- Boot → Home → Settings / FileBrowser / RecentBooks navigation
- EPUB engine end-to-end: zip extraction, content.opf/toc.xhtml parse, CSS
  parse, section layout, font glyph rendering, page progress save/load
- All on-disk caches (book.bin, sections/*.bin, css_rules.cache, progress.bin)
- Multi-language UI via the `tr()` macro (generated I18nStrings)
- 1-bpp framebuffer rendering and font system (text-only EPUBs)
- **WeRead (微信读书) app: real HTTPS to i.weread.qq.com via libcurl.** WiFi
  shim reports `WL_CONNECTED`; `HttpDownloader::postJson` runs through the
  esp_http_client shim, which is libcurl-backed on native. Drop your `wrk-…` API
  key as plain text into `simulator/sd_root/.crosspoint/weread_apikey_plain.txt`
  — first boot migrates it to base64-stored `weread_apikey.txt` and deletes the
  plain seed.
- **AirPage standby face: real QR + real cloud image fetch.** The QR (rendered
  by the real `ricmoo/QRCode` lib) encodes the device's upload URL. Pressing ▼
  runs the real `HttpDownloader` over libcurl, saving the latest image to
  `sd_root/.crosspoint/airpage/latest.bmp`, then Confirm toggles QR ⇄ image.
  The 16-char device id is a random nanoid minted on first run via `esp_random()`
  and persisted to `sd_root/.crosspoint/airpage_device_id` — it is **not** derived
  from the MAC. It stays the same across runs only as long as you keep that file
  (delete it to mint a fresh id). Read the current id off the QR page or serial
  log, then upload to that id to see your image.

## What's out of scope (first version)

- WiFi config UI / OPDS / KOReader sync / Calibre / file transfer / OTA / web server
- BLE page-turner (HID host) and ANCS notifications: NimBLE plus `esp_timer` have no
  host backend, so `src/bluetooth/` is excluded and the singletons stubbed. The BLE
  settings screens render as "not paired / not connected"
- Image rendering inside EPUBs (PNG/JPEG decoders are stubbed)
- 4-level grayscale (grayscale buffers fall through to 1-bpp — e.g. the AirPage
  image renders in plain B&W in the sim, though the BW frame still displays)
- Real e-ink refresh timing / ghosting

Activities for those features still build (we provide empty out-of-line stubs in
`missing_symbols.cpp`) but the underlying functionality returns failure if the
user navigates into them.

## Architectural compromises (worth knowing)

- **FreeRTOS uses real OS threads** (`std::thread`, not single-thread cooperative
  scheduling). The firmware's `[[noreturn]] renderTaskLoop` does
  `while (true) { ulTaskNotifyTake(portMAX_DELAY); ... }`, which can only be
  modelled correctly with real blocking. A future single-thread mode would need
  stackful coroutines (ucontext) — not built yet.
- **`SDL_HINT_NO_SIGNAL_HANDLERS` + `std::_Exit(0)`** is set so SIGTERM (e.g. from
  `timeout`, Ctrl+C, the OS shutting the window) terminates immediately instead of
  walking out through C++ static destruction. Several firmware singletons —
  `ActivityManager` most notably — have destructors that assert `false` because
  the device only ever resets; a "clean" exit would trip them.
- **Activities whose `.cpp` files are excluded** (WiFi / OPDS / OTA / KOReader sync /
  Calibre / SD firmware update / font download) have their virtual overrides
  defined empty in `missing_symbols.cpp` so the vtable links. Navigating to those
  screens in the simulator shows an empty screen rather than crashing.
- **`simulator/shims/` is mostly a parse-only layer.** Headers like `<PNGdec.h>`
  or `<JPEGDEC.h>` exist so consumer `.cpp` files compile and link, but their
  methods return an error / empty value. The exception is `<esp_http_client.h>`
  (and its `<esp_crt_bundle.h>` companion), which is **libcurl-backed and does
  real host network I/O** — that's what lets WeRead and the AirPage fetch work.
  Adding a real codec (libpng wrapper, etc.) would similarly light up the
  stubbed features.

## Verifying arduino-host stays project-independent

```sh
cmake -S simulator/arduino-host -B simulator/arduino-host/build \
    -DARDUINO_HOST_BUILD_EXAMPLES=ON -DARDUINO_HOST_BUILD_TESTS=ON
cmake --build simulator/arduino-host/build -j
./simulator/arduino-host/build/examples/blink_headless/blink_headless
ctest --test-dir simulator/arduino-host/build
grep -rni "crosspoint\|xteink\|epub" \
    simulator/arduino-host/include simulator/arduino-host/src    # should print nothing
```
