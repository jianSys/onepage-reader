#pragma once

#include <functional>
#include <memory>
#include <vector>

#include "I18n.h"
#include "GfxRenderer.h"
#include "MappedInputManager.h"
#include "activities/Activity.h"

// A game "app" shown in the apps hub. Mirrors tools/ToolApp.h: each entry
// carries its i18n title/subtitle ids plus a factory for the launching
// Activity. Adding a game is just appending to getGameApps() below. The
// factory returns the game's own entry screen (its menu, if it has one).
struct AppGame {
  StrId titleId;
  StrId subtitleId;
  std::function<std::unique_ptr<Activity>(GfxRenderer& renderer, MappedInputManager& mappedInput)> factory;
};

// Registry of installed game apps. Order here is the order shown in the hub.
std::vector<AppGame> getGameApps();
