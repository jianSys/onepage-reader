#pragma once

#include <functional>
#include <memory>
#include <vector>

#include "activities/Activity.h"
#include "I18n.h"
#include "GfxRenderer.h"
#include "MappedInputManager.h"

// A tool "app" shown in the tools menu. Mirrors crossmux's apps/ plugin model:
// each entry carries its i18n title/subtitle ids plus a factory for the Activity.
// Adding a new tool is just appending to getToolApps() below.
struct ToolApp {
  StrId titleId;
  StrId subtitleId;
  std::function<std::unique_ptr<Activity>(GfxRenderer& renderer, MappedInputManager& mappedInput)> factory;
};

// Registry of installed tool apps. Order here is the order shown in the menu.
std::vector<ToolApp> getToolApps();
