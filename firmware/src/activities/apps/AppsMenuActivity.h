#pragma once
#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// Hub for on-device games (Sudoku, and future titles). A single scrolling list
// launched from Home's "Apps" entry, mirroring tools/ToolsMenuActivity. Adding a
// game means appending one row to getGameApps(); nothing here changes. Back
// returns home, Confirm launches the highlighted game's entry screen as a
// sub-activity so finishing it pops straight back to this list.
class AppsMenuActivity final : public Activity {
  ButtonNavigator buttonNavigator;
  int selectorIndex = 0;

 public:
  explicit AppsMenuActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("AppsMenu", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
