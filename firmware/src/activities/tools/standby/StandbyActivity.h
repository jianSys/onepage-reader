#pragma once

#include <cstdint>
#include <memory>

#include "StandbyFace.h"
#include "activities/Activity.h"

// Standby screen (P5): a key-only carousel over one or more "faces" (a clock,
// the Chinese almanac, ...). Plain Activity - no freeink, no touch, and none of
// the upstream app's WiFi time-sync / light-sleep / grayscale-immersive
// subsystems: the wall clock comes from the device's existing time source
// (see StandbyTime over util/TimeUtils), and the screen simply stays awake and
// ticks while open (preventAutoSleep), like ClockLockScreen.
//
// Controls:
//   Up / Down  - per-face page gesture (the Sloppy clock rerolls its style)
//   Left / Right - switch face (no-op with a single face installed)
//   Confirm    - toggle inverse (black background / white content)
//   Back       - exit back to the Tools menu (finish)
class StandbyActivity final : public Activity {
 public:
  explicit StandbyActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("Standby", renderer, mappedInput) {}
  ~StandbyActivity() override = default;

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

  bool preventAutoSleep() override { return true; }

 private:
  std::unique_ptr<StandbyFace> currentFace_;
  uint8_t faceIndex_ = 0;
  bool inverseMode_ = false;

  void switchFace(int8_t delta);
  void processFaceTick();
};
