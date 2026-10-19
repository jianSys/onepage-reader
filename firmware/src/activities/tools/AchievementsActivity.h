#pragma once

#include <vector>

#include "activities/Activity.h"
#include "activities/tools/ReadingAchievements.h"
#include "util/ButtonNavigator.h"

// Achievements screen (P4): a scrolling list of reading achievements with their
// generated descriptions and live progress. Unlocked rows sort first; locked ones
// are dimmed. Read-only, key-only (Back exits). Plain Activity - no freeink, no touch.
class AchievementsActivity final : public Activity {
 public:
  explicit AchievementsActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("Achievements", renderer, mappedInput) {}
  ~AchievementsActivity() override = default;

  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;

 private:
  std::vector<AchievementView> views;
  int selectorIndex = 0;
  ButtonNavigator buttonNavigator;
};
