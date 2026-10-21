// Simulator entry point. Renames Arduino's setup/loop → firmware_setup/firmware_loop
// (via CMake -Dsetup=firmware_setup -Dloop=firmware_loop), then drives them from the
// SDL main loop.

#include <HalGPIO.h>
#include <SDL.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#include "simulator_config.h"
#include "simulator_firmware.h"
#include "simulator_settings.h"
#include "simulator_window.h"

namespace {

struct CliArgs {
  std::string sdRoot = SIMULATOR_DEFAULT_SD_ROOT;
  bool sdRootProvided = false;  // --sd-root given: honour it verbatim
  int scale = SIMULATOR_WINDOW_SCALE;
};

CliArgs parse_args(int argc, char** argv) {
  CliArgs args;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    if (a == "--sd-root" && i + 1 < argc) {
      args.sdRoot = argv[++i];
      args.sdRootProvided = true;
    } else if (a == "--scale" && i + 1 < argc) {
      args.scale = std::atoi(argv[++i]);
    } else if (a == "--help" || a == "-h") {
      std::printf("Usage: %s [--sd-root <dir>] [--scale <N>]\n", argv[0]);
      std::exit(0);
    }
  }
  return args;
}

uint8_t map_key_to_button(SDL_Keycode key) {
  switch (key) {
    case SDLK_BACKSPACE:
      return HalGPIO::BTN_BACK;
    case SDLK_RETURN:
    case SDLK_KP_ENTER:
      return HalGPIO::BTN_CONFIRM;
    case SDLK_LEFT:
      return HalGPIO::BTN_LEFT;
    case SDLK_RIGHT:
      return HalGPIO::BTN_RIGHT;
    case SDLK_UP:
      return HalGPIO::BTN_UP;
    case SDLK_DOWN:
      return HalGPIO::BTN_DOWN;
    case SDLK_ESCAPE:
      return HalGPIO::BTN_POWER;
    default:
      return 0xFF;
  }
}

// CPSIM_KEYS playback lets a visual check walk to a given screen without a
// human at the keyboard, so CPSIM_DUMP_BMP can capture it: "DOWN,DOWN,ENTER"
// presses one button every kKeyStepMs after a settle delay. A "HOLD_" prefix means the
// press is long (it still auto-releases after CPSIM_KEY_HOLD_MS, which must then exceed
// the firmware's long-press threshold); "RELEASE_" injects a bare release edge.
struct ScriptedKey {
  uint8_t button;
  bool press;  // false = a RELEASE_ edge
  bool hold;   // true = a HOLD_ press: no auto-release
};

uint8_t button_for_name(const std::string& name) {
  if (name == "UP") return HalGPIO::BTN_UP;
  if (name == "DOWN") return HalGPIO::BTN_DOWN;
  if (name == "LEFT") return HalGPIO::BTN_LEFT;
  if (name == "RIGHT") return HalGPIO::BTN_RIGHT;
  if (name == "ENTER" || name == "CONFIRM") return HalGPIO::BTN_CONFIRM;
  if (name == "BACK") return HalGPIO::BTN_BACK;
  if (name == "POWER") return HalGPIO::BTN_POWER;
  return 0xFF;
}

std::vector<ScriptedKey> parse_key_script(const char* spec) {
  std::vector<ScriptedKey> script;
  if (spec == nullptr || *spec == '\0') return script;
  std::string token;
  for (const char* p = spec;; ++p) {
    if (*p == ',' || *p == '\0') {
      bool press = true;
      bool hold = false;
      std::string name = token;
      if (name.rfind("HOLD_", 0) == 0) {
        press = true;
        hold = true;
        name = name.substr(5);
      } else if (name.rfind("RELEASE_", 0) == 0) {
        press = false;
        name = name.substr(8);
      }
      const uint8_t button = button_for_name(name);
      if (button == 0xFF) {
        std::fprintf(stderr, "[SIM] CPSIM_KEYS: unknown key \"%s\" ignored\n", token.c_str());
      } else {
        script.push_back({button, press, hold});
      }
      token.clear();
      if (*p == '\0') break;
    } else {
      token.push_back(*p);
    }
  }
  return script;
}

constexpr Uint32 kKeySettleMs = 1500;  // boot + first paint
constexpr Uint32 kKeyHoldMs = 500;     // must span a full e-ink refresh to be seen
constexpr Uint32 kKeyGapMs = 350;      // settle time between two scripted presses

