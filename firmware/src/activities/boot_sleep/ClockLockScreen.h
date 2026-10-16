#pragma once
#include "activities/Activity.h"

/**
 * Live lock-screen clock. Shown when the power button is short-pressed with
 * the SHORT_PWRBTN::LOCK_SCREEN action set. Renders a large HH:MM and refreshes
 * the panel once a minute so the digits advance in place ("会走字"). The board
 * has no hardware RTC (OnePage C61), so wall-clock time comes from the phone
 * pushing its epoch over POST /api/set-time into the ESP32 system clock; the
 * SoC's internal RTC keeps counting across light/idle periods. If the clock was
 * never synced (cold boot, epoch 0) we show "--:--" and a "sync first" hint.
 *
 * The device must stay awake to keep updating, so preventAutoSleep() is true;
 * any button release exits back to whatever activity was on screen before
 * (finish() pops the stack). A short grace window after entering swallows the
 * same power-button release that launched us, so we don't exit immediately.
 */
class ClockLockScreen final : public Activity {
 public:
  explicit ClockLockScreen(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("ClockLock", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&& lock) override;

  bool preventAutoSleep() override { return true; }
  bool isClockActivity() const override { return true; }
  // Idle for lockScreenIdleMinutes with no button press => ask main.cpp to deep
  // sleep (any press exits the clock first, so entry time is the idle anchor).
  bool shouldIdleSleep() const override;

 private:
  unsigned long enteredAtMs = 0;   // millis() at onEnter, drives the exit grace window
  unsigned long lastPollMs = 0;    // last time we sampled the clock in loop()
  int lastShownMinute = -1;        // minute drawn on the panel; change => refresh
  bool lastShownValid = false;     // whether the last frame showed a real time
};
