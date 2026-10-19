#pragma once

#include "activities/Activity.h"

// Reading profile (P4): a lifetime "at a glance" sheet computed live from our
// ReadingStatsStore - total time, books started/finished, sessions, longest
// session, streaks, goal days and the top books by reading time. Read-only,
// key-only (Back exits). Plain Activity - no freeink, no touch, no crossmux store.
class ReadingProfileActivity final : public Activity {
 public:
  explicit ReadingProfileActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("ReadingProfile", renderer, mappedInput) {}
  ~ReadingProfileActivity() override = default;

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