// Hold time override for scripted playback. 500 ms is deliberately longer than the
// firmware's long-press threshold, so a scripted press also fires the *continuous*
// (page-wise) handler: fine enough to open a screen, too coarse to walk a list one row
// at a time. CPSIM_KEY_HOLD_MS=200 turns each scripted press into a short tap that only
// moves one row; it must stay well above one loop iteration or press and release land in
// the same GPIO frame and both edges fire together (see hal/HalGPIO.cpp's two-stage buffer).
Uint32 key_hold_ms() {
  const char* value = std::getenv("CPSIM_KEY_HOLD_MS");
  if (value == nullptr || *value == '\0') return kKeyHoldMs;
  const long parsed = std::strtol(value, nullptr, 10);
  if (parsed < 60 || parsed > 2000) {
    std::fprintf(stderr, "[SIM] CPSIM_KEY_HOLD_MS: \"%s\" out of range 60..2000, using %u\n", value, kKeyHoldMs);
    return kKeyHoldMs;
  }
  return static_cast<Uint32>(parsed);
}

}  // namespace

namespace simulator {
// Defined in hal/HalGPIO.cpp.
void injectButton(uint8_t buttonIndex, bool down);
}  // namespace simulator

// Make the simulator SD-root path available to hal/HalStorage.cpp via a global.
std::string g_simulator_sd_root;

