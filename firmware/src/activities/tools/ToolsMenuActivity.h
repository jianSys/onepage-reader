#pragma once
#include "activities/Activity.h"
#include "util/ButtonNavigator.h"

// Hub for standalone on-device utilities (Pomodoro, and future tools). A single
// scrolling list launched from Home's "Tools" entry. Adding a tool means appending
// one row here plus its Activity; nothing in Home changes. Back returns home,
// Confirm launches the highlighted tool as a sub-activity so finishing it pops
// straight back to this list.
class ToolsMenuActivity final : public Activity {
  ButtonNavigator buttonNavigator;
  int selectorIndex = 0;

  int getToolCount() const;

 public:
  explicit ToolsMenuActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("ToolsMenu", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
