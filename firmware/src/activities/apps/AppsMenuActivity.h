#pragma once
#include <vector>

#include "activities/Activity.h"
#include "activities/tools/ToolApp.h"
#include "util/ButtonNavigator.h"

// Single hub for everything that is neither reading nor settings: the tool
// registry, the game registry and the word book, behind one Home entry.
// Adding a tool or a game means appending a row to getToolApps() / getGameApps();
// nothing here changes. The word book is a fixed trailing row rather than a
// registry entry because it is not a plugin. Back returns home, Confirm launches
// the highlighted screen as a sub-activity so finishing it pops straight back to
// this list.
class AppsMenuActivity final : public Activity {
  ButtonNavigator buttonNavigator;
  int selectorIndex = 0;
  // Both registries flattened into one list, tools first. Built in onEnter():
  // rebuilding it per loop would copy a dozen std::function objects for nothing.
  std::vector<ToolApp> entries;

  // Rows are the registry entries plus the word book.
  [[nodiscard]] int getRowCount() const { return static_cast<int>(entries.size()) + 1; }
  [[nodiscard]] bool isWordBookRow(const int index) const { return index == static_cast<int>(entries.size()); }

 public:
  explicit AppsMenuActivity(GfxRenderer& renderer, MappedInputManager& mappedInput)
      : Activity("AppsMenu", renderer, mappedInput) {}
  void onEnter() override;
  void loop() override;
  void render(RenderLock&&) override;
};