int main(int argc, char** argv) {
  // Our [SIM] trace and the firmware's LOG_* lines share stdout/stderr but come from
  // different streams; unbuffered keeps them interleaved in true time order.
  setvbuf(stderr, nullptr, _IONBF, 0);
  CliArgs args = parse_args(argc, argv);

  // Resolve the default SD root relative to the executable, not the current
  // working directory. The stock native build lives in simulator/build/, so
  // <exe>/../sd_root is simulator/sd_root — the folder carrying the demo books,
  // fonts and the .crosspoint cache. The compile-time default ("./simulator/
  // sd_root") only resolves when launched from firmware/, so starting from
  // anywhere else silently mounted an empty folder and looked like "no SD
  // card". An explicit --sd-root is always honoured verbatim.
  if (!args.sdRootProvided) {
    char* base = SDL_GetBasePath();
    if (base != nullptr) {
      const std::string candidate = std::string(base) + "../sd_root";
      SDL_free(base);
      std::error_code ec;
      if (std::filesystem::is_directory(candidate, ec)) args.sdRoot = candidate;
    }
  }
  g_simulator_sd_root = args.sdRoot;

  simulator::HostSettings hostSettings;  // defaults from HostSettings struct
  simulator::loadHostSettings(hostSettings);

  // Don't let SDL install its own SIGTERM/SIGINT handlers. By default SDL2 catches
  // them, posts SDL_QUIT, then returns control to us — which then walks out through
  // static destruction and trips ~ActivityManager()'s assert(false). With this hint
  // set, SIGTERM terminates the process directly (the kernel default) and never runs
  // C++ static destructors.
  SDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS, "1");

  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS) != 0) {
    std::fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
    return 1;
  }
  if (!simulator::SimulatorWindow::instance().open("CrossPoint Simulator", args.scale, hostSettings.showDeviceShell)) {
    SDL_Quit();
    return 1;
  }
  simulator::SimulatorWindow::instance().settingsOverlay().syncFrom(hostSettings);

  // Spawn the firmware setup()+loop() task (see simulator_firmware.h). The main thread below
  // owns the SDL window/event loop.
  simulator::startFirmwareTask();

  const std::vector<ScriptedKey> keyScript = parse_key_script(std::getenv("CPSIM_KEYS"));
  const Uint32 keyHoldMs = key_hold_ms();
  size_t keyIndex = 0;
  Uint32 keyReleaseAtMs = 0;
  uint8_t keyDown = 0xFF;
  bool keyHeld = false;  // set by a HOLD_ entry: no auto-release until the next entry
  // Chained off the previous press rather than an absolute schedule: an e-ink
  // refresh can block the loop for seconds, and a fixed schedule would then
  // fire the remaining keys back-to-back and drop some.
  Uint32 nextKeyAtMs = SDL_GetTicks() + kKeySettleMs;

  bool running = true;
  while (running) {
    SDL_Event ev;
    while (SDL_PollEvent(&ev)) {
      switch (ev.type) {
        case SDL_QUIT:
          running = false;
          break;
        case SDL_KEYDOWN:
        case SDL_KEYUP: {
          if (ev.key.repeat) break;  // Ignore key-repeat: HalGPIO is edge-triggered.
          if (ev.type == SDL_KEYDOWN && ev.key.keysym.sym == SDLK_F1) {
            auto& overlay = simulator::SimulatorWindow::instance().settingsOverlay();
            overlay.setVisible(!overlay.isVisible());
            simulator::SimulatorWindow::instance().forceRedraw();
            break;
          }
          uint8_t btn = map_key_to_button(ev.key.keysym.sym);
          if (btn != 0xFF) {
            simulator::injectButton(btn, ev.type == SDL_KEYDOWN);
          }
          break;
        }
        case SDL_MOUSEBUTTONDOWN: {
          if (ev.button.button != SDL_BUTTON_LEFT) break;
          auto& w = simulator::SimulatorWindow::instance();
          if (!w.settingsOverlay().isVisible()) break;
          if (w.settingsOverlay().handleClick(ev.button.x, ev.button.y)) {
            hostSettings.showDeviceShell = !hostSettings.showDeviceShell;
            simulator::saveHostSettings(hostSettings);
            w.setShellVisible(hostSettings.showDeviceShell);  // resizes + redraws
          }
          break;
        }
        case SDL_WINDOWEVENT:
          // macOS drops a window's contents when it is uncovered, unminimised, or
          // dragged between displays; the compositor then shows plain black until
          // the app draws again. presentIfDirty() alone would not repaint (the
          // framebuffer has not changed), leaving a black simulator until the
          // firmware happens to refresh the e-ink. Force one repaint on those
          // events.
          if (ev.window.event == SDL_WINDOWEVENT_EXPOSED || ev.window.event == SDL_WINDOWEVENT_SHOWN ||
              ev.window.event == SDL_WINDOWEVENT_RESTORED) {
            simulator::SimulatorWindow::instance().forceRedraw();
          }
          break;
        default:
          break;
      }
    }
    const Uint32 nowMs = SDL_GetTicks();

    // Scripted playback: press on schedule, release a moment later. Injected
    // before presentIfDirty() so the resulting repaint lands in the same frame.
    // Every press auto-releases after key_hold_ms (that is what makes a HOLD_ long
    // enough to trip the firmware's handlers); a RELEASE_ entry can cut a hold short.
    if (keyDown != 0xFF && nowMs >= keyReleaseAtMs) {
      simulator::injectButton(keyDown, false);
      keyDown = 0xFF;
      keyHeld = false;
    }
    if (keyDown == 0xFF && keyIndex < keyScript.size() && nowMs >= nextKeyAtMs) {
      const ScriptedKey& entry = keyScript[keyIndex];
      keyIndex++;
      keyDown = entry.button;
      keyHeld = entry.hold;
      keyReleaseAtMs = nowMs + keyHoldMs;
      nextKeyAtMs = keyReleaseAtMs + kKeyGapMs;
      simulator::injectButton(entry.button, entry.press);
      if (!entry.press) {  // a RELEASE_ edge is one shot: nothing stays down
        keyDown = 0xFF;
        keyHeld = false;
        nextKeyAtMs = nowMs + kKeyGapMs;
      }
    }

    simulator::SimulatorWindow::instance().presentIfDirty();
    // Compositor insurance: repaint once a second even when the e-ink has not
    // changed. Costs one textured quad; makes it impossible for the window to sit
    // black after the host purges its contents (display sleep, GPU context loss).
    static Uint32 lastFullPaint = SDL_GetTicks();
    if (nowMs - lastFullPaint >= 1000) {
      lastFullPaint = nowMs;
      simulator::SimulatorWindow::instance().forceRedraw();
    }
    SDL_Delay(16);  // ~60 fps event pump.
  }

  simulator::SimulatorWindow::instance().close();
  SDL_Quit();
  // Use std::_Exit (not std::exit) to skip C++ static destructors. Several firmware
  // singletons — most notably ActivityManager — have destructors that assert(false)
  // because they're not designed for clean shutdown (the device only ever resets).
  std::_Exit(0);
}
