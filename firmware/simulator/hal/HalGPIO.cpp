// HAL GPIO backend for the simulator (native SDL window + WebAssembly browser builds).
//
// Maintains the 7 logical button states from HalGPIO::BTN_*. Press/release events are fed
// in by whichever frontend owns input:
//   - native: simulator_main.cpp forwards SDL key events,
//   - WASM:   the browser calls the exported simulator_inject_button() (keyboard + touch).
// Both paths funnel through simulator::injectButton(). Hold-time tracking uses millis()
// (arduino-host, a monotonic std::chrono clock available to both builds).
//
// simulator::waitForPowerWakeup() parks the firmware thread while the browser build is
// "asleep" — see HalPowerManager::startDeepSleep().

#include <Arduino.h>  // millis()
#include <HalGPIO.h>

#include <condition_variable>
#include <cstdlib>
#include <mutex>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

namespace {
constexpr size_t kButtonCount = 7;

// Matches hardware InputManager edge semantics: events are valid for exactly one update()
// cycle. injectButton() (SDL event pump / browser main thread) writes to pending* fields;
// update() (firmware thread, once per loop) latches pending → frame and clears pending; reads
// return frame* without consuming. The two-stage buffer prevents losing events that arrive
// after the firmware reads but before the next update().
struct ButtonStates {
  bool pressed = false;
  bool pendingPressed = false;
  bool pendingReleased = false;
  bool framePressed = false;
  bool frameReleased = false;
  unsigned long pressedAtMs = 0;
};

std::mutex& state_mutex() {
  static std::mutex m;
  return m;
}

// Signalled by injectButton() so a thread parked in waitForPowerWakeup() wakes on the
// event instead of polling.
std::condition_variable& state_cv() {
  static std::condition_variable cv;
  return cv;
}

ButtonStates g_buttons[kButtonCount];
}  // namespace

namespace simulator {
// Called on each key/touch event (SDL event pump on native, browser on WASM).
void injectButton(uint8_t buttonIndex, bool down) {
  if (buttonIndex >= kButtonCount) return;
  std::lock_guard<std::mutex> lock(state_mutex());
  ButtonStates& b = g_buttons[buttonIndex];
  if (down && !b.pressed) {
    b.pressed = true;
    b.pendingPressed = true;
    b.pressedAtMs = millis();
    state_cv().notify_all();
  } else if (!down && b.pressed) {
    b.pressed = false;
    b.pendingReleased = true;
    state_cv().notify_all();
  }
}

// Park the calling (firmware) thread until the power button is tapped again. There is no
// chip reset to wait for on a host, and the browser must keep painting while we idle —
// so this blocks on the button state, which the page's main thread keeps updating.
//
// Three phases, because the press that put us to sleep is still held when we get here:
// let go of it, then a fresh press, then release that press. One tap is a wake-up.
void waitForPowerWakeup() {
  std::unique_lock<std::mutex> lock(state_mutex());
  const auto held = [] { return g_buttons[HalGPIO::BTN_POWER].pressed; };
  auto& cv = state_cv();
  cv.wait(lock, [&held] { return !held(); });
  cv.wait(lock, [&held] { return held(); });
  cv.wait(lock, [&held] { return !held(); });
}
}  // namespace simulator

void HalGPIO::begin() {}

void HalGPIO::update() {
  std::lock_guard<std::mutex> lock(state_mutex());
  for (auto& b : g_buttons) {
    b.framePressed = b.pendingPressed;
    b.frameReleased = b.pendingReleased;
    b.pendingPressed = false;
    b.pendingReleased = false;
  }
}

bool HalGPIO::isPressed(uint8_t buttonIndex) const {
  if (buttonIndex >= kButtonCount) return false;
  std::lock_guard<std::mutex> lock(state_mutex());
  return g_buttons[buttonIndex].pressed;
}

bool HalGPIO::wasPressed(uint8_t buttonIndex) const {
  if (buttonIndex >= kButtonCount) return false;
  std::lock_guard<std::mutex> lock(state_mutex());
  return g_buttons[buttonIndex].framePressed;
}

void HalGPIO::injectPress(uint8_t buttonIndex) {
  // Synthetic edge for this frame only, mirroring InputManager::injectPressedEvents.
  // The caller (main loop) runs this right after update(), so the flag survives until
  // the next update() latches pending -> frame.
  if (buttonIndex >= kButtonCount) return;
  std::lock_guard<std::mutex> lock(state_mutex());
  g_buttons[buttonIndex].framePressed = true;
}

bool HalGPIO::wasAnyPressed() const {
  std::lock_guard<std::mutex> lock(state_mutex());
  for (auto& b : g_buttons) {
    if (b.framePressed) return true;
  }
  return false;
}

bool HalGPIO::wasReleased(uint8_t buttonIndex) const {
  if (buttonIndex >= kButtonCount) return false;
  std::lock_guard<std::mutex> lock(state_mutex());
  return g_buttons[buttonIndex].frameReleased;
}

bool HalGPIO::wasAnyReleased() const {
  std::lock_guard<std::mutex> lock(state_mutex());
  for (auto& b : g_buttons) {
    if (b.frameReleased) return true;
  }
  return false;
}

unsigned long HalGPIO::getHeldTime() const {
  std::lock_guard<std::mutex> lock(state_mutex());
  unsigned long now = millis();
  unsigned long maxHeld = 0;
  for (auto& b : g_buttons) {
    if (b.pressed && b.pressedAtMs > 0) {
      unsigned long held = now - b.pressedAtMs;
      if (held > maxHeld) maxHeld = held;
    }
  }
  return maxHeld;
}

unsigned long HalGPIO::getPowerButtonHeldTime() const {
  // BTN_POWER is injected like any other key (Esc on both frontends), so report how long
  // it has actually been down. Returning a constant here is what silently disabled
  // "hold the power button to sleep" in the simulator: main.cpp compares this against
  // SETTINGS.getPowerButtonDuration(), and 0 never clears that bar.
  std::lock_guard<std::mutex> lock(state_mutex());
  const ButtonStates& power = g_buttons[BTN_POWER];
  if (!power.pressed || power.pressedAtMs == 0) return 0;
  return millis() - power.pressedAtMs;
}

#ifdef __EMSCRIPTEN__
// No real device to sleep. In the browser we keep the runtime alive; treat deep sleep as a
// no-op (the page stays on the last rendered frame).
void HalGPIO::startDeepSleep() {}
#else
// Native: exit the process to mimic the device powering down.
void HalGPIO::startDeepSleep() { std::exit(0); }
#endif

void HalGPIO::verifyPowerButtonWakeup(uint16_t /*requiredDurationMs*/, bool /*shortPressAllowed*/) {
  // No-op: in the simulator we always proceed past the boot wakeup gate.
}

bool HalGPIO::isUsbConnected() const { return true; }
bool HalGPIO::wasUsbStateChanged() const { return false; }

HalGPIO::WakeupReason HalGPIO::getWakeupReason() const { return WakeupReason::Other; }

HalGPIO gpio;

#ifdef __EMSCRIPTEN__
// ---------------------------------------------------------------------------
// C export consumed by the browser side. buttonIndex matches HalGPIO::BTN_*:
// 0=Back 1=Confirm 2=Left 3=Right 4=Up 5=Down 6=Power. down=1 press, 0 release.
// ---------------------------------------------------------------------------
extern "C" EMSCRIPTEN_KEEPALIVE void simulator_inject_button(int buttonIndex, int down) {
  simulator::injectButton(static_cast<uint8_t>(buttonIndex), down != 0);
}
#endif
