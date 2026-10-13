#pragma once
#include "activities/Activity.h"

/**
 * Boot-failure screen shown when no SD card is present (or the very first
 * Storage.begin() retry loop gave up). Polls Storage.begin() on a fixed
 * cadence; when a card appears we briefly paint a "detected" line and reboot
 * so the normal setup() path runs against a healthy SD (settings, app state,
 * recent books, SD fonts, BLE — all loaded cleanly from cold boot).
 *
 * Kept deliberately isolated: none of the SD-dependent stores are touched
 * while we're here, and we don't enter the Activity stack, so a partial boot
 * can't leak half-initialised state into other activities.
 */
class NoSdCardActivity final : public Activity {
  unsigned long lastPollAt = 0;
  // Rotates 0..3 to drive the | / - \ spinner and the icon pulse on each
  // render tick. Kept as a small counter rather than a bool so the animation
  // reads as forward motion rather than a binary flicker.
  uint8_t cursorFrame = 0;

 public:
  explicit NoSdCardActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("NoSdCard", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&& lock) override;
};
